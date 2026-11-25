# Teatro UCB

## Desarrollo

Instala las dependencias con `npm install` y ejecuta `npm run dev`. Para generar
la versión de producción, usa `npm run build`.

La reserva combina tres componentes: Vue permite elegir una función y horario,
React dibuja el mapa de butacas y Angular presenta el resumen y confirma la
reserva. Las butacas confirmadas se guardan en Supabase y aparecen en **Mis
entradas** para el usuario autenticado. Configura `VITE_SUPABASE_URL` y
`VITE_SUPABASE_ANON_KEY` en el entorno de Vite.

Para configurar una base nueva, ejecuta `teatro-ucb-supabase/supabase/schema.sql`
y luego las migraciones, en orden, desde **Supabase → SQL Editor**:

1. `teatro-ucb-supabase/supabase/migrations/20261118163500_expand_theater_schema.sql`
2. `teatro-ucb-supabase/supabase/migrations/20261125170000_admin_theater.sql`

La migración administrativa crea roles protegidos con RLS, asigna privilegios
a `israelmujia5@gmail.com` al registrarse (o si ya tiene cuenta), y permite a los
administradores existentes agregar otros correos que ya tengan una cuenta.
Después de aplicar la migración, inicia sesión con esa cuenta para acceder a
**Administración**. Las nuevas obras, presentaciones y altas administrativas se
guardan en Supabase; las inscripciones a talleres también se guardan allí. Si
Supabase no está configurado, el catálogo y las inscripciones conservan el
modo local original, pero las reservas y las herramientas administrativas no
están disponibles.

El catálogo público oculta las presentaciones vencidas y las muestra en **Obras
pasadas**. Retirar una obra solo la oculta de la cartelera: sus funciones y
reservas permanecen almacenadas para los informes administrativos. Las reservas
de eventos pasados dejan de aparecer en las entradas del usuario, pero se
conservan como datos estadísticos. La reserva confirma butacas, pero este
proyecto todavía no procesa pagos.

## Publicación en GitHub Pages

Hola yon, soy el ratatin gaming
