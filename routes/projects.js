// Projects — market construction projects that need HVAC (diagnostic layer, H1).
// A Project exists in the market independent of our pursuit; one Project → 0..many
// Deals (opportunities.project_id). Distinct from opportunities and from
// design_requests.project_type. Uses demoAuth like the other pipeline routes.

const express  = require('express');
const db       = require('../database/db');
const demoAuth = require('../middleware/demoAuth');

const router = express.Router();
router.use(demoAuth);

// Allowed enum values — mirror the schema CHECKs; validate here for clean 400s.
const AWARENESS = ['unaware', 'aware-late', 'aware-early', 'involved-in-spec'];
const SOURCES   = ['consultant relationship', 'contractor relationship', 'public tender', 'referral', 'walk-in', 'unknown'];
const OUTCOMES  = ['pending', 'won by us', 'lost to competitor', 'cancelled', 'unknown'];

const EDITABLE = [
  'name', 'client_contact_id', 'client_free_text', 'mep_consultant_contact_id',
  'awarding_party', 'estimated_hvac_value', 'awareness_stage', 'source', 'outcome',
  'winning_competitor', 'pursued', 'not_pursued_reason',
  'date_awareness_gained', 'date_spec_locked', 'date_awarded', 'date_outcome_learned',
];

function validateEnums(body) {
  if (body.awareness_stage != null && body.awareness_stage !== '' && !AWARENESS.includes(body.awareness_stage))
    return `awareness_stage must be one of: ${AWARENESS.join(', ')}`;
  if (body.source != null && body.source !== '' && !SOURCES.includes(body.source))
    return `source must be one of: ${SOURCES.join(', ')}`;
  if (body.outcome != null && body.outcome !== '' && !OUTCOMES.includes(body.outcome))
    return `outcome must be one of: ${OUTCOMES.join(', ')}`;
  return null;
}

// GET /api/projects?search=&outcome=&awareness_stage=&pursued=
router.get('/', (req, res) => {
  const { search, outcome, awareness_stage, pursued } = req.query;
  const where = [];
  const args = [];
  if (search) { where.push(`(p.name LIKE ? OR p.awarding_party LIKE ?)`); args.push(`%${search}%`, `%${search}%`); }
  if (outcome) { where.push(`p.outcome = ?`); args.push(outcome); }
  if (awareness_stage) { where.push(`p.awareness_stage = ?`); args.push(awareness_stage); }
  if (pursued === '0' || pursued === '1') { where.push(`p.pursued = ?`); args.push(+pursued); }
  const rows = db.prepare(`
    SELECT p.*,
           cc.name AS client_contact_name,
           mc.name AS mep_consultant_name,
           (SELECT COUNT(*) FROM opportunities o WHERE o.project_id = p.id) AS deal_count
    FROM projects p
    LEFT JOIN contacts cc ON cc.id = p.client_contact_id
    LEFT JOIN contacts mc ON mc.id = p.mep_consultant_contact_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY p.updated_at DESC, p.id DESC
    LIMIT 200
  `).all(...args);
  res.json(rows);
});

// GET /api/projects/:id — project + its linked deals
router.get('/:id', (req, res) => {
  const p = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found.' });
  p.deals = db.prepare(`
    SELECT id, title, stage, status, expected_value, signing_price, salesman_id
    FROM opportunities WHERE project_id = ? ORDER BY id DESC
  `).all(p.id);
  res.json(p);
});

// POST /api/projects
router.post('/', (req, res) => {
  const b = req.body || {};
  if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'name is required.' });
  const err = validateEnums(b);
  if (err) return res.status(400).json({ error: err });

  const cols = ['name', ...EDITABLE.filter(k => k !== 'name' && b[k] !== undefined), 'created_by'];
  const vals = cols.map(k => k === 'created_by' ? (req.user && req.user.id) : (b[k] === '' ? null : b[k]));
  const placeholders = cols.map(() => '?').join(',');
  const info = db.prepare(`INSERT INTO projects (${cols.join(',')}) VALUES (${placeholders})`).run(...vals);
  res.status(201).json({ id: info.lastInsertRowid, success: true });
});

// PUT /api/projects/:id — partial update over the editable set
router.put('/:id', (req, res) => {
  const p = db.prepare(`SELECT id FROM projects WHERE id = ?`).get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found.' });
  const b = req.body || {};
  const err = validateEnums(b);
  if (err) return res.status(400).json({ error: err });

  const sets = [];
  const args = [];
  for (const k of EDITABLE) {
    if (b[k] !== undefined) { sets.push(`${k} = ?`); args.push(b[k] === '' ? null : b[k]); }
  }
  if (!sets.length) return res.json({ success: true, unchanged: true });
  sets.push(`updated_at = datetime('now')`);
  args.push(req.params.id);
  db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...args);
  res.json({ success: true });
});

module.exports = router;
