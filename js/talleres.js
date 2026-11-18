const dlg = document.getElementById('dlgTaller');
const form = document.getElementById('formTaller');
const err = document.getElementById('errorTaller');

document.addEventListener('click', e => {
    const b = e.target.closest('[data-taller]');
    if (!b) return;

    const t = window.TEATRO.talleres.find(x => String(x.id) === b.dataset.taller);
    if (!t) return;
    document.getElementById('tituloTaller').textContent = t.titulo;
    err.textContent = '';
    err.style.color = '';
    form.reset();
    dlg.showModal();
    document.getElementById('nombre').focus();
});

form.addEventListener('submit', e => {
    e.preventDefault();

    if (!form.checkValidity()) {
        const campo = [...form.elements].find(c => c.willValidate && !c.checkValidity());
        err.textContent = campo.name === 'correo'
            ? 'Usa tu correo institucional @ucb.edu.bo.'
            : campo.name === 'nombre'
                ? 'Escribe tu nombre completo (mínimo 3 caracteres).'
                : 'Selecciona tu nivel de experiencia.';
        campo.focus();
        return;
    }

    let lista;
    try {
        lista = JSON.parse(localStorage.getItem('inscripciones') || '[]');
        if (!Array.isArray(lista)) throw new TypeError('El registro de inscripciones no es una lista.');
    } catch (error) {
        console.error('No se pudieron leer las inscripciones guardadas.', error);
        err.textContent = 'No se pudo completar la inscripción en este navegador.';
        return;
    }

    lista.push({
        taller: document.getElementById('tituloTaller').textContent,
        ...Object.fromEntries(new FormData(form)),
        fecha: new Date().toISOString()
    });

    try {
        localStorage.setItem('inscripciones', JSON.stringify(lista));
    } catch (error) {
        console.error('No se pudo guardar la inscripción.', error);
        err.textContent = 'No se pudo guardar la inscripción. Revisa el almacenamiento disponible e inténtalo otra vez.';
        return;
    }
    err.style.color = '#D4AF37';
    err.textContent = 'Inscripción enviada. Te escribiremos al correo.';
    setTimeout(() => dlg.close(), 1400);
});