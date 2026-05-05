const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const db      = require('../database/db');
const authMw  = require('../middleware/auth');
const { requirePerm } = require('../middleware/permission');

const router = express.Router();
router.use(authMw);

const STAGES = ['Prospect', 'Tender', 'Analysis', 'Negotiation', 'Closing'];

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
  const history = db.prepare(`
    SELECT sh.*, u.name AS changed_by_name FROM stage_history sh
    LEFT JOIN users u ON u.id = sh.changed_by WHERE sh.opp_id = ? ORDER BY sh.changed_at
  `).all(opp.id);
  return { ...opp, labels, history };
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

// PUT /api/opportunities/:id
router.put('/:id', (req, res) => {
  const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
  if (!opp) return res.status(404).json({ error: 'Opportunity not found.' });

  const canEditAll = db.prepare(`
    SELECT 1 FROM permissions p JOIN role_permissions rp ON rp.permission_id = p.id
    WHERE rp.role_id = ? AND p.key = 'opps.edit_all'
  `).get(req.user.role_id);
  if (!canEditAll && opp.salesman_id !== req.user.id)
    return res.status(403).json({ error: 'Permission denied.' });

  const {
    title, contact_id, org_id, source, segment, district, product_group,
    eng_office, contractor, plumber, location_url, expected_value, currency,
    close_date, notes,
  } = req.body;

  db.prepare(`
    UPDATE opportunities SET
      title=?, contact_id=?, org_id=?, source=?, segment=?, district=?, product_group=?,
      eng_office=?, contractor=?, plumber=?, location_url=?, expected_value=?, currency=?,
      close_date=?, notes=?, updated_at=datetime('now')
    WHERE id=?
  `).run(title, contact_id||null, org_id||null, source||null, segment||null, district||null,
         product_group||null, eng_office||null, contractor||null, plumber||null,
         location_url||null, expected_value||0, currency||'JOD', close_date||null, notes||null, req.params.id);

  res.json({ success: true });
});

// POST /api/opportunities/:id/stage  — advance stage
router.post('/:id/stage', requirePerm('opps.change_stage'), (req, res) => {
  const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
  if (!opp) return res.status(404).json({ error: 'Opportunity not found.' });
  if (opp.status !== 'Active') return res.status(400).json({ error: 'Cannot change stage of a closed opportunity.' });

  const { to_stage } = req.body;
  if (!STAGES.includes(to_stage)) return res.status(400).json({ error: 'Invalid stage.' });

  const currentIdx = STAGES.indexOf(opp.stage);
  const targetIdx  = STAGES.indexOf(to_stage);
  if (targetIdx <= currentIdx) return res.status(400).json({ error: 'Can only advance to a later stage.' });

  // Moving to Tender requires a released quotation
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
    UPDATE opportunities SET status=?, lost_reason_id=?, lost_notes=?, stage='Closing', updated_at=datetime('now') WHERE id=?
  `).run(outcome, lost_reason_id || null, lost_notes || null, opp.id);

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

module.exports = router;
