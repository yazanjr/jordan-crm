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

// POST /api/approvals — salesman requests discount override
router.post('/', requirePerm('disc.apply_standard'), (req, res) => {
  const { opp_id, quotation_id, requested_pct, notes } = req.body;
  if (!opp_id || !requested_pct) return res.status(400).json({ error: 'opp_id and requested_pct required.' });

  const limitSetting = db.prepare(`SELECT value FROM settings WHERE key = 'discount_limit'`).get();
  const limit = parseFloat(limitSetting?.value || '30');
  if (requested_pct <= limit) return res.status(400).json({ error: `Discount ${requested_pct}% is within limit (${limit}%). No approval needed.` });

  const result = db.prepare(`
    INSERT INTO discount_approvals (opp_id, quotation_id, requested_by, requested_pct, notes, status)
    VALUES (?, ?, ?, ?, ?, 'Pending')
  `).run(opp_id, quotation_id || null, req.user.id, requested_pct, notes || null);

  const opp = db.prepare('SELECT title FROM opportunities WHERE id = ?').get(opp_id);
  const mgrs = db.prepare(`SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name IN ('sales_manager','admin')`).all();
  notify(req.io, mgrs.map(m => m.id), 'discount_request',
    `Discount override ${requested_pct}% requested for "${opp?.title}"`, opp_id);

  res.json({ id: result.lastInsertRowid, success: true });
});

// GET /api/approvals/pending
router.get('/pending', requirePerm('disc.approve_override'), (req, res) => {
  const rows = db.prepare(`
    SELECT da.*, o.title AS opp_title, u.name AS requester_name
    FROM discount_approvals da
    LEFT JOIN opportunities o ON o.id = da.opp_id
    LEFT JOIN users u ON u.id = da.requested_by
    WHERE da.status = 'Pending' ORDER BY da.request_date DESC
  `).all();
  res.json(rows);
});

// GET /api/approvals/mine — salesman sees their own requests
router.get('/mine', (req, res) => {
  const rows = db.prepare(`
    SELECT da.*, o.title AS opp_title, u.name AS approver_name
    FROM discount_approvals da
    LEFT JOIN opportunities o ON o.id = da.opp_id
    LEFT JOIN users u ON u.id = da.approved_by
    WHERE da.requested_by = ? ORDER BY da.request_date DESC
  `).all(req.user.id);
  res.json(rows);
});

// POST /api/approvals/:id/respond — SM approves or rejects
router.post('/:id/respond', requirePerm('disc.approve_override'), (req, res) => {
  const { decision, approved_pct, notes } = req.body; // decision: 'Approved' | 'Rejected'
  if (!['Approved', 'Rejected'].includes(decision))
    return res.status(400).json({ error: 'decision must be Approved or Rejected.' });

  const approval = db.prepare('SELECT * FROM discount_approvals WHERE id = ?').get(req.params.id);
  if (!approval) return res.status(404).json({ error: 'Not found.' });

  db.prepare(`
    UPDATE discount_approvals
    SET status=?, approved_by=?, approved_pct=?, notes=?, response_date=datetime('now')
    WHERE id=?
  `).run(decision, req.user.id, approved_pct || approval.requested_pct, notes || null, approval.id);

  notify(req.io, [approval.requested_by], 'discount_response',
    `Your discount request was ${decision.toLowerCase()}`, approval.opp_id);

  res.json({ success: true });
});

module.exports = router;
