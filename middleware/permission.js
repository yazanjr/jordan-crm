const db = require('../database/db');

const permCache = new Map();

function getUserPerms(userId) {
  if (permCache.has(userId)) return permCache.get(userId);
  const rows = db.prepare(`
    SELECT p.key FROM permissions p
    JOIN role_permissions rp ON rp.permission_id = p.id
    JOIN users u ON u.role_id = rp.role_id
    WHERE u.id = ? AND u.is_active = 1
  `).all(userId);
  const perms = new Set(rows.map(r => r.key));
  permCache.set(userId, perms);
  return perms;
}

// Call this when a user's role changes to clear cache
function clearPermCache(userId) {
  if (userId) permCache.delete(userId);
  else permCache.clear();
}

function requirePerm(key) {
  return (req, res, next) => {
    const perms = getUserPerms(req.user.id);
    if (!perms.has(key))
      return res.status(403).json({ error: `Permission denied: ${key}` });
    next();
  };
}

module.exports = { requirePerm, clearPermCache };
