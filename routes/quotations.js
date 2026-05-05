const express = require('express');
const db      = require('../database/db');
const authMw  = require('../middleware/auth');
const { requirePerm } = require('../middleware/permission');

const router = express.Router();
router.use(authMw);

function notify(io, userIds, type, message, oppId) {
  if (!io) return;
  const insert = db.prepare(`INSERT INTO notifications (user_id, type, message, opp_id) VALUES (?, ?, ?, ?)`);
  userIds.forEach(uid => {
    if (!uid) return;
    insert.run(uid, type, message, oppId || null);
    io.to(`user:${uid}`).emit('notification', { type, message });
  });
}

// GET /api/quotations/opp/:oppId — all versions for an opportunity
router.get('/opp/:oppId', (req, res) => {
  const rows = db.prepare(`
    SELECT q.*, u.name AS designer_name, r.name AS reviewed_by_name
    FROM quotations q
    LEFT JOIN users u ON u.id = q.designer_id
    LEFT JOIN users r ON r.id = q.reviewed_by
    WHERE q.opp_id = ? ORDER BY q.version DESC
  `).all(req.params.oppId);
  res.json(rows);
});

// GET /api/quotations/:id
router.get('/:id', (req, res) => {
  const q = db.prepare(`
    SELECT q.*, u.name AS designer_name, r.name AS reviewed_by_name
    FROM quotations q
    LEFT JOIN users u ON u.id = q.designer_id
    LEFT JOIN users r ON r.id = q.reviewed_by
    WHERE q.id = ?
  `).get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Quotation not found.' });
  res.json({ ...q, files: JSON.parse(q.files || '[]') });
});

// POST /api/quotations — designer creates
router.post('/', requirePerm('quot.create'), (req, res) => {
  const { opp_id, total_value, discount_pct = 0, notes } = req.body;
  if (!opp_id || !total_value) return res.status(400).json({ error: 'opp_id and total_value required.' });

  const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(opp_id);
  if (!opp) return res.status(404).json({ error: 'Opportunity not found.' });

  // Get next version number
  const latest = db.prepare('SELECT MAX(version) AS v FROM quotations WHERE opp_id = ?').get(opp_id);
  const version = (latest?.v || 0) + 1;

  const final_value = total_value * (1 - discount_pct / 100);
  const result = db.prepare(`
    INSERT INTO quotations (opp_id, version, total_value, discount_pct, final_value, designer_id, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, 'Draft', ?)
  `).run(opp_id, version, total_value, discount_pct, final_value, req.user.id, notes || null);

  // Notify design manager
  const dms = db.prepare(`SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'design_manager'`).all();
  notify(req.io, dms.map(m => m.id), 'quotation_created', `New quotation v${version} created for "${opp.title}"`, opp_id);

  res.json({ id: result.lastInsertRowid, version, success: true });
});

// POST /api/quotations/:id/submit — designer submits for review
router.post('/:id/submit', requirePerm('quot.create'), (req, res) => {
  const q = db.prepare('SELECT * FROM quotations WHERE id = ?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Not found.' });
  if (q.designer_id !== req.user.id) return res.status(403).json({ error: 'Not your quotation.' });

  db.prepare(`UPDATE quotations SET status='UnderReview' WHERE id=?`).run(q.id);
  const opp = db.prepare('SELECT title FROM opportunities WHERE id = ?').get(q.opp_id);
  const dms = db.prepare(`SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'design_manager'`).all();
  notify(req.io, dms.map(m => m.id), 'quotation_submitted', `Quotation v${q.version} submitted for review — "${opp?.title}"`, q.opp_id);

  res.json({ success: true });
});

// POST /api/quotations/:id/approve — design manager approves
router.post('/:id/approve', requirePerm('quot.approve'), (req, res) => {
  const q = db.prepare('SELECT * FROM quotations WHERE id = ?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Not found.' });
  db.prepare(`UPDATE quotations SET status='Approved', reviewed_by=? WHERE id=?`).run(req.user.id, q.id);
  notify(req.io, [q.designer_id], 'quotation_approved', `Your quotation v${q.version} was approved`, q.opp_id);
  res.json({ success: true });
});

// POST /api/quotations/:id/revise — request revision
router.post('/:id/revise', requirePerm('quot.request_revision'), (req, res) => {
  const { revision_notes } = req.body;
  const q = db.prepare('SELECT * FROM quotations WHERE id = ?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Not found.' });
  db.prepare(`UPDATE quotations SET status='RevisionRequested', reviewed_by=?, notes=? WHERE id=?`)
    .run(req.user.id, revision_notes || q.notes, q.id);
  notify(req.io, [q.designer_id], 'quotation_revision', `Revision requested on v${q.version}`, q.opp_id);
  res.json({ success: true });
});

// POST /api/quotations/:id/release — release to salesman
router.post('/:id/release', requirePerm('quot.release'), (req, res) => {
  const q = db.prepare('SELECT * FROM quotations WHERE id = ?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Not found.' });
  db.prepare(`UPDATE quotations SET status='Released', released_at=datetime('now') WHERE id=?`).run(q.id);

  const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(q.opp_id);
  notify(req.io, [opp?.salesman_id], 'quotation_released',
    `Quotation v${q.version} released for "${opp?.title}"`, q.opp_id);

  res.json({ success: true });
});

module.exports = router;
