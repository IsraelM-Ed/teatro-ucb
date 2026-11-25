import { inscribirEnTaller, supabase } from './supabase.js';

const dlg = document.getElementById('dlgTaller');
const form = document.getElementById('formTaller');
const err = document.getElementById('errorTaller');

let tallerSeleccionado = null;

document.addEventListener('click', e => {
    const b = e.target.closest('[data-taller]');
    if (!b) return;

    const t = window.TEATRO.talleres.find(x => String(x.id) === b.dataset.taller);
    if (!t) return;
    tallerSeleccionado = t;
    document.getElementById('tituloTaller').textContent = t.titulo;
    err.textContent = '';
    err.style.color = '';
    form.reset();
    dlg.showModal();
    document.getElementById('nombre').focus();
});

form.addEventListener('submit', async e => {
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

    const formData = Object.fromEntries(new FormData(form));
    try {
        if (!tallerSeleccionado) throw new Error('Selecciona un taller e inténtalo nuevamente.');
        if (supabase) {
            await inscribirEnTaller({
                taller_id: tallerSeleccionado.id,
                nombre: formData.nombre.trim(),
                email: formData.correo.trim(),
                experiencia: formData.exp
            });
        } else {
            const lista = JSON.parse(localStorage.getItem('inscripciones') || '[]');
            if (!Array.isArray(lista)) throw new TypeError('El registro de inscripciones guardadas no es una lista.');
            lista.push({
                taller: tallerSeleccionado.titulo,
                nombre: formData.nombre.trim(),
                correo: formData.correo.trim(),
                exp: formData.exp,
                fecha: new Date().toISOString()
            });
            localStorage.setItem('inscripciones', JSON.stringify(lista));
        }
    } catch (error) {
        console.error('No se pudo guardar la inscripción al taller.', error);
        err.textContent = error instanceof Error ? error.message : 'No se pudo guardar la inscripción. Inténtalo otra vez.';
        return;
    }
    err.style.color = '#D4AF37';
    err.textContent = 'Inscripción enviada. Te escribiremos al correo.';
    setTimeout(() => dlg.close(), 1400);
});