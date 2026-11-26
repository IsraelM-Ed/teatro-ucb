# Teatro UCB

Sitio web del Taller de Teatro de la Universidad Católica Boliviana San Pablo,
sede La Paz. Permite consultar la cartelera, reservar butacas, revisar obras
pasadas, conocer al elenco e inscribirse a talleres.

## Tecnologías

- Vite para desarrollo y compilación multipágina.
- Vue para elegir función, React para el mapa de butacas y Angular para el
  resumen de la reserva. Los tres se cargan bajo demanda al acercarse a la
  sección de reservas y comparten estado mediante un módulo y eventos DOM.
- Supabase Auth, Postgres, RPC, RLS y Realtime para autenticación, cartelera,
  permisos administrativos y reservas.
- Leaflet para el mapa de ubicación; Day.js, Chart.js, GSAP y AOS para fechas,
  estadísticas y presentación visual.

## Requisitos

- Node.js 20.19+ o 22.12+ y npm.
- Un proyecto Supabase para autenticación, reservas y herramientas de
  administración.

## Instalación y desarrollo

```bash
npm install
npm run dev
```

En `.env` configura las variables públicas de Vite:

```dotenv
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-clave-anon
```

La clave `anon`/publishable está diseñada para el cliente y debe estar protegida
por RLS. Nunca pongas una clave `service_role` en el frontend ni en variables
`VITE_*`.

## Supabase

En una base nueva, ejecuta `teatro-ucb-supabase/supabase/schema.sql` y después
las migraciones, en orden, desde **Supabase → SQL Editor**:

1. `teatro-ucb-supabase/supabase/migrations/20261118163500_expand_theater_schema.sql`
2. `teatro-ucb-supabase/supabase/migrations/20261125170000_admin_theater.sql`
3. `teatro-ucb-supabase/supabase/migrations/20261125190000_reservations_admin_security.sql`
4. `teatro-ucb-supabase/supabase/migrations/20261125192100_work_images_required.sql`
5. `teatro-ucb-supabase/supabase/migrations/20261125202000_admin_workshops.sql`
6. `teatro-ucb-supabase/supabase/migrations/20261125214000_reservation_holds_and_simulated_qr.sql`
7. `teatro-ucb-supabase/supabase/migrations/20261125230000_user_reservation_access.sql`
8. `teatro-ucb-supabase/supabase/migrations/20261126120000_elenco.sql`

La migración administrativa protege las operaciones con RLS y asigna el rol
inicial a `israelmujia5@gmail.com` si la cuenta ya existe o cuando se registra.
La migración de seguridad de reservas reemplaza el acceso público a las filas
privadas por la RPC de disponibilidad, conserva las cancelaciones como historial,
habilita sincronización Realtime y agrega tokens QR. También permite al
administrador principal retirar roles delegados.
La migración de imágenes crea el bucket público `obras-portadas`, limitado a
archivos JPG, PNG o WebP de hasta 5 MB; solo administradores pueden subirlos.
Cada obra nueva requiere una imagen, que se usa como portada y fondo.
La migración de talleres habilita las altas y ediciones protegidas por RLS,
añade los campos de instructor y tráiler, y crea `talleres-portadas` para las
imágenes de los cursos.
La migración de reservas exige iniciar sesión para bloquear butacas por cinco
minutos, guarda el pago simulado de forma transaccional y mantiene las reservas
confirmadas para el historial. El QR de pago es demostrativo: no mueve dinero.
La migración del elenco crea `miembros_elenco` (integrantes con su paralelo:
oficial, juveniles o aspirantes) y `elenco_obras` (quién participa en cada obra
y con qué personaje). La lectura es pública y solo los administradores pueden
modificarlas. También crea el bucket público `elenco` para las fotos de perfil,
limitado a JPG, PNG o WebP de hasta 2 MB. Al eliminar un integrante se quita de
todas las obras en las que participaba.
La migración de acceso a reservas garantiza que los usuarios autenticados puedan
consultar sus propias entradas mediante RLS; los administradores conservan
acceso administrativo.
Las migraciones SQL deben aplicarse en el proyecto Supabase de despliegue; no se
ejecutan automáticamente desde este repositorio.

### Correo de confirmación

El correo se envía desde una Supabase Edge Function usando Gmail API. La cuenta
Gmail que autoriza OAuth será el remitente; el destinatario sigue siendo el
correo de la cuenta autenticada. Nunca pongas credenciales OAuth en el frontend,
en `.env` público ni en variables `VITE_*`.

1. En Google Cloud Console, habilita Gmail API, configura la pantalla de
   consentimiento OAuth y añade la cuenta remitente como usuario de prueba.
2. Crea un cliente OAuth de tipo aplicación web y agrega
   `https://developers.google.com/oauthplayground` como URI de redirección.
3. En OAuth 2.0 Playground, abre la configuración, activa **Use your own OAuth
   credentials** y coloca el ID y secreto del cliente. Autoriza el alcance
   `https://www.googleapis.com/auth/gmail.send`, intercambia el código y copia
   el refresh token.
4. Vincula el proyecto Supabase y guarda las credenciales como secretos:

```bash
cd teatro-ucb-supabase
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase secrets set GMAIL_CLIENT_ID="..." GMAIL_CLIENT_SECRET="..." GMAIL_REFRESH_TOKEN="..." GMAIL_SENDER="tu-cuenta@gmail.com"
supabase functions deploy send-reservation-confirmation
```

`GMAIL_SENDER` debe coincidir con la cuenta que concedió OAuth o con un alias de
envío configurado en Gmail. Supabase proporciona `SUPABASE_URL` y
`SUPABASE_SERVICE_ROLE_KEY` a la función. En modo de prueba de Google, los
refresh tokens pueden caducar a los siete días; para uso continuo, revisa los
requisitos de publicación y verificación de Google para el alcance `gmail.send`.
Si el correo falla, la reserva confirmada se conserva y el usuario puede
reintentar el envío desde la pantalla.

## Funcionalidades

- Cartelera con horarios, tráileres disponibles y selección de obra.
- Reservas de butacas y sección de entradas para usuarios autenticados.
- Bloqueos de cinco minutos por usuario, QR de pago de demostración con
  confirmación simulada y correo con los QR individuales de entrada.
- Entradas digitales QR con identificador aleatorio, descarga y cancelación de
  reservas conservando su historial.
- Vista esquemática de butaca y disponibilidad en tiempo real (la tabla
  `disponibilidad_butacas` representa cada butaca ocupada por función; la
  matriz A-F se actualiza al recibir cambios de Supabase Realtime. La tabla debe
  estar incluida en la publicación `supabase_realtime`; si la conexión Realtime
  falla, el mapa consulta la disponibilidad cada cinco segundos hasta reconectar.
- Catálogo de obras pasadas e inscripciones a talleres.
- Página de elenco en `elenco.html`, con pestañas por paralelo (oficial,
  juveniles y aspirantes), foto o iniciales de cada integrante y las obras en
  las que participa. La obra destacada de la cartelera muestra su elenco con
  nombre, foto y personaje. Sin Supabase configurado se usan los datos de
  ejemplo de `data/elenco.json`.
- Panel administrativo independiente en `admin.html`, con altas y edición de
  obras, funciones y talleres, permisos, un resumen de actividad y reportes.
  Desde «Gestionar elenco» se agregan integrantes con foto, se cambian de
  paralelo o se eliminan; desde «Gestionar obras» se asigna el elenco de cada
  obra con su personaje o rol.
- Pie de página compartido (`<teatro-footer>`) con navegación, contacto y redes
  sociales, presente en todas las páginas públicas.
- Selección de butacas animada, notificaciones toast y placeholders skeleton
  durante las cargas.
- GitHub Pages se configura con la acción del repositorio. `npm run build`
  genera los archivos de publicación en `dist/`; la carpeta generada no se
  versiona.

## Compilación local

```bash
npm run build
npm run preview
```

## Publicación en GitHub Pages

Configura `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` como secretos de GitHub
Actions y ejecuta el workflow de Pages. La configuración de Vite toma el nombre
del repositorio para construir las rutas del sitio.

## Publicación en Vercel

En Vercel, abre el proyecto y ve a **Settings → Environment Variables**. Añade
`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con los valores del proyecto
Supabase y habilítalos para los entornos que uses (Production y Preview). Guarda
los cambios y vuelve a desplegar: Vite incorpora estas variables durante la
compilación. Usa `dist` como directorio de salida si Vercel no lo detecta
automáticamente. No configures la clave `service_role` en el frontend.

Los enlaces a redes sociales (YouTube, TikTok e Instagram) se configuran en
`js/redes.js` y se muestran como íconos SVG en la cabecera y en el pie de
página; una red sin URL no se muestra. Los reportes y operaciones administrativas
dependen de que las migraciones SQL requeridas estén aplicadas en Supabase.
