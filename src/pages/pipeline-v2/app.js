'use strict';

/* ── Config ──────────────────────────────────────────────── */
const API_BASE = (window.location.protocol === 'http:' && window.location.hostname !== '')
  ? window.location.origin
  : 'http://localhost:4000';

const STAGES = ['Prospect', 'Tender', 'Analysis', 'Negotiation', 'Closing'];
const STAGE_COLORS = {
  Prospect:    '#7b52d0',
  Tender:      '#0086c0',
  Analysis:    '#00a99d',
  Negotiation: '#0073ea',
  Closing:     '#00854d',
};
const STATUS_MAP = {
  done:        { label: 'Done',           cls: 'status-done'       },
  working:     { label: 'Working on it',  cls: 'status-working'    },
  stuck:       { label: 'Stuck',          cls: 'status-stuck'      },
  notstarted:  { label: 'Not started',    cls: 'status-notstarted' },
};

/* ── Sample data ─────────────────────────────────────────── */
const SAMPLE = [
  {
    id: 1, title: 'Amman Tower HVAC', expected_value: 125000, currency: 'JOD',
    stage: 'Prospect', salesman_name: 'Yazan', salesman_id: 3,
    subitems: [
      { id: 11, title: 'Site visit scheduled', status: 'done' },
      { id: 12, title: 'Send proposal draft',  status: 'working' },
    ],
  },
  {
    id: 2, title: 'Royal Hotel VRF System', expected_value: 87500, currency: 'JOD',
    stage: 'Prospect', salesman_name: 'Mahmoud', salesman_id: 4,
    subitems: [],
  },
  {
    id: 3, title: 'Abdali Mall Chillers', expected_value: 310000, currency: 'JOD',
    stage: 'Tender', salesman_name: 'Yazan', salesman_id: 3,
    subitems: [
      { id: 31, title: 'Reach out to Madison', status: 'working' },
      { id: 32, title: 'Task 2',               status: 'done'    },
      { id: 33, title: 'Task 3',               status: 'done'    },
    ],
  },
  {
    id: 4, title: 'Embassy Compound AC', expected_value: 55000, currency: 'USD',
    stage: 'Tender', salesman_name: 'Mahmoud', salesman_id: 4,
    subitems: [
      { id: 41, title: 'Follow up with client', status: 'notstarted' },
    ],
  },
  {
    id: 5, title: 'King Hussein Park', expected_value: 95000, currency: 'JOD',
    stage: 'Analysis', salesman_name: 'Yazan', salesman_id: 3,
    subitems: [],
  },
  {
    id: 6, title: 'Zara Investment Tower', expected_value: 220000, currency: 'JOD',
    stage: 'Analysis', salesman_name: 'Mahmoud', salesman_id: 4,
    subitems: [
      { id: 61, title: 'Technical review',  status: 'stuck'   },
      { id: 62, title: 'Cost calculation',  status: 'working' },
    ],
  },
  {
    id: 7, title: 'Mecca St. Showroom', expected_value: 42000, currency: 'JOD',
    stage: 'Negotiation', salesman_name: 'Yazan', salesman_id: 3,
    subitems: [
      { id: 71, title: 'Finalize discount terms', status: 'working' },
    ],
  },
  {
    id: 8, title: 'Airport Road Offices', expected_value: 175000, currency: 'JOD',
    stage: 'Negotiation', salesman_name: 'Mahmoud', salesman_id: 4,
    subitems: [],
  },
  {
    id: 9, title: 'University Hospital', expected_value: 480000, currency: 'JOD',
    stage: 'Closing', salesman_name: 'Yazan', salesman_id: 3,
    subitems: [
      { id: 91, title: 'Contract signing',   status: 'working' },
      { id: 92, title: 'Deposit received',   status: 'notstarted' },
    ],
  },
];

/* ── State ───────────────────────────────────────────────── */
let deals      = [];
let token      = null;
let isDemoMode = false;
let dragSrcId  = null;
let openSubitemPanels = new Set();
let ctxDealId  = null;

/* ── SVG Icons ───────────────────────────────────────────── */
const IC = {
  search:   svg('M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z', 14),
  person:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  filter:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
  sort:     `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="7" y2="18"/></svg>`,
  chat:     svg('M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z', 13),
  phone:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13 19.79 19.79 0 0 1 1.61 4.4 2 2 0 0 1 3.6 2.22h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.29 6.29l.95-.95a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  more:     `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>`,
  edit:     svg('M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z', 13),
  plus:     svg('M12 5v14M5 12h14', 13),
  grid:     `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`,
  arrowRight: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
  arrowUp:  `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>`,
  openDeal: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
  moveTo:   `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
  duplicate:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  copyName: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h3"/><path d="M4 20v3h3"/><path d="M20 7V4h-3"/><path d="M20 20v3h-3"/><line x1="9" y1="12" x2="15" y2="12"/></svg>`,
  copyLink: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  addSub:   `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="9" y1="10" x2="15" y2="10"/><line x1="12" y1="7" x2="12" y2="13"/></svg>`,
  customize:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>`,
  archive:  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`,
  trash:    `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`,
  collapse: svg('M4 14l6 0 0 6M20 10l-6 0 0-6M10 14l-7 7M21 3l-7 7', 14),
  expand:   svg('M15 3l6 0 0 6M9 21l-6 0 0-6M21 3l-7 7M3 21l7-7', 14),
};

function svg(d, size = 14) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}

/* ── Helpers ─────────────────────────────────────────────── */
function fmtMoney(v, cur = 'JOD') {
  const n = Number(v) || 0;
  if (n >= 1_000_000) return `$${(n/1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n/1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}
function initials(name) {
  return (name || '?').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}
function avClass(id) { return `av-${(id || 0) % 8}`; }
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function nextSubitemId() { return Date.now(); }

/* ── Auth ────────────────────────────────────────────────── */
async function loadDeals() {
  token = localStorage.getItem('img_token');
  if (!token) { useDemo(); render(); return; }
  try {
    const res = await fetch(`${API_BASE}/api/opportunities?status=Active`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error();
    const raw = await res.json();
    deals = raw.map(d => ({ ...d, subitems: d.subitems || [] }));
    isDemoMode = false;
  } catch {
    useDemo();
  }
  render();
}
function useDemo() {
  isDemoMode = true;
  deals = JSON.parse(JSON.stringify(SAMPLE)); // deep copy
  document.getElementById('connectBar').style.display = 'flex';
}

/* ══════════════════════════════════════════════════
   RENDER
══════════════════════════════════════════════════ */
function render() {
  const board = document.getElementById('board');
  board.innerHTML = '';
  STAGES.forEach(stage => {
    const sd   = deals.filter(d => d.stage === stage);
    const total = sd.reduce((s, d) => s + (Number(d.expected_value) || 0), 0);
    const cur   = sd[0]?.currency || 'JOD';
    board.appendChild(buildColumn(stage, sd, total, cur));
  });
}

/* ══════════════════════════════════════════════════
   COLUMN
══════════════════════════════════════════════════ */
function buildColumn(stage, sd, total, currency) {
  const col = document.createElement('div');
  col.className = 'column';
  col.setAttribute('data-stage', stage);

  /* header */
  const hdr = document.createElement('div');
  hdr.className = 'col-header';
  hdr.innerHTML = `
    <div class="col-header-left">
      <span class="col-title">${stage}</span>
      <span class="col-count">${sd.length}</span>
    </div>
    <button class="col-header-menu" title="Column options">${IC.more}</button>
  `;
  col.appendChild(hdr);

  /* sum */
  const sumRow = document.createElement('div');
  sumRow.className = 'col-sum';
  sumRow.innerHTML = `<strong>${fmtMoney(total, currency)}</strong> sum`;
  col.appendChild(sumRow);

  /* body */
  const body = document.createElement('div');
  body.className = 'col-body';
  body.setAttribute('data-stage', stage);

  /* drop hint */
  const hint = document.createElement('div');
  hint.className = 'drop-hint';
  hint.innerHTML = `${IC.plus} Drop here`;
  body.appendChild(hint);

  /* drag events */
  body.addEventListener('dragover', e => { e.preventDefault(); body.classList.add('drag-over'); });
  body.addEventListener('dragleave', e => { if (!body.contains(e.relatedTarget)) body.classList.remove('drag-over'); });
  body.addEventListener('drop', e => {
    e.preventDefault();
    body.classList.remove('drag-over');
    if (dragSrcId == null) return;
    const deal = deals.find(d => d.id === dragSrcId);
    if (!deal || deal.stage === stage) return;
    deal.stage = stage;
    if (!isDemoMode) apiMoveStage(deal.id, stage);
    render();
  });

  /* cards */
  if (sd.length === 0) {
    const emp = document.createElement('div');
    emp.className = 'col-empty';
    emp.textContent = 'No deals in this stage';
    body.appendChild(emp);
  } else {
    sd.forEach(deal => body.appendChild(buildCard(deal)));
  }

  /* add button */
  const addBtn = document.createElement('button');
  addBtn.className = 'col-add';
  addBtn.innerHTML = `${IC.plus} Add deal`;
  addBtn.onclick = () => promptAddDeal(stage);
  body.appendChild(addBtn);

  col.appendChild(body);
  return col;
}

/* ══════════════════════════════════════════════════
   DEAL CARD
══════════════════════════════════════════════════ */
function buildCard(deal) {
  const card = document.createElement('div');
  card.className = 'deal-card';
  card.draggable = true;
  card.setAttribute('data-id', deal.id);

  const personName = deal.salesman_name || deal.contact_name || '—';
  const personId   = deal.salesman_id || 0;
  const subCount   = (deal.subitems || []).length;
  const isOpen     = openSubitemPanels.has(deal.id);

  card.innerHTML = `
    <!-- Top row: name + hover buttons -->
    <div class="card-top">
      <div class="card-name">${esc(deal.title)}</div>
      <div class="card-hover-btns">
        <button class="card-action-btn" title="Edit" data-action="edit">${IC.edit}</button>
        <button class="card-action-btn" title="More options" data-action="more">${IC.more}</button>
      </div>
    </div>

    <!-- Field pills -->
    <div class="card-fields">
      <div class="field-pill value-pill">
        <span class="pill-label">${fmtMoney(deal.expected_value, deal.currency)}</span>
        <button class="pill-icon-btn" title="Currency">$</button>
        <button class="pill-remove" title="Clear value">×</button>
      </div>
      <div class="field-pill person-pill">
        <span class="pill-arrow">${IC.arrowUp}</span>
        <span class="pill-name">${esc(personName)}</span>
        <button class="pill-remove" title="Remove person">×</button>
      </div>
    </div>

    <!-- Footer -->
    <div class="card-footer">
      <div class="card-footer-left">
        <button class="card-icon-btn" title="Assignee">${IC.person}</button>
      </div>
      <div class="card-footer-right">
        <button class="card-icon-btn" title="Comment">${IC.chat}</button>
        ${subCount > 0
          ? `<button class="subitems-count-btn ${isOpen ? 'active' : ''}" title="Sub-deals" data-action="subitems">${subCount} ${IC.grid}</button>`
          : `<button class="subitems-count-btn" title="Sub-deals" data-action="subitems">${IC.grid}</button>`
        }
      </div>
    </div>

    <!-- Subitems panel -->
    <div class="subitems-panel ${isOpen ? 'open' : ''}">
      ${(deal.subitems || []).map(si => buildSubitemHTML(si)).join('')}
      <button class="add-subitem-btn" data-action="add-subitem">
        ${IC.plus} Add sub-deal
      </button>
    </div>
  `;

  /* drag */
  card.addEventListener('dragstart', e => {
    dragSrcId = deal.id;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    dragSrcId = null;
  });

  /* click delegation */
  card.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.stopPropagation();

    const action = btn.dataset.action;
    if (action === 'more')       { showContextMenu(e, deal.id); return; }
    if (action === 'edit')       { openDeal(deal.id); return; }
    if (action === 'subitems')   { toggleSubitems(deal.id, card); return; }
    if (action === 'add-subitem'){ addSubitem(deal.id, card); return; }
  });

  /* prevent drag when clicking buttons */
  card.querySelectorAll('button, .field-pill').forEach(el => {
    el.addEventListener('mousedown', e => e.stopPropagation());
  });

  return card;
}

/* ── Subitem HTML ──────────────────────────────────────────── */
function buildSubitemHTML(si) {
  const s = STATUS_MAP[si.status] || STATUS_MAP.notstarted;
  return `
    <div class="subitem-card">
      <div class="subitem-title">${esc(si.title)}</div>
      <div class="subitem-status ${s.cls}">
        <div class="status-bar"></div>
        <span class="status-label">${s.label}</span>
      </div>
    </div>
  `;
}

/* ── Toggle subitems ──────────────────────────────────────── */
function toggleSubitems(dealId, card) {
  const panel = card.querySelector('.subitems-panel');
  const btn   = card.querySelector('[data-action="subitems"]');
  if (openSubitemPanels.has(dealId)) {
    openSubitemPanels.delete(dealId);
    panel.classList.remove('open');
    btn.classList.remove('active');
  } else {
    openSubitemPanels.add(dealId);
    panel.classList.add('open');
    btn.classList.add('active');
  }
}

/* ── Add subitem ──────────────────────────────────────────── */
function addSubitem(dealId, card) {
  const title = prompt('Sub-deal title:');
  if (!title?.trim()) return;

  const deal = deals.find(d => d.id === dealId);
  if (!deal) return;

  const statuses = Object.keys(STATUS_MAP);
  const statusChoice = prompt(
    `Status:\n${statuses.map((s, i) => `${i+1}. ${STATUS_MAP[s].label}`).join('\n')}\n\nEnter number (default 1):`,
    '1'
  );
  const statusKey = statuses[(parseInt(statusChoice) || 1) - 1] || 'notstarted';

  const subitem = { id: nextSubitemId(), title: title.trim(), status: statusKey };
  deal.subitems = [...(deal.subitems || []), subitem];

  // Ensure panel stays open
  openSubitemPanels.add(dealId);

  // Re-render just this card
  const col   = card.closest('.col-body');
  const stage = col?.dataset.stage;
  if (stage) render(); else card.replaceWith(buildCard(deal));
}

/* ══════════════════════════════════════════════════
   CONTEXT MENU
══════════════════════════════════════════════════ */
let ctxOverlay = null;
let ctxMenu    = null;

function showContextMenu(e, dealId) {
  e.preventDefault();
  hideContextMenu();
  ctxDealId = dealId;
  const deal = deals.find(d => d.id === dealId);
  if (!deal) return;

  /* overlay */
  ctxOverlay = document.createElement('div');
  ctxOverlay.className = 'ctx-overlay';
  ctxOverlay.addEventListener('click',       hideContextMenu);
  ctxOverlay.addEventListener('contextmenu', hideContextMenu);
  document.body.appendChild(ctxOverlay);

  /* menu */
  ctxMenu = document.createElement('div');
  ctxMenu.className = 'ctx-menu';

  const otherStages = STAGES.filter(s => s !== deal.stage);

  ctxMenu.innerHTML = `
    <div class="ctx-item" data-ctx="open">
      <span class="ctx-icon">${IC.openDeal}</span> Open Deal
    </div>

    <div class="ctx-item ctx-submenu" data-ctx="moveto">
      <span class="ctx-icon">${IC.moveTo}</span> Move to
      <span class="ctx-arrow">${IC.arrowRight}</span>
      <div class="ctx-submenu-panel">
        ${otherStages.map(s => `
          <div class="ctx-submenu-item" data-ctx-move="${esc(s)}">
            <span class="ctx-stage-dot" style="background:${STAGE_COLORS[s]}"></span>
            ${s}
          </div>
        `).join('')}
      </div>
    </div>

    <div class="ctx-item ctx-submenu" data-ctx="duplicate">
      <span class="ctx-icon">${IC.duplicate}</span> Duplicate
      <span class="ctx-arrow">${IC.arrowRight}</span>
      <div class="ctx-submenu-panel">
        ${STAGES.map(s => `
          <div class="ctx-submenu-item" data-ctx-dup="${esc(s)}">
            <span class="ctx-stage-dot" style="background:${STAGE_COLORS[s]}"></span>
            ${s}
          </div>
        `).join('')}
      </div>
    </div>

    <div class="ctx-item" data-ctx="copyname">
      <span class="ctx-icon">${IC.copyName}</span> Copy name
    </div>

    <div class="ctx-item" data-ctx="copylink">
      <span class="ctx-icon">${IC.copyLink}</span> Copy Deal link
    </div>

    <div class="ctx-divider"></div>

    <div class="ctx-item" data-ctx="addsubitem">
      <span class="ctx-icon">${IC.addSub}</span> Add subitem
    </div>

    <div class="ctx-divider"></div>

    <div class="ctx-item" data-ctx="customize">
      <span class="ctx-icon">${IC.customize}</span> Customize cards
    </div>

    <div class="ctx-item" data-ctx="archive">
      <span class="ctx-icon">${IC.archive}</span> Archive
    </div>

    <div class="ctx-item danger" data-ctx="delete">
      <span class="ctx-icon">${IC.trash}</span> Delete
    </div>
  `;

  /* position */
  document.body.appendChild(ctxMenu);
  const rect   = ctxMenu.getBoundingClientRect();
  const menuW  = 220;
  const menuH  = 340;
  let left = e.clientX;
  let top  = e.clientY;
  if (left + menuW > window.innerWidth)  left = window.innerWidth  - menuW - 8;
  if (top  + menuH > window.innerHeight) top  = window.innerHeight - menuH - 8;
  ctxMenu.style.left = `${left}px`;
  ctxMenu.style.top  = `${top}px`;

  /* actions */
  ctxMenu.addEventListener('click', e => {
    const item = e.target.closest('[data-ctx]');
    const move = e.target.closest('[data-ctx-move]');
    const dup  = e.target.closest('[data-ctx-dup]');

    if (move) { ctxMoveStage(dealId, move.dataset.ctxMove); hideContextMenu(); return; }
    if (dup)  { ctxDuplicate(dealId, dup.dataset.ctxDup);   hideContextMenu(); return; }
    if (!item) return;

    switch(item.dataset.ctx) {
      case 'open':      openDeal(dealId); break;
      case 'copyname':  navigator.clipboard?.writeText(deal.title).then(() => toast('Name copied!')); break;
      case 'copylink':  navigator.clipboard?.writeText(`${API_BASE}/api/opportunities/${dealId}`).then(() => toast('Link copied!')); break;
      case 'addsubitem': {
        const card = document.querySelector(`.deal-card[data-id="${dealId}"]`);
        hideContextMenu();
        if (card) addSubitem(dealId, card);
        return;
      }
      case 'customize': toast('Customize cards — coming soon'); break;
      case 'archive':   ctxArchive(dealId); break;
      case 'delete':    ctxDelete(dealId); break;
    }
    hideContextMenu();
  });
}

function hideContextMenu() {
  ctxOverlay?.remove(); ctxOverlay = null;
  ctxMenu?.remove();    ctxMenu    = null;
  ctxDealId = null;
}

/* ── Context actions ──────────────────────────────────────── */
function ctxMoveStage(dealId, stage) {
  const deal = deals.find(d => d.id === dealId);
  if (!deal) return;
  deal.stage = stage;
  if (!isDemoMode) apiMoveStage(dealId, stage);
  render();
}

function ctxDuplicate(dealId, stage) {
  const deal = deals.find(d => d.id === dealId);
  if (!deal) return;
  const copy = { ...deal, id: nextSubitemId(), title: deal.title + ' (copy)', stage, subitems: [] };
  deals.push(copy);
  render();
  toast(`Duplicated to ${stage}`);
}

function ctxArchive(dealId) {
  if (!confirm('Archive this deal?')) return;
  deals = deals.filter(d => d.id !== dealId);
  render();
  toast('Deal archived');
}

function ctxDelete(dealId) {
  const deal = deals.find(d => d.id === dealId);
  if (!confirm(`Delete "${deal?.title}"?`)) return;
  deals = deals.filter(d => d.id !== dealId);
  if (!isDemoMode) fetch(`${API_BASE}/api/opportunities/${dealId}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
  }).catch(() => {});
  render();
  toast('Deal deleted');
}

function openDeal(dealId) {
  if (window.navigate) { window.navigate('opportunity', dealId); return; }
  window.parent?.postMessage({ type: 'navigate', route: 'opportunity', id: dealId }, '*');
  if (!isDemoMode) window.open(`${API_BASE}/#opportunity/${dealId}`, '_blank');
  else toast(`Open deal #${dealId} — connect to CRM for full detail`);
}

/* ── Add deal ─────────────────────────────────────────────── */
function promptAddDeal(stage) {
  const title = prompt(`New deal title in ${stage}:`);
  if (!title?.trim()) return;
  const val = prompt('Expected value (JOD):');
  const newDeal = {
    id: nextSubitemId(), title: title.trim(),
    expected_value: Number(val) || 0, currency: 'JOD',
    stage, salesman_name: 'Me', salesman_id: 0,
    subitems: [],
  };
  deals.push(newDeal);
  if (!isDemoMode) apiCreateDeal(newDeal);
  render();
}

/* ── Toast ────────────────────────────────────────────────── */
function toast(msg) {
  const t = document.createElement('div');
  t.style.cssText = `
    position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
    background:#323338; color:#fff; padding:8px 18px;
    border-radius:6px; font-size:13px; z-index:99999;
    box-shadow:0 4px 16px rgba(0,0,0,0.2);
    animation: toastIn 150ms ease;
  `;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}

/* ── Search ───────────────────────────────────────────────── */
function setupSearch() {
  document.getElementById('searchBtn')?.addEventListener('click', () => {
    const q = prompt('Search deals:');
    if (q === null) return;
    if (!q.trim()) { render(); return; }
    const board = document.getElementById('board');
    board.innerHTML = '';
    STAGES.forEach(stage => {
      const sd = deals.filter(d => d.stage === stage && d.title.toLowerCase().includes(q.toLowerCase()));
      const total = sd.reduce((s, d) => s + (Number(d.expected_value) || 0), 0);
      board.appendChild(buildColumn(stage, sd, total, 'JOD'));
    });
  });
}

/* ── API calls ────────────────────────────────────────────── */
async function apiMoveStage(oppId, stage) {
  await fetch(`${API_BASE}/api/opportunities/${oppId}/stage`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to_stage: stage }),
  }).catch(() => {});
}
async function apiCreateDeal(deal) {
  await fetch(`${API_BASE}/api/opportunities`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: deal.title, expected_value: deal.expected_value, currency: deal.currency }),
  }).catch(() => {});
}

/* ── Init ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  setupSearch();
  document.getElementById('closeBar')?.addEventListener('click', () => {
    document.getElementById('connectBar').style.display = 'none';
  });
  loadDeals();
});
