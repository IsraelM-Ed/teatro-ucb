import { enlacesRedes } from './redes.js';

class TeatroFooter extends HTMLElement {
    connectedCallback() {
        const base = import.meta.env.BASE_URL;
        const isAuthPage = /\/(?:login|registro)\.html$/.test(window.location.pathname);
        const home = isAuthPage ? `${base}index.html` : '';
        const sectionLink = id => `${home}#${id}`;
        const anio = new Date().getFullYear();

        this.innerHTML = `
            <footer class="pie">
                <div class="pie-contenido">
                    <div class="pie-marca">
                        <img class="pie-logo" src="${base}assets/logo_catolica.png"
                             alt="Universidad Católica Boliviana San Pablo" width="221" height="97" loading="lazy">
                        <p>Taller de Teatro de la UCB. Formamos actores, creamos comunidad y llevamos el teatro a todo el campus.</p>
                    </div>

                    <nav class="pie-columna" aria-label="Enlaces del pie de página">
                        <h2>Explora</h2>
                        <ul>
                            <li><a href="${sectionLink('cartelera')}">Cartelera</a></li>
                            <li><a href="${sectionLink('reserva')}">Reservar entradas</a></li>
                            <li><a href="${sectionLink('mis-entradas')}">Mis entradas</a></li>
                            <li><a href="${sectionLink('galeria')}">Obras pasadas</a></li>
                            <li><a href="${sectionLink('talleres')}">Talleres</a></li>
                        </ul>
                    </nav>

                    <div class="pie-columna">
                        <h2>Contacto</h2>
                        <address>
                            <p>Av. 14 de Septiembre N°4807, Obrajes, La Paz</p>
                            <p><a href="tel:+59122782222">(+591 2) 2782222</a></p>
                            <p><a href="${sectionLink('ubicacion')}">Cómo llegar</a></p>
                        </address>
                    </div>

                    <div class="pie-columna">
                        <h2>Síguenos</h2>
                        <div class="pie-redes">${enlacesRedes()}</div>
                    </div>
                </div>

                <p class="pie-legal">© ${anio} Taller de Teatro de la Universidad Católica Boliviana "San Pablo", La Paz.</p>
            </footer>
        `;
    }
}

customElements.define('teatro-footer', TeatroFooter);