import { cerrarSesion, supabase, usuarioEsAdministrador } from './supabase.js';

const panel = document.getElementById('adminDashboard');
const sinAcceso = document.getElementById('adminSinAcceso');
const estado = document.getElementById('adminEstado');
const cerrarSesionButton = document.getElementById('adminCerrarSesion');
const obrasContainer = document.getElementById('adminObras');
const administradoresContainer = document.getElementById('listaAdministradores');
const horarios = ['15:00', '16:30', '18:00', '19:30', '20:00'];
let verificacion = 0;
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
    const [obrasResult, funcionesResult, adminsResult] = await Promise.all([
        supabase.from('obras')
            .select('id, titulo, director, duracion_minutos, sinopsis, video_url, activa')
            .order('id'),
        supabase.from('funciones')
            .select('id, obra_id, sala_id, inicio, salida, estado')
            .order('inicio'),
        supabase.from('administradores').select('email').order('email')
    ]);
    const failed = [obrasResult, funcionesResult, adminsResult].find(result => result.error);
    if (failed?.error) throw failed.error;
    pintarAdminObras(obrasResult.data, funcionesResult.data);
    administradoresContainer.replaceChildren(...adminsResult.data.map(admin => crearElemento('li', '', admin.email)));
    mostrarEstado('Los cambios quedan guardados en Supabase. Las funciones pasadas se conservan para las estadísticas.');
}

function pintarAdminObras(obras, funciones) {
    const fragment = document.createDocumentFragment();
    for (const obra of obras) {
        const card = crearElemento('article', 'admin-obra');
        const title = crearElemento('h4', '', obra.titulo);
        card.append(title);
        if (!obra.activa) card.append(crearElemento('p', 'funcion-cancelada', 'Obra eliminada de la cartelera'));

        const editForm = document.createElement('form');
        editForm.className = 'admin-form admin-form-obra';
        editForm.dataset.editarObra = String(obra.id);
        editForm.innerHTML = `
            <label>Nombre de la obra<input name="titulo" required maxlength="160" value="${escapar(obra.titulo)}"></label>
            <label>Director<input name="director" required maxlength="160" value="${escapar(obra.director ?? '')}"></label>
            <label>Descripción<textarea name="sinopsis" rows="2" maxlength="1200">${escapar(obra.sinopsis ?? '')}</textarea></label>
            <label>Enlace del tráiler de YouTube<input name="video_url" type="url" pattern="https?://(www\\.)?(youtube\\.com|youtu\\.be)/.+" value="${escapar(obra.video_url ?? '')}"></label>
            <div class="admin-acciones"><button class="btn" type="submit">Guardar obra</button><button class="btn btn-eliminar" type="button" data-eliminar-obra="${obra.id}">Eliminar obra</button></div>`;
        card.append(editForm);

        const presentations = funciones.filter(funcion => funcion.obra_id === obra.id);
        if (presentations.length) {
            const list = crearElemento('div', 'admin-funciones');
            list.append(crearElemento('h5', '', 'Presentaciones'));
            for (const funcion of presentations) {
                const row = crearElemento('form', 'admin-funcion');
                row.dataset.editarFuncion = funcion.id;
                const end = funcion.salida ?? sumarMinutos(fechaHora(fechaLocal(funcion.inicio), fechaLocal(funcion.inicio).slice(11, 16)), obra.duracion_minutos);
                const vencida = new Date(String(end).replace(' ', 'T')) <= new Date();
                if (vencida) row.append(crearElemento('p', 'funcion-pasada', 'Función pasada'));
                else if (funcion.estado === 'cancelada') row.append(crearElemento('p', 'funcion-cancelada', 'Función cancelada'));
                row.append(
                    crearElemento('span', 'funcion-id', funcion.id),
                    campoFechaHora('Ingreso', 'inicio', fechaLocal(funcion.inicio)),
                    campoFechaHora('Salida', 'salida', fechaLocal(end)),
                    crearElemento('button', 'btn', 'Guardar horario')
                );
                row.querySelector('button').type = 'submit';
                list.append(row);
            }
            card.append(list);
        } else {
            card.append(crearElemento('p', 'admin-ayuda', 'Esta obra todavía no tiene presentaciones.'));
        }

        const addFunction = document.createElement('form');
        addFunction.className = 'admin-form admin-nueva-funcion';
        addFunction.dataset.nuevaFuncion = String(obra.id);
        addFunction.innerHTML = `
            <h5>Agregar presentación</h5>
            <div class="admin-horario">
                <label>Fecha<input name="fecha" type="date" min="${ahoraLocal()}" required></label>
                <label>Horario preestablecido<select name="hora" required>${horaOptions()}</select></label>
            </div>
            <button class="btn" type="submit">Agregar función</button>`;
        card.append(addFunction);
        fragment.append(card);
    }
    obrasContainer.replaceChildren(fragment);
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

function manejarError(error, contexto) {
    console.error(contexto, error);
    mostrarEstado(error instanceof Error ? error.message : 'Ocurrió un error inesperado.', true);
}

document.getElementById('formNuevaObra').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    if (!form.reportValidity()) return;
    button.disabled = true;
    try {
        const values = formValues(form);
        if (!esYouTube(values.video_url)) throw new Error('El tráiler debe ser un enlace válido de YouTube.');
        const inicio = fechaHora(values.fecha, values.hora);
        if (new Date(inicio.replace(' ', 'T')) <= new Date()) {
            throw new Error('La primera función debe programarse en una fecha y hora futuras.');
        }
        const { error } = await supabase.rpc('crear_obra_con_funcion', {
            p_titulo: values.titulo.trim(),
            p_director: values.director.trim(),
            p_sinopsis: values.sinopsis.trim(),
            p_video_url: values.video_url.trim(),
            p_inicio: inicio
        });
        if (error) throw error;
        form.reset();
        await cargarAdministracion();
        document.getElementById('dlgNuevaObra').close();
        mostrarEstado('Obra y primera función creadas correctamente.');
    } catch (error) {
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

function normalizarTexto(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\x20-\x7E]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function numero(value) {
    return Number(value ?? 0).toLocaleString('es-BO');
}

function crearPdf(lines) {
    const normalized = lines
        .map(normalizarTexto)
        .flatMap(line => {
            if (line.length <= 92) return [line];
            const wrapped = [];
            for (let index = 0; index < line.length; index += 88) {
                wrapped.push(`${index ? '  ' : ''}${line.slice(index, index + 88)}`);
            }
            return wrapped;
        });
    const pages = [];
    for (let index = 0; index < normalized.length; index += 45) pages.push(normalized.slice(index, index + 45));
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        `<< /Type /Pages /Kids [${pages.map((_, index) => `${4 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
    ];

    pages.forEach((pageLines, index) => {
        const pageObject = 4 + index * 2;
        const contentObject = pageObject + 1;
        const text = pageLines.map((line, lineIndex) => {
            const escaped = line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
            return `${lineIndex === 0 ? '48 794 Td' : '0 -16 Td'} (${escaped}) Tj`;
        }).join('\n');
        const stream = `BT /F1 10 Tf\n${text}\nET`;
        objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R >>`);
        objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    });

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => {
        offsets.push(pdf.length);
        pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return new Blob([pdf], { type: 'application/pdf' });
}

async function descargarReporte() {
    const button = document.getElementById('descargarReporte');
    button.disabled = true;
    mostrarEstado('Preparando el reporte...');
    try {
        const [obrasResult, funcionesResult, reservasResult, salasResult, talleresResult, inscripcionesResult] = await Promise.all([
            supabase.from('obras').select('id, titulo, activa'),
            supabase.from('funciones').select('id, obra_id, sala_id, inicio, salida, estado'),
            supabase.from('reservas').select('id, funcion_id, butaca, created_at'),
            supabase.from('salas').select('id, nombre, capacidad'),
            supabase.from('talleres').select('id, titulo, activo'),
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
        const funcionesPasadas = funcion => new Date(String(funcion.salida ?? funcion.inicio).replace(' ', 'T')) < now;
        const lineas = [
            'TEATRO UCB - REPORTE ADMINISTRATIVO',
            `Generado: ${new Intl.DateTimeFormat('es-BO', { dateStyle: 'full', timeStyle: 'short' }).format(now)}`,
            '',
            '1. REPORTE DE RESERVAS',
            `Reservas/entradas registradas: ${numero(reservas.length)}`,
            ...funciones.map(funcion => {
                const obra = obras.find(item => item.id === funcion.obra_id);
                const count = reservas.filter(reserva => reserva.funcion_id === funcion.id).length;
                return `${obra?.titulo ?? 'Obra'} | ${new Date(String(funcion.inicio).replace(' ', 'T')).toLocaleString('es-BO')} | ${numero(count)} entradas`;
            }),
            '',
            '2. REPORTE DE OCUPACION (CAPACIDAD)',
            ...funciones.map(funcion => {
                const sala = salas.get(funcion.sala_id);
                const ocupadas = reservas.filter(reserva => reserva.funcion_id === funcion.id).length;
                const capacidad = sala?.capacidad ?? 0;
                const porcentaje = capacidad ? Math.round(ocupadas / capacidad * 100) : 0;
                const obra = obras.find(item => item.id === funcion.obra_id);
                return `${obra?.titulo ?? 'Obra'} | ${new Date(String(funcion.inicio).replace(' ', 'T')).toLocaleString('es-BO')} | ${ocupadas}/${capacidad} butacas (${porcentaje}%)`;
            }),
            '',
            '3. REPORTE DE OBRAS (FUNCIONES Y PRESENTACIONES)',
            `Obras registradas: ${numero(obras.length)} | Presentaciones: ${numero(funciones.length)}`,
            `Futuras/programadas: ${numero(funciones.filter(funcion => funcion.estado !== 'cancelada' && !funcionesPasadas(funcion)).length)} | Pasadas: ${numero(funciones.filter(funcionesPasadas).length)} | Canceladas: ${numero(funciones.filter(funcion => funcion.estado === 'cancelada').length)}`,
            ...obras.map(obra => {
                const deObra = funciones.filter(funcion => funcion.obra_id === obra.id);
                const pasadas = deObra.filter(funcionesPasadas).length;
                const futuras = deObra.filter(funcion => funcion.estado !== 'cancelada' && !funcionesPasadas(funcion)).length;
                const canceladas = deObra.filter(funcion => funcion.estado === 'cancelada').length;
                return `${obra.titulo} | ${deObra.length} presentaciones | ${futuras} futuras | ${pasadas} pasadas | ${canceladas} canceladas | ${obra.activa ? 'Activa' : 'Retirada'}`;
            }),
            '',
            '4. REPORTE DE TALLERES',
            `Talleres registrados: ${numero(talleres.length)} | Inscripciones: ${numero(inscripciones.length)}`,
            ...talleres.map(taller => {
                const counts = inscripciones.filter(item => item.taller_id === taller.id);
                return `${taller.titulo} | ${counts.length} inscripciones | ${taller.activo ? 'Activo' : 'Inactivo'}`;
            })
        ];

        const blob = crearPdf(lineas);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `reporte-administrativo-teatro-ucb-${now.toISOString().slice(0, 10)}.pdf`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
