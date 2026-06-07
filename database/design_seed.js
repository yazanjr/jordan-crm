// Design-pages seed. Runs on every server start; idempotent (INSERT OR IGNORE by title).
// Mirrors what the pipeline-v3 frontend has been showing from static window.DEALS
// and window.DESIGN_REQUESTS, so demoing the API matches what the UI already shows.

const db = require('./db');

function applyDesignSeed() {
  // Early exit: if real opportunities have been imported, skip the demo seed entirely.
  // This guards against re-introducing demo data after Hamzeh imported the Commercial Pipeline.
  const hasRealData = db.prepare(`SELECT 1 FROM opportunities LIMIT 1`).get();
  if (hasRealData) {
    console.log('  ℹ Design seed skipped — opportunities already exist in DB.');
    return;
  }

  // -------- Organizations (20, by name) --------
  const orgs = [
    { name: 'Abdali Investment & Development', type: 'Customer' },
    { name: 'Tamimi Holdings',                  type: 'Customer' },
    { name: 'Capital Real Estate',              type: 'Customer' },
    { name: 'Jordan Medical Center',            type: 'Customer' },
    { name: 'Al-Dawliyya Hotels',               type: 'Customer' },
    { name: 'Khalil Trading Co.',               type: 'Customer' },
    { name: 'Rami Haddad Properties',           type: 'Customer' },
    { name: 'Cafe Rumi Chain',                  type: 'Customer' },
    { name: 'University of Petra',              type: 'Customer' },
    { name: 'Safeway Supermarkets',             type: 'Customer' },
    { name: 'Sigma Engineering',                type: 'Engineering Office' },
    { name: 'Arc Design Consultants',           type: 'Engineering Office' },
    { name: 'Beta Engineering',                 type: 'Engineering Office' },
    { name: 'Dar Al-Omran',                     type: 'Engineering Office' },
    { name: 'ABC Contracting',                  type: 'Contractor' },
    { name: 'Elite Build',                      type: 'Contractor' },
    { name: 'Home Pro JO',                      type: 'Contractor' },
    { name: 'Build Corp International',         type: 'Contractor' },
    { name: 'Al-Mohandis MEP',                  type: 'Subcontractor' },
    { name: 'Frost HVAC Services',              type: 'Subcontractor' },
  ];
  // Guard: only insert orgs that don't exist yet (match by name)
  const orgExists = name => !!db.prepare(`SELECT 1 FROM organizations WHERE name = ?`).get(name);
  orgs.forEach(o => { if (!orgExists(o.name)) db.prepare(`INSERT INTO organizations (name, type) VALUES (?, ?)`).run(o.name, o.type); });
  const orgIdByName = name => db.prepare(`SELECT id FROM organizations WHERE name = ?`).get(name)?.id;

  // -------- Opportunities (15, by title — title is unique in the prototype) --------
  // Guard: skip entirely if the seed opportunities already exist (prevents duplicates on server restart).
  const oppAlreadySeeded = !!db.prepare(`SELECT 1 FROM opportunities WHERE title = 'Abdali Mall HVAC System'`).get();
  if (oppAlreadySeeded) {
    // Still need to run the design_requests guard below — fall through.
  }

  // salesman name → user id. Yazan = 3, Mahmoud = 4.
  const salesmen = { Yazan: 3, Mahmoud: 4 };

  const opps = [
    { title: 'Abdali Mall HVAC System',            org: 'Abdali Investment & Development', salesman: 'Yazan',   stage: 'Negotiation', value: 450000,  product: 'VRF' },
    { title: 'Mecca St Residential Tower',         org: 'Rami Haddad Properties',          salesman: 'Mahmoud', stage: 'Prospect',    value: 85000,   product: 'Split' },
    { title: 'Sweifieh Villa — Mansour',           org: 'Tamimi Holdings',                  salesman: 'Yazan',   stage: 'Closing',     value: 32000,   product: 'Ducted' },
    { title: 'Dabouq Luxury Villas (5 units)',     org: 'Tamimi Holdings',                  salesman: 'Yazan',   stage: 'Analysis',    value: 320000,  product: 'VRF' },
    { title: 'Rainbow St Cafe Chain AC',            org: 'Cafe Rumi Chain',                  salesman: 'Mahmoud', stage: 'Closing',     value: 18000,   product: 'Split' },
    { title: 'Shmeisani Office Tower Chiller',     org: 'Capital Real Estate',              salesman: 'Mahmoud', stage: 'Analysis',    value: 780000,  product: 'Chiller' },
    { title: 'Jordan Medical Wing B',              org: 'Jordan Medical Center',            salesman: 'Yazan',   stage: 'Prospect',    value: 1200000, product: 'VRF' },
    { title: 'Dead Sea Resort Expansion',          org: 'Al-Dawliyya Hotels',               salesman: 'Mahmoud', stage: 'Tender',      value: 550000,  product: 'Chiller' },
    { title: 'Khalil Warehouse Cold Storage',      org: 'Khalil Trading Co.',               salesman: 'Mahmoud', stage: 'Prospect',    value: 65000,   product: 'Fan Coils' },
    { title: 'UoP New Campus Building',            org: 'University of Petra',              salesman: 'Yazan',   stage: 'Tender',      value: 420000,  product: 'VRF' },
    { title: 'Safeway Branch Retrofit (3 stores)', org: 'Safeway Supermarkets',             salesman: 'Yazan',   stage: 'Negotiation', value: 95000,   product: 'Split' },
    { title: 'Tamimi Villa #6 Dabouq',             org: 'Tamimi Holdings',                  salesman: 'Yazan',   stage: 'Prospect',    value: 58000,   product: 'Ducted' },
    { title: 'Abdali Phase 2 Offices',             org: 'Abdali Investment & Development',  salesman: 'Yazan',   stage: 'Prospect',    value: 380000,  product: 'VRF' },
    { title: 'Capital RE Parking Ventilation',     org: 'Capital Real Estate',              salesman: 'Mahmoud', stage: 'Negotiation', value: 45000,   product: 'AHU' },
    { title: 'Frost Service Contract 2026',        org: 'Frost HVAC Services',              salesman: 'Mahmoud', stage: 'Closing',     value: 22000,   product: 'Split' },
  ];

  const oppInsert = db.prepare(`
    INSERT INTO opportunities (title, org_id, salesman_id, stage, status, product_group, expected_value, currency)
    VALUES (?, ?, ?, ?, 'Active', ?, ?, 'JOD')
  `);
  if (!oppAlreadySeeded) {
    opps.forEach(o => oppInsert.run(o.title, orgIdByName(o.org), salesmen[o.salesman], o.stage, o.product, o.value));
  }

  const oppIdByTitle = title => db.prepare(`SELECT id FROM opportunities WHERE title = ?`).get(title)?.id;

  // -------- Design Requests (9) — only seed if the DR table is empty --------
  const existingCount = db.prepare(`SELECT COUNT(*) AS n FROM design_requests`).get().n;
  if (existingCount > 0) return;

  const designers = { Omar: 6, Hilal: 7 };

  const requests = [
    // INCOMING
    { opp: 'UoP New Campus Building',          requested_by: 'Yazan',   project_type: 'New Design',  urgency: 'Urgent',   notes: 'Full HVAC design for 4-floor academic building. Tender response — need to submit by end of month.', stage: 'Incoming' },
    { opp: 'Abdali Phase 2 Offices',           requested_by: 'Yazan',   project_type: 'New Design',  urgency: 'Standard', notes: 'Office building phase 2 — same VRF spec as phase 1. Should be a fast turnaround.', stage: 'Incoming' },
    // QUEUED
    { opp: 'Dabouq Luxury Villas (5 units)',   requested_by: 'Yazan',   project_type: 'New Design',  urgency: 'Standard', notes: '5 luxury villas, similar layouts. VRF system — high-end finish required.', stage: 'Queued',
      assigned_designer: 'Omar', priority: 2, estimated_hours: 32, due_date: '2026-05-25', design_notes: 'Standardize across all 5 units, then customize for unit #4.' },
    // IN PROGRESS
    { opp: 'Dead Sea Resort Expansion',        requested_by: 'Mahmoud', project_type: 'New Design',  urgency: 'Critical', notes: 'Resort wing addition — 150 rooms. Critical: tender deadline 25 May.', stage: 'In Progress',
      assigned_designer: 'Hilal', priority: 1, estimated_hours: 48, due_date: '2026-05-22', design_notes: 'Match chiller capacity to existing wing.' },
    { opp: 'Sweifieh Villa — Mansour',         requested_by: 'Yazan',   project_type: 'Modification', urgency: 'Standard', notes: 'Single villa, customer ready to sign. Just need final BoQ and revised drawings.', stage: 'In Progress',
      assigned_designer: 'Omar', priority: 3, estimated_hours: 8,  due_date: '2026-05-15', design_notes: 'Customer wants ducted units (not split).' },
    { opp: 'Safeway Branch Retrofit (3 stores)', requested_by: 'Yazan', project_type: 'As-Built',    urgency: 'Urgent',   notes: 'Retrofit 3 branches — old units removed first. Negotiating 20% discount.', stage: 'In Progress',
      assigned_designer: 'Omar', priority: 2, estimated_hours: 16, due_date: '2026-05-18', design_notes: 'Same unit model across all 3 branches if possible.' },
    // REVIEW
    { opp: 'Shmeisani Office Tower Chiller',   requested_by: 'Mahmoud', project_type: 'New Design',  urgency: 'Standard', notes: '12-floor office tower with central chiller plant.', stage: 'Review',
      assigned_designer: 'Hilal', priority: 2, estimated_hours: 40, due_date: '2026-05-12', design_notes: 'Two-stage chiller arrangement.',
      quotation: { version: 1, total_value: 780000, designer_notes: 'V1 — initial proposal.', review_status: 'Submitted' } },
    { opp: 'Capital RE Parking Ventilation',   requested_by: 'Mahmoud', project_type: 'Modification', urgency: 'Urgent',   notes: 'Underground parking ventilation. V1 had undersized fans — V2 is the revision.', stage: 'Review',
      assigned_designer: 'Hilal', priority: 2, estimated_hours: 12, due_date: '2026-05-14', design_notes: 'V2: increased fan capacity by 30%.',
      quotation: { version: 1, total_value: 42000, designer_notes: 'V1', review_status: 'Revision Requested', review_notes: 'V1 fan capacity was 15% under code minimum. Resize and resubmit.' },
      quotation2: { version: 2, total_value: 45000, designer_notes: 'V2 — fan capacity +30%.', review_status: 'Submitted' } },
    // RELEASED
    { opp: 'Abdali Mall HVAC System',          requested_by: 'Yazan',   project_type: 'New Design',  urgency: 'Standard', notes: 'Phase 1 of Abdali Mall HVAC. Tender won, design complete.', stage: 'Released',
      assigned_designer: 'Omar', priority: 2, estimated_hours: 60, due_date: '2026-04-15', design_notes: 'Final approved — V3.',
      quotation:  { version: 1, total_value: 480000, designer_notes: 'V1', review_status: 'Revision Requested', review_notes: 'Reduce scope on facade-facing AHUs.' },
      quotation2: { version: 2, total_value: 460000, designer_notes: 'V2', review_status: 'Revision Requested', review_notes: 'Adjust per Sigma Eng final spec.' },
      quotation3: { version: 3, total_value: 450000, designer_notes: 'V3 — approved final', review_status: 'Approved' } },
  ];

  const insertReq = db.prepare(`
    INSERT INTO design_requests (
      opportunity_id, request_type, requested_by, project_type, urgency,
      site_plans, salesman_notes, design_stage, version,
      assigned_designer_id, assigned_by, priority, estimated_hours, due_date, design_notes,
      created_at, updated_at
    ) VALUES (?, 'New', ?, ?, ?, '[]', ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  const insertHist = db.prepare(`
    INSERT INTO design_stage_history (request_id, from_stage, to_stage, changed_by, changed_at, time_in_previous_stage, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertQ = db.prepare(`
    INSERT INTO quotation_versions (request_id, version_number, total_value, files, designer_notes, created_by, submitted_at, review_status, review_notes, reviewed_by, reviewed_at)
    VALUES (?, ?, ?, '[]', ?, ?, ?, ?, ?, ?, ?)
  `);

  const SALLY_ID = 5;

  requests.forEach(r => {
    const oppId = oppIdByTitle(r.opp);
    if (!oppId) { console.warn('  ⚠ design_seed: missing opportunity', r.opp); return; }
    const requesterId  = salesmen[r.requested_by];
    const designerId   = r.assigned_designer ? designers[r.assigned_designer] : null;
    // Estimate a created_at ~14 days ago so stage history has plausible age data.
    const createdAt = new Date(Date.now() - 14 * 86400 * 1000).toISOString().replace('T', ' ').slice(0, 19);
    const info = insertReq.run(
      oppId, requesterId, r.project_type, r.urgency, r.notes, r.stage,
      designerId, designerId ? SALLY_ID : null,
      r.priority || null, r.estimated_hours || null, r.due_date || null, r.design_notes || null,
      createdAt
    );
    const reqId = info.lastInsertRowid;

    // Plausible stage history
    const t0 = Date.now() - 14 * 86400 * 1000;
    const stages = ['Incoming'];
    if (['Queued', 'In Progress', 'Review', 'Approved', 'Released'].includes(r.stage)) stages.push('Queued');
    if (['In Progress', 'Review', 'Approved', 'Released'].includes(r.stage))            stages.push('In Progress');
    if (['Review', 'Approved', 'Released'].includes(r.stage))                            stages.push('Review');
    if (['Approved', 'Released'].includes(r.stage))                                       stages.push('Approved');
    if (r.stage === 'Released')                                                            stages.push('Released');
    stages.forEach((s, i) => {
      const at = new Date(t0 + i * 86400 * 1000 * 2).toISOString().replace('T', ' ').slice(0, 19);
      const fromS = i === 0 ? null : stages[i - 1];
      const minutes = i === 0 ? 0 : 60 * 24 * 2;
      const who = (s === 'Queued' || s === 'Approved' || s === 'Released') ? SALLY_ID
                : (s === 'In Progress' || s === 'Review') ? designerId
                : requesterId;
      insertHist.run(reqId, fromS, s, who, at, minutes, null);
    });

    // Quotations
    const quotes = [r.quotation, r.quotation2, r.quotation3].filter(Boolean);
    quotes.forEach((q, i) => {
      const submittedAt = new Date(t0 + (5 + i) * 86400 * 1000).toISOString().replace('T', ' ').slice(0, 19);
      const reviewedAt = q.review_status !== 'Submitted'
        ? new Date(t0 + (6 + i) * 86400 * 1000).toISOString().replace('T', ' ').slice(0, 19)
        : null;
      insertQ.run(
        reqId, q.version, q.total_value, q.designer_notes || null, designerId, submittedAt,
        q.review_status, q.review_notes || null,
        q.review_status !== 'Submitted' ? SALLY_ID : null, reviewedAt
      );
    });
  });

  console.log(`✅  Design seed: ${requests.length} requests created`);
}

module.exports = applyDesignSeed;
