const express = require('express');
const db      = require('../database/db');
const authMw  = require('../middleware/auth');
const demoAuth = require('../middleware/demoAuth');
const { requirePerm, clearPermCache } = require('../middleware/permission');

const router = express.Router();
// Demo mode (same as opportunities/design) until real login is turned on at go-live.
router.use(demoAuth);

// GET /api/roles  — list all roles with their permissions
router.get('/', (req, res) => {
  const roles = db.prepare('SELECT * FROM roles ORDER BY id').all();
  const perms = db.prepare('SELECT * FROM permissions ORDER BY category, key').all();
  const matrix = db.prepare('SELECT role_id, permission_id FROM role_permissions').all();
  res.json({ roles, permissions: perms, matrix });
});

// PUT /api/roles/:id/permissions  — replace permission set for a role
router.put('/:id/permissions', requirePerm('roles.manage'), (req, res) => {
  const { permissionIds } = req.body; // array of permission ids
  const roleId = Number(req.params.id);

  db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(roleId);
  const insert = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)');
  const insertMany = db.transaction(ids => ids.forEach(pid => insert.run(roleId, pid)));
  insertMany(permissionIds || []);

  clearPermCache(); // clear all since we don't know who is using this role
  res.json({ success: true });
});

module.exports = router;
