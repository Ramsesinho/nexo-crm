-- ============================================================================
-- NEXO CRM - Esquema multi-tenant (Cloudflare D1 / SQLite)
-- ----------------------------------------------------------------------------
-- REGLA DE ORO DEL AISLAMIENTO:
--   Toda tabla de negocio lleva org_id y TODA consulta filtra por org_id.
--   No existe una sola lectura sin ese filtro. El org_id nunca viene del
--   cliente: se deriva de la sesion en el servidor.
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- TENANTS --
CREATE TABLE IF NOT EXISTS orgs (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  plan          TEXT NOT NULL DEFAULT 'trial',   -- trial | starter | pro | agency
  seats         INTEGER NOT NULL DEFAULT 3,
  currency      TEXT NOT NULL DEFAULT 'USD',
  locale        TEXT NOT NULL DEFAULT 'es-PA',
  timezone      TEXT NOT NULL DEFAULT 'America/Panama',
  status        TEXT NOT NULL DEFAULT 'active',  -- active | past_due | suspended
  trial_ends_at TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member',  -- owner | admin | member
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  avatar_color  TEXT NOT NULL DEFAULT '#1F6F5C',
  status        TEXT NOT NULL DEFAULT 'active',  -- active | invited | disabled
  last_login_at TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_org_email ON users(org_id, lower(email));
CREATE INDEX IF NOT EXISTS ix_users_org ON users(org_id, status);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,          -- SHA-256 del token; el token crudo nunca se guarda
  org_id     TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_hash    TEXT,                      -- SHA-256 de la IP, nunca la IP cruda
  user_agent TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS ix_sessions_expiry ON sessions(expires_at);

-- --------------------------------------------------------------- CATALOGO --
CREATE TABLE IF NOT EXISTS companies (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  domain      TEXT,
  industry    TEXT,
  size        TEXT,                      -- 1-10 | 11-50 | 51-200 | 200+
  phone       TEXT,
  address     TEXT,
  city        TEXT,
  country     TEXT DEFAULT 'Panama',
  notes       TEXT,
  custom      TEXT NOT NULL DEFAULT '{}',-- campos a medida por cliente (JSON)
  owner_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  archived_at TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_companies_org ON companies(org_id, archived_at);
CREATE INDEX IF NOT EXISTS ix_companies_name ON companies(org_id, name);

CREATE TABLE IF NOT EXISTS contacts (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  company_id  TEXT REFERENCES companies(id) ON DELETE SET NULL,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL DEFAULT '',
  email       TEXT,
  phone       TEXT,
  title       TEXT,
  source      TEXT,                         -- referido | web | instagram | evento | frio
  status      TEXT NOT NULL DEFAULT 'lead', -- lead | activo | cliente | perdido
  notes       TEXT,
  custom      TEXT NOT NULL DEFAULT '{}',
  owner_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  archived_at TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_contacts_org ON contacts(org_id, archived_at);
CREATE INDEX IF NOT EXISTS ix_contacts_company ON contacts(org_id, company_id);
CREATE INDEX IF NOT EXISTS ix_contacts_status ON contacts(org_id, status);

-- ----------------------------------------------------------------- VENTAS --
CREATE TABLE IF NOT EXISTS pipelines (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_pipelines_org ON pipelines(org_id);

CREATE TABLE IF NOT EXISTS stages (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  pipeline_id TEXT NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  position    INTEGER NOT NULL,
  probability INTEGER NOT NULL DEFAULT 50,  -- 0-100
  kind        TEXT NOT NULL DEFAULT 'open', -- open | won | lost
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_stages_pipeline ON stages(org_id, pipeline_id, position);

CREATE TABLE IF NOT EXISTS deals (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  pipeline_id  TEXT NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  stage_id     TEXT NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  contact_id   TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  company_id   TEXT REFERENCES companies(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  value_cents  INTEGER NOT NULL DEFAULT 0, -- dinero SIEMPRE en centavos, nunca float
  currency     TEXT NOT NULL DEFAULT 'USD',
  probability  INTEGER NOT NULL DEFAULT 50,
  expected_close_date TEXT,
  status       TEXT NOT NULL DEFAULT 'open', -- open | won | lost
  lost_reason  TEXT,
  position     INTEGER NOT NULL DEFAULT 0,   -- orden dentro de la columna kanban
  custom       TEXT NOT NULL DEFAULT '{}',
  owner_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  closed_at    TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_deals_board ON deals(org_id, pipeline_id, stage_id, position);
CREATE INDEX IF NOT EXISTS ix_deals_status ON deals(org_id, status, closed_at);
CREATE INDEX IF NOT EXISTS ix_deals_contact ON deals(org_id, contact_id);

-- -------------------------------------------------------------- ACTIVIDAD --
CREATE TABLE IF NOT EXISTS tasks (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  notes        TEXT,
  due_at       TEXT,
  priority     TEXT NOT NULL DEFAULT 'normal', -- baja | normal | alta
  status       TEXT NOT NULL DEFAULT 'open',   -- open | done
  assignee_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  contact_id   TEXT REFERENCES contacts(id) ON DELETE CASCADE,
  company_id   TEXT REFERENCES companies(id) ON DELETE CASCADE,
  deal_id      TEXT REFERENCES deals(id) ON DELETE CASCADE,
  completed_at TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_tasks_queue ON tasks(org_id, status, due_at);
CREATE INDEX IF NOT EXISTS ix_tasks_assignee ON tasks(org_id, assignee_id, status);

CREATE TABLE IF NOT EXISTS activities (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,  -- nota | llamada | email | reunion | etapa | creado | ganado | perdido
  body       TEXT,
  contact_id TEXT REFERENCES contacts(id) ON DELETE CASCADE,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  deal_id    TEXT REFERENCES deals(id) ON DELETE CASCADE,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_activities_org ON activities(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_activities_contact ON activities(org_id, contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_activities_deal ON activities(org_id, deal_id, created_at DESC);

-- ------------------------------------------------------------------ TAGS --
CREATE TABLE IF NOT EXISTS tags (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT 'slate',
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_tags_org_name ON tags(org_id, lower(name));

CREATE TABLE IF NOT EXISTS taggings (
  org_id      TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  tag_id      TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,  -- contact | company | deal
  target_id   TEXT NOT NULL,
  PRIMARY KEY (tag_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS ix_taggings_target ON taggings(org_id, target_type, target_id);

-- -------------------------------------------------------------- AUDITORIA --
CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL,
  user_id     TEXT,
  action      TEXT NOT NULL,   -- create | update | delete | login | export
  target_type TEXT NOT NULL,
  target_id   TEXT,
  meta        TEXT NOT NULL DEFAULT '{}',
  ip_hash     TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_audit_org ON audit_log(org_id, created_at DESC);
