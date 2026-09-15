// GREE pricing & costing engine — the single source of truth for the
// FOB → cost → price → GP math (from GREE_CRM_Pricing_Module.xlsx).
//
// Rules (per the spec README):
//  - Money rounded to 0 decimals at EVERY step. Costs/prices are JOD; FOB is USD.
//  - Three cost tiers per item: Inclusive / STax-Exempt / Exempted (which chain
//    steps are applied depends on the customer's tax status).
//  - Price 1 (Inclusive) is set manually; Price 2 & 3 are derived from it.
//  - GP on the pricelist is measured against Cost Inclusive.

const r0 = (n) => Math.round(Number(n) || 0);                 // round to 0 dp
const ceilStep = (n, step) => { const s = Number(step) || 1; return Math.ceil((Number(n) || 0) / s) * s; };

// catParams: { ship, cust, extra, tax, copper=0, install=0 }  (fractions, e.g. 0.10)
// globals:   { fx, roundStep, staxDiv, custDiv }
function computeCosts(fobNetUsd, catParams = {}, globals = {}) {
  const fob = Number(fobNetUsd) || 0;
  const ship = Number(catParams.ship) || 0;
  const cust = Number(catParams.cust) || 0;
  const extra = Number(catParams.extra) || 0;
  const tax = Number(catParams.tax) || 0;
  const adders = (Number(catParams.copper) || 0) + (Number(catParams.install) || 0);
  const fx = Number(globals.fx) || 0;

  const jod       = r0(fob * fx);                 // Step 1
  const shipped   = r0(jod * (1 + ship));         // Step 2
  const customs   = r0(shipped * (1 + cust));     // Step 3 (skipped for Exempted)
  const extraFull = r0(customs * (1 + extra));    // Step 4 (on the customs value)
  const taxed     = r0(extraFull * (1 + tax));    // Step 5 (skipped for STax-Exempt & Exempted)
  const extraNoCustoms = r0(shipped * (1 + extra)); // Step 4 for the Exempted path (customs skipped)

  return {
    cost_inclusive:   taxed + adders,          // steps 1-5 (+ U-Match adders)
    cost_stax_exempt: extraFull + adders,      // skip tax
    cost_exempted:    extraNoCustoms + adders, // skip customs + tax
  };
}

// Price 2 = CEILING(Price1 / STAX_DIV, ROUND_STEP);  Price 3 = CEILING(Price2 / CUST_DIV, ROUND_STEP)
function computePrices(price1, globals = {}) {
  const p1 = Number(price1) || 0;
  const staxDiv = Number(globals.staxDiv) || 1;
  const custDiv = Number(globals.custDiv) || 1;
  const step = Number(globals.roundStep) || 1;
  const price2 = p1 ? ceilStep(p1 / staxDiv, step) : 0;
  const price3 = price2 ? ceilStep(price2 / custDiv, step) : 0;
  return { price2_stax_exempt: price2, price3_exempted: price3 };
}

// GP @tier = (Price1×(1−tier) − CostInclusive) / (Price1×(1−tier)). tiers = [0.25, 0.40, ...].
function computeGP(price1, costInclusive, tiers = []) {
  const p1 = Number(price1) || 0;
  const cost = Number(costInclusive) || 0;
  const at = (d) => { const base = p1 * (1 - d); return base > 0 ? +((base - cost) / base).toFixed(4) : null; };
  return { gp_list: at(0), gp_tiers: (tiers || []).map(t => ({ tier: t, gp: at(t) })) };
}

// Back-solve a Price 1 for a target GP% at list: GP=(P−cost)/P ⇒ P = cost/(1−GP), rounded up to the price step.
function suggestPrice1(costInclusive, targetGP, globals = {}) {
  const cost = Number(costInclusive) || 0;
  const g = Math.max(0, Math.min(0.99, Number(targetGP) || 0));
  if (cost <= 0) return 0;
  return ceilStep(cost / (1 - g), Number(globals.roundStep) || 1);
}

module.exports = { computeCosts, computePrices, computeGP, suggestPrice1, r0, ceilStep };
