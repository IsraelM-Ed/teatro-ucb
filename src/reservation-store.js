import QRCode from 'qrcode';
import {
    actualizarBloqueoButacas,
    butacasOcupadas,
    confirmarPagoQrSimulado,
    enviarCorreoConfirmacion,
    misBloqueosButacas,
    supabase,
    usuarioActual
} from '../js/supabase.js';
import { mostrarToast } from '../js/toasts.js';

export const PRICE_PER_SEAT = 40;
export const RESERVATION_EVENT = 'reserva-actualizada';
export const RESERVATION_CHANGED_EVENT = 'reserva-cambiada';
export const RESERVATION_CONFIRMED_EVENT = RESERVATION_CHANGED_EVENT;
const ROWS = ['A', 'B', 'C', 'D', 'E', 'F'];
const COLUMNS = 10;
const AVAILABILITY_POLL_INTERVAL_MS = 5000;
const SIMULATED_PAYMENT_SECONDS = 5;
const LIVE_AVAILABILITY_ERROR = 'La actualización instantánea no está disponible; el mapa se actualizará cada 5 segundos.';

let currentFunction = null;
let selectedSeats = new Set();
let occupiedSeats = new Set();
let message = '';
let messageType = '';
let loading = false;
let loadError = false;
let confirming = false;
let holdUpdating = false;
let loginRequired = false;
let holdExpiresAt = null;
let holdSecondsRemaining = 0;
let paymentStatus = 'idle';
let paymentQr = '';
let paymentReference = '';
let paymentSecondsRemaining = 0;
let paymentTotal = 0;
let paidReservationIds = [];
let emailStatus = 'idle';
let emailError = '';
let functionRequest = 0;
let paymentOperation = 0;
let holdCountdownTimer = null;
let paymentTimer = null;
let availabilityChannel = null;
let availabilityPollingTimer = null;
let occupancyRevision = 0;
let lastNotifiedMessage = '';

export function getReservationState() {
    return {
        currentFunction,
        selectedSeats: [...selectedSeats].sort(),
        occupiedSeats: [...occupiedSeats],
        total: paymentStatus === 'idle' ? selectedSeats.size * PRICE_PER_SEAT : paymentTotal,
        message,
        messageType,
        loading,
        loadError,
        confirming,
        holdUpdating,
        holdSecondsRemaining,
        loginRequired,
        paymentStatus,
        paymentQr,
        paymentSecondsRemaining,
        emailStatus,
        emailError
    };
}

export function subscribeReservationState(listener) {
    const handleUpdate = event => listener(event.detail);
    document.addEventListener(RESERVATION_EVENT, handleUpdate);
    return () => document.removeEventListener(RESERVATION_EVENT, handleUpdate);
}

function publish() {
    if (message && message !== lastNotifiedMessage) {
        mostrarToast(message, messageType || 'info');
        lastNotifiedMessage = message;
    } else if (!message) {
        lastNotifiedMessage = '';
    }
    document.dispatchEvent(new CustomEvent(RESERVATION_EVENT, {
        detail: getReservationState()
    }));
}

function clearHoldCountdown() {
    if (holdCountdownTimer !== null) {
        window.clearInterval(holdCountdownTimer);
        holdCountdownTimer = null;
    }
}

function clearPaymentTimer() {
    if (paymentTimer !== null) {
        window.clearInterval(paymentTimer);
        paymentTimer = null;
    }
}

function clearPaymentState() {
    paymentStatus = 'idle';
    paymentQr = '';
    paymentReference = '';
    paymentSecondsRemaining = 0;
    paymentTotal = 0;
    paidReservationIds = [];
    emailStatus = 'idle';
    emailError = '';
    confirming = false;
    clearPaymentTimer();
}

function setHoldExpiry(expiresAt, request) {
    clearHoldCountdown();
    holdExpiresAt = expiresAt ? new Date(expiresAt).getTime() : null;
    if (!holdExpiresAt || Number.isNaN(holdExpiresAt)) {
        holdSecondsRemaining = 0;
        return;
    }

    const updateCountdown = () => {
        if (request !== functionRequest) {
            clearHoldCountdown();
            return;
        }
        holdSecondsRemaining = Math.max(0, Math.ceil((holdExpiresAt - Date.now()) / 1000));
        if (holdSecondsRemaining === 0) {
            clearHoldCountdown();
            holdExpiresAt = null;
            selectedSeats = new Set();
            holdUpdating = false;
            if (paymentStatus === 'processing') {
                paymentOperation++;
                clearPaymentState();
            }
            message = 'El bloqueo de tus butacas venció. Selecciónalas nuevamente para continuar.';
            messageType = 'error';
            publish();
            if (currentFunction) void actualizarDisponibilidad(currentFunction.id, functionRequest);
            return;
        }
        publish();
    };

    updateCountdown();
    if (holdExpiresAt && holdSecondsRemaining > 0) {
        holdCountdownTimer = window.setInterval(updateCountdown, 1000);
    }
}

function resetPaymentForFunctionChange() {
    paymentOperation++;
    clearPaymentState();
}

export async function selectFunction(selectedFunction) {
    if (confirming || emailStatus === 'sending') return;
    if (currentFunction?.id === selectedFunction?.id) {
        if (selectedFunction && !availabilityChannel && supabase) {
            subscribeToAvailability(selectedFunction.id, functionRequest);
            void actualizarDisponibilidad(selectedFunction.id, functionRequest);
        }
        return;
    }

    const previousFunction = currentFunction;
    const hadHeldSeats = selectedSeats.size > 0;
    const request = ++functionRequest;
    resetPaymentForFunctionChange();
    clearHoldCountdown();
    if (availabilityPollingTimer !== null) {
        window.clearInterval(availabilityPollingTimer);
        availabilityPollingTimer = null;
    }
    if (availabilityChannel) {
        supabase?.removeChannel(availabilityChannel);
        availabilityChannel = null;
    }
    if (previousFunction && hadHeldSeats) {
        void actualizarBloqueoButacas(previousFunction.id, []).catch(error => {
            console.error('No se pudieron liberar las butacas al cambiar de función.', error);
        });
    }
    occupancyRevision = 0;
    currentFunction = selectedFunction;
    selectedSeats = new Set();
    occupiedSeats = new Set();
    message = '';
    messageType = '';
    loading = Boolean(selectedFunction);
    loadError = false;
    holdUpdating = false;
    loginRequired = false;
    holdExpiresAt = null;
    holdSecondsRemaining = 0;
    publish();

    if (!selectedFunction) return;

    const revisionAtRequest = occupancyRevision;
    try {
        const [seats, holds] = await Promise.all([
            butacasOcupadas(selectedFunction.id),
            misBloqueosButacas(selectedFunction.id)
        ]);
        if (request !== functionRequest) return;
        if (occupancyRevision === revisionAtRequest) occupiedSeats = new Set(seats);
        selectedSeats = new Set(holds.map(hold => hold.butaca));
        const expiresAt = holds
            .map(hold => new Date(hold.expira_en).getTime())
            .filter(value => !Number.isNaN(value))
            .sort((a, b) => a - b)[0];
        setHoldExpiry(expiresAt, request);
    } catch (error) {
        if (request !== functionRequest) return;
        loadError = true;
        message = `No se pudieron cargar las butacas ocupadas: ${errorMessage(error)}`;
        messageType = 'error';
    } finally {
        if (request === functionRequest) {
            loading = false;
            publish();
        }
    }

    if (request === functionRequest && supabase) {
        subscribeToAvailability(selectedFunction.id, request);
        startAvailabilityPolling(selectedFunction.id, request);
    }
}

function subscribeToAvailability(functionId, request) {
    const channel = supabase
        .channel(`disponibilidad-${functionId}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'disponibilidad_butacas',
            filter: `funcion_id=eq.${functionId}`
        }, payload => {
            if (request !== functionRequest) return;
            occupancyRevision++;
            if (payload.eventType === 'INSERT') {
                const seat = payload.new.butaca;
                if (!selectedSeats.has(seat)) occupiedSeats.add(seat);
            }
            if (payload.eventType === 'DELETE') occupiedSeats.delete(payload.old.butaca);
            publish();
        });
    availabilityChannel = channel;
    channel.subscribe((status, error) => {
        if (request !== functionRequest || availabilityChannel !== channel) return;
        if (status === 'SUBSCRIBED') {
            if (message === LIVE_AVAILABILITY_ERROR) {
                message = '';
                messageType = '';
            }
            void actualizarDisponibilidad(functionId, request);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.error(`No se pudo suscribir a la disponibilidad en vivo de ${functionId}.`, { status, error });
            availabilityChannel = null;
            void supabase.removeChannel(channel);
            message = LIVE_AVAILABILITY_ERROR;
            messageType = 'error';
            publish();
        }
    });
}

function startAvailabilityPolling(functionId, request) {
    if (availabilityPollingTimer !== null) return;

    const timer = window.setInterval(() => {
        if (availabilityPollingTimer !== timer) return;
        if (request !== functionRequest) {
            window.clearInterval(timer);
            availabilityPollingTimer = null;
            return;
        }
        void actualizarDisponibilidad(functionId, request);
    }, AVAILABILITY_POLL_INTERVAL_MS);
    availabilityPollingTimer = timer;
}

async function actualizarDisponibilidad(functionId, request) {
    const revisionAtRequest = occupancyRevision;
    try {
        const seats = await butacasOcupadas(functionId);
        if (request !== functionRequest || revisionAtRequest !== occupancyRevision) return;
        occupiedSeats = new Set(seats);
        if (loadError) {
            loadError = false;
            message = '';
            messageType = '';
        }
        publish();
    } catch (error) {
        if (request !== functionRequest) return;
        console.error('No se pudo reconciliar el mapa de butacas con Supabase.', error);
        message = 'No se pudo actualizar la disponibilidad en tiempo real.';
        messageType = 'error';
        publish();
    }
}

export async function actualizarMapaDisponibilidad() {
    if (!currentFunction) return;
    await actualizarDisponibilidad(currentFunction.id, functionRequest);
}

export async function toggleSeat(seatCode) {
    if (!currentFunction || loading || loadError || confirming || holdUpdating || paymentStatus !== 'idle') return;
    if (occupiedSeats.has(seatCode) && !selectedSeats.has(seatCode)) return;

    const request = functionRequest;
    let user;
    try {
        user = await usuarioActual();
    } catch (error) {
        message = `No se pudo verificar tu sesión: ${errorMessage(error)}`;
        messageType = 'error';
        publish();
        return;
    }
    if (request !== functionRequest || !currentFunction || loading || loadError) return;
    if (!user) {
        loginRequired = true;
        message = 'Inicia sesión para bloquear tus butacas durante 5 minutos.';
        messageType = 'info';
        publish();
        return;
    }

    const functionId = currentFunction.id;
    const previousSeats = new Set(selectedSeats);
    const nextSeats = new Set(previousSeats);
    if (nextSeats.has(seatCode)) nextSeats.delete(seatCode);
    else nextSeats.add(seatCode);

    holdUpdating = true;
    selectedSeats = nextSeats;
    message = '';
    messageType = '';
    publish();
    try {
        const expiresAt = await actualizarBloqueoButacas(functionId, [...nextSeats].sort());
        if (request !== functionRequest) return;
        holdUpdating = false;
        setHoldExpiry(expiresAt, request);
        if (nextSeats.size === 0) holdSecondsRemaining = 0;
        loginRequired = false;
    } catch (error) {
        if (request !== functionRequest) return;
        holdUpdating = false;
        message = `No se pudo bloquear la butaca: ${errorMessage(error)}`;
        messageType = 'error';
        try {
            const [seats, holds] = await Promise.all([
                butacasOcupadas(functionId),
                misBloqueosButacas(functionId)
            ]);
            occupiedSeats = new Set(seats);
            selectedSeats = new Set(holds.map(hold => hold.butaca));
            const expiresAt = holds
                .map(hold => new Date(hold.expira_en).getTime())
                .filter(value => !Number.isNaN(value))
                .sort((a, b) => a - b)[0];
            setHoldExpiry(expiresAt, request);
        } catch (refreshError) {
            selectedSeats = previousSeats;
            console.error('No se pudo actualizar el mapa después de fallar el bloqueo.', refreshError);
            loadError = true;
        }
    } finally {
        if (request === functionRequest) publish();
    }
}

export async function confirmReservation() {
    if (
        !currentFunction
        || selectedSeats.size === 0
        || loading
        || loadError
        || confirming
        || holdUpdating
        || paymentStatus !== 'idle'
    ) return;

    const request = functionRequest;
    confirming = true;
    message = '';
    messageType = '';
    publish();
    let user;
    try {
        user = await usuarioActual();
    } catch (error) {
        confirming = false;
        message = `No se pudo verificar tu sesión: ${errorMessage(error)}`;
        messageType = 'error';
        publish();
        return;
    }
    if (request !== functionRequest) return;
    if (!user) {
        confirming = false;
        loginRequired = true;
        message = 'Inicia sesión para continuar con el pago.';
        messageType = 'info';
        publish();
        return;
    }
    if (!holdExpiresAt || holdExpiresAt <= Date.now()) {
        clearHoldCountdown();
        holdExpiresAt = null;
        holdSecondsRemaining = 0;
        selectedSeats = new Set();
        confirming = false;
        message = 'El bloqueo de tus butacas venció. Selecciónalas nuevamente para continuar.';
        messageType = 'error';
        publish();
        if (currentFunction) void actualizarDisponibilidad(currentFunction.id, functionRequest);
        return;
    }

    const operation = ++paymentOperation;
    const seats = [...selectedSeats].sort();
    paymentTotal = seats.length * PRICE_PER_SEAT;
    paymentReference = generarReferencia();
    paymentStatus = 'processing';
    paymentSecondsRemaining = SIMULATED_PAYMENT_SECONDS;
    emailStatus = 'idle';
    emailError = '';
    message = 'QR de demostración: no se realizará ningún cobro real.';
    messageType = 'info';
    publish();

    try {
        paymentQr = await QRCode.toDataURL([
            'TEATRO-UCB',
            'PAGO-SIMULADO',
            `REF=${paymentReference}`,
            `MONTO_BOB=${paymentTotal.toFixed(2)}`
        ].join('|'), {
            errorCorrectionLevel: 'M',
            margin: 2,
            width: 240,
            color: { dark: '#171112', light: '#ffffff' }
        });
        if (request !== functionRequest || operation !== paymentOperation) return;
        confirming = false;
        paymentTimer = window.setInterval(() => {
            if (request !== functionRequest || operation !== paymentOperation) {
                clearPaymentTimer();
                return;
            }
            paymentSecondsRemaining = Math.max(0, paymentSecondsRemaining - 1);
            publish();
            if (paymentSecondsRemaining === 0) {
                clearPaymentTimer();
                void finalizarPagoSimulado(request, operation, seats);
            }
        }, 1000);
    } catch (error) {
        if (request !== functionRequest || operation !== paymentOperation) return;
        clearPaymentState();
        message = `No se pudo generar el QR de demostración: ${errorMessage(error)}`;
        messageType = 'error';
    } finally {
        if (request === functionRequest && operation === paymentOperation) publish();
    }
}

async function finalizarPagoSimulado(request, operation, seats) {
    if (request !== functionRequest || operation !== paymentOperation || !currentFunction) return;
    confirming = true;
    publish();
    try {
        const reservations = await confirmarPagoQrSimulado(
            currentFunction.id,
            seats,
            paymentReference
        );
        if (request !== functionRequest || operation !== paymentOperation) return;
        paidReservationIds = reservations.map(reservation => reservation.reserva_id);
        seats.forEach(seat => occupiedSeats.add(seat));
        selectedSeats = new Set();
        clearHoldCountdown();
        holdExpiresAt = null;
        holdSecondsRemaining = 0;
        paymentStatus = 'confirmed';
        paymentSecondsRemaining = 0;
        confirming = false;
        emailStatus = 'sending';
        message = 'Pago confirmado. No se realizó un cobro real.';
        messageType = 'success';
        document.dispatchEvent(new CustomEvent(RESERVATION_CONFIRMED_EVENT));
        publish();
        await enviarCorreoDeConfirmacion(operation);
    } catch (error) {
        if (request !== functionRequest || operation !== paymentOperation) return;
        clearPaymentState();
        message = `No se pudo confirmar el pago simulado: ${errorMessage(error)}`;
        messageType = 'error';
        try {
            occupiedSeats = new Set(await butacasOcupadas(currentFunction.id));
            occupiedSeats.forEach(seat => selectedSeats.delete(seat));
        } catch (refreshError) {
            console.error('No se pudo actualizar la disponibilidad tras fallar el pago.', refreshError);
            loadError = true;
        }
    } finally {
        if (request === functionRequest && operation === paymentOperation) {
            confirming = false;
            publish();
        }
    }
}

async function enviarCorreoDeConfirmacion(operation) {
    try {
        await enviarCorreoConfirmacion(paidReservationIds);
        if (operation !== paymentOperation) return;
        emailStatus = 'sent';
        emailError = '';
    } catch (error) {
        if (operation !== paymentOperation) return;
        emailStatus = 'error';
        emailError = errorMessage(error);
        message = `Pago confirmado, pero no se pudo enviar el correo: ${emailError}`;
        messageType = 'error';
    } finally {
        if (operation === paymentOperation) publish();
    }
}

export async function reenviarCorreoConfirmacion() {
    if (paymentStatus !== 'confirmed' || paidReservationIds.length === 0 || emailStatus === 'sending') return;
    emailStatus = 'sending';
    emailError = '';
    message = '';
    messageType = '';
    publish();
    await enviarCorreoDeConfirmacion(paymentOperation);
}

export function cancelarPagoSimulado() {
    if (paymentStatus !== 'processing' || confirming) return;
    paymentOperation++;
    clearPaymentState();
    message = 'Pago cancelado. Tus butacas siguen bloqueadas hasta que venza el tiempo.';
    messageType = 'info';
    publish();
}

export function cerrarPagoConfirmado() {
    if (paymentStatus !== 'confirmed' || emailStatus === 'sending') return;
    paymentOperation++;
    clearPaymentState();
    message = '';
    messageType = '';
    publish();
}

function generarReferencia() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function errorMessage(error) {
    if (error instanceof Error) return error.message;
    if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
        return error.message;
    }
    return 'Error desconocido.';
}

export function getSeatRows() {
    return ROWS.map(row => ({
        label: row,
        seats: Array.from({ length: COLUMNS }, (_, index) => `${row}${index + 1}`)
    }));
}

window.addEventListener('pagehide', () => {
    clearHoldCountdown();
    clearPaymentTimer();
    if (availabilityPollingTimer !== null) {
        window.clearInterval(availabilityPollingTimer);
        availabilityPollingTimer = null;
    }
    if (availabilityChannel && supabase) {
        supabase.removeChannel(availabilityChannel);
        availabilityChannel = null;
    }
}, { once: true });
