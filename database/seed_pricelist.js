// Parses `Reference/Pricelist demo1.xlsx` into a product_skus seed.
// Idempotent: creates a new pricelist_versions row each run, marks it active,
// deactivates older active rows for the same brand, and replaces product_skus
// pointing at this brand's previous version.
//
// Usage: node database/seed_pricelist.js [path/to/pricelist.xlsx]

require('dotenv').config();
const XLSX = require('xlsx');
const path = require('path');
const fs   = require('fs');
const db   = require('./db');

const PRICELIST_PATH = process.argv[2]
  || path.resolve(__dirname, '..', '..', 'Jordan System', 'Reference', 'Pricelist demo1.xlsx');

if (!fs.existsSync(PRICELIST_PATH)) {
  console.error(`Pricelist file not found: ${PRICELIST_PATH}`);
  process.exit(1);
}

const BRAND = 'Gree';
const SHEET = 'GMV6-Inc.';
const BOOK  = 'GMV6 Inc.';

console.log(`📥  Loading ${PRICELIST_PATH}`);
const wb = XLSX.readFile(PRICELIST_PATH);
if (!wb.SheetNames.includes(SHEET)) {
  console.error(`Sheet "${SHEET}" not found. Available: ${wb.SheetNames.join(', ')}`);
  process.exit(1);
}
const rows = XLSX.utils.sheet_to_json(wb.Sheets[SHEET], { header: 1, defval: null });

// Top-of-sheet global rates (rows 0-5, col 2 has the numeric value).
const rate = (r) => Number(rows[r] && rows[r][2]) || 0;
const globalRates = {
  mfg_discount_pct:   rate(0),
  usd_to_jod:         rate(1),
  shipping_pct:       rate(2),
  customs_duties_pct: rate(3),
  extra_multi_pct:    rate(4),
  sales_tax_pct:      rate(5),
};
console.log('🔧  Global rates:', globalRates);

// Find an admin user to attribute the seed upload to.
const adminId = db.prepare(`
  SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
  WHERE r.name = 'admin' ORDER BY u.id LIMIT 1
`).get()?.id || null;

// Resolve brand + book ids (auto-created by schema migration).
const brandRow = db.prepare(`SELECT id FROM brands WHERE name = ?`).get(BRAND);
const bookRow  = db.prepare(`SELECT id FROM price_books WHERE name = ? AND brand_id = ?`).get(BOOK, brandRow.id);
const bookId   = bookRow.id;

// Deactivate prior versions for this book + wipe SKUs.
db.prepare(`UPDATE pricelist_versions SET is_active = 0 WHERE price_book_id = ?`).run(bookId);
const insertVersion = db.prepare(`
  INSERT INTO pricelist_versions
    (uploaded_by, source_filename, brand, price_book_id,
     mfg_discount_pct, usd_to_jod, shipping_pct, customs_duties_pct, extra_multi_pct, sales_tax_pct,
     is_active, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
`);
const versionInfo = insertVersion.run(
  adminId, path.basename(PRICELIST_PATH), BRAND, bookId,
  globalRates.mfg_discount_pct, globalRates.usd_to_jod, globalRates.shipping_pct,
  globalRates.customs_duties_pct, globalRates.extra_multi_pct, globalRates.sales_tax_pct,
  `Auto-seeded into book "${BOOK}" from ${path.basename(PRICELIST_PATH)}`
);
const versionId = versionInfo.lastInsertRowid;

// Wipe SKUs for this book.
db.prepare(`DELETE FROM product_skus WHERE price_book_id = ?`).run(bookId);

// Column map (verified against the demo file):
//   0 Category | 1 ERP | 2 Model | 3 Description | 4 FOB$ | 5 FOBNet$ |
//   6 InJOD    | 7 +Ship | 8 +Duty | 9 +ExtraM | 10 +Tax(=Cost) |
//   11 NS@25 | 12 GP@25 | 13 NS@30 | 14 GP@30 | 15 NS@35 | 16 GP@35 | 17 NS@40 | 18 GP@40 |
//   19 ListPrice
const DATA_START = 13;
const cleanCat = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const insertSku = db.prepare(`
  INSERT INTO product_skus
    (pricelist_version_id, price_book_id, brand, category, erp_code, model, description, unit,
     fob_price_usd, fob_net_usd, fob_net_jod, cost_with_shipping, cost_with_customs,
     cost_with_extra_multi, cost_jod, list_price,
     max_se_discount_pct, max_mgr_discount_pct)
  VALUES (?, ?, ?, ?, ?, ?, ?, 'pc', ?, ?, ?, ?, ?, ?, ?, ?, 0.25, 0.40)
`);

let curCategory = null;
let inserted = 0, skipped = 0;
for (let i = DATA_START; i < rows.length; i++) {
  const r = rows[i];
  if (!r || r.every(c => c == null || c === '')) continue;
  if (r[0]) curCategory = cleanCat(r[0]);
  const model = r[2];
  const listPrice = num(r[19]);
  if (!model || !listPrice) { skipped++; continue; }

  insertSku.run(
    versionId, bookId, BRAND, curCategory || '(uncategorized)', r[1] || null, model, r[3] || null,
    num(r[4]), num(r[5]), num(r[6]), num(r[7]), num(r[8]), num(r[9]), num(r[10]),
    listPrice
  );
  inserted++;
}

console.log(`✅  Pricelist version ${versionId} created for ${BRAND}.`);
console.log(`    SKUs inserted: ${inserted}   skipped: ${skipped}`);
console.log(`    Distinct categories: ${db.prepare(`SELECT COUNT(DISTINCT category) c FROM product_skus WHERE brand=?`).get(BRAND).c}`);
