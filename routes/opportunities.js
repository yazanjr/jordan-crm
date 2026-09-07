const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const XLSX    = require('xlsx');
const db      = require('../database/db');
const authMw  = require('../middleware/auth');
const demoAuth = require('../middleware/demoAuth');
const { requirePerm } = require('../middleware/permission');

const router = express.Router();
// Temporarily using demoAuth (same as design routes) until B.4 adds real login.
// To switch to real JWT: replace demoAuth with authMw.
router.use(demoAuth);

const STAGES = ['Lead', 'Prospect', 'Tender', 'Analysis', 'Negotiation', 'Closing'];

// ── Reference endpoints any authenticated user needs ─────────────────────────
// GET /api/opportunities/meta/lost-reasons
router.get('/meta/lost-reasons', (req, res) => {
  const rows = db.prepare('SELECT id, label FROM lost_reasons WHERE is_active = 1 ORDER BY id').all();
  res.json(rows);
});

// GET /api/opportunities/meta/users  — lightweight user list (id, name only)
// Available to any authenticated user; needed for owner pickers and person filter.
router.get('/meta/users', (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.name, r.name AS role, COALESCE(u.is_senior, 0) AS is_senior
    FROM users u JOIN roles r ON r.id = u.role_id
    WHERE u.is_active = 1
    ORDER BY u.name
  `).all();
  res.json(rows);
});

// GET /api/opportunities/meta/product-groups — the editable master list.
// Source of truth is the `product_groups` setting (managed in the Settings page);
// falls back to the IMG baseline. NOT merged with raw deal values, because
// product_group now stores a JSON array (multi-select) that would pollute the list.
const PRODUCT_GROUP_BASELINE = ['VRF', 'Wall-mounted Split', 'Cassette', 'Ducted', 'Floor-standing / Ceiling', 'Chillers', 'AHU', 'Fan Coils', 'Controls & Accessories', 'Plumbing'];
router.get('/meta/product-groups', (req, res) => {
  let list = null;
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'product_groups'`).get();
  if (row && row.value) { try { const p = JSON.parse(row.value); if (Array.isArray(p) && p.length) list = p; } catch {} }
  res.json(list || PRODUCT_GROUP_BASELINE);
});

// GET /api/opportunities/meta/areas — managed "Project Location" list.
// Seed order (id) is preserved so Amman stays first.
router.get('/meta/areas', (req, res) => {
  const rows = db.prepare(`SELECT name FROM areas WHERE is_active = 1 ORDER BY id`).all();
  res.json(rows.map(r => r.name));
});

// POST /api/opportunities/meta/areas  { name }  — create-if-not-exists.
// Any salesman can add a new area from the New Deal form (search-or-create).
router.post('/meta/areas', (req, res) => {
  const name = (req.body && req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required.' });
  db.prepare(`INSERT OR IGNORE INTO areas (name) VALUES (?)`).run(name);
  const rows = db.prepare(`SELECT name FROM areas WHERE is_active = 1 ORDER BY id`).all();
  res.json({ success: true, areas: rows.map(r => r.name) });
});

// Multer — store uploads on disk
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(process.env.UPLOADS_PATH || './uploads', String(req.params.id || 'tmp'));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[/\\:*?"<>|]/g, '_')}`),
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

function notify(io, userIds, type, message, oppId) {
  if (!io) return;
  const insert = db.prepare(`INSERT INTO notifications (user_id, type, message, opp_id) VALUES (?, ?, ?, ?)`);
  userIds.forEach(uid => {
    if (!uid) return;
    insert.run(uid, type, message, oppId || null);
    io.to(`user:${uid}`).emit('notification', { type, message });
  });
}

function enrichOpp(opp) {
  if (!opp) return null;
  const labels = db.prepare(`
    SELECT l.* FROM labels l JOIN opp_labels ol ON ol.label_id = l.id WHERE ol.opp_id = ?
  `).all(opp.id);
  const stageHistory = db.prepare(`
    SELECT sh.*, u.name AS changed_by_name FROM stage_history sh
    LEFT JOIN users u ON u.id = sh.changed_by WHERE sh.opp_id = ? ORDER BY sh.changed_at
  `).all(opp.id);

  // Phase 4 — unified activity feed: stage moves + design events + contact links.
  // Each event has { type, at, by, summary } and optional payload fields.
  const events = [];
  stageHistory.forEach(h => events.push({
    type: 'stage',
    at: h.changed_at,
    by: h.changed_by_name || '',
    summary: h.from_stage
      ? `Moved ${h.from_stage} → ${h.to_stage}`
      : `Created at ${h.to_stage}`,
  }));
  // Design requests on this opp (creation, modification, return).
  const designs = db.prepare(`
    SELECT dr.id, dr.request_type, dr.modification_reason, dr.design_stage,
           dr.returned_reason, dr.created_at, dr.updated_at, dr.version,
           u.name AS requested_by_name
    FROM design_requests dr LEFT JOIN users u ON u.id = dr.requested_by
    WHERE dr.opportunity_id = ? ORDER BY dr.id
  `).all(opp.id);
  designs.forEach(d => {
    const label = d.request_type === 'Modification'
      ? `Modification requested (v${d.version}${d.modification_reason ? ' — ' + d.modification_reason : ''})`
      : 'Design requested';
    events.push({ type: 'design', at: d.created_at, by: d.requested_by_name || '', summary: label });
    if (d.design_stage === 'Returned' && d.returned_reason) {
      events.push({ type: 'design_returned', at: d.updated_at, by: '', summary: `Design returned: ${d.returned_reason}` });
    }
    if (d.design_stage === 'Released') {
      events.push({ type: 'design_released', at: d.updated_at, by: '', summary: `Quotation released (v${d.version})` });
    }
  });
  // Contact links (needs the created_at column we added — fallback if missing).
  try {
    const links = db.prepare(`
      SELECT dc.role, dc.created_at, c.name AS contact_name
      FROM deal_contacts dc JOIN contacts c ON c.id = dc.contact_id
      WHERE dc.opportunity_id = ? AND dc.created_at IS NOT NULL
    `).all(opp.id);
    links.forEach(l => events.push({
      type: 'contact_added', at: l.created_at, by: '',
      summary: `Linked ${l.contact_name} as ${l.role}`,
    }));
  } catch { /* created_at not yet migrated — skip */ }
  events.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));   // newest first

  // The 4 people on this deal (Owner / Owner Rep / Contractor / Consultant).
  // Phase 6 — also surface is_blacklisted + a `shared_with` count of OTHER salesmen
  // who have this contact on their deals.
  const contacts = db.prepare(`
    SELECT dc.role, c.id, c.name, c.phones, c.emails, c.organization_id, c.is_blacklisted, c.blacklist_reason,
           o.name AS org_name
    FROM deal_contacts dc
    JOIN contacts c ON c.id = dc.contact_id
    LEFT JOIN organizations o ON o.id = c.organization_id
    WHERE dc.opportunity_id = ?
    ORDER BY CASE dc.role
      WHEN 'Owner' THEN 1 WHEN 'Owner Rep' THEN 2
      WHEN 'Contractor' THEN 3 WHEN 'Consultant' THEN 4 ELSE 5 END, c.name
  `).all(opp.id).map(c => {
    const otherSalesmen = db.prepare(`
      SELECT COUNT(DISTINCT o2.salesman_id) AS n
      FROM deal_contacts dc2 JOIN opportunities o2 ON o2.id = dc2.opportunity_id
      WHERE dc2.contact_id = ? AND o2.id <> ? AND o2.salesman_id IS NOT NULL AND o2.salesman_id <> ?
    `).get(c.id, opp.id, opp.salesman_id || 0).n || 0;
    return {
      ...c,
      phones: JSON.parse(c.phones || '[]'),
      emails: JSON.parse(c.emails || '[]'),
      shared_with: otherSalesmen,         // 0 means no overlap with other salesmen
    };
  });

  // `history` kept for any legacy consumers; `events` is the new unified feed.
  return { ...opp, labels, history: stageHistory, events, contacts };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXCEL EXPORT / BULK IMPORT (available to every signed-in user)
// Import is reversible: preview-before-commit + one-click Undo of a batch.
// These MUST be declared before GET /:id so "/export" isn't parsed as an id.
// ═══════════════════════════════════════════════════════════════════════════

// Header names the importer understands (also the template's header row).
const IMPORT_HEADERS = ['Deal name', 'Account/Customer', 'Contact name', 'Contact email',
  'Contact phone', 'Salesman', 'Product groups', 'Segment', 'Project location', 'Map link',
  'Expected close date', 'Stage', 'Notes'];

const _norm = s => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');

// Read a cell from a sheet-row object by any of several header aliases.
function _cell(rowObj, ...aliases) {
  const want = aliases.map(_norm);
  for (const k of Object.keys(rowObj)) {
    if (want.includes(_norm(k))) { const v = rowObj[k]; return v == null ? '' : String(v).trim(); }
  }
  return '';
}

// Shared deal-list query (respects role scoping + the same filters as GET /).
function queryDeals(req) {
  const canViewAll = db.prepare(`SELECT 1 FROM permissions p JOIN role_permissions rp ON rp.permission_id = p.id WHERE rp.role_id = ? AND p.key = 'opps.view_all'`).get(req.user.role_id);
  const { stage, status, salesman_id, search } = req.query;
  let sql = `SELECT o.*, c.name AS contact_name, org.name AS org_name, s.name AS salesman_name
    FROM opportunities o
    LEFT JOIN contacts c ON c.id = o.contact_id
    LEFT JOIN organizations org ON org.id = o.org_id
    LEFT JOIN users s ON s.id = o.salesman_id WHERE 1=1`;
  const params = [];
  if (!canViewAll) { sql += ` AND o.salesman_id = ?`; params.push(req.user.id); }
  if (stage)       { sql += ` AND o.stage = ?`;       params.push(stage); }
  if (status)      { sql += ` AND o.status = ?`;      params.push(status); }
  if (salesman_id) { sql += ` AND o.salesman_id = ?`; params.push(salesman_id); }
  if (search)      { sql += ` AND o.title LIKE ?`;    params.push(`%${search}%`); }
  sql += ` ORDER BY o.updated_at DESC`;
  return db.prepare(sql).all(...params);
}

function dealToExportRow(o) {
  let groups = o.product_group || '';
  try { const p = JSON.parse(o.product_group); if (Array.isArray(p)) groups = p.join(', '); } catch {}
  return {
    'Deal name': o.title || '', 'Account/Customer': o.org_name || '', 'Contact name': o.contact_name || '',
    'Salesman': o.salesman_name || '', 'Stage': o.stage || '', 'Status': o.status || '',
    'Value': o.expected_value || 0, 'Currency': o.currency || '', 'Product groups': groups,
    'Segment': o.segment || '', 'System': o.system || '', 'Sub-System': o.sub_system || '',
    'Brand': o.brand || '', 'Project location': o.district || '', 'Map link': o.location_url || '',
    'Consultant': o.eng_office || '', 'Contractor': o.contractor || '',
    'Expected closing': o.expected_closing || o.close_date || '', 'Next action': o.next_action || '',
    'Remarks': o.remarks || '', 'Created': o.created_at || '',
  };
}

function sendWorkbook(res, wb, filename) {
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buf);
}

// GET /api/opportunities/export — current (filtered, role-scoped) pipeline as .xlsx
router.get('/export', (req, res) => {
  const rows = queryDeals(req);
  const ws = XLSX.utils.json_to_sheet(rows.map(dealToExportRow));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pipeline');
  sendWorkbook(res, wb, `pipeline-${new Date().toISOString().slice(0, 10)}.xlsx`);
});

// GET /api/opportunities/import-template — blank sheet with the expected headers
router.get('/import-template', (req, res) => {
  const example = ['Example — Marka Tower VRF', 'Marka Real Estate Co.', 'Mr. Sample Client',
    'client@example.com', '07 9000 0000', '', 'VRF, Ducted', 'Commercial', 'Amman', '',
    '2026-12-31', 'Prospect', 'Optional notes — delete this example row'];
  const ws = XLSX.utils.aoa_to_sheet([IMPORT_HEADERS, example]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Deals');
  sendWorkbook(res, wb, 'pipeline-import-template.xlsx');
});

const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// POST /api/opportunities/import  (form: file, commit)  — preview when commit!=true.
router.post('/import', importUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded (form field "file").' });
  const commit = String(req.body.commit) === 'true' || req.body.commit === true;

  let wb;
  try { wb = XLSX.read(req.file.buffer, { type: 'buffer' }); }
  catch (e) { return res.status(400).json({ error: 'Could not read the Excel file: ' + e.message }); }
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = sheet ? XLSX.utils.sheet_to_json(sheet, { defval: '' }) : [];
  if (!raw.length) return res.status(400).json({ error: 'The sheet has no data rows.' });

  const orgByName = new Map();
  db.prepare('SELECT id, name FROM organizations').all().forEach(o => orgByName.set(_norm(o.name), o.id));
  const userByName = new Map();
  db.prepare(`SELECT id, name FROM users WHERE is_active = 1`).all().forEach(u => {
    userByName.set(_norm(u.name), u.id);
    userByName.set(_norm(String(u.name).split(' ')[0]), u.id);
  });
  const STAGE_LC = {}; STAGES.forEach(s => STAGE_LC[s.toLowerCase()] = s);

  const parsed = []; const errors = [];
  raw.forEach((r) => {
    const rowNum = (r.__rowNum__ != null ? r.__rowNum__ + 1 : parsed.length + errors.length + 2);
    const title = _cell(r, 'Deal name', 'Deal', 'Title', 'Name');
    const account = _cell(r, 'Account/Customer', 'Account', 'Customer', 'Company', 'Organization');
    if (!title && !account && Object.values(r).every(v => String(v).trim() === '')) return; // blank row
    const err = [];
    if (!title) err.push('Missing Deal name');
    if (!account) err.push('Missing Account/Customer');

    let stage = 'Prospect';
    const stageRaw = _cell(r, 'Stage');
    if (stageRaw) { const m = STAGE_LC[stageRaw.toLowerCase()]; if (!m) err.push(`Invalid stage "${stageRaw}"`); else stage = m; }

    let salesmanId = req.user.id;
    const smRaw = _cell(r, 'Salesman', 'Sales Engineer', 'Owner');
    if (smRaw) { const uid = userByName.get(_norm(smRaw)) || userByName.get(_norm(smRaw.split(' ')[0])); if (!uid) err.push(`Unknown salesman "${smRaw}"`); else salesmanId = uid; }

    let closeIso = null;
    const closeRaw = _cell(r, 'Expected close date', 'Expected closing', 'Close date');
    if (closeRaw) { const d = new Date(closeRaw); if (!isNaN(d.getTime())) closeIso = d.toISOString().slice(0, 10); }

    const groupsRaw = _cell(r, 'Product groups', 'Product group', 'Products');
    const groups = groupsRaw ? groupsRaw.split(/[,;/]+/).map(s => s.trim()).filter(Boolean) : [];

    const rec = {
      rowNum, title, account,
      contact_name: _cell(r, 'Contact name', 'Contact'),
      contact_email: _cell(r, 'Contact email', 'Email'),
      contact_phone: _cell(r, 'Contact phone', 'Phone'),
      salesmanId, stage,
      segment: _cell(r, 'Segment', 'Sector'),
      district: _cell(r, 'Project location', 'Location', 'Area', 'District'),
      location_url: _cell(r, 'Map link', 'Map', 'Location URL'),
      close_date: closeIso,
      notes: _cell(r, 'Notes', 'Remarks'),
      product_group: groups.length ? JSON.stringify(groups) : null,
      existingOrgId: orgByName.get(_norm(account)) || null,
    };
    if (err.length) errors.push({ row: rowNum, deal: title || account || '(blank)', reason: err.join('; ') });
    else parsed.push(rec);
  });

  const newOrgNames = new Set();
  parsed.forEach(p => { if (!p.existingOrgId) newOrgNames.add(_norm(p.account)); });
  const report = {
    total: parsed.length + errors.length, valid: parsed.length, skipped: errors.length, errors,
    new_customers: newOrgNames.size, new_contacts: parsed.filter(p => p.contact_name).length,
  };

  if (!commit) return res.json({ preview: true, ...report });
  if (!parsed.length) return res.status(400).json({ error: 'Nothing to import — every row had an error.', ...report });

  db.exec('BEGIN');
  try {
    const batchId = db.prepare(`INSERT INTO import_batches (uploaded_by, filename) VALUES (?, ?)`)
      .run(req.user.id, req.file.originalname || 'import.xlsx').lastInsertRowid;
    const createdOrgIds = []; const createdContactIds = [];
    const localOrg = new Map(orgByName);

    const insOrg = db.prepare(`INSERT INTO organizations (name, type) VALUES (?, 'Customer')`);
    const insContact = db.prepare(`INSERT INTO contacts (name, emails, phones, organization_id) VALUES (?,?,?,?)`);
    const insArea = db.prepare(`INSERT OR IGNORE INTO areas (name) VALUES (?)`);
    const insOpp = db.prepare(`INSERT INTO opportunities
      (title, contact_id, org_id, segment, district, product_group, location_url, close_date, notes,
       salesman_id, created_by, stage, status, import_batch_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'Active', ?)`);
    const insHist = db.prepare(`INSERT INTO stage_history (opp_id, from_stage, to_stage, changed_by) VALUES (?, NULL, ?, ?)`);

    let created = 0;
    for (const p of parsed) {
      let orgId = localOrg.get(_norm(p.account));
      if (!orgId) { orgId = insOrg.run(p.account).lastInsertRowid; localOrg.set(_norm(p.account), orgId); createdOrgIds.push(orgId); }

      let contactId = null;
      if (p.contact_name) {
        const existing = db.prepare(`SELECT id FROM contacts WHERE lower(name) = ? AND organization_id = ?`).get(_norm(p.contact_name), orgId);
        if (existing) contactId = existing.id;
        else {
          contactId = insContact.run(p.contact_name,
            JSON.stringify(p.contact_email ? [p.contact_email] : []),
            JSON.stringify(p.contact_phone ? [p.contact_phone] : []), orgId).lastInsertRowid;
          createdContactIds.push(contactId);
        }
      }
      if (p.district) insArea.run(p.district);

      const oppId = insOpp.run(p.title, contactId, orgId, p.segment || null, p.district || null,
        p.product_group, p.location_url || null, p.close_date, p.notes || null,
        p.salesmanId, req.user.id, p.stage, batchId).lastInsertRowid;
      insHist.run(oppId, p.stage, req.user.id);
      created++;
    }
    db.prepare(`UPDATE import_batches SET opp_count=?, created_org_ids=?, created_contact_ids=? WHERE id=?`)
      .run(created, JSON.stringify(createdOrgIds), JSON.stringify(createdContactIds), batchId);
    db.exec('COMMIT');
    return res.json({ committed: true, batch_id: batchId, created, skipped: errors.length, errors,
      new_customers: createdOrgIds.length, new_contacts: createdContactIds.length });
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'Import failed: ' + e.message });
  }
});

// GET /api/opportunities/import-batches — recent imports (own, or all for admin)
router.get('/import-batches', (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const rows = db.prepare(`
    SELECT b.*, u.name AS uploaded_by_name FROM import_batches b
    LEFT JOIN users u ON u.id = b.uploaded_by
    ${isAdmin ? '' : 'WHERE b.uploaded_by = ?'}
    ORDER BY b.id DESC LIMIT 20
  `).all(...(isAdmin ? [] : [req.user.id]));
  res.json(rows);
});

// POST /api/opportunities/import-batches/:id/undo — remove exactly what a batch created
router.post('/import-batches/:id/undo', (req, res) => {
  const batch = db.prepare('SELECT * FROM import_batches WHERE id = ?').get(req.params.id);
  if (!batch) return res.status(404).json({ error: 'Import not found.' });
  if (batch.uploaded_by !== req.user.id && req.user.role !== 'admin')
    return res.status(403).json({ error: 'Only the person who ran this import (or an admin) can undo it.' });

  const orgIds = JSON.parse(batch.created_org_ids || '[]');
  const contactIds = JSON.parse(batch.created_contact_ids || '[]');
  db.exec('BEGIN');
  try {
    const opps = db.prepare('SELECT id FROM opportunities WHERE import_batch_id = ?').all(batch.id);
    for (const { id } of opps) {
      db.prepare('DELETE FROM activities WHERE opp_id = ?').run(id);
      db.prepare('DELETE FROM notifications WHERE opp_id = ?').run(id);
      db.prepare('DELETE FROM discount_approvals WHERE opp_id = ?').run(id);
      db.prepare('DELETE FROM stage_history WHERE opp_id = ?').run(id);
      db.prepare('DELETE FROM opp_labels WHERE opp_id = ?').run(id);
      db.prepare('DELETE FROM opportunities WHERE id = ?').run(id);
    }
    // Remove the contacts/orgs this import created, but only if nothing else uses them.
    let removedContacts = 0, removedOrgs = 0;
    for (const cid of contactIds) {
      const used = db.prepare('SELECT 1 FROM opportunities WHERE contact_id = ? LIMIT 1').get(cid);
      if (!used) { db.prepare('DELETE FROM contacts WHERE id = ?').run(cid); removedContacts++; }
    }
    for (const oid of orgIds) {
      const usedByOpp = db.prepare('SELECT 1 FROM opportunities WHERE org_id = ? LIMIT 1').get(oid);
      const usedByContact = db.prepare('SELECT 1 FROM contacts WHERE organization_id = ? LIMIT 1').get(oid);
      if (!usedByOpp && !usedByContact) { db.prepare('DELETE FROM organizations WHERE id = ?').run(oid); removedOrgs++; }
    }
    db.prepare('DELETE FROM import_batches WHERE id = ?').run(batch.id);
    db.exec('COMMIT');
    return res.json({ success: true, removed_deals: opps.length, removed_contacts: removedContacts, removed_orgs: removedOrgs });
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'Undo failed: ' + e.message });
  }
});

// GET /api/opportunities
router.get('/', (req, res) => {
  const canViewAll = db.prepare(`
    SELECT 1 FROM permissions p
    JOIN role_permissions rp ON rp.permission_id = p.id
    WHERE rp.role_id = ? AND p.key = 'opps.view_all'
  `).get(req.user.role_id);

  const { stage, status, salesman_id, search } = req.query;
  let sql = `
    SELECT o.*,
      c.name AS contact_name, org.name AS org_name,
      s.name AS salesman_name, d.name AS designer_name,
      lr.label AS lost_reason_label
    FROM opportunities o
    LEFT JOIN contacts c ON c.id = o.contact_id
    LEFT JOIN organizations org ON org.id = o.org_id
    LEFT JOIN users s ON s.id = o.salesman_id
    LEFT JOIN users d ON d.id = o.designer_id
    LEFT JOIN lost_reasons lr ON lr.id = o.lost_reason_id
    WHERE 1=1
  `;
  const params = [];

  if (!canViewAll) {
    sql += ` AND o.salesman_id = ?`;
    params.push(req.user.id);
  }
  if (stage)       { sql += ` AND o.stage = ?`;       params.push(stage); }
  if (status)      { sql += ` AND o.status = ?`;      params.push(status); }
  if (salesman_id) { sql += ` AND o.salesman_id = ?`; params.push(salesman_id); }
  if (search)      { sql += ` AND o.title LIKE ?`;    params.push(`%${search}%`); }
  sql += ` ORDER BY o.updated_at DESC`;

  const rows = db.prepare(sql).all(...params);
  const enriched = rows.map(o => {
    const labels = db.prepare(`SELECT l.* FROM labels l JOIN opp_labels ol ON ol.label_id = l.id WHERE ol.opp_id = ?`).all(o.id);
    return { ...o, labels };
  });
  res.json(enriched);
});

// GET /api/opportunities/:id
router.get('/:id', (req, res) => {
  const opp = db.prepare(`
    SELECT o.*,
      c.name AS contact_name, c.phones AS contact_phones, c.emails AS contact_emails,
      org.name AS org_name,
      s.name AS salesman_name, d.name AS designer_name,
      lr.label AS lost_reason_label
    FROM opportunities o
    LEFT JOIN contacts c ON c.id = o.contact_id
    LEFT JOIN organizations org ON org.id = o.org_id
    LEFT JOIN users s ON s.id = o.salesman_id
    LEFT JOIN users d ON d.id = o.designer_id
    LEFT JOIN lost_reasons lr ON lr.id = o.lost_reason_id
    WHERE o.id = ?
  `).get(req.params.id);
  if (!opp) return res.status(404).json({ error: 'Opportunity not found.' });
  res.json(enrichOpp(opp));
});

// POST /api/opportunities
router.post('/', requirePerm('opps.create'), (req, res) => {
  const {
    title, contact_id, org_id, source, segment, district, product_group,
    eng_office, contractor, plumber, location_url, expected_value, currency,
    close_date, notes, salesman_id,
  } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required.' });
  // Decision 4: every new deal must link to an Account so H3 (revenue-by-customer)
  // works. The New Deal form already creates/links the org and sends org_id.
  if (!org_id) return res.status(400).json({ error: 'org_id (account) is required — link or create a customer.' });

  // Coerce a prototype string id ("U003") to its integer form so the
  // salesman_id → users(id) foreign key never fails. Mirrors demoAuth's parse.
  const toIntId = (raw) => {
    if (raw == null || raw === '') return null;
    const s = String(raw).trim();
    if (/^U\d+$/i.test(s)) return parseInt(s.slice(1), 10);
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
  };
  const assignedSalesman = toIntId(salesman_id) || req.user.id;
  const result = db.prepare(`
    INSERT INTO opportunities
      (title, contact_id, org_id, source, segment, district, product_group,
       eng_office, contractor, plumber, location_url, expected_value, currency,
       close_date, notes, salesman_id, created_by, stage, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'Prospect','Active')
  `).run(title, contact_id||null, org_id||null, source||null, segment||null, district||null,
         product_group||null, eng_office||null, contractor||null, plumber||null, location_url||null,
         expected_value||0, currency||'JOD', close_date||null, notes||null, assignedSalesman, req.user.id);

  const oppId = result.lastInsertRowid;
  db.prepare(`INSERT INTO stage_history (opp_id, from_stage, to_stage, changed_by) VALUES (?, NULL, 'Prospect', ?)`)
    .run(oppId, req.user.id);

  // Notify sales manager
  const mgrs = db.prepare(`SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'sales_manager'`).all();
  notify(req.io, mgrs.map(m => m.id), 'new_opportunity', `New opportunity: "${title}"`, oppId);

  res.json({ id: oppId, success: true });
});

// Columns the PUT endpoint will accept from req.body. Anything not listed here
// (stage, status-workflow fields, audit fields, price_exempted) is ignored.
// price_exempted is intentionally absent — it is server-computed below.
const PUT_ALLOWED_COLUMNS = new Set([
  'title', 'contact_id', 'org_id', 'source', 'segment', 'district', 'product_group',
  'eng_office', 'contractor', 'plumber', 'location_url', 'expected_value', 'currency',
  'close_date', 'notes',
  'system', 'sub_system', 'brand', 'owner_rep', 'owner_name', 'installation_by',
  'signing_price', 'lost_to_whom', 'next_action', 'remarks', 'person_responsible',
  'sales_tax', 'expected_closing', 'status', 'lost_notes', 'discount_pct',
]);

// PUT /api/opportunities/:id  — partial update.
// Only the columns present in req.body are written; everything else is left intact.
router.put('/:id', (req, res) => {
  const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
  if (!opp) return res.status(404).json({ error: 'Opportunity not found.' });

  const canEditAll = db.prepare(`
    SELECT 1 FROM permissions p JOIN role_permissions rp ON rp.permission_id = p.id
    WHERE rp.role_id = ? AND p.key = 'opps.edit_all'
  `).get(req.user.role_id);
  if (!canEditAll && opp.salesman_id !== req.user.id)
    return res.status(403).json({ error: 'Permission denied.' });

  // Build the SET clause from only the allowed keys actually present in the body.
  const sets = [];
  const params = [];
  for (const [key, value] of Object.entries(req.body)) {
    if (!PUT_ALLOWED_COLUMNS.has(key)) continue;
    sets.push(`${key} = ?`);
    params.push(value === undefined ? null : value);
  }

  // price_exempted is always recomputed from the (possibly updated) value + tax.
  const newValue = req.body.expected_value !== undefined ? Number(req.body.expected_value) || 0 : opp.expected_value;
  const newTax   = req.body.sales_tax      !== undefined ? Number(req.body.sales_tax)      || 0 : opp.sales_tax;
  const exempted = newTax ? newValue / (1 + newTax) : newValue;
  sets.push(`price_exempted = ?`);
  params.push(exempted);

  if (sets.length === 1) {
    // Only price_exempted would change and nothing was actually sent — no-op.
    return res.status(400).json({ error: 'No editable fields supplied.' });
  }

  sets.push(`updated_at = datetime('now')`);
  params.push(req.params.id);
  db.prepare(`UPDATE opportunities SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  res.json({ success: true });
});

// POST /api/opportunities/:id/stage  — move stage (forward OR backward)
router.post('/:id/stage', requirePerm('opps.change_stage'), (req, res) => {
  const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
  if (!opp) return res.status(404).json({ error: 'Opportunity not found.' });
  if (opp.status !== 'Active') return res.status(400).json({ error: 'Cannot change stage of a closed opportunity.' });

  const { to_stage, reason, reason_note } = req.body;
  if (!STAGES.includes(to_stage)) return res.status(400).json({ error: 'Invalid stage.' });
  if (to_stage === opp.stage) return res.json({ success: true, stage: to_stage });

  // Backward moves are allowed — deals stall and regress — but a REGRESS must carry
  // a reason (that's where diagnostic signal lives; forward advances don't require one).
  const isRegress = STAGES.indexOf(to_stage) < STAGES.indexOf(opp.stage);
  if (isRegress && (!reason || !String(reason).trim())) {
    return res.status(400).json({ error: 'A reason is required when moving a deal backward.' });
  }
  // Moving to Tender still requires a released quotation.
  if (to_stage === 'Tender') {
    const released = db.prepare(`SELECT id FROM quotations WHERE opp_id = ? AND status = 'Released'`).get(opp.id);
    if (!released) return res.status(400).json({ error: 'A released quotation is required before moving to Tender.' });
  }

  // NOTE: seconds_in_prev is deprecated (it measured deal age, not stage time, and had a
  // TZ bug). Reports derive time-in-stage from changed_at deltas. Kept nulled for back-compat.
  db.prepare(`UPDATE opportunities SET stage=?, updated_at=datetime('now') WHERE id=?`).run(to_stage, opp.id);
  db.prepare(`INSERT INTO stage_history (opp_id, from_stage, to_stage, changed_by, reason, reason_note) VALUES (?,?,?,?,?,?)`)
    .run(opp.id, opp.stage, to_stage, req.user.id, reason || null, reason_note || null);

  notify(req.io, [opp.salesman_id], 'stage_change', `Opportunity "${opp.title}" moved to ${to_stage}`, opp.id);
  res.json({ success: true, stage: to_stage });
});

// POST /api/opportunities/:id/assign-salesman
router.post('/:id/assign-salesman', requirePerm('opps.assign_salesman'), (req, res) => {
  const { salesman_id } = req.body;
  const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
  if (!opp) return res.status(404).json({ error: 'Not found.' });
  db.prepare(`UPDATE opportunities SET salesman_id=?, updated_at=datetime('now') WHERE id=?`).run(salesman_id, opp.id);
  notify(req.io, [salesman_id], 'assignment', `You have been assigned to "${opp.title}"`, opp.id);
  res.json({ success: true });
});

// POST /api/opportunities/:id/assign-designer
router.post('/:id/assign-designer', requirePerm('opps.assign_designer'), (req, res) => {
  const { designer_id } = req.body;
  const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
  if (!opp) return res.status(404).json({ error: 'Not found.' });
  db.prepare(`UPDATE opportunities SET designer_id=?, updated_at=datetime('now') WHERE id=?`).run(designer_id, opp.id);
  notify(req.io, [designer_id], 'assignment', `You have been assigned to design for "${opp.title}"`, opp.id);
  res.json({ success: true });
});

// Structured reason picklists — mirror the schema CHECKs, validate here for clean 400s.
const WON_REASONS = ['price', 'product fit', 'delivery time', 'relationship', 'spec locked to us', 'incumbent', 'other'];

// POST /api/opportunities/:id/close
router.post('/:id/close', requirePerm('opps.close'), (req, res) => {
  const { outcome, lost_reason_id, lost_notes, won_reason, won_note, signing_price } = req.body; // outcome: 'Won' | 'Lost'
  const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
  if (!opp) return res.status(404).json({ error: 'Not found.' });
  if (opp.status !== 'Active') return res.status(400).json({ error: 'Already closed.' });
  if (!['Won', 'Lost'].includes(outcome)) return res.status(400).json({ error: 'outcome must be Won or Lost.' });

  // Every close captures a structured reason (Phase 5 principle #1).
  if (outcome === 'Lost') {
    if (!lost_reason_id) return res.status(400).json({ error: 'lost_reason_id is required when closing as Lost.' });
    if (!lost_notes || !String(lost_notes).trim()) return res.status(400).json({ error: 'lost_notes is required when closing as Lost.' });
  }
  let signed = null;
  if (outcome === 'Won') {
    // signing_price is the actual signed amount — the revenue figure the diagnostic
    // (H3) layer depends on. Required so revenue stops being a forecast.
    signed = Number(signing_price);
    if (!(signed > 0)) return res.status(400).json({ error: 'signing_price (the actual signed amount) is required when closing as Won.' });
    if (!won_reason || !WON_REASONS.includes(won_reason)) {
      return res.status(400).json({ error: `won_reason is required and must be one of: ${WON_REASONS.join(', ')}` });
    }
  }

  db.prepare(`
    UPDATE opportunities
       SET status=?, lost_reason_id=?, lost_notes=?, won_reason=?, won_note=?,
           signing_price=COALESCE(?, signing_price), stage='Closing',
           closed_at=datetime('now'), closed_by=?, updated_at=datetime('now')
     WHERE id=?
  `).run(outcome, lost_reason_id || null, lost_notes || null,
         outcome === 'Won' ? won_reason : null, outcome === 'Won' ? (won_note || null) : null,
         signed, req.user.id, opp.id);

  // Capture the reason on the transition too, so stage_history is self-describing.
  const closeReason = outcome === 'Won' ? won_reason : (db.prepare(`SELECT label FROM lost_reasons WHERE id=?`).get(lost_reason_id) || {}).label;
  db.prepare(`INSERT INTO stage_history (opp_id, from_stage, to_stage, changed_by, reason, reason_note) VALUES (?,?,?,?,?,?)`)
    .run(opp.id, opp.stage, outcome, req.user.id, closeReason || null, outcome === 'Won' ? (won_note || null) : (lost_notes || null));

  const mgrs = db.prepare(`SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name IN ('sales_manager','admin')`).all();
  notify(req.io, [...mgrs.map(m => m.id), opp.salesman_id, opp.designer_id],
    'opportunity_closed', `Opportunity "${opp.title}" closed as ${outcome}`, opp.id);

  res.json({ success: true, status: outcome });
});

// POST /api/opportunities/:id/labels
router.post('/:id/labels', (req, res) => {
  const { label_ids } = req.body;
  const oppId = req.params.id;
  db.prepare('DELETE FROM opp_labels WHERE opp_id = ?').run(oppId);
  const ins = db.prepare('INSERT OR IGNORE INTO opp_labels (opp_id, label_id) VALUES (?, ?)');
  (label_ids || []).forEach(lid => ins.run(oppId, lid));
  res.json({ success: true });
});

// POST /api/opportunities/:id/attachments
router.post('/:id/attachments', upload.array('files'), (req, res) => {
  const oppId = req.params.id;
  const ins = db.prepare(`INSERT INTO attachments (opp_id, filename, stored_name, size, uploaded_by) VALUES (?,?,?,?,?)`);
  req.files.forEach(f => ins.run(oppId, f.originalname, f.filename, f.size, req.user.id));
  res.json({ success: true, count: req.files.length });
});

// GET /api/opportunities/:id/attachments
router.get('/:id/attachments', (req, res) => {
  const rows = db.prepare('SELECT * FROM attachments WHERE opp_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json(rows);
});

// DELETE /api/opportunities/:id  — owner of the deal or any user with opps.edit_all
router.delete('/:id', (req, res) => {
  const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
  if (!opp) return res.status(404).json({ error: 'Opportunity not found.' });

  const canEditAll = db.prepare(`
    SELECT 1 FROM permissions p JOIN role_permissions rp ON rp.permission_id = p.id
    WHERE rp.role_id = ? AND p.key = 'opps.edit_all'
  `).get(req.user.role_id);
  if (!canEditAll && opp.salesman_id !== req.user.id)
    return res.status(403).json({ error: 'Permission denied.' });

  // Some referencing tables (activities, notifications, discount_approvals)
  // don't have ON DELETE CASCADE on opp_id. Clean those up explicitly.
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM activities WHERE opp_id = ?').run(opp.id);
    db.prepare('DELETE FROM notifications WHERE opp_id = ?').run(opp.id);
    db.prepare('DELETE FROM discount_approvals WHERE opp_id = ?').run(opp.id);
    db.prepare('DELETE FROM opportunities WHERE id = ?').run(opp.id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'Delete failed: ' + e.message });
  }
  res.json({ success: true });
});

module.exports = router;
