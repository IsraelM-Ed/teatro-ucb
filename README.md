# Teatro UCB

Sitio web del Taller de Teatro de la Universidad Católica Boliviana San Pablo,
sede La Paz. Permite consultar la cartelera, reservar butacas, revisar obras
pasadas e inscribirse a talleres.

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
Las migraciones SQL deben aplicarse en el proyecto Supabase de despliegue; no se
ejecutan automáticamente desde este repositorio.

### Correo de confirmación

El correo se envía desde una Supabase Edge Function usando Resend. Verifica un
dominio y un remitente en Resend, vincula este repositorio con Supabase CLI y
configura los secretos en el proyecto (no los pongas en `.env` del frontend ni
en variables `VITE_*`):

```bash
cd teatro-ucb-supabase
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase secrets set RESEND_API_KEY=re_... RESEND_FROM="Teatro UCB <entradas@tu-dominio-verificado>"
supabase functions deploy send-reservation-confirmation
```

La función usa `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` proporcionados por
Supabase. Los comandos se ejecutan desde `teatro-ucb-supabase`, donde están la
configuración de Supabase y la Edge Function. Despliega la función después de
aplicar la migración anterior. Si el correo falla, la reserva confirmada se
conserva y el usuario puede reintentar el envío desde la pantalla.

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
- Panel administrativo independiente en `admin.html`, con altas y edición de
  obras, funciones y talleres, permisos, un resumen de actividad y reportes.
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

Facebook (UCB Sede La Paz) y YouTube enlazan a perfiles cuyo nombre e identidad
se verificaron en las propias páginas. Instagram y TikTok se omiten hasta poder
confirmar sus URLs oficiales. Los reportes y operaciones administrativas
dependen de que las migraciones SQL requeridas estén aplicadas en Supabase.
