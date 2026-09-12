/**
 * NEXO CRM - Capa de datos
 * ---------------------------------------------------------------------------
 * Una sola interfaz, dos motores intercambiables:
 *
 *   modo "demo"  -> todo en el navegador (localStorage). Sin cuenta, sin API.
 *                   Es lo que ve un prospecto en la demostracion publica.
 *   modo "api"   -> Cloudflare Worker + D1. Es el producto real con login.
 *
 * La interfaz publica es identica en los dos modos, asi la interfaz de usuario
 * no sabe ni le importa cual esta activo.
 */

import { buildDemoData } from './seed.js';

const STORAGE_KEY = 'nexo.demo.v1';
const DAY = 86400000;

const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
const nowIso = () => new Date().toISOString();

/* ========================================================== Motor demo === */

class DemoStore {
  constructor() {
    this.mode = 'demo';
    this.data = this.#load();
  }

  #load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.deals && parsed.contacts) return parsed;
      }
    } catch {
      /* localStorage bloqueado o corrupto: seguimos con datos frescos */
    }
    return buildDemoData();
  }

  #save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      /* modo incognito o cuota llena: la demo sigue funcionando en memoria */
    }
  }

  reset() {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* sin persistencia */ }
    this.data = buildDemoData();
    return Promise.resolve(true);
  }

  async me() {
    return { user: this.data.user, org: this.data.org, users: this.data.users };
  }

  async dashboard() {
    const { deals, tasks, activities, contacts, stages } = this.data;
    const since = Date.now() - 30 * DAY;

    const open = deals.filter((d) => d.status === 'open');
    const won = deals.filter((d) => d.status === 'won' && new Date(d.closed_at).getTime() >= since);
    const lost = deals.filter((d) => d.status === 'lost' && new Date(d.closed_at).getTime() >= since);
    const closed = won.length + lost.length;

    return {
      openDeals: open.length,
      openValueCents: open.reduce((s, d) => s + d.value_cents, 0),
      weightedValueCents: Math.round(open.reduce((s, d) => s + (d.value_cents * d.probability) / 100, 0)),
      wonDeals: won.length,
      wonValueCents: won.reduce((s, d) => s + d.value_cents, 0),
      lostDeals: lost.length,
      winRate: closed ? Math.round((won.length / closed) * 100) : 0,
      tasksDue: tasks.filter((t) => t.status === 'open' && new Date(t.due_at) <= new Date()).length,
      newContacts: contacts.filter((c) => new Date(c.created_at).getTime() >= since).length,
      byStage: stages.map((s) => {
        const inStage = open.filter((d) => d.stage_id === s.id);
        return { id: s.id, name: s.name, kind: s.kind, position: s.position,
                 n: inStage.length, total: inStage.reduce((sum, d) => sum + d.value_cents, 0) };
      }),
      activity: [...activities].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 12),
    };
  }

  async contacts({ q = '', status = '' } = {}) {
    const needle = q.trim().toLowerCase();
    const list = this.data.contacts.filter((c) => {
      if (status && c.status !== status) return false;
      if (!needle) return true;
      return [c.first_name, c.last_name, c.email, c.phone, c.company_name]
        .filter(Boolean).some((v) => v.toLowerCase().includes(needle));
    });
    return { contacts: list.sort((a, b) => b.updated_at.localeCompare(a.updated_at)) };
  }

  async contact(id) {
    const contact = this.data.contacts.find((c) => c.id === id);
    if (!contact) throw new Error('Contacto no encontrado.');
    return {
      contact,
      deals: this.data.deals
        .filter((d) => d.contact_id === id)
        .map((d) => ({ ...d, stage_name: (this.data.stages.find((s) => s.id === d.stage_id) || {}).name })),
      activities: this.data.activities.filter((a) => a.contact_id === id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
      tasks: this.data.tasks.filter((t) => t.contact_id === id),
    };
  }

  async createContact(input) {
    const company = this.data.companies.find((c) => c.id === input.companyId);
    const contact = {
      id: uid('k'),
      company_id: input.companyId || null,
      company_name: company ? company.name : null,
      first_name: input.firstName,
      last_name: input.lastName || '',
      email: input.email || null,
      phone: input.phone || null,
      title: input.title || null,
      source: input.source || null,
      status: input.status || 'lead',
      notes: input.notes || null,
      owner_id: this.data.user.id,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    this.data.contacts.unshift(contact);
    this.#pushActivity({ type: 'creado', body: 'Contacto creado', contactId: contact.id });
    this.#save();
    return { contact };
  }

  async updateContact(id, patch) {
    const contact = this.data.contacts.find((c) => c.id === id);
    if (!contact) throw new Error('Contacto no encontrado.');
    const map = { firstName: 'first_name', lastName: 'last_name', email: 'email', phone: 'phone',
                  title: 'title', source: 'source', status: 'status', notes: 'notes', companyId: 'company_id' };
    for (const [key, col] of Object.entries(map)) {
      if (key in patch) contact[col] = patch[key] || null;
    }
    if ('companyId' in patch) {
      const company = this.data.companies.find((c) => c.id === patch.companyId);
      contact.company_name = company ? company.name : null;
    }
    contact.updated_at = nowIso();
    this.#save();
    return { contact };
  }

  async companies({ q = '' } = {}) {
    const needle = q.trim().toLowerCase();
    const list = this.data.companies.filter((c) =>
      !needle || [c.name, c.domain, c.industry, c.city].filter(Boolean).some((v) => v.toLowerCase().includes(needle))
    );
    return { companies: list.sort((a, b) => a.name.localeCompare(b.name, 'es')) };
  }

  async board() {
    return {
      pipelineId: 'p1',
      pipelines: this.data.pipelines,
      stages: [...this.data.stages].sort((a, b) => a.position - b.position),
      deals: [...this.data.deals].sort((a, b) => a.position - b.position),
    };
  }

  async createDeal(input) {
    const stage = this.data.stages.find((s) => s.id === input.stageId) || this.data.stages[0];
    const contact = this.data.contacts.find((c) => c.id === input.contactId);
    const company = this.data.companies.find((c) => c.id === input.companyId)
      || (contact ? this.data.companies.find((c) => c.id === contact.company_id) : null);
    const owner = this.data.user;
    const status = stage.kind === 'won' ? 'won' : stage.kind === 'lost' ? 'lost' : 'open';

    const deal = {
      id: uid('d'),
      title: input.title,
      pipeline_id: 'p1',
      stage_id: stage.id,
      company_id: company ? company.id : null,
      company_name: company ? company.name : null,
      contact_id: contact ? contact.id : null,
      first_name: contact ? contact.first_name : null,
      last_name: contact ? contact.last_name : null,
      value_cents: input.valueCents || 0,
      currency: this.data.org.currency,
      probability: stage.probability,
      expected_close_date: input.expectedCloseDate || null,
      status,
      lost_reason: null,
      position: 0,
      owner_id: owner.id,
      owner_name: owner.name,
      avatar_color: owner.avatarColor,
      closed_at: status === 'open' ? null : nowIso(),
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    this.data.deals.unshift(deal);
    this.#pushActivity({ type: 'creado', body: 'Oportunidad creada', dealId: deal.id, contactId: deal.contact_id });
    this.#save();
    return { deal };
  }

  async moveDeal(id, stageId, position = 0) {
    const deal = this.data.deals.find((d) => d.id === id);
    const stage = this.data.stages.find((s) => s.id === stageId);
    if (!deal || !stage) throw new Error('No se pudo mover la oportunidad.');

    const status = stage.kind === 'won' ? 'won' : stage.kind === 'lost' ? 'lost' : 'open';
    deal.stage_id = stageId;
    deal.position = position;
    deal.status = status;
    deal.probability = stage.probability;
    deal.closed_at = status === 'open' ? null : nowIso();
    deal.updated_at = nowIso();

    // Renumerar la columna destino para que el orden sobreviva a la recarga.
    this.data.deals
      .filter((d) => d.stage_id === stageId && d.id !== id)
      .sort((a, b) => a.position - b.position)
      .forEach((d, i) => { d.position = i >= position ? i + 1 : i; });

    const type = status === 'won' ? 'ganado' : status === 'lost' ? 'perdido' : 'etapa';
    this.#pushActivity({ type, body: `Movida a ${stage.name}`, dealId: id, contactId: deal.contact_id });
    this.#save();
    return { ok: true, status };
  }

  async deleteDeal(id) {
    this.data.deals = this.data.deals.filter((d) => d.id !== id);
    this.data.tasks = this.data.tasks.filter((t) => t.deal_id !== id);
    this.#save();
    return { ok: true };
  }

  async tasks({ status = 'open' } = {}) {
    const list = this.data.tasks.filter((t) => status === 'all' || t.status === status);
    return {
      tasks: list.sort((a, b) => {
        if (!a.due_at) return 1;
        if (!b.due_at) return -1;
        return a.due_at.localeCompare(b.due_at);
      }),
    };
  }

  async createTask(input) {
    const contact = this.data.contacts.find((c) => c.id === input.contactId);
    const deal = this.data.deals.find((d) => d.id === input.dealId);
    const assignee = this.data.user;
    const task = {
      id: uid('t'),
      title: input.title,
      notes: input.notes || null,
      due_at: input.dueAt || null,
      priority: input.priority || 'normal',
      status: 'open',
      assignee_id: assignee.id,
      assignee_name: assignee.name,
      avatar_color: assignee.avatarColor,
      contact_id: contact ? contact.id : null,
      first_name: contact ? contact.first_name : null,
      last_name: contact ? contact.last_name : null,
      deal_id: deal ? deal.id : null,
      deal_title: deal ? deal.title : null,
      completed_at: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    this.data.tasks.unshift(task);
    this.#save();
    return { task };
  }

  async updateTask(id, patch) {
    const task = this.data.tasks.find((t) => t.id === id);
    if (!task) throw new Error('Tarea no encontrada.');
    if ('status' in patch) {
      task.status = patch.status;
      task.completed_at = patch.status === 'done' ? nowIso() : null;
    }
    for (const key of ['title', 'notes', 'priority']) if (key in patch) task[key] = patch[key];
    if ('dueAt' in patch) task.due_at = patch.dueAt;
    task.updated_at = nowIso();
    this.#save();
    return { task };
  }

  async addNote(text, { contactId = null, dealId = null } = {}) {
    this.#pushActivity({ type: 'nota', body: text, contactId, dealId });
    this.#save();
    return { ok: true };
  }

  #pushActivity({ type, body, contactId = null, dealId = null }) {
    const contact = this.data.contacts.find((c) => c.id === contactId);
    const deal = this.data.deals.find((d) => d.id === dealId);
    this.data.activities.unshift({
      id: uid('a'), type, body,
      contact_id: contactId,
      first_name: contact ? contact.first_name : null,
      last_name: contact ? contact.last_name : null,
      deal_id: dealId,
      deal_title: deal ? deal.title : null,
      user_id: this.data.user.id,
      user_name: this.data.user.name,
      avatar_color: this.data.user.avatarColor,
      created_at: nowIso(),
    });
  }
}

/* =========================================================== Motor API === */

class ApiStore {
  constructor(baseUrl) {
    this.mode = 'api';
    this.base = baseUrl.replace(/\/$/, '');
  }

  async #req(path, { method = 'GET', body } = {}) {
    const res = await fetch(`${this.base}${path}`, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(payload.message || 'No se pudo completar la operacion.');
      err.code = payload.error;
      err.status = res.status;
      throw err;
    }
    return payload;
  }

  login(email, password)  { return this.#req('/api/auth/login', { method: 'POST', body: { email, password } }); }
  logout()                { return this.#req('/api/auth/logout', { method: 'POST' }); }
  signup(input)           { return this.#req('/api/auth/signup', { method: 'POST', body: input }); }

  me()                    { return this.#req('/api/me'); }
  dashboard()             { return this.#req('/api/dashboard'); }

  contacts({ q = '', status = '' } = {}) {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (status) p.set('status', status);
    return this.#req(`/api/contacts?${p}`);
  }
  contact(id)                  { return this.#req(`/api/contacts/${id}`); }
  createContact(body)          { return this.#req('/api/contacts', { method: 'POST', body }); }
  updateContact(id, body)      { return this.#req(`/api/contacts/${id}`, { method: 'PATCH', body }); }

  companies({ q = '' } = {})   { return this.#req(`/api/companies?${new URLSearchParams(q ? { q } : {})}`); }

  board()                      { return this.#req('/api/board'); }
  createDeal(body)             { return this.#req('/api/deals', { method: 'POST', body }); }
  moveDeal(id, stageId, position = 0) {
    return this.#req(`/api/deals/${id}/stage`, { method: 'PATCH', body: { stageId, position } });
  }
  deleteDeal(id)               { return this.#req(`/api/deals/${id}`, { method: 'DELETE' }); }

  tasks({ status = 'open' } = {}) { return this.#req(`/api/tasks?status=${status}`); }
  createTask(body)             { return this.#req('/api/tasks', { method: 'POST', body }); }
  updateTask(id, body)         { return this.#req(`/api/tasks/${id}`, { method: 'PATCH', body }); }
}

/* ============================================================== Fabrica === */

/**
 * Elige el motor. Por defecto, demostracion.
 * Para conectar el producto real: window.NEXO_API = 'https://api.tudominio.com'
 * antes de cargar la aplicacion.
 */
export function createStore() {
  const apiBase = typeof window !== 'undefined' ? window.NEXO_API : null;
  return apiBase ? new ApiStore(apiBase) : new DemoStore();
}
