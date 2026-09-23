// utils/installation.js
// VRF installation price + cost — a 1:1 move of the IMG offer file's
// "Installation Price" sheet (selling side) and "PM Costing" sheet (cost side).
// No new rules: every number comes from the installation_params table, which is
// seeded with the file's values and edited from the Installation parameters list.
//
//   inputs = {
//     enabled, counts: {indoor, ducted, cassette, modules} (optional overrides),
//     copper: { CU_01: metres, … }, insulation: '13mm'|'19mm',
//     cora_qty, cladding_qty, tray_qty, tray_type, valves: bool, additional_qty
//   }
//   ctx = { pricing: 'Inclusive'|'Exempted'|'Sales Tax Exempted'|'Iraq', city }

const INSTALL_MODEL = 'INSTALL-VRF';
const INSTALL_DESCRIPTION = 'Supply and install of copper pipes network, insulation, accessories, testing and commissioning';

// Which VRF family a pricelist item belongs to (from its pricelist "section").
function vrfKind(section, description) {
  const s = String(section || ''), t = s + ' ' + String(description || '');
  if (/branch|manifold/i.test(t)) return 'separation';
  if (/controller|\bbms\b|software|adaptor|commissioning/i.test(t)) return 'controller';
  if (/^(gmv|mini gmv|side discharge)/i.test(s) || /outdoor/i.test(t)) return 'outdoor';
  return 'indoor';
}

// Count units from the quotation's VRF lines: [{category, sku_section, description, qty}]
function countUnits(lines) {
  const c = { indoor: 0, ducted: 0, cassette: 0, modules: 0 };
  (lines || []).forEach((li) => {
    if (li.model === INSTALL_MODEL || li.category !== 'VRF System') return;
    const qty = Number(li.qty) || 0;
    const kind = vrfKind(li.sku_section, li.description);
    if (kind === 'outdoor') c.modules += qty;
    if (kind !== 'indoor') return;
    c.indoor += qty;
    const t = String(li.sku_section || '') + ' ' + String(li.description || '');
    if (/duct/i.test(t)) c.ducted += qty;
    else if (/cassette/i.test(t)) c.cassette += qty;
  });
  return c;
}

function loadParams(db) {
  const rows = db.prepare(`SELECT * FROM installation_params ORDER BY sort_order`).all();
  const by = {}; rows.forEach(r => { by[r.code] = r; });
  return { rows, by, grp: (g) => rows.filter(r => r.grp === g) };
}
const tier = (rows, n) => rows.find(r => n >= (r.min_units ?? 0) && (r.max_units == null || n <= r.max_units));
const r2 = (x) => Math.round(x * 100) / 100;
// Net price the way the offer file does it: ROUNDUP((1 − discount) × price, 0); no discount → unchanged.
const netOf = (x, d) => (d > 0 ? Math.ceil(x * (1 - d) - 1e-9) : x);

// Warranty cost (PM Costing C21): equipment list total × rate by years / project type / value band.
function warrantyCost(P, equipTotal, projectType, years) {
  const y = Math.max(0, Math.floor(Number(years) || 0));
  if (!y || !(equipTotal > 0)) return 0;
  const val = (code, d = 0) => (P.by[code] ? Number(P.by[code].value) : d);
  const pt = String(projectType || '').toLowerCase();
  let rows;
  if (pt === 'residential') rows = P.grp('warranty').filter(r => /^WAR_RES_Y/.test(r.code));
  else if (pt === 'commercial') {
    const band = equipTotal < val('WAR_BAND_1', 25000) ? 1 : equipTotal < val('WAR_BAND_2', 75000) ? 2 : equipTotal < val('WAR_BAND_3', 150000) ? 3 : 4;
    rows = P.grp('warranty').filter(r => r.code.startsWith(`WAR_COM_B${band}_`));
  } else return 0;                                   // the file's IF chain yields 0 for other types
  // VLOOKUP approximate match: the largest year ≤ requested years.
  const row = rows.filter(r => (r.min_units ?? 0) <= y).sort((a, b) => b.min_units - a.min_units)[0];
  return row ? equipTotal * Number(row.value) : 0;
}
// Preventive-maintenance visits cost (PM Costing C22).
function pmVisitsCost(P, n, years, visitsPerYear) {
  const y = Number(years) || 0, v = Number(visitsPerYear) || 0;
  if (!n || !y || !v) return 0;
  const t = tier(P.grp('pm_visits'), n);
  if (!t) return 0;
  const per = t.code === 'PMV_T1' ? t.value : n * t.value;
  return v * y * per;
}
// Copper for Split System sheet: extra metres × price per metre.
function computeSplitCopper(metres, ctx, P) {
  const m = Math.max(0, Number(metres) || 0);
  const val = (code, d = 0) => (P.by[code] ? Number(P.by[code].value) : d);
  const incl = (ctx.pricing || 'Inclusive') === 'Inclusive';
  const unit = incl ? val('SCU_PRICE_INCL', 25) : val('SCU_PRICE_EXCL', 22);
  const d = Number(ctx.discount) || 0;
  // Cost depends on the brand: GREE splits ship with an aluminium kit (cost 0); other brands use real copper.
  const unitCost = /gree/i.test(String(ctx.brand || 'Gree')) ? val('SCU_COST_GREE', 0) : val('SCU_COST_OTHER', 13.75);
  return { metres: m, unit_price: unit, unit_net: netOf(unit, d), price: r2(m * unit), net: r2(m * netOf(unit, d)), unit_cost: unitCost, cost: r2(m * unitCost), brand: ctx.brand || 'Gree' };
}

function computeInstallation(inputs = {}, ctx = {}, P) {
  const val = (code, d = 0) => (P.by[code] ? Number(P.by[code].value) : d);
  const c = inputs.counts || {};
  const n = Math.max(0, Number(c.indoor) || 0);
  const duct = Math.max(0, Number(c.ducted) || 0), cass = Math.max(0, Number(c.cassette) || 0), mod = Math.max(0, Number(c.modules) || 0);
  const tax = 1 + val('TAX_RATE', 0.16);
  const notInclusive = (ctx.pricing || 'Inclusive') !== 'Inclusive';
  const adj = (x) => (notInclusive ? x / tax : x);
  const margin = val('COST_MARGIN', 0.45);

  // Copper: metres × (1 + safety) × price per metre; else estimate per indoor unit.
  const safety = val('CU_SAFETY', 0.1);
  let metres = 0, copperMeasured = 0;
  const copperRows = P.grp('copper').filter(r => /^CU_\d+$/.test(r.code)).map((r) => {
    const q = Math.max(0, Number((inputs.copper || {})[r.code]) || 0);
    const withSafety = q * (1 + safety), total = withSafety * r.value;
    metres += withSafety; copperMeasured += total;
    return { code: r.code, label: r.label, qty: q, metres: r2(withSafety), price: r.value, total: r2(total) };
  });
  const copper = copperMeasured !== 0 ? copperMeasured : adj(n * val('CU_EST_PER_IDU', 300));

  // Labour: tiered rate per indoor unit + extras.
  const labTier = tier(P.grp('labour').filter(r => /^LAB_T/.test(r.code)), n);
  const labour = n * (labTier ? labTier.value : 0) + (duct + cass) * val('LAB_DUCT_CASS', 10) + mod * val('LAB_MODULE', 105);

  // Options
  const insulation = adj(inputs.insulation === '19mm' ? (metres / 2) * val('OPT_INSUL_19', 1) : 0);
  const cora = adj((Number(inputs.cora_qty) || 0) * val('OPT_CORA', 20));
  const cladding = adj((Number(inputs.cladding_qty) || 0) * val('OPT_CLADDING', 40));
  const trayRow = P.grp('option').find(r => /^OPT_TRAY_/.test(r.code) && r.extra === inputs.tray_type);
  const tray = (Number(inputs.tray_qty) || 0) * (trayRow ? trayRow.value : 0);
  const valves = adj(inputs.valves ? n * 2 * val('OPT_VALVE', 45) : 0);
  const shopdwg = n ? Math.round(val('FIX_SHOPDWG_BASE', 500) / (1 - margin) / 10) * 10 : 0;
  const additional = (Number(inputs.additional_qty) || 0) * val('OPT_ADDITIONAL', 16);

  // Location extra (file: any non-blank city; listed cities at half), rounded up.
  const city = String(ctx.city || '').trim();
  let location = 0;
  if (city) {
    const half = String((P.by.LOC_HALF_CITIES || {}).extra || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean).includes(city.toLowerCase());
    const x = ((n / 16) * val('LOC_PER_16', 750)) / (1 - margin);
    const step = val('LOC_ROUND', 50) || 50;
    location = Math.ceil(((half ? x / 2 : x) - 1e-9) / step) * step;
    if (location < 0) location = 0;
  }

  // Supervision / preventive maintenance by number of indoor units.
  const supRows = P.grp('supervision');
  let sup = n >= 1 ? tier(supRows, n) : null;
  if (!sup && n >= 1 && supRows.length) sup = supRows[supRows.length - 1];        // above the last tier
  const supervision = sup ? sup.value : 0;

  const installExSep = shopdwg + valves + tray + cladding + cora + insulation + labour + copper;
  const price = installExSep + location + supervision + additional;
  // Net like the file (G61): each block rounded up separately after the discount.
  const d = Number(ctx.discount) || 0;
  const net = netOf(installExSep, d) + netOf(location, d) + netOf(supervision, d) + netOf(additional, d);

  // Cost side (PM Costing)
  const costLabTier = tier(P.grp('cost').filter(r => /^COST_LAB_T/.test(r.code)), n);
  const cost = {
    copper: notInclusive ? copper * (1 - margin) : (copper * (1 - margin)) / tax,
    labour: n * (costLabTier ? costLabTier.value : 0),
    material: (insulation + cora + cladding + tray + valves + shopdwg) * (1 - margin) + n * val('COST_MAT_PER_IDU', 5) + mod * val('COST_MAT_PER_MODULE', 50),
    location: location * (1 - margin),
    supervision: sup ? Number(sup.value2) || 0 : 0,
    // Project costs from the PM Costing sheet (not part of the selling price).
    warranty: warrantyCost(P, Number(ctx.equipTotal) || 0, ctx.projectType, inputs.warranty_years),
    pm_visits: pmVisitsCost(P, n, inputs.pm_years, inputs.pm_visits_per_year),
  };
  const costTotal = Object.values(cost).reduce((a, b) => a + b, 0);

  return {
    counts: { indoor: n, ducted: duct, cassette: cass, modules: mod },
    pricing: ctx.pricing || 'Inclusive', city,
    copper_rows: copperRows, copper_metres: r2(metres), copper_estimated: copperMeasured === 0,
    labour_rate: labTier ? labTier.value : 0,
    breakdown: {
      labour: r2(labour), copper: r2(copper), shop_drawings: r2(shopdwg), insulation: r2(insulation), cora: r2(cora),
      cladding: r2(cladding), cable_tray: r2(tray), valves: r2(valves), location: r2(location),
      supervision: r2(supervision), additional: r2(additional),
    },
    price: r2(price), net: r2(net), discount: d,
    cost: Object.fromEntries(Object.entries(cost).map(([k, v]) => [k, r2(v)])),
    cost_total: r2(costTotal),
  };
}

const SPLIT_COPPER_MODEL = 'COPPER-SPLIT';
const SPLIT_COPPER_DESCRIPTION = 'Installation and Extra Copper Pipes';
module.exports = { computeInstallation, computeSplitCopper, countUnits, loadParams, vrfKind, netOf, INSTALL_MODEL, INSTALL_DESCRIPTION, SPLIT_COPPER_MODEL, SPLIT_COPPER_DESCRIPTION };
