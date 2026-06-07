// Deal ↔ Contact ↔ Role links. Lets the UI attach/detach a person to a deal
// under one of the 4 roles (Owner / Owner Rep / Contractor / Consultant).
const express  = require('express');
const db       = require('../database/db');
const demoAuth = require('../middleware/demoAuth');

const router = express.Router();
router.use(demoAuth);   // matches opportunities/contacts — swap to authMw with B.4

const ROLES = ['Owner', 'Owner Rep', 'Contractor', 'Consultant'];

// POST /api/deal-contacts  { opportunity_id, role, contact_id? | name? }
// Links an existing contact, or creates a contact by name then links it.
router.post('/', (req, res) => {
  const { opportunity_id, role } = req.body;
  let { contact_id, name } = req.body;
  if (!opportunity_id || !role) return res.status(400).json({ error: 'opportunity_id and role are required.' });
  if (!ROLES.includes(role))    return res.status(400).json({ error: `role must be one of: ${ROLES.join(', ')}` });

  const opp = db.prepare('SELECT id FROM opportunities WHERE id = ?').get(opportunity_id);
  if (!opp) return res.status(404).json({ error: 'Opportunity not found.' });

  if (!contact_id) {
    const clean = (name || '').toString().trim().replace(/\s+/g, ' ');
    if (!clean) return res.status(400).json({ error: 'Provide contact_id or name.' });
    // Reuse an existing contact with the same name before creating a new one.
    const existing = db.prepare('SELECT id FROM contacts WHERE lower(name) = lower(?)').get(clean);
    contact_id = existing
      ? existing.id
      : db.prepare(`INSERT INTO contacts (name, phones, emails) VALUES (?, '[]', '[]')`).run(clean).lastInsertRowid;
  } else {
    const c = db.prepare('SELECT id FROM contacts WHERE id = ?').get(contact_id);
    if (!c) return res.status(404).json({ error: 'Contact not found.' });
  }

  db.prepare(`INSERT OR IGNORE INTO deal_contacts (opportunity_id, contact_id, role, created_at)
              VALUES (?, ?, ?, datetime('now'))`)
    .run(opportunity_id, contact_id, role);

  // Phase 6 — overlap notification: if this contact is already on another deal owned
  // by a DIFFERENT salesman, notify each of those other salesmen.
  try {
    const c = db.prepare('SELECT name FROM contacts WHERE id = ?').get(contact_id);
    const thisOpp = db.prepare(`SELECT title, salesman_id FROM opportunities WHERE id = ?`).get(opportunity_id);
    const others = db.prepare(`
      SELECT DISTINCT o.salesman_id, o.title
      FROM deal_contacts dc JOIN opportunities o ON o.id = dc.opportunity_id
      WHERE dc.contact_id = ? AND o.id <> ?
        AND o.salesman_id IS NOT NULL AND o.salesman_id <> ?
    `).all(contact_id, opportunity_id, thisOpp ? (thisOpp.salesman_id || 0) : 0);
    if (others.length && req.io) {
      const insert = db.prepare(`INSERT INTO notifications (user_id, type, message, opp_id) VALUES (?, ?, ?, ?)`);
      const seen = new Set();
      others.forEach(o => {
        if (seen.has(o.salesman_id)) return;
        seen.add(o.salesman_id);
        const msg = `${c?.name || 'A contact'} was just added as ${role} on "${thisOpp?.title}" by ${req.user.name} — you also have them on "${o.title}"`;
        insert.run(o.salesman_id, 'contact_overlap', msg, opportunity_id);
        req.io.to(`user:${o.salesman_id}`).emit('notification', { type: 'contact_overlap', message: msg });
      });
    }
  } catch (e) { /* don't fail the link on a notification hiccup */ }

  res.json({ success: true, contact_id });
});

// DELETE /api/deal-contacts  { opportunity_id, contact_id, role }
router.delete('/', (req, res) => {
  const { opportunity_id, contact_id, role } = req.body;
  if (!opportunity_id || !contact_id || !role)
    return res.status(400).json({ error: 'opportunity_id, contact_id and role are required.' });
  db.prepare(`DELETE FROM deal_contacts WHERE opportunity_id = ? AND contact_id = ? AND role = ?`)
    .run(opportunity_id, contact_id, role);
  res.json({ success: true });
});

module.exports = router;
