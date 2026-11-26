import {
  registrar,
  iniciarSesion,
  traducirMensajeAutenticacion,
  usuarioActual
} from './supabase.js';

const form = document.querySelector('#auth-form');
const msg = document.querySelector('#auth-msg');
const modo = form.dataset.modo; // "login" | "registro"

// Si ya hay sesión, ir directo a reservar
usuarioActual()
  .then(u => { if (u) location.href = './index.html#reserva'; })
  .catch(err => {
    console.error('No se pudo verificar la sesión.', err);
    msg.textContent = 'No se pudo verificar la sesión. Inténtalo nuevamente.';
  });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.textContent = '';
  const datos = Object.fromEntries(new FormData(form));
  const boton = form.querySelector('button[type="submit"]');
  boton.disabled = true;

  try {
    if (modo === 'registro') {
      if (datos.password !== datos.password2) throw new Error('Las contraseñas no coinciden.');
      const { session } = await registrar(datos);
      if (!session) {
        msg.style.color = '#fff';
        msg.textContent = 'Revisa tu correo para confirmar tu cuenta.';
        return;
      }
    } else {
      await iniciarSesion(datos);
    }
    location.href = './index.html#reserva';
  } catch (err) {
    console.error('No se pudo completar la autenticación.', err);
    msg.textContent = traducir(err.message, modo);
  } finally {
    boton.disabled = false;
  }
});

function traducir(m, modo) {
  const mensajeAutenticacion = traducirMensajeAutenticacion(m);
  if (mensajeAutenticacion) return mensajeAutenticacion;
  if (/Las contraseñas no coinciden\./i.test(m)) return m;
  if (/Invalid login credentials/i.test(m)) return 'El correo o la contraseña son incorrectos.';
  if (/email not confirmed/i.test(m)) return 'Debes confirmar tu correo antes de iniciar sesión.';
  if (/already registered|user already exists/i.test(m)) return 'Ese correo ya está registrado.';
  if (/at least 6|should be at least 6 characters/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres.';
  if (/invalid email|email address.*invalid/i.test(m)) return 'Ingresa una dirección de correo válida.';
  if (/email rate limit exceeded|too many requests/i.test(m)) return 'Hiciste demasiados intentos. Espera un momento e inténtalo nuevamente.';
  if (/signups? (are )?disabled|signups not allowed/i.test(m)) return 'El registro de nuevas cuentas está deshabilitado.';
  if (/failed to fetch|network/i.test(m)) return 'No se pudo conectar con el servicio. Comprueba tu conexión e inténtalo nuevamente.';
  return modo === 'registro'
    ? 'No se pudo crear la cuenta. Revisa los datos e inténtalo nuevamente.'
    : 'No se pudo iniciar sesión. Revisa los datos e inténtalo nuevamente.';
}
