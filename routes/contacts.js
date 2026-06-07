const express = require('express');
const db      = require('../database/db');
const demoAuth = require('../middleware/demoAuth');

const router = express.Router();
// Temporarily using demoAuth until B.4 adds real login.
router.use(demoAuth);

// GET /api/contacts?search=...
router.get('/', (req, res) => {
  const { search } = req.query;
  const SELECT = `
    SELECT c.*, o.name AS org_name,
           (SELECT COUNT(*) FROM deal_contacts dc WHERE dc.contact_id = c.id) AS deal_count
    FROM contacts c
    LEFT JOIN organizations o ON o.id = c.organization_id
  `;
  let rows;
  if (search) {
    rows = db.prepare(`${SELECT} WHERE c.name LIKE ? ORDER BY c.name LIMIT 20`).all(`%${search}%`);
  } else {
    rows = db.prepare(`${SELECT} ORDER BY c.name`).all();
  }
  rows = rows.map(r => ({ ...r, phones: JSON.parse(r.phones || '[]'), emails: JSON.parse(r.emails || '[]') }));
  res.json(rows);
});

// GET /api/contacts/:id — contact profile, incl. every deal + role this person touches.
router.get('/:id', (req, res) => {
  const c = db.prepare(`
    SELECT c.*, o.name AS org_name FROM contacts c
    LEFT JOIN organizations o ON o.id = c.organization_id WHERE c.id = ?
  `).get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Contact not found.' });
  const deals = db.prepare(`
    SELECT dc.role, o.id AS opportunity_id, o.title, o.stage, o.status,
           u.name AS salesman_name
    FROM deal_contacts dc
    JOIN opportunities o ON o.id = dc.opportunity_id
    LEFT JOIN users u ON u.id = o.salesman_id
    WHERE dc.contact_id = ?
    ORDER BY o.updated_at DESC
  `).all(req.params.id);
  res.json({ ...c, phones: JSON.parse(c.phones || '[]'), emails: JSON.parse(c.emails || '[]'), deals });
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

// PUT /api/contacts/:id/blacklist        (Phase 6)
//   Body: { blacklisted: bool, reason? }
//   Managers + admin only.
router.put('/:id/blacklist', (req, res) => {
  if (!['admin', 'sales_manager', 'design_manager'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Only managers can blacklist contacts.' });
  }
  const c = db.prepare('SELECT id FROM contacts WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Contact not found.' });
  const flag = req.body && req.body.blacklisted ? 1 : 0;
  const reason = (req.body && req.body.reason || '').toString().trim() || null;
  db.prepare(`UPDATE contacts SET is_blacklisted = ?, blacklist_reason = ? WHERE id = ?`)
    .run(flag, flag ? reason : null, req.params.id);
  res.json({ success: true });
});

module.exports = router;
