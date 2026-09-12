/**
 * NEXO CRM - Comportamiento de la pagina de venta
 * ---------------------------------------------------------------------------
 * Este archivo existe por una razon de seguridad, no de orden. Al no haber
 * ningun <script> en linea dentro del HTML, la politica de contenido puede
 * prohibir los scripts en linea por completo, que es la defensa mas efectiva
 * contra inyeccion de codigo en una pagina publica.
 *
 * Por el mismo motivo aqui no hay atributos onclick ni onload en el HTML.
 * Todo se conecta con addEventListener.
 */

/* Escala cada vista incrustada para que la aplicacion, renderizada a un ancho
   fijo de escritorio, quepa en su hueco sin deformarse. ResizeObserver en vez
   de escuchar el evento resize de la ventana. */
const BASE_WIDTH = 1380;

const fit = (box) => {
  const frame = box.querySelector('iframe');
  if (frame) frame.style.transform = `scale(${box.clientWidth / BASE_WIDTH})`;
};

const boxes = document.querySelectorAll('[data-scale]');
if (boxes.length) {
  const ro = new ResizeObserver((entries) => entries.forEach((e) => fit(e.target)));
  boxes.forEach((box) => { fit(box); ro.observe(box); });
}

/* Aparicion al entrar en pantalla. IntersectionObserver, nunca un escucha de
   scroll. La marca data-js habilita el estado oculto: si este archivo no carga,
   el contenido se ve igual en vez de quedar invisible para siempre. */
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.dataset.js = '1';

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.dataset.shown = 'true';
      io.unobserve(entry.target);
    });
  }, { threshold: 0.16, rootMargin: '0px 0px -8% 0px' });

  document.querySelectorAll('[data-reveal]').forEach((node) => io.observe(node));
}

/* Borde de la barra superior solo cuando la pagina ya bajo del todo arriba. */
const nav = document.getElementById('navSite');
if (nav) {
  const sentinel = document.createElement('div');
  sentinel.setAttribute('aria-hidden', 'true');
  document.body.prepend(sentinel);
  new IntersectionObserver(([entry]) => {
    nav.dataset.stuck = String(!entry.isIntersecting);
  }).observe(sentinel);
}
