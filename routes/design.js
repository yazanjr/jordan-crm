// Design Request workflow — backend for the pipeline-v3 design pages.
// Tables: design_requests, design_stage_history, quotation_versions.
//
// All routes use demo-auth (x-demo-user-id header). Stage history is
// SECRET — never returned by /my-design-tasks. Only /design-performance
// (admin + sales_manager) exposes timing data.

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const db      = require('../database/db');
const demoAuth = require('../middleware/demoAuth');
const { requireRole } = demoAuth;

const router = express.Router();
router.use(demoAuth);

// ── Discount approval helpers ──────────────────────────────────────────────
// The standard discount limit is configurable (settings.discount_limit, stored
// as a percent e.g. "30"). Returns the limit as a fraction (0.30).
function discountLimitFraction() {
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'discount_limit'`).get();
  const pct = parseFloat(row && row.value);
  return (Number.isFinite(pct) ? pct : 30) / 100;
}
// True if this opportunity has an APPROVED discount override covering `frac`
// (a fraction). discount_approvals.approved_pct is stored as a percent.
function hasApprovedDiscount(oppId, frac) {
  if (!oppId) return false;
  const row = db.prepare(`
    SELECT MAX(approved_pct) AS maxpct FROM discount_approvals
    WHERE opp_id = ? AND status = 'Approved'
  `).get(oppId);
  if (!row || row.maxpct == null) return false;
  return (row.maxpct / 100) >= frac - 1e-9;
}

// ---------------------------------------------------------------------------
// MULTER — site plan + design file uploads. Stored under uploads/design/:id/
// ---------------------------------------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(process.env.UPLOADS_PATH || './uploads', 'design', String(req.params.id || 'tmp'));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[/\\:*?"<>|]/g, '_')}`),
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

// Notify a user (DB row + socket emit). Reused for every trigger.
function notify(io, userIds, type, message, requestId) {
  if (!io) return;
  const insert = db.prepare(`INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)`);
  const unique = [...new Set(userIds.filter(Boolean))];
  unique.forEach(uid => {
    insert.run(uid, type, message);
    io.to(`user:${uid}`).emit('notification', { type, message, requestId });
  });
}

// Users with a given role (used for fan-out notifications to all design managers etc.).
function usersWithRole(roleName) {
  return db.prepare(`
    SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
    WHERE r.name = ? AND u.is_active = 1
  `).all(roleName).map(u => u.id);
}

// Log a stage transition. Auto-calculates minutes spent in the prior stage.
function logStageChange(requestId, fromStage, toStage, changedBy, notes) {
  // Find the most recent transition into the prior stage to compute time-in-stage.
  let minutes = 0;
  if (fromStage) {
    const prior = db.prepare(`
      SELECT changed_at FROM design_stage_history
      WHERE request_id = ? AND to_stage = ?
      ORDER BY id DESC LIMIT 1
    `).get(requestId, fromStage);
    if (prior?.changed_at) {
      minutes = Math.round((Date.now() - new Date(prior.changed_at + 'Z').getTime()) / 60000);
    }
  } else {
    // No prior stage — measure from creation.
    const req0 = db.prepare(`SELECT created_at FROM design_requests WHERE id = ?`).get(requestId);
    if (req0?.created_at) minutes = Math.round((Date.now() - new Date(req0.created_at + 'Z').getTime()) / 60000);
  }
  db.prepare(`
    INSERT INTO design_stage_history (request_id, from_stage, to_stage, changed_by, time_in_previous_stage, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(requestId, fromStage || null, toStage, changedBy || null, Math.max(0, minutes), notes || null);
}

// Move the parent opportunity to a target pipeline stage and log to stage_history.
// Used when design is requested (→ Lead), when Sally returns a request (→ Prospect),
// and when she releases a design (→ Tender or Analysis).
function moveOppToStage(oppId, toStage, userId, note) {
  const opp = db.prepare(`SELECT id, stage, created_at FROM opportunities WHERE id = ?`).get(oppId);
  if (!opp || opp.stage === toStage) return;
  const created = new Date(opp.created_at + 'Z').getTime();
  const seconds = Math.max(0, Math.floor((Date.now() - created) / 1000));
  db.prepare(`UPDATE opportunities SET stage = ?, updated_at = datetime('now') WHERE id = ?`).run(toStage, oppId);
  db.prepare(`
    INSERT INTO stage_history (opp_id, from_stage, to_stage, changed_by, seconds_in_prev)
    VALUES (?, ?, ?, ?, ?)
  `).run(oppId, opp.stage, toStage, userId || null, seconds);
}
function moveOppToLead(oppId, userId, note) { moveOppToStage(oppId, 'Lead', userId, note); }

// Cost columns on line items / quotations that only PM + admin + can_view_costs users see.
const COST_KEYS = ['cost_snapshot', 'cost_jod', 'gross_profit', 'gross_profit_pct'];
function canViewCosts(user) {
  return user && (user.can_view_costs === 1 || user.role === 'admin' || user.role === 'product_manager');
}
function redactRequestForUser(enrichedReq, user) {
  if (!enrichedReq || canViewCosts(user)) return enrichedReq;
  const out = { ...enrichedReq };
  if (Array.isArray(out.quotations)) {
    out.quotations = out.quotations.map(q => ({
      ...q,
      line_items: Array.isArray(q.line_items)
        ? q.line_items.map(li => { const c = { ...li }; for (const k of COST_KEYS) delete c[k]; return c; })
        : q.line_items,
    }));
  }
  if (out.latest_quotation) {
    const lq = { ...out.latest_quotation };
    if (Array.isArray(lq.line_items)) {
      lq.line_items = lq.line_items.map(li => { const c = { ...li }; for (const k of COST_KEYS) delete c[k]; return c; });
    }
    out.latest_quotation = lq;
  }
  return out;
}

// Enrich a design_request row with joined display fields the frontend needs.
function enrich(r) {
  if (!r) return null;
  const opp = db.prepare(`
    SELECT o.id, o.title, o.stage AS opp_stage, o.product_group,
           org.name AS org_name, s.name AS salesman_name, s.id AS salesman_id
    FROM opportunities o
    LEFT JOIN organizations org ON org.id = o.org_id
    LEFT JOIN users s ON s.id = o.salesman_id
    WHERE o.id = ?
  `).get(r.opportunity_id) || {};
  const designer = r.assigned_designer_id
    ? db.prepare(`SELECT id, name FROM users WHERE id = ?`).get(r.assigned_designer_id)
    : null;
  const requester = r.requested_by
    ? db.prepare(`SELECT id, name FROM users WHERE id = ?`).get(r.requested_by)
    : null;
  const reviewer = r.assigned_reviewer_id
    ? db.prepare(`SELECT id, name FROM users WHERE id = ?`).get(r.assigned_reviewer_id)
    : null;
  const quotes = db.prepare(`
    SELECT id, version_number, total_value, files, designer_notes,
           review_status, review_notes, submitted_at, reviewed_at, released_at,
           discount_pct_global, target_release_stage, reference,
           project_name, city, project_type, pricing_mode,
           sales_engineer_name, design_engineer_name, brand,
           intro_text, maintenance_text, tnc_text, revision_type, parent_version_id
    FROM quotation_versions WHERE request_id = ? ORDER BY version_number
  `).all(r.id).map(q => {
    const line_items = db.prepare(`
      SELECT id, line_num, sku_id, category, model, description, qty, unit,
             list_price, discount_pct, unit_price, subtotal, is_override, cost_snapshot
      FROM quotation_line_items WHERE quotation_version_id = ? ORDER BY line_num
    `).all(q.id);
    return { ...q, files: JSON.parse(q.files || '[]'), line_items };
  });
  return {
    ...r,
    site_plans:   JSON.parse(r.site_plans || '[]'),
    form_data:    r.form_data ? safeJsonParse(r.form_data, {}) : {},
    opp_title:    opp.title || null,
    opp_stage:    opp.opp_stage || null,
    org_name:     opp.org_name || null,
    product_group: opp.product_group || null,
    salesman_id:   opp.salesman_id || null,
    salesman_name: opp.salesman_name || null,
    designer_name: designer?.name || null,
    reviewer_name: reviewer?.name || null,
    requested_by_name: requester?.name || null,
    quotations:   quotes,
    latest_quotation: quotes[quotes.length - 1] || null,
  };
}

function safeJsonParse(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

// Pull the 5 indexed mirror fields out of form_data so SQL filters work later.
// Keep this in sync with the form schema in scripts/20-design-request-form.jsx.
function deriveMirrors(formData) {
  const f = formData || {};
  const ac = f.ac || {};
  const heat = f.heating || {};
  // system_type: first selected AC system, comma-joined if multiple
  const sysList = (ac.system_types || []).filter(Boolean);
  const system_type = sysList.length ? sysList.join(',') : null;
  return {
    form_type:   f.form_type || null,
    system_type,
    has_pool:    heat.pool && heat.pool.present && heat.pool.present !== 'No' ? 1 : 0,
    has_solar:   heat.solar && heat.solar.present ? 1 : 0,
  };
}

function getRequest(id) {
  const r = db.prepare(`SELECT * FROM design_requests WHERE id = ?`).get(id);
  return r ? enrich(r) : null;
}

// ---------------------------------------------------------------------------
// POST /api/design-requests
//   Body: { opportunity_id, project_type, urgency, site_plans, salesman_notes }
//   Permission: salesman who owns the opportunity (or sales_manager / admin).
// ---------------------------------------------------------------------------
router.post('/design-requests', (req, res) => {
  const { opportunity_id, project_type, urgency, site_plans, salesman_notes, form_data } = req.body;
  if (!opportunity_id || !project_type) return res.status(400).json({ error: 'opportunity_id and project_type required.' });

  const opp = db.prepare(`SELECT id, title, salesman_id FROM opportunities WHERE id = ?`).get(opportunity_id);
  if (!opp) return res.status(404).json({ error: 'Opportunity not found.' });

  const isOwner = opp.salesman_id === req.user.id;
  const isManager = ['admin', 'sales_manager', 'design_manager'].includes(req.user.role);
  if (!isOwner && !isManager) {
    return res.status(403).json({ error: 'You can only request design on opportunities you own.' });
  }

  const mirrors = deriveMirrors(form_data);

  // If a previous request exists for this opp (e.g. Sally returned the prior one),
  // chain the new request to it so reports can trace the full history per deal.
  const prior = db.prepare(`
    SELECT id, version FROM design_requests
    WHERE opportunity_id = ? ORDER BY version DESC, id DESC LIMIT 1
  `).get(opportunity_id);
  const parent_request_id = prior ? prior.id : null;
  const nextVersion = prior ? (prior.version || 1) + 1 : 1;

  const info = db.prepare(`
    INSERT INTO design_requests (
      opportunity_id, request_type, requested_by, project_type, urgency,
      site_plans, salesman_notes, form_type, form_data, system_type, has_pool, has_solar,
      design_stage, version, parent_request_id
    ) VALUES (?, 'New', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Incoming', ?, ?)
  `).run(
    opportunity_id, req.user.id, project_type, urgency || 'Standard',
    JSON.stringify(site_plans || []), salesman_notes || null,
    mirrors.form_type, JSON.stringify(form_data || {}),
    mirrors.system_type, mirrors.has_pool, mirrors.has_solar,
    nextVersion, parent_request_id
  );
  const requestId = info.lastInsertRowid;

  logStageChange(requestId, null, 'Incoming', req.user.id, 'Created by salesman');

  // Phase 1: requesting design moves the parent opportunity to Design/Redesign (stage='Lead').
  moveOppToLead(opportunity_id, req.user.id, 'Design requested');

  // Notify Design Manager + Sales Manager
  const recipients = [...usersWithRole('design_manager'), ...usersWithRole('sales_manager')];
  notify(req.io, recipients, 'design_request_created',
    `${req.user.name} requested design for "${opp.title}"`, requestId);

  res.status(201).json(redactRequestForUser(getRequest(requestId), req.user));
});

// ---------------------------------------------------------------------------
// POST /api/design-requests/:id/assign
//   Body: { designer_id, priority, estimated_hours, due_date, design_notes }
//   Permission: sales_manager OR design_manager OR admin
// ---------------------------------------------------------------------------
router.post('/design-requests/:id/assign',
  requireRole('admin', 'sales_manager', 'design_manager'),
  (req, res) => {
    const id = +req.params.id;
    const r = db.prepare(`SELECT * FROM design_requests WHERE id = ?`).get(id);
    if (!r) return res.status(404).json({ error: 'Request not found.' });

    let { designer_id, assigned_reviewer_id } = req.body;
    const { priority, estimated_hours, due_date, design_notes } = req.body;
    if (!designer_id) return res.status(400).json({ error: 'designer_id required.' });
    // Tolerate a 'U0XX'-prefixed id from the frontend — coerce to the integer users.id.
    if (typeof designer_id === 'string' && /^U\d+$/i.test(designer_id)) {
      designer_id = parseInt(designer_id.slice(1), 10);
    }
    if (typeof assigned_reviewer_id === 'string' && /^U\d+$/i.test(assigned_reviewer_id)) {
      assigned_reviewer_id = parseInt(assigned_reviewer_id.slice(1), 10);
    }

    const designer = db.prepare(`
      SELECT u.id, u.name FROM users u JOIN roles ro ON ro.id = u.role_id
      WHERE u.id = ? AND ro.name IN ('designer', 'design_manager')
    `).get(designer_id);
    if (!designer) return res.status(400).json({ error: 'Target user is not a designer.' });

    // Reviewer (optional). Must be a design_manager OR a designer with is_senior=1.
    if (assigned_reviewer_id) {
      const reviewer = db.prepare(`
        SELECT u.id, u.name, u.is_senior, ro.name AS role
        FROM users u JOIN roles ro ON ro.id = u.role_id
        WHERE u.id = ?
      `).get(assigned_reviewer_id);
      if (!reviewer) return res.status(400).json({ error: 'Reviewer not found.' });
      const eligible = reviewer.role === 'design_manager'
        || (reviewer.role === 'designer' && !!reviewer.is_senior)
        || reviewer.role === 'admin';
      if (!eligible) {
        return res.status(400).json({ error: 'Reviewer must be a design manager or a senior designer.' });
      }
    }

    const fromStage = r.design_stage;
    const newStage  = fromStage === 'Incoming' ? 'Queued' : fromStage;

    db.prepare(`
      UPDATE design_requests
      SET assigned_designer_id = ?, assigned_reviewer_id = ?, assigned_by = ?, priority = ?,
          estimated_hours = ?, due_date = ?, design_notes = ?,
          design_stage = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      designer_id, assigned_reviewer_id || null, req.user.id, priority || null,
      estimated_hours || null, due_date || null, design_notes || null,
      newStage, id
    );

    if (newStage !== fromStage) {
      logStageChange(id, fromStage, newStage, req.user.id, `Assigned to ${designer.name}`);
    }

    const opp = db.prepare(`SELECT title FROM opportunities WHERE id = ?`).get(r.opportunity_id);
    notify(req.io, [designer_id], 'design_assigned',
      `You've been assigned design work on "${opp?.title}"`, id);
    if (assigned_reviewer_id && assigned_reviewer_id !== req.user.id) {
      notify(req.io, [assigned_reviewer_id], 'design_review_assigned',
        `You're the reviewer on "${opp?.title}"`, id);
    }

    res.json(redactRequestForUser(getRequest(id), req.user));
  });

// (Indented redactor variant for the assign + return blocks already covered.)

// ---------------------------------------------------------------------------
// PUT /api/design-requests/:id/stage
//   Body: { stage, notes }
//   Permission depends on transition (see below).
// ---------------------------------------------------------------------------
const ALLOWED_TRANSITIONS = {
  'Queued':      ['In Progress'],                       // designer starts
  'In Progress': ['Review'],                            // designer submits
  'Review':      ['Approved', 'In Progress'],           // sally approves OR revises
  'Approved':    ['Released'],                          // sally releases
};

router.put('/design-requests/:id/stage', (req, res) => {
  const id = +req.params.id;
  const r = db.prepare(`SELECT * FROM design_requests WHERE id = ?`).get(id);
  if (!r) return res.status(404).json({ error: 'Request not found.' });

  const { stage, notes } = req.body;
  const allowed = ALLOWED_TRANSITIONS[r.design_stage] || [];
  if (!allowed.includes(stage)) {
    return res.status(400).json({ error: `Cannot move ${r.design_stage} → ${stage}.` });
  }

  // Role checks per transition
  const role = req.user.role;
  const isDesignerOnTask = r.assigned_designer_id === req.user.id;
  const isManager = ['design_manager', 'admin'].includes(role);
  const isAssignedReviewer = !!r.assigned_reviewer_id && r.assigned_reviewer_id === req.user.id;

  if (r.design_stage === 'Queued' && stage === 'In Progress') {
    if (!isDesignerOnTask && !isManager) return res.status(403).json({ error: 'Only the assigned designer can start.' });
  } else if (r.design_stage === 'In Progress' && stage === 'Review') {
    if (!isDesignerOnTask && !isManager) return res.status(403).json({ error: 'Only the assigned designer can submit.' });
  } else if (r.design_stage === 'Review' && (stage === 'Approved' || stage === 'In Progress')) {
    if (!isManager && !isAssignedReviewer) return res.status(403).json({ error: 'Only the design manager or the assigned reviewer can review.' });
  } else if (r.design_stage === 'Approved' && stage === 'Released') {
    if (!isManager && !isAssignedReviewer) return res.status(403).json({ error: 'Only the design manager or the assigned reviewer can release.' });
  }

  // Side-effects depending on transition
  if (r.design_stage === 'Review' && stage === 'In Progress') {
    // Revision requested — mark latest quote as Revision Requested + bump version on request itself.
    const latest = db.prepare(`SELECT id, version_number FROM quotation_versions WHERE request_id = ? ORDER BY version_number DESC LIMIT 1`).get(id);
    if (latest) {
      db.prepare(`UPDATE quotation_versions SET review_status='Revision Requested', review_notes=?, reviewed_by=?, reviewed_at=datetime('now') WHERE id=?`)
        .run(notes || null, req.user.id, latest.id);
    }
    db.prepare(`UPDATE design_requests SET design_stage=?, updated_at=datetime('now') WHERE id=?`).run(stage, id);
  } else if (r.design_stage === 'Review' && stage === 'Approved') {
    // Approve the latest quote AND auto-release using the designer's chosen
    // target_release_stage (Phase 8.1 — designer is the responsible party).
    const latest = db.prepare(`SELECT id, version_number, total_value, target_release_stage FROM quotation_versions WHERE request_id = ? ORDER BY version_number DESC LIMIT 1`).get(id);
    if (latest) {
      db.prepare(`UPDATE quotation_versions SET review_status='Approved', review_notes=?, reviewed_by=?, reviewed_at=datetime('now'), approved_by=?, released_at=datetime('now'), released_by=? WHERE id=?`)
        .run(notes || null, req.user.id, req.user.id, r.assigned_designer_id, latest.id);
    }
    // Resolve where the deal goes — designer's pre-pick wins; fall back to a
    // body-supplied released_to_stage if it's a manual approve via the old UI.
    const routeTo = (latest && (latest.target_release_stage === 'Tender' || latest.target_release_stage === 'Analysis'))
      ? latest.target_release_stage
      : (req.body.released_to_stage === 'Tender' || req.body.released_to_stage === 'Analysis' ? req.body.released_to_stage : null);

    // Skip the intermediate "Approved" state entirely — move straight to Released.
    db.prepare(`UPDATE design_requests SET design_stage='Released', released_to_stage=?, updated_at=datetime('now') WHERE id=?`)
      .run(routeTo, id);
    if (routeTo) {
      moveOppToStage(r.opportunity_id, routeTo, r.assigned_designer_id, `Design auto-released → ${routeTo} on approval`);
    }
    // Sync deal value to the released quotation total.
    if (latest && typeof latest.total_value === 'number') {
      db.prepare(`UPDATE opportunities SET expected_value = ?, value_source = ?, value_source_quote_id = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(latest.total_value, `quotation:V${latest.version_number}`, latest.id, r.opportunity_id);
    }
  } else if (r.design_stage === 'Approved' && stage === 'Released') {
    const latest = db.prepare(`SELECT id FROM quotation_versions WHERE request_id = ? ORDER BY version_number DESC LIMIT 1`).get(id);
    if (latest) {
      db.prepare(`UPDATE quotation_versions SET released_at=datetime('now') WHERE id=?`).run(latest.id);
    }
    // Phase 2: Sally picks where the deal goes next (Tender or Analysis).
    const routeTo = (req.body.released_to_stage === 'Tender' || req.body.released_to_stage === 'Analysis')
      ? req.body.released_to_stage : null;
    db.prepare(`UPDATE design_requests SET design_stage=?, released_to_stage=?, updated_at=datetime('now') WHERE id=?`)
      .run(stage, routeTo, id);
    if (routeTo) moveOppToStage(r.opportunity_id, routeTo, req.user.id, `Design released → ${routeTo}`);
  } else {
    db.prepare(`UPDATE design_requests SET design_stage=?, updated_at=datetime('now') WHERE id=?`).run(stage, id);
  }

  logStageChange(id, r.design_stage, stage, req.user.id, notes);

  // Notifications per transition
  const opp = db.prepare(`SELECT title, salesman_id FROM opportunities WHERE id = ?`).get(r.opportunity_id);
  if (r.design_stage === 'Queued' && stage === 'In Progress') {
    notify(req.io, usersWithRole('design_manager'), 'design_started',
      `${req.user.name} started work on "${opp?.title}"`, id);
  } else if (r.design_stage === 'In Progress' && stage === 'Review') {
    // Notify ALL design managers + the specific assigned reviewer (Phase 8.1).
    const submitRecipients = new Set(usersWithRole('design_manager'));
    if (r.assigned_reviewer_id) submitRecipients.add(r.assigned_reviewer_id);
    notify(req.io, [...submitRecipients], 'design_submitted',
      `${req.user.name} submitted "${opp?.title}" for review`, id);
  } else if (r.design_stage === 'Review' && stage === 'In Progress') {
    notify(req.io, [r.assigned_designer_id], 'design_revision_requested',
      `Revision requested on "${opp?.title}"${notes ? ': ' + notes : ''}`, id);
  } else if (r.design_stage === 'Review' && stage === 'Approved') {
    // Phase 8.1 — Approval auto-releases. Notify designer (approved + released),
    // salesman (quotation ready), and Sally (status update).
    notify(req.io, [r.assigned_designer_id], 'design_approved',
      `Your design for "${opp?.title}" was approved and released`, id);
    notify(req.io, [opp?.salesman_id], 'design_released',
      `Quotation ready for "${opp?.title}"`, id);
    notify(req.io, usersWithRole('design_manager').filter(uid => uid !== req.user.id), 'design_released',
      `"${opp?.title}" was approved & released by ${req.user.name}`, id);
  } else if (r.design_stage === 'Approved' && stage === 'Released') {
    notify(req.io, [opp?.salesman_id], 'design_released',
      `Quotation ready for "${opp?.title}"`, id);
  }

  res.json(redactRequestForUser(getRequest(id), req.user));
});

// ---------------------------------------------------------------------------
// POST /api/design-requests/:id/return       (Phase 2)
//   Body: { reason }
//   Permission: design_manager OR admin
//   Marks the request 'Returned' with Sally's reason, moves the parent opportunity
//   back to Prospect, and notifies the salesman.
// ---------------------------------------------------------------------------
router.post('/design-requests/:id/return',
  require('../middleware/demoAuth').requireRole('admin', 'design_manager'),
  (req, res) => {
    const id = +req.params.id;
    const r = db.prepare(`SELECT * FROM design_requests WHERE id = ?`).get(id);
    if (!r) return res.status(404).json({ error: 'Request not found.' });
    if (r.design_stage === 'Released') return res.status(400).json({ error: 'Cannot return a released request.' });
    const reason = (req.body && req.body.reason || '').toString().trim();
    if (!reason) return res.status(400).json({ error: 'A reason is required.' });

    const fromStage = r.design_stage;
    db.prepare(`UPDATE design_requests SET design_stage='Returned', returned_reason=?, updated_at=datetime('now') WHERE id=?`)
      .run(reason, id);
    logStageChange(id, fromStage, 'Returned', req.user.id, reason);

    // Deal goes back to Prospect (per management decision).
    moveOppToStage(r.opportunity_id, 'Prospect', req.user.id, 'Design returned by Sally');

    const opp = db.prepare(`SELECT title, salesman_id FROM opportunities WHERE id = ?`).get(r.opportunity_id);
    notify(req.io, [opp?.salesman_id], 'design_returned',
      `Design returned on "${opp?.title}": ${reason}`, id);

    res.json(redactRequestForUser(getRequest(id), req.user));
  });

// ---------------------------------------------------------------------------
// POST /api/design-requests/:id/revision
//   Called by the salesman during Analysis/Negotiation to ask for a modification.
//   Creates a NEW design_request linked to the same opportunity with bumped version.
// ---------------------------------------------------------------------------
router.post('/design-requests/:id/revision', (req, res) => {
  const id = +req.params.id;
  const prior = db.prepare(`SELECT * FROM design_requests WHERE id = ?`).get(id);
  if (!prior) return res.status(404).json({ error: 'Original request not found.' });

  const opp = db.prepare(`SELECT id, title, salesman_id FROM opportunities WHERE id = ?`).get(prior.opportunity_id);
  if (!opp) return res.status(404).json({ error: 'Opportunity not found.' });

  const isOwner = opp.salesman_id === req.user.id;
  const isManager = ['admin', 'sales_manager'].includes(req.user.role);
  if (!isOwner && !isManager) return res.status(403).json({ error: 'You can only request modifications on opportunities you own.' });

  const { project_type, urgency, site_plans, salesman_notes, form_data, modification_reason, modification_cause } = req.body;
  // Phase 3: modification_reason is required for tracking + reports.
  const ALLOWED_REASONS = ['Price', 'Technical change', 'Scope change', 'Client request', 'Other'];
  if (!modification_reason || !ALLOWED_REASONS.includes(modification_reason)) {
    return res.status(400).json({ error: `modification_reason is required and must be one of: ${ALLOWED_REASONS.join(', ')}` });
  }
  // Rework-analysis cause dimension (who/what drove the rework). Required so the
  // sales scorecard can separate our-fault rework from client/commercial iterations.
  const ALLOWED_CAUSES = [
    'Internal — sizing/selection error',
    'External — client/consultant change',
    'Commercial — price/value engineering',
  ];
  if (!modification_cause || !ALLOWED_CAUSES.includes(modification_cause)) {
    return res.status(400).json({ error: `modification_cause is required and must be one of: ${ALLOWED_CAUSES.join(', ')}` });
  }

  // Modification pre-fills with prior form_data — fall back if frontend omits it.
  const effectiveFormData = form_data || (prior.form_data ? safeJsonParse(prior.form_data, {}) : {});
  const mirrors = deriveMirrors(effectiveFormData);

  // Block submitting a modification while one is already in flight (i.e. the
  // most recent request hasn't reached a terminal state yet).
  const inFlight = db.prepare(`
    SELECT id, design_stage FROM design_requests
    WHERE opportunity_id = ? AND design_stage NOT IN ('Released','Returned','Cancelled')
    ORDER BY id DESC LIMIT 1
  `).get(prior.opportunity_id);
  if (inFlight && inFlight.id !== prior.id) {
    return res.status(409).json({ error: `A design request is already in flight (stage: ${inFlight.design_stage}). Wait for it to be released before requesting a modification.` });
  }
  if (inFlight && inFlight.id === prior.id) {
    return res.status(409).json({ error: `This request is still in progress (stage: ${prior.design_stage}). Modifications can only be requested after release.` });
  }

  const info = db.prepare(`
    INSERT INTO design_requests (
      opportunity_id, request_type, requested_by, project_type, urgency,
      site_plans, salesman_notes, form_type, form_data, system_type, has_pool, has_solar,
      design_stage, version, modification_reason, modification_cause, parent_request_id
    ) VALUES (?, 'Modification', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Incoming', ?, ?, ?, ?)
  `).run(
    prior.opportunity_id, req.user.id,
    project_type || 'Modification', urgency || 'Standard',
    JSON.stringify(site_plans || []), salesman_notes || null,
    mirrors.form_type, JSON.stringify(effectiveFormData),
    mirrors.system_type, mirrors.has_pool, mirrors.has_solar,
    (prior.version || 1) + 1,
    modification_reason,
    modification_cause,
    prior.id
  );
  const newId = info.lastInsertRowid;
  logStageChange(newId, null, 'Incoming', req.user.id, `Modification of request #${id} (${modification_reason})`);

  // Phase 1: a modification request also moves the deal back to Design/Redesign.
  moveOppToLead(prior.opportunity_id, req.user.id, 'Modification requested');

  notify(req.io, [...usersWithRole('design_manager'), ...usersWithRole('sales_manager')],
    'design_modification_requested',
    `${req.user.name} requested a modification on "${opp.title}" (V${(prior.version || 1) + 1})`, newId);

  res.status(201).json(redactRequestForUser(getRequest(newId), req.user));
});

// ---------------------------------------------------------------------------
// POST /api/quotation-versions
//   Body: { request_id, total_value, files, designer_notes }
//   Permission: assigned designer (or design_manager / admin)
// ---------------------------------------------------------------------------
router.post('/quotation-versions', (req, res) => {
  const {
    request_id, files, designer_notes, line_items,
    header, discount_pct_global, target_release_stage,
  } = req.body;
  if (!request_id) return res.status(400).json({ error: 'request_id required.' });
  if (target_release_stage && !['Tender', 'Analysis'].includes(target_release_stage)) {
    return res.status(400).json({ error: 'target_release_stage must be Tender or Analysis.' });
  }

  const r = db.prepare(`SELECT * FROM design_requests WHERE id = ?`).get(request_id);
  if (!r) return res.status(404).json({ error: 'Request not found.' });

  const isAssigned = r.assigned_designer_id === req.user.id;
  const isManager  = ['design_manager', 'admin'].includes(req.user.role);
  if (!isAssigned && !isManager) return res.status(403).json({ error: 'Only the assigned designer can submit a quotation.' });

  // ── Discount limit (Phase 8). At or below the configurable limit applies
  //   immediately; above it needs an APPROVED discount override on the deal
  //   (raised via /approvals). Covers the global discount and any per-line one.
  const globalDiscount = Number(discount_pct_global) || 0;
  const _itemsForCap = Array.isArray(line_items) ? line_items : [];
  const maxDiscount = _itemsForCap.reduce(
    (m, it) => Math.max(m, it.discount_pct != null ? Number(it.discount_pct) : globalDiscount),
    globalDiscount);
  if (globalDiscount < 0 || maxDiscount < 0) {
    return res.status(400).json({ error: 'Discount cannot be negative.' });
  }
  const _limit = discountLimitFraction();
  if (maxDiscount > _limit + 1e-9 && !hasApprovedDiscount(r.opportunity_id, maxDiscount)) {
    return res.status(400).json({
      error: `Discount ${(maxDiscount * 100).toFixed(1)}% exceeds the ${(_limit * 100).toFixed(0)}% limit and needs Sales Manager approval.`,
      needs_approval: true,
      requested_pct: +(maxDiscount * 100).toFixed(2),
      opp_id: r.opportunity_id,
      quotation_id: null,
    });
  }

  // ── Build line items. SKU-linked items snapshot list_price + cost.
  const items = Array.isArray(line_items) ? line_items : [];
  let total = 0;
  const normalized = items.map((it, idx) => {
    let sku = null;
    if (it.sku_id) sku = db.prepare(`SELECT * FROM product_skus WHERE id = ?`).get(+it.sku_id) || null;
    const list_price = it.list_price != null ? Number(it.list_price) : (sku ? sku.list_price : null);
    const discount_pct = it.discount_pct != null ? Number(it.discount_pct) : globalDiscount;
    // Designer can override unit_price; if blank, compute from list × (1-discount).
    let unit_price = it.unit_price != null && it.unit_price !== '' ? Number(it.unit_price) : null;
    if (unit_price == null && list_price != null) unit_price = +(list_price * (1 - discount_pct)).toFixed(2);
    if (unit_price == null) unit_price = 0;
    const is_override = sku && list_price && Math.abs(unit_price - list_price * (1 - discount_pct)) > 0.5 ? 1 : 0;
    const qty = Number(it.qty) || 0;
    const subtotal = +(qty * unit_price).toFixed(2);
    total += subtotal;
    return {
      line_num: idx + 1,
      sku_id: sku ? sku.id : null,
      category: it.category || (sku ? sku.category : null),
      model: it.model || (sku ? sku.model : null),
      description: it.description != null ? it.description : (sku ? sku.description : null),
      qty,
      unit: it.unit || (sku ? sku.unit : null) || 'pc',
      list_price,
      discount_pct,
      unit_price,
      subtotal,
      is_override,
      cost_snapshot: sku ? sku.cost_jod : null,
    };
  });
  const totalValue = items.length ? +total.toFixed(2) : (Number(req.body.total_value) || 0);

  const latest = db.prepare(`SELECT version_number FROM quotation_versions WHERE request_id = ? ORDER BY version_number DESC LIMIT 1`).get(request_id);
  const nextVer = (latest?.version_number || 0) + 1;

  // ── Header defaults (designer's editable customer-facing fields).
  const opp = db.prepare(`SELECT o.title, o.district, o.segment, u.name AS salesman_name FROM opportunities o LEFT JOIN users u ON u.id=o.salesman_id WHERE o.id = ?`).get(r.opportunity_id) || {};
  const h = header || {};
  const reference        = h.reference        || `IMG_${r.opportunity_id}_V${nextVer}`;
  const quote_date       = h.quote_date       || new Date().toISOString().slice(0, 10);
  const project_name     = h.project_name     || opp.title || null;
  const city             = h.city             || opp.district || null;
  const project_type     = h.project_type     || opp.segment || null;
  const pricing_mode     = h.pricing_mode     || (r.form_data ? (safeJsonParse(r.form_data, {}).project_nature || null) : null);
  const sales_engineer   = h.sales_engineer_name  || opp.salesman_name || null;
  const design_engineer  = h.design_engineer_name || req.user.name;
  const brand            = h.brand || 'Gree';
  const intro_text       = h.intro_text       || null;
  const maintenance_text = h.maintenance_text || null;
  const tnc_text         = h.tnc_text         || null;

  const info = db.prepare(`
    INSERT INTO quotation_versions (
      request_id, version_number, total_value, files, designer_notes,
      created_by, review_status,
      reference, quote_date, project_name, city, project_type, pricing_mode,
      sales_engineer_name, design_engineer_name, brand,
      intro_text, maintenance_text, tnc_text, discount_pct_global, target_release_stage
    ) VALUES (?, ?, ?, ?, ?, ?, 'Submitted',
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    request_id, nextVer, totalValue, JSON.stringify(files || []), designer_notes || null, req.user.id,
    reference, quote_date, project_name, city, project_type, pricing_mode,
    sales_engineer, design_engineer, brand,
    intro_text, maintenance_text, tnc_text, globalDiscount, target_release_stage || null
  );
  const quotationId = info.lastInsertRowid;

  if (normalized.length) {
    const insertItem = db.prepare(`
      INSERT INTO quotation_line_items
        (quotation_version_id, line_num, sku_id, category, model, description, qty, unit,
         list_price, discount_pct, unit_price, subtotal, is_override, cost_snapshot)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.exec('BEGIN');
    try {
      for (const it of normalized) {
        insertItem.run(quotationId, it.line_num, it.sku_id, it.category, it.model, it.description,
          it.qty, it.unit, it.list_price, it.discount_pct, it.unit_price, it.subtotal, it.is_override, it.cost_snapshot);
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  notify(req.io, usersWithRole('design_manager'), 'quotation_submitted',
    `V${nextVer} submitted for review (JOD ${totalValue.toLocaleString()})`, request_id);

  res.status(201).json({
    id: quotationId, request_id, version_number: nextVer,
    total_value: totalValue, files: files || [], designer_notes,
    line_items: normalized, review_status: 'Submitted',
    reference, project_name, city, project_type, pricing_mode,
    brand, discount_pct_global: globalDiscount,
  });
});

// ---------------------------------------------------------------------------
// PUT /api/quotation-versions/:id/review
//   Body: { review_status: 'Approved' | 'Revision Requested', review_notes }
//   Permission: design_manager (Sally) or admin
// ---------------------------------------------------------------------------
router.put('/quotation-versions/:id/review',
  (req, res) => {
    const qid = +req.params.id;
    const q = db.prepare(`SELECT * FROM quotation_versions WHERE id = ?`).get(qid);
    if (!q) return res.status(404).json({ error: 'Quotation not found.' });
    // Permission: design_manager / admin OR the assigned reviewer on the parent request.
    const parent = db.prepare(`SELECT assigned_reviewer_id FROM design_requests WHERE id = ?`).get(q.request_id);
    const isManager = ['design_manager', 'admin'].includes(req.user.role);
    const isReviewer = !!parent && parent.assigned_reviewer_id === req.user.id;
    if (!isManager && !isReviewer) {
      return res.status(403).json({ error: 'Only the design manager or the assigned reviewer can review quotations.' });
    }
    const { review_status, review_notes } = req.body;
    if (!['Approved', 'Revision Requested'].includes(review_status)) {
      return res.status(400).json({ error: 'review_status must be Approved or Revision Requested.' });
    }
    db.prepare(`UPDATE quotation_versions SET review_status=?, review_notes=?, reviewed_by=?, reviewed_at=datetime('now') WHERE id=?`)
      .run(review_status, review_notes || null, req.user.id, qid);

    // Mirror onto the request stage. (Same logic as PUT /design-requests/:id/stage but driven by quote review.)
    const r = db.prepare(`SELECT * FROM design_requests WHERE id = ?`).get(q.request_id);
    if (r && r.design_stage === 'Review') {
      const newStage = review_status === 'Approved' ? 'Approved' : 'In Progress';
      db.prepare(`UPDATE design_requests SET design_stage=?, updated_at=datetime('now') WHERE id=?`).run(newStage, r.id);
      logStageChange(r.id, 'Review', newStage, req.user.id, review_notes);
      const opp = db.prepare(`SELECT title FROM opportunities WHERE id = ?`).get(r.opportunity_id);
      if (review_status === 'Approved') {
        notify(req.io, [r.assigned_designer_id], 'design_approved',
          `Your design for "${opp?.title}" was approved`, r.id);
      } else {
        notify(req.io, [r.assigned_designer_id], 'design_revision_requested',
          `Revision requested on "${opp?.title}"${review_notes ? ': ' + review_notes : ''}`, r.id);
      }
    }

    res.json({ ok: true });
  });

// ---------------------------------------------------------------------------
// GET /api/design-board
//   All active (non-Released) design requests grouped by stage + workload.
//   Permission: sales_manager, design_manager, admin.
// ---------------------------------------------------------------------------
router.get('/design-board',
  requireRole('admin', 'sales_manager', 'design_manager', 'product_manager'),
  (req, res) => {
    const rows = db.prepare(`SELECT * FROM design_requests ORDER BY created_at DESC`).all();
    const requests = rows.map(r => redactRequestForUser(enrich(r), req.user));
    const STAGES = ['Incoming', 'Queued', 'In Progress', 'Review', 'Approved', 'Released', 'Returned'];
    const by_stage = Object.fromEntries(STAGES.map(s => [s, []]));
    requests.forEach(r => { if (by_stage[r.design_stage]) by_stage[r.design_stage].push(r); });

    // Designer workload (active = not Released)
    const designers = db.prepare(`
      SELECT u.id, u.name FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE r.name IN ('designer', 'design_manager') AND u.is_active = 1
      ORDER BY u.name
    `).all();
    const capacityRow = db.prepare(`SELECT value FROM settings WHERE key = 'designer_overload'`).get();
    const capacity = capacityRow ? parseInt(capacityRow.value, 10) : 4;

    const workload = designers.map(d => {
      const active = db.prepare(`
        SELECT COUNT(*) AS n FROM design_requests
        WHERE assigned_designer_id = ? AND design_stage != 'Released'
      `).get(d.id).n;
      return { designer_id: d.id, name: d.name, active_tasks: active, capacity };
    });

    res.json({ requests, by_stage, workload });
  });

// ---------------------------------------------------------------------------
// GET /api/my-design-tasks
//   Tasks assigned to the current user. Designers only see their own.
//   NEVER includes design_stage_history.
// ---------------------------------------------------------------------------
router.get('/my-design-tasks', (req, res) => {
  if (!['designer', 'design_manager', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Only designers can access this endpoint.' });
  }
  const rows = db.prepare(`
    SELECT * FROM design_requests
    WHERE assigned_designer_id = ?
    ORDER BY (CASE design_stage
        WHEN 'In Progress' THEN 1
        WHEN 'Queued'      THEN 2
        WHEN 'Review'      THEN 3
        WHEN 'Approved'    THEN 4
        WHEN 'Released'    THEN 5
        ELSE 6 END), priority ASC, due_date ASC
  `).all(req.user.id);

  const tasks = rows.map(r => redactRequestForUser(enrich(r), req.user));
  const grouped = {
    needs_attention: tasks.filter(t => t.design_stage === 'In Progress' && t.latest_quotation?.review_status === 'Revision Requested'),
    in_progress:     tasks.filter(t => t.design_stage === 'In Progress' && t.latest_quotation?.review_status !== 'Revision Requested'),
    queued:          tasks.filter(t => t.design_stage === 'Queued'),
    pending_review:  tasks.filter(t => t.design_stage === 'Review'),
    completed:       tasks.filter(t => t.design_stage === 'Released' || t.design_stage === 'Approved'),
  };
  res.json({ tasks, grouped });
});

// ---------------------------------------------------------------------------
// Quotation scenarios — PM "what-if" workspace (Phase 8.2).
//   Detached from the canonical quotation_versions; never touches deal value.
// ---------------------------------------------------------------------------
function requireCostView(req, res) {
  if (req.user.can_view_costs === 1 || ['admin', 'product_manager'].includes(req.user.role)) return true;
  res.status(403).json({ error: 'Requires product_manager or admin.' });
  return false;
}

router.get('/quotation-versions/:id/scenarios', (req, res) => {
  if (!requireCostView(req, res)) return;
  const rows = db.prepare(`
    SELECT s.*, u.name AS created_by_name
    FROM quotation_scenarios s
    LEFT JOIN users u ON u.id = s.created_by
    WHERE s.quotation_version_id = ?
    ORDER BY s.id DESC
  `).all(+req.params.id).map(r => ({ ...r, payload: r.payload ? JSON.parse(r.payload) : null }));
  res.json(rows);
});

router.post('/quotation-versions/:id/scenarios', (req, res) => {
  if (!requireCostView(req, res)) return;
  const { name, payload } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required.' });
  const items = db.prepare(`
    SELECT id, qty, unit_price, list_price, discount_pct, cost_snapshot
    FROM quotation_line_items WHERE quotation_version_id = ?
  `).all(+req.params.id);
  const overrides = (payload && payload.line_overrides) || {};
  let totalCost = 0, totalRevenue = 0;
  for (const li of items) {
    const o = overrides[li.id] || {};
    const qty        = o.qty != null ? +o.qty : li.qty;
    const unit_price = o.unit_price != null ? +o.unit_price
                     : (o.discount_pct != null && li.list_price ? +(li.list_price * (1 - o.discount_pct)).toFixed(2) : li.unit_price);
    const cost_unit  = li.cost_snapshot != null ? +li.cost_snapshot : 0;
    totalCost    += (qty || 0) * cost_unit;
    totalRevenue += (qty || 0) * (unit_price || 0);
  }
  const grossProfit = +(totalRevenue - totalCost).toFixed(2);
  const grossPct    = totalRevenue > 0 ? +(grossProfit / totalRevenue).toFixed(4) : null;
  const info = db.prepare(`
    INSERT INTO quotation_scenarios (quotation_version_id, name, payload, total_cost, total_revenue, gross_profit, gross_pct, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(+req.params.id, name.trim(), JSON.stringify(payload || {}),
         +totalCost.toFixed(2), +totalRevenue.toFixed(2), grossProfit, grossPct, req.user.id);
  res.status(201).json({
    id: info.lastInsertRowid, name: name.trim(),
    total_cost: +totalCost.toFixed(2), total_revenue: +totalRevenue.toFixed(2),
    gross_profit: grossProfit, gross_pct: grossPct, created_by_name: req.user.name,
  });
});

router.delete('/quotation-scenarios/:id', (req, res) => {
  if (!requireCostView(req, res)) return;
  db.prepare(`DELETE FROM quotation_scenarios WHERE id = ?`).run(+req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /api/quotation-versions/:id/sales-revision
//   Salesman edits discount on a released quotation. Creates a NEW
//   quotation_versions row with revision_type='sales' linked to the parent.
//   Designer's V1 stays untouched.
// ---------------------------------------------------------------------------
router.post('/quotation-versions/:id/sales-revision', (req, res) => {
  const parentId = +req.params.id;
  const parent = db.prepare(`SELECT * FROM quotation_versions WHERE id = ?`).get(parentId);
  if (!parent) return res.status(404).json({ error: 'Parent quotation not found.' });
  const parentReq = db.prepare(`SELECT * FROM design_requests WHERE id = ?`).get(parent.request_id);
  if (!parentReq) return res.status(404).json({ error: 'Parent request not found.' });
  const opp = db.prepare(`SELECT id, title, salesman_id FROM opportunities WHERE id = ?`).get(parentReq.opportunity_id);
  if (!opp) return res.status(404).json({ error: 'Opportunity not found.' });

  const isOwner = opp.salesman_id === req.user.id;
  const isMgr   = ['admin', 'sales_manager'].includes(req.user.role);
  if (!isOwner && !isMgr) return res.status(403).json({ error: 'Only the deal owner or sales manager can revise.' });

  const lineDiscounts     = (req.body && req.body.line_discounts) || {};
  const categoryDiscounts = (req.body && req.body.category_discounts) || {};
  const notes             = (req.body && req.body.notes) || null;

  const items = db.prepare(`
    SELECT * FROM quotation_line_items WHERE quotation_version_id = ? ORDER BY line_num
  `).all(parentId);
  if (items.length === 0) return res.status(400).json({ error: 'Parent has no line items.' });

  // Resolve effective discount per line. Per-line override > category > parent line.
  const _limit = discountLimitFraction();
  const overCap = [];
  const resolved = items.map(li => {
    let d = li.discount_pct;
    if (li.category && categoryDiscounts[li.category] != null) d = +categoryDiscounts[li.category];
    if (lineDiscounts[li.id] != null) d = +lineDiscounts[li.id];
    if (d > _limit + 1e-9) overCap.push({ line_item_id: li.id, model: li.model, requested_pct: d });
    return { src: li, discount_pct: d };
  });
  if (overCap.length) {
    const maxOver = overCap.reduce((m, o) => Math.max(m, o.requested_pct), 0);
    if (!hasApprovedDiscount(opp.id, maxOver)) {
      return res.status(400).json({
        error: `Discount ${(maxOver * 100).toFixed(1)}% exceeds the ${(_limit * 100).toFixed(0)}% limit and needs Sales Manager approval.`,
        needs_approval: true,
        over_cap: overCap,
        requested_pct: +(maxOver * 100).toFixed(2),
        opp_id: opp.id,
        quotation_id: null,   // discount_approvals.quotation_id FKs the legacy quotations table; the gate keys on opp_id
      });
    }
  }

  // Find the next version label. Pattern: design V1 → sales V1.1, V1.2, etc.
  const parentVer = parent.version_number;
  const siblings = db.prepare(`SELECT version_number FROM quotation_versions WHERE request_id = ? AND parent_version_id = ?`).all(parent.request_id, parentId).length;
  const newVerNumber = parentVer; // visual version is same; we use suffix in reference
  const refSuffix = `.${siblings + 1}`;

  const newRef = (parent.reference || `IMG_${opp.id}_V${parentVer}`) + refSuffix;
  let total = 0;
  const normalized = resolved.map((entry, idx) => {
    const li = entry.src;
    const d  = entry.discount_pct;
    const unit_price = li.list_price ? +(li.list_price * (1 - d)).toFixed(2) : li.unit_price;
    const qty = li.qty || 0;
    const subtotal = +(qty * unit_price).toFixed(2);
    total += subtotal;
    return { ...li, discount_pct: d, unit_price, subtotal };
  });
  const totalValue = +total.toFixed(2);

  db.exec('BEGIN');
  try {
    const info = db.prepare(`
      INSERT INTO quotation_versions (
        request_id, version_number, total_value, files, designer_notes,
        created_by, review_status,
        reference, quote_date, project_name, city, project_type, pricing_mode,
        sales_engineer_name, design_engineer_name, brand,
        intro_text, maintenance_text, tnc_text, discount_pct_global, target_release_stage,
        revision_type, parent_version_id,
        review_notes, reviewed_by, reviewed_at, released_at, released_by, approved_by
      ) VALUES (?, ?, ?, ?, ?, ?, 'Approved',
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                'sales', ?,
                ?, ?, datetime('now'), datetime('now'), ?, ?)
    `).run(
      parent.request_id, newVerNumber, totalValue, parent.files, notes,
      req.user.id,
      newRef, new Date().toISOString().slice(0,10),
      parent.project_name, parent.city, parent.project_type, parent.pricing_mode,
      parent.sales_engineer_name, parent.design_engineer_name, parent.brand,
      parent.intro_text, parent.maintenance_text, parent.tnc_text,
      null,                            // discount_pct_global N/A on sales rev (per-line)
      parent.target_release_stage,
      parentId,
      notes, req.user.id, req.user.id, req.user.id
    );
    const newId = info.lastInsertRowid;

    const insertLi = db.prepare(`
      INSERT INTO quotation_line_items
        (quotation_version_id, line_num, sku_id, category, model, description, qty, unit,
         list_price, discount_pct, unit_price, subtotal, is_override, cost_snapshot)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    normalized.forEach((it, idx) => insertLi.run(
      newId, idx + 1, it.sku_id, it.category, it.model, it.description,
      it.qty, it.unit, it.list_price, it.discount_pct, it.unit_price, it.subtotal,
      it.is_override || 0, it.cost_snapshot
    ));

    // Snap opp value to the new revision.
    db.prepare(`
      UPDATE opportunities SET expected_value = ?, value_source = ?, value_source_quote_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(totalValue, `quotation:V${parentVer}${refSuffix} (sales)`, newId, opp.id);

    db.exec('COMMIT');

    notify(req.io, [parentReq.assigned_designer_id, parentReq.assigned_reviewer_id, ...usersWithRole('design_manager'), ...usersWithRole('product_manager')]
      .filter(uid => uid && uid !== req.user.id),
      'sales_revision',
      `${req.user.name} revised the discount on "${opp.title}" (now ${newRef})`, parent.request_id);

    res.status(201).json({ id: newId, reference: newRef, total_value: totalValue,
      revision_type: 'sales', parent_version_id: parentId, version_number: newVerNumber });
  } catch (e) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/quotation-versions/:id/discount
//   In-place discount edit from the deal drawer. Updates discount_pct,
//   unit_price, subtotal on existing line items, and recomputes the quotation
//   total_value + the opportunity's expected_value. No new version row.
//
//   Body: {
//     global_pct?: number,                    // 0..0.30 fraction
//     mode?: 'overwrite_all' | 'overwrite_unmarked',  // when global_pct set
//     line_discounts?: { [line_item_id]: number },     // 0..0.30 fraction
//   }
//   Permission: deal owner OR admin/sales_manager.
// ---------------------------------------------------------------------------
router.patch('/quotation-versions/:id/discount', (req, res) => {
  const qid = +req.params.id;
  const q = db.prepare(`SELECT * FROM quotation_versions WHERE id = ?`).get(qid);
  if (!q) return res.status(404).json({ error: 'Quotation not found.' });
  const parentReq = db.prepare(`SELECT * FROM design_requests WHERE id = ?`).get(q.request_id);
  if (!parentReq) return res.status(404).json({ error: 'Parent request not found.' });
  const opp = db.prepare(`SELECT id, salesman_id, title FROM opportunities WHERE id = ?`).get(parentReq.opportunity_id);
  if (!opp) return res.status(404).json({ error: 'Opportunity not found.' });

  const isOwner = opp.salesman_id === req.user.id;
  const isMgr   = ['admin', 'sales_manager'].includes(req.user.role);
  if (!isOwner && !isMgr) return res.status(403).json({ error: 'Only the deal owner or sales manager can edit discounts.' });

  const body            = req.body || {};
  const hasGlobal       = body.global_pct != null;
  const newGlobal       = hasGlobal ? Number(body.global_pct) : null;
  const mode            = body.mode === 'overwrite_all' ? 'overwrite_all' : 'overwrite_unmarked';
  const lineDiscounts   = body.line_discounts || {};

  if (hasGlobal && (!Number.isFinite(newGlobal) || newGlobal < 0)) {
    return res.status(400).json({ error: 'Global discount must be a non-negative number.' });
  }
  const _limit = discountLimitFraction();

  const items = db.prepare(`
    SELECT * FROM quotation_line_items WHERE quotation_version_id = ? ORDER BY line_num
  `).all(qid);
  if (items.length === 0) return res.status(400).json({ error: 'Quotation has no line items.' });

  const priorGlobal = Number(q.discount_pct_global) || 0;
  const EPS = 0.0005;

  const overCap = [];
  const resolved = items.map(li => {
    let d = li.discount_pct;
    if (hasGlobal) {
      if (mode === 'overwrite_all') d = newGlobal;
      else if (Math.abs((li.discount_pct || 0) - priorGlobal) < EPS) d = newGlobal; // not custom
    }
    if (lineDiscounts[li.id] != null) d = Number(lineDiscounts[li.id]);
    if (!Number.isFinite(d) || d < 0) d = 0;
    if (d > _limit + EPS) overCap.push({ line_item_id: li.id, model: li.model, requested_pct: d });
    return { src: li, d };
  });
  if (overCap.length) {
    const maxOver = overCap.reduce((m, o) => Math.max(m, o.requested_pct), 0);
    if (!hasApprovedDiscount(opp.id, maxOver)) {
      return res.status(400).json({
        error: `Discount ${(maxOver * 100).toFixed(1)}% exceeds the ${(_limit * 100).toFixed(0)}% limit and needs Sales Manager approval.`,
        needs_approval: true,
        over_cap: overCap,
        requested_pct: +(maxOver * 100).toFixed(2),
        opp_id: opp.id,
        quotation_id: null,   // discount_approvals.quotation_id FKs the legacy quotations table; the gate keys on opp_id
      });
    }
  }

  let total = 0;
  const computed = resolved.map(entry => {
    const li = entry.src;
    const d  = entry.d;
    const unit_price = li.list_price ? +(li.list_price * (1 - d)).toFixed(2) : li.unit_price;
    const qty = li.qty || 0;
    const subtotal = +(qty * unit_price).toFixed(2);
    total += subtotal;
    return { id: li.id, discount_pct: d, unit_price, subtotal };
  });
  const totalValue = +total.toFixed(2);

  // New global to record on the quotation header. If the user explicitly set
  // global_pct we use it; otherwise leave as-is. (Per-line edits don't change
  // the header value — the deal page also shows an "effective %" derived from
  // the line totals so the header value isn't the only signal.)
  const headerGlobal = hasGlobal ? newGlobal : priorGlobal;

  db.exec('BEGIN');
  try {
    const upd = db.prepare(`UPDATE quotation_line_items SET discount_pct = ?, unit_price = ?, subtotal = ? WHERE id = ?`);
    for (const c of computed) upd.run(c.discount_pct, c.unit_price, c.subtotal, c.id);

    db.prepare(`UPDATE quotation_versions SET total_value = ?, discount_pct_global = ? WHERE id = ?`)
      .run(totalValue, headerGlobal, qid);

    // Keep opp expected_value in sync (mirrors the sales-revision behavior at design.js:962).
    db.prepare(`
      UPDATE opportunities SET expected_value = ?, value_source = ?, value_source_quote_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(totalValue, `quotation:V${q.version_number} (discount edit)`, qid, opp.id);

    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: e.message });
  }

  notify(req.io, [parentReq.assigned_designer_id, parentReq.assigned_reviewer_id, ...usersWithRole('design_manager')]
    .filter(uid => uid && uid !== req.user.id),
    'discount_edited',
    `${req.user.name} updated the discount on "${opp.title}" (now JOD ${totalValue.toLocaleString()})`,
    parentReq.id);

  res.json({
    id: qid,
    total_value: totalValue,
    discount_pct_global: headerGlobal,
    line_items: computed,
  });
});

// ---------------------------------------------------------------------------
// GET /api/quotation-versions/:id/costing
//   PM + admin + can_view_costs only. Returns line items WITH cost columns
//   + per-quotation rollup. Drives the Costing page.
// ---------------------------------------------------------------------------
router.get('/quotation-versions/:id/costing', (req, res) => {
  if (!(req.user.can_view_costs === 1 || ['admin', 'product_manager'].includes(req.user.role))) {
    return res.status(403).json({ error: 'Cost view requires product_manager or admin.' });
  }
  const q = db.prepare(`SELECT * FROM quotation_versions WHERE id = ?`).get(+req.params.id);
  if (!q) return res.status(404).json({ error: 'Quotation not found.' });
  const items = db.prepare(`
    SELECT id, line_num, sku_id, category, model, description, qty, unit,
           list_price, discount_pct, unit_price, subtotal, is_override, cost_snapshot
    FROM quotation_line_items WHERE quotation_version_id = ? ORDER BY line_num
  `).all(q.id);
  const enriched = items.map(li => {
    const qty = +li.qty || 0;
    const cost_unit = li.cost_snapshot != null ? +li.cost_snapshot : null;
    const cost_total = cost_unit != null ? +(qty * cost_unit).toFixed(2) : null;
    const revenue = +li.subtotal || 0;
    const margin = cost_total != null ? +(revenue - cost_total).toFixed(2) : null;
    const margin_pct = margin != null && revenue > 0 ? +(margin / revenue).toFixed(4) : null;
    return { ...li, cost_unit, cost_total, revenue, margin, margin_pct };
  });
  const totalCost    = enriched.reduce((s, li) => s + (li.cost_total || 0), 0);
  const totalRevenue = enriched.reduce((s, li) => s + (li.revenue || 0), 0);
  const grossProfit  = +(totalRevenue - totalCost).toFixed(2);
  const grossPct     = totalRevenue > 0 ? +(grossProfit / totalRevenue).toFixed(4) : null;

  const parentReq = db.prepare(`SELECT id, opportunity_id, assigned_designer_id FROM design_requests WHERE id = ?`).get(q.request_id);
  const opp = parentReq ? db.prepare(`SELECT id, title FROM opportunities WHERE id = ?`).get(parentReq.opportunity_id) : null;
  const designer = parentReq?.assigned_designer_id ? db.prepare(`SELECT id, name FROM users WHERE id = ?`).get(parentReq.assigned_designer_id) : null;

  res.json({
    quotation: {
      id: q.id, version: q.version_number, reference: q.reference,
      review_status: q.review_status, target_release_stage: q.target_release_stage,
      discount_pct_global: q.discount_pct_global,
      project_name: q.project_name, city: q.city, brand: q.brand,
      total_value: q.total_value,
    },
    opp, designer,
    line_items: enriched,
    totals: { totalCost, totalRevenue, grossProfit, grossPct },
  });
});

// ---------------------------------------------------------------------------
// GET /api/quotation-versions — index for the PM Costing list.
// ---------------------------------------------------------------------------
router.get('/quotation-versions', (req, res) => {
  if (!(req.user.can_view_costs === 1 || ['admin', 'product_manager'].includes(req.user.role))) {
    return res.status(403).json({ error: 'Requires product_manager or admin.' });
  }
  const rows = db.prepare(`
    SELECT qv.id, qv.version_number, qv.reference, qv.review_status, qv.total_value,
           qv.target_release_stage, qv.brand, qv.project_name, qv.submitted_at,
           dr.id AS request_id, dr.opportunity_id, dr.design_stage,
           o.title AS opp_title,
           du.name AS designer_name
    FROM quotation_versions qv
    JOIN design_requests dr ON dr.id = qv.request_id
    LEFT JOIN opportunities o ON o.id = dr.opportunity_id
    LEFT JOIN users du ON du.id = dr.assigned_designer_id
    ORDER BY qv.id DESC LIMIT 200
  `).all();
  res.json(rows);
});

// ---------------------------------------------------------------------------
// GET /api/design-board/by-opportunity/:oppId
//   Design requests linked to a specific opportunity (so the Pipeline UI
//   can show "Design Requested" / "Quotation Ready" badges on each deal).
//   Permission: anyone who can view that opportunity.
// ---------------------------------------------------------------------------
router.get('/design-board/by-opportunity/:oppId', (req, res) => {
  const rows = db.prepare(`SELECT * FROM design_requests WHERE opportunity_id = ? ORDER BY version DESC, id DESC`)
    .all(+req.params.oppId);
  res.json(rows.map(r => redactRequestForUser(enrich(r), req.user)));
});

// ---------------------------------------------------------------------------
// GET /api/design-board/by-opportunity
//   Bulk variant — returns { [oppId]: [requestRows...] } across every opp.
//   Lets the Pipeline app preload design context without N round-trips so the
//   "Request modification" button never has a load-race delay.
// ---------------------------------------------------------------------------
router.get('/design-board/by-opportunity', (req, res) => {
  const rows = db.prepare(`SELECT * FROM design_requests ORDER BY opportunity_id, version DESC, id DESC`).all();
  const map = {};
  for (const r of rows) {
    if (!map[r.opportunity_id]) map[r.opportunity_id] = [];
    map[r.opportunity_id].push(redactRequestForUser(enrich(r), req.user));
  }
  res.json(map);
});

// ---------------------------------------------------------------------------
// GET /api/design-status-map
//   Lightweight summary used by the Pipeline kanban to put an "In Design" /
//   "Quotation Ready" badge on every deal card without N round-trips.
//   Returns: { [opportunity_id]: { design_stage, version, latest_status,
//                                  designer_name, has_released } }
//   Permission: any authenticated user (badges are visible to everyone).
// ---------------------------------------------------------------------------
router.get('/design-status-map', (req, res) => {
  // For each opportunity, take the row with the highest version (most recent
  // request). If multiple, fall back to the highest id. Released status wins
  // overall — if any quotation has been released, surface that.
  const rows = db.prepare(`
    SELECT r.opportunity_id, r.design_stage, r.version, r.assigned_designer_id,
           r.released_to_stage,
           u.name AS designer_name,
           (SELECT review_status FROM quotation_versions
              WHERE request_id = r.id ORDER BY version_number DESC LIMIT 1) AS latest_quote_status,
           EXISTS (SELECT 1 FROM design_requests r2
                   WHERE r2.opportunity_id = r.opportunity_id
                   AND r2.design_stage = 'Released') AS has_released,
           (SELECT released_to_stage FROM design_requests r2
              WHERE r2.opportunity_id = r.opportunity_id
              AND r2.design_stage = 'Released'
              ORDER BY r2.version DESC LIMIT 1) AS released_destination
    FROM design_requests r
    LEFT JOIN users u ON u.id = r.assigned_designer_id
    ORDER BY r.opportunity_id, r.version DESC, r.id DESC
  `).all();

  // Collapse to one row per opportunity_id (the first row wins thanks to ORDER BY).
  const map = {};
  for (const r of rows) {
    if (map[r.opportunity_id]) continue;
    map[r.opportunity_id] = {
      design_stage:  r.design_stage,
      version:       r.version,
      designer_name: r.designer_name || null,
      latest_quote_status: r.latest_quote_status || null,
      has_released:  !!r.has_released,
      released_to_stage: r.released_destination || null,
    };
  }
  res.json(map);
});

// ---------------------------------------------------------------------------
// GET /api/design-performance  (SECRET — never exposed to designers)
//   Pulls from design_stage_history to compute:
//     - per designer: avg_design_time (minutes in In-Progress + Review),
//       avg_total_turnaround (Incoming → Released), revision_rate,
//       first_time_approval_rate, completed_count, active_count.
//   Permission: admin, sales_manager. Design managers see AGGREGATE only.
// ---------------------------------------------------------------------------
router.get('/design-performance', (req, res) => {
  // Access (2026-06-02): managers/PM/admin see all designers; a designer sees
  // ONLY their own; salesman has no access. (Sally now sees per-designer — was
  // aggregate-only; adjustable after management feedback.)
  const role = req.user.role;
  const FULL = ['admin', 'sales_manager', 'design_manager', 'product_manager'];
  const isDesigner = role === 'designer';
  if (!FULL.includes(role) && !isDesigner) {
    return res.status(403).json({ error: 'Performance data is restricted.' });
  }

  // One flat row per assigned design request, with per-request derived metrics
  // pre-computed server-side. The Reports client aggregates + filters over this
  // (mirrors the Overview deals pattern), so the Design tab can slice by
  // designer / system / urgency / status with no extra backend work.
  const COMPLETED_STAGES = ['Released', 'Approved'];
  const reqRows = db.prepare(`
    SELECT dr.id, dr.assigned_designer_id AS designer_id, u.name AS designer_name,
           dr.design_stage, dr.urgency, dr.system_type, dr.form_type, dr.request_type,
           dr.modification_cause, dr.created_at, dr.due_date, dr.estimated_hours,
           o.expected_value AS deal_value
    FROM design_requests dr
    LEFT JOIN users u ON u.id = dr.assigned_designer_id
    LEFT JOIN opportunities o ON o.id = dr.opportunity_id
    WHERE dr.assigned_designer_id IS NOT NULL
    ${isDesigner ? 'AND dr.assigned_designer_id = ?' : ''}
  `).all(...(isDesigner ? [req.user.id] : []));

  // Pull all stage history for these requests in one query, group in JS.
  const ids = reqRows.map(r => r.id);
  const histRows = ids.length
    ? db.prepare(`SELECT request_id, from_stage, to_stage, time_in_previous_stage, changed_at
                  FROM design_stage_history
                  WHERE request_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`).all(...ids)
    : [];
  const histByReq = {};
  for (const h of histRows) (histByReq[h.request_id] || (histByReq[h.request_id] = [])).push(h);

  const nowMs = Date.now();
  const sumWhere = (hist, pred) => hist.filter(pred).reduce((s, h) => s + (h.time_in_previous_stage || 0), 0);

  const requests = reqRows.map(r => {
    const hist = histByReq[r.id] || [];
    const completed = COMPLETED_STAGES.includes(r.design_stage);
    // Time buckets (minutes) — measured on the transition OUT of each stage.
    const queue_min  = sumWhere(hist, h => h.from_stage === 'Incoming' || h.from_stage === 'Queued');
    const design_min = sumWhere(hist, h => h.from_stage === 'In Progress');
    const review_min = sumWhere(hist, h => h.from_stage === 'Review');
    const hold_min   = sumWhere(hist, h => h.from_stage === 'On Hold');
    const turnaround_min = hist.reduce((s, h) => s + (h.time_in_previous_stage || 0), 0);
    const was_revised = hist.some(h => h.from_stage === 'Review' && h.to_stage === 'In Progress');
    const relRow = [...hist].reverse().find(h => COMPLETED_STAGES.includes(h.to_stage));
    const released_at = relRow ? relRow.changed_at : null;
    // SLA vs due date.
    const dueMs = r.due_date ? new Date(r.due_date).getTime() : null;
    const relMs = released_at ? new Date(released_at).getTime() : null;
    const on_time = completed && dueMs != null && relMs != null ? (relMs <= dueMs) : null;
    const overdue = !completed && dueMs != null ? (nowMs > dueMs) : false;
    const days_open = Math.max(0, Math.floor((nowMs - new Date(r.created_at).getTime()) / 86400000));

    return {
      id: r.id,
      designer_id: r.designer_id,
      designer_name: r.designer_name || '—',
      design_stage: r.design_stage,
      urgency: r.urgency || 'Standard',
      system: r.system_type || 'Unspecified',
      form_type: r.form_type || null,
      request_type: r.request_type,
      modification_cause: r.modification_cause || null,
      created_at: r.created_at,
      due_date: r.due_date || null,
      released_at,
      estimated_hours: r.estimated_hours || null,
      deal_value: r.deal_value || 0,
      completed,
      active: !completed,
      queue_min, design_min, review_min, hold_min, turnaround_min,
      was_revised,
      first_time_approved: completed && !was_revised,
      on_time, overdue, days_open,
    };
  });

  res.json({ scope: isDesigner ? 'self' : 'per_designer', requests });
});

// ---------------------------------------------------------------------------
// GET /api/design-requests/stats        (Phase 3)
//   Returns modification counts by salesman + reason breakdown.
//   For the Reports page "Design modification requests" panel.
//   IMPORTANT: must be registered BEFORE the /:id route, or Express matches
//   `/stats` as `:id = 'stats'` → 404 "Request not found".
// ---------------------------------------------------------------------------
router.get('/design-requests/stats', (_req, res) => {
  const bySalesman = db.prepare(`
    SELECT u.id AS salesman_id, u.name AS salesman_name, COUNT(*) AS total
    FROM design_requests dr
    LEFT JOIN users u ON u.id = dr.requested_by
    WHERE dr.request_type = 'Modification'
    GROUP BY u.id, u.name
    ORDER BY total DESC
  `).all();
  const byReason = db.prepare(`
    SELECT u.id AS salesman_id, u.name AS salesman_name, dr.modification_reason AS reason, COUNT(*) AS n
    FROM design_requests dr
    LEFT JOIN users u ON u.id = dr.requested_by
    WHERE dr.request_type = 'Modification'
    GROUP BY u.id, u.name, dr.modification_reason
  `).all();
  // Rework cause: separates our-fault (Internal) from client/commercial-driven.
  const byCause = db.prepare(`
    SELECT u.id AS salesman_id, u.name AS salesman_name, dr.modification_cause AS cause, COUNT(*) AS n
    FROM design_requests dr
    LEFT JOIN users u ON u.id = dr.requested_by
    WHERE dr.request_type = 'Modification'
    GROUP BY u.id, u.name, dr.modification_cause
  `).all();
  res.json({ by_salesman: bySalesman, by_reason: byReason, by_cause: byCause });
});

// ---------------------------------------------------------------------------
// GET /api/design-requests/:id  — full request detail (used for drill-in)
// ---------------------------------------------------------------------------
router.get('/design-requests/:id', (req, res) => {
  const r = getRequest(+req.params.id);
  if (!r) return res.status(404).json({ error: 'Request not found.' });
  // Stage history visible to admin + sales_manager + design_manager only.
  if (['admin', 'sales_manager', 'design_manager'].includes(req.user.role)) {
    r.stage_history = db.prepare(`
      SELECT h.*, u.name AS changed_by_name FROM design_stage_history h
      LEFT JOIN users u ON u.id = h.changed_by
      WHERE h.request_id = ? ORDER BY h.id
    `).all(r.id);
  }
  res.json(redactRequestForUser(r, req.user));
});

// ---------------------------------------------------------------------------
// Shared notes thread on a design request.
//   - Before a designer is assigned: salesman ↔ Sally (design_manager).
//   - After a designer is assigned : salesman ↔ assigned designer (Sally still
//     reads/posts). Other designers are blocked.
//
// Visibility is derived from the parent opportunity's salesman_id and the
// request's assigned_designer_id — no explicit visibility column needed.
// ---------------------------------------------------------------------------
function _commentAccess(requestId, user) {
  const r = db.prepare(`
    SELECT dr.id, dr.assigned_designer_id, o.salesman_id, o.title AS opp_title
    FROM design_requests dr
    JOIN opportunities o ON o.id = dr.opportunity_id
    WHERE dr.id = ?
  `).get(requestId);
  if (!r) return { ok: false, status: 404, error: 'Request not found.' };

  const role = user.role;
  if (role === 'admin' || role === 'design_manager') return { ok: true, request: r };
  if (role === 'sales_manager' && user.id === r.salesman_id) return { ok: true, request: r };
  if (role === 'salesman' && user.id === r.salesman_id) return { ok: true, request: r };
  if (role === 'designer' && user.id === r.assigned_designer_id) return { ok: true, request: r };
  return { ok: false, status: 403, error: 'You cannot view this thread.' };
}

// GET /api/design-requests/:id/history
//   Walk parent_request_id backwards to return the full chain of prior
//   requests for this deal (oldest first). Each entry includes the comment
//   thread so the UI can show the full conversation history.
router.get('/design-requests/:id/history', (req, res) => {
  const access = _commentAccess(+req.params.id, req.user);
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const chain = [];
  let cur = db.prepare(`SELECT * FROM design_requests WHERE id = ?`).get(+req.params.id);
  const seen = new Set();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    const comments = db.prepare(`
      SELECT c.id, c.request_id, c.author_id, c.author_role, c.message, c.created_at,
             c.deleted_at, c.deleted_by, c.deleted_by_name,
             u.name AS author_name
      FROM design_request_comments c LEFT JOIN users u ON u.id = c.author_id
      WHERE c.request_id = ? ORDER BY c.id ASC
    `).all(cur.id);
    chain.unshift({
      id: cur.id,
      version: cur.version,
      request_type: cur.request_type,
      design_stage: cur.design_stage,
      modification_reason: cur.modification_reason,
      returned_reason: cur.returned_reason,
      released_to_stage: cur.released_to_stage,
      created_at: cur.created_at,
      parent_request_id: cur.parent_request_id,
      comments,
    });
    if (!cur.parent_request_id) break;
    cur = db.prepare(`SELECT * FROM design_requests WHERE id = ?`).get(cur.parent_request_id);
  }
  res.json(chain);
});

router.get('/design-requests/:id/comments', (req, res) => {
  const access = _commentAccess(+req.params.id, req.user);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  const rows = db.prepare(`
    SELECT c.id, c.request_id, c.author_id, c.author_role, c.message, c.created_at,
           c.deleted_at, c.deleted_by, c.deleted_by_name,
           u.name AS author_name
    FROM design_request_comments c
    LEFT JOIN users u ON u.id = c.author_id
    WHERE c.request_id = ?
    ORDER BY c.id ASC
  `).all(+req.params.id);
  res.json(rows);
});

// DELETE /api/design-request-comments/:commentId — soft delete.
// Permission: the original author, design_manager (Sally), or admin.
router.delete('/design-request-comments/:commentId', (req, res) => {
  const cid = +req.params.commentId;
  const c = db.prepare(`SELECT id, author_id, deleted_at FROM design_request_comments WHERE id = ?`).get(cid);
  if (!c) return res.status(404).json({ error: 'Comment not found.' });
  if (c.deleted_at) return res.json({ ok: true, alreadyDeleted: true });

  const isAuthor  = c.author_id === req.user.id;
  const isManager = ['design_manager', 'admin'].includes(req.user.role);
  if (!isAuthor && !isManager) {
    return res.status(403).json({ error: 'Only the author, Sally, or admin can delete this message.' });
  }

  db.prepare(`
    UPDATE design_request_comments
    SET deleted_at = datetime('now'), deleted_by = ?, deleted_by_name = ?
    WHERE id = ? AND deleted_at IS NULL
  `).run(req.user.id, req.user.name, cid);

  res.json({ ok: true });
});

router.post('/design-requests/:id/comments', (req, res) => {
  const requestId = +req.params.id;
  const access = _commentAccess(requestId, req.user);
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const message = (req.body && req.body.message || '').toString().trim();
  if (!message) return res.status(400).json({ error: 'message is required.' });
  if (message.length > 4000) return res.status(400).json({ error: 'message too long (max 4000 chars).' });

  const info = db.prepare(`
    INSERT INTO design_request_comments (request_id, author_id, author_role, message)
    VALUES (?, ?, ?, ?)
  `).run(requestId, req.user.id, req.user.role, message);

  // Fan out notifications to the other parties on this thread.
  const r = access.request;
  const recipients = new Set();
  if (req.user.id !== r.salesman_id) recipients.add(r.salesman_id);
  if (r.assigned_designer_id && req.user.id !== r.assigned_designer_id) recipients.add(r.assigned_designer_id);
  // Sally (design_manager) is always notified except when she's the author.
  if (req.user.role !== 'design_manager') {
    usersWithRole('design_manager').forEach(uid => recipients.add(uid));
  }
  notify(req.io, [...recipients].filter(Boolean), 'design_comment',
    `${req.user.name} commented on "${r.opp_title}"`, requestId);

  const row = db.prepare(`
    SELECT c.id, c.request_id, c.author_id, c.author_role, c.message, c.created_at,
           c.deleted_at, c.deleted_by, c.deleted_by_name,
           u.name AS author_name
    FROM design_request_comments c LEFT JOIN users u ON u.id = c.author_id
    WHERE c.id = ?
  `).get(info.lastInsertRowid);
  res.status(201).json(row);
});

// ---------------------------------------------------------------------------
// GET /api/design-board/opportunity-map
//   Returns { titleOrId: dbOppId } so the Pipeline prototype can map its
//   static OPP001-style ids to real DB rows for "Request Design".
//   Permission: any authenticated user.
// ---------------------------------------------------------------------------
router.get('/design-board/opportunity-map', (req, res) => {
  const rows = db.prepare(`SELECT id, title FROM opportunities`).all();
  res.json(rows);
});

module.exports = router;
