const express  = require('express');
const bcrypt   = require('bcryptjs');
const db       = require('../database/db');
const authMw   = require('../middleware/auth');
const demoAuth = require('../middleware/demoAuth');
const { requirePerm, clearPermCache } = require('../middleware/permission');

const router = express.Router();
// Demo mode (same as opportunities/design) until real login is turned on at go-live.
router.use(demoAuth);

// GET /api/users
router.get('/', requirePerm('users.edit'), (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.name, u.email, u.is_active, u.created_at, r.name AS role, r.id AS role_id
    FROM users u JOIN roles r ON r.id = u.role_id
    ORDER BY u.name
  `).all();
  res.json(users);
});

// GET /api/users/:id
router.get('/:id', requirePerm('users.edit'), (req, res) => {
  const user = db.prepare(`
    SELECT u.id, u.name, u.email, u.is_active, u.created_at, r.name AS role, r.id AS role_id
    FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?
  `).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json(user);
});

// POST /api/users
router.post('/', requirePerm('users.create'), (req, res) => {
  const { name, email, password, role_id } = req.body;
  if (!name || !email || !password || !role_id)
    return res.status(400).json({ error: 'name, email, password, role_id are required.' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(`INSERT INTO users (name, email, password_hash, role_id) VALUES (?, ?, ?, ?)`)
      .run(name, email.toLowerCase(), hash, role_id);
    res.json({ id: result.lastInsertRowid, success: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Email already exists.' });
    throw e;
  }
});

// PUT /api/users/:id
router.put('/:id', requirePerm('users.edit'), (req, res) => {
  const { name, email, role_id, is_active, password } = req.body;
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  if (password) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .run(bcrypt.hashSync(password, 10), req.params.id);
  }
  db.prepare(`UPDATE users SET name=?, email=?, role_id=?, is_active=? WHERE id=?`)
    .run(name, email.toLowerCase(), role_id, is_active ? 1 : 0, req.params.id);

  clearPermCache(Number(req.params.id));
  res.json({ success: true });
});

// DELETE /api/users/:id  — permanently remove a user.
// Users are referenced by deals, activities, notes, etc. (FKs are enforced), so
// a hard delete only succeeds for accounts with no history — typically test
// users. When the user has linked records we deactivate instead and say so, so
// the caller never loses referential integrity. You also can't delete yourself
// or the last active admin (that would lock everyone out of this very page).
router.delete('/:id', requirePerm('users.edit'), (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare('SELECT id, role_id FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (id === req.user.id) return res.status(400).json({ error: 'You cannot remove your own account.' });

  // Guard the last active admin.
  const adminRole = db.prepare("SELECT id FROM roles WHERE name = 'admin'").get();
  if (adminRole && user.role_id === adminRole.id) {
    const activeAdmins = db.prepare('SELECT COUNT(*) AS n FROM users WHERE role_id = ? AND is_active = 1').get(adminRole.id).n;
    if (activeAdmins <= 1) return res.status(400).json({ error: 'Cannot remove the last active admin.' });
  }

  try {
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    clearPermCache(id);
    res.json({ success: true, deleted: true });
  } catch (e) {
    // FK constraint — the user has history. Soft-remove instead.
    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(id);
    clearPermCache(id);
    res.json({ success: true, deleted: false, deactivated: true });
  }
});

module.exports = router;
