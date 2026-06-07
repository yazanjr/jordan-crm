// IMG CRM — Design department seed data.
// Frontend prototype: same pattern as 04-deals.jsx (window.DESIGN_REQUESTS).
// Schema is shape-matched to the future /api/design-board response so swap-in is trivial.

// ============================================================
// CONSTANTS
// ============================================================
window.DESIGN_STAGES = ['Incoming', 'Queued', 'In Progress', 'Review', 'Approved', 'Released', 'Returned'];

window.DESIGN_STAGE_META = {
  'Incoming':    { label: 'Incoming',    fg: '#E89211',                bg: 'var(--color-warning-bg)' },
  'Queued':      { label: 'Queued',      fg: 'var(--stage-tender)',    bg: 'var(--stage-tender-bg)' },
  'In Progress': { label: 'In Progress', fg: 'var(--stage-analysis)',  bg: 'var(--stage-analysis-bg)' },
  'Review':      { label: 'Review',      fg: 'var(--img-orange-700)',  bg: 'var(--img-orange-50)' },
  'Approved':    { label: 'Approved',    fg: 'var(--img-green-700)',   bg: 'var(--stage-closing-bg)' },
  'Released':    { label: 'Released',    fg: 'var(--neutral-500)',     bg: 'var(--neutral-100)' },
  'Returned':    { label: 'Returned',    fg: '#B0241D',                bg: '#FDECEC' },
};

// ============================================================
// API ADAPTER — converts /api/design-board responses to the camelCase shape
// that the existing prototype UI components were built against.
// ============================================================
window.adaptDesignRequest = function adaptDesignRequest(r) {
  const latest = r.latest_quotation || (r.quotations || []).slice(-1)[0] || null;
  return {
    id:            r.id,
    oppId:         r.opportunity_id,
    oppTitle:      r.opp_title,
    account:       r.org_name,
    value:         latest?.total_value || 0,
    scope:         r.product_group,
    requestedById: r.requested_by,
    requestedBy:   r.requested_by_name,
    projectType:   r.project_type,
    urgency:       r.urgency,
    sitePlans:     r.site_plans || [],
    notes:         r.salesman_notes || '',
    requestedDate: r.created_at,
    stage:         r.design_stage,
    version:       r.version,
    requestType:   r.request_type,
    oppStage:      r.opp_stage,
    salesmanId:    r.salesman_id,
    salesmanName:  r.salesman_name,
    // Full digitized AC/Heating form payload. Sally/designer drawers
    // unpack it via window.DesignRequestSummary.
    formData:      r.form_data || null,
    // Phase 5 — modification + re-request tracking
    parentRequestId:     r.parent_request_id || null,
    modificationReason:  r.modification_reason || null,
    returnedReason:      r.returned_reason || null,
    designStage:         r.design_stage || null,
    releasedToStage:     r.released_to_stage || null,
    assignment:    r.assigned_designer_id ? {
      designerId:     r.assigned_designer_id,
      designer:       r.designer_name,
      reviewerId:     r.assigned_reviewer_id || null,
      reviewerName:   r.reviewer_name || null,
      priority:       r.priority,
      estimatedHours: r.estimated_hours,
      dueDate:        r.due_date,
      designNotes:    r.design_notes,
      assignedDate:   r.updated_at,
    } : null,
    quotations: (r.quotations || []).map(q => ({
      id:            q.id,
      version:       q.version_number,
      status:        q.review_status,
      file:          (q.files && q.files[0]?.name) || `OPP${r.opportunity_id}-quote-v${q.version_number}.xlsx`,
      date:          q.submitted_at,
      totalValue:    q.total_value,
      notes:         q.review_notes || q.designer_notes,
      reviewNotes:   q.review_notes,
      designerNotes: q.designer_notes,
      lineItems:     q.line_items || [],
    })),
    revisionNotes: latest?.review_status === 'Revision Requested' ? latest.review_notes : '',
    approvedAt:    latest?.review_status === 'Approved' ? latest.reviewed_at : null,
  };
};

window.PROJECT_TYPES = ['New', 'Modification', 'As-Built'];
window.URGENCY_LEVELS = ['Standard', 'Urgent', 'Critical'];
window.URGENCY_META = {
  'Standard': { fg: 'var(--neutral-500)',     bg: 'var(--neutral-100)' },
  'Urgent':   { fg: 'var(--img-orange-700)',  bg: 'var(--img-orange-50)' },
  'Critical': { fg: '#B0241D',                bg: 'var(--color-danger-bg)' },
};

// Designer overload threshold (matches database/seed.js value)
window.DESIGNER_OVERLOAD = 4;

// ============================================================
// SEED — 9 design requests across the 5 stages, derived from real opps
// ============================================================
function _req(o) {
  // Pull denorm fields from the matching deal so the design board doesn't have to JOIN.
  const deal = (window.DEALS || []).find(d => d.id === o.oppId);
  return {
    id:             o.id,
    oppId:          o.oppId,
    oppTitle:       deal ? deal.name    : o.oppTitle || '',
    account:        deal ? deal.account : o.account  || '',
    value:          deal ? deal.value   : 0,
    scope:          deal ? deal.scope   : '',
    requestedById:  o.requestedById,
    requestedBy:    o.requestedBy,
    projectType:    o.projectType,
    urgency:        o.urgency,
    sitePlans:      o.sitePlans || [],
    notes:          o.notes || '',
    requestedDate:  o.requestedDate,
    stage:          o.stage,
    assignment:     o.assignment || null,
    quotations:     o.quotations || [],
    revisionNotes:  o.revisionNotes || '',
    approvedAt:     o.approvedAt || null,
  };
}

window.DESIGN_REQUESTS = [
  // ---------- INCOMING (no designer assigned yet) ----------
  _req({
    id: 'DR001', oppId: 'OPP010',
    requestedById: 'U003', requestedBy: 'Yazan Obeidat',
    projectType: 'New', urgency: 'Urgent',
    sitePlans: [{ name: 'UoP-site-plan-floor1-4.dwg', size: 2840000 }, { name: 'Architect-brief.pdf', size: 480000 }],
    notes: 'Full HVAC design for 4-floor academic building. Tender response — need to submit by end of month. Coordinate with Sigma Eng for MEP.',
    requestedDate: '2026-05-09', stage: 'Incoming',
  }),
  _req({
    id: 'DR002', oppId: 'OPP013',
    requestedById: 'U003', requestedBy: 'Yazan Obeidat',
    projectType: 'New', urgency: 'Standard',
    sitePlans: [{ name: 'Abdali-P2-master-plan.pdf', size: 1240000 }],
    notes: 'Office building phase 2 — same VRF spec as phase 1 (DR009). Should be a fast turnaround.',
    requestedDate: '2026-05-10', stage: 'Incoming',
  }),

  // ---------- QUEUED (assigned, not started) ----------
  _req({
    id: 'DR003', oppId: 'OPP004',
    requestedById: 'U003', requestedBy: 'Yazan Obeidat',
    projectType: 'New', urgency: 'Standard',
    sitePlans: [{ name: 'Dabouq-villa-layouts-5units.dwg', size: 4120000 }],
    notes: '5 luxury villas, similar layouts. VRF system — high-end finish required.',
    requestedDate: '2026-05-06', stage: 'Queued',
    assignment: {
      designerId: 'U006', designer: 'Omar Tarawneh',
      priority: 2, estimatedHours: 32,
      dueDate: '2026-05-25', designNotes: 'Standardize across all 5 units, then customize for unit #4 (larger footprint).',
      assignedDate: '2026-05-08',
    },
  }),

  // ---------- IN PROGRESS ----------
  _req({
    id: 'DR004', oppId: 'OPP008',
    requestedById: 'U004', requestedBy: 'Mahmoud Haddad',
    projectType: 'New', urgency: 'Critical',
    sitePlans: [{ name: 'Dawliyya-resort-wing-arch.pdf', size: 6800000 }, { name: 'Existing-chiller-spec.pdf', size: 920000 }],
    notes: 'Resort wing addition — 150 rooms. Working with Dar Al-Omran. Critical: tender deadline 25 May.',
    requestedDate: '2026-05-02', stage: 'In Progress',
    assignment: {
      designerId: 'U007', designer: 'Hilal Nasser',
      priority: 1, estimatedHours: 48,
      dueDate: '2026-05-22', designNotes: 'Match chiller capacity to existing wing. Submit BoQ with optional efficiency upgrade as separate line.',
      assignedDate: '2026-05-03',
    },
    quotations: [{ version: 1, status: 'Draft', file: 'OPP008-quote-v1-draft.xlsx', date: '2026-05-08' }],
  }),
  _req({
    id: 'DR005', oppId: 'OPP003',
    requestedById: 'U003', requestedBy: 'Yazan Obeidat',
    projectType: 'Modification', urgency: 'Standard',
    sitePlans: [{ name: 'Sweifieh-villa-Mansour.dwg', size: 1840000 }],
    notes: 'Single villa, customer ready to sign. Just need final BoQ and revised drawings.',
    requestedDate: '2026-04-30', stage: 'In Progress',
    assignment: {
      designerId: 'U006', designer: 'Omar Tarawneh',
      priority: 3, estimatedHours: 8,
      dueDate: '2026-05-15', designNotes: 'Customer wants ducted units (not split). Match existing villa style.',
      assignedDate: '2026-05-02',
    },
  }),
  _req({
    id: 'DR006', oppId: 'OPP011',
    requestedById: 'U003', requestedBy: 'Yazan Obeidat',
    projectType: 'As-Built', urgency: 'Urgent',
    sitePlans: [{ name: 'Safeway-3branch-survey.pdf', size: 3200000 }],
    notes: 'Retrofit 3 branches — old units must be removed first. Negotiating 20% discount, need final spec to confirm.',
    requestedDate: '2026-05-04', stage: 'In Progress',
    assignment: {
      designerId: 'U006', designer: 'Omar Tarawneh',
      priority: 2, estimatedHours: 16,
      dueDate: '2026-05-18', designNotes: 'Same unit model across all 3 branches if possible (procurement discount).',
      assignedDate: '2026-05-05',
    },
    quotations: [{ version: 1, status: 'Draft', file: 'OPP011-quote-v1.xlsx', date: '2026-05-07' }],
  }),

  // ---------- REVIEW (submitted by designer, awaiting Sally) ----------
  _req({
    id: 'DR007', oppId: 'OPP006',
    requestedById: 'U004', requestedBy: 'Mahmoud Haddad',
    projectType: 'New', urgency: 'Standard',
    sitePlans: [{ name: 'Shmeisani-tower-12floors.dwg', size: 5400000 }, { name: 'Beta-Eng-MEP-spec.pdf', size: 1280000 }],
    notes: '12-floor office tower with central chiller plant. Beta Eng is doing the MEP coordination.',
    requestedDate: '2026-04-26', stage: 'Review',
    assignment: {
      designerId: 'U007', designer: 'Hilal Nasser',
      priority: 2, estimatedHours: 40,
      dueDate: '2026-05-12', designNotes: 'Two-stage chiller arrangement. Submitted V1 for review.',
      assignedDate: '2026-04-28',
    },
    quotations: [{ version: 1, status: 'Submitted', file: 'OPP006-quote-v1.xlsx', date: '2026-05-10' }],
  }),
  _req({
    id: 'DR008', oppId: 'OPP014',
    requestedById: 'U004', requestedBy: 'Mahmoud Haddad',
    projectType: 'Modification', urgency: 'Urgent',
    sitePlans: [{ name: 'Capital-parking-ventilation.dwg', size: 2200000 }],
    notes: 'Underground parking ventilation. V1 had under-sized fans — V2 is the revision.',
    requestedDate: '2026-04-20', stage: 'Review',
    assignment: {
      designerId: 'U007', designer: 'Hilal Nasser',
      priority: 2, estimatedHours: 12,
      dueDate: '2026-05-14', designNotes: 'V2: increased fan capacity by 30% per Sally\'s feedback.',
      assignedDate: '2026-04-22',
    },
    quotations: [
      { version: 1, status: 'Revised', file: 'OPP014-quote-v1.xlsx', date: '2026-05-03' },
      { version: 2, status: 'Submitted', file: 'OPP014-quote-v2.xlsx', date: '2026-05-10' },
    ],
    revisionNotes: 'V1 fan capacity was 15% under code minimum. Resize and resubmit. — Sally',
  }),

  // ---------- RELEASED (approved, sent to sales) ----------
  _req({
    id: 'DR009', oppId: 'OPP001',
    requestedById: 'U003', requestedBy: 'Yazan Obeidat',
    projectType: 'New', urgency: 'Standard',
    sitePlans: [{ name: 'Abdali-Mall-floors1-3.dwg', size: 7800000 }],
    notes: 'Phase 1 of Abdali Mall HVAC. Tender won, design complete, sales now in negotiation.',
    requestedDate: '2026-03-15', stage: 'Released',
    assignment: {
      designerId: 'U006', designer: 'Omar Tarawneh',
      priority: 2, estimatedHours: 60,
      dueDate: '2026-04-15', designNotes: 'Final approved — V3.',
      assignedDate: '2026-03-18',
    },
    quotations: [
      { version: 1, status: 'Revised',  file: 'OPP001-quote-v1.xlsx', date: '2026-03-28' },
      { version: 2, status: 'Revised',  file: 'OPP001-quote-v2.xlsx', date: '2026-04-08' },
      { version: 3, status: 'Approved', file: 'OPP001-quote-v3.xlsx', date: '2026-04-20' },
    ],
    approvedAt: '2026-04-20',
  }),
];

// ============================================================
// HELPERS — designer workload + filtering
// ============================================================

// Count active (non-Released) tasks per designer.
window.designerWorkload = function designerWorkload() {
  const map = {};
  (window.USERS || []).filter(u => ['Designer','Design Manager'].includes(u.role)).forEach(u => {
    map[u.id] = { id: u.id, name: u.name, role: u.role, active: 0, queued: 0, review: 0, total: 0 };
  });
  (window.DESIGN_REQUESTS || []).forEach(r => {
    if (!r.assignment) return;
    const did = r.assignment.designerId;
    if (!map[did]) return;
    if (r.stage === 'Released') return;
    map[did].total += 1;
    if (r.stage === 'In Progress') map[did].active += 1;
    if (r.stage === 'Queued')      map[did].queued += 1;
    if (r.stage === 'Review')      map[did].review += 1;
  });
  return Object.values(map);
};

// Tasks assigned to the current user (designer view).
window.tasksForUser = function tasksForUser(userId) {
  return (window.DESIGN_REQUESTS || []).filter(r => r.assignment && r.assignment.designerId === userId);
};

window.findDesignRequestById = (id) => (window.DESIGN_REQUESTS || []).find(r => r.id === id) || null;

window.formatFileSize = (bytes) => {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

window.formatRelativeDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const days = Math.round((new Date() - d) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7)   return days + ' days ago';
  if (days < 30)  return Math.floor(days / 7) + 'w ago';
  return window.formatDate(iso);
};
