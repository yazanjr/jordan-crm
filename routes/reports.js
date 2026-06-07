// Reports — management/PM analytics. Aggregations over real data, role-scoped.
//
// Access model (locked 2026-05-21):
//   • product_manager / sales_manager / design_manager / admin  → full: all
//     salesmen, comparison, including cost/margin.
//   • salesman → self-view: only their own row, margin fields stripped.
//   • designer → no access to the salesman report (403).
//
// Uses demoAuth (same as design/products/opportunities) so it works under the
// current pre-login setup; flips to real auth in the Phase-1 cutover.

const express  = require('express');
const db       = require('../database/db');
const demoAuth = require('../middleware/demoAuth');

const router = express.Router();
router.use(demoAuth);

const FULL_ACCESS_ROLES = ['admin', 'product_manager', 'sales_manager', 'design_manager'];

// Stage → win probability (mirrors the pipeline's stage meta).
const STAGE_PROB = { prospect: 0.25, tender: 0.40, analysis: 0.50, negotiation: 0.75, closing: 0.90 };
const probOf = (stage) => STAGE_PROB[String(stage || '').trim().toLowerCase()] || 0;

// ---------------------------------------------------------------------------
// GET /api/reports/salesman-performance
//   Balanced scorecard per salesman. Returns { scope, can_view_margin, salesmen[] }.
// ---------------------------------------------------------------------------
router.get('/salesman-performance', (req, res) => {
  const role = req.user.role;
  const isFull = FULL_ACCESS_ROLES.includes(role);
  const isSalesman = role === 'salesman';
  if (!isFull && !isSalesman) {
    return res.status(403).json({ error: 'The salesman report is for sales management.' });
  }
  const canViewMargin = isFull;                 // salesman never sees margin/cost
  const onlyId = isSalesman ? req.user.id : null;

  // ── Base deals (one row per opportunity that has an owner) ───────────────
  const dealRows = db.prepare(`
    SELECT o.id, o.salesman_id, u.name AS salesman_name,
           o.status, o.stage, o.expected_value AS value, o.created_at, o.closed_at,
           o.system AS system, lr.label AS lost_reason
    FROM opportunities o
    JOIN users u ON u.id = o.salesman_id
    LEFT JOIN lost_reasons lr ON lr.id = o.lost_reason_id
    WHERE o.salesman_id IS NOT NULL
    ${onlyId ? 'AND o.salesman_id = ?' : ''}
  `).all(...(onlyId ? [onlyId] : []));

  // Group into per-salesman accumulators.
  const acc = new Map();
  const ensure = (id, name) => {
    if (!acc.has(id)) acc.set(id, {
      salesman_id: id, salesman_name: name,
      open_count: 0, open_value: 0, weighted_value: 0,
      won_count: 0, won_value: 0, lost_count: 0, lost_value: 0,
      _cycleDaysSum: 0, _cycleN: 0,
      by_stage: {},
      by_system: {},          // { <system>: {won_count, lost_count, won_value, lost_value, open_count} }
      loss_by_reason: {},     // { <reason>: count }
      modification_requests: 0, avg_discount_pct: null, over_limit_approvals: 0,
      internal_mods: 0, total_mods: 0,                 // technical-rework ratio
      stalled_count: 0,                                 // active deals with no movement > 30d
      avg_categories: null, cross_sell_deals: 0,        // product mix / cross-sell
    });
    return acc.get(id);
  };

  for (const d of dealRows) {
    const s = ensure(d.salesman_id, d.salesman_name);
    const v = Number(d.value) || 0;
    const sys = d.system || 'Unspecified';
    const sysAcc = s.by_system[sys] || (s.by_system[sys] = { won_count: 0, lost_count: 0, won_value: 0, lost_value: 0, open_count: 0 });
    if (d.status === 'Active') {
      s.open_count += 1; s.open_value += v;
      s.weighted_value += v * probOf(d.stage);
      s.by_stage[d.stage] = (s.by_stage[d.stage] || 0) + 1;
      sysAcc.open_count += 1;
    } else if (d.status === 'Won') {
      s.won_count += 1; s.won_value += v;
      sysAcc.won_count += 1; sysAcc.won_value += v;
      if (d.closed_at && d.created_at) {
        const days = (new Date(d.closed_at) - new Date(d.created_at)) / 86400000;
        if (Number.isFinite(days) && days >= 0) { s._cycleDaysSum += days; s._cycleN += 1; }
      }
    } else if (d.status === 'Lost') {
      s.lost_count += 1; s.lost_value += v;
      sysAcc.lost_count += 1; sysAcc.lost_value += v;
      const reason = d.lost_reason || 'Unspecified';
      s.loss_by_reason[reason] = (s.loss_by_reason[reason] || 0) + 1;
    }
  }

  // ── Modifications — NEUTRAL count, attributed to the deal owner. A
  //    modification is not inherently bad (it's often value-engineering); the
  //    signal that matters is the *cause* split below, not the raw count. ─────
  const modRows = db.prepare(`
    SELECT o.salesman_id AS id, COUNT(*) AS n
    FROM design_requests dr
    JOIN opportunities o ON o.id = dr.opportunity_id
    WHERE dr.request_type = 'Modification' AND o.salesman_id IS NOT NULL
    ${onlyId ? 'AND o.salesman_id = ?' : ''}
    GROUP BY o.salesman_id
  `).all(...(onlyId ? [onlyId] : []));
  for (const r of modRows) { const s = acc.get(r.id); if (s) s.modification_requests = r.n; }

  // ── Technical-rework ratio — internal-fault modifications ÷ total. Only
  //    'Internal …' causes count as rework; external/commercial causes don't.
  //    Empty until modifications start carrying a cause (accrues over time). ──
  const reworkRows = db.prepare(`
    SELECT o.salesman_id AS id,
           SUM(CASE WHEN dr.modification_cause LIKE 'Internal%' THEN 1 ELSE 0 END) AS internal_mods,
           SUM(CASE WHEN dr.modification_cause IS NOT NULL THEN 1 ELSE 0 END) AS total_mods
    FROM design_requests dr
    JOIN opportunities o ON o.id = dr.opportunity_id
    WHERE dr.request_type = 'Modification' AND o.salesman_id IS NOT NULL
    ${onlyId ? 'AND o.salesman_id = ?' : ''}
    GROUP BY o.salesman_id
  `).all(...(onlyId ? [onlyId] : []));
  for (const r of reworkRows) { const s = acc.get(r.id); if (s) { s.internal_mods = r.internal_mods || 0; s.total_mods = r.total_mods || 0; } }

  // ── Stalled-deal ratio — active deals whose last stage movement (or, absent
  //    any, the last edit / creation) was more than 30 days ago. Uses the
  //    captured stage_history, not the assumed loss-stage. ───────────────────
  const stalledRows = db.prepare(`
    SELECT o.salesman_id AS id,
           SUM(CASE WHEN julianday('now') - julianday(COALESCE(sh.last_move, o.updated_at, o.created_at)) > 30 THEN 1 ELSE 0 END) AS stalled
    FROM opportunities o
    LEFT JOIN (SELECT opp_id, MAX(changed_at) AS last_move FROM stage_history GROUP BY opp_id) sh ON sh.opp_id = o.id
    WHERE o.status = 'Active' AND o.salesman_id IS NOT NULL
    ${onlyId ? 'AND o.salesman_id = ?' : ''}
    GROUP BY o.salesman_id
  `).all(...(onlyId ? [onlyId] : []));
  for (const r of stalledRows) { const s = acc.get(r.id); if (s) s.stalled_count = r.stalled || 0; }

  // ── Product mix / cross-sell — average number of distinct product families
  //    (category_l1, falling back to the line's free-text category) per deal
  //    that has a quotation. High = bundling accessories/controls; low = a
  //    single-category seller leaving money on the table. ─────────────────────
  const mixRows = db.prepare(`
    WITH latest AS (
      SELECT request_id, MAX(version_number) AS mv FROM quotation_versions GROUP BY request_id
    ),
    per_deal AS (
      SELECT o.salesman_id AS id, o.id AS opp_id,
             COUNT(DISTINCT COALESCE(ps.category_l1, li.category)) AS cats
      FROM quotation_line_items li
      JOIN quotation_versions qv ON qv.id = li.quotation_version_id
      JOIN latest l ON l.request_id = qv.request_id AND l.mv = qv.version_number
      JOIN design_requests dr ON dr.id = qv.request_id
      JOIN opportunities o ON o.id = dr.opportunity_id
      LEFT JOIN product_skus ps ON ps.id = li.sku_id
      WHERE o.salesman_id IS NOT NULL
        AND COALESCE(ps.category_l1, li.category) IS NOT NULL
      ${onlyId ? 'AND o.salesman_id = ?' : ''}
      GROUP BY o.salesman_id, o.id
    )
    SELECT id, AVG(cats) AS avg_categories, COUNT(*) AS deals FROM per_deal GROUP BY id
  `).all(...(onlyId ? [onlyId] : []));
  for (const r of mixRows) { const s = acc.get(r.id); if (s && r.deals > 0) { s.avg_categories = r.avg_categories; s.cross_sell_deals = r.deals; } }

  // ── Over-limit discount approvals (every discount_approvals row is an
  //    over-limit request). ─────────────────────────────────────────────────
  const apprRows = db.prepare(`
    SELECT o.salesman_id AS id, COUNT(*) AS n
    FROM discount_approvals da
    JOIN opportunities o ON o.id = da.opp_id
    WHERE o.salesman_id IS NOT NULL
    ${onlyId ? 'AND o.salesman_id = ?' : ''}
    GROUP BY o.salesman_id
  `).all(...(onlyId ? [onlyId] : []));
  for (const r of apprRows) { const s = acc.get(r.id); if (s) s.over_limit_approvals = r.n; }

  // ── Average discount % — over the LATEST quotation version per design
  //    request (avoids double-counting revisions). ────────────────────────────
  const discRows = db.prepare(`
    WITH latest AS (
      SELECT request_id, MAX(version_number) AS mv FROM quotation_versions GROUP BY request_id
    )
    SELECT o.salesman_id AS id, AVG(qv.discount_pct_global) AS avg_disc
    FROM quotation_versions qv
    JOIN latest l ON l.request_id = qv.request_id AND l.mv = qv.version_number
    JOIN design_requests dr ON dr.id = qv.request_id
    JOIN opportunities o ON o.id = dr.opportunity_id
    WHERE qv.discount_pct_global IS NOT NULL AND o.salesman_id IS NOT NULL
    ${onlyId ? 'AND o.salesman_id = ?' : ''}
    GROUP BY o.salesman_id
  `).all(...(onlyId ? [onlyId] : []));
  for (const r of discRows) { const s = acc.get(r.id); if (s && r.avg_disc != null) s.avg_discount_pct = r.avg_disc; }

  // ── Margin (privileged only). Two SEPARATE metrics, both on the COSTED
  //    portion of each deal's latest quotation (lines that carry a cost
  //    snapshot): margin = (costed_revenue − cost) / costed_revenue.
  //      • won_*    → only Won deals (empty today — no won deal has a quote yet;
  //                    fills once a quoted deal is won).
  //      • quoted_* → every deal that has a quotation, any status (populated now).
  //    No all-or-nothing gate: lines lacking cost are simply excluded from both
  //    sides so the ratio stays honest. ──────────────────────────────────────
  if (canViewMargin) {
    const marginQuery = (wonOnly) => db.prepare(`
      WITH latest AS (
        SELECT request_id, MAX(version_number) AS mv FROM quotation_versions GROUP BY request_id
      )
      SELECT o.salesman_id AS id,
             COUNT(DISTINCT o.id) AS deal_count,
             SUM(CASE WHEN li.cost_snapshot IS NOT NULL THEN li.subtotal ELSE 0 END) AS costed_revenue,
             SUM(CASE WHEN li.cost_snapshot IS NOT NULL THEN li.cost_snapshot * li.qty ELSE 0 END) AS cost
      FROM quotation_line_items li
      JOIN quotation_versions qv ON qv.id = li.quotation_version_id
      JOIN latest l ON l.request_id = qv.request_id AND l.mv = qv.version_number
      JOIN design_requests dr ON dr.id = qv.request_id
      JOIN opportunities o ON o.id = dr.opportunity_id
      WHERE o.salesman_id IS NOT NULL ${wonOnly ? "AND o.status = 'Won'" : ''}
      ${onlyId ? 'AND o.salesman_id = ?' : ''}
      GROUP BY o.salesman_id
    `).all(...(onlyId ? [onlyId] : []));

    const apply = (rows, prefix) => {
      for (const r of rows) {
        const s = acc.get(r.id); if (!s) continue;
        const rev = +(r.costed_revenue || 0);
        s[`${prefix}_revenue`] = +rev.toFixed(2);
        s[`${prefix}_cost`] = +(r.cost || 0).toFixed(2);
        s[`${prefix}_deal_count`] = r.deal_count || 0;
        s[`${prefix}_margin_pct`] = rev > 0 ? +(((rev - r.cost) / rev)).toFixed(4) : null;
      }
    };
    apply(marginQuery(true),  'won');
    apply(marginQuery(false), 'quoted');
  }

  // ── Finalize derived fields ──────────────────────────────────────────────
  const salesmen = Array.from(acc.values()).map(s => {
    const winDenomV = s.won_value + s.lost_value;
    const winDenomC = s.won_count + s.lost_count;
    const out = {
      salesman_id: s.salesman_id, salesman_name: s.salesman_name,
      open_count: s.open_count, open_value: +s.open_value.toFixed(2),
      weighted_value: +s.weighted_value.toFixed(2),
      won_count: s.won_count, won_value: +s.won_value.toFixed(2),
      lost_count: s.lost_count, lost_value: +s.lost_value.toFixed(2),
      win_rate_value: winDenomV > 0 ? +(s.won_value / winDenomV).toFixed(4) : null,
      win_rate_count: winDenomC > 0 ? +(s.won_count / winDenomC).toFixed(4) : null,
      avg_deal_size: s.open_count > 0 ? +(s.open_value / s.open_count).toFixed(2) : null,
      avg_cycle_days: s._cycleN > 0 ? Math.round(s._cycleDaysSum / s._cycleN) : null,
      by_stage: s.by_stage,
      by_system: s.by_system,
      loss_by_reason: s.loss_by_reason,
      modification_requests: s.modification_requests,
      internal_mods: s.internal_mods,
      total_mods: s.total_mods,
      rework_ratio: s.total_mods > 0 ? +(s.internal_mods / s.total_mods).toFixed(4) : null,
      stalled_count: s.stalled_count,
      stalled_ratio: s.open_count > 0 ? +(s.stalled_count / s.open_count).toFixed(4) : null,
      avg_categories: s.avg_categories != null ? +s.avg_categories.toFixed(2) : null,
      cross_sell_deals: s.cross_sell_deals,
      avg_discount_pct: s.avg_discount_pct,
      over_limit_approvals: s.over_limit_approvals,
    };
    if (canViewMargin) {
      out.won_revenue = s.won_revenue ?? 0;
      out.won_cost = s.won_cost ?? 0;
      out.won_margin_pct = s.won_margin_pct ?? null;
      out.won_deal_count = s.won_deal_count ?? 0;
      out.quoted_revenue = s.quoted_revenue ?? 0;
      out.quoted_cost = s.quoted_cost ?? 0;
      out.quoted_margin_pct = s.quoted_margin_pct ?? null;
      out.quoted_deal_count = s.quoted_deal_count ?? 0;
    }
    return out;
  }).sort((a, b) => b.won_value - a.won_value);

  res.json({ scope: isSalesman ? 'self' : 'team', can_view_margin: canViewMargin, salesmen });
});

// ---------------------------------------------------------------------------
// GET /api/reports/targets?year=YYYY   — managers/PM/admin read.
//   Returns { year, company:{annual,monthly}, salesmen:[{salesman_id,name,annual,monthly}] }.
// ---------------------------------------------------------------------------
router.get('/targets', (req, res) => {
  if (!FULL_ACCESS_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Targets are for sales management.' });
  }
  const year = +req.query.year || new Date().getFullYear();
  const rows = db.prepare(`SELECT * FROM sales_targets WHERE year = ?`).all(year);
  const companyRow = rows.find(r => r.scope === 'company');
  const monthlyOf = (r) => r ? (r.monthly_amount != null ? r.monthly_amount : (r.annual_amount || 0) / 12) : 0;
  const salesmen = db.prepare(`
    SELECT u.id AS salesman_id, u.name
    FROM users u JOIN roles r ON r.id = u.role_id
    WHERE r.name = 'salesman' AND u.is_active = 1 ORDER BY u.name
  `).all().map(u => {
    const t = rows.find(r => r.scope === 'salesman' && r.salesman_id === u.salesman_id);
    return { salesman_id: u.salesman_id, name: u.name, annual: t ? t.annual_amount : 0, monthly: monthlyOf(t) };
  });
  res.json({
    year,
    company: { annual: companyRow ? companyRow.annual_amount : 0, monthly: monthlyOf(companyRow) },
    salesmen,
  });
});

// ---------------------------------------------------------------------------
// PUT /api/reports/targets   — admin / product_manager write.
//   Body: { year, company_annual?, per_salesman?: [{salesman_id, annual_amount}] }
//   Upserts each provided target (code-level upsert; monthly defaults to annual/12).
// ---------------------------------------------------------------------------
router.put('/targets', (req, res) => {
  if (!['admin', 'product_manager'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Only admin / product manager can set targets.' });
  }
  const year = +(req.body && req.body.year) || new Date().getFullYear();
  const companyAnnual = req.body && req.body.company_annual;
  const perSalesman = (req.body && req.body.per_salesman) || [];

  const upsert = (scope, salesmanId, annual) => {
    const existing = scope === 'company'
      ? db.prepare(`SELECT id FROM sales_targets WHERE scope='company' AND year=?`).get(year)
      : db.prepare(`SELECT id FROM sales_targets WHERE scope='salesman' AND salesman_id=? AND year=?`).get(salesmanId, year);
    if (existing) {
      db.prepare(`UPDATE sales_targets SET annual_amount=?, updated_by=?, updated_at=datetime('now') WHERE id=?`)
        .run(Number(annual) || 0, req.user.id, existing.id);
    } else {
      db.prepare(`INSERT INTO sales_targets (scope, salesman_id, year, annual_amount, updated_by) VALUES (?,?,?,?,?)`)
        .run(scope, scope === 'company' ? null : salesmanId, year, Number(annual) || 0, req.user.id);
    }
  };

  db.exec('BEGIN');
  try {
    if (companyAnnual != null) upsert('company', null, companyAnnual);
    for (const t of perSalesman) if (t && t.salesman_id != null) upsert('salesman', +t.salesman_id, t.annual_amount);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: e.message });
  }
  res.json({ ok: true, year });
});

module.exports = router;
