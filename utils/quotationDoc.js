// Renders a client-facing quotation as a Word-compatible HTML document.
// Word opens .doc HTML natively, so this needs no docx library. It reproduces
// the IMG proposal's branding, letter, Schedule of Quantities table, grand total
// and terms from the quotation's own data — NO cost/margin data ever appears.
//
// renderQuotationDoc(data) -> full HTML string (serve as application/msword).
// Source-agnostic: `data` can come from any stored quotation record (post-design
// or a future budgetary one) as long as it has header fields + line_items.

const GREEN = '#00A050';
const GREEN_DARK = '#005A2E';
const ORANGE = '#F0A028';
const INK = '#1A1816';
const MUTE = '#6E6862';
const LINE = '#D6D2CC';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Money: thousands separators, up to 2 decimals (trimmed) — matches the template
// (e.g. 12,400 and 11.5).
function money(n) {
  const v = Number(n);
  if (!isFinite(v)) return '';
  const rounded = Math.round(v * 100) / 100;
  const [int, dec] = rounded.toFixed(2).split('.');
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return dec === '00' ? withSep : `${withSep}.${dec.replace(/0$/, '')}`;
}

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(String(s).includes('T') ? s : String(s).replace(' ', 'T'));
  if (isNaN(d.getTime())) return esc(s);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function renderQuotationDoc(data = {}) {
  const {
    reference = '', quote_date = '', project_name = '', city = 'Amman', project_type = '',
    brand = '', sales_engineer_name = '', design_engineer_name = '',
    intro_text = '', maintenance_text = '', tnc_text = '',
    org_name = '', contact_name = '', currency = 'JOD',
    line_items = [], logoDataUri = '',
  } = data;

  const total = line_items.reduce((s, li) => s + (Number(li.subtotal) || 0), 0);

  // Build the Schedule of Quantities rows, inserting a section header whenever
  // the line item's category changes.
  let lastCat = null;
  const rows = line_items.map((li, i) => {
    const cat = li.category || '';
    let head = '';
    if (cat && cat !== lastCat) {
      lastCat = cat;
      head = `<tr><td colspan="6" style="background:#F7F6F4;color:${GREEN_DARK};font-weight:bold;font-size:9pt;padding:6px 8px;border:1px solid ${LINE};letter-spacing:.04em;text-transform:uppercase;">${esc(cat)}</td></tr>`;
    }
    const desc = li.model && li.description ? `<b>${esc(li.model)}</b> — ${esc(li.description)}`
      : esc(li.model || li.description || '');
    const td = 'padding:6px 8px;border:1px solid ' + LINE + ';font-size:9.5pt;vertical-align:top;';
    const tdR = td + 'text-align:right;white-space:nowrap;';
    return head + `<tr>
      <td style="${td}text-align:center;color:${MUTE};">${String(li.line_num || i + 1).padStart(2, '0')}</td>
      <td style="${td}">${desc}</td>
      <td style="${td}text-align:center;">${esc(li.unit || '')}</td>
      <td style="${tdR}">${esc(li.qty != null ? li.qty : '')}</td>
      <td style="${tdR}">${money(li.unit_price)}</td>
      <td style="${tdR}font-weight:bold;">${money(li.subtotal)}</td>
    </tr>`;
  }).join('');

  const termLines = (tnc_text && String(tnc_text).trim())
    ? String(tnc_text).split(/\r?\n/).filter(Boolean).map(t => `<div style="margin:2px 0;">${esc(t)}</div>`).join('')
    : `<div><b>Payment:</b> 30% advance · 60% on delivery · 10% on commissioning</div>
       <div><b>Delivery:</b> 8–10 weeks from PO</div>
       <div><b>Validity:</b> 30 days from issue date</div>`;

  const intro = (intro_text && String(intro_text).trim())
    ? esc(intro_text)
    : `We are pleased to submit our commercial proposal for the supply, installation and commissioning of an advanced HVAC system${brand ? ` produced by ${esc(brand)}` : ''}${project_name ? `, for the ${esc(project_name)}${project_type ? ` — ${esc(project_type)}` : ''} project` : ''}. The detailed schedule of quantities and commercial terms follow.`;

  const labelCell = (k, v) => v ? `<td style="padding:3px 14px 3px 0;font-size:8.5pt;color:${MUTE};text-transform:uppercase;letter-spacing:.04em;">${esc(k)}</td><td style="padding:3px 24px 3px 0;font-size:10pt;color:${INK};font-weight:600;">${esc(v)}</td>` : '';

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc(reference || project_name || 'Quotation')}</title>
<style>
  @page { size: A4; margin: 1.6cm 1.6cm; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: ${INK}; font-size: 10pt; line-height: 1.5; }
  h1 { font-size: 20pt; margin: 0; letter-spacing: -0.5pt; }
  table { border-collapse: collapse; }
</style></head>
<body>
  <!-- Header band -->
  <table style="width:100%;border-bottom:3px solid ${ORANGE};padding-bottom:6px;"><tr>
    <td style="vertical-align:middle;">
      ${logoDataUri ? `<img src="${logoDataUri}" alt="Izzat Marji Group" style="height:52px;" />` : `<div style="font-size:16pt;font-weight:bold;color:${GREEN_DARK};">Izzat Marji Group</div>`}
    </td>
    <td style="text-align:right;vertical-align:middle;">
      <div style="font-size:8.5pt;color:${MUTE};letter-spacing:.12em;text-transform:uppercase;">HVAC Business Unit</div>
      <h1 style="color:${GREEN_DARK};">Commercial Proposal</h1>
    </td>
  </tr></table>

  <!-- Title + meta -->
  <div style="margin-top:16px;">
    <div style="font-size:15pt;font-weight:bold;color:${INK};">${esc(project_name || '—')}</div>
    ${project_type ? `<div style="font-size:10.5pt;color:${GREEN};font-weight:600;">${esc(project_type)}</div>` : ''}
  </div>
  <table style="margin-top:12px;">
    <tr>${labelCell('Prepared for', org_name)}${labelCell('Reference', reference)}</tr>
    <tr>${labelCell('Attention', contact_name)}${labelCell('Date', fmtDate(quote_date))}</tr>
    <tr>${labelCell('City', city)}${labelCell('Brand', brand)}</tr>
  </table>

  <!-- Letter -->
  <div style="margin-top:18px;">
    ${contact_name ? `<div>Dear ${esc(contact_name)},</div>` : ''}
    <div style="margin-top:8px;text-align:justify;">${intro}</div>
    <div style="margin-top:10px;font-size:9.5pt;color:${MUTE};">
      Izzat Marji Group (IMG), established in 1985, is one of Jordan's leading providers of integrated
      engineering solutions across HVAC, sanitary, MEP and renewable energy systems.
    </div>
  </div>

  <!-- Schedule of Quantities -->
  <div style="margin-top:22px;">
    <div style="font-size:8.5pt;color:${MUTE};letter-spacing:.1em;text-transform:uppercase;">Pricing</div>
    <div style="font-size:14pt;font-weight:bold;color:${GREEN_DARK};">Schedule of Quantities</div>
    <div style="font-size:9pt;color:${MUTE};margin-bottom:8px;">All values in ${esc(currency)} · inclusive of sales tax &amp; customs</div>
    <table style="width:100%;">
      <tr>
        ${['#', 'Item description', 'Unit', 'Qty', 'Unit price', 'Total'].map((h, i) =>
          `<th style="background:${GREEN_DARK};color:#fff;font-size:8.5pt;padding:7px 8px;border:1px solid ${GREEN_DARK};text-align:${i >= 3 ? 'right' : i === 2 ? 'center' : 'left'};letter-spacing:.03em;">${h}</th>`).join('')}
      </tr>
      ${rows}
      <tr>
        <td colspan="4" style="border:none;"></td>
        <td style="padding:9px 8px;border:1px solid ${LINE};text-align:right;font-weight:bold;background:#F7F6F4;">Grand Total (${esc(currency)})</td>
        <td style="padding:9px 8px;border:1px solid ${LINE};text-align:right;font-weight:bold;font-size:11pt;background:${ORANGE};color:#fff;white-space:nowrap;">${money(total)}</td>
      </tr>
    </table>
  </div>

  <!-- Terms -->
  <div style="margin-top:18px;font-size:9.5pt;">
    ${termLines}
    ${maintenance_text && String(maintenance_text).trim() ? `<div style="margin-top:8px;color:${MUTE};">${esc(maintenance_text)}</div>` : ''}
  </div>

  <!-- Signature + footer -->
  <table style="width:100%;margin-top:26px;"><tr>
    <td style="vertical-align:bottom;font-size:9.5pt;">
      ${sales_engineer_name ? `<div><b>Sales Engineer</b> · ${esc(sales_engineer_name)}</div>` : ''}
      ${design_engineer_name ? `<div><b>Design Engineer</b> · ${esc(design_engineer_name)}</div>` : ''}
    </td>
    <td style="text-align:right;vertical-align:bottom;font-size:8.5pt;color:${MUTE};">
      06 55 000 22 · www.marji.jo<br/>163, King Abdullah II St., Amman
    </td>
  </tr></table>
  <div style="margin-top:10px;font-size:8pt;color:${MUTE};border-top:1px solid ${LINE};padding-top:6px;">
    CONFIDENTIAL · This offer is inclusive of sales tax and customs.
  </div>
</body></html>`;
}

module.exports = { renderQuotationDoc };
