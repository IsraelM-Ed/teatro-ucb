# Teatro UCB

## Desarrollo

Instala las dependencias con `npm install` y ejecuta `npm run dev`. Para generar
la versión de producción, usa `npm run build`.

La reserva combina tres componentes: Vue permite elegir una función y horario,
React dibuja el mapa de butacas y Angular presenta el resumen y confirma la
reserva. Las butacas confirmadas se guardan en Supabase y aparecen en **Mis
entradas** para el usuario autenticado. Configura `VITE_SUPABASE_URL` y
`VITE_SUPABASE_ANON_KEY` en el entorno de Vite; el esquema de base de datos está
en `teatro-ucb-supabase/supabase/schema.sql`. Para una base que ya ejecutó ese
esquema, revisa y ejecuta la migración
`teatro-ucb-supabase/supabase/migrations/20261118163500_expand_theater_schema.sql`
desde **Supabase → SQL Editor**. La migración no se ejecuta automáticamente.
Precarga las obras, funciones, sala, butacas y talleres actuales. El sitio aún
lee el catálogo desde `data/obras.json`; `ordenes`, inscripciones y postulaciones
requieren una integración posterior antes de usarse desde la interfaz.

Las obras, funciones, talleres y estadísticas de asistencia se leen de
`data/obras.json`. Las inscripciones a talleres, por ahora, se conservan solo
en el almacenamiento local del navegador. La reserva confirma butacas, pero
este proyecto todavía no procesa pagos.

## Publicación en GitHub Pages

Hola yon, soy el ratatin gaming
