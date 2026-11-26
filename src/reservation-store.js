import {
    butacasOcupadas,
    confirmarReserva as guardarReserva,
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
const LIVE_AVAILABILITY_ERROR = 'La actualización instantánea no está disponible; el mapa se actualizará cada 5 segundos.';

let currentFunction = null;
let selectedSeats = new Set();
let occupiedSeats = new Set();
let message = '';
let messageType = '';
let loading = false;
let loadError = false;
let confirming = false;
let functionRequest = 0;
let availabilityChannel = null;
let availabilityPollingTimer = null;
let occupancyRevision = 0;
let lastNotifiedMessage = '';

export function getReservationState() {
    return {
        currentFunction,
        selectedSeats: [...selectedSeats].sort(),
        occupiedSeats: [...occupiedSeats],
        total: selectedSeats.size * PRICE_PER_SEAT,
        message,
        messageType,
        loading,
        loadError,
        confirming
    };
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

export async function selectFunction(selectedFunction) {
    if (currentFunction?.id === selectedFunction?.id) {
        if (selectedFunction && !availabilityChannel && supabase) {
            subscribeToAvailability(selectedFunction.id, functionRequest);
            void actualizarDisponibilidad(selectedFunction.id, functionRequest);
        }
        return;
    }

    const request = ++functionRequest;
    if (availabilityPollingTimer !== null) {
        window.clearInterval(availabilityPollingTimer);
        availabilityPollingTimer = null;
    }
    if (availabilityChannel) {
        supabase?.removeChannel(availabilityChannel);
        availabilityChannel = null;
    }
    occupancyRevision = 0;
    currentFunction = selectedFunction;
    selectedSeats = new Set();
    occupiedSeats = new Set();
    message = '';
    messageType = '';
    loading = Boolean(selectedFunction);
    loadError = false;
    publish();

    if (!selectedFunction) return;

    const revisionAtRequest = occupancyRevision;
    try {
        const seats = await butacasOcupadas(selectedFunction.id);
        if (request !== functionRequest) return;
        if (occupancyRevision === revisionAtRequest) occupiedSeats = new Set(seats);
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

    if (request === functionRequest && supabase) subscribeToAvailability(selectedFunction.id, request);
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
                occupiedSeats.add(seat);
                if (selectedSeats.delete(seat)) {
                    message = `La butaca ${seat} acaba de ser reservada por otra persona. Se quitó de tu selección.`;
                    messageType = 'error';
                }
            }
            if (payload.eventType === 'DELETE') occupiedSeats.delete(payload.old.butaca);
            publish();
        });
    availabilityChannel = channel;
    channel.subscribe((status, error) => {
        if (request !== functionRequest || availabilityChannel !== channel) return;
        if (status === 'SUBSCRIBED') {
            if (availabilityPollingTimer !== null) {
                window.clearInterval(availabilityPollingTimer);
                availabilityPollingTimer = null;
            }
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
            startAvailabilityPolling(functionId, request);
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
        console.error('No se pudo reconciliar el mapa de butacas con Supabase Realtime.', error);
        message = 'No se pudo actualizar la disponibilidad en tiempo real.';
        messageType = 'error';
        publish();
    }
}

export async function actualizarMapaDisponibilidad() {
    if (!currentFunction) return;
    await actualizarDisponibilidad(currentFunction.id, functionRequest);
}

export function toggleSeat(seatCode) {
    if (!currentFunction || loading || loadError || confirming) return;
    if (occupiedSeats.has(seatCode)) return;

    if (selectedSeats.has(seatCode)) {
        selectedSeats.delete(seatCode);
    } else {
        selectedSeats.add(seatCode);
    }

    message = '';
    messageType = '';
    publish();
}

export async function confirmReservation() {
    if (!currentFunction || selectedSeats.size === 0 || loading || loadError || confirming) return;

    const functionId = currentFunction.id;
    const seats = [...selectedSeats].sort();
    const total = seats.length * PRICE_PER_SEAT;
    confirming = true;
    message = '';
    messageType = '';
    publish();

    try {
        const user = await usuarioActual();
        if (!user) {
            window.location.assign(new URL('login.html', document.baseURI).href);
            return;
        }

        await guardarReserva(functionId, seats);
        document.dispatchEvent(new CustomEvent(RESERVATION_CONFIRMED_EVENT));

        if (currentFunction?.id === functionId) {
            seats.forEach(seat => occupiedSeats.add(seat));
            selectedSeats = new Set();
        }
        message = `Reserva confirmada para ${functionId}: ${seats.join(', ')}. Total Bs ${total}.`;
        messageType = 'success';
    } catch (error) {
        message = `No se pudo confirmar la reserva: ${errorMessage(error)}`;
        messageType = 'error';

        if (
            currentFunction?.id === functionId
            && error instanceof Error
            && error.message.includes('Alguna butaca ya fue reservada')
        ) {
            try {
                occupiedSeats = new Set(await butacasOcupadas(functionId));
                occupiedSeats.forEach(seat => selectedSeats.delete(seat));
                message = 'Alguna butaca ya fue reservada. Se actualizó el mapa; revisa tu selección.';
            } catch (refreshError) {
                console.error('No se pudo actualizar el mapa tras el conflicto de reserva.', refreshError);
                loadError = true;
                message += ' No se pudo actualizar el mapa de butacas.';
            }
        }
    } finally {
        confirming = false;
        publish();
    }
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
    if (availabilityPollingTimer !== null) {
        window.clearInterval(availabilityPollingTimer);
        availabilityPollingTimer = null;
    }
    if (availabilityChannel && supabase) {
        supabase.removeChannel(availabilityChannel);
        availabilityChannel = null;
    }
}, { once: true });
