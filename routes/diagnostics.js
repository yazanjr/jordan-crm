// Diagnostic reporting layer — validates/refutes four hypotheses behind the
// two-year revenue decline. Every endpoint below obeys two cross-cutting rules:
//   1. DATE RANGE: accepts ?start=YYYY-MM-DD&end=YYYY-MM-DD (defaults wide-open).
//   2. INTERNAL EXCLUSION default-on: organizations.is_internal=1 accounts are
//      excluded unless ?include_internal=true.
// Revenue model (no Invoice entity): a "revenue event" is a Won opportunity —
//   date = closed_at, amount = signing_price (fallback expected_value, flagged),
//   customer = org_id. Legacy deals without org_id/closed_at simply don't appear.
//
// H1 market access · H2 close-stage strangulation · H3 retention/concentration · H4 capacity.

const express  = require('express');
const db       = require('../database/db');
const demoAuth = require('../middleware/demoAuth');

const router = express.Router();
router.use(demoAuth);

// Management-only, mirrors reports.js.
const FULL = ['admin', 'product_manager', 'sales_manager', 'design_manager'];
router.use((req, res, next) => {
  if (!FULL.includes(req.user.role)) return res.status(403).json({ error: 'Diagnostics are for management.' });
  next();
});

const STAGE_ORDER = ['Lead', 'Prospect', 'Tender', 'Analysis', 'Negotiation', 'Closing', 'Won'];

// ── shared helpers ─────────────────────────────────────────────────────────
function range(req) {
  const start = (req.query.start || '1900-01-01').slice(0, 10);
  let end = (req.query.end || '2999-12-31').slice(0, 10);
  return { start: start + ' 00:00:00', end: end + ' 23:59:59', startDate: start, endDate: end };
}
// internal-exclusion clause for a query that has `organizations` aliased as `org`.
function internal(req, alias = 'org') {
  return req.query.include_internal === 'true' ? '' : `AND COALESCE(${alias}.is_internal, 0) = 0`;
}
const revenueAmount = `COALESCE(o.signing_price, o.expected_value)`;
function meta(req) {
  return {
    revenue_basis: 'won-deal proxy (signing_price, fallback expected_value)',
    internal_excluded: req.query.include_internal !== 'true',
    range: { start: (req.query.start || null), end: (req.query.end || null) },
  };
}
const num = (v) => (v == null ? null : +v);
function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// =====================================================================
// H2 — CLOSE-STAGE STRANGULATION
// =====================================================================

// 1. Discount gap distribution: histogram of (requested − approved) %, split by outcome.
router.get('/h2/discount-gap', (req, res) => {
  const { start, end } = range(req);
  const rows = db.prepare(`
    SELECT da.requested_pct, da.approved_pct, da.status, o.status AS outcome
    FROM discount_approvals da
    JOIN opportunities o ON o.id = da.opp_id
    LEFT JOIN organizations org ON org.id = o.org_id
    WHERE da.request_date BETWEEN ? AND ? ${internal(req)}
  `).all(start, end);
  // gap = requested − approved (rejected → approved treated as 0). Bucket in 5-pt bins.
  const buckets = {};
  const split = { Won: [], Lost: [], Active: [] };
  for (const r of rows) {
    const approved = r.status === 'Rejected' ? 0 : (r.approved_pct != null ? r.approved_pct : r.requested_pct);
    const gap = Math.max(0, (r.requested_pct || 0) - approved);
    const bin = `${Math.floor(gap / 5) * 5}-${Math.floor(gap / 5) * 5 + 5}%`;
    buckets[bin] = (buckets[bin] || 0) + 1;
    (split[r.outcome] || split.Active).push(gap);
  }
  res.json({
    meta: meta(req),
    total_requests: rows.length,
    histogram: Object.entries(buckets).map(([bin, count]) => ({ bin, count })).sort((a, b) => parseInt(a.bin) - parseInt(b.bin)),
    by_outcome: Object.fromEntries(Object.entries(split).map(([k, v]) => [k, { count: v.length, avg_gap: v.length ? +(v.reduce((s, x) => s + x, 0) / v.length).toFixed(1) : null }])),
    note: 'Within-limit discounts are auto-approved (no approval row) and correctly count as gap 0 only if requested; truly frictionless deals are absent by design.',
  });
});

// 2. Deals lost after discount rejection — the dollar cost of the policy.
router.get('/h2/lost-after-rejection', (req, res) => {
  const { start, end } = range(req);
  const rows = db.prepare(`
    SELECT o.id, o.title, o.${'expected_value'} AS expected_value, o.signing_price,
           ${revenueAmount} AS value, da.requested_pct, da.approved_pct, o.closed_at,
           lr.label AS lost_reason
    FROM discount_approvals da
    JOIN opportunities o ON o.id = da.opp_id
    LEFT JOIN organizations org ON org.id = o.org_id
    LEFT JOIN lost_reasons lr ON lr.id = o.lost_reason_id
    WHERE da.status = 'Rejected' AND o.status = 'Lost'
      AND (o.closed_at BETWEEN ? AND ? OR da.response_date BETWEEN ? AND ?) ${internal(req)}
    ORDER BY value DESC
  `).all(start, end, start, end);
  res.json({
    meta: meta(req),
    count: rows.length,
    total_value: rows.reduce((s, r) => s + (r.value || 0), 0),
    deals: rows,
  });
});

// 3. Stage-by-stage conversion — % entering each stage that advanced to the next.
router.get('/h2/stage-conversion', (req, res) => {
  const { start, end } = range(req);
  // opps that had ANY transition in the window; then compute furthest stage reached.
  const hist = db.prepare(`
    SELECT sh.opp_id, sh.to_stage, sh.changed_at
    FROM stage_history sh
    JOIN opportunities o ON o.id = sh.opp_id
    LEFT JOIN organizations org ON org.id = o.org_id
    WHERE sh.changed_at BETWEEN ? AND ? ${internal(req)}
    ORDER BY sh.opp_id, sh.id
  `).all(start, end);
  const reachedByOpp = {};
  for (const h of hist) {
    const idx = STAGE_ORDER.indexOf(h.to_stage);
    if (idx < 0) continue; // 'Lost' and unknowns are off-funnel
    reachedByOpp[h.opp_id] = Math.max(reachedByOpp[h.opp_id] ?? -1, idx);
  }
  const reachedCount = STAGE_ORDER.map(() => 0);
  for (const maxIdx of Object.values(reachedByOpp)) for (let i = 0; i <= maxIdx; i++) reachedCount[i]++;
  const stages = STAGE_ORDER.map((s, i) => ({
    stage: s,
    reached: reachedCount[i],
    conversion_to_next: i < STAGE_ORDER.length - 1 && reachedCount[i] > 0
      ? +(reachedCount[i + 1] / reachedCount[i]).toFixed(4) : null,
  }));
  res.json({ meta: meta(req), deals: Object.keys(reachedByOpp).length, stages });
});

// 4. Time-in-stage distribution — avg & median days per stage, split won/lost.
//    Derived from changed_at deltas (seconds_in_prev is broken — deal age, not stage time).
router.get('/h2/time-in-stage', (req, res) => {
  const { start, end } = range(req);
  const hist = db.prepare(`
    SELECT sh.opp_id, sh.from_stage, sh.to_stage, sh.changed_at, o.status AS outcome
    FROM stage_history sh
    JOIN opportunities o ON o.id = sh.opp_id
    LEFT JOIN organizations org ON org.id = o.org_id
    WHERE sh.opp_id IN (
      SELECT opp_id FROM stage_history WHERE changed_at BETWEEN ? AND ?
    ) ${internal(req)}
    ORDER BY sh.opp_id, sh.id
  `).all(start, end);
  // per opp, time spent IN from_stage = changed_at(this) − changed_at(prev).
  const perStage = {}; // stage → { Won:[days], Lost:[days], Active:[days] }
  let prev = null;
  for (const h of hist) {
    if (prev && prev.opp_id === h.opp_id && prev.to_stage && STAGE_ORDER.includes(prev.to_stage)) {
      const days = (new Date(h.changed_at + 'Z') - new Date(prev.changed_at + 'Z')) / 86400000;
      if (days >= 0) {
        const st = prev.to_stage;
        (perStage[st] = perStage[st] || { Won: [], Lost: [], Active: [] });
        (perStage[st][h.outcome] || perStage[st].Active).push(days);
      }
    }
    prev = h;
  }
  const out = STAGE_ORDER.filter(s => perStage[s]).map(s => {
    const g = perStage[s];
    const stat = (a) => ({ n: a.length, avg_days: a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : null, median_days: a.length ? +median(a).toFixed(1) : null });
    return { stage: s, won: stat(g.Won), lost: stat(g.Lost) };
  });
  res.json({ meta: meta(req), stages: out });
});

// 5. Loss-reason frequency — count & value by structured reason.
router.get('/h2/loss-reasons', (req, res) => {
  const { start, end } = range(req);
  const rows = db.prepare(`
    SELECT COALESCE(lr.label, 'Unspecified') AS reason,
           COUNT(*) AS count, SUM(${revenueAmount}) AS total_value
    FROM opportunities o
    LEFT JOIN organizations org ON org.id = o.org_id
    LEFT JOIN lost_reasons lr ON lr.id = o.lost_reason_id
    WHERE o.status = 'Lost' AND o.closed_at BETWEEN ? AND ? ${internal(req)}
    GROUP BY reason ORDER BY count DESC
  `).all(start, end);
  res.json({ meta: meta(req), reasons: rows.map(r => ({ ...r, total_value: num(r.total_value) })) });
});

// =====================================================================
// H1 — MARKET ACCESS
// =====================================================================

// 6. Awareness-stage distribution of Projects.
router.get('/h1/awareness-distribution', (req, res) => {
  const { start, end } = range(req);
  const rows = db.prepare(`
    SELECT COALESCE(awareness_stage, 'unknown') AS awareness_stage,
           COUNT(*) AS count, SUM(COALESCE(estimated_hvac_value, 0)) AS total_value
    FROM projects
    WHERE COALESCE(date_awareness_gained, created_at) BETWEEN ? AND ?
    GROUP BY awareness_stage ORDER BY count DESC
  `).all(start, end);
  res.json({ meta: meta(req), stages: rows.map(r => ({ ...r, total_value: num(r.total_value) })) });
});

// 7. Projects known-but-not-pursued (or awareness came too late to bid).
router.get('/h1/not-pursued', (req, res) => {
  const { start, end } = range(req);
  const rows = db.prepare(`
    SELECT id, name, awarding_party, estimated_hvac_value, awareness_stage, source,
           outcome, winning_competitor, not_pursued_reason, date_awareness_gained
    FROM projects
    WHERE (pursued = 0 OR awareness_stage IN ('unaware','aware-late'))
      AND COALESCE(date_awareness_gained, created_at) BETWEEN ? AND ?
    ORDER BY COALESCE(estimated_hvac_value, 0) DESC
  `).all(start, end);
  res.json({
    meta: meta(req),
    count: rows.length,
    total_missed_value: rows.reduce((s, r) => s + (r.estimated_hvac_value || 0), 0),
    projects: rows,
  });
});

// 8. Contact coverage — key-target influencers with a meaningful Activity in last N days.
router.get('/h1/contact-coverage', (req, res) => {
  const days = Math.max(1, +req.query.days || 30);
  const rows = db.prepare(`
    SELECT c.id, c.name, c.role, c.influence_tier, org.name AS organization,
           (SELECT MAX(COALESCE(a.done_at, a.created_at)) FROM activities a WHERE a.contact_id = c.id) AS last_activity
    FROM contacts c
    LEFT JOIN organizations org ON org.id = c.organization_id
    WHERE c.key_target = 1
    ORDER BY c.influence_tier, c.name
  `).all();
  const now = Date.now();
  const withLight = rows.map(r => {
    const ageDays = r.last_activity ? (now - new Date(r.last_activity + 'Z').getTime()) / 86400000 : null;
    const light = ageDays == null ? 'red' : ageDays <= days ? 'green' : ageDays <= days * 2 ? 'yellow' : 'red';
    return { ...r, days_since_last_activity: ageDays == null ? null : Math.floor(ageDays), light };
  });
  res.json({
    meta: { ...meta(req), window_days: days },
    counts: { green: withLight.filter(r => r.light === 'green').length, yellow: withLight.filter(r => r.light === 'yellow').length, red: withLight.filter(r => r.light === 'red').length },
    contacts: withLight,
  });
});

// 9. Project source analysis.
router.get('/h1/project-source', (req, res) => {
  const { start, end } = range(req);
  const rows = db.prepare(`
    SELECT COALESCE(source, 'unknown') AS source,
           COUNT(*) AS count, SUM(COALESCE(estimated_hvac_value, 0)) AS total_value
    FROM projects
    WHERE created_at BETWEEN ? AND ?
    GROUP BY source ORDER BY count DESC
  `).all(start, end);
  res.json({ meta: meta(req), sources: rows.map(r => ({ ...r, total_value: num(r.total_value) })) });
});

// =====================================================================
// H3 — RETENTION & CONCENTRATION  (revenue = Won deals)
// =====================================================================

// won revenue events as a reusable subquery string (org-scoped, internal-filtered).
function wonEvents(req) {
  return `
    SELECT o.org_id, ${revenueAmount} AS amount,
           CAST(strftime('%Y', o.closed_at) AS INTEGER) AS yr, o.closed_at, o.salesman_id
    FROM opportunities o
    JOIN organizations org ON org.id = o.org_id
    WHERE o.status = 'Won' AND o.closed_at IS NOT NULL AND o.org_id IS NOT NULL ${internal(req)}`;
}

// 10. Cohort retention triangle — accounts grouped by first-purchase year.
router.get('/h3/cohort-retention', (req, res) => {
  const events = db.prepare(wonEvents(req)).all();
  const firstYear = {}; // org_id → first year
  for (const e of events) if (firstYear[e.org_id] == null || e.yr < firstYear[e.org_id]) firstYear[e.org_id] = e.yr;
  // cohort → year → {accounts:Set, revenue}
  const tri = {};
  for (const e of events) {
    const cohort = firstYear[e.org_id];
    (tri[cohort] = tri[cohort] || {});
    (tri[cohort][e.yr] = tri[cohort][e.yr] || { accounts: new Set(), revenue: 0 });
    tri[cohort][e.yr].accounts.add(e.org_id);
    tri[cohort][e.yr].revenue += e.amount || 0;
  }
  const cohorts = Object.keys(tri).map(Number).sort().map(cohort => {
    const size = new Set(events.filter(e => firstYear[e.org_id] === cohort && e.yr === cohort).map(e => e.org_id)).size;
    const years = {};
    for (const [yr, v] of Object.entries(tri[cohort])) {
      years[yr] = { accounts: v.accounts.size, revenue: +v.revenue.toFixed(2), retention_pct: size ? +(v.accounts.size / size).toFixed(3) : null };
    }
    return { cohort_year: cohort, cohort_size: size, years };
  });
  res.json({ meta: meta(req), cohorts, note: cohorts.length ? undefined : 'No Won deals with a customer + close date yet — cohorts accrue as deals close through the app.' });
});

// 11. Silent-account watchlist — no Won activity in last N months.
router.get('/h3/silent-accounts', (req, res) => {
  const months = Math.max(1, +req.query.months || 6);
  const rows = db.prepare(`
    WITH won AS (${wonEvents(req)})
    SELECT org.id, org.name, org.account_code, org.customer_type,
           org.churn_reason, org.churn_reason_note,
           COUNT(w.org_id) AS won_deals,
           SUM(w.amount) AS lifetime_revenue,
           MAX(w.closed_at) AS last_purchase,
           MIN(w.closed_at) AS first_purchase
    FROM organizations org
    JOIN won w ON w.org_id = org.id
    GROUP BY org.id
    HAVING MAX(w.closed_at) < datetime('now', ?)
    ORDER BY lifetime_revenue DESC
  `).all(`-${months} months`);
  res.json({ meta: { ...meta(req), silent_after_months: months }, accounts: rows.map(r => ({ ...r, lifetime_revenue: num(r.lifetime_revenue) })) });
});

// 12. New-vs-returning revenue split for a period.
router.get('/h3/new-vs-returning', (req, res) => {
  const { start, end, startDate } = range(req);
  const events = db.prepare(wonEvents(req)).all();
  // first-purchase date per account (all-time), then classify events inside the window.
  const firstDate = {};
  for (const e of events) if (!firstDate[e.org_id] || e.closed_at < firstDate[e.org_id]) firstDate[e.org_id] = e.closed_at;
  let newRev = 0, retRev = 0, newAcc = new Set(), retAcc = new Set();
  for (const e of events) {
    if (e.closed_at < start || e.closed_at > end) continue;
    const isNew = firstDate[e.org_id] >= start; // first ever purchase falls in window
    if (isNew) { newRev += e.amount || 0; newAcc.add(e.org_id); }
    else { retRev += e.amount || 0; retAcc.add(e.org_id); }
  }
  res.json({
    meta: meta(req),
    new: { accounts: newAcc.size, revenue: +newRev.toFixed(2) },
    returning: { accounts: retAcc.size, revenue: +retRev.toFixed(2) },
    new_revenue_share: (newRev + retRev) > 0 ? +(newRev / (newRev + retRev)).toFixed(3) : null,
  });
});

// 13. Concentration — revenue share of top 5/10/20 accounts per year.
router.get('/h3/concentration', (req, res) => {
  const events = db.prepare(wonEvents(req)).all();
  const byYear = {}; // yr → org → revenue
  for (const e of events) {
    (byYear[e.yr] = byYear[e.yr] || {});
    byYear[e.yr][e.org_id] = (byYear[e.yr][e.org_id] || 0) + (e.amount || 0);
  }
  const years = Object.keys(byYear).map(Number).sort().map(yr => {
    const totals = Object.values(byYear[yr]).sort((a, b) => b - a);
    const total = totals.reduce((s, x) => s + x, 0);
    const topShare = (n) => total > 0 ? +(totals.slice(0, n).reduce((s, x) => s + x, 0) / total).toFixed(3) : null;
    return { year: yr, accounts: totals.length, total_revenue: +total.toFixed(2), top5: topShare(5), top10: topShare(10), top20: topShare(20) };
  });
  res.json({ meta: meta(req), years });
});

// =====================================================================
// H4 — CAPACITY
// =====================================================================

// 14. Active salesman count over time vs monthly revenue.
router.get('/h4/salesman-count', (req, res) => {
  const { start, end } = range(req);
  // monthly Won revenue
  const rev = db.prepare(`
    WITH won AS (${wonEvents(req)})
    SELECT strftime('%Y-%m', closed_at) AS ym, SUM(amount) AS revenue, COUNT(*) AS deals
    FROM won WHERE closed_at BETWEEN ? AND ? GROUP BY ym ORDER BY ym
  `).all(start, end);
  // active headcount per month from hire/departure dates (forward-only; NULL hire = counted as always-active).
  const sal = db.prepare(`
    SELECT u.id, u.hire_date, u.departure_date, u.status
    FROM users u JOIN roles r ON r.id = u.role_id
    WHERE r.name = 'salesman'
  `).all();
  const withCount = rev.map(m => {
    const monthStart = m.ym + '-01';
    const active = sal.filter(s =>
      (!s.hire_date || s.hire_date <= monthStart + ' 23:59:59') &&
      (!s.departure_date || s.departure_date >= monthStart)
    ).length;
    return { month: m.ym, revenue: num(m.revenue), deals: m.deals, active_salesmen: active };
  });
  res.json({ meta: meta(req), months: withCount, current_active: sal.filter(s => (s.status || 'active') === 'active').length });
});

// 15. Revenue per active salesman (monthly).
router.get('/h4/revenue-per-salesman', (req, res) => {
  const { start, end } = range(req);
  const rev = db.prepare(`
    WITH won AS (${wonEvents(req)})
    SELECT strftime('%Y-%m', closed_at) AS ym, SUM(amount) AS revenue
    FROM won WHERE closed_at BETWEEN ? AND ? GROUP BY ym ORDER BY ym
  `).all(start, end);
  const sal = db.prepare(`SELECT u.hire_date, u.departure_date FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='salesman'`).all();
  const months = rev.map(m => {
    const ms = m.ym + '-01';
    const active = sal.filter(s => (!s.hire_date || s.hire_date <= ms + ' 23:59:59') && (!s.departure_date || s.departure_date >= ms)).length || 1;
    return { month: m.ym, revenue: num(m.revenue), active_salesmen: active, revenue_per_head: +(m.revenue / active).toFixed(2) };
  });
  res.json({ meta: meta(req), months });
});

// 16. Activity per salesman per week — rolling 4-week avg.
router.get('/h4/activity-per-salesman', (req, res) => {
  const { start, end } = range(req);
  const rows = db.prepare(`
    SELECT u.id, u.name,
           COUNT(a.id) AS activities,
           COUNT(DISTINCT strftime('%Y-%W', COALESCE(a.done_at, a.created_at))) AS active_weeks
    FROM users u
    JOIN roles r ON r.id = u.role_id
    LEFT JOIN activities a ON a.performed_by = u.id AND COALESCE(a.done_at, a.created_at) BETWEEN ? AND ?
    WHERE r.name = 'salesman'
    GROUP BY u.id ORDER BY activities DESC
  `).all(start, end);
  res.json({
    meta: meta(req),
    salesmen: rows.map(r => ({ ...r, avg_per_week: r.active_weeks ? +(r.activities / r.active_weeks).toFixed(1) : 0 })),
    note: rows.every(r => r.activities === 0) ? 'No activities logged yet — this report is empty until activity logging is adopted.' : undefined,
  });
});

// 17. Departure tier attribution — departed salesmen, prior-12-mo revenue, quartile.
router.get('/h4/departure-attribution', (req, res) => {
  const departed = db.prepare(`
    SELECT u.id, u.name, u.departure_date, u.departure_reason
    FROM users u JOIN roles r ON r.id = u.role_id
    WHERE r.name = 'salesman' AND u.status = 'departed' AND u.departure_date IS NOT NULL
  `).all();
  const rows = departed.map(d => {
    const rev = db.prepare(`
      SELECT SUM(${revenueAmount}) AS v FROM opportunities o
      LEFT JOIN organizations org ON org.id = o.org_id
      WHERE o.salesman_id = ? AND o.status='Won' AND o.closed_at IS NOT NULL
        AND o.closed_at BETWEEN datetime(?, '-12 months') AND ? ${internal(req)}
    `).get(d.id, d.departure_date, d.departure_date);
    return { ...d, prior_12mo_revenue: num(rev && rev.v) || 0 };
  }).sort((a, b) => b.prior_12mo_revenue - a.prior_12mo_revenue);
  // quartile labels
  const n = rows.length;
  rows.forEach((r, i) => { r.tier = n < 4 ? 'n/a' : i < n / 4 ? 'top' : i < n / 2 ? 'upper-mid' : i < 3 * n / 4 ? 'lower-mid' : 'bottom'; });
  res.json({ meta: meta(req), departed: rows });
});

// 18. Departure reason distribution.
router.get('/h4/departure-reasons', (req, res) => {
  const { start, end } = range(req);
  const rows = db.prepare(`
    SELECT COALESCE(departure_reason, 'unspecified') AS reason, COUNT(*) AS count
    FROM users
    WHERE status = 'departed' AND (departure_date IS NULL OR departure_date BETWEEN ? AND ?)
    GROUP BY reason ORDER BY count DESC
  `).all(start, end);
  const notes = db.prepare(`
    SELECT name, departure_reason, departure_note, departure_date
    FROM users WHERE status='departed' AND departure_note IS NOT NULL
  `).all();
  res.json({ meta: meta(req), reasons: rows, notes });
});

module.exports = router;
