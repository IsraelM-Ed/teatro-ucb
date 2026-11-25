export function mostrarToast(message, type = 'info', duration = 5000) {
    let region = document.getElementById('toastRegion');
    const host = document.querySelector('dialog[open]') ?? document.body;
    if (!region) {
        region = document.createElement('div');
        region.id = 'toastRegion';
        region.className = 'toast-region';
        region.setAttribute('aria-live', 'polite');
        region.setAttribute('aria-relevant', 'additions');
    }
    if (region.parentElement !== host) host.append(region);

    const toast = document.createElement('div');
    const toastType = ['success', 'error', 'info'].includes(type) ? type : 'info';
    toast.className = `toast toast-${toastType}`;
    toast.setAttribute('role', toastType === 'error' ? 'alert' : 'status');

    const text = document.createElement('span');
    text.textContent = message;

    const close = document.createElement('button');
    close.className = 'toast-cerrar';
    close.type = 'button';
    close.setAttribute('aria-label', 'Cerrar notificación');
    close.textContent = '×';
    toast.append(text, close);
    region.append(toast);

    let timer;
    const dismiss = () => {
        if (!toast.isConnected) return;
        window.clearTimeout(timer);
        toast.classList.add('toast-saliendo');
        window.setTimeout(() => toast.remove(), 180);
    };

    timer = window.setTimeout(dismiss, duration);
    close.addEventListener('click', dismiss);
}
