const express  = require('express');
const db       = require('../database/db');
const demoAuth = require('../middleware/demoAuth');

const router = express.Router();
// Was authMw (JWT) while every other pipeline route uses demoAuth — so the live
// x-demo-user-id UI would 401. Aligned to demoAuth so activity logging works.
router.use(demoAuth);

const ACTIVITY_TYPES = ['visit', 'call', 'email', 'quote sent', 'follow-up', 'meeting', 'demo', 'other', 'Task'];

// GET /api/activities?opp_id=...&user_id=...
router.get('/', (req, res) => {
  const { opp_id, user_id } = req.query;
  let sql = `
    SELECT a.*, u.name AS assigned_to_name, p.name AS performed_by_name,
           o.title AS opp_title
    FROM activities a
    LEFT JOIN users u ON u.id = a.assigned_to
    LEFT JOIN users p ON p.id = a.performed_by
    LEFT JOIN opportunities o ON o.id = a.opp_id
    WHERE 1=1
  `;
  const params = [];
  if (opp_id)  { sql += ' AND a.opp_id = ?';       params.push(opp_id); }
  if (user_id) { sql += ' AND a.assigned_to = ?';   params.push(user_id); }
  sql += ' ORDER BY a.start_dt ASC';
  res.json(db.prepare(sql).all(...params));
});

// POST /api/activities  — a logged sales activity (visit/call/…). Polymorphic:
// may reference opp / contact / org / project. `done_at` stamped now for logged work.
router.post('/', (req, res) => {
  const { opp_id, contact_id, org_id, project_id, type, title, start_dt, end_dt, priority, assigned_to, notes } = req.body;
  if (!title || !type) return res.status(400).json({ error: 'title and type are required.' });
  if (!ACTIVITY_TYPES.includes(type)) return res.status(400).json({ error: `type must be one of: ${ACTIVITY_TYPES.join(', ')}` });

  const result = db.prepare(`
    INSERT INTO activities (opp_id, contact_id, org_id, project_id, type, title, start_dt, end_dt, priority, assigned_to, performed_by, notes, status, done_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'Done',datetime('now'))
  `).run(opp_id||null, contact_id||null, org_id||null, project_id||null, type, title,
         start_dt||null, end_dt||null, priority||'Medium',
         assigned_to||req.user.id, req.user.id, notes||null);

  res.json({ id: result.lastInsertRowid, success: true });
});

// PUT /api/activities/:id/done
router.put('/:id/done', (req, res) => {
  db.prepare(`UPDATE activities SET status='Done', done_at=datetime('now') WHERE id=?`).run(req.params.id);
  res.json({ success: true });
});

// DELETE /api/activities/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM activities WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
