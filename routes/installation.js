// routes/installation.js
// Installation parameters — their OWN list, separate from the item pricing_params.
// Seeded from the IMG offer file ("Installation Price" + "PM Costing" sheets).
const express  = require('express');
const router   = express.Router();
const db       = require('../database/db');
const demoAuth = require('../middleware/demoAuth');

router.use(demoAuth);

function requirePM(req, res, next) {
  if (req.user.role === 'admin' || req.user.role === 'product_manager') return next();
  return res.status(403).json({ error: 'Product Management permission required.' });
}

// GET /api/installation-params — full list, grouped client-side by `grp`.
router.get('/installation-params', requirePM, (req, res) => {
  res.json(db.prepare(`SELECT * FROM installation_params ORDER BY sort_order`).all());
});

// PUT /api/installation-params — { params: [{ code, value, value2?, extra? }] }
// Values only: the list's structure mirrors the offer file, so rows are not
// added/removed here. New quotations use the new values; saved ones keep theirs.
router.put('/installation-params', requirePM, (req, res) => {
  const list = Array.isArray(req.body && req.body.params) ? req.body.params : [];
  const upd = db.prepare(`UPDATE installation_params SET value = ?, value2 = ?, extra = ? WHERE code = ?`);
  let n = 0;
  db.exec('BEGIN');
  try {
    for (const p of list) {
      const row = db.prepare(`SELECT * FROM installation_params WHERE code = ?`).get(String(p.code || ''));
      if (!row) continue;
      const value = Number(p.value);
      if (!Number.isFinite(value) || value < 0) throw new Error(`"${row.label}" must be a number ≥ 0.`);
      const value2 = p.value2 == null || p.value2 === '' ? row.value2 : Number(p.value2);
      if (value2 != null && (!Number.isFinite(value2) || value2 < 0)) throw new Error(`"${row.label}" cost must be a number ≥ 0.`);
      const extra = p.extra != null && row.code === 'LOC_HALF_CITIES' ? String(p.extra) : row.extra;
      upd.run(value, value2, extra, row.code);
      n++;
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); return res.status(400).json({ error: e.message }); }
  res.json({ ok: true, updated: n });
});

module.exports = router;
