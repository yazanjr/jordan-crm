// DEMO AUTH — bridges the pipeline-v3 prototype (which has no login) to the
// real backend's role/permission system. Trusts a single `x-demo-user-id`
// request header (or `?as=<id>` query param as a fallback for easy testing).
//
// The frontend sends the user it currently has selected via the sidebar
// user-switcher. Accepts either:
//   - Integer DB user id  (e.g. "3")
//   - Prototype string id (e.g. "U003" → 3)
//
// When real JWT auth is later wired, just stop calling this middleware on
// the design routes — the rest of the system already uses real auth.

const db = require('../database/db');

const cache = new Map();   // user_id -> { id, name, email, role, role_id }

function _loadUser(userId) {
  if (cache.has(userId)) return cache.get(userId);
  const row = db.prepare(`
    SELECT u.id, u.name, u.email, u.role_id, r.name AS role,
           COALESCE(u.can_view_costs, 0) AS can_view_costs
    FROM users u JOIN roles r ON r.id = u.role_id
    WHERE u.id = ? AND u.is_active = 1
  `).get(userId);
  if (row) cache.set(userId, row);
  return row;
}

function _parseDemoId(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (/^U\d+$/i.test(s)) return parseInt(s.slice(1), 10);
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

module.exports = (req, res, next) => {
  const raw = req.headers['x-demo-user-id'] || req.query.as;
  const id  = _parseDemoId(raw);
  if (!id) return res.status(401).json({ error: 'Missing x-demo-user-id header (or ?as= query).' });

  const user = _loadUser(id);
  if (!user) return res.status(401).json({ error: `Demo user ${id} not found or inactive.` });

  req.user = user;   // { id, name, email, role, role_id }
  next();
};

// Tiny role-gate helper used by design routes. Cleaner for this one feature
// than wiring 6 new permission keys into the role-permissions table.
module.exports.requireRole = function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires role: ${allowed.join(' or ')}` });
    }
    next();
  };
};
