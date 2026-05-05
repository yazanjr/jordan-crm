const express = require('express');
const db      = require('../database/db');
const authMw  = require('../middleware/auth');

const router = express.Router();
router.use(authMw);

// GET /api/organizations?search=...
router.get('/', (req, res) => {
  const { search } = req.query;
  const rows = search
    ? db.prepare(`SELECT * FROM organizations WHERE name LIKE ? ORDER BY name LIMIT 20`).all(`%${search}%`)
    : db.prepare(`SELECT * FROM organizations ORDER BY name`).all();
  res.json(rows);
});

// GET /api/organizations/:id
router.get('/:id', (req, res) => {
  const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(req.params.id);
  if (!org) return res.status(404).json({ error: 'Organization not found.' });
  res.json(org);
});

// POST /api/organizations
router.post('/', (req, res) => {
  const { name, address, phone, email, type } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required.' });
  const result = db.prepare(`
    INSERT INTO organizations (name, address, phone, email, type) VALUES (?, ?, ?, ?, ?)
  `).run(name, address || null, phone || null, email || null, type || null);
  res.json({ id: result.lastInsertRowid, success: true });
});

// PUT /api/organizations/:id
router.put('/:id', (req, res) => {
  const { name, address, phone, email, type } = req.body;
  db.prepare(`UPDATE organizations SET name=?, address=?, phone=?, email=?, type=? WHERE id=?`)
    .run(name, address || null, phone || null, email || null, type || null, req.params.id);
  res.json({ success: true });
});

module.exports = router;
