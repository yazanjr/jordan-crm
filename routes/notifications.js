const express = require('express');
const db      = require('../database/db');
const demoAuth = require('../middleware/demoAuth');

const router = express.Router();
// Use the same demo-auth (x-demo-user-id) as every other v3 route, so the
// pipeline-v3 frontend can actually read/mark notifications. (Was on JWT-only
// auth, which the demo frontend never sends — every call 401'd.)
router.use(demoAuth);

// GET /api/notifications
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
  `).all(req.user.id);
  const unread = db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id).c;
  res.json({ notifications: rows, unread });
});

// PUT /api/notifications/:id/read
router.put('/:id/read', (req, res) => {
  db.prepare('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// PUT /api/notifications/read-all
router.put('/read-all', (req, res) => {
  db.prepare('UPDATE notifications SET is_read=1 WHERE user_id=?').run(req.user.id);
  res.json({ success: true });
});

module.exports = router;
