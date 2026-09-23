require('dotenv').config();
const bcrypt = require('bcryptjs');
const db     = require('./db');

console.log('🌱  Seeding IMG CRM database...');

// ── Roles ──────────────────────────────────────────────────────────────────
const roles = [
  { name: 'admin',          description: 'Full system access' },
  { name: 'sales_manager',  description: 'Views all opportunities, approves discounts, assigns salesmen' },
  { name: 'salesman',       description: 'Creates and manages own opportunities' },
  { name: 'design_manager', description: 'Manages design queue, assigns designers, approves quotations' },
  { name: 'designer',       description: 'Creates designs and quotations for assigned opportunities' },
  { name: 'product_manager',description: 'Owns pricelist, costing, and SKU catalogue' },
];

const insertRole = db.prepare(`INSERT OR IGNORE INTO roles (name, description) VALUES (?, ?)`);
roles.forEach(r => insertRole.run(r.name, r.description));

const getRoleId = name => db.prepare('SELECT id FROM roles WHERE name = ?').get(name).id;

// ── Permissions ────────────────────────────────────────────────────────────
const allPerms = [
  { key: 'opps.create',           category: 'Opportunities', description: 'Create new opportunities' },
  { key: 'opps.view_own',         category: 'Opportunities', description: 'View own opportunities' },
  { key: 'opps.view_all',         category: 'Opportunities', description: 'View all opportunities' },
  { key: 'opps.edit_own',         category: 'Opportunities', description: 'Edit own opportunities' },
  { key: 'opps.edit_all',         category: 'Opportunities', description: 'Edit any opportunity' },
  { key: 'opps.assign_salesman',  category: 'Opportunities', description: 'Assign salesman to opportunity' },
  { key: 'opps.assign_designer',  category: 'Opportunities', description: 'Assign designer to opportunity' },
  { key: 'opps.change_stage',     category: 'Opportunities', description: 'Advance opportunity stage' },
  { key: 'opps.close',            category: 'Opportunities', description: 'Close opportunity as Won or Lost' },
  { key: 'quot.create',           category: 'Quotations',    description: 'Create quotations' },
  { key: 'quot.review',           category: 'Quotations',    description: 'Review submitted quotations' },
  { key: 'quot.approve',          category: 'Quotations',    description: 'Approve quotations' },
  { key: 'quot.release',          category: 'Quotations',    description: 'Release quotation to salesman' },
  { key: 'quot.request_revision', category: 'Quotations',    description: 'Request quotation revision' },
  { key: 'disc.apply_standard',   category: 'Discounts',     description: 'Apply discount within limit' },
  { key: 'disc.approve_override', category: 'Discounts',     description: 'Approve discount above limit' },
  { key: 'note.create_own',       category: 'Notes',         description: 'Create personal notes' },
  { key: 'note.assign_task',      category: 'Notes',         description: 'Assign tasks to team members' },
  { key: 'note.view_team',        category: 'Notes',         description: 'View team notes and tasks' },
  { key: 'users.create',          category: 'Users',         description: 'Create users' },
  { key: 'users.edit',            category: 'Users',         description: 'Edit users' },
  { key: 'roles.manage',          category: 'Roles',         description: 'Manage roles and permissions' },
  { key: 'settings.manage',       category: 'Settings',      description: 'Manage system settings' },
  { key: 'reports.view_all',      category: 'Reports',       description: 'View all reports and analytics' },
  { key: 'costs.view',            category: 'Pricing',       description: 'See cost / margin on products & quotations' },
  { key: 'pricelist.manage',      category: 'Pricing',       description: 'Upload and edit the SKU pricelist' },
  { key: 'skus.view',             category: 'Pricing',       description: 'View SKU catalogue (no cost columns)' },
];

const insertPerm = db.prepare(`INSERT OR IGNORE INTO permissions (key, category, description) VALUES (?, ?, ?)`);
allPerms.forEach(p => insertPerm.run(p.key, p.category, p.description));

const getPermId = key => db.prepare('SELECT id FROM permissions WHERE key = ?').get(key).id;

// ── Role-Permission Matrix ─────────────────────────────────────────────────
const matrix = {
  admin: allPerms.map(p => p.key), // admin gets everything
  sales_manager: [
    'opps.create', 'opps.view_all', 'opps.edit_all', 'opps.assign_salesman', 'opps.change_stage', 'opps.close',
    'disc.approve_override', 'disc.apply_standard',
    'note.create_own', 'note.assign_task', 'note.view_team',
    'reports.view_all',
  ],
  salesman: [
    'opps.create', 'opps.view_own', 'opps.edit_own', 'opps.change_stage', 'opps.close',
    'quot.request_revision', 'disc.apply_standard',
    'note.create_own',
  ],
  design_manager: [
    'opps.view_all', 'opps.edit_all', 'opps.assign_designer',
    'quot.review', 'quot.approve', 'quot.release', 'quot.request_revision',
    'note.create_own', 'note.assign_task', 'note.view_team',
    'reports.view_all',
  ],
  designer: [
    'opps.view_own',
    'quot.create', 'quot.request_revision',
    'skus.view',
    'note.create_own',
  ],
  product_manager: [
    // Full read access across the system (Phase 8.1 — parity with high mgmt).
    'opps.view_all', 'opps.edit_all', 'opps.change_stage',
    'quot.review', 'quot.approve',
    'reports.view_all',
    'note.create_own', 'note.assign_task', 'note.view_team',
    // PM-exclusive
    'costs.view', 'pricelist.manage', 'skus.view',
  ],
};

const insertRP = db.prepare(`INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`);
Object.entries(matrix).forEach(([roleName, permKeys]) => {
  const roleId = getRoleId(roleName);
  permKeys.forEach(key => {
    const perm = db.prepare('SELECT id FROM permissions WHERE key = ?').get(key);
    if (perm) insertRP.run(roleId, perm.id);
  });
});

// ── Users ──────────────────────────────────────────────────────────────────
const DEFAULT_PASSWORD = 'IMG@2026';
const hash = bcrypt.hashSync(DEFAULT_PASSWORD, 10);

const users = [
  { name: 'Admin',    email: 'admin@img.com',    role: 'admin',           can_view_costs: 1 },
  { name: 'Essam',   email: 'essam@img.com',    role: 'sales_manager',   can_view_costs: 0 },
  { name: 'Yazan',   email: 'yazan@img.com',    role: 'salesman',        can_view_costs: 0 },
  { name: 'Mahmoud', email: 'mahmoud@img.com',  role: 'salesman',        can_view_costs: 0 },
  { name: 'Sally',   email: 'sally@img.com',    role: 'design_manager',  can_view_costs: 0 },
  { name: 'Omar',    email: 'omar@img.com',     role: 'designer',        can_view_costs: 0 },
  { name: 'Hilal',   email: 'hilal@img.com',    role: 'designer',        can_view_costs: 0 },
  // Product Management team — own the pricelist, can view costs.
  { name: 'Anas Al Dalabeeh', email: 'anas@img.com',   role: 'product_manager', can_view_costs: 1 },
  { name: 'Tamara Nabi',      email: 'tamara@img.com', role: 'product_manager', can_view_costs: 1 },
  { name: 'Hamza Jaber',      email: 'hamza@img.com',  role: 'product_manager', can_view_costs: 1 },
];

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (name, email, password_hash, role_id, can_view_costs)
  VALUES (?, ?, ?, ?, ?)
`);
const updateUserCostsFlag = db.prepare(`UPDATE users SET can_view_costs = ? WHERE email = ?`);
users.forEach(u => {
  insertUser.run(u.name, u.email, hash, getRoleId(u.role), u.can_view_costs || 0);
  updateUserCostsFlag.run(u.can_view_costs || 0, u.email);   // re-apply on idempotent re-seed
});

// ── Default Settings ───────────────────────────────────────────────────────
const settings = [
  { key: 'discount_limit',      value: '30',                                                     type: 'number', description: 'Max discount % salesman can apply without approval' },
  { key: 'designer_overload',   value: '4',                                                      type: 'number', description: 'Active tasks before designer flagged as overloaded' },
  { key: 'imi_portal_url',      value: process.env.IMI_PORTAL_URL || 'http://localhost:3000',    type: 'text',   description: 'URL for the Iraq IMI Portal' },
  { key: 'currency_default',    value: 'JOD',                                                    type: 'text',   description: 'Default currency' },
  { key: 'lost_reasons',        value: JSON.stringify(['Price too high','Competitor won','Project canceled','Customer unresponsive','Scope mismatch','Budget not approved','Went with alternative solution','Other']), type: 'list', description: 'Predefined lost reasons' },
  { key: 'lead_sources',        value: JSON.stringify(['Walk-in','Internet','Consultant','Contractor','Mapping','Referral','Customer']), type: 'list', description: 'Opportunity sources' },
  { key: 'segments',            value: JSON.stringify(['Commercial','Residential','Government','Industrial']), type: 'list', description: 'Market segments' },
  { key: 'product_groups',      value: JSON.stringify(['VRF','Wall-mounted Split','Cassette','Ducted','Floor-standing / Ceiling','Chillers','AHU','Fan Coils','Controls & Accessories','Plumbing']), type: 'list', description: 'Product categories (multi-select on deals)' },
  { key: 'activity_types',      value: JSON.stringify(['Call','Meeting','Task','Deadline']),      type: 'list',   description: 'Activity types' },
  { key: 'currencies',          value: JSON.stringify(['JOD','USD','EUR']),                      type: 'list',   description: 'Available currencies' },
];

const insertSetting = db.prepare(`
  INSERT OR IGNORE INTO settings (key, value, type, description) VALUES (?, ?, ?, ?)
`);
settings.forEach(s => insertSetting.run(s.key, s.value, s.type, s.description));

// ── Default Labels ─────────────────────────────────────────────────────────
const labels = [
  { name: 'Urgent',          color: '#EF4444' },
  { name: 'VIP Client',      color: '#8B5CF6' },
  { name: 'Government',      color: '#3B82F6' },
  { name: 'Repeat Customer', color: '#10B981' },
];
const insertLabel = db.prepare(`INSERT OR IGNORE INTO labels (name, color) VALUES (?, ?)`);
labels.forEach(l => insertLabel.run(l.name, l.color));

// ── Default Lost Reasons ───────────────────────────────────────────────────
const lostReasons = [
  'Price too high', 'Competitor won', 'Project canceled/postponed',
  'Customer unresponsive', 'Scope mismatch', 'Budget not approved',
  'Went with alternative solution', 'Other',
];
const insertLR = db.prepare(`INSERT OR IGNORE INTO lost_reasons (label) VALUES (?)`);
lostReasons.forEach(l => insertLR.run(l));

// ── GREE pricing parameters (from GREE_CRM_Pricing_Module.xlsx) ─────────────
// INSERT OR IGNORE so re-seeding never clobbers values the pricing owner edited.
const pricingParams = [
  ['GLOBAL', 'FX_USD_JOD', 'USD to JOD exchange rate', 0.71],
  ['GLOBAL', 'ROUND_STEP', 'Rounding step for published prices (JOD)', 5],
  ['GLOBAL', 'STAX_DIV',   'Sales-tax divisor (Inclusive → Sales-Tax-Exempt)', 1.16],
  ['GLOBAL', 'CUST_DIV',   'Customs divisor (STax-Exempt → Fully Exempted)', 1.15],
  ['U-Match Projects', 'UMP_SHIP', 'Shipping %', 0.10],
  ['U-Match Projects', 'UMP_CUST', 'Custom duties %', 0.16],
  ['U-Match Projects', 'UMP_EXTRA', 'Extra multi %', 0.05],
  ['U-Match Projects', 'UMP_TAX', 'Sales tax %', 0.16],
  ['U-Match Projects', 'UMP_COPPER', 'Free copper pipes (JOD/set)', 140],
  ['U-Match Projects', 'UMP_INSTALL', 'Installation (JOD/set)', 75],
  ['U-Match Projects', 'UMP_T1', 'Discount tier 1 (Sales Engineer)', 0.25],
  ['U-Match Projects', 'UMP_T2', 'Discount tier 2 (HVAC Manager)', 0.40],
  ['GMV', 'GMV_SHIP', 'Shipping %', 0.12],
  ['GMV', 'GMV_CUST', 'Custom duties %', 0.16],
  ['GMV', 'GMV_EXTRA', 'Extra multi %', 0.05],
  ['GMV', 'GMV_TAX', 'Sales tax %', 0.16],
  ['GMV', 'GMV_T1', 'Discount tier 1', 0.25],
  ['GMV', 'GMV_T2', 'Discount tier 2', 0.30],
  ['GMV', 'GMV_T3', 'Discount tier 3', 0.35],
  ['GMV', 'GMV_T4', 'Discount tier 4 (deepest)', 0.40],
  ['FCU', 'FCU_SHIP', 'Shipping %', 0.12],
  ['FCU', 'FCU_CUST', 'Custom duties %', 0.16],
  ['FCU', 'FCU_EXTRA', 'Extra multi %', 0.05],
  ['FCU', 'FCU_TAX', 'Sales tax %', 0.16],
  ['FCU', 'FCU_T1', 'Discount tier 1', 0.25],
  ['FCU', 'FCU_T2', 'Discount tier 2', 0.30],
  ['FCU', 'FCU_T3', 'Discount tier 3', 0.35],
  ['FCU', 'FCU_T4', 'Discount tier 4 (deepest)', 0.40],
  ['CCU', 'CCU_SHIP', 'Shipping %', 0.20],
  ['CCU', 'CCU_CUST', 'Custom duties %', 0.16],
  ['CCU', 'CCU_EXTRA', 'Extra multi %', 0.05],
  ['CCU', 'CCU_TAX', 'Sales tax %', 0.16],
  ['CCU', 'CCU_T1', 'Discount tier 1', 0.25],
  ['CCU', 'CCU_T2', 'Discount tier 2', 0.30],
  ['CCU', 'CCU_T3', 'Discount tier 3', 0.35],
  ['CCU', 'CCU_T4', 'Discount tier 4 (deepest)', 0.40],
  // Default target GP% per category — pre-fills the per-item "Suggest" and the
  // group "Set price → target GP" action. Editable like any parameter.
  ['U-Match Projects', 'UMP_TGP', 'Default target GP %', 0.50],
  ['GMV', 'GMV_TGP', 'Default target GP %', 0.45],
  ['FCU', 'FCU_TGP', 'Default target GP %', 0.45],
  ['CCU', 'CCU_TGP', 'Default target GP %', 0.45],
];
const insertPP = db.prepare(`INSERT OR IGNORE INTO pricing_params (category, code, label, value) VALUES (?, ?, ?, ?)`);
pricingParams.forEach(p => insertPP.run(p[0], p[1], p[2], p[3]));

console.log('✅  Seed complete!');
console.log(`    Default password for all users: ${DEFAULT_PASSWORD}`);
console.log('    Users: admin, essam, yazan, mahmoud, sally, omar, hilal  (@img.com)');
