import datosTeatro from '../data/obras.json';
import { butacasOcupadas, cargarCatalogoTeatro, cargarTalleres, supabase } from './supabase.js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import './navigation.js';
import './footer.js';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow
});

dayjs.locale('es');

const fmtFechaFuncion = f => dayjs(f).format('D MMM YYYY · HH:mm');
const fmtHora = f => dayjs(f).format('HH:mm');
const assetUrl = path => {
    const imagePath = String(path ?? '');
    if (/^https?:\/\//i.test(imagePath)) return imagePath;
    const bucket = ['obras-portadas', 'talleres-portadas']
        .find(bucketName => imagePath.startsWith(`${bucketName}/`));
    if (bucket) {
        if (!supabase) throw new Error('Se requiere Supabase para cargar imágenes del catálogo.');
        return supabase.storage.from(bucket)
            .getPublicUrl(imagePath.slice(`${bucket}/`.length)).data.publicUrl;
    }
    return `${import.meta.env.BASE_URL}${imagePath.replace(/^\.?\//, '')}`;
};
let datos = null;
let obraSeleccionada = null;

function pintarObraDestacada(obra) {
    const panel = document.getElementById('obraDestacada');
    if (!obra) {
        panel.replaceChildren();
        return;
    }

    const funciones = obra.funciones.map(funcion => {
        const salida = funcion.salida ? dayjs(funcion.salida) : dayjs(funcion.fecha).add(obra.duracionMinutos, 'minute');
        return `<li><time datetime="${funcion.fecha}">${fmtHora(funcion.fecha)}</time><span>–</span><time datetime="${salida.format('YYYY-MM-DDTHH:mm')}">${fmtHora(salida)}</time></li>`;
    }).join('');
    panel.classList.remove('actualizando');
    panel.innerHTML = `
        <div class="obra-destacada-contenido">
            <p class="obra-etiqueta">Obra destacada</p>
            <h3 class="obra-destacada-titulo${obra.titulo.length > 20 ? ' titulo-largo' : ''}">${escaparHtml(obra.titulo)}</h3>
            <div class="obra-sinopsis">
                <p>${escaparHtml(obra.sinopsis)}</p>
            </div>
            <div class="obra-metricas">
                <div class="obra-duracion">
                    <strong>${obra.duracionMinutos}</strong>
                    <span>minutos</span>
                </div>
                <div class="obra-horarios">
                    <span class="obra-horarios-titulo">Ingreso y salida</span>
                    <ul>${funciones}</ul>
                </div>
            </div>
        </div>
        <div class="obra-destacada-acciones">
            <button class="btn btn-borde" type="button" data-video="${obra.id}"${obra.video ? '' : ' disabled aria-disabled="true"'}>Ver Avance</button>
            <a class="btn btn-primario" href="#reserva">Reservar</a>
        </div>
    `;
    requestAnimationFrame(() => panel.classList.add('actualizando'));
}

function pintarObras() {
    document.getElementById('listaObras').innerHTML = datos.obras.map(o => `
        <button class="tarjeta cartelera-afiche" type="button" data-obra="${o.id}"
                aria-pressed="${o.id === obraSeleccionada?.id}"
                aria-label="Seleccionar obra ${escaparHtml(o.titulo)}">
            <img src="${escaparHtml(assetUrl(o.img))}" alt="Imagen de ${escaparHtml(o.titulo)}" loading="lazy">
            <div class="tarjeta-cuerpo">
                <h3>${escaparHtml(o.titulo)}</h3>
                <p class="duracion-obra">${o.duracionMinutos} min</p>
                <p class="autor">${escaparHtml(o.director || o.autor)}</p>
                <ul class="fechas-funcion">${o.funciones.map(f => `<li><time datetime="${f.fecha}">${fmtFechaFuncion(f.fecha)}</time></li>`).join('')}</ul>
            </div>
        </button>
    `).join('');
}

function seleccionarObra(obra, centrarTarjeta = false) {
    if (!obra || obra.id === obraSeleccionada?.id) return;

    obraSeleccionada = obra;
    pintarObraDestacada(obraSeleccionada);

    const tarjetas = [...document.querySelectorAll('#listaObras [data-obra]')];
    for (const tarjeta of tarjetas) {
        tarjeta.setAttribute('aria-pressed', String(tarjeta.dataset.obra === String(obra.id)));
    }

    const url = new URL(window.location.href);
    url.searchParams.set('obra', String(obra.id));
    window.history.replaceState(null, '', url);
    document.dispatchEvent(new CustomEvent('obra-seleccionada', {
        detail: obra
    }));

    if (centrarTarjeta) {
        const tarjeta = tarjetas.find(item => item.dataset.obra === String(obra.id));
        tarjeta?.scrollIntoView({
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
            block: 'nearest',
            inline: 'center'
        });
    }
}

function inicializarSeleccionObras() {
    const idSolicitado = new URLSearchParams(window.location.search).get('obra');
    obraSeleccionada = datos.obras.find(obra => String(obra.id) === idSolicitado) ?? datos.obras[0] ?? null;

    document.getElementById('listaObras').addEventListener('click', event => {
        const tarjeta = event.target.closest('button[data-obra]');
        if (!tarjeta) return;
        const obra = datos.obras.find(item => String(item.id) === tarjeta.dataset.obra);
        seleccionarObra(obra, true);
    });

    document.getElementById('listaObras').addEventListener('keydown', event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        const tarjetas = [...document.querySelectorAll('#listaObras button[data-obra]')];
        const indice = tarjetas.indexOf(event.target);
        if (indice < 0 || tarjetas.length < 2) return;

        event.preventDefault();
        const incremento = event.key === 'ArrowRight' ? 1 : -1;
        const siguiente = tarjetas[(indice + incremento + tarjetas.length) % tarjetas.length];
        const obra = datos.obras.find(item => String(item.id) === siguiente.dataset.obra);
        siguiente.focus();
        seleccionarObra(obra, true);
    });
}

document.addEventListener('funcion-seleccionada', event => {
    const imagen = event.detail?.obra?.img;
    if (imagen) {
        window.actualizarFondoTeatro?.(document.body.dataset.screen, assetUrl(imagen));
    }
});

function pintarGaleria() {
    document.getElementById('listaGaleria').innerHTML = datos.pasadas.map(p => `
        <article class="tarjeta obra-pasada" data-aos="fade-up">
            <picture>
                <source media="(min-width:900px)" srcset="${escaparHtml(assetUrl(p.img))}">
                <img src="${escaparHtml(assetUrl(p.imgSm))}" alt="Función de ${escaparHtml(p.titulo)}" loading="lazy">
            </picture>
            <div class="tarjeta-cuerpo">
                    <h3>${escaparHtml(p.titulo)}</h3>
                    <p class="fecha">${escaparHtml(String(p.anio ?? ''))}</p>
                <details>
                    <summary>Reseña del público</summary>
                        <p>${escaparHtml(p.resena)}</p>
                </details>
            </div>
        </article>
    `).join('');

    const asistencias = datos.pasadas.map(obra => obra.asistencia);
    const totalAsistentes = asistencias.reduce((total, cantidad) => total + cantidad, 0);
    const promedio = datos.pasadas.length ? Math.round(totalAsistentes / datos.pasadas.length) : 0;
    const mayorAsistencia = Math.max(0, ...asistencias);
    document.getElementById('estadisticasObras').innerHTML = `
        <article class="estadistica-obra"><span>Obras presentadas</span><strong>${datos.pasadas.length}</strong></article>
        <article class="estadistica-obra"><span>Asistencia total</span><strong>${totalAsistentes.toLocaleString('es-BO')}</strong><small>personas</small></article>
        <article class="estadistica-obra"><span>Promedio por obra</span><strong>${promedio.toLocaleString('es-BO')}</strong><small>personas</small></article>
        <article class="estadistica-obra"><span>Mayor asistencia</span><strong>${mayorAsistencia.toLocaleString('es-BO')}</strong><small>personas</small></article>
    `;

    new Chart(document.getElementById('grafico'), {
        type: 'bar',
        data: {
            labels: datos.pasadas.map(p => p.titulo),
            datasets: [{
                label: 'Asistentes',
                data: datos.pasadas.map(p => p.asistencia),
                backgroundColor: 'rgba(212, 175, 55, 0.72)',
                hoverBackgroundColor: '#f0d477',
                borderColor: '#d4af37',
                borderWidth: 1,
                borderRadius: 8,
                maxBarThickness: 64
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: context => `${context.parsed.y.toLocaleString('es-BO')} asistentes`
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#f1ece4' },
                    grid: { display: false }
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: 'rgba(255, 255, 255, 0.72)' },
                    grid: { color: 'rgba(255, 255, 255, 0.12)' },
                    title: { display: true, text: 'Asistentes', color: '#f1ece4' }
                }
            }
        }
    });
}

function pintarTalleres() {
    document.getElementById('listaTalleres').innerHTML = datos.talleres.map(t => {
        const videoUrl = enlaceYouTube(t.video_url);
        return `
        <article class="tarjeta taller-card" data-aos="fade-up">
            <div class="taller-imagen">
                <img src="${escaparHtml(assetUrl(t.img || './assets/keke1.png'))}" alt="Escena teatral relacionada con ${escaparHtml(t.titulo)}" loading="lazy">
                <h3>${escaparHtml(t.titulo)}</h3>
            </div>
            <div class="tarjeta-cuerpo taller-cuerpo">
                <p class="taller-horario">${escaparHtml(t.horario ?? t.dia)}</p>
                ${t.instructor ? `<p class="taller-instructor">Con ${escaparHtml(t.instructor)}</p>` : ''}
                <p class="taller-cupos">${escaparHtml(t.cupos)} cupos disponibles</p>
                <hr>
                <p class="taller-descripcion">${escaparHtml(t.descripcion)}</p>
                <div class="taller-acciones">
                    ${videoUrl ? `<a class="btn btn-borde taller-video" href="${escaparHtml(videoUrl)}" target="_blank" rel="noopener noreferrer">Ver tráiler</a>` : ''}
                    <button class="btn" type="button" data-taller="${escaparHtml(t.id)}">Inscribirme</button>
                </div>
            </div>
        </article>
    `;
    }).join('');
}

function enlaceYouTube(value) {
    if (!value) return '';
    try {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol) || !getYouTubeVideoId(url)) return '';
        return url.href;
    } catch {
        return '';
    }
}

function cuentaRegresiva() {
    const el = document.getElementById('cuenta');
    const prox = datos.obras
        .flatMap(o => o.funciones.map(f => dayjs(f.fecha)))
        .filter(d => d.isAfter(dayjs()))
        .sort((a, b) => a - b)[0];

    if (!prox) {
        el.textContent = 'La temporada ya terminó. Mira las obras pasadas.';
        return;
    }

    const dias = prox.startOf('day').diff(dayjs().startOf('day'), 'day');
    const cuenta = dias === 0 ? '¡Es hoy!' : dias === 1 ? 'Mañana' : `faltan ${dias} días`;
    el.textContent = `Próxima función ${cuenta} (${prox.format('D [de] MMMM')}).`;
}

function mapaCampus() {
    const pos = [-16.522801, -68.1118247];
    const container = document.getElementById('mapaCampus');
    const fallback = document.getElementById('mapaCampusFallback');
    if (!container || !fallback) return;

    let map;
    let fallbackShown = false;
    const showFallback = () => {
        if (fallbackShown) return false;
        fallbackShown = true;
        container.hidden = true;
        fallback.hidden = false;
        return true;
    };

    try {
        map = L.map(container).setView(pos, 16);
        const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(map);

        tiles.on('tileerror', () => {
            if (showFallback()) map.remove();
        });

        L.marker(pos).addTo(map).bindPopup('Auditorio UCB, La Paz').openPopup();
    } catch (error) {
        console.error('No se pudo cargar el mapa interactivo del campus.', error);
        if (showFallback() && map) map.remove();
    }
}

function actualizarFondoPorSeccion() {
    const sections = [...document.querySelectorAll('main > section[id]')];
    if (!sections.length) return;
    let activeScreen = '';

    const update = () => {
        const viewportCenter = window.innerHeight / 2;
        const visibleSection = sections.find(section => {
            const bounds = section.getBoundingClientRect();
            return bounds.top <= viewportCenter && bounds.bottom >= viewportCenter;
        });

        if (visibleSection) {
            const screen = visibleSection.id === 'inicio' ? 'hero' : visibleSection.id;
            if (screen !== activeScreen) {
                activeScreen = screen;
                document.body.dataset.screen = screen;
                window.actualizarFondoTeatro?.(screen);
            }
        }
    };

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    window.addEventListener('pagehide', () => {
        window.removeEventListener('scroll', update);
        window.removeEventListener('resize', update);
    }, { once: true });
    update();
}

function animar() {
    AOS.init({ duration: 700, once: true });
    gsap.from('.hero-titular > *, .hero-acciones > *', {
        y: 30,
        opacity: 0,
        stagger: 0.12,
        duration: 0.8,
        delay: 0.4
    });
}

function escaparHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function mostrarErrorCatalogo(error) {
    console.error('No se pudo cargar el catálogo de Supabase; se mostrará el catálogo local.', error);
    const aviso = document.createElement('p');
    aviso.className = 'aviso-catalogo';
    aviso.setAttribute('role', 'status');
    aviso.textContent = 'No se pudo sincronizar la cartelera con la base de datos. Se muestra la información local.';
    document.getElementById('cartelera').prepend(aviso);
}

function catalogoLocal() {
    const ahora = dayjs();
    const obras = [];
    const pasadas = [...datosTeatro.pasadas];

    for (const obra of datosTeatro.obras) {
        const vigentes = [];
        for (const funcion of obra.funciones) {
            const salida = dayjs(funcion.fecha).add(obra.duracionMinutos, 'minute');
            if (salida.isAfter(ahora)) {
                vigentes.push({ ...funcion, salida: salida.format('YYYY-MM-DDTHH:mm') });
            } else {
                pasadas.push({
                    titulo: obra.titulo,
                    anio: dayjs(funcion.fecha).year(),
                    asistencia: 0,
                    resena: obra.sinopsis,
                    img: obra.img,
                    imgSm: obra.img
                });
            }
        }
        if (vigentes.length) obras.push({ ...obra, funciones: vigentes });
    }

    const pasadasUnicas = [...new Map(pasadas.map(item => [item.titulo, item])).values()];
    return { ...datosTeatro, obras, pasadas: pasadasUnicas };
}

async function catalogoDesdeBaseDeDatos(rows) {
    const ahora = dayjs();
    const obras = [];
    const pasadas = [...datosTeatro.pasadas];

    for (const row of rows) {
        const funciones = (row.funciones ?? [])
            .filter(funcion => funcion.estado !== 'cancelada')
            .map(funcion => {
                const fecha = String(funcion.inicio).slice(0, 16);
                const salida = funcion.salida
                    ? String(funcion.salida).slice(0, 16)
                    : dayjs(fecha).add(row.duracion_minutos, 'minute').format('YYYY-MM-DDTHH:mm');
                return { id: funcion.id, fecha, salida };
            });
        const vigentes = funciones.filter(funcion => dayjs(funcion.salida).isAfter(ahora));
        const vencidas = funciones.filter(funcion => !dayjs(funcion.salida).isAfter(ahora));
        let asistenciaPasada = row.asistencia;
        if ((asistenciaPasada === null || asistenciaPasada === undefined) && vencidas.length) {
            const conteos = await Promise.all(vencidas.map(async funcion => (await butacasOcupadas(funcion.id)).length));
            asistenciaPasada = conteos.reduce((total, cantidad) => total + cantidad, 0);
        }

        if (row.visible_galeria) {
            pasadas.push({
                titulo: row.titulo,
                anio: row.anio ?? (funciones[0] ? dayjs(funciones[0].fecha).year() : ''),
                asistencia: asistenciaPasada ?? 0,
                resena: row.resena ?? row.sinopsis ?? '',
                img: row.img ?? './assets/keke1.png',
                imgSm: row.img ?? './assets/keke1.png'
            });
        }

        if (row.activa && vigentes.length) {
            obras.push({
                id: row.id,
                titulo: row.titulo,
                autor: row.director || row.autor || '',
                director: row.director || '',
                duracionMinutos: row.duracion_minutos,
                funciones: vigentes,
                sinopsis: row.sinopsis || 'Una experiencia teatral para disfrutar en comunidad.',
                video: row.video_url,
                img: row.img || './assets/keke1.png'
            });
        }

        if (row.activa && vencidas.length) {
            pasadas.push({
                titulo: row.titulo,
                anio: dayjs(vencidas[vencidas.length - 1].fecha).year(),
                asistencia: asistenciaPasada ?? 0,
                resena: row.resena ?? row.sinopsis ?? '',
                img: row.img ?? './assets/keke1.png',
                imgSm: row.img ?? './assets/keke1.png'
            });
        }
    }

    const pasadasUnicas = [...new Map(pasadas.map(item => [item.titulo, item])).values()];
    return { ...datosTeatro, obras, pasadas: pasadasUnicas };
}

document.addEventListener('click', e => {
    const v = e.target.closest('[data-video]');
    if (!v) return;

    const o = datos.obras.find(x => x.id == v.dataset.video);
    if (!o) return;

    document.getElementById('tituloVideo').textContent = o.titulo;
    const contenido = document.getElementById('videoContenido');
    const errorVideo = document.getElementById('errorVideo');
    const dlgVideo = document.getElementById('dlgVideo');
    contenido.replaceChildren();
    errorVideo.hidden = true;
    errorVideo.textContent = '';

    try {
        const url = new URL(o.video);
        if (!['http:', 'https:'].includes(url.protocol)) {
            throw new Error('El enlace del video debe usar HTTP o HTTPS.');
        }

        const youtubeId = getYouTubeVideoId(url);
        if (youtubeId === null) {
            throw new Error('El enlace de YouTube no contiene un ID de video válido.');
        }

        if (youtubeId) {
            const iframe = document.createElement('iframe');
            iframe.src = `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1`;
            iframe.title = `Video: ${o.titulo}`;
            iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
            iframe.allowFullscreen = true;
            contenido.append(iframe);
        } else {
            const video = document.createElement('video');
            video.controls = true;
            video.preload = 'none';
            video.src = url.href;
            video.addEventListener('error', () => {
                errorVideo.textContent = 'No se pudo reproducir el video. Usa un enlace de YouTube o la URL directa de un archivo de video.';
                errorVideo.hidden = false;
            }, { once: true });
            contenido.append(video);
        }
    } catch (error) {
        errorVideo.textContent = error instanceof Error
            ? error.message
            : 'El enlace del video no es válido.';
        errorVideo.hidden = false;
    }

    dlgVideo.showModal();
});

document.getElementById('dlgVideo').addEventListener('close', () => {
    document.getElementById('videoContenido').replaceChildren();
});

function getYouTubeVideoId(url) {
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be') {
        const id = url.pathname.slice(1).split('/')[0];
        return /^[\w-]{11}$/.test(id) ? id : null;
    }

    if (!['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host)) {
        return undefined;
    }

    const path = url.pathname.split('/').filter(Boolean);
    const id = url.pathname === '/watch'
        ? url.searchParams.get('v')
        : ['embed', 'shorts', 'live'].includes(path[0]) ? path[1] : null;
    return id && /^[\w-]{11}$/.test(id) ? id : null;
}

async function inicializarTeatro() {
    datos = catalogoLocal();
    if (supabase) {
        try {
            datos = await catalogoDesdeBaseDeDatos(await cargarCatalogoTeatro());
        } catch (error) {
            mostrarErrorCatalogo(error);
        }
        try {
            const talleres = await cargarTalleres();
            datos.talleres = talleres.map(taller => ({
                id: taller.id,
                titulo: taller.titulo,
                dia: taller.horario,
                horario: taller.horario,
                cupos: taller.cupos,
                descripcion: taller.descripcion,
                img: taller.img,
                instructor: taller.instructor,
                video_url: taller.video_url
            }));
        } catch (error) {
            console.error('No se pudieron sincronizar los talleres; se mostrará el catálogo local.', error);
            const aviso = document.createElement('p');
            aviso.className = 'aviso-catalogo';
            aviso.setAttribute('role', 'status');
            aviso.textContent = 'No se pudieron sincronizar los talleres. Se muestra la información local.';
            document.getElementById('talleres').prepend(aviso);
        }
    }

    window.TEATRO = datos;
    inicializarSeleccionObras();
    pintarObraDestacada(obraSeleccionada);
    pintarObras();
    pintarGaleria();
    pintarTalleres();
    cuentaRegresiva();
    mapaCampus();
    animar();
    actualizarFondoPorSeccion();
    document.dispatchEvent(new Event('datos-listos'));
}

document.addEventListener('catalogo-actualizado', () => window.location.reload());
inicializarTeatro();