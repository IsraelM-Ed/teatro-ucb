import QRCode from 'qrcode';
import { cancelarReserva, misReservas, supabase } from './supabase.js';
import {
    RESERVATION_CHANGED_EVENT,
    actualizarMapaDisponibilidad
} from '../src/reservation-store.js';

const container = document.getElementById('listaReservas');
const dateTimeFormat = new Intl.DateTimeFormat('es-BO', {
    dateStyle: 'full',
    timeStyle: 'short'
});
let requestId = 0;
let reservasActuales = new Map();
let funcionesActuales = new Map();

function mostrarEstado(texto, tipo = 'status') {
    const mensaje = document.createElement('p');
    mensaje.className = 'estado-entradas';
    mensaje.setAttribute('role', tipo);
    mensaje.textContent = texto;
    container.replaceChildren(mensaje);
}

async function cargarReservas() {
    const request = ++requestId;
    mostrarEstado('Cargando tus entradas...');

    try {
        const reservas = await misReservas();
        if (request !== requestId) return;
        if (reservas === null) {
            mostrarEstado('Inicia sesión para consultar tus reservas. ', 'status');
            const link = document.createElement('a');
            link.href = `${import.meta.env.BASE_URL}login.html`;
            link.textContent = 'Iniciar sesión';
            container.querySelector('.estado-entradas').append(link);
            return;
        }
        if (reservas.length === 0) {
            mostrarEstado('Aún no tienes entradas confirmadas. Elige una función en la cartelera para reservar.');
            return;
        }

        const funciones = (window.TEATRO?.obras ?? [])
            .flatMap(obra => obra.funciones.map(funcion => [funcion.id, { obra, funcion }]));
        funcionesActuales = new Map(funciones);
        const ahora = Date.now();
        const entradasFuturas = reservas.filter(reserva => {
            const datosFuncion = funcionesActuales.get(reserva.funcion_id);
            return datosFuncion
                && new Date(datosFuncion.funcion.salida ?? datosFuncion.funcion.fecha).getTime() > ahora;
        });
        if (entradasFuturas.length === 0) {
            mostrarEstado('No tienes entradas para funciones futuras.');
            return;
        }
        const fragmento = document.createDocumentFragment();
        reservasActuales = new Map(entradasFuturas.map(reserva => [String(reserva.id), reserva]));

        for (const reserva of entradasFuturas) {
            const datosFuncion = funcionesActuales.get(reserva.funcion_id);
            const tarjeta = document.createElement('article');
            tarjeta.className = 'entrada-card';

            const encabezado = document.createElement('div');
            encabezado.className = 'entrada-encabezado';
            const titulo = document.createElement('h3');
            titulo.textContent = datosFuncion?.obra.titulo ?? 'Función de teatro';
            const estado = document.createElement('span');
            estado.className = reserva.estado === 'cancelada'
                ? 'entrada-estado entrada-cancelada'
                : 'entrada-estado';
            estado.textContent = reserva.estado === 'cancelada' ? 'Cancelada' : 'Confirmada';
            encabezado.append(titulo, estado);

            const fecha = document.createElement('p');
            fecha.className = 'entrada-fecha';
            fecha.textContent = datosFuncion
                ? dateTimeFormat.format(new Date(datosFuncion.funcion.fecha))
                : 'Fecha no disponible';

            const butaca = document.createElement('p');
            butaca.className = 'entrada-butaca';
            butaca.innerHTML = '<span>Butaca</span>';
            const codigo = document.createElement('strong');
            codigo.textContent = reserva.butaca;
            butaca.append(codigo);

            const confirmacion = document.createElement('small');
            confirmacion.className = 'entrada-confirmacion';
            confirmacion.textContent = `Reservada el ${dateTimeFormat.format(new Date(reserva.created_at))}`;

            tarjeta.append(encabezado, fecha, butaca, confirmacion);
            if (reserva.estado === 'confirmada') {
                try {
                    const qr = document.createElement('img');
                    qr.className = 'entrada-qr';
                    qr.alt = `Código QR de la entrada para ${datosFuncion.obra.titulo}, butaca ${reserva.butaca}`;
                    qr.src = await QRCode.toDataURL(reserva.ticket_token, {
                        errorCorrectionLevel: 'H',
                        margin: 1,
                        width: 180,
                        color: { dark: '#171112', light: '#ffffff' }
                    });
                    tarjeta.append(qr);

                    const download = document.createElement('button');
                    download.className = 'btn entrada-descargar';
                    download.type = 'button';
                    download.dataset.descargarEntrada = String(reserva.id);
                    download.textContent = 'Descargar entrada';
                    tarjeta.append(download);
                } catch (error) {
                    console.error(`No se pudo generar el QR de la reserva ${reserva.id}.`, error);
                    const aviso = document.createElement('p');
                    aviso.className = 'entrada-error';
                    aviso.setAttribute('role', 'alert');
                    aviso.textContent = 'No se pudo generar el código QR de esta entrada.';
                    tarjeta.append(aviso);
                }

                const cancelar = document.createElement('button');
                cancelar.className = 'btn entrada-cancelar';
                cancelar.type = 'button';
                cancelar.dataset.cancelarReserva = String(reserva.id);
                cancelar.textContent = 'Cancelar reserva';
                tarjeta.append(cancelar);
            }
            fragmento.append(tarjeta);
        }

        if (request === requestId) container.replaceChildren(fragmento);
    } catch (error) {
        console.error('No se pudieron cargar las reservas del usuario.', error);
        mostrarEstado(
            error instanceof Error
                ? `No se pudieron cargar tus entradas: ${error.message}`
                : 'No se pudieron cargar tus entradas. Inténtalo nuevamente.',
            'alert'
        );
    }
}

container.addEventListener('click', async event => {
    const cancelButton = event.target.closest('[data-cancelar-reserva]');
    if (cancelButton) {
        const reserva = reservasActuales.get(cancelButton.dataset.cancelarReserva);
        if (!reserva || !window.confirm('¿Cancelar esta reserva? La butaca quedará disponible y el registro se conservará en el historial.')) return;
        cancelButton.disabled = true;
        try {
            await cancelarReserva(reserva.id);
            await actualizarMapaDisponibilidad();
            document.dispatchEvent(new CustomEvent(RESERVATION_CHANGED_EVENT));
        } catch (error) {
            console.error('No se pudo cancelar la reserva.', error);
            mostrarEstado(error instanceof Error ? error.message : 'No se pudo cancelar la reserva.', 'alert');
        } finally {
            cancelButton.disabled = false;
        }
        return;
    }

    const downloadButton = event.target.closest('[data-descargar-entrada]');
    if (!downloadButton) return;
    const reserva = reservasActuales.get(downloadButton.dataset.descargarEntrada);
    const datosFuncion = reserva && funcionesActuales.get(reserva.funcion_id);
    if (!reserva || !datosFuncion) return;
    downloadButton.disabled = true;
    try {
        await descargarEntrada(reserva, datosFuncion);
    } catch (error) {
        console.error(`No se pudo descargar la entrada ${reserva.id}.`, error);
        mostrarEstado('No se pudo descargar la entrada. Inténtalo nuevamente.', 'alert');
    } finally {
        downloadButton.disabled = false;
    }
});

async function descargarEntrada(reserva, datosFuncion) {
    const qr = await QRCode.toDataURL(reserva.ticket_token, {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 240,
        color: { dark: '#171112', light: '#ffffff' }
    });
    const image = new Image();
    image.src = qr;
    await image.decode();

    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 600;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('El navegador no pudo preparar la imagen de la entrada.');
    context.fillStyle = '#171112';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#d4af37';
    context.lineWidth = 4;
    context.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
    context.fillStyle = '#d4af37';
    context.font = 'bold 34px sans-serif';
    context.fillText('TEATRO UCB · ENTRADA DIGITAL', 60, 90);
    context.fillStyle = '#f1ece4';
    context.font = 'bold 42px sans-serif';
    context.fillText(datosFuncion.obra.titulo.slice(0, 34), 60, 180);
    context.font = '28px sans-serif';
    context.fillText(dateTimeFormat.format(new Date(datosFuncion.funcion.fecha)), 60, 250);
    context.font = 'bold 34px sans-serif';
    context.fillText(`Butaca ${reserva.butaca}`, 60, 330);
    context.font = '20px sans-serif';
    context.fillText(`Código ${reserva.ticket_token.slice(0, 8).toUpperCase()}`, 60, 390);
    context.fillStyle = '#ffffff';
    context.fillRect(700, 160, 240, 240);
    context.drawImage(image, 700, 160, 240, 240);
    context.font = '18px sans-serif';
    context.fillStyle = '#f1ece4';
    context.fillText('Presenta este QR en el ingreso', 670, 440);

    const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(result => result ? resolve(result) : reject(new Error('No se pudo crear el archivo de la entrada.')), 'image/png');
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `entrada-teatro-ucb-${reserva.ticket_token.slice(0, 8)}.png`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.addEventListener('datos-listos', cargarReservas);
document.addEventListener(RESERVATION_CHANGED_EVENT, cargarReservas);
document.querySelector('teatro-navigation').addEventListener('click', event => {
    if (event.target.closest('a[href*="#mis-entradas"]')) cargarReservas();
});
window.addEventListener('hashchange', () => {
    if (window.location.hash === '#mis-entradas') cargarReservas();
});

if (supabase) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
        window.setTimeout(cargarReservas, 0);
    });
    window.addEventListener('pagehide', () => subscription.unsubscribe(), { once: true });
} else {
    mostrarEstado('La consulta de entradas no está disponible porque falta configurar Supabase.', 'alert');
}

cargarReservas();
