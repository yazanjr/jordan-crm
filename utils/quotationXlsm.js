// utils/quotationXlsm.js
// Fill IMG's ORIGINAL offer workbook (templates/ac-offer-template.xlsm) with a
// CRM quotation. We never rebuild the file: it is opened as a zip and only the
// input cells are written (General header, per-sheet Code / Description / Qty /
// Unit Price). Formatting, cover, introduction images, formulas, print setup
// and the VBA project all stay exactly as IMG made them; Excel recalculates
// totals, net prices and Sum(Total) on open.
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { vrfKind, INSTALL_MODEL, SPLIT_COPPER_MODEL } = require('./installation');

const TEMPLATE = path.join(__dirname, '..', 'templates', 'ac-offer-template.xlsm');

// Item sheets of the original workbook: first/last input row + input columns.
// `type` (optional) = the leading Type/Main column.
// Capacities are those of the EXPANDED template (templates/expand-template.ps1 —
// rerun it after replacing the template). Original file: Split 7-25, Outdoor 8-28,
// Indoor 8-57, Controllers 7-17, CCU/FCU/Package 3-23, HP/AHU/Chillers 3-10, Separations 32-39.
const SHEETS = {
  Split:       { first: 7, last: 106, code: 'C', desc: 'E', qty: 'F', price: 'G', type: 'A' },
  Outdoor:     { first: 8, last: 107, code: 'B', desc: 'D', qty: 'E', price: 'F', type: 'A' },
  Indoor:      { first: 8, last: 207, code: 'C', desc: 'E', qty: 'F', price: 'G', type: 'A' },
  Controllers: { first: 7, last: 56,  code: 'B', desc: 'C', qty: 'D', price: 'E' },
  CCU:         { first: 3, last: 102, code: 'C', desc: 'E', qty: 'F', price: 'G' },
  FCU:         { first: 3, last: 102, code: 'B', desc: 'D', qty: 'E', price: 'F', type: 'A' },
  'Heat Pump': { first: 3, last: 52,  code: 'C', desc: 'E', qty: 'F', price: 'G' },
  Package:     { first: 3, last: 102, code: 'A', desc: 'C', qty: 'D', price: 'E' },
  AHU:         { first: 3, last: 52,  code: 'A', desc: 'C', qty: 'D', price: 'E' },
  Chillers:    { first: 3, last: 52,  code: 'C', desc: 'E', qty: 'F', price: 'G' },
  // Y-branches etc. live on the "Installation Price" sheet (Separations block), not on a sheet of their own.
  Separations: { sheet: 'Installation Price', first: 32, last: 51, code: 'A', desc: 'C', qty: 'D', price: 'E', keepRows: true },
};
// Rows of the Installation Price sheet below the Separations block moved down by this much.
const IP_SHIFT = SHEETS.Separations.last - 39;
const ip = (addr) => addr.replace(/^([A-Z]+)(\d+)$/, (m, c, r) => c + (+r > 39 ? +r + IP_SHIFT : +r));
// General!E/F rows: which discount cell + brand cell belongs to which sheet group.
const GENERAL_ROW = { VRF: 7, Split: 10, AHU: 11, Chiller: 12, Package: 13, HP: 14, FCU: 15, CCU: 17 };
const SHEET_GROUP = { Outdoor: 'VRF', Indoor: 'VRF', Controllers: 'VRF', Split: 'Split', AHU: 'AHU', Chillers: 'Chiller', Package: 'Package', 'Heat Pump': 'HP', FCU: 'FCU', CCU: 'CCU' };
// Customer sheets that are hidden when the quotation has nothing in them.
const OPTIONAL_SHEETS = ['Split', 'Copper', 'Outdoor', 'Indoor', 'Controllers', 'Installation Price', 'CCU', 'FCU', 'Heat Pump', 'Package', 'AHU', 'Chillers', 'Sum Duct', 'Duct BOQ (Not to Print)', 'Quantities (Not to Print)'];

// CRM quotation section (+ the item's pricelist "section") → original sheet.
function targetSheet(li) {
  const sec = String(li.category || '');
  const kind = String(li.sku_section || '') + ' ' + String(li.description || '');
  if (sec === 'VRF System') {
    const k = vrfKind(li.sku_section, li.description);
    return k === 'controller' ? 'Controllers' : k === 'outdoor' ? 'Outdoor' : k === 'separation' ? 'Separations' : 'Indoor';
  }
  if (sec === 'Split System' || sec === 'Ducted') return 'Split';
  if (sec === 'FCU') return 'FCU';
  if (sec === 'CCU') return 'CCU';
  if (sec === 'AHU') return 'AHU';
  if (sec === 'Chiller') return 'Chillers';
  if (sec === 'Package') return 'Package';
  if (sec === 'Heat Pump') return 'Heat Pump';
  return null;                       // Copper / Installation / unknown → reported, not placed
}

function pricingLabel(mode) {
  const m = String(mode || '').toLowerCase();
  if (/iraq/.test(m)) return 'Iraq';
  if (/(exempt.*customs|customs.*exempt|fully exempt|^exempt(ed)?$)/.test(m)) return 'Exempted';
  if (/tax exempt|stax|sales-tax exempt|sales tax exempt/.test(m)) return 'Sales Tax Exempted';
  return 'Inclusive';
}
// JS date → Excel serial (1900 system)
function excelSerial(s) {
  const d = s ? new Date(String(s).includes('T') ? s : String(s).replace(' ', 'T')) : new Date();
  const t = isNaN(d.getTime()) ? new Date() : d;
  return Math.floor((Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) - Date.UTC(1899, 11, 30)) / 86400000);
}

// ── minimal, style-preserving cell writer ───────────────────────────────────
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const colNum = (col) => col.split('').reduce((a, ch) => a * 26 + (ch.charCodeAt(0) - 64), 0);

function cellXml(addr, styleAttr, value) {
  if (value == null || value === '') return `<c r="${addr}"${styleAttr}/>`;
  if (typeof value === 'number' && isFinite(value)) return `<c r="${addr}"${styleAttr}><v>${value}</v></c>`;
  return `<c r="${addr}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(value)}</t></is></c>`;
}
// Replace (or insert) one cell inside the sheet XML, keeping its style index.
function setCell(xml, addr, value) {
  const [, col, rowStr] = /^([A-Z]+)(\d+)$/.exec(addr);
  const rowRe = new RegExp(`<row [^>]*\\br="${rowStr}"[^>]*?(/>|>[\\s\\S]*?</row>)`);
  const rm = rowRe.exec(xml);
  if (!rm) return xml;                                            // row not in template → skip
  let rowXml = rm[0];
  if (/\/>$/.test(rowXml) && !/<\/row>$/.test(rowXml)) rowXml = rowXml.replace(/\/>$/, '></row>');
  const cRe = new RegExp(`<c r="${addr}"([^>]*?)(/>|>[\\s\\S]*?</c>)`);
  const cm = cRe.exec(rowXml);
  if (cm) {
    const style = (/\bs="\d+"/.exec(cm[1]) || [''])[0];
    rowXml = rowXml.replace(cRe, cellXml(addr, style ? ' ' + style : '', value));
  } else {
    // insert in column order
    const cells = [...rowXml.matchAll(/<c r="([A-Z]+)\d+"/g)];
    const after = cells.find(c => colNum(c[1]) > colNum(col));
    const fresh = cellXml(addr, '', value);
    rowXml = after ? rowXml.slice(0, after.index) + fresh + rowXml.slice(after.index)
                   : rowXml.replace(/<\/row>$/, fresh + '</row>');
  }
  return xml.slice(0, rm.index) + rowXml + xml.slice(rm.index + rm[0].length);
}

// Hide an (empty) item row so unused AC-03 … AC-019 lines don't print.
function hideRow(xml, r) {
  return xml.replace(new RegExp(`<row ([^>]*\\br="${r}"[^>]*?)(/?>)`), (m, attrs, end) =>
    /hidden=/.test(attrs) ? m : `<row ${attrs} hidden="1"${end}`);
}
// The introduction page's name boxes are drawing text boxes holding "XXX XXXX".
function setTextBox(xml, shapeName, text) {
  const re = new RegExp(`<xdr:sp [^>]*>(?:(?!</xdr:sp>)[\\s\\S])*?name="${shapeName}"[\\s\\S]*?</xdr:sp>`);
  return xml.replace(re, (sp) => {
    let first = true;
    return sp.replace(/<a:t>[^<]*<\/a:t>/g, () => { const t = first ? `<a:t>${xmlEsc(text)}</a:t>` : '<a:t></a:t>'; first = false; return t; });
  });
}
const INTRO_DRAWING = 'xl/drawings/drawing7.xml';   // "Introduction Gree" sheet

// data: same object the Word/Excel renderers get (line_items may carry sku_section).
// Returns { buffer, warnings[] }.
async function fillOfferTemplate(data = {}) {
  const zip = await JSZip.loadAsync(fs.readFileSync(TEMPLATE));
  let wbXml = await zip.file('xl/workbook.xml').async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const sheetPath = (name) => {
    const m = new RegExp(`<sheet [^>]*name="${name.replace(/[()]/g, '\\$&')}"[^>]*r:id="([^"]+)"`).exec(wbXml);
    if (!m) return null;
    const r = new RegExp(`<Relationship [^>]*Id="${m[1]}"[^>]*Target="([^"]+)"|<Relationship [^>]*Target="([^"]+)"[^>]*Id="${m[1]}"`).exec(rels);
    return r ? 'xl/' + (r[1] || r[2]).replace(/^\/?xl\//, '') : null;
  };
  const edits = {};                                                // path → xml
  const load = async (name) => {
    const p = sheetPath(name);
    if (!p) return null;
    if (!(p in edits)) edits[p] = await zip.file(p).async('string');
    return p;
  };
  const put = async (sheet, addr, value) => { const p = await load(sheet); if (p) edits[p] = setCell(edits[p], addr, value); };

  const warnings = [];
  // CRM stores the discount as a fraction (0.10 = 10%); tolerate a percent too.
  const _d = Number(data.discount_pct_global) || 0;
  const disc = _d > 1 ? _d / 100 : _d;

  // ── General (header) ──────────────────────────────────────────────────────
  await put('General', 'C7', data.project_name || '');
  await put('General', 'C8', pricingLabel(data.pricing_mode));
  await put('General', 'C9', data.sales_engineer_name || '');
  await put('General', 'C10', data.design_engineer_name || '');
  await put('General', 'C11', data.reference || '');
  await put('General', 'C12', excelSerial(data.quote_date));
  await put('General', 'C13', data.version_number != null ? Number(data.version_number) : '');
  await put('General', 'C14', data.city || '');          // always overwrite the template's sample values
  await put('General', 'C15', data.project_type || '');
  await put('General', 'C21', data.warranty_years != null ? Number(data.warranty_years) : 1);
  await put('General', 'C22', data.pm_years != null ? Number(data.pm_years) : 1);
  await put('General', 'C23', data.pm_visits_per_year != null ? Number(data.pm_visits_per_year) : 1);

  // ── Cover (CP): attention name + the quotation date instead of NOW() ─────
  await put('CP', 'L9', data.contact_name || data.org_name || '');
  await put('CP', 'L12', excelSerial(data.quote_date));

  // ── Introduction page: "Dear Mr. …", Sales Engineer, Design Engineer ─────
  if (zip.file(INTRO_DRAWING)) {
    let d = await zip.file(INTRO_DRAWING).async('string');
    d = setTextBox(d, 'TextBox 7', data.contact_name || data.org_name || '');
    d = setTextBox(d, 'TextBox 8', data.sales_engineer_name || '');
    d = setTextBox(d, 'TextBox 9', data.design_engineer_name || '');
    zip.file(INTRO_DRAWING, d);
  }

  // ── Item sheets ───────────────────────────────────────────────────────────
  const buckets = {};
  let splitCopperM = 0;
  (data.line_items || []).forEach((li) => {
    if (li.model === INSTALL_MODEL) return;          // computed by the file's own Installation Price sheet
    if (li.model === SPLIT_COPPER_MODEL) { splitCopperM += Number(li.qty) || 0; return; }   // → Copper sheet
    const sh = targetSheet(li);
    if (!sh) { warnings.push(`"${li.model || li.description}" (${li.category || 'no section'}) has no matching sheet in the offer file — not placed.`); return; }
    (buckets[sh] = buckets[sh] || []).push(li);
  });
  for (const [sh, items] of Object.entries(buckets)) {
    const cfg = SHEETS[sh];
    const cap = cfg.last - cfg.first + 1;
    if (items.length > cap) warnings.push(`${sh}: ${items.length} lines but the sheet holds ${cap} — the last ${items.length - cap} were not placed.`);
    for (let i = 0; i < Math.min(items.length, cap); i++) {
      const li = items[i], r = cfg.first + i, ws = cfg.sheet || sh;
      // The file applies the discount itself (General!F…), so it gets the LIST price.
      const listPrice = li.list_price != null && Number(li.list_price) > 0 ? Number(li.list_price) : Number(li.unit_price) || 0;
      if (cfg.type && li.sku_section) await put(ws, cfg.type + r, li.sku_section);
      await put(ws, cfg.code + r, li.model || '');
      await put(ws, cfg.desc + r, li.description || li.model || '');
      await put(ws, cfg.qty + r, Number(li.qty) || 0);
      await put(ws, cfg.price + r, listPrice);
    }
    if (!cfg.keepRows) {
      const p = await load(sh);
      for (let r = cfg.first + Math.min(items.length, cap); r <= cfg.last; r++) edits[p] = hideRow(edits[p], r);
    }
    const g = GENERAL_ROW[SHEET_GROUP[sh]];
    if (g) {
      if (data.brand) await put('General', 'D' + g, /gree/i.test(data.brand) ? 'Gree' : data.brand);
      if (disc) await put('General', 'F' + g, disc);
    }
  }

  const used = new Set(Object.keys(buckets).map(k => (SHEETS[k] && SHEETS[k].sheet) || k));

  // ── Installation Price sheet: the designer's inputs (the file does the maths) ─
  const inst = data.installation;
  const hasVrfLines = ['Outdoor', 'Indoor', 'Controllers', 'Separations'].some(k => buckets[k]);
  if (hasVrfLines) {
    const IP = 'Installation Price';
    const inp = (inst && inst.inputs) || {}, counts = (inst && inst.result && inst.result.counts) || {};
    if (!inp.enabled) warnings.push('Installation is switched off in the CRM quotation, but the offer file always adds it for VRF — totals will differ.');
    await put(IP, 'E3', Number(counts.ducted) || 0);
    await put(IP, 'G3', Number(counts.cassette) || 0);
    await put(IP, 'I3', Number(counts.modules) || 0);
    for (let i = 1; i <= 15; i++) await put(IP, 'C' + (6 + i), Number((inp.copper || {})['CU_' + String(i).padStart(2, '0')]) || 0);
    await put(IP, ip('E44'), inp.insulation === '19mm' ? '19mm' : '13mm');
    await put(IP, ip('D45'), Number(inp.cora_qty) || 0);
    await put(IP, ip('D46'), Number(inp.cladding_qty) || 0);
    await put(IP, ip('D47'), Number(inp.tray_qty) || 0);
    await put(IP, ip('E47'), inp.tray_type || '1mm 1sys');
    await put(IP, ip('E48'), inp.valves ? 'yes' : 'No');
    await put(IP, ip('D56'), Number(inp.additional_qty) || 0);
    if (disc) await put('General', 'F9', disc);
    used.add(IP);
  }

  // ── Copper for Split System sheet: extra metres (the file prices them itself)
  if (splitCopperM > 0) {
    await put('Copper', 'I7', splitCopperM);
    if (disc) await put('General', 'F16', disc);
    used.add('Copper');
  }

  // ── Workbook: hide the customer sheets this quote does not use; recalc on open
  OPTIONAL_SHEETS.forEach((name) => {
    if (used.has(name)) return;
    const re = new RegExp(`(<sheet [^>]*name="${name.replace(/[()]/g, '\\$&')}")(?![^>]*state=)`);
    wbXml = wbXml.replace(re, '$1 state="hidden"');
  });
  wbXml = /<calcPr[^>]*fullCalcOnLoad/.test(wbXml) ? wbXml
        : wbXml.replace(/<calcPr([^>]*?)\/>/, '<calcPr$1 fullCalcOnLoad="1"/>');
  // Open on the cover, never on a sheet we just hid.
  wbXml = wbXml.replace(/(<workbookView[^>]*?)\s+activeTab="\d+"/, '$1').replace(/<workbookView/, `<workbookView activeTab="4"`);

  // We overwrite one formula cell (CP!L12 =NOW() → the quotation date). Excel's
  // calcChain still lists it as a formula and rejects the file, so drop the
  // calcChain part entirely — Excel rebuilds it silently on open.
  if (zip.file('xl/calcChain.xml')) {
    zip.remove('xl/calcChain.xml');
    const ct = await zip.file('[Content_Types].xml').async('string');
    zip.file('[Content_Types].xml', ct.replace(/<Override [^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/, ''));
    zip.file('xl/_rels/workbook.xml.rels', rels.replace(/<Relationship [^>]*Target="calcChain\.xml"[^>]*\/>/, ''));
  }

  zip.file('xl/workbook.xml', wbXml);
  Object.entries(edits).forEach(([p, xml]) => zip.file(p, xml));
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return { buffer, warnings };
}

module.exports = { fillOfferTemplate, pricingLabel, TEMPLATE };
