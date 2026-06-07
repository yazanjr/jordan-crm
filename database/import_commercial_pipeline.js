// One-off import: replace ALL demo data with the real Commercial Pipeline + Contractors List.
// Safe to re-run — wipes opportunities, contacts, organizations, deal_contacts, users (preserves roles).
// Run with: node database/import_commercial_pipeline.js
require('dotenv').config();
const XLSX   = require('xlsx');
const bcrypt = require('bcryptjs');
const db     = require('./db');

const SOURCE = 'O:/___Shared/To Hamzeh Jaber/project-portal/Jordan System/Commercial Pipeline - Abdallah09052026.xlsx';

console.log('📥  Importing from:', SOURCE);

// ---------- Step 1: Schema additions (idempotent) ----------
function addCol(table, col, def) {
  const has = db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col);
  if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
addCol('opportunities', 'system',            'TEXT');
addCol('opportunities', 'sub_system',        'TEXT');
addCol('opportunities', 'brand',             'TEXT');
addCol('opportunities', 'owner_rep',         'TEXT');
addCol('opportunities', 'installation_by',   'TEXT');
addCol('opportunities', 'signing_price',     'REAL');
addCol('opportunities', 'lost_to_whom',      'TEXT');
addCol('opportunities', 'next_action',       'TEXT');
addCol('opportunities', 'remarks',           'TEXT');
addCol('opportunities', 'person_responsible', 'TEXT');
addCol('opportunities', 'sales_tax',          'REAL');
addCol('opportunities', 'price_exempted',     'REAL');
addCol('opportunities', 'expected_closing',   'TEXT');
addCol('opportunities', 'owner_name',         'TEXT');
db.exec(`
  CREATE TABLE IF NOT EXISTS deal_contacts (
    opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    contact_id     INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    role           TEXT NOT NULL,
    PRIMARY KEY (opportunity_id, contact_id, role)
  );
`);
console.log('  ✓ Schema columns + deal_contacts asserted');

// ---------- Step 2: Read the Excel file ----------
const wb             = XLSX.readFile(SOURCE);
const pipelineRows   = XLSX.utils.sheet_to_json(wb.Sheets['Commercial Pipeline'], { defval: null });
const contractorRows = XLSX.utils.sheet_to_json(wb.Sheets['Contractors List'],   { defval: null });
console.log(`  ✓ Read ${pipelineRows.length} deal rows + ${contractorRows.length} contractor rows from Excel`);

// ---------- Helpers ----------
function s(v) { return v == null ? null : (String(v).trim() || null); }
function n(v) { return (v == null || v === '') ? null : (Number(v) || null); }
function normalizeName(v) { return v == null ? '' : String(v).trim().replace(/\s+/g, ' '); }
// A name "looks like a company" if it carries a company token. Arabic + English.
const COMPANY_RE = /شركة|مؤسسة|مكتب|مجموعة|للمقاولات|للتجارة|\bCo\.?\b|\bCompany\b|\bEst\.?\b|\bGroup\b|\bLLC\b|\bLtd\b|\bCorp\b/i;
function looksLikeCompany(name) { return COMPANY_RE.test(name || ''); }

db.exec('BEGIN');
try {
  // ---------- Step 3: Wipe all transactional data + all users ----------
  db.prepare('DELETE FROM design_stage_history').run();
  db.prepare('DELETE FROM quotation_versions').run();
  db.prepare('DELETE FROM design_requests').run();
  db.prepare('DELETE FROM stage_history').run();
  db.prepare('DELETE FROM quotations').run();
  db.prepare('DELETE FROM discount_approvals').run();
  db.prepare('DELETE FROM activities').run();
  db.prepare('DELETE FROM notifications').run();
  db.prepare('DELETE FROM opp_labels').run();
  db.prepare('DELETE FROM attachments').run();
  db.prepare('DELETE FROM deal_contacts').run();
  db.prepare('DELETE FROM opportunities').run();
  db.prepare('DELETE FROM contacts').run();
  db.prepare('DELETE FROM organizations').run();
  db.prepare('DELETE FROM users').run();
  db.prepare(`DELETE FROM sqlite_sequence WHERE name IN ('users','organizations','contacts','opportunities')`).run();
  console.log('  ✓ All transactional data + users wiped');

  // ---------- Step 4: Create the real user roster ----------
  const hash = bcrypt.hashSync('IMG@2026', 10);
  const getRoleId = (name) => db.prepare(`SELECT id FROM roles WHERE name = ?`).get(name).id;
  const insertUser = db.prepare(`INSERT INTO users (name, email, password_hash, role_id) VALUES (?, ?, ?, ?)`);
  const roster = [
    { name: 'Admin',                email: 'admin@img.com',     role: 'admin'          },
    { name: 'Abdallah Hammad',      email: 'abdallah@img.com',  role: 'sales_manager'  },
    { name: 'Alaa Rawashdeh',       email: 'alaa@img.com',      role: 'salesman'       },
    { name: 'Ahmad Al Khatib',      email: 'ahmadk@img.com',    role: 'salesman'       },
    { name: 'Waleed Maree',         email: 'waleed@img.com',    role: 'salesman'       },
    { name: 'Mohammad Al Ayde',     email: 'mohammad@img.com',  role: 'salesman'       },
    { name: 'Anas Haddad',          email: 'anas@img.com',      role: 'salesman'       },
    { name: 'Loay Hussain',         email: 'loay@img.com',      role: 'salesman'       },
    { name: 'Eyad Abdel Hadi',      email: 'eyad@img.com',      role: 'salesman'       },
    { name: 'Sally Haddad',         email: 'sally.h@img.com',   role: 'design_manager' },
    { name: 'Ahmad Al Joulani',     email: 'ahmad.j@img.com',   role: 'designer'       },
    { name: 'Muhannad Al Fakhouri', email: 'muhannad@img.com',  role: 'designer'       },
    { name: 'Amer Darwish',         email: 'amer@img.com',      role: 'designer'       },
    { name: 'Omar Al Ajlouni',      email: 'omar.a@img.com',    role: 'designer'       },
    { name: 'Hilal Miqdadi',        email: 'hilal.m@img.com',   role: 'designer'       },
  ];
  roster.forEach(u => insertUser.run(u.name, u.email, hash, getRoleId(u.role)));
  console.log(`  ✓ Created ${roster.length} real users (password: IMG@2026)`);

  const userIdByName = {};
  db.prepare(`SELECT id, name FROM users`).all().forEach(u => userIdByName[u.name] = u.id);
  userIdByName['Ahmad Khatib'] = userIdByName['Ahmad Al Khatib']; // Contractors List spelling
  function resolveSalesman(raw) {
    if (!raw) return null;
    const firstName = String(raw).split(/[\r\n]/)[0].trim(); // co-assigned cells: pick primary
    return userIdByName[firstName] || null;
  }

  // ---------- Shared org + contact dedup helpers ----------
  const orgInsert = db.prepare(`INSERT INTO organizations (name, type) VALUES (?, ?)`);
  const orgIdByKey = {};                          // `${type}|${normName}` -> id
  function findOrCreateOrg(rawName, type) {
    const name = normalizeName(rawName);
    if (!name) return null;
    const key = `${type}|${name.toLowerCase()}`;
    if (!orgIdByKey[key]) orgIdByKey[key] = orgInsert.run(name, type).lastInsertRowid;
    return orgIdByKey[key];
  }

  const contactInsert = db.prepare(`INSERT INTO contacts (name, phones, emails, organization_id, notes) VALUES (?, '[]', '[]', ?, ?)`);
  const contactSetOrg = db.prepare(`UPDATE contacts SET organization_id = ? WHERE id = ? AND organization_id IS NULL`);
  const contactSetNote = db.prepare(`UPDATE contacts SET notes = ? WHERE id = ? AND (notes IS NULL OR notes = '')`);
  const contactIdByName = {};                     // normName(lowercased) -> id
  // Find-or-create a contact, deduped by normalized name. Optionally enriches an
  // existing record's org/notes when they're still empty.
  function findOrCreateContact(rawName, { organizationId = null, notes = null } = {}) {
    const name = normalizeName(rawName);
    if (!name) return null;
    const key = name.toLowerCase();
    if (contactIdByName[key]) {
      const id = contactIdByName[key];
      if (organizationId) contactSetOrg.run(organizationId, id);
      if (notes)          contactSetNote.run(notes, id);
      return id;
    }
    const id = contactInsert.run(name, organizationId, notes).lastInsertRowid;
    contactIdByName[key] = id;
    return id;
  }

  const linkInsert = db.prepare(`INSERT OR IGNORE INTO deal_contacts (opportunity_id, contact_id, role) VALUES (?, ?, ?)`);

  // ---------- Step 5: Insert opportunities + extract per-deal contacts ----------
  const oppInsert = db.prepare(`
    INSERT INTO opportunities (
      title, org_id, owner_name, contractor, eng_office, owner_rep,
      expected_value, sales_tax, price_exempted, signing_price, currency,
      stage, status,
      system, sub_system, brand, installation_by,
      lost_to_whom, lost_notes,
      district, segment,
      salesman_id, person_responsible, expected_closing,
      next_action, remarks, notes,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'JOD', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  let imported = 0, salesmanMissing = 0, linksCreated = 0;
  pipelineRows.forEach(r => {
    const title = s(r['Project Name']);
    if (!title) return;

    const ownerName = s(r.Owner);
    // Owner becomes a Customer org only when the name looks like a company.
    const orgId = (ownerName && looksLikeCompany(ownerName)) ? findOrCreateOrg(ownerName, 'Customer') : null;

    const status = s(r.Status) || 'Active';
    let   stage  = s(r.Stage) || 'Prospect';
    const salesmanId = resolveSalesman(r['Sales Engineer']);
    if (!salesmanId && r['Sales Engineer']) salesmanMissing++;

    const expectedValue = n(r[' Quotation Price List ']) || 0;
    const salesTax = n(r['Sales Tax']) || 0;
    const exempted = n(r[' Quotation Price List (Exempted) ']) ?? (salesTax ? expectedValue / (1 + salesTax) : expectedValue);

    const info = oppInsert.run(
      title,
      orgId,
      ownerName,
      s(r.Contractor),
      s(r.Consultant),
      s(r['Owner Rep']),
      expectedValue,
      salesTax,
      exempted,
      n(r['Signing Price']),
      stage, status,
      s(r.System), s(r['Sub-System']), s(r.Brand), s(r.Installation),
      s(r['Lost (To Whom)']), s(r['Lost (Reason)']),
      s(r['Project Location']), s(r.Sector),
      salesmanId,
      s(r['Person Responsible']),
      s(r['Expected Closing']),
      s(r['Next action']),
      s(r.Remarks),
      null,                       // notes — reserved for in-app use
    );
    const oppId = info.lastInsertRowid;
    imported++;

    // Extract the 4 people on this deal as deduplicated contacts + role links.
    const roleFields = [
      ['Owner',      ownerName],
      ['Owner Rep',  s(r['Owner Rep'])],
      ['Contractor', s(r.Contractor)],
      ['Consultant', s(r.Consultant)],
    ];
    roleFields.forEach(([role, value]) => {
      if (!value) return;
      const contactId = findOrCreateContact(value);
      if (contactId) { linkInsert.run(oppId, contactId, role); linksCreated++; }
    });
  });
  console.log(`  ✓ Imported ${imported} opportunities + ${linksCreated} deal-contact links`);
  if (salesmanMissing) console.log(`  ⚠ ${salesmanMissing} rows had unmatched Sales Engineer — salesman_id=null`);

  // ---------- Step 6: Contractors List → contractor orgs + (merged) contacts ----------
  // Each row: ensure the contractor company exists as an org, and merge the contact
  // person into the SAME deduped pool (so a person who is also a deal's Contractor
  // is one record). The Excel "Notes" enriches the contact; org link is set if empty.
  let contractorsCreated = 0, contactsTouched = 0;
  contractorRows.forEach(r => {
    const company = s(r.Company);
    const person  = s(r['Contact person']);
    const note    = s(r.Notes);
    if (!company && !person) return;
    const orgId = company ? findOrCreateOrg(company, 'Contractor') : null;
    if (orgId) contractorsCreated++;
    if (person) { findOrCreateContact(person, { organizationId: orgId, notes: note }); contactsTouched++; }
  });
  console.log(`  ✓ Contractors List merged: ${contractorsCreated} contractor-org touches, ${contactsTouched} contact rows`);

  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('❌  IMPORT FAILED, rolled back:', e);
  process.exit(1);
}

// ---------- Summary ----------
const counts = {
  users:         db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_active = 1').get().n,
  opportunities: db.prepare('SELECT COUNT(*) AS n FROM opportunities').get().n,
  organizations: db.prepare('SELECT COUNT(*) AS n FROM organizations').get().n,
  contacts:      db.prepare('SELECT COUNT(*) AS n FROM contacts').get().n,
  deal_contacts: db.prepare('SELECT COUNT(*) AS n FROM deal_contacts').get().n,
};
const byStatus    = db.prepare(`SELECT status, COUNT(*) AS n FROM opportunities GROUP BY status ORDER BY n DESC`).all();
const byStage     = db.prepare(`SELECT stage, COUNT(*) AS n FROM opportunities WHERE status='Active' GROUP BY stage ORDER BY n DESC`).all();
const orgByType   = db.prepare(`SELECT type, COUNT(*) AS n FROM organizations GROUP BY type`).all();
const linksByRole = db.prepare(`SELECT role, COUNT(*) AS n FROM deal_contacts GROUP BY role ORDER BY n DESC`).all();
const multiRole   = db.prepare(`
  SELECT COUNT(*) AS n FROM (
    SELECT contact_id FROM deal_contacts GROUP BY contact_id HAVING COUNT(*) > 1
  )
`).get().n;
const splitData = db.prepare(`
  SELECT
    SUM(CASE WHEN next_action       IS NOT NULL AND next_action       <> '' THEN 1 ELSE 0 END) AS with_next_action,
    SUM(CASE WHEN remarks           IS NOT NULL AND remarks           <> '' THEN 1 ELSE 0 END) AS with_remarks,
    SUM(CASE WHEN person_responsible IS NOT NULL AND person_responsible <> '' THEN 1 ELSE 0 END) AS with_person_resp,
    SUM(CASE WHEN expected_closing  IS NOT NULL AND expected_closing  <> '' THEN 1 ELSE 0 END) AS with_exp_closing
  FROM opportunities
`).get();

console.log('\n=========== IMPORT SUMMARY ===========');
console.log('Counts:', counts);
console.log('\nOrgs by type:'); orgByType.forEach(r => console.log(`  ${r.type.padEnd(16)} ${r.n}`));
console.log('\nDeals by status:'); byStatus.forEach(r => console.log(`  ${r.status.padEnd(16)} ${r.n}`));
console.log('\nActive deals by stage:'); byStage.forEach(r => console.log(`  ${r.stage.padEnd(16)} ${r.n}`));
console.log('\nDeal-contact links by role:'); linksByRole.forEach(r => console.log(`  ${r.role.padEnd(16)} ${r.n}`));
console.log(`\nContacts appearing on >1 deal/role: ${multiRole}`);
console.log('\nOpportunity field coverage:');
console.log(`  next_action: ${splitData.with_next_action}, remarks: ${splitData.with_remarks}, person_responsible: ${splitData.with_person_resp}, expected_closing: ${splitData.with_exp_closing}`);
console.log('======================================\n');
