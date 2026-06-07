// Product Management routes — SKU catalogue + pricelist version upload.
// Cost columns are PM-only (filtered server-side based on users.can_view_costs).

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const XLSX    = require('xlsx');
const db      = require('../database/db');
const demoAuth = require('../middleware/demoAuth');

const router = express.Router();
router.use(demoAuth);

const COST_COLS = [
  'fob_price_usd', 'fob_net_usd', 'fob_net_jod',
  'cost_with_shipping', 'cost_with_customs', 'cost_with_extra_multi',
  'cost_jod',
];

function canViewCosts(user) {
  return user && (user.can_view_costs === 1 || user.role === 'admin' || user.role === 'product_manager');
}

function stripCosts(row) {
  if (!row) return row;
  const out = { ...row };
  for (const k of COST_COLS) delete out[k];
  return out;
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
  const { category, category_l1, category_l2, category_l3, brand, search, price_book_id } = req.query;
  const clauses = ['active=1'];
  const params  = [];
  if (price_book_id) { clauses.push('price_book_id = ?'); params.push(+price_book_id); }
  if (brand)        { clauses.push('brand = ?');         params.push(brand); }
  if (category)     { clauses.push('category = ?');      params.push(category); }
  if (category_l1)  { clauses.push('category_l1 = ?');   params.push(category_l1); }
  if (category_l2)  { clauses.push('category_l2 = ?');   params.push(category_l2); }
  if (category_l3)  { clauses.push('category_l3 = ?');   params.push(category_l3); }
  if (search)   { clauses.push('(model LIKE ? OR description LIKE ? OR erp_code LIKE ?)');
                  params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  const rows = db.prepare(
    `SELECT * FROM product_skus WHERE ${clauses.join(' AND ')} ORDER BY category_l2, category_l3, model LIMIT 500`
  ).all(...params);
  res.json(canViewCosts(req.user) ? rows : rows.map(stripCosts));
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

    // Retire the previous SKUs for THIS book instead of deleting them — deleting
    // would fail (and lose history) for any SKU referenced by an existing
    // quotation. Marking them inactive hides them from pickers while the new
    // pricelist's rows are inserted as active. Old quotations keep their own
    // snapshot and their link to the retired SKU stays intact.
    const retired = db.prepare(`UPDATE product_skus SET active = 0, updated_at = datetime('now') WHERE price_book_id = ? AND active = 1`).run(priceBookId).changes;

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

    // Category layers use fill-down (a blank cell inherits the value above).
    let cl1 = null, cl2 = null, cl3 = null, inserted = 0, skipped = 0;
    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.every(c => c == null || c === '')) continue;
      if (cell(r, COL.l1)) cl1 = cleanCat(cell(r, COL.l1));
      if (cell(r, COL.l2)) cl2 = cleanCat(cell(r, COL.l2));
      if (cell(r, COL.l3)) cl3 = cleanCat(cell(r, COL.l3));
      const model = cell(r, COL.model);
      const listPrice = num(cell(r, COL.list_price));
      if (!model || !listPrice) { skipped++; continue; }
      const singleCat = cl3 || cl2 || cl1 || '(uncategorized)';  // back-compat label
      insert.run(
        versionId, priceBookId, brand,
        singleCat, cl1 || null, cl2 || null, cl3 || null,
        cleanCat(cell(r, COL.erp)) || null, cleanCat(model), cell(r, COL.desc) || null,
        num(cell(r, COL.fob_price_usd)), num(cell(r, COL.fob_net_usd)), num(cell(r, COL.fob_net_jod)),
        num(cell(r, COL.cost_with_shipping)), num(cell(r, COL.cost_with_customs)),
        num(cell(r, COL.cost_with_extra_multi)), num(cell(r, COL.cost_jod)),
        listPrice
      );
      inserted++;
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
    res.status(201).json({ ok: true, version_id: versionId, price_book_id: priceBookId, inserted, skipped, retired, retired_on_active_quotes: retiredOnActiveQuotes, sheet, brand, globals });
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
  if (!price_book_id || !model || list_price == null) {
    return res.status(400).json({ error: 'price_book_id, model, and list_price required.' });
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
      Number(list_price)
    );
    const row = db.prepare(`SELECT * FROM product_skus WHERE id = ?`).get(info.lastInsertRowid);
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

  const updated = db.prepare(`SELECT * FROM product_skus WHERE id = ?`).get(id);
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

module.exports = router;
