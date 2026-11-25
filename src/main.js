const reservationSection = document.getElementById('reserva');
const status = document.getElementById('reservaFrameworkStatus');
let loadingFrameworks = null;

async function cargarFrameworksReserva() {
    if (loadingFrameworks) return loadingFrameworks;
    loadingFrameworks = Promise.all([
        import('vue'),
        import('./FunctionSelector.vue'),
        import('./SeatMap.jsx'),
        import('./ReservationSummary.js')
    ]).then(([vue, functionSelector]) => {
        vue.createApp(functionSelector.default).mount('#selectorFuncion');
        status.hidden = true;
    }).catch(error => {
        console.error('No se pudieron cargar los controles de reserva.', error);
        status.textContent = 'No se pudieron cargar los controles de reserva. Recarga la página para volver a intentarlo.';
        status.classList.add('reserva-framework-error');
        loadingFrameworks = null;
    });
    status.textContent = 'Cargando controles de reserva...';
    return loadingFrameworks;
}

if (reservationSection && status) {
    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) {
                observer.disconnect();
                cargarFrameworksReserva();
            }
        }, { rootMargin: '120px 0px' });
        observer.observe(reservationSection);
    } else {
        cargarFrameworksReserva();
    }

    window.addEventListener('hashchange', () => {
        if (window.location.hash === '#reserva') cargarFrameworksReserva();
    });
    if (window.location.hash === '#reserva') cargarFrameworksReserva();
}
