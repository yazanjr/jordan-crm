// utils/quotationXlsx.js
// Client-facing quotation as an Excel workbook that mirrors IMG's original
// "New AC Offer" file: one sheet per page, same sequence and structure.
//
//   General            – header data (project, pricing basis, reference, date, city, type, brand, warranty)
//   CP                 – cover page (IMG banner, attention/project/ref/date, brand logo, basis sentence)
//   Introduction Gree  – the real IMG introduction letter (the original page image)
//   Sum(Total)         – per-section subtotals → Total Price (List + Net), live formulas
//   <one sheet per section, original order> – Code | Unit Name | Description | Qty | Unit Price | Total | Unit Net | Total Net
//   Terms & Conditions – payment / delivery / validity, warranty & maintenance, notes
//
// Totals are real Excel formulas so the file stays "alive" like the original.
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const FONT = 'Verdana';
const GREEN_DARK = 'FF075232';
const GREEN = 'FF0A7A43';
const ORANGE = 'FFF7941D';
const SOFT = 'FFF5F3F0';
const LINE = 'FFD9D5CF';
const MUTE = 'FF6E6862';
const WHITE = 'FFFFFFFF';

// Sheet order copied from the original workbook (only sections present in the
// quotation are emitted). Unit-name prefix follows the original naming
// (AC-01, ODU-01, FCU-01, CH-01 …).
const SECTION_ORDER = [
  { name: 'Split System',  sheet: 'Split',        title: 'Split System',         prefix: 'AC' },
  { name: 'Copper',        sheet: 'Copper',       title: 'Copper Pipes & Fittings', prefix: 'CP' },
  { name: 'VRF System',    sheet: 'VRF System',   title: 'VRF System',           prefix: 'VRF' },
  { name: 'Installation',  sheet: 'Installation', title: 'Installation Works',   prefix: 'INS' },
  { name: 'CCU',           sheet: 'CCU',          title: 'Close Control Units',  prefix: 'CCU' },
  { name: 'FCU',           sheet: 'FCU',          title: 'Fan Coil Units',       prefix: 'FCU' },
  { name: 'Heat Pump',     sheet: 'Heat Pump',    title: 'Heat Pumps',           prefix: 'HP' },
  { name: 'Package',       sheet: 'Package',      title: 'Package Units',        prefix: 'PK' },
  { name: 'AHU',           sheet: 'AHU',          title: 'Air Handling Units',   prefix: 'AHU' },
  { name: 'Chiller',       sheet: 'Chillers',     title: 'Chillers',             prefix: 'CH' },
  { name: 'Ducted',        sheet: 'Duct',         title: 'Ducted Units',         prefix: 'DU' },
];

function basisSentence(pricingMode, currency) {
  const m = String(pricingMode || '').toLowerCase();
  const cur = currency === 'JOD' ? 'Jordanian Dinars' : currency;
  if (/(exempt.*customs|customs.*exempt|fully exempt|^exempt$)/.test(m))
    return `Prices are in ${cur}, excluding customs duties and sales tax.`;
  if (/tax exempt|stax|sales-tax exempt|sales tax exempt/.test(m))
    return `Prices are in ${cur}, including customs duties and excluding sales tax.`;
  return `Prices are in ${cur}, including customs duties and 16% sales tax.`;
}
// Short "Pricing" label for the General sheet (matches the original dropdown values).
function basisLabel(pricingMode) {
  const m = String(pricingMode || '').toLowerCase();
  if (/(exempt.*customs|customs.*exempt|fully exempt|^exempt$)/.test(m)) return 'Exempted';
  if (/tax exempt|stax|sales-tax exempt|sales tax exempt/.test(m)) return 'Sales-Tax Exempted';
  return 'Inclusive';
}
function fmtDate(s) {
  if (!s) return '';
  const d = new Date(String(s).includes('T') ? s : String(s).replace(' ', 'T'));
  if (isNaN(d.getTime())) return String(s);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function safeSheetName(s) {
  return String(s).replace(/[\[\]\*\?\/\\:]/g, ' ').slice(0, 31).trim() || 'Sheet';
}
function asset(file) {
  const p = path.join(__dirname, '..', 'public', 'pipeline-v3', 'assets', file);
  try { return fs.readFileSync(p); } catch { return null; }
}

const MONEY = '#,##0.00;[Red]-#,##0.00;"-"';

// ── small style helpers ─────────────────────────────────────────────────────
const f = (o = {}) => ({ name: FONT, size: 9, ...o });
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin = { style: 'thin', color: { argb: LINE } };
const box = { top: thin, left: thin, bottom: thin, right: thin };

function pageSetup(ws, { landscape = false, fitHeight = 0 } = {}) {
  ws.pageSetup = {
    paperSize: 9, orientation: landscape ? 'landscape' : 'portrait',
    fitToPage: true, fitToWidth: 1, fitToHeight: fitHeight,
    margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    horizontalCentered: true,
  };
  ws.views = [{ showGridLines: false }];
}

// Header band used on every content sheet: IMG banner-less text band + Ref/Date.
function headerBand(ws, data, lastCol) {
  ws.mergeCells(1, 1, 1, lastCol);
  const c = ws.getCell(1, 1);
  c.value = 'Izzat Marji Group — HVAC Business Unit';
  c.font = f({ size: 11, bold: true, color: { argb: GREEN_DARK } });
  c.alignment = { vertical: 'middle' };
  ws.mergeCells(2, 1, 2, lastCol);
  const r = ws.getCell(2, 1);
  r.value = `Financial Proposal · Ref. ${data.reference || ''}${data.quote_date ? ' · ' + fmtDate(data.quote_date) : ''}${data.project_name ? ' · ' + data.project_name : ''}`;
  r.font = f({ size: 8, color: { argb: MUTE } });
  for (let i = 1; i <= lastCol; i++) ws.getCell(2, i).border = { bottom: { style: 'medium', color: { argb: ORANGE } } };
  ws.getRow(1).height = 20;
  ws.getRow(2).height = 16;
}

// ── sheet builders ──────────────────────────────────────────────────────────
function buildGeneral(wb, data) {
  const ws = wb.addWorksheet('General');
  pageSetup(ws, { fitHeight: 1 });
  ws.columns = [{ width: 30 }, { width: 44 }, { width: 4 }, { width: 22 }, { width: 22 }];
  headerBand(ws, data, 5);

  const put = (row, label, value, opts = {}) => {
    const a = ws.getCell(row, 1); a.value = label; a.font = f({ bold: true }); a.fill = fill(SOFT); a.border = box;
    a.alignment = { vertical: 'middle' };
    const b = ws.getCell(row, 2); b.value = value == null ? '' : value; b.font = f(opts.font || {}); b.border = box;
    b.alignment = { vertical: 'middle', wrapText: true };
    ws.getRow(row).height = 18;
  };
  let r = 4;
  ws.getCell(r, 1).value = 'General'; ws.getCell(r, 1).font = f({ size: 13, bold: true, color: { argb: GREEN_DARK } }); r += 1;
  put(r++, 'Project Name', data.project_name);
  put(r++, 'Client', data.org_name);
  put(r++, 'Attention', data.contact_name);
  put(r++, 'Pricing', basisLabel(data.pricing_mode));
  put(r++, 'Sales', data.sales_engineer_name);
  put(r++, 'Design', data.design_engineer_name);
  put(r++, 'Reference', data.reference, { font: { bold: true } });
  put(r++, 'Date', fmtDate(data.quote_date));
  put(r++, 'Revision', data.version_number != null ? `V${data.version_number}` : '');
  put(r++, 'City', data.city);
  put(r++, 'Type', data.project_type);
  put(r++, 'Brand', data.brand || 'Gree');
  put(r++, 'Currency', data.currency || 'JOD');

  r += 1;
  ws.getCell(r, 1).value = 'Sections included'; ws.getCell(r, 1).font = f({ size: 11, bold: true, color: { argb: GREEN_DARK } }); r += 1;
  ['Section', 'Brand', 'Include'].forEach((h, i) => {
    const c = ws.getCell(r, i === 0 ? 1 : i + 3); c.value = h; c.font = f({ bold: true, color: { argb: WHITE } }); c.fill = fill(GREEN_DARK); c.border = box;
  });
  ws.mergeCells(r, 1, r, 2); r += 1;
  SECTION_ORDER.forEach((s) => {
    const present = data.sections.some(x => x.key === s.name);
    ws.mergeCells(r, 1, r, 2);
    ws.getCell(r, 1).value = s.title; ws.getCell(r, 1).font = f(); ws.getCell(r, 1).border = box;
    ws.getCell(r, 4).value = present ? (data.brand || 'Gree') : ''; ws.getCell(r, 4).font = f(); ws.getCell(r, 4).border = box;
    ws.getCell(r, 5).value = present ? 'Yes' : 'No'; ws.getCell(r, 5).font = f({ bold: present, color: { argb: present ? GREEN : MUTE } }); ws.getCell(r, 5).border = box;
    r += 1;
  });
  // Any section not in the standard list (older quotes with granular categories).
  data.sections.filter(x => !SECTION_ORDER.some(s => s.name === x.key)).forEach((x) => {
    ws.mergeCells(r, 1, r, 2);
    ws.getCell(r, 1).value = x.name; ws.getCell(r, 1).font = f(); ws.getCell(r, 1).border = box;
    ws.getCell(r, 4).value = data.brand || 'Gree'; ws.getCell(r, 4).font = f(); ws.getCell(r, 4).border = box;
    ws.getCell(r, 5).value = 'Yes'; ws.getCell(r, 5).font = f({ bold: true, color: { argb: GREEN } }); ws.getCell(r, 5).border = box;
    r += 1;
  });

  r += 1;
  ws.getCell(r, 1).value = 'Maintenance & Warranty'; ws.getCell(r, 1).font = f({ size: 11, bold: true, color: { argb: GREEN_DARK } }); r += 1;
  put(r++, 'Factory Warranty (years)', data.warranty_years != null ? data.warranty_years : 1);
  put(r++, 'Preventive Maintenance No. of Years', data.pm_years != null ? data.pm_years : 1);
  put(r++, 'Visits Per Year', data.pm_visits_per_year != null ? data.pm_visits_per_year : 1);
  if (data.maintenance_text) { put(r, 'Notes', data.maintenance_text); ws.getRow(r).height = 60; r += 1; }
  return ws;
}

function buildCover(wb, data) {
  const ws = wb.addWorksheet('CP');
  pageSetup(ws, { fitHeight: 1 });
  ws.columns = Array.from({ length: 10 }, () => ({ width: 9.5 }));
  for (let i = 1; i <= 48; i++) ws.getRow(i).height = 18;

  const banner = asset('quote-cover-banner.png');
  if (banner) {
    const id = wb.addImage({ buffer: banner, extension: 'png' });
    // 1563×711 px → keep aspect at ~620 px wide (fits the 10 columns)
    ws.addImage(id, { tl: { col: 0.3, row: 0.3 }, ext: { width: 620, height: 282 } });
  } else {
    ws.mergeCells('A1:J3'); ws.getCell('A1').value = 'Izzat Marji Group — HVAC Business Unit';
    ws.getCell('A1').font = f({ size: 18, bold: true, color: { argb: GREEN_DARK } }); ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    ws.mergeCells('A4:J5'); ws.getCell('A4').value = 'Financial Proposal';
    ws.getCell('A4').font = f({ size: 22, color: { argb: GREEN_DARK } }); ws.getCell('A4').alignment = { horizontal: 'center', vertical: 'middle' };
  }

  const line = (row, label, value, big) => {
    ws.mergeCells(row, 2, row, 9);
    const c = ws.getCell(row, 2);
    c.value = { richText: [{ text: label, font: f({ size: big ? 12 : 11, bold: true, color: { argb: GREEN_DARK } }) }, { text: value == null ? '' : String(value), font: f({ size: big ? 12 : 11 }) }] };
    c.alignment = { vertical: 'middle' };
    ws.getRow(row).height = big ? 26 : 22;
  };
  line(19, 'To The Kind Attention of: ', data.contact_name ? `${data.contact_name}${data.org_name ? ' — ' + data.org_name : ''}` : (data.org_name || ''));
  line(21, 'Project name: ', data.project_name, true);
  line(23, 'Ref: ', data.reference);
  line(24, 'Date: ', fmtDate(data.quote_date));
  if (data.city) line(25, 'City: ', data.city);

  const logo = asset('gree-logo.png');
  if (logo && /gree/i.test(data.brand || 'Gree')) {
    const id = wb.addImage({ buffer: logo, extension: 'png' });
    ws.addImage(id, { tl: { col: 6.2, row: 29.2 }, ext: { width: 220, height: 55 } });
  }

  ws.mergeCells(40, 1, 40, 10);
  const q = ws.getCell(40, 1);
  q.value = `“${basisSentence(data.pricing_mode, data.currency)}”`;
  q.font = f({ size: 10, italic: true, color: { argb: MUTE } });
  q.alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells(44, 1, 44, 10);
  const ft = ws.getCell(44, 1);
  ft.value = '06 55 000 22   ·   www.marji.jo   ·   163, King Abdullah II St., Amman';
  ft.font = f({ size: 8.5, bold: true, color: { argb: GREEN_DARK } });
  ft.alignment = { horizontal: 'center', vertical: 'middle' };
  ft.border = { top: { style: 'medium', color: { argb: ORANGE } } };
  ws.pageSetup.printArea = 'A1:J46';
  return ws;
}

function buildIntro(wb, data) {
  const ws = wb.addWorksheet('Introduction Gree');
  pageSetup(ws, { fitHeight: 1 });
  ws.columns = Array.from({ length: 10 }, () => ({ width: 9.5 }));
  const img = asset('quote-intro-gree.png');
  if (img) {
    const id = wb.addImage({ buffer: img, extension: 'png' });
    // 1538×2174 px (A4 ratio) → 640 × 905 px
    ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 640, height: 905 } });
    for (let i = 1; i <= 50; i++) ws.getRow(i).height = 18;
    ws.pageSetup.printArea = 'A1:J50';
    return ws;
  }
  // Fallback: the letter as text.
  ws.columns = [{ width: 4 }, { width: 80 }];
  const lines = [
    [`Dear ${data.contact_name || 'Sir/Madam'},`, {}],
    [`We are pleased to offer you our commercial proposal for the advanced HVAC system produced by the world-leading manufacturer, ${data.brand || 'GREE'}.`, { bold: true }],
    ['', {}],
    ['About Izzat Marji Group', { bold: true, size: 12, color: { argb: GREEN_DARK } }],
    ['Izzat Marji Group (IMG), established in 1985, started as a small private company and has grown to be one of Jordan\'s leading providers of integrated engineering solutions:', {}],
    ['• Heating, Air Conditioning and Ventilation solutions', {}],
    ['• Sanitary Fixtures, Bathroom & Kitchen Accessories, and Solid Surfaces', {}],
    ['• Mechanical, Electrical and Plumbing Systems (MEP)', {}],
    ['• Renewable Energy and Energy-Efficiency Systems', {}],
    ['', {}],
    ['Heating, Air Conditioning & Ventilation Business Unit', { bold: true, size: 12, color: { argb: GREEN_DARK } }],
    ['Mission: To provide the Jordanian market with up-to-date, quality-oriented HVAC and dehumidification solutions.', {}],
    ['Vision: To be the first destination for HVAC and dehumidification stakeholders within the coming five years.', {}],
    ['', {}],
    ['Dani Marji — HVAC Business Unit General Manager', { bold: true }],
    [`Sales Engineer: ${data.sales_engineer_name || '—'}    Design Engineer: ${data.design_engineer_name || '—'}`, {}],
  ];
  lines.forEach(([t, fo], i) => { const c = ws.getCell(i + 3, 2); c.value = t; c.font = f({ size: 10, ...fo }); c.alignment = { wrapText: true, vertical: 'top' }; });
  return ws;
}

// One sheet per section. Returns the cell addresses of the TOTAL / TOTAL NET so
// Sum(Total) can reference them with live formulas.
function buildSection(wb, data, sec) {
  const ws = wb.addWorksheet(safeSheetName(sec.sheet));
  pageSetup(ws);
  ws.columns = [
    { width: 5 },   // A  #
    { width: 20 },  // B  Code (model)
    { width: 11 },  // C  Unit Name
    { width: 52 },  // D  Description
    { width: 7 },   // E  Qty
    { width: 14 },  // F  Unit Price (JD)
    { width: 15 },  // G  Total Price (JD)
    { width: 14 },  // H  Unit Net Price (JD)
    { width: 15 },  // I  Total Net Price (JD)
  ];
  headerBand(ws, data, 9);

  ws.mergeCells('A4:I4');
  const t = ws.getCell('A4'); t.value = sec.title;
  t.font = f({ size: 13, bold: true, color: { argb: GREEN_DARK } });
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(4).height = 26;

  const heads = ['#', 'Code', 'Unit Name', 'Description', 'Qty', 'Unit Price (JD)', 'Total Price (JD)', 'Unit Net Price (JD)', 'Total Net Price (JD)'];
  heads.forEach((h, i) => {
    const c = ws.getCell(5, i + 1); c.value = h;
    c.font = f({ size: 8.5, bold: true, color: { argb: WHITE } }); c.fill = fill(GREEN_DARK); c.border = box;
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  ws.getRow(5).height = 30;

  const _d = Number(data.discount_pct_global) || 0; const disc = _d > 1 ? _d : _d * 100;   // percent
  const first = 6;
  sec.items.forEach((li, i) => {
    const r = first + i;
    const row = ws.getRow(r);
    row.getCell(1).value = i + 1;
    row.getCell(2).value = li.model || '';
    row.getCell(3).value = `${sec.prefix}-${String(i + 1).padStart(2, '0')}`;
    row.getCell(4).value = li.description || '';
    row.getCell(5).value = Number(li.qty) || 0;
    row.getCell(6).value = Number(li.unit_price) || 0;
    row.getCell(7).value = { formula: `E${r}*F${r}`, result: (Number(li.qty) || 0) * (Number(li.unit_price) || 0) };
    row.getCell(8).value = { formula: disc ? `ROUND(F${r}*(1-${disc / 100}),2)` : `F${r}`, result: Math.round((Number(li.unit_price) || 0) * (1 - disc / 100) * 100) / 100 };
    row.getCell(9).value = { formula: `E${r}*H${r}`, result: (Number(li.qty) || 0) * Math.round((Number(li.unit_price) || 0) * (1 - disc / 100) * 100) / 100 };
    for (let c = 1; c <= 9; c++) {
      const cell = row.getCell(c);
      cell.font = f({ size: 9, bold: c === 2 || c === 7 || c === 9 });
      cell.border = box;
      cell.alignment = { vertical: 'top', wrapText: c === 4, horizontal: c === 1 || c === 3 || c === 5 ? 'center' : c >= 6 ? 'right' : 'left' };
      if (c >= 6) cell.numFmt = MONEY;
    }
    const lines = Math.max(1, Math.ceil(String(li.description || '').length / 60));
    row.height = Math.max(16, 13 * lines + 4);
  });
  const last = first + Math.max(sec.items.length, 1) - 1;
  const tr = last + 1;
  const tot = ws.getRow(tr);
  tot.getCell(5).value = { formula: `SUM(E${first}:E${last})`, result: sec.items.reduce((a, x) => a + (Number(x.qty) || 0), 0) };
  tot.getCell(6).value = 'TOTAL';
  tot.getCell(7).value = { formula: `SUM(G${first}:G${last})`, result: sec.total };
  tot.getCell(8).value = 'TOTAL NET';
  tot.getCell(9).value = { formula: `SUM(I${first}:I${last})`, result: sec.net };
  for (let c = 1; c <= 9; c++) {
    const cell = tot.getCell(c);
    cell.font = f({ size: 9.5, bold: true, color: { argb: c === 7 || c === 9 ? WHITE : GREEN_DARK } });
    cell.fill = fill(c === 7 || c === 9 ? ORANGE : SOFT);
    cell.border = box;
    cell.alignment = { horizontal: c === 5 ? 'center' : 'right', vertical: 'middle' };
    if (c === 5 || c === 7 || c === 9) cell.numFmt = c === 5 ? '0' : MONEY;
  }
  tot.height = 20;

  // Basis reminder under the table (as the original prints on each sheet).
  ws.mergeCells(tr + 2, 1, tr + 2, 9);
  const n = ws.getCell(tr + 2, 1); n.value = basisSentence(data.pricing_mode, data.currency);
  n.font = f({ size: 8.5, italic: true, color: { argb: MUTE } });

  ws.pageSetup.printTitlesRow = '5:5';
  return { sheet: ws.name, totalRef: `G${tr}`, netRef: `I${tr}` };
}

function buildSummary(wb, data, refs) {
  const ws = wb.addWorksheet('Sum(Total)');
  pageSetup(ws, { fitHeight: 1 });
  ws.columns = [{ width: 4 }, { width: 34 }, { width: 18 }, { width: 18 }];
  headerBand(ws, data, 4);

  ws.mergeCells('A4:D4');
  const t = ws.getCell('A4'); t.value = 'Total Investment Summary';
  t.font = f({ size: 13, bold: true, color: { argb: GREEN_DARK } }); t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(4).height = 26;

  ['#', 'Description', 'Total Price (JD)', 'Total Net Price (JD)'].forEach((h, i) => {
    const c = ws.getCell(6, i + 1); c.value = h;
    c.font = f({ size: 8.5, bold: true, color: { argb: WHITE } }); c.fill = fill(GREEN_DARK); c.border = box;
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  ws.getRow(6).height = 28;

  let r = 7;
  refs.forEach((x, i) => {
    const q = `'${x.sheet.replace(/'/g, "''")}'`;
    ws.getCell(r, 1).value = i + 1;
    ws.getCell(r, 2).value = x.title;
    ws.getCell(r, 3).value = { formula: `${q}!${x.totalRef}`, result: x.total };
    ws.getCell(r, 4).value = { formula: `${q}!${x.netRef}`, result: x.net };
    for (let c = 1; c <= 4; c++) {
      const cell = ws.getCell(r, c); cell.font = f({ size: 9.5 }); cell.border = box;
      cell.alignment = { horizontal: c === 1 ? 'center' : c >= 3 ? 'right' : 'left', vertical: 'middle' };
      if (c >= 3) cell.numFmt = MONEY;
    }
    ws.getRow(r).height = 18;
    r += 1;
  });
  const firstRow = 7, lastRow = Math.max(7, r - 1);
  ws.mergeCells(r, 1, r, 2);
  ws.getCell(r, 1).value = 'Total Price (JD)';
  ws.getCell(r, 3).value = { formula: `SUM(C${firstRow}:C${lastRow})`, result: data.grand };
  ws.getCell(r, 4).value = { formula: `SUM(D${firstRow}:D${lastRow})`, result: data.grandNet };
  for (let c = 1; c <= 4; c++) {
    const cell = ws.getCell(r, c);
    cell.font = f({ size: 11, bold: true, color: { argb: c >= 3 ? WHITE : GREEN_DARK } });
    cell.fill = fill(c >= 3 ? ORANGE : SOFT); cell.border = box;
    cell.alignment = { horizontal: c >= 3 ? 'right' : 'left', vertical: 'middle' };
    if (c >= 3) cell.numFmt = MONEY;
  }
  ws.getRow(r).height = 24;
  r += 2;
  ws.mergeCells(r, 1, r, 4);
  ws.getCell(r, 1).value = basisSentence(data.pricing_mode, data.currency);
  ws.getCell(r, 1).font = f({ size: 9, italic: true, color: { argb: MUTE } });
  ws.getCell(r, 1).alignment = { wrapText: true };
  const _d = Number(data.discount_pct_global) || 0; const disc = _d > 1 ? _d : _d * 100;   // percent
  if (disc) {
    r += 1; ws.mergeCells(r, 1, r, 4);
    ws.getCell(r, 1).value = `Net prices reflect a ${disc}% discount on list prices.`;
    ws.getCell(r, 1).font = f({ size: 9, italic: true, color: { argb: MUTE } });
  }
  return ws;
}

function buildTerms(wb, data) {
  const ws = wb.addWorksheet('Terms & Conditions');
  pageSetup(ws, { fitHeight: 1 });
  ws.columns = [{ width: 4 }, { width: 90 }];
  headerBand(ws, data, 2);
  let r = 4;
  const h = (t) => { const c = ws.getCell(r, 2); c.value = t; c.font = f({ size: 12, bold: true, color: { argb: GREEN_DARK } }); ws.getRow(r).height = 22; r += 1; };
  const p = (t, bold) => { const c = ws.getCell(r, 2); c.value = t; c.font = f({ size: 9.5, bold: !!bold }); c.alignment = { wrapText: true, vertical: 'top' }; ws.getRow(r).height = Math.max(16, 13 * Math.ceil(String(t).length / 95) + 4); r += 1; };
  const brand = data.brand || 'GREE';

  h('Commercial Terms');
  if (data.tnc_text && String(data.tnc_text).trim()) String(data.tnc_text).split(/\r?\n/).filter(Boolean).forEach(t => p(t));
  else {
    p('Payment: 30% advance with the order · 60% on delivery · 10% on commissioning.');
    p('Delivery: 8–10 weeks from receipt of the confirmed purchase order.');
    p('Validity: this offer is valid for 30 days from the issue date.');
  }
  r += 1; h('Warranty & Maintenance');
  if (data.maintenance_text && String(data.maintenance_text).trim()) String(data.maintenance_text).split(/\r?\n/).filter(Boolean).forEach(t => p(t));
  else {
    p(`Factory warranty: as per the manufacturer's standard warranty for ${brand} equipment.`);
    p('Preventive maintenance: scheduled visits during the warranty period as agreed in the contract.');
  }
  r += 1; h('Notes');
  p(basisSentence(data.pricing_mode, data.currency));
  p('Scope covers the supply of the listed equipment; installation and commissioning are included only where a corresponding line item appears in the schedule of quantities.');
  p('Quantities are as per the design schedule; any variation on site will be re-measured and priced at the unit rates above.');
  r += 2;
  p('Sales Engineer: ' + (data.sales_engineer_name || '—') + '        Design Engineer: ' + (data.design_engineer_name || '—'), true);
  p('Izzat Marji Group · HVAC Business Unit · 06 55 000 22 · www.marji.jo · 163 King Abdullah II St., Amman');
  return ws;
}

// ── main ────────────────────────────────────────────────────────────────────
// data: same shape as renderQuotationDoc() + version_number, discount_pct_global.
// Returns a Promise<Buffer> of the .xlsx file.
async function renderQuotationXlsx(data = {}) {
  const currency = data.currency || 'JOD';
  const _d = Number(data.discount_pct_global) || 0; const disc = _d > 1 ? _d : _d * 100;   // percent

  // Group lines by section (first-seen order), then sort into the original sheet order.
  const byKey = new Map();
  (data.line_items || []).forEach((li) => {
    const key = li.category || 'Items';
    if (!byKey.has(key)) byKey.set(key, { key, name: key, items: [], total: 0, net: 0 });
    const s = byKey.get(key);
    s.items.push(li);
    const sub = (Number(li.qty) || 0) * (Number(li.unit_price) || 0);
    s.total += sub;
    s.net += (Number(li.qty) || 0) * Math.round((Number(li.unit_price) || 0) * (1 - disc / 100) * 100) / 100;
  });
  const ordered = [];
  SECTION_ORDER.forEach((s) => { if (byKey.has(s.name)) ordered.push({ ...byKey.get(s.name), sheet: s.sheet, title: s.title, prefix: s.prefix }); });
  byKey.forEach((s) => { if (!SECTION_ORDER.some(o => o.name === s.key)) ordered.push({ ...s, sheet: s.name, title: s.name, prefix: 'IT' }); });
  const sections = ordered;
  const grand = sections.reduce((a, s) => a + s.total, 0);
  const grandNet = sections.reduce((a, s) => a + s.net, 0);
  const d = { ...data, currency, sections, grand, grandNet };

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Izzat Marji Group — IMG CRM';
  wb.created = new Date();

  buildGeneral(wb, d);
  buildCover(wb, d);
  buildIntro(wb, d);
  // Sum(Total) sits before the section sheets (original order) but needs their
  // total cell refs → build sections first, then move Sum(Total) into place.
  const refs = [];
  sections.forEach((sec) => {
    const r = buildSection(wb, d, sec);
    refs.push({ ...r, title: sec.title, total: sec.total, net: sec.net });
  });
  const sum = buildSummary(wb, d, refs);
  buildTerms(wb, d);
  // Move Sum(Total) to right after the introduction (index 3).
  const order = wb.worksheets.slice();
  const i = order.indexOf(sum);
  order.splice(i, 1); order.splice(3, 0, sum);
  order.forEach((ws, idx) => { ws.orderNo = idx; });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { renderQuotationXlsx, basisSentence };
