import { cerrarSesion, supabase, usuarioActual, usuarioEsAdministrador } from './supabase.js';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';

const panel = document.getElementById('adminDashboard');
const sinAcceso = document.getElementById('adminSinAcceso');
const estado = document.getElementById('adminEstado');
const cerrarSesionButton = document.getElementById('adminCerrarSesion');
const obrasContainer = document.getElementById('adminObras');
const administradoresContainer = document.getElementById('listaAdministradores');
const buscarObrasInput = document.getElementById('buscarObras');
const obrasSinResultados = document.getElementById('adminObrasSinResultados');
const talleresContainer = document.getElementById('adminTalleres');
const buscarTalleresInput = document.getElementById('buscarTalleres');
const talleresSinResultados = document.getElementById('adminTalleresSinResultados');
const tallerForm = document.getElementById('formTallerAdmin');
const tallerImagenInput = document.getElementById('adminTallerImagen');
const tallerImagenPreview = document.getElementById('adminTallerImagenPreview');
const cancelarEdicionTaller = document.getElementById('cancelarEdicionTaller');
const imagenInput = document.getElementById('adminImagen');
const imagenPreview = document.getElementById('adminImagenPreview');
const metricasDashboard = document.getElementById('adminMetricas');
const proximasLista = document.getElementById('adminProximasLista');
const horarios = ['15:00', '16:30', '18:00', '19:30', '20:00'];
const horariosTaller = [
    'Lunes 15:30',
    'Lunes 18:30',
    'Martes 18:30',
    'Miércoles 18:30',
    'Jueves 18:30',
    'Viernes 18:30',
    'Sábado 10:00',
    'Sábado 15:00'
];
let verificacion = 0;
let imagenPreviewUrl = null;
let tallerImagenPreviewUrl = null;
let talleresAdministrados = [];
document.getElementById('adminFecha').min = ahoraLocal();

function mostrarEstado(texto, error = false) {
    estado.textContent = texto;
    estado.classList.toggle('admin-estado-error', error);
}

function crearElemento(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function fechaLocal(value) {
    return String(value ?? '').replace(' ', 'T').slice(0, 16);
}

function instanteLocal(value) {
    return new Date(String(value ?? '').replace(' ', 'T')).getTime();
}

function salidaFuncion(funcion, obra) {
    return funcion.salida ?? sumarMinutos(fechaLocal(funcion.inicio).replace('T', ' '), obra.duracion_minutos);
}

function funcionEnCartelera(funcion, obra, ahora) {
    return obra.activa && funcion.estado === 'programada' && instanteLocal(salidaFuncion(funcion, obra)) > ahora;
}

function ahoraLocal() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function horaOptions() {
    return `<option value="">Selecciona un horario</option>${horarios.map(hora => `<option value="${hora}">${hora}</option>`).join('')}`;
}

function fechaHora(date, time) {
    const parsed = new Date(`${date}T${time}:00`);
    if (Number.isNaN(parsed.getTime())) throw new Error('Selecciona una fecha y un horario válidos.');
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')} ${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}:00`;
}

function sumarMinutos(timestamp, minutos) {
    const date = new Date(timestamp.replace(' ', 'T'));
    date.setMinutes(date.getMinutes() + minutos);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:00`;
}

function esYouTube(value) {
    if (!value) return true;
    try {
        const url = new URL(value);
        const host = url.hostname.toLowerCase().replace(/^www\./, '');
        return ['youtube.com', 'm.youtube.com', 'youtu.be'].includes(host) && ['https:', 'http:'].includes(url.protocol);
    } catch {
        return false;
    }
}

async function verificarAcceso() {
    const request = ++verificacion;
    if (!supabase) {
        panel.hidden = true;
        sinAcceso.hidden = false;
        cerrarSesionButton.hidden = true;
        document.getElementById('adminMensajeAcceso').textContent = 'No se pudo conectar con Supabase. Configura la conexión e inténtalo otra vez.';
        return;
    }

    try {
        const esAdmin = await usuarioEsAdministrador();
        if (request !== verificacion) return;
        panel.hidden = !esAdmin;
        sinAcceso.hidden = esAdmin;
        cerrarSesionButton.hidden = !esAdmin;
        if (!esAdmin) {
            document.getElementById('adminMensajeAcceso').textContent = 'Inicia sesión con una cuenta que tenga permisos de administración.';
            mostrarEstado('');
            return;
        }
        await cargarAdministracion();
    } catch (error) {
        if (request !== verificacion) return;
        panel.hidden = true;
        sinAcceso.hidden = false;
        cerrarSesionButton.hidden = true;
        document.getElementById('adminMensajeAcceso').textContent = 'No se pudieron verificar los permisos. Vuelve a iniciar sesión o contacta al administrador del sistema.';
        manejarError(error, 'No se pudo verificar el acceso administrativo.');
    }
}

async function cargarAdministracion() {
    mostrarEstado('Cargando datos administrativos...');
    const [obrasResult, funcionesResult, adminsResult, reservasResult, salasResult, talleresResult, inscripcionesTalleresResult, user] = await Promise.all([
        supabase.from('obras')
            .select('id, titulo, director, duracion_minutos, sinopsis, video_url, activa')
            .order('id'),
        supabase.from('funciones')
            .select('id, obra_id, sala_id, inicio, salida, estado')
            .order('inicio'),
        supabase.from('administradores').select('email').order('email'),
        supabase.from('reservas').select('funcion_id, estado'),
        supabase.from('salas').select('id, capacidad, activa'),
        supabase.from('talleres')
            .select('id, titulo, horario, cupos, descripcion, img, activo, instructor, video_url')
            .order('activo', { ascending: false })
            .order('titulo'),
        supabase.from('inscripciones_talleres').select('id, taller_id, estado'),
        usuarioActual()
    ]);
    const failed = [obrasResult, funcionesResult, adminsResult, reservasResult, salasResult, talleresResult, inscripcionesTalleresResult].find(result => result.error);
    if (failed?.error) throw failed.error;
    pintarDashboardAdmin(
        obrasResult.data,
        funcionesResult.data,
        reservasResult.data,
        salasResult.data,
        talleresResult.data
    );
    pintarAdminObras(obrasResult.data, funcionesResult.data);
    pintarAdminTalleres(talleresResult.data, inscripcionesTalleresResult.data);
    const principal = user?.email?.toLowerCase() === 'israelmujia5@gmail.com';
    administradoresContainer.replaceChildren(...adminsResult.data.map(admin => {
        const item = crearElemento('li', 'admin-admin-item');
        item.append(crearElemento('span', '', admin.email));
        if (principal && admin.email.toLowerCase() !== 'israelmujia5@gmail.com') {
            const removeButton = crearElemento('button', 'admin-admin-quitar', 'Quitar permisos');
            removeButton.type = 'button';
            removeButton.dataset.quitarAdministrador = admin.email;
            item.append(removeButton);
        }
        return item;
    }));
    mostrarEstado('Los cambios quedan guardados en Supabase. Las funciones pasadas se conservan para las estadísticas.');
}

function pintarDashboardAdmin(obras, funciones, reservas, salas, talleres) {
    const ahora = Date.now();
    const obrasPorId = new Map(obras.map(obra => [obra.id, obra]));
    const salasPorId = new Map(salas.map(sala => [sala.id, sala]));
    const funcionesProximas = funciones
        .filter(funcion => {
            const obra = obrasPorId.get(funcion.obra_id);
            return obra && funcionEnCartelera(funcion, obra, ahora);
        })
        .sort((a, b) => instanteLocal(a.inicio) - instanteLocal(b.inicio));
    const funcionesProximasIds = new Set(funcionesProximas.map(funcion => funcion.id));
    const obrasProximasIds = new Set(funcionesProximas.map(funcion => funcion.obra_id));
    const reservasProximas = reservas.filter(reserva =>
        reserva.estado === 'confirmada' && funcionesProximasIds.has(reserva.funcion_id));
    const reservasPorFuncion = new Map();
    for (const reserva of reservasProximas) {
        reservasPorFuncion.set(reserva.funcion_id, (reservasPorFuncion.get(reserva.funcion_id) ?? 0) + 1);
    }
    const capacidadProxima = funcionesProximas.reduce((total, funcion) => {
        const sala = salasPorId.get(funcion.sala_id);
        return total + (sala?.activa ? sala.capacidad : 0);
    }, 0);
    const porcentajeOcupacion = capacidadProxima
        ? Math.round(reservasProximas.length / capacidadProxima * 100)
        : null;
    const metrics = [
        ['Obras en cartelera', obras.filter(obra => obra.activa && obrasProximasIds.has(obra.id)).length],
        ['Próximas funciones', funcionesProximas.length],
        ['Reservas próximas', reservasProximas.length],
        ['Ocupación próxima', porcentajeOcupacion === null ? '—' : `${porcentajeOcupacion}%`],
        ['Talleres activos', talleres.filter(taller => taller.activo).length]
    ];

    metricasDashboard.replaceChildren(...metrics.map(([label, value]) => {
        const card = crearElemento('article', 'admin-metrica');
        card.append(
            crearElemento('span', 'admin-metrica-label', label),
            crearElemento('strong', 'admin-metrica-valor', String(value))
        );
        return card;
    }));
    metricasDashboard.setAttribute('aria-busy', 'false');

    if (!funcionesProximas.length) {
        proximasLista.replaceChildren(crearElemento('li', 'admin-proxima-vacia', 'No hay funciones próximas programadas.'));
    } else {
        proximasLista.replaceChildren(...funcionesProximas.slice(0, 5).map(funcion => {
            const obra = obrasPorId.get(funcion.obra_id);
            const sala = salasPorId.get(funcion.sala_id);
            const reservasFuncion = reservasPorFuncion.get(funcion.id) ?? 0;
            const item = crearElemento('li', 'admin-proxima-funcion');
            const details = crearElemento('div', 'admin-proxima-detalles');
            details.append(
                crearElemento('strong', '', obra.titulo),
                crearElemento('span', '', new Intl.DateTimeFormat('es-BO', {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                }).format(new Date(String(funcion.inicio).replace(' ', 'T'))))
            );
            item.append(details, crearElemento(
                'span',
                'admin-proxima-ocupacion',
                `${reservasFuncion} / ${sala?.capacidad ?? '—'} butacas`
            ));
            return item;
        }));
    }
    proximasLista.setAttribute('aria-busy', 'false');
}

function pintarAdminObras(obras, funciones) {
    const fragment = document.createDocumentFragment();
    const funcionesPorObra = new Map();
    for (const funcion of funciones) {
        const presentaciones = funcionesPorObra.get(funcion.obra_id) ?? [];
        presentaciones.push(funcion);
        funcionesPorObra.set(funcion.obra_id, presentaciones);
    }

    const ahora = Date.now();
    const fechaProxima = obra => (funcionesPorObra.get(obra.id) ?? [])
        .filter(funcion => funcionEnCartelera(funcion, obra, ahora))
        .reduce((proxima, funcion) => Math.min(proxima, instanteLocal(funcion.inicio)), Infinity);
    const obrasOrdenadas = [...obras].sort((a, b) =>
        fechaProxima(a) - fechaProxima(b) || a.titulo.localeCompare(b.titulo, 'es'));

    for (const obra of obrasOrdenadas) {
        const presentaciones = funcionesPorObra.get(obra.id) ?? [];
        const card = crearElemento('details', 'admin-obra');
        card.dataset.busqueda = normalizarTexto(`${obra.titulo} ${obra.director ?? ''}`).toLocaleLowerCase('es-BO');
        const summary = crearElemento('summary', 'admin-obra-resumen');
        summary.append(
            crearElemento('span', 'admin-obra-titulo', obra.titulo),
            crearElemento('span', obra.activa ? 'admin-badge' : 'admin-badge admin-badge-inactivo', obra.activa ? 'En cartelera' : 'Retirada'),
            crearElemento('span', 'admin-obra-total', `${presentaciones.length} funciones`)
        );
        card.append(summary);

        const content = crearElemento('div', 'admin-obra-contenido');
        const editDetails = crearElemento('details', 'admin-editar-obra');
        editDetails.innerHTML = `
            <summary>Editar datos de la obra</summary>
            <form class="admin-form admin-form-obra" data-editar-obra="${obra.id}">
                <label>Nombre de la obra<input name="titulo" required maxlength="160" value="${escapar(obra.titulo)}"></label>
                <label>Director<input name="director" required maxlength="160" value="${escapar(obra.director ?? '')}"></label>
                <label>Descripción<textarea name="sinopsis" rows="2" maxlength="1200">${escapar(obra.sinopsis ?? '')}</textarea></label>
                <label>Enlace del tráiler de YouTube<input name="video_url" type="url" pattern="https?://(www\\.)?(youtube\\.com|youtu\\.be)/.+" value="${escapar(obra.video_url ?? '')}"></label>
                <div class="admin-acciones"><button class="btn" type="submit">Guardar datos</button></div>
            </form>`;

        const removeWorkButton = crearElemento('button', 'btn btn-eliminar', 'Retirar obra');
        removeWorkButton.type = 'button';
        removeWorkButton.dataset.eliminarObra = String(obra.id);
        const actions = crearElemento('div', 'admin-obra-acciones');
        actions.append(editDetails, removeWorkButton);
        content.append(actions);

        if (presentaciones.length) {
            const list = crearElemento('div', 'admin-funciones');
            list.append(crearElemento('h5', '', 'Funciones'));
            const presentacionesOrdenadas = [...presentaciones].sort((a, b) => {
                const categoriaA = funcionEnCartelera(a, obra, ahora) ? 0 : a.estado === 'cancelada' ? 2 : 1;
                const categoriaB = funcionEnCartelera(b, obra, ahora) ? 0 : b.estado === 'cancelada' ? 2 : 1;
                if (categoriaA !== categoriaB) return categoriaA - categoriaB;
                return categoriaA === 0
                    ? instanteLocal(a.inicio) - instanteLocal(b.inicio)
                    : instanteLocal(b.inicio) - instanteLocal(a.inicio);
            });
            for (const funcion of presentacionesOrdenadas) {
                const row = crearElemento('details', 'admin-funcion');
                const end = salidaFuncion(funcion, obra);
                const enCartelera = funcionEnCartelera(funcion, obra, ahora);
                const vencida = instanteLocal(end) <= ahora || funcion.estado === 'finalizada';
                const status = funcion.estado === 'cancelada'
                    ? crearElemento('span', 'admin-badge admin-badge-inactivo', 'Cancelada')
                    : vencida
                        ? crearElemento('span', 'admin-badge admin-badge-pasada', 'Función pasada')
                        : crearElemento('span', 'admin-badge', 'Programada');
                const rowSummary = crearElemento('summary', 'admin-funcion-resumen');
                rowSummary.append(
                    crearElemento('span', 'admin-funcion-fecha', new Intl.DateTimeFormat('es-BO', {
                        dateStyle: 'medium',
                        timeStyle: 'short'
                    }).format(new Date(String(funcion.inicio).replace(' ', 'T')))),
                    status,
                    crearElemento('span', 'admin-funcion-editar', 'Editar horario')
                );
                const editFunctionForm = crearElemento('form', 'admin-form admin-funcion-form');
                editFunctionForm.dataset.editarFuncion = funcion.id;
                editFunctionForm.append(
                    campoFechaHora('Ingreso', 'inicio', fechaLocal(funcion.inicio)),
                    campoFechaHora('Salida', 'salida', fechaLocal(end))
                );
                const saveFunctionButton = crearElemento('button', 'btn', 'Guardar horario');
                saveFunctionButton.type = 'submit';
                editFunctionForm.append(saveFunctionButton);
                row.append(rowSummary, editFunctionForm);
                if (enCartelera) {
                    const removeFunctionButton = crearElemento('button', 'btn btn-eliminar', 'Retirar función');
                    removeFunctionButton.type = 'button';
                    removeFunctionButton.dataset.retirarFuncion = String(funcion.id);
                    row.append(removeFunctionButton);
                }
                list.append(row);
            }
            content.append(list);
        } else {
            content.append(crearElemento('p', 'admin-ayuda', 'Esta obra todavía no tiene funciones.'));
        }

        const addFunctionDetails = crearElemento('details', 'admin-agregar-funcion');
        addFunctionDetails.innerHTML = '<summary>+ Agregar una función</summary>';
        const addFunction = document.createElement('form');
        addFunction.className = 'admin-form admin-nueva-funcion';
        addFunction.dataset.nuevaFuncion = String(obra.id);
        addFunction.innerHTML = `
            <div class="admin-horario">
                <label>Fecha<input name="fecha" type="date" min="${ahoraLocal()}" required></label>
                <label>Horario preestablecido<select name="hora" required>${horaOptions()}</select></label>
            </div>
            <button class="btn" type="submit">Guardar nueva función</button>`;
        addFunctionDetails.append(addFunction);
        content.append(addFunctionDetails);
        card.append(content);
        fragment.append(card);
    }
    obrasContainer.replaceChildren(fragment);
    filtrarObrasAdmin();
}

function pintarAdminTalleres(talleres, inscripciones) {
    talleresAdministrados = talleres;
    const inscripcionesPorTaller = new Map();
    for (const inscripcion of inscripciones) {
        inscripcionesPorTaller.set(
            inscripcion.taller_id,
            (inscripcionesPorTaller.get(inscripcion.taller_id) ?? 0) + 1
        );
    }

    const fragment = document.createDocumentFragment();
    for (const taller of talleres) {
        const card = crearElemento('details', 'admin-obra admin-taller');
        card.dataset.busqueda = normalizarTexto(
            `${taller.titulo} ${taller.instructor ?? ''} ${taller.horario ?? ''}`
        ).toLocaleLowerCase('es-BO');
        const summary = crearElemento('summary', 'admin-obra-resumen');
        summary.append(
            crearElemento('span', 'admin-obra-titulo', taller.titulo),
            crearElemento(
                'span',
                taller.activo ? 'admin-badge' : 'admin-badge admin-badge-inactivo',
                taller.activo ? 'Publicado' : 'Retirado'
            ),
            crearElemento(
                'span',
                'admin-obra-total admin-taller-meta',
                `${taller.horario} · ${taller.cupos} cupos · ${inscripcionesPorTaller.get(taller.id) ?? 0} inscripciones`
            )
        );

        const content = crearElemento('div', 'admin-obra-contenido');
        content.append(
            crearElemento('p', 'admin-taller-detalle', `Instructor: ${taller.instructor || 'Sin asignar'}`),
            crearElemento('p', 'admin-taller-detalle', taller.descripcion || 'Taller de teatro para desarrollar habilidades escénicas.')
        );
        const actions = crearElemento('div', 'admin-obra-acciones');
        const editButton = crearElemento('button', 'btn', 'Editar taller');
        editButton.type = 'button';
        editButton.dataset.editarTaller = String(taller.id);
        const statusButton = crearElemento(
            'button',
            taller.activo ? 'btn btn-eliminar' : 'btn',
            taller.activo ? 'Retirar taller' : 'Reactivar taller'
        );
        statusButton.type = 'button';
        statusButton.dataset.cambiarEstadoTaller = String(taller.id);
        statusButton.dataset.activo = String(!taller.activo);
        actions.append(editButton, statusButton);
        content.append(actions);
        card.append(summary, content);
        fragment.append(card);
    }
    talleresContainer.replaceChildren(fragment);
    filtrarTalleresAdmin();
}

function filtrarTalleresAdmin() {
    const busqueda = normalizarTexto(buscarTalleresInput.value).toLocaleLowerCase('es-BO');
    let coincidencias = 0;
    const tarjetas = talleresContainer.querySelectorAll('.admin-taller');
    for (const tarjeta of tarjetas) {
        const coincide = tarjeta.dataset.busqueda.includes(busqueda);
        tarjeta.hidden = !coincide;
        if (coincide) coincidencias++;
    }
    talleresSinResultados.hidden = coincidencias > 0;
    talleresSinResultados.textContent = tarjetas.length && busqueda
        ? 'No se encontraron talleres que coincidan con la búsqueda.'
        : 'No hay talleres registrados.';
}

function filtrarObrasAdmin() {
    const busqueda = normalizarTexto(buscarObrasInput.value).toLocaleLowerCase('es-BO');
    let coincidencias = 0;
    const tarjetas = obrasContainer.querySelectorAll('.admin-obra');
    for (const tarjeta of tarjetas) {
        const coincide = tarjeta.dataset.busqueda.includes(busqueda);
        tarjeta.hidden = !coincide;
        if (coincide) coincidencias++;
    }

    obrasSinResultados.hidden = coincidencias > 0;
    obrasSinResultados.textContent = tarjetas.length && busqueda
        ? 'No se encontraron obras que coincidan con la búsqueda.'
        : 'No hay obras registradas.';
}

function campoFechaHora(label, name, value) {
    const wrapper = crearElemento('label', 'admin-campo-hora', label);
    const input = document.createElement('input');
    input.type = 'datetime-local';
    input.name = name;
    input.value = value;
    input.required = true;
    wrapper.append(input);
    return wrapper;
}

function escapar(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function formValues(form) {
    return Object.fromEntries(new FormData(form));
}

function extensionImagen(file) {
    const extensions = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp'
    };
    const extension = file instanceof File ? extensions[file.type] : null;
    if (!extension) throw new Error('Adjunta una imagen JPG, PNG o WebP.');
    if (file.size > 5 * 1024 * 1024) throw new Error('La imagen no puede superar los 5 MB.');
    return extension;
}

function limpiarVistaPreviaImagen() {
    if (imagenPreviewUrl) URL.revokeObjectURL(imagenPreviewUrl);
    imagenPreviewUrl = null;
    imagenPreview.removeAttribute('src');
    imagenPreview.hidden = true;
}

function limpiarVistaPreviaTaller() {
    if (tallerImagenPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(tallerImagenPreviewUrl);
    tallerImagenPreviewUrl = null;
    tallerImagenPreview.removeAttribute('src');
    tallerImagenPreview.hidden = true;
}

function urlImagenTaller(path) {
    const imagePath = String(path ?? '');
    if (imagePath.startsWith('talleres-portadas/')) {
        return supabase.storage.from('talleres-portadas')
            .getPublicUrl(imagePath.slice('talleres-portadas/'.length)).data.publicUrl;
    }
    return new URL(imagePath.replace(/^\.?\//, ''), new URL(import.meta.env.BASE_URL, window.location.origin)).href;
}

function restablecerOpcionesHorarioTaller() {
    const select = tallerForm.elements.horario;
    select.replaceChildren(crearElemento('option', '', 'Selecciona un horario'));
    select.options[0].value = '';
    for (const horario of horariosTaller) {
        const option = crearElemento('option', '', horario);
        option.value = horario;
        select.append(option);
    }
}

function reiniciarFormularioTaller() {
    tallerForm.reset();
    delete tallerForm.dataset.tallerId;
    delete tallerForm.dataset.imagenActual;
    delete tallerForm.dataset.horarioActual;
    tallerForm.elements.id.value = '';
    tallerImagenInput.required = true;
    tallerForm.querySelector('button[type="submit"]').textContent = 'Crear taller';
    document.getElementById('adminTallerFormularioTitulo').textContent = 'Agregar taller o curso';
    cancelarEdicionTaller.hidden = true;
    restablecerOpcionesHorarioTaller();
    limpiarVistaPreviaTaller();
}

function editarTaller(tallerId) {
    const taller = talleresAdministrados.find(item => String(item.id) === String(tallerId));
    if (!taller) throw new Error('No se encontró el taller que quieres editar. Actualiza la lista e inténtalo otra vez.');
    reiniciarFormularioTaller();
    tallerForm.dataset.tallerId = String(taller.id);
    tallerForm.dataset.imagenActual = taller.img ?? '';
    tallerForm.dataset.horarioActual = taller.horario;
    tallerForm.elements.id.value = String(taller.id);
    tallerForm.elements.titulo.value = taller.titulo;
    tallerForm.elements.instructor.value = taller.instructor ?? '';
    tallerForm.elements.descripcion.value = taller.descripcion ?? '';
    tallerForm.elements.video_url.value = taller.video_url ?? '';
    tallerForm.elements.cupos.value = String(taller.cupos);
    const horarioSelect = tallerForm.elements.horario;
    if (!horariosTaller.includes(taller.horario)) {
        const option = crearElemento('option', '', `Horario actual: ${taller.horario}`);
        option.value = taller.horario;
        horarioSelect.append(option);
    }
    horarioSelect.value = taller.horario;
    tallerImagenInput.required = false;
    tallerForm.querySelector('button[type="submit"]').textContent = 'Guardar cambios';
    document.getElementById('adminTallerFormularioTitulo').textContent = `Editar: ${taller.titulo}`;
    cancelarEdicionTaller.hidden = false;
    tallerImagenPreviewUrl = urlImagenTaller(taller.img);
    tallerImagenPreview.src = tallerImagenPreviewUrl;
    tallerImagenPreview.hidden = !taller.img;
    tallerForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

imagenInput.addEventListener('change', () => {
    limpiarVistaPreviaImagen();
    const file = imagenInput.files?.[0];
    if (!file) return;
    imagenPreviewUrl = URL.createObjectURL(file);
    imagenPreview.src = imagenPreviewUrl;
    imagenPreview.hidden = false;
});

tallerImagenInput.addEventListener('change', () => {
    limpiarVistaPreviaTaller();
    const file = tallerImagenInput.files?.[0];
    if (!file) return;
    tallerImagenPreviewUrl = URL.createObjectURL(file);
    tallerImagenPreview.src = tallerImagenPreviewUrl;
    tallerImagenPreview.hidden = false;
});

cancelarEdicionTaller.addEventListener('click', reiniciarFormularioTaller);

function manejarError(error, contexto) {
    console.error(contexto, error);
    mostrarEstado(error instanceof Error ? error.message : 'Ocurrió un error inesperado.', true);
}

tallerForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!tallerForm.reportValidity()) return;
    const button = tallerForm.querySelector('button[type="submit"]');
    const values = formValues(tallerForm);
    const tallerId = tallerForm.dataset.tallerId;
    const existingImage = tallerForm.dataset.imagenActual ?? '';
    const file = tallerImagenInput.files?.[0];
    let uploadedImagePath = null;
    button.disabled = true;
    try {
        const title = String(values.titulo ?? '').trim();
        const instructor = String(values.instructor ?? '').trim();
        const horario = String(values.horario ?? '');
        const cupos = Number(values.cupos);
        const videoUrl = String(values.video_url ?? '').trim();
        if (!title || !instructor) throw new Error('El nombre del taller y su instructor son obligatorios.');
        if (!horariosTaller.includes(horario) && horario !== tallerForm.dataset.horarioActual) {
            throw new Error('Selecciona uno de los horarios preestablecidos.');
        }
        if (!Number.isSafeInteger(cupos) || cupos < 0) {
            throw new Error('Los cupos deben ser un número entero igual o mayor que cero.');
        }
        if (!esYouTube(videoUrl)) throw new Error('El enlace debe ser una URL válida de YouTube.');
        if (!tallerId && !file) throw new Error('Adjunta una imagen de portada para crear el taller.');
        let image = existingImage;
        if (file) {
            const extension = extensionImagen(file);
            const path = `${crypto.randomUUID()}.${extension}`;
            const { error: uploadError } = await supabase.storage
                .from('talleres-portadas')
                .upload(path, file, {
                    cacheControl: '3600',
                    contentType: file.type,
                    upsert: false
                });
            if (uploadError) throw uploadError;
            uploadedImagePath = path;
            image = `talleres-portadas/${path}`;
        }

        const workshopData = {
            titulo: title,
            instructor,
            horario,
            cupos,
            descripcion: String(values.descripcion ?? '').trim()
                || 'Un espacio formativo para desarrollar habilidades teatrales y escénicas.',
            video_url: videoUrl || null,
            img: image
        };
        const result = tallerId
            ? await supabase.from('talleres').update(workshopData).eq('id', tallerId).select('id').single()
            : await supabase.from('talleres').insert(workshopData).select('id').single();
        if (result.error) throw result.error;
        uploadedImagePath = null;

        let cleanupWarning = '';
        if (file && existingImage.startsWith('talleres-portadas/')) {
            const oldPath = existingImage.slice('talleres-portadas/'.length);
            let cleanupError = null;
            try {
                const { error } = await supabase.storage.from('talleres-portadas').remove([oldPath]);
                cleanupError = error;
            } catch (error) {
                cleanupError = error;
            }
            if (cleanupError) {
                console.error('No se pudo eliminar la imagen anterior del taller.', cleanupError);
                cleanupWarning = ' El cambio se guardó, pero la imagen anterior requiere limpieza manual.';
            }
        }
        reiniciarFormularioTaller();
        try {
            await cargarAdministracion();
        } catch (refreshError) {
            console.error('El taller se guardó, pero no se pudo actualizar la lista.', refreshError);
            mostrarEstado(
                `El taller se guardó, pero no se pudo actualizar la lista. Recarga el panel para ver los cambios. ${refreshError instanceof Error ? refreshError.message : ''}`,
                true
            );
            return;
        }
        mostrarEstado(`${tallerId ? 'Taller actualizado' : 'Taller creado'} correctamente.${cleanupWarning}`);
    } catch (error) {
        if (uploadedImagePath) {
            let cleanupError = null;
            try {
                const { error } = await supabase.storage
                    .from('talleres-portadas')
                    .remove([uploadedImagePath]);
                cleanupError = error;
            } catch (storageError) {
                cleanupError = storageError;
            }
            if (cleanupError) {
                console.error('No se pudo limpiar la imagen después de un error al guardar el taller.', cleanupError);
                const message = error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
                error = new Error(`${message} La imagen quedó en almacenamiento y requiere limpieza manual.`);
            }
        }
        manejarError(error, 'No se pudo guardar el taller.');
    } finally {
        button.disabled = false;
    }
});

document.getElementById('adminTalleres').addEventListener('click', async event => {
    const editButton = event.target.closest('[data-editar-taller]');
    if (editButton) {
        try {
            editarTaller(editButton.dataset.editarTaller);
        } catch (error) {
            manejarError(error, 'No se pudo abrir la edición del taller.');
        }
        return;
    }

    const statusButton = event.target.closest('[data-cambiar-estado-taller]');
    if (!statusButton) return;
    const activating = statusButton.dataset.activo === 'true';
    const workshop = talleresAdministrados.find(item => String(item.id) === statusButton.dataset.cambiarEstadoTaller);
    const action = activating ? 'reactivar' : 'retirar';
    if (!activating && !window.confirm(`¿Retirar "${workshop?.titulo ?? 'este taller'}" de la oferta? Las inscripciones se conservarán para las estadísticas.`)) return;
    statusButton.disabled = true;
    try {
        const { error } = await supabase.from('talleres')
            .update({ activo: activating })
            .eq('id', statusButton.dataset.cambiarEstadoTaller)
            .select('id')
            .single();
        if (error) throw error;
        await cargarAdministracion();
        mostrarEstado(`Taller ${activating ? 'reactivado' : 'retirado'} correctamente.`);
    } catch (error) {
        manejarError(error, `No se pudo ${action} el taller.`);
    } finally {
        statusButton.disabled = false;
    }
});

buscarTalleresInput.addEventListener('input', filtrarTalleresAdmin);

document.getElementById('formNuevaObra').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    if (!form.reportValidity()) return;
    button.disabled = true;
    let uploadedImagePath = null;
    try {
        const values = formValues(form);
        const extension = extensionImagen(values.imagen);
        if (!esYouTube(values.video_url)) throw new Error('El tráiler debe ser un enlace válido de YouTube.');
        const inicio = fechaHora(values.fecha, values.hora);
        if (new Date(inicio.replace(' ', 'T')) <= new Date()) {
            throw new Error('La primera función debe programarse en una fecha y hora futuras.');
        }
        const imagePath = `${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
            .from('obras-portadas')
            .upload(imagePath, values.imagen, {
                cacheControl: '3600',
                contentType: values.imagen.type,
                upsert: false
            });
        if (uploadError) throw uploadError;
        uploadedImagePath = imagePath;
        const { error } = await supabase.rpc('crear_obra_con_funcion', {
            p_titulo: values.titulo.trim(),
            p_director: values.director.trim(),
            p_sinopsis: values.sinopsis.trim(),
            p_video_url: values.video_url.trim(),
            p_img_path: uploadedImagePath,
            p_inicio: inicio
        });
        if (error) throw error;
        uploadedImagePath = null;
        form.reset();
        limpiarVistaPreviaImagen();
        await cargarAdministracion();
        document.getElementById('dlgNuevaObra').close();
        mostrarEstado('Obra y primera función creadas correctamente.');
    } catch (error) {
        if (uploadedImagePath) {
            let cleanupError = null;
            try {
                const { error: storageError } = await supabase.storage
                    .from('obras-portadas')
                    .remove([uploadedImagePath]);
                cleanupError = storageError;
            } catch (storageError) {
                cleanupError = storageError;
            }
            if (cleanupError) {
                console.error('No se pudo limpiar la imagen después de un error al crear la obra.', cleanupError);
                const message = error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
                error = new Error(`${message} La imagen quedó en almacenamiento y requiere limpieza manual.`);
            }
        }
        manejarError(error, 'No se pudo crear la obra y su función.');
    } finally {
        button.disabled = false;
    }
});

obrasContainer.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.target;
    const values = formValues(form);
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
        if (form.dataset.editarObra) {
            if (!esYouTube(values.video_url)) throw new Error('El tráiler debe ser un enlace válido de YouTube.');
            const { error } = await supabase.from('obras').update({
                titulo: values.titulo.trim(),
                autor: values.director.trim(),
                director: values.director.trim(),
                sinopsis: values.sinopsis.trim() || 'Una experiencia teatral para disfrutar en comunidad.',
                video_url: values.video_url.trim() || null
            }).eq('id', form.dataset.editarObra);
            if (error) throw error;
        } else if (form.dataset.editarFuncion) {
            const inicio = values.inicio.replace('T', ' ') + ':00';
            const salida = values.salida.replace('T', ' ') + ':00';
            if (new Date(salida.replace(' ', 'T')) <= new Date(inicio.replace(' ', 'T'))) {
                throw new Error('La hora de salida debe ser posterior a la hora de ingreso.');
            }
            const { error } = await supabase.from('funciones').update({ inicio, salida }).eq('id', form.dataset.editarFuncion);
            if (error) throw error;
        } else if (form.dataset.nuevaFuncion) {
            const [obraResult, salasResult] = await Promise.all([
                supabase.from('obras').select('duracion_minutos').eq('id', form.dataset.nuevaFuncion).single(),
                supabase.from('salas').select('id').eq('activa', true).limit(1).single()
            ]);
            if (obraResult.error) throw obraResult.error;
            if (salasResult.error) throw salasResult.error;
            const inicio = fechaHora(values.fecha, values.hora);
            if (new Date(inicio.replace(' ', 'T')) <= new Date()) {
                throw new Error('La función debe programarse en una fecha y hora futuras.');
            }
            const { error } = await supabase.from('funciones').insert({
                id: crypto.randomUUID(),
                obra_id: Number(form.dataset.nuevaFuncion),
                sala_id: salasResult.data.id,
                inicio,
                salida: sumarMinutos(inicio, obraResult.data.duracion_minutos),
                estado: 'programada'
            });
            if (error) throw error;
        }
        await cargarAdministracion();
    } catch (error) {
        manejarError(error, 'No se pudo guardar el cambio administrativo.');
    } finally {
        button.disabled = false;
    }
});

obrasContainer.addEventListener('click', async event => {
    const functionButton = event.target.closest('[data-retirar-funcion]');
    if (functionButton) {
        if (!window.confirm('¿Retirar esta función de la cartelera? Dejará de aparecer para el público y no aceptará reservas; se conservarán el registro y las reservas para las estadísticas.')) return;
        functionButton.disabled = true;
        try {
            const { error } = await supabase.from('funciones')
                .update({ estado: 'cancelada' })
                .eq('id', functionButton.dataset.retirarFuncion)
                .eq('estado', 'programada')
                .select('id')
                .single();
            if (error) throw error;
            await cargarAdministracion();
        } catch (error) {
            manejarError(error, 'No se pudo retirar la función de la cartelera.');
        } finally {
            functionButton.disabled = false;
        }
        return;
    }

    const button = event.target.closest('[data-eliminar-obra]');
    if (!button || !window.confirm('¿Eliminar esta obra de la cartelera? El historial y sus reservas se conservarán para las estadísticas.')) return;
    button.disabled = true;
    try {
        const { error } = await supabase.rpc('retirar_obra', { p_obra_id: Number(button.dataset.eliminarObra) });
        if (error) throw error;
        await cargarAdministracion();
    } catch (error) {
        manejarError(error, 'No se pudo retirar la obra de la cartelera.');
    } finally {
        button.disabled = false;
    }
});

document.getElementById('formNuevoAdmin').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button');
    button.disabled = true;
    try {
        const email = new FormData(form).get('email');
        const { error } = await supabase.rpc('agregar_administrador', { p_email: email });
        if (error) throw error;
        form.reset();
        await cargarAdministracion();
    } catch (error) {
        manejarError(error, 'No se pudo agregar al administrador.');
    } finally {
        button.disabled = false;
    }
});

administradoresContainer.addEventListener('click', async event => {
    const button = event.target.closest('[data-quitar-administrador]');
    if (!button || !window.confirm(`¿Quitar los privilegios de administrador a ${button.dataset.quitarAdministrador}?`)) return;
    button.disabled = true;
    try {
        const { error } = await supabase.rpc('quitar_administrador', {
            p_email: button.dataset.quitarAdministrador
        });
        if (error) throw error;
        await cargarAdministracion();
    } catch (error) {
        manejarError(error, 'No se pudieron quitar los privilegios administrativos.');
    } finally {
        button.disabled = false;
    }
});

function normalizarTexto(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\x20-\x7E]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

buscarObrasInput.addEventListener('input', filtrarObrasAdmin);

function numero(value) {
    return Number(value ?? 0).toLocaleString('es-BO');
}

function tituloPdf(doc, titulo, generado) {
    const ancho = doc.internal.pageSize.getWidth();
    doc.setFillColor(33, 15, 15);
    doc.rect(0, 0, ancho, 34, 'F');
    doc.setTextColor(212, 175, 55);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('TEATRO UCB', 14, 15);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.text(titulo, 14, 25);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Generado: ${new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium', timeStyle: 'short' }).format(generado)}`, ancho - 14, 15, { align: 'right' });
    doc.setTextColor(35, 29, 29);
}

function tablaPdf(doc, head, body, options = {}) {
    autoTable(doc, {
        head: [head],
        body,
        startY: options.startY ?? 42,
        margin: { left: 14, right: 14 },
        styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.4, overflow: 'linebreak' },
        headStyles: { fillColor: [91, 24, 37], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 245, 239] },
        theme: 'grid',
        ...options
    });
    return doc.lastAutoTable.finalY;
}

function graficoBarrasPdf(doc, titulo, datos, y, formato = numero) {
    const ancho = doc.internal.pageSize.getWidth();
    const left = 18;
    const usable = ancho - 36;
    const baseY = y + 52;
    const max = Math.max(1, ...datos.map(item => item.valor));
    const barWidth = datos.length ? Math.min(24, usable / datos.length - 6) : 0;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(titulo, left, y);
    doc.setDrawColor(120, 110, 100);
    doc.line(left, baseY, ancho - left, baseY);
    datos.forEach((item, index) => {
        const x = left + index * (usable / Math.max(datos.length, 1)) + 3;
        const height = item.valor / max * 34;
        doc.setFillColor(160, 45, 54);
        doc.rect(x, baseY - height, barWidth, height, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(35, 29, 29);
        doc.text(formato(item.valor), x + barWidth / 2, baseY - height - 2, { align: 'center' });
        doc.text(String(item.etiqueta).slice(0, 12), x + barWidth / 2, baseY + 5, { align: 'center', maxWidth: usable / Math.max(datos.length, 1) });
    });
    doc.setTextColor(35, 29, 29);
    return baseY + 13;
}

function piePdf(doc, generado) {
    const total = doc.getNumberOfPages();
    const ancho = doc.internal.pageSize.getWidth();
    const alto = doc.internal.pageSize.getHeight();
    for (let page = 1; page <= total; page++) {
        doc.setPage(page);
        doc.setDrawColor(212, 175, 55);
        doc.line(14, alto - 13, ancho - 14, alto - 13);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 92, 83);
        doc.text(`Teatro UCB · ${generado.toLocaleDateString('es-BO')}`, 14, alto - 7);
        doc.text(`Página ${page} de ${total}`, ancho - 14, alto - 7, { align: 'right' });
    }
}

async function descargarReporte() {
    const button = document.getElementById('descargarReporte');
    button.disabled = true;
    mostrarEstado('Preparando el reporte...');
    try {
        const [obrasResult, funcionesResult, reservasResult, salasResult, talleresResult, inscripcionesResult] = await Promise.all([
            supabase.from('obras').select('id, titulo, activa, duracion_minutos'),
            supabase.from('funciones').select('id, obra_id, sala_id, inicio, salida, estado'),
            supabase.from('reservas').select('id, funcion_id, butaca, created_at, estado, cancelada_en'),
            supabase.from('salas').select('id, nombre, capacidad, activa'),
            supabase.from('talleres').select('id, titulo, activo, created_at, horario, cupos, instructor'),
            supabase.from('inscripciones_talleres').select('id, taller_id, estado, created_at')
        ]);
        const failed = [obrasResult, funcionesResult, reservasResult, salasResult, talleresResult, inscripcionesResult].find(result => result.error);
        if (failed?.error) throw failed.error;

        const obras = obrasResult.data;
        const funciones = funcionesResult.data;
        const reservas = reservasResult.data;
        const salas = new Map(salasResult.data.map(sala => [sala.id, sala]));
        const talleres = talleresResult.data;
        const inscripciones = inscripcionesResult.data;
        const now = new Date();
        const obraPorId = new Map(obras.map(obra => [obra.id, obra]));
        const salaPorId = new Map(salas.map(sala => [sala.id, sala]));
        const reservasPorFuncion = new Map();
        const funcionesPorObra = new Map();
        const reservasPorObra = new Map();
        for (const reserva of reservas) {
            const list = reservasPorFuncion.get(reserva.funcion_id) ?? [];
            list.push(reserva);
            reservasPorFuncion.set(reserva.funcion_id, list);
            const funcion = funciones.find(item => item.id === reserva.funcion_id);
            if (funcion) {
                const obraReservations = reservasPorObra.get(funcion.obra_id) ?? [];
                obraReservations.push(reserva);
                reservasPorObra.set(funcion.obra_id, obraReservations);
            }
        }

        const finFuncion = funcion => {
            if (funcion.salida) return String(funcion.salida).replace(' ', 'T');
            const obra = obraPorId.get(funcion.obra_id);
            return sumarMinutos(String(funcion.inicio).replace('T', ' '), obra?.duracion_minutos ?? 0).replace(' ', 'T');
        };
        const esPasada = funcion => funcion.estado === 'finalizada' || new Date(finFuncion(funcion)) <= now;
        const confirmadas = reservas.filter(reserva => reserva.estado === 'confirmada');
        const canceladas = reservas.filter(reserva => reserva.estado === 'cancelada');
        const reservasPorMes = new Map();
        for (const reserva of reservas) {
            const mes = reserva.created_at.slice(0, 7);
            reservasPorMes.set(mes, (reservasPorMes.get(mes) ?? 0) + 1);
        }
        const meses = [...reservasPorMes.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12);

        const resumenFunciones = funciones.map(funcion => {
            const obra = obraPorId.get(funcion.obra_id);
            const reservasFuncion = reservasPorFuncion.get(funcion.id) ?? [];
            const sala = salaPorId.get(funcion.sala_id);
            const capacidad = sala?.capacidad ?? 0;
            const entradasActivas = reservasFuncion.filter(reserva => reserva.estado === 'confirmada').length;
            return {
                funcion,
                obra,
                sala,
                reservasFuncion,
                entradasActivas,
                capacidad,
                ocupacion: capacidad ? entradasActivas / capacidad * 100 : null,
                pasada: esPasada(funcion)
            };
        });

        const doc = new jsPDF({ format: 'a4', unit: 'mm' });
        tituloPdf(doc, 'Resumen ejecutivo', now);
        const activeCapacity = salas.filter(sala => sala.activa).reduce((sum, sala) => sum + sala.capacidad, 0);
        tablaPdf(doc, ['Indicador', 'Resultado'], [
            ['Obras registradas', numero(obras.length)],
            ['Funciones registradas', numero(funciones.length)],
            ['Reservas históricas', numero(reservas.length)],
            ['Reservas confirmadas / canceladas', `${numero(confirmadas.length)} / ${numero(canceladas.length)}`],
            ['Entradas con reserva confirmada (no son pagos)', numero(confirmadas.length)],
            ['Capacidad de salas activas', numero(activeCapacity)],
            ['Talleres / inscripciones registradas', `${numero(talleres.length)} / ${numero(inscripciones.length)}`]
        ], { startY: 43, columnStyles: { 0: { cellWidth: 105 } } });
        if (meses.length) {
            graficoBarrasPdf(doc, 'Evolución mensual de reservas creadas', meses.map(([mes, valor]) => ({
                etiqueta: mes,
                valor
            })), doc.lastAutoTable.finalY + 18);
        } else {
            doc.setFontSize(10);
            doc.text('No existen reservas registradas para mostrar una evolución.', 18, doc.lastAutoTable.finalY + 18);
        }

        doc.addPage();
        tituloPdf(doc, '1. Reporte de reservas', now);
        tablaPdf(doc, ['Obra', 'Fecha y hora', 'Confirmadas', 'Canceladas', 'Total'], resumenFunciones.map(item => [
            item.obra?.titulo ?? 'Obra sin datos',
            new Date(String(item.funcion.inicio).replace(' ', 'T')).toLocaleString('es-BO'),
            numero(item.reservasFuncion.filter(reserva => reserva.estado === 'confirmada').length),
            numero(item.reservasFuncion.filter(reserva => reserva.estado === 'cancelada').length),
            numero(item.reservasFuncion.length)
        ]));
        doc.setFontSize(8);
        doc.text('La base registra reservas de butacas; no contiene confirmación de pagos.', 14, Math.min(doc.lastAutoTable.finalY + 8, 280));

        doc.addPage();
        tituloPdf(doc, '2. Reporte de ocupación', now);
        const ocupacionRows = resumenFunciones.map(item => [
            item.obra?.titulo ?? 'Obra sin datos',
            new Date(String(item.funcion.inicio).replace(' ', 'T')).toLocaleString('es-BO'),
            item.sala?.nombre ?? 'Sala no disponible',
            `${numero(item.entradasActivas)} / ${numero(item.capacidad)}`,
            item.ocupacion === null ? 'No disponible' : `${item.ocupacion.toFixed(1)}%`,
            item.capacidad ? numero(Math.max(0, item.capacidad - item.entradasActivas)) : 'No disponible'
        ]);
        tablaPdf(doc, ['Obra', 'Función', 'Sala', 'Ocupadas / capacidad', 'Ocupación', 'Libres'], ocupacionRows);
        const conOcupacion = resumenFunciones.filter(item => item.ocupacion !== null && item.funcion.estado !== 'cancelada');
        const mayorOcupacion = conOcupacion.reduce((best, item) => !best || item.ocupacion > best.ocupacion ? item : best, null);
        const menorOcupacion = conOcupacion.reduce((best, item) => !best || item.ocupacion < best.ocupacion ? item : best, null);
        const occupancyWork = obras.map(obra => {
            const items = resumenFunciones.filter(item => item.funcion.obra_id === obra.id && item.ocupacion !== null);
            const avg = items.length ? items.reduce((sum, item) => sum + item.ocupacion, 0) / items.length : 0;
            return { etiqueta: obra.titulo, valor: avg };
        }).filter(item => item.valor > 0).sort((a, b) => b.valor - a.valor).slice(0, 8);
        const chartY = doc.lastAutoTable.finalY + 16;
        if (chartY > 215) doc.addPage();
        const yForOccupancyChart = chartY > 215 ? 45 : chartY;
        if (occupancyWork.length) graficoBarrasPdf(doc, 'Ocupación media por obra (%)', occupancyWork, yForOccupancyChart, value => `${Math.round(value)}%`);
        const bestLine = mayorOcupacion
            ? `Mayor ocupación: ${mayorOcupacion.obra?.titulo ?? 'Obra'} (${mayorOcupacion.ocupacion.toFixed(1)}%).`
            : 'No hay funciones con capacidad registrada.';
        const lowestLine = menorOcupacion
            ? `Menor ocupación: ${menorOcupacion.obra?.titulo ?? 'Obra'} (${menorOcupacion.ocupacion.toFixed(1)}%).`
            : '';
        doc.setFontSize(9);
        doc.text([bestLine, lowestLine].filter(Boolean), 14, Math.min(yForOccupancyChart + 70, 282));

        doc.addPage();
        tituloPdf(doc, '3. Reporte de obras', now);
        const workRows = obras.map(obra => {
            const functions = funciones.filter(funcion => funcion.obra_id === obra.id);
            const active = functions.filter(funcion => funcion.estado === 'programada' && !esPasada(funcion)).length;
            const past = functions.filter(funcion => funcion.estado !== 'cancelada' && esPasada(funcion)).length;
            const cancelled = functions.filter(funcion => funcion.estado === 'cancelada').length;
            const reservationCount = (reservasPorObra.get(obra.id) ?? []).filter(reserva => reserva.estado === 'confirmada').length;
            const status = !obra.activa
                ? 'Retirada'
                : active
                    ? 'En cartelera'
                    : past
                        ? 'Obra pasada'
                        : 'Sin funciones vigentes';
            return [
                obra.titulo,
                status,
                numero(functions.length),
                numero(past),
                numero(cancelled),
                numero(reservationCount)
            ];
        });
        tablaPdf(doc, ['Obra', 'Estado', 'Funciones', 'Realizadas', 'Retiradas', 'Reservas confirmadas'], workRows);
        const topWorks = [...obras].map(obra => ({
            etiqueta: obra.titulo,
            valor: (reservasPorObra.get(obra.id) ?? []).filter(reserva => reserva.estado === 'confirmada').length
        })).sort((a, b) => b.valor - a.valor).slice(0, 8);
        let worksChartY = doc.lastAutoTable.finalY + 16;
        if (worksChartY > 215) {
            doc.addPage();
            tituloPdf(doc, '3.1 Obras más solicitadas', now);
            worksChartY = 48;
        }
        if (topWorks.length) graficoBarrasPdf(doc, 'Reservas confirmadas por obra', topWorks, worksChartY);

        doc.addPage('a4', 'landscape');
        tituloPdf(doc, '4. Reporte de talleres', now);
        const workshopRows = talleres.map(taller => {
            const registrations = inscripciones.filter(item => item.taller_id === taller.id);
            const byStatus = status => registrations.filter(item => item.estado === status).length;
            return [
                taller.titulo,
                taller.instructor || 'Sin asignar',
                taller.horario,
                numero(taller.cupos),
                taller.activo ? 'Activo' : 'Inactivo',
                taller.created_at ? new Date(taller.created_at).toLocaleDateString('es-BO') : 'No disponible',
                numero(registrations.length),
                numero(byStatus('pendiente')),
                numero(byStatus('aceptada')),
                numero(byStatus('rechazada') + byStatus('cancelada'))
            ];
        });
        tablaPdf(doc, ['Taller', 'Instructor', 'Horario', 'Cupos', 'Estado', 'Registrado', 'Inscripciones', 'Pendientes', 'Aceptadas', 'Rechazadas/canceladas'], workshopRows);
        doc.setFontSize(8);
        doc.text(
            'Limitación de datos: el esquema registra la fecha de creación y estado del taller, pero no fecha de realización ni asistencia efectiva. Las inscripciones no se presentan como asistencia.',
            14,
            Math.min(doc.lastAutoTable.finalY + 8, doc.internal.pageSize.getHeight() - 15),
            { maxWidth: 180 }
        );

        piePdf(doc, now);
        doc.save(`reporte-administrativo-teatro-ucb-${now.toISOString().slice(0, 10)}.pdf`);
        mostrarEstado('Reporte PDF descargado.');
    } catch (error) {
        manejarError(error, 'No se pudo generar el reporte administrativo.');
    } finally {
        button.disabled = false;
    }
}

document.getElementById('descargarReporte').addEventListener('click', descargarReporte);

document.addEventListener('click', event => {
    const openButton = event.target.closest('[data-abrir-dialogo]');
    if (openButton) {
        document.getElementById(openButton.dataset.abrirDialogo).showModal();
        return;
    }

    const closeButton = event.target.closest('[data-cerrar-dialogo]');
    if (closeButton) closeButton.closest('dialog').close();
});

cerrarSesionButton.addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
        await cerrarSesion();
        await verificarAcceso();
    } catch (error) {
        manejarError(error, 'No se pudo cerrar la sesión.');
    } finally {
        button.disabled = false;
    }
});

if (supabase) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
        window.setTimeout(verificarAcceso, 0);
    });
    window.addEventListener('pagehide', () => subscription.unsubscribe(), { once: true });
    verificarAcceso();
}
