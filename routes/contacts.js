const express = require('express');
const db      = require('../database/db');
const authMw  = require('../middleware/auth');

const router = express.Router();
router.use(authMw);

// GET /api/contacts?search=...
router.get('/', (req, res) => {
  const { search } = req.query;
  let rows;
  if (search) {
    rows = db.prepare(`
      SELECT c.*, o.name AS org_name FROM contacts c
      LEFT JOIN organizations o ON o.id = c.organization_id
      WHERE c.name LIKE ? ORDER BY c.name LIMIT 20
    `).all(`%${search}%`);
  } else {
    rows = db.prepare(`
      SELECT c.*, o.name AS org_name FROM contacts c
      LEFT JOIN organizations o ON o.id = c.organization_id
      ORDER BY c.name
    `).all();
  }
  rows = rows.map(r => ({ ...r, phones: JSON.parse(r.phones || '[]'), emails: JSON.parse(r.emails || '[]') }));
  res.json(rows);
});

// GET /api/contacts/:id
router.get('/:id', (req, res) => {
  const c = db.prepare(`
    SELECT c.*, o.name AS org_name FROM contacts c
    LEFT JOIN organizations o ON o.id = c.organization_id WHERE c.id = ?
  `).get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Contact not found.' });
  res.json({ ...c, phones: JSON.parse(c.phones || '[]'), emails: JSON.parse(c.emails || '[]') });
});

// POST /api/contacts
router.post('/', (req, res) => {
  const { name, phones = [], emails = [], organization_id, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required.' });
  const result = db.prepare(`
    INSERT INTO contacts (name, phones, emails, organization_id, notes) VALUES (?, ?, ?, ?, ?)
  `).run(name, JSON.stringify(phones), JSON.stringify(emails), organization_id || null, notes || null);
  res.json({ id: result.lastInsertRowid, success: true });
});

// PUT /api/contacts/:id
router.put('/:id', (req, res) => {
  const { name, phones = [], emails = [], organization_id, notes } = req.body;
  db.prepare(`
    UPDATE contacts SET name=?, phones=?, emails=?, organization_id=?, notes=? WHERE id=?
  `).run(name, JSON.stringify(phones), JSON.stringify(emails), organization_id || null, notes || null, req.params.id);
  res.json({ success: true });
});

module.exports = router;
