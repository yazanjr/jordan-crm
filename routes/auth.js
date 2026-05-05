const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const db       = require('../database/db');
const authMw   = require('../middleware/auth');

const router     = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'img-crm-jordan-secret';

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required.' });

  const user = db.prepare(`
    SELECT u.*, r.name AS role_name
    FROM users u JOIN roles r ON r.id = u.role_id
    WHERE u.email = ? AND u.is_active = 1
  `).get(email.trim().toLowerCase());

  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Invalid email or password.' });

  // Load permissions
  const perms = db.prepare(`
    SELECT p.key FROM permissions p
    JOIN role_permissions rp ON rp.permission_id = p.id
    WHERE rp.role_id = ?
  `).all(user.role_id).map(r => r.key);

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role_name, role_id: user.role_id },
    JWT_SECRET,
    { expiresIn: '10h' }
  );

  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role_name }, permissions: perms });
});

// GET /api/auth/verify
router.get('/verify', authMw, (req, res) => {
  const perms = db.prepare(`
    SELECT p.key FROM permissions p
    JOIN role_permissions rp ON rp.permission_id = p.id
    WHERE rp.role_id = ?
  `).all(req.user.role_id).map(r => r.key);

  // Load IMI portal URL from settings
  const imiSetting = db.prepare(`SELECT value FROM settings WHERE key = 'imi_portal_url'`).get();

  res.json({ valid: true, user: req.user, permissions: perms, imiPortalUrl: imiSetting?.value || '' });
});

// POST /api/auth/change-password
router.post('/change-password', authMw, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 6)
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(currentPassword, user.password_hash))
    return res.status(401).json({ error: 'Current password is incorrect.' });

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(bcrypt.hashSync(newPassword, 10), req.user.id);
  res.json({ success: true });
});

module.exports = router;
