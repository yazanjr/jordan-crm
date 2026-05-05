const express = require('express');
const db      = require('../database/db');
const authMw  = require('../middleware/auth');

const router = express.Router();
router.use(authMw);

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

// POST /api/activities
router.post('/', (req, res) => {
  const { opp_id, contact_id, org_id, type, title, start_dt, end_dt, priority, assigned_to, notes } = req.body;
  if (!title || !type) return res.status(400).json({ error: 'title and type are required.' });

  const result = db.prepare(`
    INSERT INTO activities (opp_id, contact_id, org_id, type, title, start_dt, end_dt, priority, assigned_to, performed_by, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(opp_id||null, contact_id||null, org_id||null, type, title,
         start_dt||null, end_dt||null, priority||'Medium',
         assigned_to||req.user.id, req.user.id, notes||null);

  res.json({ id: result.lastInsertRowid, success: true });
});

// PUT /api/activities/:id/done
router.put('/:id/done', (req, res) => {
  db.prepare(`UPDATE activities SET status='Done' WHERE id=?`).run(req.params.id);
  res.json({ success: true });
});

// DELETE /api/activities/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM activities WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
