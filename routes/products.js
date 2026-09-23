// Product Management routes — SKU catalogue + pricelist version upload.
// Cost columns are PM-only (filtered server-side based on users.can_view_costs).

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const XLSX    = require('xlsx');
const db      = require('../database/db');
const demoAuth = require('../middleware/demoAuth');
const pricing = require('../utils/pricing');

const router = express.Router();
router.use(demoAuth);

const COST_COLS = [
  'fob_price_usd', 'fob_net_usd', 'fob_net_jod',
  'cost_with_shipping', 'cost_with_customs', 'cost_with_extra_multi',
  'cost_jod',
  // GREE module cost tiers (also PM-only)
  'cost_inclusive', 'cost_stax_exempt', 'cost_exempted',
];

// ── GREE pricing engine helpers ─────────────────────────────────────────────
// Load all pricing_params into { globals, byCategory }. Category params are keyed
// by the suffix after the last '_' in the code (SHIP/CUST/EXTRA/TAX/COPPER/INSTALL/T1..T4).
const _catKey = (s) => String(s == null ? '' : s).trim().toLowerCase();
function loadPricingParams() {
  const rows = db.prepare('SELECT category, code, value FROM pricing_params').all();
  const raw = {}; const byCategory = {};
  for (const r of rows) {
    if (_catKey(r.category) === 'global') { raw[r.code] = r.value; continue; }
    const key = String(r.code).split('_').pop();
    // Key categories case-insensitively — the Parameters sheet uses "U-MATCH PROJECTS"
    // while Item Master uses "U-Match Projects".
    (byCategory[_catKey(r.category)] = byCategory[_catKey(r.category)] || {})[key] = r.value;
  }
  return {
    globals: { fx: raw.FX_USD_JOD, roundStep: raw.ROUND_STEP, staxDiv: raw.STAX_DIV, custDiv: raw.CUST_DIV },
    byCategory,
  };
}
// A category's engine params + its discount tiers (fractions, in order).
function catParamsFor(byCategory, category) {
  const p = byCategory[_catKey(category)] || {};
  return {
    params: { ship: p.SHIP, cust: p.CUST, extra: p.EXTRA, tax: p.TAX, copper: p.COPPER, install: p.INSTALL },
    // All T<n> tiers in numeric order — supports adding tiers beyond T4 (T5, T6…).
    tiers: Object.keys(p).filter(k => /^T\d+$/.test(k)).sort((a, b) => +a.slice(1) - +b.slice(1)).map(k => p[k]).filter(v => v != null),
  };
}
// The core (non-deletable) rate suffixes every category must keep for the engine.
// Category codes are PREFIX_SUFFIX (one underscore); the loader keys by the suffix
// (last '_' segment), so suffixes stay single-token — TGP = target GP%, not TARGET_GP.
const CORE_PARAM_SUFFIXES = ['SHIP', 'CUST', 'EXTRA', 'TAX'];
const KNOWN_PARAM_SUFFIXES = ['SHIP', 'CUST', 'EXTRA', 'TAX', 'COPPER', 'INSTALL', 'TGP'];
const isTierSuffix = (suffix) => /^T\d+$/.test(suffix);
const suffixOf = (code) => String(code).split('_').pop();
// Recompute + store one item's costs/prices from its inputs. Mirrors cost_jod and
// list_price so all existing (non-GREE-aware) code keeps working.
function recomputeItemById(id, cache) {
  const s = db.prepare('SELECT * FROM product_skus WHERE id = ?').get(id);
  if (!s) return;
  const pp = cache || loadPricingParams();
  const { params } = catParamsFor(pp.byCategory, s.category_l1);
  const costs  = pricing.computeCosts(s.fob_net_usd, params, pp.globals);
  const prices = pricing.computePrices(s.price1_inclusive, pp.globals);
  const listPrice = s.price1_inclusive != null ? s.price1_inclusive : (s.list_price != null ? s.list_price : 0);
  db.prepare(`UPDATE product_skus SET
      cost_inclusive=?, cost_stax_exempt=?, cost_exempted=?,
      price2_stax_exempt=?, price3_exempted=?, cost_jod=?, list_price=?, updated_at=datetime('now')
    WHERE id=?`).run(
      costs.cost_inclusive, costs.cost_stax_exempt, costs.cost_exempted,
      prices.price2_stax_exempt, prices.price3_exempted, costs.cost_inclusive, listPrice, id);
}
// Recompute every item that has pricing inputs (e.g. after a parameter change).
function recomputeAll() {
  const pp = loadPricingParams();
  // Only GREE pricing-module items (they carry an item_id). Never touch legacy
  // SKUs whose category has no parameters — that would zero their cost.
  const ids = db.prepare('SELECT id FROM product_skus WHERE item_id IS NOT NULL').all();
  db.exec('BEGIN');
  try { for (const { id } of ids) recomputeItemById(id, pp); db.exec('COMMIT'); }
  catch (e) { db.exec('ROLLBACK'); throw e; }
  return ids.length;
}
// Attach GP@list + GP@tiers to a SKU row (for cost-viewers), using its category tiers.
function withGP(row, pp) {
  const { tiers } = catParamsFor(pp.byCategory, row.category_l1);
  const gp = pricing.computeGP(row.price1_inclusive != null ? row.price1_inclusive : row.list_price, row.cost_inclusive != null ? row.cost_inclusive : row.cost_jod, tiers);
  return { ...row, gp_list: gp.gp_list, gp_tiers: gp.gp_tiers };
}

function canViewCosts(user) {
  return user && (user.can_view_costs === 1 || user.role === 'admin' || user.role === 'product_manager');
}

function stripCosts(row) {
  if (!row) return row;
  const out = { ...row };
  for (const k of COST_COLS) delete out[k];
  return out;
}

// Customer-facing quotation sections (from the Excel "General" sheet). This is
// SEPARATE from the pricing category (category_l1): the pricing category drives
// cost; the quote section decides how items are grouped in the client quote.
const QUOTE_SECTIONS = ['VRF System', 'Split System', 'Ducted', 'FCU', 'CCU', 'AHU', 'Chiller', 'Package', 'Heat Pump', 'Copper', 'Installation'];
// Auto-derive a quote section from what we know when the uploader leaves it blank.
function deriveQuoteSection(sku) {
  const cat = String(sku.category_l1 || '').toLowerCase();
  const txt = [sku.section, sku.category_l2, sku.model, sku.description].map(x => String(x || '').toLowerCase()).join(' ');
  if (/chiller/.test(txt)) return 'Chiller';
  if (/\bahu\b|air handling/.test(txt)) return 'AHU';
  if (/package/.test(txt)) return 'Package';
  if (/copper/.test(txt)) return 'Copper';
  if (/install/.test(txt)) return 'Installation';
  if (/heat ?pump/.test(txt)) return 'Heat Pump';
  if (cat.includes('gmv')) return 'VRF System';               // GMV = GREE VRF (all indoor/outdoor)
  if (cat.includes('fcu')) return 'FCU';
  if (cat.includes('ccu')) return 'CCU';
  if (cat.includes('u-match') || cat.includes('umatch') || cat.includes('u match'))
    return /\bduct/.test(txt) ? 'Ducted' : 'Split System';
  if (/\bduct/.test(txt)) return 'Ducted';
  return null;   // leave blank → falls back to the item's own category at quote time
}

function requirePM(req, res, next) {
  if (req.user.role === 'admin' || req.user.role === 'product_manager') return next();
  return res.status(403).json({ error: 'Product Management permission required.' });
}

// ── Brands ────────────────────────────────────────────────────────────────
router.get('/brands', (req, res) => {
  res.json(db.prepare(`SELECT id, name, description, active FROM brands WHERE active = 1 ORDER BY name`).all());
});
router.post('/brands', requirePM, (req, res) => {
  const { name, description } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required.' });
  try {
    const info = db.prepare(`INSERT INTO brands (name, description) VALUES (?, ?)`).run(name.trim(), description || null);
    res.status(201).json({ id: info.lastInsertRowid, name: name.trim(), description: description || null, active: 1 });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Price Books ───────────────────────────────────────────────────────────
router.get('/price-books', (req, res) => {
  const { brand_id } = req.query;
  const rows = brand_id
    ? db.prepare(`SELECT pb.*, b.name AS brand_name, (SELECT COUNT(*) FROM product_skus s WHERE s.price_book_id = pb.id AND s.active=1) AS sku_count FROM price_books pb JOIN brands b ON b.id = pb.brand_id WHERE pb.brand_id = ? AND pb.active = 1 ORDER BY pb.name`).all(+brand_id)
    : db.prepare(`SELECT pb.*, b.name AS brand_name, (SELECT COUNT(*) FROM product_skus s WHERE s.price_book_id = pb.id AND s.active=1) AS sku_count FROM price_books pb JOIN brands b ON b.id = pb.brand_id WHERE pb.active = 1 ORDER BY b.name, pb.name`).all();
  res.json(rows);
});
router.post('/price-books', requirePM, (req, res) => {
  const { brand_id, name, description } = req.body || {};
  if (!brand_id || !name) return res.status(400).json({ error: 'brand_id and name required.' });
  try {
    const info = db.prepare(`INSERT INTO price_books (brand_id, name, description, created_by) VALUES (?, ?, ?, ?)`)
      .run(+brand_id, name.trim(), description || null, req.user.id);
    res.status(201).json({ id: info.lastInsertRowid, brand_id: +brand_id, name: name.trim(), description: description || null, active: 1 });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
router.get('/price-books/:id/versions', requirePM, (req, res) => {
  const rows = db.prepare(`
    SELECT pv.*, u.name AS uploaded_by_name,
           (SELECT COUNT(*) FROM product_skus s WHERE s.pricelist_version_id = pv.id) AS sku_count
    FROM pricelist_versions pv
    LEFT JOIN users u ON u.id = pv.uploaded_by
    WHERE pv.price_book_id = ?
    ORDER BY pv.id DESC
  `).all(+req.params.id);
  res.json(rows);
});

// ── GET /api/product-skus/categories
// Returns distinct categories for a brand (defaults to all). Open to anyone
// who can see SKUs — designers need this for the picker.
router.get('/product-skus/categories', (req, res) => {
  const { brand, price_book_id } = req.query;
  const clauses = ['active=1'];
  const params = [];
  if (brand)         { clauses.push('brand = ?');         params.push(brand); }
  if (price_book_id) { clauses.push('price_book_id = ?'); params.push(+price_book_id); }
  const rows = db.prepare(`SELECT DISTINCT category FROM product_skus WHERE ${clauses.join(' AND ')} ORDER BY category`).all(...params);
  res.json(rows.map(r => r.category));
});

// ── GET /api/product-skus/category-tree
// Returns the 3-layer hierarchy for a book: [{ l1, groups: [{ l2, families:[l3] }] }].
// Drives the cascading group → family → model pickers.
router.get('/product-skus/category-tree', (req, res) => {
  const { brand, price_book_id } = req.query;
  const clauses = ['active=1'];
  const params = [];
  if (brand)         { clauses.push('brand = ?');         params.push(brand); }
  if (price_book_id) { clauses.push('price_book_id = ?'); params.push(+price_book_id); }
  const rows = db.prepare(`
    SELECT DISTINCT category_l1 AS l1, category_l2 AS l2, category_l3 AS l3
    FROM product_skus WHERE ${clauses.join(' AND ')}
    ORDER BY category_l1, category_l2, category_l3
  `).all(...params);
  // Nest into l1 → l2 → [l3]
  const tree = [];
  for (const r of rows) {
    const l1 = r.l1 || 'Other';
    const l2 = r.l2 || 'Other';
    let t1 = tree.find(t => t.l1 === l1); if (!t1) { t1 = { l1, groups: [] }; tree.push(t1); }
    let g = t1.groups.find(g => g.l2 === l2); if (!g) { g = { l2, families: [] }; t1.groups.push(g); }
    if (r.l3 && !g.families.includes(r.l3)) g.families.push(r.l3);
  }
  res.json(tree);
});

// ── GET /api/product-skus
// Filter by category (back-compat = Layer 3) or by layer columns. Cost columns
// are stripped unless caller has costs.view.
router.get('/product-skus', (req, res) => {
  const { category, category_l1, category_l2, category_l3, quote_section, brand, search, price_book_id } = req.query;
  const clauses = ['active=1'];
  const params  = [];
  if (price_book_id) { clauses.push('price_book_id = ?'); params.push(+price_book_id); }
  if (brand)        { clauses.push('brand = ?');         params.push(brand); }
  if (category)     { clauses.push('category = ?');      params.push(category); }
  if (category_l1)  { clauses.push('category_l1 = ?');   params.push(category_l1); }
  if (category_l2)  { clauses.push('category_l2 = ?');   params.push(category_l2); }
  if (category_l3)  { clauses.push('category_l3 = ?');   params.push(category_l3); }
  if (quote_section){ clauses.push('quote_section = ?'); params.push(quote_section); }  // designer's fast finder
  if (search)   { clauses.push('(model LIKE ? OR description LIKE ? OR erp_code LIKE ? OR item_id LIKE ?)');
                  params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`); }
  const rows = db.prepare(
    `SELECT * FROM product_skus WHERE ${clauses.join(' AND ')} ORDER BY category_l2, category_l3, model LIMIT 500`
  ).all(...params);
  if (!canViewCosts(req.user)) return res.json(rows.map(stripCosts));
  const pp = loadPricingParams();
  res.json(rows.map(r => withGP(r, pp)));
});

// ── One SKU row → an export cell object. Column names match the importer's
// header map so an exported sheet re-imports cleanly. Cost columns only for PMs.
function skuToRow(s, withCosts) {
  const row = {
    'Layer 1': s.category_l1 || '', 'Layer 2': s.category_l2 || '', 'Layer 3': s.category_l3 || s.category || '',
    'ERP Code': s.erp_code || '', 'Model': s.model || '', 'Description': s.description || '',
    'Unit': s.unit || 'pc', 'Net Selling': s.list_price,
  };
  if (withCosts) Object.assign(row, {
    'FOB Price': s.fob_price_usd, 'FOB Net Price': s.fob_net_usd, 'USD to JOD': s.fob_net_jod,
    'Shipping': s.cost_with_shipping, 'Custom Duties': s.cost_with_customs,
    'Extra Multi': s.cost_with_extra_multi, 'Sales Tax': s.cost_jod,
  });
  return row;
}

// ── GET /api/product-skus/export  — SKUs as .xlsx (no 500 cap; optional ?ids= for selected)
// Declared before /product-skus/:id so "export" isn't parsed as an id.
router.get('/product-skus/export', (req, res) => {
  const { category_l1, category_l2, category_l3, brand, search, price_book_id, ids } = req.query;
  const clauses = ['active = 1']; const params = [];
  if (price_book_id) { clauses.push('price_book_id = ?'); params.push(+price_book_id); }
  if (brand)        { clauses.push('brand = ?');        params.push(brand); }
  if (category_l1)  { clauses.push('category_l1 = ?');  params.push(category_l1); }
  if (category_l2)  { clauses.push('category_l2 = ?');  params.push(category_l2); }
  if (category_l3)  { clauses.push('category_l3 = ?');  params.push(category_l3); }
  if (search)       { clauses.push('(model LIKE ? OR description LIKE ? OR erp_code LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (ids) { const list = String(ids).split(',').map(n => +n).filter(Boolean); if (list.length) { clauses.push(`id IN (${list.map(() => '?').join(',')})`); params.push(...list); } }
  const rows = db.prepare(`SELECT * FROM product_skus WHERE ${clauses.join(' AND ')} ORDER BY category_l2, category_l3, model`).all(...params);
  const withCosts = canViewCosts(req.user);
  const ws = XLSX.utils.json_to_sheet(rows.map(s => skuToRow(s, withCosts)));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pricelist');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="pricelist-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.send(buf);
});

// ── POST /api/product-skus/bulk-deactivate  { ids:[] }  — soft-retire many at once
router.post('/product-skus/bulk-deactivate', requirePM, (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(n => +n).filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ error: 'No SKUs selected.' });
  db.exec('BEGIN');
  try {
    const upd = db.prepare(`UPDATE product_skus SET active = 0, updated_at = datetime('now') WHERE id = ? AND active = 1`);
    let n = 0; for (const id of ids) n += upd.run(id).changes;
    db.exec('COMMIT');
    res.json({ ok: true, deactivated: n });
  } catch (e) { db.exec('ROLLBACK'); res.status(500).json({ error: e.message }); }
});

// ── PUT /api/product-skus/bulk  { ids:[], patch:{category_l2,category_l3,unit}, priceAdjustPct, setPrice }
// Mass edit. Declared before /product-skus/:id so "bulk" isn't parsed as an id.
router.put('/product-skus/bulk', requirePM, (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(n => +n).filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ error: 'No SKUs selected.' });
  const { patch = {}, priceAdjustPct, setPrice } = req.body;
  db.exec('BEGIN');
  try {
    let n = 0;
    for (const id of ids) {
      const s = db.prepare('SELECT * FROM product_skus WHERE id = ? AND active = 1').get(id);
      if (!s) continue;
      const sets = []; const params = [];
      if (patch.category_l2 != null && patch.category_l2 !== '') { sets.push('category_l2 = ?'); params.push(String(patch.category_l2)); }
      if (patch.category_l3 != null && patch.category_l3 !== '') { sets.push('category_l3 = ?', 'category = ?'); params.push(String(patch.category_l3), String(patch.category_l3)); }
      if (patch.unit != null && patch.unit !== '') { sets.push('unit = ?'); params.push(String(patch.unit)); }
      if (setPrice != null && setPrice !== '') { sets.push('list_price = ?'); params.push(Number(setPrice) || 0); }
      else if (priceAdjustPct != null && priceAdjustPct !== '' && Number(priceAdjustPct) !== 0) {
        const factor = 1 + Number(priceAdjustPct) / 100;
        sets.push('list_price = ?'); params.push(Math.round(s.list_price * factor * 1000) / 1000);
      }
      if (!sets.length) continue;
      sets.push(`updated_at = datetime('now')`); params.push(id);
      db.prepare(`UPDATE product_skus SET ${sets.join(', ')} WHERE id = ?`).run(...params);
      n++;
    }
    db.exec('COMMIT');
    res.json({ ok: true, updated: n });
  } catch (e) { db.exec('ROLLBACK'); res.status(500).json({ error: e.message }); }
});

// ── POST /api/product-skus/bulk-price-from-gp  { ids:[], target_gp }
// Group pricing: set Price 1 for every selected GREE item so it hits the target
// GP% at list, then recompute. Items without a cost are skipped and reported.
router.post('/product-skus/bulk-price-from-gp', requirePM, (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(n => +n).filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ error: 'No SKUs selected.' });
  const targetGP = Number(req.body.target_gp);
  if (!Number.isFinite(targetGP) || targetGP < 0 || targetGP >= 1)
    return res.status(400).json({ error: 'target_gp must be a fraction between 0 and 1 (e.g. 0.45).' });
  const pp = loadPricingParams();
  db.exec('BEGIN');
  try {
    let updated = 0, skipped = 0;
    for (const id of ids) {
      const s = db.prepare('SELECT id, cost_inclusive, item_id, active FROM product_skus WHERE id = ? AND active = 1').get(id);
      if (!s || s.item_id == null || !(Number(s.cost_inclusive) > 0)) { skipped++; continue; }
      const p1 = pricing.suggestPrice1(s.cost_inclusive, targetGP, pp.globals);
      db.prepare(`UPDATE product_skus SET price1_inclusive = ?, updated_at = datetime('now') WHERE id = ?`).run(p1, id);
      recomputeItemById(id, pp);
      updated++;
    }
    db.exec('COMMIT');
    res.json({ ok: true, updated, skipped_no_cost: skipped, target_gp: targetGP });
  } catch (e) { db.exec('ROLLBACK'); res.status(500).json({ error: e.message }); }
});

// ── GET /api/product-skus/:id/usage
// Quotations that reference this SKU, so the PM can see what's affected before
// (or after) retiring it. Active deals are flagged so they stand out.
router.get('/product-skus/:id/usage', (req, res) => {
  const rows = db.prepare(`
    SELECT qv.id AS quotation_id, qv.version_number, qv.reference, qv.review_status,
           o.id AS opportunity_id, o.title AS opp_title, o.status AS opp_status, o.stage AS opp_stage
    FROM quotation_line_items li
    JOIN quotation_versions qv ON qv.id = li.quotation_version_id
    JOIN design_requests dr    ON dr.id = qv.request_id
    JOIN opportunities o       ON o.id = dr.opportunity_id
    WHERE li.sku_id = ?
    ORDER BY (o.status = 'Active') DESC, qv.id DESC
  `).all(+req.params.id);
  const active = rows.filter(r => r.opp_status === 'Active');
  res.json({ total: rows.length, active_count: active.length, active, all: rows });
});

// ── GET /api/product-skus/:id
router.get('/product-skus/:id', (req, res) => {
  const row = db.prepare(`SELECT * FROM product_skus WHERE id = ?`).get(+req.params.id);
  if (!row) return res.status(404).json({ error: 'SKU not found.' });
  res.json(canViewCosts(req.user) ? row : stripCosts(row));
});

// ── GET /api/pricelist-versions
// PM-only list of all uploads (active flag, rates, who, when).
router.get('/pricelist-versions', requirePM, (req, res) => {
  const rows = db.prepare(`
    SELECT pv.*, u.name AS uploaded_by_name,
           (SELECT COUNT(*) FROM product_skus s WHERE s.pricelist_version_id = pv.id) AS sku_count
    FROM pricelist_versions pv
    LEFT JOIN users u ON u.id = pv.uploaded_by
    ORDER BY pv.id DESC
  `).all();
  res.json(rows);
});

// ── POST /api/pricelist-versions/upload
// Multipart upload of an Excel pricelist. Parses the GMV6-Inc.-style sheet,
// creates a new pricelist_versions row, replaces product_skus for that brand.
const uploadsDir = path.join(process.env.UPLOADS_PATH || './uploads', 'pricelists');
fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^\w.-]+/g, '_')}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

router.post('/pricelist-versions/upload', requirePM, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded (expecting form field "file").' });
  const priceBookId = req.body.price_book_id ? +req.body.price_book_id : null;
  if (!priceBookId) return res.status(400).json({ error: 'price_book_id required (pick a book to upload into).' });
  const book = db.prepare(`SELECT pb.id, pb.name, b.name AS brand_name FROM price_books pb JOIN brands b ON b.id = pb.brand_id WHERE pb.id = ?`).get(priceBookId);
  if (!book) return res.status(400).json({ error: 'Price book not found.' });
  const brand = book.brand_name;
  const sheetName = (req.body.sheet || null);
  // 'merge' (default) upserts by model and never removes; 'replace' wipes the book first.
  const mode = (String(req.body.mode || '').toLowerCase() === 'replace') ? 'replace' : 'merge';

  let wb;
  try { wb = XLSX.readFile(req.file.path); }
  catch (e) { return res.status(400).json({ error: `Could not read Excel: ${e.message}` }); }

  const sheet = sheetName && wb.SheetNames.includes(sheetName) ? sheetName : wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: null });

  // ── Rates block (top-left): each of the first rows has a label + a value.
  // Column-position-independent: take the first numeric cell in the row.
  const firstNum = (r) => { const row = rows[r] || []; for (const c of row) { const n = Number(c); if (c != null && c !== '' && Number.isFinite(n)) return n; } return 0; };
  const globals = {
    mfg_discount_pct: firstNum(0), usd_to_jod: firstNum(1), shipping_pct: firstNum(2),
    customs_duties_pct: firstNum(3), extra_multi_pct: firstNum(4), sales_tax_pct: firstNum(5),
  };

  // ── Header-driven column map. Find the header row (the one with Model +
  // Description) and resolve every column by NAME, so the parser is resilient
  // to layout shifts (e.g. the 2 extra category layers added in 2026-05).
  const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
  let headerRowIdx = rows.findIndex(r => Array.isArray(r) && r.some(c => norm(c) === 'model') && r.some(c => norm(c) === 'description'));
  if (headerRowIdx < 0) headerRowIdx = 12; // fallback to the known position
  const headerCells = rows[headerRowIdx] || [];
  const colOf = (...names) => { for (const nm of names) { const i = headerCells.findIndex(c => norm(c) === norm(nm)); if (i >= 0) return i; } return -1; };
  const COL = {
    l1:   colOf('Layer 1'),
    l2:   colOf('Layer 2'),
    l3:   colOf('Layer 3', 'Category'),     // old sheets used a single "Category"
    erp:  colOf('ERP Code'),
    model: colOf('Model'),
    desc:  colOf('Description'),
    fob_price_usd:         colOf('FOB Price'),
    fob_net_usd:           colOf('FOB Net Price'),
    fob_net_jod:           colOf('USD to JOD'),
    cost_with_shipping:    colOf('Shipping'),
    cost_with_customs:     colOf('Custom Duties'),
    cost_with_extra_multi: colOf('Extra Multi 5%', 'Extra Multi'),
    cost_jod:              colOf('Sales Tax'),
    list_price:            colOf('Net Selling'),  // first "Net Selling" = list/selling price
  };

  db.exec('BEGIN');
  try {
    // Deactivate prior versions for THIS book (not the whole brand — each book
    // is independent so a Gree GMV6 upload shouldn't touch a Gree GMV X book).
    db.prepare(`UPDATE pricelist_versions SET is_active = 0 WHERE price_book_id = ?`).run(priceBookId);
    const verInfo = db.prepare(`
      INSERT INTO pricelist_versions
        (uploaded_by, source_filename, brand, price_book_id,
         mfg_discount_pct, usd_to_jod, shipping_pct, customs_duties_pct, extra_multi_pct, sales_tax_pct,
         is_active, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      req.user.id, req.file.originalname, brand, priceBookId,
      globals.mfg_discount_pct, globals.usd_to_jod, globals.shipping_pct,
      globals.customs_duties_pct, globals.extra_multi_pct, globals.sales_tax_pct,
      `Uploaded into book "${book.name}" · sheet "${sheet}"`
    );
    const versionId = verInfo.lastInsertRowid;

    const insert = db.prepare(`
      INSERT INTO product_skus
        (pricelist_version_id, price_book_id, brand,
         category, category_l1, category_l2, category_l3,
         erp_code, model, description, unit,
         fob_price_usd, fob_net_usd, fob_net_jod, cost_with_shipping, cost_with_customs,
         cost_with_extra_multi, cost_jod, list_price,
         max_se_discount_pct, max_mgr_discount_pct)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pc', ?, ?, ?, ?, ?, ?, ?, ?, 0.25, 0.40)
    `);
    const cleanCat = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const num = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
    const cell = (r, idx) => (idx >= 0 ? r[idx] : null);

    // Parse every data row into a plain object first (mode-independent).
    // Category layers use fill-down (a blank cell inherits the value above).
    let cl1 = null, cl2 = null, cl3 = null, skipped = 0;
    const parsedRows = [];
    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.every(c => c == null || c === '')) continue;
      if (cell(r, COL.l1)) cl1 = cleanCat(cell(r, COL.l1));
      if (cell(r, COL.l2)) cl2 = cleanCat(cell(r, COL.l2));
      if (cell(r, COL.l3)) cl3 = cleanCat(cell(r, COL.l3));
      const model = cell(r, COL.model);
      const listPrice = num(cell(r, COL.list_price));
      if (!model || !listPrice) { skipped++; continue; }
      parsedRows.push({
        cat: cl3 || cl2 || cl1 || '(uncategorized)', cl1: cl1 || null, cl2: cl2 || null, cl3: cl3 || null,
        erp: cleanCat(cell(r, COL.erp)) || null, model: cleanCat(model), desc: cell(r, COL.desc) || null,
        fob_price_usd: num(cell(r, COL.fob_price_usd)), fob_net_usd: num(cell(r, COL.fob_net_usd)),
        fob_net_jod: num(cell(r, COL.fob_net_jod)), cost_with_shipping: num(cell(r, COL.cost_with_shipping)),
        cost_with_customs: num(cell(r, COL.cost_with_customs)), cost_with_extra_multi: num(cell(r, COL.cost_with_extra_multi)),
        cost_jod: num(cell(r, COL.cost_jod)), list_price: listPrice,
      });
    }

    let inserted = 0, updated = 0, retired = 0;
    if (mode === 'replace') {
      // Replace = retire everything in the book (soft), then insert the sheet.
      retired = db.prepare(`UPDATE product_skus SET active = 0, updated_at = datetime('now') WHERE price_book_id = ? AND active = 1`).run(priceBookId).changes;
      for (const p of parsedRows) {
        insert.run(versionId, priceBookId, brand, p.cat, p.cl1, p.cl2, p.cl3, p.erp, p.model, p.desc,
          p.fob_price_usd, p.fob_net_usd, p.fob_net_jod, p.cost_with_shipping, p.cost_with_customs,
          p.cost_with_extra_multi, p.cost_jod, p.list_price);
        inserted++;
      }
    } else {
      // Merge = upsert by model. Update matching active SKUs, insert new ones,
      // leave everything else untouched (nothing retired).
      // Match trim/case-insensitively so legacy rows with stray leading/trailing
      // spaces in `model` still upsert instead of spawning a near-duplicate.
      const findActive = db.prepare(`SELECT id FROM product_skus WHERE price_book_id = ? AND active = 1 AND lower(trim(model)) = lower(trim(?)) LIMIT 1`);
      const updateStmt = db.prepare(`UPDATE product_skus SET pricelist_version_id=?, category=?, category_l1=?, category_l2=?, category_l3=?, erp_code=?, description=?, fob_price_usd=?, fob_net_usd=?, fob_net_jod=?, cost_with_shipping=?, cost_with_customs=?, cost_with_extra_multi=?, cost_jod=?, list_price=?, updated_at=datetime('now') WHERE id=?`);
      for (const p of parsedRows) {
        const ex = findActive.get(priceBookId, p.model);
        if (ex) {
          updateStmt.run(versionId, p.cat, p.cl1, p.cl2, p.cl3, p.erp, p.desc,
            p.fob_price_usd, p.fob_net_usd, p.fob_net_jod, p.cost_with_shipping, p.cost_with_customs,
            p.cost_with_extra_multi, p.cost_jod, p.list_price, ex.id);
          updated++;
        } else {
          insert.run(versionId, priceBookId, brand, p.cat, p.cl1, p.cl2, p.cl3, p.erp, p.model, p.desc,
            p.fob_price_usd, p.fob_net_usd, p.fob_net_jod, p.cost_with_shipping, p.cost_with_customs,
            p.cost_with_extra_multi, p.cost_jod, p.list_price);
          inserted++;
        }
      }
    }
    // How many of the just-retired SKUs are still referenced by quotations on
    // active (open) deals — so the PM knows what's affected.
    const retiredOnActiveQuotes = db.prepare(`
      SELECT COUNT(DISTINCT li.sku_id) AS n
      FROM quotation_line_items li
      JOIN product_skus s        ON s.id = li.sku_id
      JOIN quotation_versions qv ON qv.id = li.quotation_version_id
      JOIN design_requests dr    ON dr.id = qv.request_id
      JOIN opportunities o       ON o.id = dr.opportunity_id
      WHERE s.price_book_id = ? AND s.active = 0 AND o.status = 'Active'
    `).get(priceBookId).n;

    db.exec('COMMIT');
    res.status(201).json({ ok: true, version_id: versionId, price_book_id: priceBookId, mode, inserted, updated, skipped, retired, retired_on_active_quotes: retiredOnActiveQuotes, sheet, brand, globals });
  } catch (e) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/product-skus
// Add a single SKU to a price book without re-uploading the whole pricelist.
// PM / admin only. Stores against the active pricelist_versions row for the book
// (or creates a "manual" version if none active yet).
router.post('/product-skus', requirePM, (req, res) => {
  const { price_book_id, category_l1, category_l2, category_l3, model, description, unit, list_price, erp_code } = req.body || {};
  // A GREE item may be priced via price1_inclusive instead of list_price.
  const price1In = req.body.price1_inclusive != null && req.body.price1_inclusive !== '' ? Number(req.body.price1_inclusive) : null;
  const effList = list_price != null ? Number(list_price) : (price1In != null ? price1In : null);
  if (!price_book_id || !model || effList == null) {
    return res.status(400).json({ error: 'price_book_id, model, and a price (list_price or price1_inclusive) required.' });
  }
  const l1 = category_l1 ? String(category_l1).trim() : null;
  const l2 = category_l2 ? String(category_l2).trim() : null;
  const l3 = category_l3 ? String(category_l3).trim() : null;
  const category = l3 || l2 || l1 || (req.body.category ? String(req.body.category).trim() : null);
  const book = db.prepare(`SELECT pb.id, pb.name, b.name AS brand_name FROM price_books pb JOIN brands b ON b.id = pb.brand_id WHERE pb.id = ?`).get(+price_book_id);
  if (!book) return res.status(400).json({ error: 'Price book not found.' });

  // Reject duplicate (price_book_id, model) for active rows.
  const dupe = db.prepare(`SELECT id FROM product_skus WHERE price_book_id = ? AND model = ? AND active = 1`).get(+price_book_id, String(model).trim());
  if (dupe) return res.status(409).json({ error: `Model "${model}" already exists in this price book (id ${dupe.id}).` });

  let activeVer = db.prepare(`SELECT id FROM pricelist_versions WHERE price_book_id = ? AND is_active = 1 ORDER BY id DESC LIMIT 1`).get(+price_book_id);
  if (!activeVer) {
    const info = db.prepare(`
      INSERT INTO pricelist_versions (uploaded_by, source_filename, brand, price_book_id, is_active, notes)
      VALUES (?, 'manual', ?, ?, 1, 'Manual entries (no Excel upload).')
    `).run(req.user.id, book.brand_name, +price_book_id);
    activeVer = { id: info.lastInsertRowid };
  }

  try {
    const info = db.prepare(`
      INSERT INTO product_skus
        (pricelist_version_id, price_book_id, brand, category, category_l1, category_l2, category_l3,
         erp_code, model, description, unit,
         list_price, max_se_discount_pct, max_mgr_discount_pct, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.25, 0.40, 1)
    `).run(
      activeVer.id, +price_book_id, book.brand_name,
      (category || '(uncategorized)').toString().trim(), l1, l2, l3,
      erp_code ? String(erp_code).trim() : null,
      String(model).trim(),
      description ? String(description).trim() : null,
      unit ? String(unit).trim() : 'pc',
      effList
    );
    const newId = info.lastInsertRowid;
    // Persist GREE inputs (FOB / Price 1 / Price Iraq / item_id / section / status) and recompute.
    const b = req.body;
    if (['price1_inclusive', 'fob_net_usd', 'price_iraq', 'item_id', 'section', 'status'].some(k => b[k] !== undefined)) {
      const n = (k) => b[k] === undefined || b[k] === '' || b[k] == null ? null : Number(b[k]);
      db.prepare(`UPDATE product_skus SET item_id=?, section=?, status=?, price1_inclusive=?, fob_net_usd=?, price_iraq=? WHERE id=?`)
        .run(b.item_id || null, b.section || null, b.status || null, n('price1_inclusive'), n('fob_net_usd'), n('price_iraq'), newId);
      recomputeItemById(newId);
    }
    const row = db.prepare(`SELECT * FROM product_skus WHERE id = ?`).get(newId);
    res.status(201).json(canViewCosts(req.user) ? row : stripCosts(row));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── PUT /api/product-skus/:id
// Edit category / model / description / unit / list_price / erp_code.
// Cost columns stay read-only (those come from Excel upload).
router.put('/product-skus/:id', requirePM, (req, res) => {
  const id = +req.params.id;
  const row = db.prepare(`SELECT * FROM product_skus WHERE id = ?`).get(id);
  if (!row) return res.status(404).json({ error: 'SKU not found.' });

  const { category_l1, category_l2, category_l3, model, description, unit, list_price, erp_code } = req.body || {};
  const l1 = category_l1 != null ? (category_l1 ? String(category_l1).trim() : null) : row.category_l1;
  const l2 = category_l2 != null ? (category_l2 ? String(category_l2).trim() : null) : row.category_l2;
  const l3 = category_l3 != null ? (category_l3 ? String(category_l3).trim() : null) : row.category_l3;
  const next = {
    category:    l3 || l2 || l1 || row.category,
    model:       model       != null ? String(model).trim()       : row.model,
    description: description != null ? String(description).trim() : row.description,
    unit:        unit        != null ? String(unit).trim()        : row.unit,
    list_price:  list_price  != null ? Number(list_price)         : row.list_price,
    erp_code:    erp_code    != null ? (erp_code ? String(erp_code).trim() : null) : row.erp_code,
  };

  // Block changes that would collide with another active row.
  if (next.model !== row.model) {
    const dupe = db.prepare(`SELECT id FROM product_skus WHERE price_book_id = ? AND model = ? AND active = 1 AND id <> ?`).get(row.price_book_id, next.model, id);
    if (dupe) return res.status(409).json({ error: `Model "${next.model}" already exists in this price book.` });
  }

  db.prepare(`
    UPDATE product_skus
       SET category = ?, category_l1 = ?, category_l2 = ?, category_l3 = ?,
           model = ?, description = ?, unit = ?, list_price = ?, erp_code = ?
     WHERE id = ?
  `).run(next.category, l1, l2, l3, next.model, next.description, next.unit, next.list_price, next.erp_code, id);

  // GREE module fields: when FOB / Price 1 / Price Iraq / status are supplied, persist them
  // and recompute the cost tiers, Price 2/3 and (mirrored) list_price via the engine.
  const b = req.body || {};
  if (['price1_inclusive', 'fob_net_usd', 'price_iraq', 'status', 'section'].some(k => b[k] !== undefined)) {
    const numOrRow = (k) => b[k] === undefined ? row[k] : (b[k] === '' || b[k] == null ? null : Number(b[k]));
    const p1  = numOrRow('price1_inclusive');
    const fob = numOrRow('fob_net_usd');
    const iraq = numOrRow('price_iraq');
    const status = b.status !== undefined ? (b.status || null) : row.status;
    const section = b.section !== undefined ? (b.section || null) : row.section;
    db.prepare(`UPDATE product_skus SET price1_inclusive=?, fob_net_usd=?, price_iraq=?, status=?, section=? WHERE id=?`)
      .run(p1, fob, iraq, status, section, id);
    recomputeItemById(id);
  }

  let updated = db.prepare(`SELECT * FROM product_skus WHERE id = ?`).get(id);
  const pp = loadPricingParams();
  updated = withGP(updated, pp);
  res.json(canViewCosts(req.user) ? updated : stripCosts(updated));
});

// ── DELETE /api/product-skus/:id  → soft delete (active = 0).
// Preserves history for quotation_line_items that already reference the SKU.
router.delete('/product-skus/:id', requirePM, (req, res) => {
  const id = +req.params.id;
  const row = db.prepare(`SELECT id FROM product_skus WHERE id = ?`).get(id);
  if (!row) return res.status(404).json({ error: 'SKU not found.' });
  db.prepare(`UPDATE product_skus SET active = 0 WHERE id = ?`).run(id);
  res.json({ ok: true, id });
});

// ═══════════════════════════════════════════════════════════════════════════
// GREE PRICING MODULE — parameters, workbook import, margin check
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/pricing-params — grouped params (GLOBAL first, then categories).
router.get('/pricing-params', requirePM, (req, res) => {
  const rows = db.prepare(`SELECT id, category, code, label, value FROM pricing_params ORDER BY (category='GLOBAL') DESC, category, code`).all();
  res.json(rows);
});

// PUT /api/pricing-params  { updates: [{code, value}] }  → save + recompute all items.
router.put('/pricing-params', requirePM, (req, res) => {
  const updates = Array.isArray(req.body.updates) ? req.body.updates : [];
  if (!updates.length) return res.status(400).json({ error: 'No updates.' });
  db.exec('BEGIN');
  try {
    const upd = db.prepare(`UPDATE pricing_params SET value=?, updated_at=datetime('now'), updated_by=? WHERE code=?`);
    for (const u of updates) upd.run(Number(u.value) || 0, req.user.id, String(u.code));
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); return res.status(500).json({ error: e.message }); }
  let recomputed = 0;
  try { recomputed = recomputeAll(); } catch (e) { return res.status(500).json({ error: 'Saved, but recompute failed: ' + e.message }); }
  res.json({ ok: true, recomputed });
});

// Derive a category's code PREFIX from any existing row (codes are PREFIX_SUFFIX).
function prefixForCategory(category) {
  const row = db.prepare(`SELECT code FROM pricing_params WHERE category = ? COLLATE NOCASE LIMIT 1`).get(category);
  if (!row) return null;
  const parts = String(row.code).split('_');
  return parts.slice(0, -1).join('_') || parts[0];
}

// POST /api/pricing-params — add ONE parameter row (a tier or an adder).
// Body: { category, suffix?|code?, label?, value }. Prefix is derived from the
// category's existing rows when only a suffix is given (e.g. add tier "T5").
router.post('/pricing-params', requirePM, (req, res) => {
  const category = String(req.body.category || '').trim();
  if (!category) return res.status(400).json({ error: 'category required.' });
  let code = req.body.code ? String(req.body.code).trim().toUpperCase() : null;
  if (!code) {
    const suffix = String(req.body.suffix || '').trim().toUpperCase();
    if (!suffix) return res.status(400).json({ error: 'code or suffix required.' });
    const prefix = prefixForCategory(category);
    if (!prefix) return res.status(400).json({ error: `Unknown category "${category}" — add the category first.` });
    code = `${prefix}_${suffix}`;
  }
  if (!/^[A-Z0-9]+_[A-Z0-9]+$/.test(code)) return res.status(400).json({ error: 'code must be PREFIX_SUFFIX (letters/digits, one underscore).' });
  const suffix = suffixOf(code);
  if (!isTierSuffix(suffix) && !KNOWN_PARAM_SUFFIXES.includes(suffix))
    return res.status(400).json({ error: `Unknown suffix "${suffix}". Use T1..Tn or one of ${KNOWN_PARAM_SUFFIXES.join(', ')}.` });
  if (db.prepare(`SELECT 1 FROM pricing_params WHERE code = ?`).get(code))
    return res.status(409).json({ error: `Parameter "${code}" already exists.` });
  const label = req.body.label != null ? String(req.body.label) : (isTierSuffix(suffix) ? `Discount tier ${suffix.slice(1)}` : suffix);
  const value = Number(req.body.value) || 0;
  try {
    db.prepare(`INSERT INTO pricing_params (category, code, label, value, updated_by) VALUES (?,?,?,?,?)`).run(category, code, label, value, req.user.id);
  } catch (e) { return res.status(500).json({ error: e.message }); }
  let recomputed = 0;
  try { recomputed = recomputeAll(); } catch (e) { return res.status(500).json({ error: 'Added, but recompute failed: ' + e.message }); }
  res.status(201).json({ ok: true, code, recomputed });
});

// DELETE /api/pricing-params/:code — delete one row (a tier or adder).
// Guard: never delete GLOBAL rows or a category's core SHIP/CUST/EXTRA/TAX.
router.delete('/pricing-params/:code', requirePM, (req, res) => {
  const code = String(req.params.code).trim().toUpperCase();
  const row = db.prepare(`SELECT category, code FROM pricing_params WHERE code = ?`).get(code);
  if (!row) return res.status(404).json({ error: 'Parameter not found.' });
  if (_catKey(row.category) === 'global') return res.status(400).json({ error: 'GLOBAL parameters cannot be deleted.' });
  if (CORE_PARAM_SUFFIXES.includes(suffixOf(code))) return res.status(400).json({ error: `${suffixOf(code)} is a core rate and cannot be deleted (set it to 0 instead).` });
  db.prepare(`DELETE FROM pricing_params WHERE code = ?`).run(code);
  let recomputed = 0;
  try { recomputed = recomputeAll(); } catch (e) { return res.status(500).json({ error: 'Deleted, but recompute failed: ' + e.message }); }
  res.json({ ok: true, code, recomputed });
});

// GET /api/pricing-categories — cost categories (non-GLOBAL) with their rates,
// tiers, prefix, and how many active SKUs use each (for the Add-form + delete guard).
router.get('/pricing-categories', requirePM, (req, res) => {
  const pp = loadPricingParams();
  const out = Object.keys(pp.byCategory).map(key => {
    // Recover the display name (original casing) from a row.
    const nameRow = db.prepare(`SELECT category FROM pricing_params WHERE category = ? COLLATE NOCASE LIMIT 1`).get(key);
    const category = nameRow ? nameRow.category : key;
    const p = pp.byCategory[key];
    const { tiers } = catParamsFor(pp.byCategory, category);
    const count = db.prepare(`SELECT COUNT(*) c FROM product_skus WHERE category_l1 = ? COLLATE NOCASE AND active = 1`).get(category).c;
    return {
      category, prefix: prefixForCategory(category),
      ship: p.SHIP, cust: p.CUST, extra: p.EXTRA, tax: p.TAX,
      copper: p.COPPER, install: p.INSTALL, tgp: p.TGP, tiers, item_count: count,
    };
  }).sort((a, b) => a.category.localeCompare(b.category));
  res.json(out);
});

// POST /api/pricing-categories — add a whole cost category (its rates + tiers).
// Body: { category, code_prefix, ship, cust, extra, tax, copper?, install?, tgp?, tiers:[] }
router.post('/pricing-categories', requirePM, (req, res) => {
  const category = String(req.body.category || '').trim();
  const prefix = String(req.body.code_prefix || '').trim().toUpperCase();
  if (!category) return res.status(400).json({ error: 'category required.' });
  if (!/^[A-Z0-9]+$/.test(prefix)) return res.status(400).json({ error: 'code_prefix must be letters/digits only, no underscore (e.g. SPLIT).' });
  if (db.prepare(`SELECT 1 FROM pricing_params WHERE category = ? COLLATE NOCASE`).get(category))
    return res.status(409).json({ error: `Category "${category}" already exists.` });
  if (db.prepare(`SELECT 1 FROM pricing_params WHERE code LIKE ? ESCAPE '\\'`).get(prefix + '\\_%'))
    return res.status(409).json({ error: `Code prefix "${prefix}" is already used by another category.` });
  const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const rows = [
    ['SHIP', 'Shipping %', num(req.body.ship)],
    ['CUST', 'Custom duties %', num(req.body.cust)],
    ['EXTRA', 'Extra multi %', num(req.body.extra)],
    ['TAX', 'Sales tax %', num(req.body.tax)],
  ];
  if (req.body.copper != null && req.body.copper !== '') rows.push(['COPPER', 'Free copper pipes (JOD/set)', num(req.body.copper)]);
  if (req.body.install != null && req.body.install !== '') rows.push(['INSTALL', 'Installation (JOD/set)', num(req.body.install)]);
  if (req.body.tgp != null && req.body.tgp !== '') rows.push(['TGP', 'Default target GP %', num(req.body.tgp)]);
  const tiers = Array.isArray(req.body.tiers) ? req.body.tiers.map(Number).filter(n => Number.isFinite(n) && n >= 0 && n < 1) : [];
  tiers.forEach((t, i) => rows.push([`T${i + 1}`, `Discount tier ${i + 1}`, t]));
  db.exec('BEGIN');
  try {
    const ins = db.prepare(`INSERT INTO pricing_params (category, code, label, value, updated_by) VALUES (?,?,?,?,?)`);
    for (const [suffix, label, value] of rows) ins.run(category, `${prefix}_${suffix}`, label, value, req.user.id);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); return res.status(500).json({ error: e.message }); }
  res.status(201).json({ ok: true, category, prefix, rows: rows.length });
});

// DELETE /api/pricing-categories/:category — remove a category's params.
// Guard: refuse if active SKUs still use it (unless ?force=1).
router.delete('/pricing-categories/:category', requirePM, (req, res) => {
  const category = String(req.params.category).trim();
  if (_catKey(category) === 'global') return res.status(400).json({ error: 'GLOBAL cannot be deleted.' });
  const exists = db.prepare(`SELECT 1 FROM pricing_params WHERE category = ? COLLATE NOCASE`).get(category);
  if (!exists) return res.status(404).json({ error: 'Category not found.' });
  const inUse = db.prepare(`SELECT COUNT(*) c FROM product_skus WHERE category_l1 = ? COLLATE NOCASE AND active = 1`).get(category).c;
  if (inUse > 0 && String(req.query.force) !== '1')
    return res.status(409).json({ error: `${inUse} active item(s) still use "${category}". Reassign or retire them first, or force delete.`, in_use: inUse });
  db.prepare(`DELETE FROM pricing_params WHERE category = ? COLLATE NOCASE`).run(category);
  let recomputed = 0;
  try { recomputed = recomputeAll(); } catch (e) { return res.status(500).json({ error: 'Deleted, but recompute failed: ' + e.message }); }
  res.json({ ok: true, category, recomputed });
});

// GET /api/pricing-tiers — the discount tiers per category (for the pricelist GP table + UI).
router.get('/pricing-tiers', (req, res) => {
  const pp = loadPricingParams();
  const out = {};
  Object.keys(pp.byCategory).forEach(cat => { out[cat] = catParamsFor(pp.byCategory, cat).tiers; });
  res.json(out);
});

// GET /api/product-skus/:id/buildup — the step-by-step cost chain for one item (detail view).
router.get('/product-skus/:id/buildup', (req, res) => {
  if (!canViewCosts(req.user)) return res.status(403).json({ error: 'Cost view required.' });
  const s = db.prepare('SELECT * FROM product_skus WHERE id = ?').get(+req.params.id);
  if (!s) return res.status(404).json({ error: 'SKU not found.' });
  const pp = loadPricingParams();
  const { params, tiers } = catParamsFor(pp.byCategory, s.category_l1);
  const g = pp.globals;
  const fob = Number(s.fob_net_usd) || 0;
  const jod = pricing.r0(fob * (Number(g.fx) || 0));
  const shipped = pricing.r0(jod * (1 + (Number(params.ship) || 0)));
  const customs = pricing.r0(shipped * (1 + (Number(params.cust) || 0)));
  const extraFull = pricing.r0(customs * (1 + (Number(params.extra) || 0)));
  const taxed = pricing.r0(extraFull * (1 + (Number(params.tax) || 0)));
  const adders = (Number(params.copper) || 0) + (Number(params.install) || 0);
  const gp = pricing.computeGP(s.price1_inclusive, s.cost_inclusive, tiers);
  res.json({
    category: s.category_l1, fob_net_usd: fob, fx: g.fx, round_step: g.roundStep, params, adders,
    steps: [
      { label: 'FOB × FX → JOD', value: jod },
      { label: `+ Shipping ${(params.ship * 100 || 0)}%`, value: shipped },
      { label: `+ Customs ${(params.cust * 100 || 0)}%`, value: customs },
      { label: `+ Extra ${(params.extra * 100 || 0)}%`, value: extraFull },
      { label: `+ Sales tax ${(params.tax * 100 || 0)}%`, value: taxed },
    ],
    costs: { inclusive: s.cost_inclusive, stax_exempt: s.cost_stax_exempt, exempted: s.cost_exempted, adders },
    prices: { price1: s.price1_inclusive, price2: s.price2_stax_exempt, price3: s.price3_exempted, iraq: s.price_iraq },
    gp, tiers,
    target_gp: (pp.byCategory[_catKey(s.category_l1)] || {}).TGP,   // default GP% for this category
  });
});

// GET /api/pricing/import-template — download a clean, minimal upload template.
// The new pricelist only needs the item's identity + FOB; costs & prices are
// COMPUTED by the engine. Price 1 is optional (set later per item, or here in bulk).
router.get('/pricing/import-template', (req, res) => {
  const headers = ['Item ID', 'Model', 'Description', 'Category', 'Section', 'Quotation Section', 'FOB Net (USD)', 'Price 1 Inclusive (JOD)'];
  const example = [
    ['UMP-01', 'GMV-ND22PLS/A-T', '1-way cassette 2.2kW', 'U-Match Projects', '1-way Cassette', 'Ducted', 392, ''],
    ['UMP-02', 'GMV-ND28PLS/A-T', '1-way cassette 2.8kW', 'U-Match Projects', '1-way Cassette', '', 430, ''],
  ];
  const itemsWs = XLSX.utils.aoa_to_sheet([headers, ...example]);
  itemsWs['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 30 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 20 }];

  const help = [
    ['GREE PRICELIST — UPLOAD TEMPLATE'],
    [''],
    ['Fill the "Item Master" sheet. The system computes every cost and derived price for you.'],
    ['You only provide what is unique to each item:'],
    [''],
    ['Column', 'Required?', 'What it is'],
    ['Item ID', 'YES', 'The unique code for the item. Used to find & update it later. Keep it stable.'],
    ['Model', 'YES', 'The item name / model number shown in the pricelist.'],
    ['Description', 'optional', 'A short description.'],
    ['Category', 'YES', 'The PRICING category — drives cost (ship/customs/tax/tiers). Must match a category in Parameters (GMV, FCU, CCU, U-Match Projects…).'],
    ['Section', 'optional', 'Sub-group used to filter/find the item in the pricelist.'],
    ['Quotation Section', 'optional', 'The customer-facing section on the QUOTE (see the "Quotation Sections" list). Leave BLANK and the system auto-assigns one from the pricing category — fill it only to override.'],
    ['FOB Net (USD)', 'YES', 'The factory FOB price in USD. Everything (cost, selling price options) is built from this.'],
    ['Price 1 Inclusive (JOD)', 'optional', 'The selling price. Leave blank to set it later in the app (manually or from a target GP%).'],
    [''],
    ['Costs (Inclusive / STax-Exempt / Exempted), Price 2, Price 3 and GP% are ALL calculated — do not add them here.'],
    ['To change the rates used in the calculation, use the ⚙ Parameters button in the Pricelist page.'],
  ];
  const helpWs = XLSX.utils.aoa_to_sheet(help);
  helpWs['!cols'] = [{ wch: 26 }, { wch: 12 }, { wch: 92 }];

  // Reference lists so the uploader can copy exact values. Pricing categories are
  // exactly those that drive costing (from pricing_params, non-GLOBAL), deduped
  // case-insensitively and shown in the casing the items use (avoids "U-Match" vs
  // "U-MATCH" and legacy categories like "AC" that have no parameters).
  const paramCats = db.prepare(`SELECT DISTINCT category FROM pricing_params WHERE category <> 'GLOBAL'`).all().map(r => r.category);
  const itemCasing = new Map(db.prepare(`SELECT DISTINCT category_l1 AS c FROM product_skus WHERE category_l1 IS NOT NULL`).all().map(r => [String(r.c).toLowerCase(), r.c]));
  const seenCat = new Set();
  const cats = paramCats.sort((a, b) => a.localeCompare(b)).reduce((acc, c) => {
    const k = c.toLowerCase(); if (!seenCat.has(k)) { seenCat.add(k); acc.push(itemCasing.get(k) || c); } return acc;
  }, []);
  const lists = [['Quotation Sections (for the "Quotation Section" column)', '', 'Pricing Categories (for the "Category" column)']];
  const maxLen = Math.max(QUOTE_SECTIONS.length, cats.length);
  for (let i = 0; i < maxLen; i++) lists.push([QUOTE_SECTIONS[i] || '', '', cats[i] || '']);
  const listsWs = XLSX.utils.aoa_to_sheet(lists);
  listsWs['!cols'] = [{ wch: 44 }, { wch: 3 }, { wch: 30 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, itemsWs, 'Item Master');
  XLSX.utils.book_append_sheet(wb, helpWs, 'How to use');
  XLSX.utils.book_append_sheet(wb, listsWs, 'Lists');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="GREE-pricelist-upload-template.xlsx"');
  res.send(buf);
});

// POST /api/pricing/import — import the GREE workbook (Parameters + Item Master sheets).
const uploadsDir2 = path.join(process.env.UPLOADS_PATH || './uploads', 'pricing');
fs.mkdirSync(uploadsDir2, { recursive: true });
const pricingUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.post('/pricing/import', requirePM, pricingUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded (field "file").' });
  let wb;
  try { wb = XLSX.read(req.file.buffer, { type: 'buffer' }); }
  catch (e) { return res.status(400).json({ error: 'Could not read Excel: ' + e.message }); }
  const norm = s => String(s == null ? '' : s).trim().toLowerCase();
  const findSheet = (...names) => wb.SheetNames.find(n => names.some(x => norm(n).includes(norm(x))));
  const paramSheet = findSheet('parameters');
  const itemSheet = findSheet('item master', 'items');
  if (!itemSheet) return res.status(400).json({ error: 'No "Item Master" sheet found.' });

  db.exec('BEGIN');
  try {
    // 1) Parameters → pricing_params (upsert by code).
    let paramsUpserted = 0;
    if (paramSheet) {
      const prows = XLSX.utils.sheet_to_json(wb.Sheets[paramSheet], { header: 1, defval: null });
      const hi = prows.findIndex(r => Array.isArray(r) && r.some(c => norm(c) === 'param code'));
      const start = hi >= 0 ? hi + 1 : 0;
      const up = db.prepare(`INSERT INTO pricing_params (category, code, label, value) VALUES (?,?,?,?)
        ON CONFLICT(code) DO UPDATE SET category=excluded.category, label=excluded.label, value=excluded.value, updated_at=datetime('now')`);
      for (let i = start; i < prows.length; i++) {
        const r = prows[i]; if (!r) continue;
        // columns: [Category, Param code, Parameter, Value] possibly offset by a leading null
        const cells = r.filter(c => c !== null && c !== '');
        // find code (has an underscore) + value (a number)
        const code = (r.find(c => typeof c === 'string' && /_/.test(c) && c === c.toUpperCase())) || null;
        if (!code) continue;
        const idx = r.indexOf(code);
        const category = r.slice(0, idx).reverse().find(c => typeof c === 'string' && c.trim()) || 'GLOBAL';
        const label = r[idx + 1] != null ? String(r[idx + 1]) : null;
        const value = Number(r.slice(idx + 1).find(c => c != null && c !== '' && Number.isFinite(Number(c))));
        up.run(String(category).trim(), String(code).trim(), label, Number.isFinite(value) ? value : 0);
        paramsUpserted++;
      }
    }

    // 2) Item Master → product_skus (upsert by item_id, under a GREE brand/book).
    const brandName = 'GREE';
    let brand = db.prepare('SELECT id FROM brands WHERE name = ?').get(brandName);
    if (!brand) brand = { id: db.prepare('INSERT INTO brands (name, description) VALUES (?, ?)').run(brandName, 'GREE HVAC').lastInsertRowid };
    let book = db.prepare('SELECT id FROM price_books WHERE brand_id = ? AND name = ?').get(brand.id, 'GREE Pricing Module');
    if (!book) book = { id: db.prepare('INSERT INTO price_books (brand_id, name, description, created_by) VALUES (?,?,?,?)').run(brand.id, 'GREE Pricing Module', 'From GREE_CRM_Pricing_Module.xlsx', req.user.id).lastInsertRowid };
    const bookId = book.id;

    const irows = XLSX.utils.sheet_to_json(wb.Sheets[itemSheet], { defval: null });
    const pp = loadPricingParams();
    const cell = (row, ...names) => { for (const k of Object.keys(row)) { if (names.some(n => norm(k) === norm(n))) return row[k]; } return null; };
    const numOrNull = v => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

    const findByItem = db.prepare('SELECT id FROM product_skus WHERE item_id = ?');
    const insItem = db.prepare(`INSERT INTO product_skus
      (item_id, brand, price_book_id, category, category_l1, category_l2, section, erp_code, model, new_model,
       description, capacity, unit, status, active, fob_net_usd, price1_inclusive, price_iraq, list_price)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const updItem = db.prepare(`UPDATE product_skus SET
       brand=?, price_book_id=?, category=?, category_l1=?, category_l2=?, section=?, erp_code=?, model=?, new_model=?,
       description=?, capacity=?, unit=?, status=?, active=?, fob_net_usd=?, price1_inclusive=?, price_iraq=?, list_price=?, updated_at=datetime('now')
      WHERE id=?`);

    const mode = String(req.body.mode || 'merge').toLowerCase() === 'replace' ? 'replace' : 'merge';
    const seenItemIds = [];
    let inserted = 0, updated = 0, skipped = 0;
    for (const r of irows) {
      const itemId = cell(r, 'Item ID');
      const model = cell(r, 'Model');
      if (!itemId || !model) { skipped++; continue; }
      seenItemIds.push(String(itemId).trim());
      const category = cell(r, 'Category');
      const section = cell(r, 'Section');
      const price1 = numOrNull(cell(r, 'Price 1 Inclusive (JOD)', 'Price 1', 'Price 1 Inclusive'));
      const listPrice = price1 != null ? price1 : 0;
      const activeYN = String(cell(r, 'Active') || '').trim().toUpperCase() === 'Y' ? 1 : 0;
      const vals = [
        String(itemId).trim(), brandName, bookId,
        section || category || '(uncategorized)', category || null, section || null, section || null,
        cell(r, 'ERP Code') || null, String(model).trim(), cell(r, 'New model (2026)', 'New model') || null,
        cell(r, 'Description') || null, cell(r, 'Capacity') != null ? String(cell(r, 'Capacity')) : null,
        cell(r, 'UoM') || 'pc', cell(r, 'Status') || null,
        // Keep phased-out items VISIBLE in the pricelist (active=1) but flagged by status.
        1,
        numOrNull(cell(r, 'FOB Net (USD)', 'FOB Net', 'FOB')), price1,
        numOrNull(cell(r, 'Price Iraq (JOD)', 'Price Iraq')), listPrice,
      ];
      const existing = findByItem.get(String(itemId).trim());
      let id;
      // updItem's SET list starts at `brand` (item_id is the match key), so skip vals[0].
      if (existing) { updItem.run(...vals.slice(1), existing.id); id = existing.id; updated++; }
      else { id = insItem.run(...vals).lastInsertRowid; inserted++; }
      recomputeItemById(id, pp);   // compute costs/prices from FOB + Price1
      // Quotation section (optional column): use it if given; else auto-derive when
      // the item has none yet (never overwrite an existing manual tag on re-import).
      const provQS = cell(r, 'Quotation Section', 'Quote Section');
      if (provQS && String(provQS).trim()) {
        db.prepare(`UPDATE product_skus SET quote_section=? WHERE id=?`).run(String(provQS).trim(), id);
      } else {
        const cur = db.prepare('SELECT quote_section, category_l1, section, category_l2, model, description FROM product_skus WHERE id=?').get(id);
        if (cur && !cur.quote_section) {
          const qs = deriveQuoteSection(cur);
          if (qs) db.prepare('UPDATE product_skus SET quote_section=? WHERE id=?').run(qs, id);
        }
      }
    }
    // Replace mode: retire (hide) any item in this book that wasn't in the sheet.
    let retired = 0;
    if (mode === 'replace') {
      const existing = db.prepare('SELECT id, item_id FROM product_skus WHERE price_book_id = ? AND active = 1 AND item_id IS NOT NULL').all(bookId);
      const seen = new Set(seenItemIds);
      const ret = db.prepare("UPDATE product_skus SET active = 0, updated_at = datetime('now') WHERE id = ?");
      for (const row of existing) { if (!seen.has(row.item_id)) { ret.run(row.id); retired++; } }
    }
    db.exec('COMMIT');
    res.json({ ok: true, mode, params_upserted: paramsUpserted, items_inserted: inserted, items_updated: updated, retired, skipped, brand: brandName, price_book_id: bookId });
  } catch (e) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'Import failed: ' + e.message });
  }
});

// POST /api/pricing/margin-check — the Special Price Simulator engine.
// body: { basis:'inclusive'|'stax'|'exempted', target_gp, lines:[{sku_id|item_id, qty, special_price}] }
router.post('/pricing/margin-check', (req, res) => {
  if (!canViewCosts(req.user)) return res.status(403).json({ error: 'Cost view required.' });
  const basis = ['inclusive', 'stax', 'exempted'].includes(req.body.basis) ? req.body.basis : 'inclusive';
  const targetGP = Number(req.body.target_gp) || 0;
  const priceCol = { inclusive: 'price1_inclusive', stax: 'price2_stax_exempt', exempted: 'price3_exempted' }[basis];
  const costCol  = { inclusive: 'cost_inclusive',   stax: 'cost_stax_exempt',   exempted: 'cost_exempted'   }[basis];
  const lines = (Array.isArray(req.body.lines) ? req.body.lines : []).map((l, i) => {
    const sku = l.sku_id ? db.prepare('SELECT * FROM product_skus WHERE id = ?').get(+l.sku_id)
              : db.prepare('SELECT * FROM product_skus WHERE item_id = ?').get(String(l.item_id || ''));
    if (!sku) return { row: i + 1, error: 'Item not found' };
    const qty = Number(l.qty) || 0;
    const listPrice = Number(sku[priceCol]) || 0;
    const unitCost = Number(sku[costCol]) || 0;
    const special = l.special_price != null && l.special_price !== '' ? Number(l.special_price) : listPrice;
    const implied_discount = listPrice > 0 ? +(1 - special / listPrice).toFixed(4) : 0;
    const revenue = +(qty * special).toFixed(2);
    const cost_total = +(qty * unitCost).toFixed(2);
    const gp_value = +(revenue - cost_total).toFixed(2);
    const gp_pct = revenue > 0 ? +(gp_value / revenue).toFixed(4) : null;
    return { row: i + 1, sku_id: sku.id, item_id: sku.item_id, model: sku.model, category: sku.category_l1,
      qty, list_price: listPrice, unit_cost: unitCost, special_price: special,
      implied_discount, revenue, cost_total, gp_value, gp_pct, phased_out: /phased/i.test(sku.status || '') };
  });
  const valid = lines.filter(l => !l.error);
  const totalRevenue = valid.reduce((s, l) => s + (l.revenue || 0), 0);
  const totalCost = valid.reduce((s, l) => s + (l.cost_total || 0), 0);
  const gp_value = +(totalRevenue - totalCost).toFixed(2);
  const gp_pct = totalRevenue > 0 ? +(gp_value / totalRevenue).toFixed(4) : null;
  res.json({ basis, target_gp: targetGP, lines,
    totals: { revenue: totalRevenue, cost: totalCost, gp_value, gp_pct },
    verdict: gp_pct == null ? null : (gp_pct >= targetGP ? 'OK' : 'BELOW-TARGET') });
});

module.exports = router;
