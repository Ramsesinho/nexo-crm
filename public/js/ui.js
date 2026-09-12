/**
 * NEXO CRM - Utilidades de interfaz
 * Formato, plantillas seguras, avisos y control de paneles.
 */

const LOCALE = 'es-PA';

/* ------------------------------------------------------------- Formato -- */

// narrowSymbol evita el prefijo "USD" que es-PA usa por defecto y deja "$1,500".
const money0 = new Intl.NumberFormat(LOCALE, {
  style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol',
  minimumFractionDigits: 0, maximumFractionDigits: 0,
});
const money2 = new Intl.NumberFormat(LOCALE, {
  style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol',
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

export const money = (cents, exact = false) =>
  (exact ? money2 : money0).format((cents || 0) / 100);

export const compactMoney = (cents) => {
  const v = (cents || 0) / 100;
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1).replace('.0', '')}k`;
  return `$${Math.round(v)}`;
};

const dateFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });
const dateLongFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });

export const shortDate = (iso) => (iso ? dateFmt.format(new Date(iso)) : 'Sin fecha');
export const longDate = (iso) => (iso ? dateLongFmt.format(new Date(iso)) : 'Sin fecha');

/** "hace 2 dias", "en 3 dias", "hoy". */
export function relativeDay(iso) {
  if (!iso) return 'Sin fecha';
  const startOfDay = (d) => { const c = new Date(d); c.setHours(0, 0, 0, 0); return c.getTime(); };
  const days = Math.round((startOfDay(iso) - startOfDay(Date.now())) / 86400000);
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Manana';
  if (days === -1) return 'Ayer';
  if (days > 1 && days < 8) return `En ${days} dias`;
  if (days < -1 && days > -8) return `Hace ${Math.abs(days)} dias`;
  return shortDate(iso);
}

export function relativeTime(iso) {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `Hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Hace ${hours} h`;
  return relativeDay(iso);
}

export const isOverdue = (iso) => Boolean(iso) && new Date(iso) < new Date();

export function initials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

export const fullName = (first, last) => [first, last].filter(Boolean).join(' ') || 'Sin nombre';

/* -------------------------------------------------- Plantillas seguras -- */

/** Escapa todo lo que venga de datos antes de meterlo en innerHTML. */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Etiqueta de plantilla: interpola escapando siempre. */
export function html(strings, ...values) {
  return strings.reduce((out, chunk, i) => out + chunk + (i < values.length ? esc(values[i]) : ''), '');
}

export const el = (selector, root = document) => root.querySelector(selector);
export const els = (selector, root = document) => [...root.querySelectorAll(selector)];

/* ----------------------------------------------------------- Etiquetas -- */

export const STATUS_LABEL = { lead: 'Prospecto', activo: 'Activo', cliente: 'Cliente', perdido: 'Perdido' };
export const STATUS_CLASS = { lead: '', activo: 'badge--info', cliente: 'badge--won', perdido: 'badge--lost' };
export const PRIORITY_LABEL = { baja: 'Baja', normal: 'Normal', alta: 'Alta' };

export const ACTIVITY_ICON = {
  nota: 'ph-note', llamada: 'ph-phone-call', email: 'ph-envelope-simple',
  reunion: 'ph-users-three', etapa: 'ph-arrow-right', creado: 'ph-plus-circle',
  ganado: 'ph-trophy', perdido: 'ph-x-circle',
};

/* -------------------------------------------------------------- Avisos -- */

let toastHost = null;

export function toast(message, { error = false } = {}) {
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.className = 'toasts';
    toastHost.setAttribute('role', 'status');
    toastHost.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastHost);
  }
  const node = document.createElement('div');
  node.className = `toast${error ? ' toast--error' : ''}`;
  node.innerHTML = `<i class="ph ${error ? 'ph-warning-circle' : 'ph-check-circle'}"></i><span>${esc(message)}</span>`;
  toastHost.appendChild(node);
  setTimeout(() => {
    node.style.transition = 'opacity 200ms, transform 200ms';
    node.style.opacity = '0';
    node.style.transform = 'translateY(6px)';
    setTimeout(() => node.remove(), 220);
  }, 3200);
}

/* ------------------------------------------- Paneles laterales y modal -- */

/**
 * Abre un panel con overlay. Devuelve una funcion para cerrarlo.
 * Gestiona Escape, clic en el overlay y devolucion del foco.
 */
export function openLayer(node, overlay, onClose) {
  const previous = document.activeElement;
  node.setAttribute('data-open', 'true');
  overlay.setAttribute('data-open', 'true');
  node.removeAttribute('inert');

  const close = () => {
    node.setAttribute('data-open', 'false');
    overlay.setAttribute('data-open', 'false');
    node.setAttribute('inert', '');
    document.removeEventListener('keydown', onKey);
    overlay.removeEventListener('click', close);
    if (previous && previous.focus) previous.focus();
    if (onClose) onClose();
  };

  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', close);

  const focusable = node.querySelector('input, textarea, select, button, [tabindex]');
  if (focusable) setTimeout(() => focusable.focus(), 60);

  return close;
}

/* ----------------------------------------------------- Estados de vista -- */

export const skeletonStats = (n = 4) =>
  `<div class="stats">${'<div class="skeleton skeleton--stat"></div>'.repeat(n)}</div>`;

export const skeletonRows = (n = 6) =>
  `<div class="panel"><div class="panel__body" style="gap:var(--sp-3)">${
    '<div class="skeleton skeleton--row"></div>'.repeat(n)
  }</div></div>`;

export const emptyState = ({ icon = 'ph-tray', title, text, action = '' }) => `
  <div class="empty">
    <i class="ph ${icon}"></i>
    <p class="empty__title">${esc(title)}</p>
    <p class="empty__text">${esc(text)}</p>
    ${action}
  </div>`;

export const errorState = (message) => `
  <div class="alert" role="alert">
    <i class="ph ph-warning-circle"></i>
    <div>${esc(message)}</div>
  </div>`;
