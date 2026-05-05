const express = require('express');
const db      = require('../database/db');
const authMw  = require('../middleware/auth');
const { requirePerm } = require('../middleware/permission');

const router = express.Router();
router.use(authMw);

// GET /api/settings  — all settings (any authenticated user needs some settings)
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM settings ORDER BY key').all();
  const out  = {};
  rows.forEach(r => {
    out[r.key] = r.type === 'list' ? JSON.parse(r.value || '[]') : r.value;
  });
  res.json(out);
});

// GET /api/settings/raw  — full rows for admin panel
router.get('/raw', requirePerm('settings.manage'), (req, res) => {
  res.json(db.prepare('SELECT * FROM settings ORDER BY key').all());
});

// PUT /api/settings/:key
router.put('/:key', requirePerm('settings.manage'), (req, res) => {
  const { value } = req.body;
  const stored = Array.isArray(value) ? JSON.stringify(value) : String(value);
  db.prepare(`
    UPDATE settings SET value = ?, updated_by = ?, updated_at = datetime('now') WHERE key = ?
  `).run(stored, req.user.id, req.params.key);
  res.json({ success: true });
});

module.exports = router;
