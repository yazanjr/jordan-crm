const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
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

// GET /api/opportunities/meta/product-groups — live + baseline merged.
// Returns the union of distinct product_group values in opportunities and a
// hardcoded baseline so the New Deal modal always shows the IMG core list.
router.get('/meta/product-groups', (req, res) => {
  const BASELINE = ['VRF Systems', 'Split Units', 'Chiller Systems', 'Ducted Units', 'Fan Coils', 'AHU', 'Heating', 'Plumbing'];
  const live = db.prepare(`SELECT DISTINCT product_group FROM opportunities WHERE product_group IS NOT NULL AND TRIM(product_group) != ''`)
    .all().map(r => r.product_group);
  const merged = Array.from(new Set([...BASELINE, ...live])).sort((a, b) => a.localeCompare(b));
  res.json(merged);
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

  const assignedSalesman = salesman_id || req.user.id;
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

  const { to_stage } = req.body;
  if (!STAGES.includes(to_stage)) return res.status(400).json({ error: 'Invalid stage.' });
  if (to_stage === opp.stage) return res.json({ success: true, stage: to_stage });

  // Backward moves are allowed — deals stall and regress. Every move is logged below.
  // Moving to Tender still requires a released quotation.
  if (to_stage === 'Tender') {
    const released = db.prepare(`SELECT id FROM quotations WHERE opp_id = ? AND status = 'Released'`).get(opp.id);
    if (!released) return res.status(400).json({ error: 'A released quotation is required before moving to Tender.' });
  }

  const now      = new Date();
  const created  = new Date(opp.created_at);
  const seconds  = Math.floor((now - created) / 1000);

  db.prepare(`UPDATE opportunities SET stage=?, updated_at=datetime('now') WHERE id=?`).run(to_stage, opp.id);
  db.prepare(`INSERT INTO stage_history (opp_id, from_stage, to_stage, changed_by, seconds_in_prev) VALUES (?,?,?,?,?)`)
    .run(opp.id, opp.stage, to_stage, req.user.id, seconds);

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

// POST /api/opportunities/:id/close
router.post('/:id/close', requirePerm('opps.close'), (req, res) => {
  const { outcome, lost_reason_id, lost_notes } = req.body; // outcome: 'Won' | 'Lost'
  const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
  if (!opp) return res.status(404).json({ error: 'Not found.' });
  if (opp.status !== 'Active') return res.status(400).json({ error: 'Already closed.' });
  if (!['Won', 'Lost'].includes(outcome)) return res.status(400).json({ error: 'outcome must be Won or Lost.' });
  if (outcome === 'Lost' && !lost_reason_id) return res.status(400).json({ error: 'lost_reason_id is required when closing as Lost.' });

  db.prepare(`
    UPDATE opportunities
       SET status=?, lost_reason_id=?, lost_notes=?, stage='Closing',
           closed_at=datetime('now'), closed_by=?, updated_at=datetime('now')
     WHERE id=?
  `).run(outcome, lost_reason_id || null, lost_notes || null, req.user.id, opp.id);

  db.prepare(`INSERT INTO stage_history (opp_id, from_stage, to_stage, changed_by) VALUES (?,?,?,?)`)
    .run(opp.id, opp.stage, outcome, req.user.id);

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
