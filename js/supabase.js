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
    throw new Error('Supabase no está configurado. Añade VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en GitHub Actions Secrets y vuelve a desplegar.');
  }
  return supabase;
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

// ---------- Reservas (reemplazan el localStorage) ----------
export async function butacasOcupadas(funcionId) {
  const { data, error } = await getSupabase()
    .rpc('butacas_ocupadas', { p_funcion_id: funcionId });
  if (error) throw error;
  return data.map(r => r.butaca);
}

export async function confirmarReserva(funcionId, butacas) {
  const user = await usuarioActual();
  if (!user) throw new Error('Debes iniciar sesión para reservar.');
  const filas = butacas.map(b => ({ user_id: user.id, funcion_id: funcionId, butaca: b }));
  const { error } = await getSupabase().from('reservas').insert(filas);
  if (error) {
    if (error.code === '23505') throw new Error('Alguna butaca ya fue reservada. Elige otra.');
    throw error;
  }
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
