// One-shot migration — backfill the 3-layer product categories onto existing
// SKUs from the reference pricelist (Layer 1 › Layer 2 › Layer 3).
//
// Why backfill instead of re-upload: the upload endpoint DELETEs and re-inserts
// SKUs, but quotation_line_items.sku_id has a FK to product_skus(id), so a
// delete fails for any SKU already used on a quotation. Backfilling UPDATEs in
// place — preserving ids + FK integrity — and the reference file is otherwise
// identical to the loaded data (same models + prices), so categories are the
// only thing that needs to change.
//
// Run once:  node database/backfill_categories.js
// Idempotent: re-running just re-applies the same category values.

const path  = require('path');
const XLSX  = require('xlsx');
const db    = require('./db');

const REF = process.env.PRICELIST_REF ||
  path.join('O:/___Shared/To Hamzeh Jaber/project-portal/Jordan System/Reference/Pricelist demo1.xlsx');

const norm  = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const key   = (s) => norm(s).toUpperCase();
const clean = norm;

function buildModelMap() {
  const wb = XLSX.readFile(REF);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });

  // Header-driven (resilient to column shifts).
  const lc = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
  let h = rows.findIndex(r => Array.isArray(r) && r.some(c => lc(c) === 'model') && r.some(c => lc(c) === 'description'));
  if (h < 0) h = 12;
  const head = rows[h] || [];
  const colOf = (...names) => { for (const nm of names) { const i = head.findIndex(c => lc(c) === lc(nm)); if (i >= 0) return i; } return -1; };
  const C = { l1: colOf('Layer 1'), l2: colOf('Layer 2'), l3: colOf('Layer 3', 'Category'), model: colOf('Model') };

  const map = new Map();
  let cl1 = null, cl2 = null, cl3 = null;
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(c => c == null || c === '')) continue;
    if (C.l1 >= 0 && r[C.l1]) cl1 = clean(r[C.l1]);
    if (C.l2 >= 0 && r[C.l2]) cl2 = clean(r[C.l2]);
    if (C.l3 >= 0 && r[C.l3]) cl3 = clean(r[C.l3]);
    const model = r[C.model];
    if (!model) continue;
    map.set(key(model), { l1: cl1 || null, l2: cl2 || null, l3: cl3 || null });
  }
  return map;
}

function run() {
  const map = buildModelMap();
  const skus = db.prepare('SELECT id, model, category FROM product_skus').all();
  const upd = db.prepare(`
    UPDATE product_skus
       SET category_l1 = ?, category_l2 = ?, category_l3 = ?, category = ?, updated_at = datetime('now')
     WHERE id = ?
  `);

  let updated = 0; const unmatched = [];
  db.exec('BEGIN');
  try {
    for (const s of skus) {
      const m = map.get(key(s.model));
      if (!m) { unmatched.push(s.model); continue; }
      const single = m.l3 || m.l2 || m.l1 || s.category || '(uncategorized)';
      upd.run(m.l1, m.l2, m.l3, single, s.id);
      updated++;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  console.log(`Reference models: ${map.size}`);
  console.log(`SKUs in DB: ${skus.length}`);
  console.log(`Backfilled: ${updated}`);
  console.log(`Unmatched (left as-is): ${unmatched.length}`);
  unmatched.slice(0, 20).forEach(m => console.log('   -', JSON.stringify(m)));
}

run();
