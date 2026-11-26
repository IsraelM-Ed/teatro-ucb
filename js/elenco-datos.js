import datosElenco from '../data/elenco.json';
import datosTeatro from '../data/obras.json';

// Paralelos del taller, en el orden en que se muestran.
export const CATEGORIAS_ELENCO = [
    {
        id: 'oficial',
        nombre: 'Elenco oficial',
        descripcion: 'Actores y actrices con trayectoria en el taller que protagonizan la temporada.'
    },
    {
        id: 'juveniles',
        nombre: 'Juveniles',
        descripcion: 'Integrantes en formación avanzada que ya suben a escena en las producciones.'
    },
    {
        id: 'aspirantes',
        nombre: 'Aspirantes',
        descripcion: 'Quienes recién empiezan su camino en el teatro y preparan su primera función.'
    }
];

export function nombreCategoria(id) {
    return CATEGORIAS_ELENCO.find(categoria => categoria.id === id)?.nombre ?? 'Elenco';
}

export function escaparHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

export function iniciales(nombre) {
    return String(nombre ?? '')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(parte => parte.charAt(0).toLocaleUpperCase('es-BO'))
        .join('');
}

// Foto de perfil o, si no hay foto, las iniciales del nombre.
export function avatarElenco(miembro, clase = '') {
    const contenido = miembro.foto
        ? `<img src="${escaparHtml(miembro.foto)}" alt="" loading="lazy">`
        : `<span aria-hidden="true">${escaparHtml(iniciales(miembro.nombre))}</span>`;
    return `<span class="avatar-elenco${clase ? ` ${clase}` : ''}">${contenido}</span>`;
}

// ---------- Datos locales (cuando Supabase no está configurado) ----------
export function miembrosLocales() {
    const titulos = new Map(datosTeatro.obras.map(obra => [obra.id, obra.titulo]));
    return datosElenco.miembros.map(miembro => ({
        id: miembro.id,
        nombre: miembro.nombre,
        categoria: miembro.categoria,
        foto: miembro.foto,
        obras: miembro.obras
            .filter(participacion => titulos.has(participacion.obraId))
            .map(participacion => ({
                id: participacion.obraId,
                titulo: titulos.get(participacion.obraId),
                personaje: participacion.personaje
            }))
    }));
}

export function elencoDeObraLocal(obraId) {
    return miembrosLocales().flatMap(miembro => miembro.obras
        .filter(participacion => participacion.id === obraId)
        .map(participacion => ({
            id: miembro.id,
            nombre: miembro.nombre,
            categoria: miembro.categoria,
            foto: miembro.foto,
            personaje: participacion.personaje
        })));
}

// ---------- Datos de Supabase ----------
export function miembrosDesdeBaseDeDatos(rows) {
    return rows.map(row => ({
        id: row.id,
        nombre: row.nombre,
        categoria: row.categoria,
        foto: row.foto_url,
        obras: (row.elenco_obras ?? [])
            .filter(participacion => participacion.obras)
            .map(participacion => ({
                id: participacion.obras.id,
                titulo: participacion.obras.titulo,
                personaje: participacion.personaje
            }))
    }));
}

export function elencoDeObraDesdeBaseDeDatos(participaciones) {
    return (participaciones ?? [])
        .filter(participacion => participacion.miembros_elenco)
        .sort((a, b) => a.orden - b.orden || a.miembros_elenco.nombre.localeCompare(b.miembros_elenco.nombre, 'es'))
        .map(participacion => ({
            id: participacion.miembros_elenco.id,
            nombre: participacion.miembros_elenco.nombre,
            categoria: participacion.miembros_elenco.categoria,
            foto: participacion.miembros_elenco.foto_url,
            personaje: participacion.personaje
        }));
}
