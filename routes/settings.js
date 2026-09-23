const express = require('express');
const db      = require('../database/db');
const authMw  = require('../middleware/auth');
const demoAuth = require('../middleware/demoAuth');
const { requirePerm } = require('../middleware/permission');

const router = express.Router();
// Demo mode (same as opportunities/design) until real login is turned on at go-live.
router.use(demoAuth);

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

// Notification rules — Settings → Notifications (who is told about what).
const NOTIF = require('../utils/notifications');
router.get('/notification-rules', requirePerm('settings.manage'), (req, res) => {
  const roles = db.prepare(`SELECT name, description FROM roles ORDER BY id`).all();
  res.json({ events: NOTIF.EVENTS.map(e => ({ type: e.type, group: e.group, label: e.label, involved: e.involved })), roles, rules: NOTIF.getRules(), defaults: NOTIF.DEFAULTS });
});
router.put('/notification-rules', requirePerm('settings.manage'), (req, res) => {
  const rules = req.body && req.body.reset ? NOTIF.DEFAULTS : (req.body && req.body.rules);
  if (!rules || typeof rules !== 'object') return res.status(400).json({ error: 'rules object required' });
  res.json({ ok: true, rules: NOTIF.saveRules(rules, req.user.id) });
});

// PUT /api/settings/:key
router.put('/:key', requirePerm('settings.manage'), (req, res) => {
  const { value } = req.body;
  const stored = Array.isArray(value) ? JSON.stringify(value) : String(value);
  db.prepare(`
    UPDATE settings SET value = ?, updated_by = ?, updated_at = datetime('now') WHERE key = ?
  `).run(stored, req.user.id, req.params.key);

  // The close-as-lost dropdown + reporting use the lost_reasons TABLE (by id), not
  // this setting. Reconcile the table from the edited list so editing it actually
  // takes effect — preserving existing ids by label so historical FKs stay valid.
  if (req.params.key === 'lost_reasons' && Array.isArray(value)) {
    const labels = value.map(v => String(v).trim()).filter(Boolean);
    const byLabel = new Map(db.prepare('SELECT id, label FROM lost_reasons').all().map(r => [r.label.toLowerCase(), r.id]));
    db.exec('BEGIN');
    try {
      db.prepare('UPDATE lost_reasons SET is_active = 0').run();
      const ins = db.prepare('INSERT INTO lost_reasons (label, is_active) VALUES (?, 1)');
      const act = db.prepare('UPDATE lost_reasons SET is_active = 1 WHERE id = ?');
      for (const label of labels) {
        const id = byLabel.get(label.toLowerCase());
        if (id) act.run(id); else ins.run(label);
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); return res.status(500).json({ error: 'Saved, but syncing lost reasons failed: ' + e.message }); }
  }
  res.json({ success: true });
});

module.exports = router;
