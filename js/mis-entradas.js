import { misReservas, supabase } from './supabase.js';
import { RESERVATION_CONFIRMED_EVENT } from '../src/reservation-store.js';

const container = document.getElementById('listaReservas');
const dateTimeFormat = new Intl.DateTimeFormat('es-BO', {
    dateStyle: 'full',
    timeStyle: 'short'
});
let requestId = 0;

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
            .flatMap(obra => obra.funciones.map(funcion => ({ obra, funcion })));
        const funcionesVigentes = new Set(funciones.map(item => item.funcion.id));
        const entradasFuturas = reservas.filter(reserva => funcionesVigentes.has(reserva.funcion_id));
        if (entradasFuturas.length === 0) {
            mostrarEstado('No tienes entradas para funciones futuras.');
            return;
        }
        const fragmento = document.createDocumentFragment();

        for (const reserva of entradasFuturas) {
            const datosFuncion = funciones.find(item => item.funcion.id === reserva.funcion_id);
            const tarjeta = document.createElement('article');
            tarjeta.className = 'entrada-card';

            const encabezado = document.createElement('div');
            encabezado.className = 'entrada-encabezado';
            const titulo = document.createElement('h3');
            titulo.textContent = datosFuncion?.obra.titulo ?? 'Función de teatro';
            const estado = document.createElement('span');
            estado.className = 'entrada-estado';
            estado.textContent = 'Confirmada';
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

document.addEventListener('datos-listos', cargarReservas);
document.addEventListener(RESERVATION_CONFIRMED_EVENT, cargarReservas);
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
