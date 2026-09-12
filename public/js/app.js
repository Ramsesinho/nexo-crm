/**
 * NEXO CRM - Aplicacion
 * ---------------------------------------------------------------------------
 * Enrutador por hash, cinco vistas, un panel de detalle y un modal de alta.
 * Sin framework y sin paso de compilacion: se sube por FTP y funciona.
 */

import { createStore } from './store.js';
import {
  money, compactMoney, longDate, relativeDay, relativeTime, isOverdue,
  initials, fullName, esc, el, els,
  STATUS_LABEL, STATUS_CLASS, PRIORITY_LABEL, ACTIVITY_ICON,
  toast, openLayer, skeletonStats, skeletonRows, emptyState, errorState,
} from './ui.js';

const store = createStore();

const state = {
  route: 'panel',
  me: null,
  search: '',
  taskFilter: 'open',
  closeLayer: null,
};

const ROUTES = {
  panel:     { title: 'Panel',        icon: 'ph-chart-line-up', render: renderDashboard },
  embudo:    { title: 'Embudo',       icon: 'ph-kanban',        render: renderBoard },
  contactos: { title: 'Contactos',    icon: 'ph-users',         render: renderContacts },
  empresas:  { title: 'Empresas',     icon: 'ph-buildings',     render: renderCompanies },
  tareas:    { title: 'Tareas',       icon: 'ph-check-square',  render: renderTasks },
};

/* ============================================================ Arranque === */

async function boot() {
  try {
    const me = await store.me();
    state.me = me;
  } catch {
    location.href = './index.html';
    return;
  }

  el('#orgName').textContent = state.me.org.name;
  el('#orgPlan').textContent = `Plan ${state.me.org.plan}`;
  el('#userAvatar').textContent = initials(state.me.user.name);
  el('#userAvatar').style.background = state.me.user.avatarColor || 'var(--accent-soft)';
  el('#userAvatar').style.color = '#fff';
  el('#userName').textContent = state.me.user.name;

  // El aviso de demostracion sobra cuando la app va incrustada en la pagina de
  // venta: alli el marco ya dice que es una demostracion en vivo.
  const embedded = window.self !== window.top;
  el('#demobar').hidden = store.mode !== 'demo' || embedded;

  buildNav();
  wireChrome();
  window.addEventListener('hashchange', route);
  route();
}

function buildNav() {
  el('#nav').innerHTML = Object.entries(ROUTES).map(([key, cfg]) => `
    <a class="nav__item" href="#/${key}" data-route="${key}">
      <i class="ph ${cfg.icon}"></i><span>${esc(cfg.title)}</span>
    </a>`).join('');
}

function wireChrome() {
  el('#burger').addEventListener('click', () => {
    const shell = el('#shell');
    shell.dataset.drawer = shell.dataset.drawer === 'open' ? 'closed' : 'open';
  });
  el('#scrim').addEventListener('click', () => { el('#shell').dataset.drawer = 'closed'; });

  el('#themeToggle').addEventListener('click', () => {
    const root = document.documentElement;
    const isDark = root.dataset.theme === 'dark'
      || (!root.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    root.dataset.theme = isDark ? 'light' : 'dark';
    try { localStorage.setItem('nexo.theme', root.dataset.theme); } catch { /* sin persistencia */ }
  });

  el('#search').addEventListener('input', debounce((e) => {
    state.search = e.target.value;
    if (state.route === 'contactos' || state.route === 'empresas') route();
  }, 220));

  el('#newBtn').addEventListener('click', openCreateModal);

  el('#resetDemo').addEventListener('click', async () => {
    await store.reset();
    toast('Demostracion reiniciada con los datos originales.');
    route();
  });

  // Delegacion unica para todo el area de trabajo. Se registra una sola vez:
  // las vistas se repintan muchas veces y no deben acumular escuchas.
  el('#view').addEventListener('click', onViewClick);
}

async function onViewClick(e) {
  const row = e.target.closest('[data-contact]');
  if (row) return openContactDetail(row.dataset.contact);

  const create = e.target.closest('[data-action]');
  if (create) {
    const map = { 'new-contact': 'contact', 'new-deal': 'deal', 'new-task': 'task' };
    return openCreateModal(map[create.dataset.action]);
  }

  const filter = e.target.closest('[data-filter]');
  if (filter) { state.taskFilter = filter.dataset.filter; return renderTasks(); }

  const check = e.target.closest('.task__check');
  if (check) {
    const task = check.closest('.task');
    await store.updateTask(task.dataset.task, { status: task.dataset.done === 'true' ? 'open' : 'done' });
    return renderTasks();
  }
}

function route() {
  const key = (location.hash.replace('#/', '') || 'panel').split('?')[0];
  state.route = ROUTES[key] ? key : 'panel';
  const cfg = ROUTES[state.route];

  els('.nav__item').forEach((a) => {
    if (a.dataset.route === state.route) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  el('#viewTitle').textContent = cfg.title;
  el('#shell').dataset.drawer = 'closed';
  el('#search').placeholder = state.route === 'empresas'
    ? 'Buscar empresas' : 'Buscar contactos, correos, telefonos';

  cfg.render();
}

const debounce = (fn, ms) => {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

async function withView(loadingHtml, work) {
  const view = el('#view');
  view.innerHTML = loadingHtml;
  try {
    view.innerHTML = await work();
  } catch (err) {
    view.innerHTML = errorState(err.message || 'No se pudieron cargar los datos.');
  }
}

/* ============================================================== Panel ==== */

async function renderDashboard() {
  await withView(skeletonStats() + skeletonRows(4), async () => {
    const d = await store.dashboard();
    const openStages = d.byStage.filter((s) => s.kind === 'open');
    const max = Math.max(1, ...openStages.map((s) => s.total));

    return `
      <section class="stats">
        <article class="stat">
          <p class="stat__label">En negociacion</p>
          <p class="stat__value">${money(d.openValueCents)}</p>
          <p class="stat__note">${d.openDeals} oportunidades abiertas</p>
        </article>
        <article class="stat">
          <p class="stat__label">Proyeccion ponderada</p>
          <p class="stat__value">${money(d.weightedValueCents)}</p>
          <p class="stat__note">Ajustada por probabilidad de cierre</p>
        </article>
        <article class="stat">
          <p class="stat__label">Ganado (30 dias)</p>
          <p class="stat__value">${money(d.wonValueCents)}</p>
          <p class="stat__note">${d.wonDeals} cerradas, ${d.winRate}% de efectividad</p>
        </article>
        <article class="stat">
          <p class="stat__label">Seguimientos vencidos</p>
          <p class="stat__value">${d.tasksDue}</p>
          <p class="stat__note">${d.newContacts} contactos nuevos este mes</p>
        </article>
      </section>

      <section class="panels">
        <div class="panel">
          <header class="panel__head"><h2 class="panel__title">Valor por etapa</h2></header>
          <div class="panel__body">
            ${openStages.length ? `<div class="funnel">${openStages.map((s) => `
              <div class="funnel__row">
                <span class="funnel__name">${esc(s.name)}</span>
                <span class="funnel__bar" style="width:${Math.max(3, (s.total / max) * 100)}%"></span>
                <span class="funnel__val">${compactMoney(s.total)} · ${s.n}</span>
              </div>`).join('')}</div>`
              : emptyState({ icon: 'ph-kanban', title: 'Sin oportunidades abiertas',
                             text: 'Cuando registres la primera venta en curso, el embudo aparece aqui.' })}
          </div>
        </div>

        <div class="panel">
          <header class="panel__head"><h2 class="panel__title">Ultima actividad</h2></header>
          <div class="panel__body">
            ${d.activity.length ? `<div class="feed">${d.activity.map(activityRow).join('')}</div>`
              : emptyState({ icon: 'ph-clock-counter-clockwise', title: 'Todavia no hay movimiento',
                             text: 'Cada llamada, nota y cambio de etapa queda registrado en esta lista.' })}
          </div>
        </div>
      </section>`;
  });
}

const activityRow = (a) => `
  <div class="feed__item">
    <span class="avatar" style="background:${esc(a.avatar_color || 'var(--accent-soft)')};color:#fff">
      ${esc(initials(a.user_name))}
    </span>
    <div>
      <p class="feed__text">
        <i class="ph ${ACTIVITY_ICON[a.type] || 'ph-dot'}" aria-hidden="true"></i>
        ${esc(a.body || a.type)}
        ${a.deal_title ? ` <strong>${esc(a.deal_title)}</strong>` : ''}
      </p>
      <p class="feed__time">${esc(a.user_name || '')} · ${esc(relativeTime(a.created_at))}</p>
    </div>
  </div>`;

/* ============================================================== Embudo === */

async function renderBoard() {
  await withView(skeletonRows(3), async () => {
    const { stages, deals } = await store.board();
    if (!deals.length) {
      return emptyState({
        icon: 'ph-kanban',
        title: 'El embudo esta vacio',
        text: 'Crea la primera oportunidad y arrastrala entre etapas para seguir su avance.',
        action: '<button class="btn btn--primary" data-action="new-deal">Nueva oportunidad</button>',
      });
    }

    return `<div class="board" id="board">${stages.map((stage) => {
      const inStage = deals.filter((d) => d.stage_id === stage.id).sort((a, b) => a.position - b.position);
      const sum = inStage.reduce((s, d) => s + d.value_cents, 0);
      return `
        <section class="column" data-stage="${esc(stage.id)}">
          <header class="column__head">
            <h2 class="column__name">${esc(stage.name)}</h2>
            <span class="column__count">${inStage.length}</span>
            <span class="column__sum">${compactMoney(sum)}</span>
          </header>
          <div class="column__list">${inStage.map(dealCard).join('')}</div>
        </section>`;
    }).join('')}</div>`;
  });

  wireBoard();
}

const dealCard = (d) => `
  <article class="deal" draggable="true" data-deal="${esc(d.id)}" tabindex="0"
           aria-label="${esc(d.title)}, ${esc(money(d.value_cents))}">
    <h3 class="deal__title">${esc(d.title)}</h3>
    <p class="deal__meta">
      <i class="ph ph-buildings" aria-hidden="true"></i>
      ${esc(d.company_name || fullName(d.first_name, d.last_name))}
    </p>
    <div class="deal__foot">
      <span class="deal__value">${esc(money(d.value_cents))}</span>
      ${d.expected_close_date
        ? `<span class="badge${isOverdue(d.expected_close_date) && d.status === 'open' ? ' badge--warn' : ''}">
             ${esc(relativeDay(d.expected_close_date))}</span>`
        : ''}
      <span class="avatar deal__owner" style="background:${esc(d.avatar_color || 'var(--accent-soft)')};color:#fff"
            title="${esc(d.owner_name || '')}">${esc(initials(d.owner_name))}</span>
    </div>
  </article>`;

function wireBoard() {
  const board = el('#board');
  if (!board) {
    const btn = el('[data-action="new-deal"]');
    if (btn) btn.addEventListener('click', () => openCreateModal('deal'));
    return;
  }

  let dragged = null;

  board.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.deal');
    if (!card) return;
    dragged = card;
    card.dataset.dragging = 'true';
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.dataset.deal);
  });

  board.addEventListener('dragend', () => {
    if (dragged) delete dragged.dataset.dragging;
    els('.column', board).forEach((c) => delete c.dataset.over);
    dragged = null;
  });

  board.addEventListener('dragover', (e) => {
    const column = e.target.closest('.column');
    if (!column) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    els('.column', board).forEach((c) => delete c.dataset.over);
    column.dataset.over = 'true';
  });

  board.addEventListener('drop', async (e) => {
    const column = e.target.closest('.column');
    if (!column || !dragged) return;
    e.preventDefault();
    const dealId = dragged.dataset.deal;
    const stageId = column.dataset.stage;
    delete column.dataset.over;

    // Movimiento optimista: la tarjeta salta ya, la escritura ocurre despues.
    column.querySelector('.column__list').appendChild(dragged);
    try {
      const res = await store.moveDeal(dealId, stageId, 0);
      if (res.status === 'won') toast('Oportunidad marcada como ganada.');
      else if (res.status === 'lost') toast('Oportunidad marcada como perdida.');
      renderBoard();
    } catch (err) {
      toast(err.message || 'No se pudo mover la oportunidad.', { error: true });
      renderBoard();
    }
  });

  // Alternativa de teclado: mover con las flechas izquierda y derecha.
  board.addEventListener('keydown', async (e) => {
    const card = e.target.closest('.deal');
    if (!card || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
    e.preventDefault();
    const columns = els('.column', board);
    const index = columns.findIndex((c) => c.contains(card));
    const target = columns[index + (e.key === 'ArrowRight' ? 1 : -1)];
    if (!target) return;
    await store.moveDeal(card.dataset.deal, target.dataset.stage, 0);
    await renderBoard();
    const moved = el(`[data-deal="${card.dataset.deal}"]`);
    if (moved) moved.focus();
  });

  board.addEventListener('click', (e) => {
    const card = e.target.closest('.deal');
    if (card) openDealDetail(card.dataset.deal);
  });
}

/* =========================================================== Contactos === */

async function renderContacts() {
  await withView(skeletonRows(8), async () => {
    const { contacts } = await store.contacts({ q: state.search });
    if (!contacts.length) {
      return emptyState({
        icon: 'ph-users',
        title: state.search ? 'Ningun contacto coincide' : 'Aun no hay contactos',
        text: state.search
          ? 'Prueba con parte del nombre, el correo o el telefono.'
          : 'Registra a la primera persona y su historial empieza a construirse solo.',
        action: state.search ? '' : '<button class="btn btn--primary" data-action="new-contact">Nuevo contacto</button>',
      });
    }

    return `
      <div class="tablewrap">
        <table class="table">
          <thead>
            <tr>
              <th>Contacto</th><th>Empresa</th><th>Telefono</th>
              <th>Estado</th><th>Origen</th><th>Ultimo cambio</th>
            </tr>
          </thead>
          <tbody>${contacts.map((c) => `
            <tr data-contact="${esc(c.id)}">
              <td>
                <div class="cell-person">
                  <span class="avatar">${esc(initials(fullName(c.first_name, c.last_name)))}</span>
                  <div>
                    <div class="cell-person__name">${esc(fullName(c.first_name, c.last_name))}</div>
                    <div class="cell-person__sub">${esc(c.email || c.title || 'Sin correo')}</div>
                  </div>
                </div>
              </td>
              <td>${esc(c.company_name || 'Sin empresa')}</td>
              <td class="mono">${esc(c.phone || '')}</td>
              <td><span class="badge ${STATUS_CLASS[c.status] || ''}">${esc(STATUS_LABEL[c.status] || c.status)}</span></td>
              <td>${esc(c.source || '')}</td>
              <td>${esc(relativeTime(c.updated_at))}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  });
}

/* ============================================================ Empresas === */

async function renderCompanies() {
  await withView(skeletonRows(6), async () => {
    const { companies } = await store.companies({ q: state.search });
    if (!companies.length) {
      return emptyState({
        icon: 'ph-buildings',
        title: 'Sin empresas registradas',
        text: 'Agrupa a tus contactos por empresa para ver todo el historial de una cuenta junto.',
      });
    }

    return `
      <div class="tablewrap">
        <table class="table">
          <thead>
            <tr><th>Empresa</th><th>Sector</th><th>Tamano</th><th>Ciudad</th><th class="num">Contactos</th></tr>
          </thead>
          <tbody>${companies.map((c) => `
            <tr>
              <td>
                <div class="cell-person">
                  <span class="avatar">${esc(initials(c.name))}</span>
                  <div>
                    <div class="cell-person__name">${esc(c.name)}</div>
                    <div class="cell-person__sub">${esc(c.domain || 'Sin sitio web')}</div>
                  </div>
                </div>
              </td>
              <td>${esc(c.industry || '')}</td>
              <td>${esc(c.size || '')}</td>
              <td>${esc(c.city || '')}</td>
              <td class="num">${esc(c.contact_count ?? 0)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  });
}

/* ============================================================== Tareas === */

async function renderTasks() {
  await withView(skeletonRows(6), async () => {
    const { tasks } = await store.tasks({ status: state.taskFilter });
    const filters = [['open', 'Pendientes'], ['done', 'Hechas'], ['all', 'Todas']];

    const bar = `
      <div style="display:flex;gap:var(--sp-2);align-items:center">
        ${filters.map(([key, label]) => `
          <button class="btn btn--sm ${state.taskFilter === key ? 'btn--outline' : ''}"
                  data-filter="${key}" aria-pressed="${state.taskFilter === key}">${label}</button>`).join('')}
      </div>`;

    if (!tasks.length) {
      return bar + emptyState({
        icon: 'ph-check-circle',
        title: state.taskFilter === 'open' ? 'No queda nada pendiente' : 'Nada que mostrar',
        text: 'Los seguimientos con fecha aparecen aqui ordenados por urgencia.',
        action: '<button class="btn btn--primary" data-action="new-task">Nueva tarea</button>',
      });
    }

    return bar + `
      <div class="tasklist">${tasks.map((t) => `
        <div class="task" data-task="${esc(t.id)}" data-done="${t.status === 'done'}">
          <button class="task__check" role="checkbox" aria-checked="${t.status === 'done'}"
                  aria-label="Marcar ${esc(t.title)}"><i class="ph ph-check" style="font-size:12px"></i></button>
          <div class="task__body">
            <p class="task__title">${esc(t.title)}</p>
            <p class="task__meta">
              <span class="${isOverdue(t.due_at) && t.status === 'open' ? 'task__due--late' : ''}">
                <i class="ph ph-calendar-blank" aria-hidden="true"></i> ${esc(relativeDay(t.due_at))}
              </span>
              ${t.deal_title ? `<span><i class="ph ph-target" aria-hidden="true"></i> ${esc(t.deal_title)}</span>` : ''}
              ${t.first_name ? `<span><i class="ph ph-user" aria-hidden="true"></i> ${esc(fullName(t.first_name, t.last_name))}</span>` : ''}
              ${t.priority === 'alta' ? '<span class="badge badge--warn">Prioridad alta</span>' : ''}
            </p>
          </div>
          <span class="avatar" style="background:${esc(t.avatar_color || 'var(--accent-soft)')};color:#fff"
                title="${esc(t.assignee_name || '')}">${esc(initials(t.assignee_name))}</span>
        </div>`).join('')}
      </div>`;
  });
}

/* ====================================================== Panel de detalle = */

async function openContactDetail(id) {
  const drawer = el('#drawer');
  const overlay = el('#overlay');
  drawer.innerHTML = '<div class="drawer__body">' + skeletonRows(3) + '</div>';
  state.closeLayer = openLayer(drawer, overlay, () => { drawer.innerHTML = ''; });

  try {
    const { contact, deals, activities, tasks } = await store.contact(id);
    const name = fullName(contact.first_name, contact.last_name);

    drawer.innerHTML = `
      <header class="drawer__head">
        <span class="avatar avatar--lg">${esc(initials(name))}</span>
        <div style="flex:1;min-width:0">
          <h2 class="drawer__title">${esc(name)}</h2>
          <p class="drawer__sub">${esc(contact.title || 'Sin cargo')} · ${esc(contact.company_name || 'Sin empresa')}</p>
        </div>
        <button class="btn btn--icon" data-close aria-label="Cerrar"><i class="ph ph-x"></i></button>
      </header>

      <div class="drawer__body">
        <section>
          <dl class="deflist">
            <dt>Estado</dt>
            <dd><span class="badge ${STATUS_CLASS[contact.status] || ''}">${esc(STATUS_LABEL[contact.status] || contact.status)}</span></dd>
            <dt>Correo</dt><dd>${contact.email ? `<a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a>` : 'Sin correo'}</dd>
            <dt>Telefono</dt><dd class="mono">${esc(contact.phone || 'Sin telefono')}</dd>
            <dt>Origen</dt><dd>${esc(contact.source || 'Sin registrar')}</dd>
            <dt>Alta</dt><dd>${esc(longDate(contact.created_at))}</dd>
          </dl>
        </section>

        <section>
          <p class="section-label">Oportunidades</p>
          ${deals.length ? `<div class="tasklist" style="margin-top:var(--sp-3)">${deals.map((d) => `
            <div class="task">
              <div class="task__body">
                <p class="task__title">${esc(d.title)}</p>
                <p class="task__meta">
                  <span class="mono">${esc(money(d.value_cents))}</span>
                  <span class="badge ${d.status === 'won' ? 'badge--won' : d.status === 'lost' ? 'badge--lost' : ''}">
                    ${esc(d.stage_name || '')}</span>
                </p>
              </div>
            </div>`).join('')}</div>`
            : '<p class="field__help" style="margin-top:var(--sp-2)">Sin oportunidades asociadas.</p>'}
        </section>

        <section>
          <p class="section-label">Tareas</p>
          ${tasks.length ? `<ul style="margin-top:var(--sp-3);display:flex;flex-direction:column;gap:var(--sp-2)">
            ${tasks.map((t) => `<li class="task__meta">
              <i class="ph ${t.status === 'done' ? 'ph-check-circle' : 'ph-circle'}"></i>
              ${esc(t.title)} · ${esc(relativeDay(t.due_at))}</li>`).join('')}
          </ul>` : '<p class="field__help" style="margin-top:var(--sp-2)">Sin tareas pendientes.</p>'}
        </section>

        <section>
          <p class="section-label">Historial</p>
          <div class="feed" style="margin-top:var(--sp-3)">
            ${activities.length ? activities.map(activityRow).join('')
              : '<p class="field__help">Todavia no hay actividad registrada.</p>'}
          </div>
        </section>

        <section class="field">
          <label class="field__label" for="noteInput">Agregar nota</label>
          <textarea class="textarea" id="noteInput" placeholder="Que se hablo, que quedo pendiente"></textarea>
          <p class="field__help">La nota queda con tu nombre y la hora en el historial.</p>
        </section>
      </div>

      <footer class="drawer__foot">
        <button class="btn btn--primary" data-save-note>Guardar nota</button>
        <button class="btn btn--outline" data-close>Cerrar</button>
      </footer>`;

    els('[data-close]', drawer).forEach((b) => b.addEventListener('click', () => state.closeLayer()));
    el('[data-save-note]', drawer).addEventListener('click', async () => {
      const text = el('#noteInput', drawer).value.trim();
      if (!text) return toast('Escribe la nota antes de guardar.', { error: true });
      await store.addNote(text, { contactId: id });
      state.closeLayer();
      toast('Nota guardada en el historial.');
      if (state.route === 'panel') renderDashboard();
    });
  } catch (err) {
    drawer.innerHTML = `<div class="drawer__body">${errorState(err.message)}</div>`;
  }
}

async function openDealDetail(dealId) {
  const { deals } = await store.board();
  const deal = deals.find((d) => d.id === dealId);
  if (deal && deal.contact_id) return openContactDetail(deal.contact_id);
  toast('Esta oportunidad no tiene contacto asociado.', { error: true });
}

/* =========================================================== Alta rapida = */

function openCreateModal(preset) {
  const modal = el('#modal');
  const overlay = el('#overlay');
  const kind = preset || (state.route === 'embudo' ? 'deal' : state.route === 'tareas' ? 'task' : 'contact');

  modal.innerHTML = `
    <header class="modal__head"><h2 class="modal__title">Crear</h2></header>
    <div class="modal__body">
      <div class="field">
        <label class="field__label" for="kind">Que quieres crear</label>
        <select class="select" id="kind">
          <option value="contact" ${kind === 'contact' ? 'selected' : ''}>Contacto</option>
          <option value="deal" ${kind === 'deal' ? 'selected' : ''}>Oportunidad</option>
          <option value="task" ${kind === 'task' ? 'selected' : ''}>Tarea</option>
        </select>
      </div>
      <div id="formSlot"></div>
    </div>
    <footer class="modal__foot">
      <button class="btn btn--outline" data-close>Cancelar</button>
      <button class="btn btn--primary" data-submit>Crear</button>
    </footer>`;

  state.closeLayer = openLayer(modal, overlay, () => { modal.innerHTML = ''; });

  const slot = el('#formSlot', modal);
  const paint = async () => { slot.innerHTML = await formFor(el('#kind', modal).value); };
  el('#kind', modal).addEventListener('change', paint);
  paint();

  el('[data-close]', modal).addEventListener('click', () => state.closeLayer());
  el('[data-submit]', modal).addEventListener('click', () => submitCreate(el('#kind', modal).value, modal));
}

async function formFor(kind) {
  if (kind === 'contact') {
    const { companies } = await store.companies();
    return `
      <div class="field--inline">
        <div class="field">
          <label class="field__label" for="firstName">Nombre</label>
          <input class="input" id="firstName" required>
        </div>
        <div class="field">
          <label class="field__label" for="lastName">Apellido</label>
          <input class="input" id="lastName">
        </div>
      </div>
      <div class="field">
        <label class="field__label" for="companyId">Empresa</label>
        <select class="select" id="companyId">
          <option value="">Sin empresa</option>
          ${companies.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field--inline">
        <div class="field">
          <label class="field__label" for="email">Correo</label>
          <input class="input" id="email" type="email">
        </div>
        <div class="field">
          <label class="field__label" for="phone">Telefono</label>
          <input class="input" id="phone" inputmode="tel" placeholder="+507 6000-0000">
        </div>
      </div>
      <div class="field">
        <label class="field__label" for="status">Estado</label>
        <select class="select" id="status">
          ${Object.entries(STATUS_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
        </select>
      </div>`;
  }

  if (kind === 'deal') {
    const [{ stages }, { contacts }] = await Promise.all([store.board(), store.contacts()]);
    return `
      <div class="field">
        <label class="field__label" for="title">Titulo</label>
        <input class="input" id="title" placeholder="Rediseno de tienda en linea" required>
      </div>
      <div class="field--inline">
        <div class="field">
          <label class="field__label" for="value">Valor en dolares</label>
          <input class="input" id="value" type="number" min="0" step="1" placeholder="1500">
        </div>
        <div class="field">
          <label class="field__label" for="stageId">Etapa</label>
          <select class="select" id="stageId">
            ${stages.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field">
        <label class="field__label" for="contactId">Contacto</label>
        <select class="select" id="contactId">
          <option value="">Sin contacto</option>
          ${contacts.map((c) => `<option value="${esc(c.id)}">${esc(fullName(c.first_name, c.last_name))}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label class="field__label" for="closeDate">Cierre estimado</label>
        <input class="input" id="closeDate" type="date">
      </div>`;
  }

  const { contacts } = await store.contacts();
  return `
    <div class="field">
      <label class="field__label" for="title">Que hay que hacer</label>
      <input class="input" id="title" placeholder="Llamar para confirmar la propuesta" required>
    </div>
    <div class="field--inline">
      <div class="field">
        <label class="field__label" for="dueAt">Fecha limite</label>
        <input class="input" id="dueAt" type="date">
      </div>
      <div class="field">
        <label class="field__label" for="priority">Prioridad</label>
        <select class="select" id="priority">
          ${Object.entries(PRIORITY_LABEL).map(([k, v]) => `<option value="${k}" ${k === 'normal' ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field">
      <label class="field__label" for="contactId">Contacto</label>
      <select class="select" id="contactId">
        <option value="">Sin contacto</option>
        ${contacts.map((c) => `<option value="${esc(c.id)}">${esc(fullName(c.first_name, c.last_name))}</option>`).join('')}
      </select>
    </div>`;
}

async function submitCreate(kind, modal) {
  const value = (id) => { const node = el(`#${id}`, modal); return node ? node.value.trim() : ''; };

  try {
    if (kind === 'contact') {
      if (!value('firstName')) return toast('El nombre es obligatorio.', { error: true });
      await store.createContact({
        firstName: value('firstName'), lastName: value('lastName'),
        companyId: value('companyId') || null, email: value('email') || null,
        phone: value('phone') || null, status: value('status') || 'lead',
      });
      toast('Contacto creado.');
      state.closeLayer();
      return state.route === 'contactos' ? renderContacts() : route();
    }

    if (kind === 'deal') {
      if (!value('title')) return toast('El titulo es obligatorio.', { error: true });
      await store.createDeal({
        title: value('title'),
        valueCents: Math.round(Number(value('value') || 0) * 100),
        stageId: value('stageId'),
        contactId: value('contactId') || null,
        expectedCloseDate: value('closeDate') || null,
      });
      toast('Oportunidad creada.');
      state.closeLayer();
      return state.route === 'embudo' ? renderBoard() : route();
    }

    if (!value('title')) return toast('Escribe que hay que hacer.', { error: true });
    await store.createTask({
      title: value('title'),
      dueAt: value('dueAt') ? new Date(`${value('dueAt')}T09:00:00`).toISOString() : null,
      priority: value('priority') || 'normal',
      contactId: value('contactId') || null,
    });
    toast('Tarea creada.');
    state.closeLayer();
    return state.route === 'tareas' ? renderTasks() : route();
  } catch (err) {
    toast(err.message || 'No se pudo crear.', { error: true });
  }
}

/* ============================================================= Arranque == */

try {
  const saved = localStorage.getItem('nexo.theme');
  if (saved) document.documentElement.dataset.theme = saved;
} catch { /* sin persistencia de tema */ }

boot();
