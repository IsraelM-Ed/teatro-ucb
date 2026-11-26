import './navigation.js';
import './footer.js';
import { cargarElenco, supabase } from './supabase.js';
import {
    avatarElenco,
    CATEGORIAS_ELENCO,
    escaparHtml,
    miembrosDesdeBaseDeDatos,
    miembrosLocales
} from './elenco-datos.js';

const pestanas = document.getElementById('pestanasElenco');
const panel = document.getElementById('panelElenco');
const lista = document.getElementById('listaElenco');
const descripcion = document.getElementById('descripcionCategoria');
let miembros = [];
let categoriaActiva = CATEGORIAS_ELENCO[0].id;

function pintarPestanas() {
    pestanas.innerHTML = CATEGORIAS_ELENCO.map(categoria => {
        const total = miembros.filter(miembro => miembro.categoria === categoria.id).length;
        const activa = categoria.id === categoriaActiva;
        return `
            <button class="elenco-pestana" type="button" role="tab" id="pestana-${categoria.id}"
                    data-categoria="${categoria.id}" aria-controls="panelElenco"
                    aria-selected="${activa}" tabindex="${activa ? '0' : '-1'}">
                ${escaparHtml(categoria.nombre)}
                <span class="elenco-pestana-total">${total}</span>
            </button>
        `;
    }).join('');
}

function pintarMiembros() {
    const categoria = CATEGORIAS_ELENCO.find(item => item.id === categoriaActiva);
    const integrantes = miembros
        .filter(miembro => miembro.categoria === categoriaActiva)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    panel.setAttribute('aria-labelledby', `pestana-${categoriaActiva}`);
    descripcion.textContent = categoria.descripcion;

    if (!integrantes.length) {
        lista.innerHTML = '<p class="elenco-estado" role="status">Pronto presentaremos a los integrantes de este paralelo.</p>';
        return;
    }

    lista.innerHTML = integrantes.map(miembro => `
        <article class="elenco-card">
            ${avatarElenco(miembro, 'avatar-elenco-grande')}
            <h2>${escaparHtml(miembro.nombre)}</h2>
            <p class="elenco-categoria">${escaparHtml(categoria.nombre)}</p>
            ${miembro.obras.length ? `
                <ul class="elenco-obras" aria-label="Obras de ${escaparHtml(miembro.nombre)}">
                    ${miembro.obras.map(obra => `
                        <li>
                            <span>${escaparHtml(obra.titulo)}</span>
                            <strong>${escaparHtml(obra.personaje)}</strong>
                        </li>
                    `).join('')}
                </ul>
            ` : '<p class="elenco-sin-obras">Preparando su primera obra.</p>'}
        </article>
    `).join('');
}

function seleccionarCategoria(id, enfocar = false) {
    if (!CATEGORIAS_ELENCO.some(categoria => categoria.id === id)) return;
    categoriaActiva = id;
    pintarPestanas();
    pintarMiembros();
    window.history.replaceState(null, '', `#${id}`);
    if (enfocar) document.getElementById(`pestana-${id}`)?.focus();
}

pestanas.addEventListener('click', event => {
    const pestana = event.target.closest('[data-categoria]');
    if (pestana) seleccionarCategoria(pestana.dataset.categoria);
});

pestanas.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const indice = CATEGORIAS_ELENCO.findIndex(categoria => categoria.id === categoriaActiva);
    const incremento = event.key === 'ArrowRight' ? 1 : -1;
    const siguiente = CATEGORIAS_ELENCO[(indice + incremento + CATEGORIAS_ELENCO.length) % CATEGORIAS_ELENCO.length];
    seleccionarCategoria(siguiente.id, true);
});

function mostrarAvisoElenco(error) {
    console.error('No se pudo cargar el elenco de Supabase; se mostrará la información local.', error);
    const aviso = document.createElement('p');
    aviso.className = 'aviso-catalogo';
    aviso.setAttribute('role', 'status');
    aviso.textContent = 'No se pudo sincronizar el elenco con la base de datos. Se muestra la información local.';
    pestanas.before(aviso);
}

async function inicializarElenco() {
    miembros = miembrosLocales();
    if (supabase) {
        try {
            miembros = miembrosDesdeBaseDeDatos(await cargarElenco());
        } catch (error) {
            mostrarAvisoElenco(error);
        }
    }

    const solicitada = window.location.hash.slice(1);
    if (CATEGORIAS_ELENCO.some(categoria => categoria.id === solicitada)) categoriaActiva = solicitada;
    pintarPestanas();
    pintarMiembros();
}

inicializarElenco();
