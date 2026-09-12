/**
 * NEXO CRM - API (Cloudflare Worker + D1)
 * ---------------------------------------------------------------------------
 * Principios no negociables de este archivo:
 *  1. El org_id SIEMPRE sale de la sesion del servidor. Nunca del cliente.
 *  2. Ninguna consulta de negocio se escribe sin `WHERE org_id = ?`.
 *  3. Contrasenas con PBKDF2-SHA256, nunca en texto plano, nunca reversibles.
 *  4. Las IP se guardan hasheadas (SHA-256), nunca crudas.
 *  5. CORS limitado al dominio de produccion declarado en la variable de entorno.
 *
 * Bindings esperados (wrangler.toml):
 *   DB          -> D1 Database
 *   RATE        -> KV Namespace (rate limiting)
 *   ALLOWED_ORIGIN -> "https://tudominio.com" (coma-separado si son varios)
 */

const SESSION_COOKIE = 'nexo_session';
const SESSION_DAYS = 14;
const PBKDF2_ITERATIONS = 210000;

// ===========================================================================
// Utilidades
// ===========================================================================

const enc = new TextEncoder();

function uid(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

function nowIso() {
  return new Date().toISOString();
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password, saltHex) {
  const salt = saltHex
    ? Uint8Array.from(saltHex.match(/.{2}/g).map((h) => parseInt(h, 16)))
    : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256
  );
  return { hash: toHex(bits), salt: toHex(salt) };
}

/** Comparacion en tiempo constante: evita filtrar informacion por el tiempo de respuesta. */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'org';
}

// ===========================================================================
// HTTP helpers
// ===========================================================================

function corsHeaders(request, env) {
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = request.headers.get('Origin') || '';
  const headers = {
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };
  if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(data, init = {}, request = null, env = null) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(request && env ? corsHeaders(request, env) : {}),
    ...(init.headers || {}),
  };
  return new Response(JSON.stringify(data), { status: init.status || 200, headers });
}

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const bad = (msg) => new ApiError(400, 'bad_request', msg);
const unauth = () => new ApiError(401, 'unauthorized', 'Sesion no valida o expirada.');
const forbidden = () => new ApiError(403, 'forbidden', 'No tienes permiso para esta accion.');
const notFound = (what) => new ApiError(404, 'not_found', `${what} no encontrado.`);

function readCookie(request, name) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function sessionCookie(token, maxAgeSeconds) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

async function clientIpHash(request) {
  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  return sha256Hex(`nexo:${ip}`);
}

/** Rate limit por ventana fija. Devuelve true si la peticion debe bloquearse. */
async function rateLimited(env, key, limit, windowSeconds) {
  if (!env.RATE) return false; // sin KV configurado, no bloquea (dev local)
  const bucket = `${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
  const current = parseInt((await env.RATE.get(bucket)) || '0', 10);
  if (current >= limit) return true;
  await env.RATE.put(bucket, String(current + 1), { expirationTtl: windowSeconds * 2 });
  return false;
}

// ===========================================================================
// Autenticacion / contexto de tenant
// ===========================================================================

/**
 * Resuelve la sesion y devuelve { org, user }.
 * Este es el UNICO lugar donde nace el org_id. Todo lo demas lo recibe de aqui.
 */
async function requireAuth(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) throw unauth();

  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT s.org_id, s.user_id, s.expires_at,
            u.name AS user_name, u.email AS user_email, u.role, u.avatar_color, u.status AS user_status,
            o.name AS org_name, o.slug, o.plan, o.currency, o.locale, o.status AS org_status
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN orgs  o ON o.id = s.org_id
      WHERE s.token_hash = ?`
  ).bind(tokenHash).first();

  if (!row) throw unauth();
  if (new Date(row.expires_at) < new Date()) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
    throw unauth();
  }
  if (row.user_status !== 'active') throw forbidden();
  if (row.org_status === 'suspended') {
    throw new ApiError(402, 'org_suspended', 'La cuenta esta suspendida. Contacta a soporte.');
  }

  return {
    orgId: row.org_id,
    user: {
      id: row.user_id,
      name: row.user_name,
      email: row.user_email,
      role: row.role,
      avatarColor: row.avatar_color,
    },
    org: {
      id: row.org_id,
      name: row.org_name,
      slug: row.slug,
      plan: row.plan,
      currency: row.currency,
      locale: row.locale,
    },
  };
}

function requireRole(ctx, ...roles) {
  if (!roles.includes(ctx.user.role)) throw forbidden();
}

async function audit(env, ctx, action, targetType, targetId, meta = {}, ipHash = null) {
  await env.DB.prepare(
    `INSERT INTO audit_log (id, org_id, user_id, action, target_type, target_id, meta, ip_hash, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).bind(uid('aud'), ctx.orgId, ctx.user.id, action, targetType, targetId, JSON.stringify(meta), ipHash, nowIso()).run();
}

async function logActivity(env, ctx, { type, body, contactId = null, companyId = null, dealId = null }) {
  await env.DB.prepare(
    `INSERT INTO activities (id, org_id, type, body, contact_id, company_id, deal_id, user_id, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).bind(uid('act'), ctx.orgId, type, body, contactId, companyId, dealId, ctx.user.id, nowIso()).run();
}

// ===========================================================================
// Validacion
// ===========================================================================

function str(value, { max = 500, required = false, field = 'campo' } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw bad(`El campo "${field}" es obligatorio.`);
    return null;
  }
  const s = String(value).trim();
  if (s.length > max) throw bad(`El campo "${field}" excede ${max} caracteres.`);
  return s;
}

function oneOf(value, allowed, fallback, field) {
  if (value === undefined || value === null || value === '') return fallback;
  const s = String(value);
  if (!allowed.includes(s)) throw bad(`Valor no permitido para "${field}": ${s}`);
  return s;
}

function intOr(value, fallback, { min = -2147483648, max = 2147483647 } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) throw bad('Numero no valido.');
  return Math.min(max, Math.max(min, n));
}

function isEmail(value) {
  return typeof value === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(value);
}

function jsonField(value) {
  if (value === undefined || value === null) return '{}';
  if (typeof value === 'string') {
    try { JSON.parse(value); return value; } catch { throw bad('JSON no valido en campos a medida.'); }
  }
  return JSON.stringify(value);
}

// ===========================================================================
// Semilla de un tenant nuevo (pipeline por defecto)
// ===========================================================================

const DEFAULT_STAGES = [
  { name: 'Prospecto',   probability: 10,  kind: 'open' },
  { name: 'Contactado',  probability: 25,  kind: 'open' },
  { name: 'Propuesta',   probability: 50,  kind: 'open' },
  { name: 'Negociacion', probability: 75,  kind: 'open' },
  { name: 'Ganado',      probability: 100, kind: 'won'  },
  { name: 'Perdido',     probability: 0,   kind: 'lost' },
];

async function seedTenant(env, orgId) {
  const pipelineId = uid('pipe');
  const ts = nowIso();
  const stmts = [
    env.DB.prepare('INSERT INTO pipelines (id, org_id, name, is_default, created_at) VALUES (?,?,?,1,?)')
      .bind(pipelineId, orgId, 'Ventas', ts),
  ];
  DEFAULT_STAGES.forEach((s, i) => {
    stmts.push(
      env.DB.prepare(
        'INSERT INTO stages (id, org_id, pipeline_id, name, position, probability, kind, created_at) VALUES (?,?,?,?,?,?,?,?)'
      ).bind(uid('stg'), orgId, pipelineId, s.name, i, s.probability, s.kind, ts)
    );
  });
  await env.DB.batch(stmts);
  return pipelineId;
}

// ===========================================================================
// Handlers: autenticacion
// ===========================================================================

async function handleSignup(request, env) {
  const ipHash = await clientIpHash(request);
  if (await rateLimited(env, `signup:${ipHash}`, 5, 3600)) {
    throw new ApiError(429, 'rate_limited', 'Demasiados intentos. Intenta en una hora.');
  }

  const body = await request.json().catch(() => ({}));
  const orgName = str(body.orgName, { required: true, field: 'orgName', max: 120 });
  const name = str(body.name, { required: true, field: 'name', max: 120 });
  const email = str(body.email, { required: true, field: 'email', max: 200 });
  const password = String(body.password || '');

  if (!isEmail(email)) throw bad('El correo no tiene un formato valido.');
  if (password.length < 10) throw bad('La contrasena debe tener al menos 10 caracteres.');

  // slug unico
  let slug = slugify(orgName);
  const taken = await env.DB.prepare('SELECT 1 FROM orgs WHERE slug = ?').bind(slug).first();
  if (taken) slug = `${slug}-${crypto.randomUUID().slice(0, 6)}`;

  const orgId = uid('org');
  const userId = uid('usr');
  const ts = nowIso();
  const trialEnds = new Date(Date.now() + 14 * 864e5).toISOString();
  const { hash, salt } = await hashPassword(password);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO orgs (id, name, slug, plan, seats, currency, locale, timezone, status, trial_ends_at, created_at, updated_at)
       VALUES (?,?,?,'trial',3,'USD','es-PA','America/Panama','active',?,?,?)`
    ).bind(orgId, orgName, slug, trialEnds, ts, ts),
    env.DB.prepare(
      `INSERT INTO users (id, org_id, email, name, role, password_hash, password_salt, status, created_at, updated_at)
       VALUES (?,?,?,?,'owner',?,?,'active',?,?)`
    ).bind(userId, orgId, email.toLowerCase(), name, hash, salt, ts, ts),
  ]);

  await seedTenant(env, orgId);
  return startSession(request, env, orgId, userId, ipHash);
}

async function handleLogin(request, env) {
  const ipHash = await clientIpHash(request);
  if (await rateLimited(env, `login:${ipHash}`, 10, 900)) {
    throw new ApiError(429, 'rate_limited', 'Demasiados intentos. Espera 15 minutos.');
  }

  const body = await request.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  const user = await env.DB.prepare(
    `SELECT u.id, u.org_id, u.password_hash, u.password_salt, u.status
       FROM users u JOIN orgs o ON o.id = u.org_id
      WHERE lower(u.email) = ? AND o.status != 'suspended'`
  ).bind(email).first();

  // Mismo mensaje y mismo costo aproximado exista o no el usuario.
  const salt = user ? user.password_salt : '00000000000000000000000000000000';
  const { hash } = await hashPassword(password, salt);
  if (!user || !timingSafeEqual(hash, user.password_hash) || user.status !== 'active') {
    throw new ApiError(401, 'invalid_credentials', 'Correo o contrasena incorrectos.');
  }

  await env.DB.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(nowIso(), user.id).run();
  return startSession(request, env, user.org_id, user.id, ipHash);
}

async function startSession(request, env, orgId, userId, ipHash) {
  const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
  const tokenHash = await sha256Hex(token);
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();

  await env.DB.prepare(
    `INSERT INTO sessions (token_hash, org_id, user_id, ip_hash, user_agent, expires_at, created_at)
     VALUES (?,?,?,?,?,?,?)`
  ).bind(
    tokenHash, orgId, userId, ipHash,
    (request.headers.get('User-Agent') || '').slice(0, 200), expires, nowIso()
  ).run();

  return { _cookie: sessionCookie(token, SESSION_DAYS * 86400), ok: true };
}

async function handleLogout(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
  }
  return { _cookie: sessionCookie('', 0), ok: true };
}

// ===========================================================================
// Handlers: contactos
// ===========================================================================

async function listContacts(request, env, ctx) {
  const url = new URL(request.url);
  const q = str(url.searchParams.get('q'), { max: 100 });
  const status = url.searchParams.get('status');
  const limit = intOr(url.searchParams.get('limit'), 100, { min: 1, max: 500 });
  const offset = intOr(url.searchParams.get('offset'), 0, { min: 0 });

  const where = ['c.org_id = ?', 'c.archived_at IS NULL'];
  const args = [ctx.orgId];
  if (q) {
    where.push('(c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)');
    args.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (status) { where.push('c.status = ?'); args.push(status); }

  const { results } = await env.DB.prepare(
    `SELECT c.*, co.name AS company_name
       FROM contacts c LEFT JOIN companies co ON co.id = c.company_id AND co.org_id = c.org_id
      WHERE ${where.join(' AND ')}
      ORDER BY c.updated_at DESC LIMIT ? OFFSET ?`
  ).bind(...args, limit, offset).all();

  return { contacts: results };
}

async function createContact(request, env, ctx) {
  const b = await request.json().catch(() => ({}));
  const id = uid('con');
  const ts = nowIso();
  const email = str(b.email, { max: 200, field: 'email' });
  if (email && !isEmail(email)) throw bad('El correo del contacto no es valido.');

  await env.DB.prepare(
    `INSERT INTO contacts (id, org_id, company_id, first_name, last_name, email, phone, title,
                           source, status, notes, custom, owner_id, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    id, ctx.orgId,
    str(b.companyId, { max: 40 }),
    str(b.firstName, { required: true, field: 'firstName', max: 80 }),
    str(b.lastName, { max: 80 }) || '',
    email,
    str(b.phone, { max: 40 }),
    str(b.title, { max: 120 }),
    str(b.source, { max: 60 }),
    oneOf(b.status, ['lead', 'activo', 'cliente', 'perdido'], 'lead', 'status'),
    str(b.notes, { max: 5000 }),
    jsonField(b.custom),
    ctx.user.id, ts, ts
  ).run();

  await logActivity(env, ctx, { type: 'creado', body: 'Contacto creado', contactId: id });
  await audit(env, ctx, 'create', 'contact', id);
  return getContact(env, ctx, id);
}

async function getContact(env, ctx, id) {
  const contact = await env.DB.prepare(
    `SELECT c.*, co.name AS company_name
       FROM contacts c LEFT JOIN companies co ON co.id = c.company_id AND co.org_id = c.org_id
      WHERE c.id = ? AND c.org_id = ?`
  ).bind(id, ctx.orgId).first();
  if (!contact) throw notFound('Contacto');

  const [{ results: deals }, { results: acts }, { results: tasks }] = await Promise.all([
    env.DB.prepare(
      `SELECT d.id, d.title, d.value_cents, d.status, s.name AS stage_name
         FROM deals d JOIN stages s ON s.id = d.stage_id AND s.org_id = d.org_id
        WHERE d.org_id = ? AND d.contact_id = ? ORDER BY d.updated_at DESC`
    ).bind(ctx.orgId, id).all(),
    env.DB.prepare(
      'SELECT * FROM activities WHERE org_id = ? AND contact_id = ? ORDER BY created_at DESC LIMIT 50'
    ).bind(ctx.orgId, id).all(),
    env.DB.prepare(
      'SELECT * FROM tasks WHERE org_id = ? AND contact_id = ? ORDER BY due_at ASC LIMIT 50'
    ).bind(ctx.orgId, id).all(),
  ]);

  return { contact, deals, activities: acts, tasks };
}

const CONTACT_FIELDS = {
  companyId: 'company_id', firstName: 'first_name', lastName: 'last_name',
  email: 'email', phone: 'phone', title: 'title', source: 'source',
  status: 'status', notes: 'notes',
};

async function updateContact(request, env, ctx, id) {
  const b = await request.json().catch(() => ({}));
  const sets = [];
  const args = [];
  for (const [key, col] of Object.entries(CONTACT_FIELDS)) {
    if (!(key in b)) continue;
    let value = key === 'status'
      ? oneOf(b[key], ['lead', 'activo', 'cliente', 'perdido'], 'lead', 'status')
      : str(b[key], { max: key === 'notes' ? 5000 : 200, field: key });
    if (key === 'email' && value && !isEmail(value)) throw bad('El correo del contacto no es valido.');
    sets.push(`${col} = ?`);
    args.push(value);
  }
  if ('custom' in b) { sets.push('custom = ?'); args.push(jsonField(b.custom)); }
  if (!sets.length) throw bad('Nada que actualizar.');

  sets.push('updated_at = ?');
  args.push(nowIso(), id, ctx.orgId);

  const res = await env.DB.prepare(
    `UPDATE contacts SET ${sets.join(', ')} WHERE id = ? AND org_id = ?`
  ).bind(...args).run();
  if (!res.meta.changes) throw notFound('Contacto');

  await audit(env, ctx, 'update', 'contact', id, { fields: Object.keys(b) });
  return getContact(env, ctx, id);
}

async function archiveContact(env, ctx, id) {
  const res = await env.DB.prepare(
    'UPDATE contacts SET archived_at = ?, updated_at = ? WHERE id = ? AND org_id = ? AND archived_at IS NULL'
  ).bind(nowIso(), nowIso(), id, ctx.orgId).run();
  if (!res.meta.changes) throw notFound('Contacto');
  await audit(env, ctx, 'delete', 'contact', id);
  return { ok: true };
}

// ===========================================================================
// Handlers: empresas
// ===========================================================================

async function listCompanies(request, env, ctx) {
  const url = new URL(request.url);
  const q = str(url.searchParams.get('q'), { max: 100 });
  const where = ['co.org_id = ?', 'co.archived_at IS NULL'];
  const args = [ctx.orgId];
  if (q) { where.push('(co.name LIKE ? OR co.domain LIKE ? OR co.industry LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }

  const { results } = await env.DB.prepare(
    `SELECT co.*, (SELECT COUNT(*) FROM contacts c WHERE c.org_id = co.org_id AND c.company_id = co.id AND c.archived_at IS NULL) AS contact_count
       FROM companies co WHERE ${where.join(' AND ')} ORDER BY co.name ASC LIMIT 300`
  ).bind(...args).all();
  return { companies: results };
}

async function createCompany(request, env, ctx) {
  const b = await request.json().catch(() => ({}));
  const id = uid('cmp');
  const ts = nowIso();
  await env.DB.prepare(
    `INSERT INTO companies (id, org_id, name, domain, industry, size, phone, address, city, country, notes, custom, owner_id, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    id, ctx.orgId,
    str(b.name, { required: true, field: 'name', max: 160 }),
    str(b.domain, { max: 160 }),
    str(b.industry, { max: 80 }),
    oneOf(b.size, ['1-10', '11-50', '51-200', '200+'], null, 'size'),
    str(b.phone, { max: 40 }),
    str(b.address, { max: 240 }),
    str(b.city, { max: 80 }),
    str(b.country, { max: 80 }) || 'Panama',
    str(b.notes, { max: 5000 }),
    jsonField(b.custom),
    ctx.user.id, ts, ts
  ).run();
  await audit(env, ctx, 'create', 'company', id);
  const company = await env.DB.prepare('SELECT * FROM companies WHERE id = ? AND org_id = ?').bind(id, ctx.orgId).first();
  return { company };
}

const COMPANY_FIELDS = {
  name: 'name', domain: 'domain', industry: 'industry', size: 'size',
  phone: 'phone', address: 'address', city: 'city', country: 'country', notes: 'notes',
};

async function updateCompany(request, env, ctx, id) {
  const b = await request.json().catch(() => ({}));
  const sets = [];
  const args = [];
  for (const [key, col] of Object.entries(COMPANY_FIELDS)) {
    if (!(key in b)) continue;
    sets.push(`${col} = ?`);
    args.push(str(b[key], { max: key === 'notes' ? 5000 : 240, field: key }));
  }
  if (!sets.length) throw bad('Nada que actualizar.');
  sets.push('updated_at = ?');
  args.push(nowIso(), id, ctx.orgId);
  const res = await env.DB.prepare(`UPDATE companies SET ${sets.join(', ')} WHERE id = ? AND org_id = ?`).bind(...args).run();
  if (!res.meta.changes) throw notFound('Empresa');
  await audit(env, ctx, 'update', 'company', id);
  const company = await env.DB.prepare('SELECT * FROM companies WHERE id = ? AND org_id = ?').bind(id, ctx.orgId).first();
  return { company };
}

// ===========================================================================
// Handlers: pipeline y oportunidades
// ===========================================================================

async function getBoard(request, env, ctx) {
  const url = new URL(request.url);
  let pipelineId = str(url.searchParams.get('pipeline'), { max: 40 });

  if (!pipelineId) {
    const p = await env.DB.prepare(
      'SELECT id FROM pipelines WHERE org_id = ? ORDER BY is_default DESC, created_at ASC LIMIT 1'
    ).bind(ctx.orgId).first();
    if (!p) return { pipelines: [], stages: [], deals: [] };
    pipelineId = p.id;
  }

  const [{ results: pipelines }, { results: stages }, { results: deals }] = await Promise.all([
    env.DB.prepare('SELECT id, name, is_default FROM pipelines WHERE org_id = ? ORDER BY is_default DESC, name').bind(ctx.orgId).all(),
    env.DB.prepare('SELECT * FROM stages WHERE org_id = ? AND pipeline_id = ? ORDER BY position').bind(ctx.orgId, pipelineId).all(),
    env.DB.prepare(
      `SELECT d.*, c.first_name, c.last_name, co.name AS company_name, u.name AS owner_name, u.avatar_color
         FROM deals d
         LEFT JOIN contacts  c  ON c.id  = d.contact_id AND c.org_id  = d.org_id
         LEFT JOIN companies co ON co.id = d.company_id AND co.org_id = d.org_id
         LEFT JOIN users     u  ON u.id  = d.owner_id   AND u.org_id  = d.org_id
        WHERE d.org_id = ? AND d.pipeline_id = ?
        ORDER BY d.position ASC, d.created_at DESC`
    ).bind(ctx.orgId, pipelineId).all(),
  ]);

  return { pipelineId, pipelines, stages, deals };
}

async function createDeal(request, env, ctx) {
  const b = await request.json().catch(() => ({}));
  const stageId = str(b.stageId, { required: true, field: 'stageId', max: 40 });

  const stage = await env.DB.prepare(
    'SELECT id, pipeline_id, probability, kind FROM stages WHERE id = ? AND org_id = ?'
  ).bind(stageId, ctx.orgId).first();
  if (!stage) throw notFound('Etapa');

  const id = uid('deal');
  const ts = nowIso();
  const status = stage.kind === 'won' ? 'won' : stage.kind === 'lost' ? 'lost' : 'open';

  await env.DB.prepare(
    `INSERT INTO deals (id, org_id, pipeline_id, stage_id, contact_id, company_id, title, value_cents,
                        currency, probability, expected_close_date, status, position, custom, owner_id,
                        closed_at, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    id, ctx.orgId, stage.pipeline_id, stageId,
    str(b.contactId, { max: 40 }),
    str(b.companyId, { max: 40 }),
    str(b.title, { required: true, field: 'title', max: 160 }),
    intOr(b.valueCents, 0, { min: 0, max: 1e12 }),
    ctx.org.currency,
    intOr(b.probability, stage.probability, { min: 0, max: 100 }),
    str(b.expectedCloseDate, { max: 30 }),
    status,
    intOr(b.position, 0, { min: 0 }),
    jsonField(b.custom),
    ctx.user.id,
    status === 'open' ? null : ts,
    ts, ts
  ).run();

  await logActivity(env, ctx, { type: 'creado', body: 'Oportunidad creada', dealId: id, contactId: str(b.contactId, { max: 40 }) });
  await audit(env, ctx, 'create', 'deal', id);
  const deal = await env.DB.prepare('SELECT * FROM deals WHERE id = ? AND org_id = ?').bind(id, ctx.orgId).first();
  return { deal };
}

/** Mover una oportunidad de etapa: es la accion mas usada del CRM, va aparte. */
async function moveDeal(request, env, ctx, id) {
  const b = await request.json().catch(() => ({}));
  const stageId = str(b.stageId, { required: true, field: 'stageId', max: 40 });
  const position = intOr(b.position, 0, { min: 0 });

  const [deal, stage] = await Promise.all([
    env.DB.prepare('SELECT id, stage_id, pipeline_id FROM deals WHERE id = ? AND org_id = ?').bind(id, ctx.orgId).first(),
    env.DB.prepare('SELECT id, name, pipeline_id, kind, probability FROM stages WHERE id = ? AND org_id = ?').bind(stageId, ctx.orgId).first(),
  ]);
  if (!deal) throw notFound('Oportunidad');
  if (!stage) throw notFound('Etapa');
  if (stage.pipeline_id !== deal.pipeline_id) throw bad('La etapa pertenece a otro embudo.');

  const status = stage.kind === 'won' ? 'won' : stage.kind === 'lost' ? 'lost' : 'open';
  const ts = nowIso();

  await env.DB.prepare(
    `UPDATE deals SET stage_id = ?, position = ?, status = ?, probability = ?,
                      closed_at = CASE WHEN ? = 'open' THEN NULL ELSE ? END, updated_at = ?
      WHERE id = ? AND org_id = ?`
  ).bind(stageId, position, status, stage.probability, status, ts, ts, id, ctx.orgId).run();

  const type = status === 'won' ? 'ganado' : status === 'lost' ? 'perdido' : 'etapa';
  await logActivity(env, ctx, { type, body: `Movida a ${stage.name}`, dealId: id });
  await audit(env, ctx, 'update', 'deal', id, { stage: stage.name });
  return { ok: true, status };
}

const DEAL_FIELDS = { title: 'title', expectedCloseDate: 'expected_close_date', lostReason: 'lost_reason' };

async function updateDeal(request, env, ctx, id) {
  const b = await request.json().catch(() => ({}));
  const sets = [];
  const args = [];
  for (const [key, col] of Object.entries(DEAL_FIELDS)) {
    if (!(key in b)) continue;
    sets.push(`${col} = ?`);
    args.push(str(b[key], { max: 300, field: key }));
  }
  if ('valueCents' in b) { sets.push('value_cents = ?'); args.push(intOr(b.valueCents, 0, { min: 0, max: 1e12 })); }
  if ('probability' in b) { sets.push('probability = ?'); args.push(intOr(b.probability, 50, { min: 0, max: 100 })); }
  if ('contactId' in b) { sets.push('contact_id = ?'); args.push(str(b.contactId, { max: 40 })); }
  if ('companyId' in b) { sets.push('company_id = ?'); args.push(str(b.companyId, { max: 40 })); }
  if (!sets.length) throw bad('Nada que actualizar.');

  sets.push('updated_at = ?');
  args.push(nowIso(), id, ctx.orgId);
  const res = await env.DB.prepare(`UPDATE deals SET ${sets.join(', ')} WHERE id = ? AND org_id = ?`).bind(...args).run();
  if (!res.meta.changes) throw notFound('Oportunidad');
  await audit(env, ctx, 'update', 'deal', id);
  const deal = await env.DB.prepare('SELECT * FROM deals WHERE id = ? AND org_id = ?').bind(id, ctx.orgId).first();
  return { deal };
}

async function deleteDeal(env, ctx, id) {
  const res = await env.DB.prepare('DELETE FROM deals WHERE id = ? AND org_id = ?').bind(id, ctx.orgId).run();
  if (!res.meta.changes) throw notFound('Oportunidad');
  await audit(env, ctx, 'delete', 'deal', id);
  return { ok: true };
}

// ===========================================================================
// Handlers: tareas
// ===========================================================================

async function listTasks(request, env, ctx) {
  const url = new URL(request.url);
  const status = oneOf(url.searchParams.get('status'), ['open', 'done', 'all'], 'open', 'status');
  const where = ['t.org_id = ?'];
  const args = [ctx.orgId];
  if (status !== 'all') { where.push('t.status = ?'); args.push(status); }

  const { results } = await env.DB.prepare(
    `SELECT t.*, c.first_name, c.last_name, d.title AS deal_title, u.name AS assignee_name, u.avatar_color
       FROM tasks t
       LEFT JOIN contacts c ON c.id = t.contact_id AND c.org_id = t.org_id
       LEFT JOIN deals    d ON d.id = t.deal_id    AND d.org_id = t.org_id
       LEFT JOIN users    u ON u.id = t.assignee_id AND u.org_id = t.org_id
      WHERE ${where.join(' AND ')}
      ORDER BY (t.due_at IS NULL), t.due_at ASC, t.created_at DESC LIMIT 300`
  ).bind(...args).all();
  return { tasks: results };
}

async function createTask(request, env, ctx) {
  const b = await request.json().catch(() => ({}));
  const id = uid('tsk');
  const ts = nowIso();
  await env.DB.prepare(
    `INSERT INTO tasks (id, org_id, title, notes, due_at, priority, status, assignee_id, contact_id, company_id, deal_id, created_at, updated_at)
     VALUES (?,?,?,?,?,?, 'open', ?,?,?,?,?,?)`
  ).bind(
    id, ctx.orgId,
    str(b.title, { required: true, field: 'title', max: 200 }),
    str(b.notes, { max: 2000 }),
    str(b.dueAt, { max: 40 }),
    oneOf(b.priority, ['baja', 'normal', 'alta'], 'normal', 'priority'),
    str(b.assigneeId, { max: 40 }) || ctx.user.id,
    str(b.contactId, { max: 40 }),
    str(b.companyId, { max: 40 }),
    str(b.dealId, { max: 40 }),
    ts, ts
  ).run();
  await audit(env, ctx, 'create', 'task', id);
  const task = await env.DB.prepare('SELECT * FROM tasks WHERE id = ? AND org_id = ?').bind(id, ctx.orgId).first();
  return { task };
}

async function updateTask(request, env, ctx, id) {
  const b = await request.json().catch(() => ({}));
  const sets = [];
  const args = [];
  if ('title' in b) { sets.push('title = ?'); args.push(str(b.title, { required: true, field: 'title', max: 200 })); }
  if ('notes' in b) { sets.push('notes = ?'); args.push(str(b.notes, { max: 2000 })); }
  if ('dueAt' in b) { sets.push('due_at = ?'); args.push(str(b.dueAt, { max: 40 })); }
  if ('priority' in b) { sets.push('priority = ?'); args.push(oneOf(b.priority, ['baja', 'normal', 'alta'], 'normal', 'priority')); }
  if ('assigneeId' in b) { sets.push('assignee_id = ?'); args.push(str(b.assigneeId, { max: 40 })); }
  if ('status' in b) {
    const status = oneOf(b.status, ['open', 'done'], 'open', 'status');
    sets.push('status = ?', 'completed_at = ?');
    args.push(status, status === 'done' ? nowIso() : null);
  }
  if (!sets.length) throw bad('Nada que actualizar.');

  sets.push('updated_at = ?');
  args.push(nowIso(), id, ctx.orgId);
  const res = await env.DB.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ? AND org_id = ?`).bind(...args).run();
  if (!res.meta.changes) throw notFound('Tarea');
  const task = await env.DB.prepare('SELECT * FROM tasks WHERE id = ? AND org_id = ?').bind(id, ctx.orgId).first();
  return { task };
}

async function deleteTask(env, ctx, id) {
  const res = await env.DB.prepare('DELETE FROM tasks WHERE id = ? AND org_id = ?').bind(id, ctx.orgId).run();
  if (!res.meta.changes) throw notFound('Tarea');
  return { ok: true };
}

// ===========================================================================
// Handlers: metricas del tablero
// ===========================================================================

async function dashboard(request, env, ctx) {
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const [open, won, lost, byStage, tasksDue, recent, newContacts] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(value_cents),0) AS total,
              COALESCE(SUM(value_cents * probability / 100),0) AS weighted
         FROM deals WHERE org_id = ? AND status = 'open'`
    ).bind(ctx.orgId).first(),
    env.DB.prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(value_cents),0) AS total
         FROM deals WHERE org_id = ? AND status = 'won' AND closed_at >= ?`
    ).bind(ctx.orgId, since).first(),
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM deals WHERE org_id = ? AND status = 'lost' AND closed_at >= ?`
    ).bind(ctx.orgId, since).first(),
    env.DB.prepare(
      `SELECT s.id, s.name, s.position, s.kind, COUNT(d.id) AS n, COALESCE(SUM(d.value_cents),0) AS total
         FROM stages s
         LEFT JOIN deals d ON d.stage_id = s.id AND d.org_id = s.org_id AND d.status = 'open'
        WHERE s.org_id = ? GROUP BY s.id ORDER BY s.position`
    ).bind(ctx.orgId).all(),
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM tasks WHERE org_id = ? AND status = 'open' AND due_at <= ?`
    ).bind(ctx.orgId, new Date().toISOString()).first(),
    env.DB.prepare(
      `SELECT a.*, u.name AS user_name, u.avatar_color, c.first_name, c.last_name, d.title AS deal_title
         FROM activities a
         LEFT JOIN users u ON u.id = a.user_id AND u.org_id = a.org_id
         LEFT JOIN contacts c ON c.id = a.contact_id AND c.org_id = a.org_id
         LEFT JOIN deals d ON d.id = a.deal_id AND d.org_id = a.org_id
        WHERE a.org_id = ? ORDER BY a.created_at DESC LIMIT 12`
    ).bind(ctx.orgId).all(),
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM contacts WHERE org_id = ? AND archived_at IS NULL AND created_at >= ?`
    ).bind(ctx.orgId, since).first(),
  ]);

  const closed = (won.n || 0) + (lost.n || 0);
  return {
    openDeals: open.n || 0,
    openValueCents: open.total || 0,
    weightedValueCents: Math.round(open.weighted || 0),
    wonDeals: won.n || 0,
    wonValueCents: won.total || 0,
    lostDeals: lost.n || 0,
    winRate: closed ? Math.round(((won.n || 0) / closed) * 100) : 0,
    tasksDue: tasksDue.n || 0,
    newContacts: newContacts.n || 0,
    byStage: byStage.results,
    activity: recent.results,
  };
}

// ===========================================================================
// Router
// ===========================================================================

const ROUTES = [
  // publicas
  ['POST',   /^\/api\/auth\/signup$/,            (req, env) => handleSignup(req, env)],
  ['POST',   /^\/api\/auth\/login$/,             (req, env) => handleLogin(req, env)],
  ['POST',   /^\/api\/auth\/logout$/,            (req, env) => handleLogout(req, env)],
  // privadas (reciben ctx)
  ['GET',    /^\/api\/me$/,                      null, (req, env, ctx) => ({ user: ctx.user, org: ctx.org })],
  ['GET',    /^\/api\/contacts$/,                null, listContacts],
  ['POST',   /^\/api\/contacts$/,                null, createContact],
  ['GET',    /^\/api\/contacts\/([\w-]+)$/,      null, (req, env, ctx, id) => getContact(env, ctx, id)],
  ['PATCH',  /^\/api\/contacts\/([\w-]+)$/,      null, updateContact],
  ['DELETE', /^\/api\/contacts\/([\w-]+)$/,      null, (req, env, ctx, id) => archiveContact(env, ctx, id)],
  ['GET',    /^\/api\/companies$/,               null, listCompanies],
  ['POST',   /^\/api\/companies$/,               null, createCompany],
  ['PATCH',  /^\/api\/companies\/([\w-]+)$/,     null, updateCompany],
  ['GET',    /^\/api\/board$/,                   null, getBoard],
  ['POST',   /^\/api\/deals$/,                   null, createDeal],
  ['PATCH',  /^\/api\/deals\/([\w-]+)\/stage$/,  null, moveDeal],
  ['PATCH',  /^\/api\/deals\/([\w-]+)$/,         null, updateDeal],
  ['DELETE', /^\/api\/deals\/([\w-]+)$/,         null, (req, env, ctx, id) => deleteDeal(env, ctx, id)],
  ['GET',    /^\/api\/tasks$/,                   null, listTasks],
  ['POST',   /^\/api\/tasks$/,                   null, createTask],
  ['PATCH',  /^\/api\/tasks\/([\w-]+)$/,         null, updateTask],
  ['DELETE', /^\/api\/tasks\/([\w-]+)$/,         null, (req, env, ctx, id) => deleteTask(env, ctx, id)],
  ['GET',    /^\/api\/dashboard$/,               null, dashboard],
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }
    if (!url.pathname.startsWith('/api/')) {
      return json({ error: 'not_found' }, { status: 404 }, request, env);
    }

    try {
      for (const [method, pattern, publicHandler, privateHandler] of ROUTES) {
        if (request.method !== method) continue;
        const match = url.pathname.match(pattern);
        if (!match) continue;

        let result;
        if (publicHandler) {
          result = await publicHandler(request, env);
        } else {
          const ctx = await requireAuth(request, env);
          result = await privateHandler(request, env, ctx, match[1]);
        }

        const headers = {};
        if (result && result._cookie) {
          headers['Set-Cookie'] = result._cookie;
          delete result._cookie;
        }
        return json(result, { headers }, request, env);
      }
      return json({ error: 'not_found', message: 'Ruta no encontrada.' }, { status: 404 }, request, env);
    } catch (err) {
      if (err instanceof ApiError) {
        return json({ error: err.code, message: err.message }, { status: err.status }, request, env);
      }
      console.error('nexo-crm error:', err && err.stack);
      return json({ error: 'server_error', message: 'Error interno.' }, { status: 500 }, request, env);
    }
  },
};
