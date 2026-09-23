// Renders a client-facing quotation as a polished Word-compatible HTML document.
// Word opens .doc HTML natively, so this needs no docx library.
//
// Structure (each a real page break, headings kept with their content):
//   Page 1 — Cover: branding + title + client/reference meta (no price)
//   Page 2 — Total Investment: grand total + per-section summary + pricing basis
//   Page 3 — Introduction: IMG letter (About IMG, Mission/Vision, signature)
//   Page 4+ — one page per category section (items + subtotal)
//   Last   — Commercial Terms: payment/delivery/validity, warranty & maintenance, notes
// No cost/margin data ever appears.

const GREEN = '#0A7A43';
const GREEN_DARK = '#075232';
const ORANGE = '#F0A028';
const INK = '#1A1816';
const MUTE = '#6E6862';
const LINE = '#D9D5CF';
const SOFT = '#F5F3F0';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function money(n) {
  const v = Number(n);
  if (!isFinite(v)) return '';
  const [int, dec] = (Math.round(v * 100) / 100).toFixed(2).split('.');
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return dec === '00' ? withSep : `${withSep}.${dec.replace(/0$/, '')}`;
}
function fmtDate(s) {
  if (!s) return '';
  const d = new Date(String(s).includes('T') ? s : String(s).replace(' ', 'T'));
  if (isNaN(d.getTime())) return esc(s);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// The exact three pricing-basis sentences from the IMG Excel offer, chosen from
// the quotation's pricing_mode (basis label or the salesman's project-nature text).
function basisSentence(pricingMode, currency) {
  const m = String(pricingMode || '').toLowerCase();
  const cur = currency === 'JOD' ? 'Jordanian Dinars' : currency;
  if (/(exempt.*customs|customs.*exempt|fully exempt|^exempt$)/.test(m))
    return `Prices are in ${cur}, excluding customs duties and sales tax.`;
  if (/tax exempt|stax|sales-tax exempt|sales tax exempt/.test(m))
    return `Prices are in ${cur}, including customs duties and excluding sales tax.`;
  return `Prices are in ${cur}, including customs duties and 16% sales tax.`;
}

function renderQuotationDoc(data = {}) {
  const {
    reference = '', quote_date = '', project_name = '', city = 'Amman', project_type = '',
    brand = '', pricing_mode = '', sales_engineer_name = '', design_engineer_name = '',
    intro_text = '', maintenance_text = '', tnc_text = '',
    org_name = '', contact_name = '', currency = 'JOD',
    line_items = [], logoDataUri = '',
  } = data;
  const brandName = brand || 'GREE';

  // Group line items into category sections (first-seen order).
  const sections = [];
  const idx = {};
  line_items.forEach((li) => {
    const cat = li.category || 'Items';
    if (!(cat in idx)) { idx[cat] = sections.length; sections.push({ name: cat, items: [], total: 0 }); }
    const s = sections[idx[cat]];
    s.items.push(li);
    s.total += Number(li.subtotal) || 0;
  });
  const grand = sections.reduce((a, s) => a + s.total, 0);
  const basisLine = basisSentence(pricing_mode, currency);

  const logo = logoDataUri
    ? `<img src="${logoDataUri}" alt="Izzat Marji Group" style="height:56px;" />`
    : `<div style="font-size:20pt;font-weight:bold;color:${GREEN_DARK};">Izzat Marji Group</div>`;

  // Header band (every page) + footer (every page).
  const bandTop = `
    <table style="width:100%;border-bottom:3px solid ${ORANGE};padding-bottom:8px;"><tr>
      <td style="vertical-align:middle;">${logo}</td>
      <td style="text-align:right;vertical-align:middle;">
        <div style="font-size:8.5pt;color:${MUTE};letter-spacing:.18em;text-transform:uppercase;">HVAC Business Unit</div>
        <div style="font-size:15pt;font-weight:bold;color:${GREEN_DARK};letter-spacing:.02em;">Commercial Proposal</div>
        ${reference ? `<div style="font-size:8.5pt;color:${MUTE};margin-top:2px;">Ref. ${esc(reference)}${quote_date ? ' · ' + fmtDate(quote_date) : ''}</div>` : ''}
      </td>
    </tr></table>`;
  const footer = `
    <div style="margin-top:10px;border-top:1px solid ${LINE};padding-top:6px;font-size:8pt;color:${MUTE};text-align:center;">
      Izzat Marji Group · HVAC Business Unit · 06 55 000 22 · www.marji.jo · 163 King Abdullah II St., Amman · CONFIDENTIAL
    </div>`;
  const sectionTitle = (kicker, title) => `
    <div style="page-break-inside:avoid;border-bottom:2px solid ${GREEN_DARK};padding-bottom:5px;margin:16px 0 12px;">
      <div style="font-size:8.5pt;color:${MUTE};letter-spacing:.12em;text-transform:uppercase;">${kicker}</div>
      <div style="font-size:16pt;font-weight:bold;color:${GREEN_DARK};">${title}</div>
    </div>`;

  // ── Page 1 — Cover (branding + title + meta; NO price) ──────────────────
  const metaCell = (k, v) => `<td style="padding:4px 22px 4px 0;font-size:8pt;color:${MUTE};text-transform:uppercase;letter-spacing:.07em;white-space:nowrap;">${esc(k)}</td><td style="padding:4px 34px 4px 0;font-size:10.5pt;color:${INK};font-weight:600;">${v ? esc(v) : '—'}</td>`;
  const cover = `
  ${bandTop}
  <div style="margin-top:110px;text-align:center;">
    <div style="font-size:9.5pt;color:${MUTE};letter-spacing:.24em;text-transform:uppercase;">Commercial Proposal for</div>
    <div style="font-size:26pt;font-weight:bold;color:${GREEN_DARK};line-height:1.15;margin-top:10px;">${esc(project_name || 'HVAC System')}</div>
    ${project_type ? `<div style="font-size:12.5pt;color:${GREEN};font-weight:600;margin-top:6px;">${esc(project_type)}</div>` : ''}
    <div style="border-top:3px solid ${ORANGE};width:110px;margin:26px auto 0;"></div>
  </div>
  <table style="margin:44px auto 0;">
    <tr>${metaCell('Prepared for', org_name)}${metaCell('Reference', reference)}</tr>
    <tr>${metaCell('Attention', contact_name)}${metaCell('Date', fmtDate(quote_date))}</tr>
    <tr>${metaCell('City', city)}${metaCell('Brand', brandName)}</tr>
    <tr>${metaCell('Sales engineer', sales_engineer_name)}${metaCell('Design engineer', design_engineer_name)}</tr>
  </table>
  <div style="margin-top:140px;">${footer}</div>`;

  // ── Page 2 — Total Investment (own page, first thing after the cover) ───
  const summaryRows = sections.map(s => `<tr>
      <td style="padding:8px 12px;border:1px solid ${LINE};font-size:10.5pt;">${esc(s.name)}</td>
      <td style="padding:8px 12px;border:1px solid ${LINE};font-size:10.5pt;text-align:right;font-weight:600;white-space:nowrap;">${money(s.total)}</td>
    </tr>`).join('');
  const totalPage = `
  ${bandTop}
  ${sectionTitle('Commercial Summary', 'Total Investment')}
  <div style="background:${SOFT};border:1px solid ${LINE};border-left:6px solid ${ORANGE};padding:18px 20px;">
    <table style="width:100%;"><tr>
      <td style="vertical-align:middle;font-size:11pt;color:${MUTE};text-transform:uppercase;letter-spacing:.1em;">Total investment for ${esc(project_name || 'the project')}</td>
      <td style="vertical-align:middle;text-align:right;font-size:26pt;font-weight:bold;color:${GREEN_DARK};white-space:nowrap;">${money(grand)} <span style="font-size:12pt;color:${MUTE};">${esc(currency)}</span></td>
    </tr></table>
  </div>
  <table style="width:100%;border-collapse:collapse;margin-top:18px;">
    <tr>
      <th style="background:${GREEN_DARK};color:#fff;font-size:9pt;padding:8px 12px;border:1px solid ${GREEN_DARK};text-align:left;">Section</th>
      <th style="background:${GREEN_DARK};color:#fff;font-size:9pt;padding:8px 12px;border:1px solid ${GREEN_DARK};text-align:right;">Total (${esc(currency)})</th>
    </tr>
    ${summaryRows}
    <tr>
      <td style="padding:9px 12px;border:1px solid ${LINE};font-weight:bold;background:${SOFT};">Grand Total</td>
      <td style="padding:9px 12px;border:1px solid ${LINE};font-weight:bold;font-size:12pt;text-align:right;background:${ORANGE};color:#fff;white-space:nowrap;">${money(grand)}</td>
    </tr>
  </table>
  <div style="margin-top:14px;font-size:9.5pt;color:${MUTE};line-height:1.6;">
    ${esc(basisLine)} Detailed schedules of quantities for each section follow.
  </div>
  ${footer}`;

  // ── Page 3 — Introduction (real IMG letter) ─────────────────────────────
  const bullet = (t) => `<tr>
    <td style="width:16px;vertical-align:top;padding:2px 0;"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${ORANGE};margin-top:6px;"></span></td>
    <td style="padding:2px 0;font-size:10.5pt;color:${INK};">${t}</td></tr>`;
  const introLetter = (intro_text && String(intro_text).trim())
    ? `<div style="font-size:10.5pt;line-height:1.7;text-align:justify;">${esc(intro_text)}</div>`
    : `<div style="font-size:11pt;line-height:1.7;"><b>We are pleased to offer you our commercial proposal for the advanced HVAC system produced by the world-leading manufacturer, ${esc(brandName)}.</b></div>`;
  const intro = `
  ${bandTop}
  <div style="margin-top:22px;font-size:10.5pt;">Dear ${contact_name ? esc(contact_name) : 'Sir/Madam'},</div>
  <div style="margin-top:10px;">${introLetter}</div>
  <div style="margin-top:20px;page-break-inside:avoid;">
    <div style="font-size:13pt;font-weight:bold;color:${GREEN_DARK};">About Izzat Marji Group</div>
    <div style="margin-top:6px;font-size:10.5pt;line-height:1.7;text-align:justify;">
      Izzat Marji Group (IMG), established in <b>1985</b>, started as a small private company and has grown to be
      one of Jordan's leading providers of integrated engineering solutions:
    </div>
    <table style="margin-top:8px;">
      ${bullet('Heating, Air Conditioning and Ventilation solutions')}
      ${bullet('Sanitary Fixtures, Bathroom &amp; Kitchen Accessories, and Solid Surfaces')}
      ${bullet('Mechanical, Electrical and Plumbing Systems (MEP)')}
      ${bullet('Renewable Energy and Energy-Efficiency Systems')}
    </table>
  </div>
  <div style="margin-top:18px;page-break-inside:avoid;">
    <div style="font-size:13pt;font-weight:bold;color:${GREEN_DARK};">Heating, Air Conditioning &amp; Ventilation Business Unit</div>
    <div style="margin-top:6px;font-size:10.5pt;line-height:1.6;"><b style="color:${GREEN};">Mission</b><br/>To provide the Jordanian market with up-to-date, quality-oriented HVAC and dehumidification solutions.</div>
    <div style="margin-top:8px;font-size:10.5pt;line-height:1.6;"><b style="color:${GREEN};">Vision</b><br/>To be the first destination for HVAC and dehumidification stakeholders within the coming five years.</div>
  </div>
  <table style="width:100%;margin-top:36px;page-break-inside:avoid;"><tr>
    <td style="vertical-align:bottom;font-size:10pt;">
      <div style="font-weight:bold;">Dani Marji</div>
      <div style="color:${MUTE};">HVAC Business Unit — General Manager</div>
    </td>
    <td style="vertical-align:bottom;font-size:10pt;text-align:right;">
      <div><b>Sales Engineer:</b> ${sales_engineer_name ? esc(sales_engineer_name) : '—'}</div>
      <div><b>Design Engineer:</b> ${design_engineer_name ? esc(design_engineer_name) : '—'}</div>
    </td>
  </tr></table>
  ${footer}`;

  // ── Page 4+ — one page per category section ─────────────────────────────
  const td = `padding:6px 8px;border:1px solid ${LINE};font-size:9.5pt;vertical-align:top;`;
  const tdR = td + 'text-align:right;white-space:nowrap;';
  const sectionPage = (s, n) => {
    const rows = s.items.map((li, i) => {
      const desc = li.model && li.description ? `<b>${esc(li.model)}</b><br/><span style="color:${MUTE};">${esc(li.description)}</span>`
        : esc(li.model || li.description || '');
      return `<tr>
        <td style="${td}text-align:center;color:${MUTE};">${String(i + 1).padStart(2, '0')}</td>
        <td style="${td}">${desc}</td>
        <td style="${td}text-align:center;">${esc(li.unit || '')}</td>
        <td style="${tdR}">${esc(li.qty != null ? li.qty : '')}</td>
        <td style="${tdR}">${money(li.unit_price)}</td>
        <td style="${tdR}font-weight:bold;">${money(li.subtotal)}</td>
      </tr>`;
    }).join('');
    return `
    ${sectionTitle(`Schedule of Quantities · Section ${n + 1} of ${sections.length}`, esc(s.name))}
    <table style="width:100%;border-collapse:collapse;">
      <tr>${['#', 'Item description', 'Unit', 'Qty', 'Unit price', 'Total'].map((h, i) =>
        `<th style="background:${GREEN_DARK};color:#fff;font-size:8.5pt;padding:7px 8px;border:1px solid ${GREEN_DARK};text-align:${i >= 3 ? 'right' : i === 2 ? 'center' : 'left'};">${h}</th>`).join('')}</tr>
      ${rows}
      <tr>
        <td colspan="5" style="${tdR}font-weight:bold;background:${SOFT};">${esc(s.name)} subtotal (${esc(currency)})</td>
        <td style="${tdR}font-weight:bold;background:${ORANGE};color:#fff;">${money(s.total)}</td>
      </tr>
    </table>`;
  };
  const sectionPages = sections.map((s, n) => `<div style="page-break-before:always;">${bandTop}${sectionPage(s, n)}${footer}</div>`).join('');

  // ── Last — Commercial Terms, Warranty & Maintenance, Notes ──────────────
  const termLines = (tnc_text && String(tnc_text).trim())
    ? String(tnc_text).split(/\r?\n/).filter(Boolean).map(t => `<div style="margin:3px 0;">${esc(t)}</div>`).join('')
    : `<div style="margin:3px 0;"><b>Payment:</b> 30% advance with the order · 60% on delivery · 10% on commissioning.</div>
       <div style="margin:3px 0;"><b>Delivery:</b> 8–10 weeks from receipt of the confirmed purchase order.</div>
       <div style="margin:3px 0;"><b>Validity:</b> this offer is valid for 30 days from the issue date.</div>`;
  const warrantyBlock = (maintenance_text && String(maintenance_text).trim())
    ? `<div style="font-size:10pt;line-height:1.7;">${esc(maintenance_text).replace(/\n/g, '<br/>')}</div>`
    : `<div style="font-size:10pt;line-height:1.7;">
        <div><b>Factory warranty:</b> as per the manufacturer's standard warranty for ${esc(brandName)} equipment.</div>
        <div><b>Preventive maintenance:</b> scheduled visits during the warranty period as agreed in the contract.</div>
       </div>`;
  const terms = `<div style="page-break-before:always;">${bandTop}
    ${sectionTitle('Commercial', 'Terms &amp; Conditions')}
    <div style="font-size:10pt;line-height:1.7;">${termLines}</div>
    <div style="margin-top:18px;page-break-inside:avoid;">
      <div style="font-size:12pt;font-weight:bold;color:${GREEN_DARK};margin-bottom:4px;">Warranty &amp; Maintenance</div>
      ${warrantyBlock}
    </div>
    <div style="margin-top:18px;page-break-inside:avoid;">
      <div style="font-size:12pt;font-weight:bold;color:${GREEN_DARK};margin-bottom:4px;">Notes</div>
      <div style="font-size:10pt;line-height:1.7;">
        <div style="margin:3px 0;">${esc(basisLine)}</div>
        <div style="margin:3px 0;">Scope covers the supply of the listed equipment; installation and commissioning are included only where a corresponding line item appears in the schedule of quantities.</div>
        <div style="margin:3px 0;">Quantities are as per the design schedule; any variation on site will be re-measured and priced at the unit rates above.</div>
      </div>
    </div>
    ${footer}</div>`;

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc(reference || project_name || 'Quotation')}</title>
<style>
  @page { size: A4; margin: 1.5cm 1.6cm; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: ${INK}; font-size: 10pt; line-height: 1.5; }
  table { border-collapse: collapse; }
</style></head>
<body>
  ${cover}
  <div style="page-break-before:always;">${totalPage}</div>
  <div style="page-break-before:always;">${intro}</div>
  ${sectionPages}
  ${terms}
</body></html>`;
}

module.exports = { renderQuotationDoc };
