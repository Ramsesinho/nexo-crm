/**
 * NEXO CRM - Datos de demostracion
 * ---------------------------------------------------------------------------
 * Empresa ficticia: una agencia de servicios digitales en Ciudad de Panama.
 * Las fechas son relativas al dia de hoy, asi la demo nunca se ve vieja.
 *
 * Nada de esto sale de un cliente real. Son datos inventados con nombres y
 * negocios verosimiles de Panama para que la demo se sienta de verdad.
 */

const DAY = 86400000;
const rel = (days) => new Date(Date.now() + days * DAY).toISOString();

export const DEMO_USERS = [
  { id: 'u1', name: 'Yariela Castillero', email: 'yariela@estudioaltamar.com', role: 'owner',  avatarColor: '#0E6E52' },
  { id: 'u2', name: 'Abdiel Quintero',    email: 'abdiel@estudioaltamar.com',  role: 'admin',  avatarColor: '#2C5F8A' },
  { id: 'u3', name: 'Nitzia Guerra',      email: 'nitzia@estudioaltamar.com',  role: 'member', avatarColor: '#A96A11' },
];

export const DEMO_STAGES = [
  { id: 's1', name: 'Prospecto',   position: 0, probability: 10,  kind: 'open' },
  { id: 's2', name: 'Contactado',  position: 1, probability: 25,  kind: 'open' },
  { id: 's3', name: 'Propuesta',   position: 2, probability: 50,  kind: 'open' },
  { id: 's4', name: 'Negociacion', position: 3, probability: 75,  kind: 'open' },
  { id: 's5', name: 'Ganado',      position: 4, probability: 100, kind: 'won'  },
  { id: 's6', name: 'Perdido',     position: 5, probability: 0,   kind: 'lost' },
];

const COMPANIES = [
  ['c1', 'Ferreteria El Arrecife',      'elarrecife.com.pa',   'Retail',        '11-50',  'Juan Diaz'],
  ['c2', 'Clinica Dental Via Porras',   'dentalviaporras.com', 'Salud',         '1-10',   'San Francisco'],
  ['c3', 'Distribuidora Mar del Sur',   'mardelsur.com.pa',    'Distribucion',  '51-200', 'Tocumen'],
  ['c4', 'Constructora Costa Bella',    'costabella.pa',       'Construccion',  '51-200', 'Costa del Este'],
  ['c5', 'Cafe Boquete Roasters',       'boqueteroasters.com', 'Alimentos',     '11-50',  'Boquete'],
  ['c6', 'Optica Balboa',               'opticabalboa.com',    'Retail',        '1-10',   'Calidonia'],
  ['c7', 'Taller Diesel La Chorrera',   null,                  'Automotriz',    '11-50',  'La Chorrera'],
  ['c8', 'Agencia de Viajes Coiba',     'viajescoiba.com',     'Turismo',       '1-10',   'Bella Vista'],
  ['c9', 'Panaderia La Cresta',         null,                  'Alimentos',     '1-10',   'La Cresta'],
  ['c10','Seguros Ancon Corredores',    'segurosancon.com.pa', 'Financiero',    '11-50',  'Obarrio'],
];

const CONTACTS = [
  ['k1',  'Marisol',  'Him',        'c1',  'Gerente general',       'marisol.him@elarrecife.com.pa',  '+507 6412-7834', 'cliente', 'referido'],
  ['k2',  'Ricaurte', 'Barria',     'c1',  'Jefe de compras',       'r.barria@elarrecife.com.pa',     '+507 6738-2201', 'activo',  'referido'],
  ['k3',  'Ileana',   'Tejeira',    'c2',  'Odontologa y duena',    'dra.tejeira@dentalviaporras.com','+507 6205-9917', 'cliente', 'instagram'],
  ['k4',  'Josue',    'Bonilla',    'c3',  'Director comercial',    'jbonilla@mardelsur.com.pa',      '+507 6091-4425', 'activo',  'evento'],
  ['k5',  'Zuleika',  'Arosemena',  'c4',  'Gerente de mercadeo',   'zarosemena@costabella.pa',       '+507 6644-8130', 'activo',  'web'],
  ['k6',  'Rodolfo',  'Batista',    'c4',  'Gerente de proyectos',  'rbatista@costabella.pa',         '+507 6318-7742', 'lead',    'web'],
  ['k7',  'Eduardo',  'Chiari',     'c5',  'Fundador',              'eduardo@boqueteroasters.com',    '+507 6572-3308', 'cliente', 'referido'],
  ['k8',  'Vielka',   'Samaniego',  'c6',  'Administradora',        'vsamaniego@opticabalboa.com',    '+507 6480-1156', 'lead',    'llamada'],
  ['k9',  'Omar',     'Alvarado',   'c7',  'Propietario',           null,                             '+507 6927-5540', 'lead',    'referido'],
  ['k10', 'Katia',    'Villalobos', 'c8',  'Gerente de operaciones','katia@viajescoiba.com',          '+507 6153-9982', 'activo',  'instagram'],
  ['k11', 'Aristides','Pinzon',     'c9',  'Propietario',           null,                             '+507 6874-2016', 'lead',    'evento'],
  ['k12', 'Lorena',   'Achurra',    'c10', 'Subgerente comercial',  'lachurra@segurosancon.com.pa',   '+507 6039-7451', 'activo',  'web'],
  ['k13', 'Guillermo','Endara',     'c3',  'Analista de compras',   'gendara@mardelsur.com.pa',       '+507 6766-3390', 'lead',    'referido'],
  ['k14', 'Xiomara',  'De Leon',    'c10', 'Directora de agencia',  'xdeleon@segurosancon.com.pa',    '+507 6229-8804', 'cliente', 'referido'],
];

const DEALS = [
  ['d1',  'Rediseno de tienda en linea',        'c1',  'k1',  's4', 1265000, 75,  6,   'u1'],
  ['d2',  'Catalogo digital y fichas',          'c1',  'k2',  's2', 318000,  25,  21,  'u3'],
  ['d3',  'Sistema de citas y recordatorios',   'c2',  'k3',  's5', 487000,  100, -12, 'u1'],
  ['d4',  'Portal B2B para distribuidores',     'c3',  'k4',  's3', 2140000, 50,  18,  'u2'],
  ['d5',  'Automatizacion de cotizaciones',     'c3',  'k13', 's1', 760000,  10,  45,  'u2'],
  ['d6',  'Web institucional y tour virtual',   'c4',  'k5',  's4', 1875000, 75,  9,   'u1'],
  ['d7',  'Campana de lanzamiento Costa Bella', 'c4',  'k6',  's2', 545000,  25,  30,  'u3'],
  ['d8',  'Tienda de cafe con envio nacional',  'c5',  'k7',  's5', 926000,  100, -26, 'u2'],
  ['d9',  'Renovacion de marca y empaques',     'c5',  'k7',  's3', 1130000, 50,  24,  'u1'],
  ['d10', 'Landing de promocion de lentes',     'c6',  'k8',  's1', 184000,  10,  38,  'u3'],
  ['d11', 'Perfil de negocio y resenas',        'c7',  'k9',  's6', 96000,   0,   -8,  'u3'],
  ['d12', 'Reservas en linea para tours',       'c8',  'k10', 's3', 682000,  50,  15,  'u2'],
  ['d13', 'Menu digital con codigo QR',         'c9',  'k11', 's1', 127000,  10,  33,  'u3'],
  ['d14', 'Cotizador de polizas en web',        'c10', 'k12', 's4', 1490000, 75,  4,   'u1'],
  ['d15', 'Mantenimiento anual del portal',     'c10', 'k14', 's5', 372000,  100, -3,  'u2'],
  ['d16', 'Integracion de pagos Yappy',         'c1',  'k1',  's3', 428000,  50,  12,  'u2'],
  ['d17', 'Consultoria de datos de venta',      'c3',  'k4',  's6', 890000,  0,   -19, 'u1'],
];

const TASKS = [
  ['t1',  'Llamar a Marisol para cerrar el contrato',        'd1',  'k1',  -1,  'alta',   'open', 'u1'],
  ['t2',  'Enviar propuesta revisada a Costa Bella',         'd6',  'k5',  0,   'alta',   'open', 'u1'],
  ['t3',  'Confirmar alcance del portal B2B',                'd4',  'k4',  1,   'normal', 'open', 'u2'],
  ['t4',  'Cotizar hosting para Seguros Ancon',              'd14', 'k12', 2,   'normal', 'open', 'u2'],
  ['t5',  'Preparar demo del cotizador de polizas',          'd14', 'k12', 3,   'alta',   'open', 'u1'],
  ['t6',  'Pedir fotos del local a Optica Balboa',           'd10', 'k8',  5,   'baja',   'open', 'u3'],
  ['t7',  'Reunion de arranque con Boquete Roasters',        'd9',  'k7',  7,   'normal', 'open', 'u2'],
  ['t8',  'Escribir textos del menu de La Cresta',           'd13', 'k11', 9,   'baja',   'open', 'u3'],
  ['t9',  'Facturar primera cuota de Via Porras',            'd3',  'k3',  -6,  'normal', 'done', 'u1'],
  ['t10', 'Entregar manual de marca a Eduardo',              'd8',  'k7',  -4,  'normal', 'done', 'u2'],
  ['t11', 'Revisar analitica del mes con Katia',             'd12', 'k10', 4,   'normal', 'open', 'u2'],
  ['t12', 'Cerrar acuerdo de mantenimiento anual',           'd15', 'k14', -2,  'alta',   'done', 'u2'],
];

const ACTIVITY = [
  ['a1',  'ganado',  'Cerrada como ganada por USD 3,720.00',            'd15', 'k14', 'u2', -0.2],
  ['a2',  'llamada', 'Llamada de 22 minutos. Pide descuento por pago anual.', 'd1', 'k1', 'u1', -0.4],
  ['a3',  'etapa',   'Movida a Negociacion',                            'd14', 'k12', 'u1', -0.9],
  ['a4',  'email',   'Enviada propuesta con tres alcances',             'd6',  'k5',  'u1', -1.3],
  ['a5',  'nota',    'Prefieren pagar en dos cuotas contra entrega.',   'd4',  'k4',  'u2', -1.8],
  ['a6',  'reunion', 'Reunion en sitio en Tocumen. Vieron la demo.',    'd4',  'k4',  'u2', -2.4],
  ['a7',  'perdido', 'Perdida. Contrataron a un sobrino del duenio.',   'd11', 'k9',  'u3', -3.1],
  ['a8',  'etapa',   'Movida a Propuesta',                              'd12', 'k10', 'u2', -3.6],
  ['a9',  'creado',  'Oportunidad creada',                              'd13', 'k11', 'u3', -4.2],
  ['a10', 'llamada', 'No contesto. Reintentar el jueves.',              'd10', 'k8',  'u3', -5.0],
  ['a11', 'ganado',  'Cerrada como ganada por USD 9,260.00',            'd8',  'k7',  'u2', -26],
  ['a12', 'nota',    'Quiere ver referencias de otras clinicas.',       'd3',  'k3',  'u1', -13],
];

export function buildDemoData() {
  const ts = rel(-60);

  const companies = COMPANIES.map(([id, name, domain, industry, size, city]) => ({
    id, name, domain, industry, size, city, country: 'Panama',
    phone: null, notes: null, created_at: ts, updated_at: ts,
    contact_count: CONTACTS.filter((c) => c[3] === id).length,
  }));

  // Antiguedad escalonada: los clientes llevan meses, los prospectos son recientes.
  // Sin esto, la metrica "contactos nuevos este mes" sale en cero y la demo se ve muerta.
  const AGE_BY_STATUS = { cliente: 150, activo: 70, lead: 17, perdido: 95 };

  const contacts = CONTACTS.map(([id, first, last, companyId, title, email, phone, status, source], i) => ({
    id,
    company_id: companyId,
    company_name: (COMPANIES.find((c) => c[0] === companyId) || [])[1] || null,
    first_name: first,
    last_name: last,
    title, email, phone, status, source,
    notes: null,
    owner_id: 'u1',
    created_at: rel(-(AGE_BY_STATUS[status] || 60) - i * 1.7),
    updated_at: rel(-(i % 9) - 0.3),
  }));

  const deals = DEALS.map(([id, title, companyId, contactId, stageId, valueCents, probability, dueInDays, ownerId], i) => {
    const stage = DEMO_STAGES.find((s) => s.id === stageId);
    const status = stage.kind === 'won' ? 'won' : stage.kind === 'lost' ? 'lost' : 'open';
    const contact = CONTACTS.find((c) => c[0] === contactId);
    const owner = DEMO_USERS.find((u) => u.id === ownerId);
    return {
      id, title,
      pipeline_id: 'p1',
      stage_id: stageId,
      company_id: companyId,
      contact_id: contactId,
      company_name: (COMPANIES.find((c) => c[0] === companyId) || [])[1] || null,
      first_name: contact ? contact[1] : null,
      last_name: contact ? contact[2] : null,
      value_cents: valueCents,
      currency: 'USD',
      probability,
      expected_close_date: rel(dueInDays).slice(0, 10),
      status,
      lost_reason: status === 'lost' ? 'Precio' : null,
      position: i,
      owner_id: ownerId,
      owner_name: owner ? owner.name : null,
      avatar_color: owner ? owner.avatarColor : null,
      closed_at: status === 'open' ? null : rel(dueInDays),
      created_at: rel(dueInDays - 40),
      updated_at: rel(-Math.random() * 6),
    };
  });

  const tasks = TASKS.map(([id, title, dealId, contactId, dueInDays, priority, status, assigneeId]) => {
    const contact = CONTACTS.find((c) => c[0] === contactId);
    const assignee = DEMO_USERS.find((u) => u.id === assigneeId);
    const deal = DEALS.find((d) => d[0] === dealId);
    return {
      id, title,
      notes: null,
      due_at: rel(dueInDays),
      priority, status,
      assignee_id: assigneeId,
      assignee_name: assignee ? assignee.name : null,
      avatar_color: assignee ? assignee.avatarColor : null,
      contact_id: contactId,
      first_name: contact ? contact[1] : null,
      last_name: contact ? contact[2] : null,
      deal_id: dealId,
      deal_title: deal ? deal[1] : null,
      completed_at: status === 'done' ? rel(dueInDays) : null,
      created_at: rel(dueInDays - 8),
      updated_at: rel(dueInDays - 1),
    };
  });

  const activities = ACTIVITY.map(([id, type, body, dealId, contactId, userId, daysAgo]) => {
    const user = DEMO_USERS.find((u) => u.id === userId);
    const contact = CONTACTS.find((c) => c[0] === contactId);
    const deal = DEALS.find((d) => d[0] === dealId);
    return {
      id, type, body,
      deal_id: dealId,
      deal_title: deal ? deal[1] : null,
      contact_id: contactId,
      first_name: contact ? contact[1] : null,
      last_name: contact ? contact[2] : null,
      user_id: userId,
      user_name: user ? user.name : null,
      avatar_color: user ? user.avatarColor : null,
      created_at: rel(daysAgo),
    };
  });

  return {
    org: { id: 'org_demo', name: 'Estudio Altamar', slug: 'estudio-altamar', plan: 'pro', currency: 'USD', locale: 'es-PA' },
    user: DEMO_USERS[0],
    users: DEMO_USERS,
    stages: DEMO_STAGES,
    pipelines: [{ id: 'p1', name: 'Ventas', is_default: 1 }],
    companies, contacts, deals, tasks, activities,
  };
}
