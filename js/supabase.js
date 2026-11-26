import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

function isValidSupabaseUrl(value) {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.host);
  } catch {
    return false;
  }
}

export const supabase = supabaseUrl && supabaseAnonKey && isValidSupabaseUrl(supabaseUrl)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

function getSupabase() {
  if (!supabase) {
    throw new Error('Supabase no está configurado. Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en las variables de entorno de Vercel o GitHub Actions y vuelve a desplegar.');
  }
  return supabase;
}

export function traducirMensajeAutenticacion(message) {
  if (/anonymous sign-ins are disabled/i.test(message)) {
    return 'El acceso anónimo está deshabilitado. Inicia sesión con tu cuenta para continuar.';
  }
  if (/^sign in$/i.test(message)) return 'Iniciar sesión';
  if (/please sign in|sign in to continue/i.test(message)) return 'Inicia sesión para continuar.';
  return null;
}

// ---------- Autenticación ----------
export async function registrar({ nombre, email, password }) {
  const { data, error } = await getSupabase().auth.signUp({
    email,
    password,
    options: { data: { nombre } } // lo recoge el trigger para crear el perfil
  });
  if (error) throw error;
  return data;
}

export async function iniciarSesion({ email, password }) {
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function cerrarSesion() {
  const { error } = await getSupabase().auth.signOut();
  if (error) throw error;
}

export async function usuarioActual() {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) throw error;
  return data.session?.user ?? null;
}

export async function usuarioEsAdministrador() {
  const user = await usuarioActual();
  if (!user) return false;
  const { data, error } = await getSupabase().rpc('es_administrador');
  if (error) throw error;
  return data === true;
}

export async function cargarCatalogoTeatro() {
  const { data, error } = await getSupabase()
    .from('obras')
    .select('id, titulo, autor, director, duracion_minutos, sinopsis, img, video_url, activa, visible_galeria, anio, asistencia, resena, funciones(id, inicio, salida, estado)')
    .order('id');
  if (error) throw error;
  return data;
}


// ---------- Elenco ----------
export async function cargarElenco() {
  const { data, error } = await getSupabase()
    .from('miembros_elenco')
    .select('id, nombre, categoria, foto_url, elenco_obras(personaje, obras(id, titulo))')
        .order('nombre');
  if (error) throw error;
  return data;
}

export async function cargarTalleres() {
  const { data, error } = await getSupabase()
    .from('talleres')
    .select('id, titulo, horario, cupos, descripcion, img, instructor, video_url')
    .eq('activo', true)
    .order('id');
  if (error) throw error;
  return data;
}

export async function cargarElencoDeObras() {
  const { data, error } = await getSupabase()
    .from('elenco_obras')
    .select('obra_id, personaje, orden, miembros_elenco(id, nombre, categoria, foto_url)');
  if (error) throw error;
  return data;
}


export async function inscribirEnTaller({ taller_id, nombre, email, experiencia }) {
  const user = await usuarioActual();
  const { error } = await getSupabase().from('inscripciones_talleres').insert({
    taller_id,
    user_id: user?.id ?? null,
    nombre,
    email,
    experiencia
  });
  if (error) {
    if (error.code === '23505') throw new Error('Ya existe una inscripción para este taller y correo.');
    throw error;
  }
}

// ---------- Reservas y pago QR simulado ----------
export async function butacasOcupadas(funcionId) {
  const { data, error } = await getSupabase()
    .rpc('butacas_ocupadas', { p_funcion_id: funcionId });
  if (error) throw error;
  return data.map(r => r.butaca);
}

export async function misBloqueosButacas(funcionId) {
  const user = await usuarioActual();
  if (!user) return [];

  const { data, error } = await getSupabase()
    .rpc('mis_bloqueos_butacas', { p_funcion_id: funcionId });
  if (error) throw error;
  return data;
}

export async function actualizarBloqueoButacas(funcionId, butacas) {
  const { data, error } = await getSupabase()
    .rpc('actualizar_bloqueo_butacas', {
      p_funcion_id: funcionId,
      p_butacas: butacas
    });
  if (error) throw error;
  return data;
}

export async function confirmarPagoQrSimulado(funcionId, butacas, referencia) {
  const { data, error } = await getSupabase()
    .rpc('confirmar_pago_qr_simulado', {
      p_funcion_id: funcionId,
      p_butacas: butacas,
      p_referencia: referencia
    });
  if (error) throw error;
  return data;
}

export async function enviarCorreoConfirmacion(reservaIds) {
  const { data, error } = await getSupabase().functions.invoke('send-reservation-confirmation', {
    body: { reservation_ids: reservaIds.map(String) }
  });
  if (error) {
    let message = error.message;
    if (error.context && typeof error.context.json === 'function') {
      try {
        const responseBody = await error.context.json();
        if (typeof responseBody?.error === 'string') message = responseBody.error;
      } catch {
        // Keep the original Functions error if its response body is unavailable.
      }
    }
    throw new Error(message);
  }
  if (data?.sent !== true) throw new Error('El servicio de correo no confirmó el envío.');
  return data;
}

export async function cancelarReserva(reservaId) {
  const { error } = await getSupabase().rpc('cancelar_mis_reservas', {
    p_reserva_id: reservaId
  });
  if (error) throw error;
}

export async function misReservas() {
  const user = await usuarioActual();
  if (!user) return null;

  const { data, error } = await getSupabase()
    .from('reservas')
    .select('id, funcion_id, butaca, created_at, estado, cancelada_en, ticket_token')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}
