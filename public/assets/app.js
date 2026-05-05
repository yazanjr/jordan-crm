/* ═══════════════════════════════════════════════════════════════════
   IMG CRM — Frontend SPA
   Routes, API layer, view renderers
═══════════════════════════════════════════════════════════════════ */

// ── Auth state ────────────────────────────────────────────────────────
let TOKEN = localStorage.getItem('img_token');
let USER  = JSON.parse(localStorage.getItem('img_user') || 'null');
let PERMS = new Set(JSON.parse(localStorage.getItem('img_perms') || '[]'));
let SETTINGS = {};
let IMI_URL  = '';

if (!TOKEN) { window.location.href = '/'; }

// ── API helper ────────────────────────────────────────────────────────
async function api(method, path, body, isFormData) {
  const opts = {
    method,
    headers: { Authorization: `Bearer ${TOKEN}` },
  };
  if (body && !isFormData) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (isFormData) {
    opts.body = body;
  }
  const res = await fetch('/api' + path, opts);
  if (res.status === 401) { logout(); return; }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function hasPerm(key) { return PERMS.has(key); }

// ── Toast ─────────────────────────────────────────────────────────────
function toast(msg, type = 'info', duration = 3500) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ── Modal helpers ─────────────────────────────────────────────────────
function openModal(title, bodyHTML, footerHTML) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML   = bodyHTML;
  document.getElementById('modalFooter').innerHTML = footerHTML || '';
  document.getElementById('modalOverlay').classList.add('open');
}
function closeModal(e) {
  if (e && e.target !== document.getElementById('modalOverlay')) return;
  document.getElementById('modalOverlay').classList.remove('open');
}

// ── Navigation ────────────────────────────────────────────────────────
const ROUTES = {
  'dashboard':        viewDashboard,
  'pipeline':         viewPipeline,
  'opportunities':    viewPipeline,
  'opportunity':      viewOpportunityDetail,
  'new-opportunity':  viewNewOpportunity,
  'contacts':         viewContacts,
  'organizations':    viewOrganizations,
  'design-queue':     viewDesignQueue,
  'quotation':        viewQuotationDetail,
  'approvals':        viewApprovals,
  'activities':       viewActivities,
  'notifications':    viewNotifications,
  'admin-users':      viewAdminUsers,
  'admin-roles':      viewAdminRoles,
  'admin-settings':   viewAdminSettings,
  'change-password':  viewChangePassword,
};

let currentRoute = '';
let routeParam   = null;

function navigate(route, param) {
  currentRoute = route;
  routeParam   = param || null;
  document.getElementById('userDropdown').classList.remove('open');
  document.getElementById('notifPanel').classList.remove('open');
  buildSidebar();
  const fn = ROUTES[route];
  if (fn) fn(param);
  else render('<div class="empty-state"><div class="icon">🔍</div><p>Page not found.</p></div>');
}

function render(html) {
  document.getElementById('mainContent').innerHTML = html;
}

function setTitle(t) {
  document.getElementById('topbarTitle').textContent = t;
  document.title = `${t} — IMG CRM`;
}

function openIMI() {
  if (IMI_URL) window.open(IMI_URL, '_blank');
  else toast('IMI Portal URL not configured. Set it in Admin → Settings.', 'error');
}

// ── Sidebar builder ───────────────────────────────────────────────────
function buildSidebar() {
  document.getElementById('sidebarUserName').textContent = USER?.name || '—';
  document.getElementById('sidebarRoleName').textContent = roleLabel(USER?.role);
  document.getElementById('userAvatar').textContent      = (USER?.name || '?')[0].toUpperCase();
  document.getElementById('userChipName').textContent    = USER?.name || '—';

  const items = getSidebarItems();
  const nav   = document.getElementById('sidebarNav');
  nav.innerHTML = items.map(item => {
    if (item.type === 'section') return `<div class="nav-section-label">${item.label}</div>`;
    const active = currentRoute === item.route ? 'active' : '';
    const badge  = item.badge ? `<span class="nav-badge">${item.badge}</span>` : '';
    return `<div class="nav-item ${active}" onclick="navigate('${item.route}')">
      <span class="nav-icon">${item.icon}</span>
      <span>${item.label}</span>
      ${badge}
    </div>`;
  }).join('');

  // IMI link
  if (IMI_URL) document.getElementById('imiLink').style.display = 'flex';
}

function getSidebarItems() {
  const role  = USER?.role;
  const items = [{ type: 'section', label: 'Main' }];

  items.push({ icon: '📊', label: 'Dashboard',     route: 'dashboard' });

  if (['admin','sales_manager','salesman'].includes(role)) {
    items.push({ icon: '📋', label: 'Pipeline',      route: 'pipeline' });
    items.push({ icon: '📅', label: 'Activities',    route: 'activities' });
  }
  if (['admin','sales_manager','salesman'].includes(role)) {
    items.push({ type: 'section', label: 'CRM' });
    items.push({ icon: '👤', label: 'Contacts',      route: 'contacts' });
    items.push({ icon: '🏢', label: 'Organizations', route: 'organizations' });
  }
  if (['admin','sales_manager'].includes(role)) {
    items.push({ icon: '✅', label: 'Approvals',     route: 'approvals' });
  }
  if (['admin','design_manager','designer'].includes(role)) {
    items.push({ type: 'section', label: 'Design' });
    items.push({ icon: '🎨', label: 'Design Queue',  route: 'design-queue' });
  }
  if (role === 'admin') {
    items.push({ type: 'section', label: 'Admin' });
    items.push({ icon: '👥', label: 'Users',         route: 'admin-users' });
    items.push({ icon: '🔑', label: 'Roles',         route: 'admin-roles' });
    items.push({ icon: '⚙️', label: 'Settings',      route: 'admin-settings' });
  }
  return items;
}

function roleLabel(r) {
  return { admin:'Administrator', sales_manager:'Sales Manager', salesman:'Salesman',
           design_manager:'Design Manager', designer:'Designer' }[r] || r || '—';
}

// ── User dropdown + notifications ────────────────────────────────────
function toggleUserDropdown() {
  document.getElementById('userDropdown').classList.toggle('open');
}
function toggleNotifPanel() {
  document.getElementById('notifPanel').classList.toggle('open');
  loadNotifications();
}
function logout() {
  localStorage.clear();
  window.location.href = '/';
}

// ── Notifications ─────────────────────────────────────────────────────
async function loadNotifications() {
  try {
    const data = await api('GET', '/notifications');
    const badge = document.getElementById('notifBadge');
    if (data.unread > 0) {
      badge.textContent = data.unread > 9 ? '9+' : data.unread;
      badge.classList.add('show');
    } else {
      badge.classList.remove('show');
    }
    document.getElementById('notifList').innerHTML = data.notifications.length === 0
      ? '<div class="empty-state" style="padding:40px"><p>No notifications</p></div>'
      : data.notifications.map(n => `
          <div class="notif-item ${n.is_read ? '' : 'unread'}" onclick="readNotif(${n.id},${n.opp_id})">
            <div class="notif-msg">${esc(n.message)}</div>
            <div class="notif-time">${timeAgo(n.created_at)}</div>
          </div>
        `).join('');
  } catch {}
}
async function readNotif(id, oppId) {
  await api('PUT', `/notifications/${id}/read`);
  if (oppId) navigate('opportunity', oppId);
  loadNotifications();
}
async function markAllRead() {
  await api('PUT', '/notifications/read-all');
  loadNotifications();
  toast('All notifications marked as read', 'success');
}

// ── Socket.io ─────────────────────────────────────────────────────────
const socket = io();
socket.emit('join', USER?.id);
socket.on('notification', () => loadNotifications());

// ── Utility helpers ───────────────────────────────────────────────────
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtMoney(v, cur = 'JOD') {
  return `${Number(v || 0).toLocaleString('en-JO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${cur}`;
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}
function timeAgo(d) {
  const diff = (Date.now() - new Date(d)) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}
function stagePill(s) {
  const cls = { Prospect:'prospect', Tender:'tender', Analysis:'analysis',
                Negotiation:'negotiation', Closing:'closing', Won:'won', Lost:'lost' }[s] || 'draft';
  return `<span class="pill pill-${cls}">${s}</span>`;
}
function statusPill(s) {
  if (s === 'Active') return `<span class="pill pill-active">Active</span>`;
  if (s === 'Won')    return `<span class="pill pill-won">Won ✓</span>`;
  if (s === 'Lost')   return `<span class="pill pill-lost">Lost ✗</span>`;
  return `<span class="pill">${s}</span>`;
}
function quotStatusPill(s) {
  const cls = { Draft:'draft', UnderReview:'underreview', Approved:'approved',
                Released:'released', RevisionRequested:'revisionrequested' }[s] || 'draft';
  const labels = { Draft:'Draft', UnderReview:'Under Review', Approved:'Approved',
                   Released:'Released', RevisionRequested:'Revision Req.' };
  return `<span class="pill pill-${cls}">${labels[s] || s}</span>`;
}

// ── Stage colors ──────────────────────────────────────────────────────
const STAGE_COLORS = {
  Prospect:'#3B82F6', Tender:'#8B5CF6', Analysis:'#F59E0B', Negotiation:'#F97316', Closing:'#10B981',
};

// ════════════════════════════════════════════════════════════════════════
// VIEWS
// ════════════════════════════════════════════════════════════════════════

// ── Dashboard ─────────────────────────────────────────────────────────
async function viewDashboard() {
  setTitle('Dashboard');
  render('<div style="display:flex;align-items:center;justify-content:center;height:200px"><div class="spinner"></div></div>');
  try {
    const [opps, pending] = await Promise.all([
      api('GET', '/opportunities'),
      hasPerm('disc.approve_override') ? api('GET', '/approvals/pending') : Promise.resolve([]),
    ]);
    const active = opps.filter(o => o.status === 'Active');
    const won    = opps.filter(o => o.status === 'Won');
    const lost   = opps.filter(o => o.status === 'Lost');
    const pipeVal = active.reduce((s,o) => s + (o.expected_value||0), 0);
    const wonVal  = won.reduce((s,o) => s + (o.expected_value||0), 0);
    const weighted = active.reduce((s,o) => {
      const rates = {Prospect:.25,Tender:.4,Analysis:.5,Negotiation:.75,Closing:.9};
      return s + (o.expected_value||0) * (rates[o.stage]||0);
    }, 0);

    const byStage = {};
    ['Prospect','Tender','Analysis','Negotiation','Closing'].forEach(s => {
      byStage[s] = active.filter(o => o.stage === s).length;
    });

    render(`
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Pipeline Value</div>
          <div class="kpi-value">${Number(pipeVal).toLocaleString('en')}</div>
          <div class="kpi-sub">JOD — ${active.length} active</div>
        </div>
        <div class="kpi-card blue">
          <div class="kpi-label">Weighted Forecast</div>
          <div class="kpi-value">${Number(weighted).toLocaleString('en')}</div>
          <div class="kpi-sub">JOD probability-adjusted</div>
        </div>
        <div class="kpi-card green">
          <div class="kpi-label">Won</div>
          <div class="kpi-value">${won.length}</div>
          <div class="kpi-sub">${Number(wonVal).toLocaleString('en')} JOD</div>
        </div>
        <div class="kpi-card amber">
          <div class="kpi-label">Pending Approvals</div>
          <div class="kpi-value">${Array.isArray(pending) ? pending.length : 0}</div>
          <div class="kpi-sub">Discount overrides</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px">
        <div class="card">
          <div class="card-header"><span class="card-title">Pipeline by Stage</span></div>
          <div class="card-body">
            ${['Prospect','Tender','Analysis','Negotiation','Closing'].map(s => `
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
                <div style="width:10px;height:10px;border-radius:50%;background:${STAGE_COLORS[s]};flex-shrink:0"></div>
                <span style="flex:1;font-size:12px">${s}</span>
                <div style="flex:2;background:var(--bg);border-radius:4px;height:6px;overflow:hidden">
                  <div style="height:100%;border-radius:4px;background:${STAGE_COLORS[s]};width:${active.length ? Math.round((byStage[s]||0)/active.length*100) : 0}%"></div>
                </div>
                <span style="font-size:11px;font-weight:700;color:var(--text-mid);width:20px;text-align:right">${byStage[s]||0}</span>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">Recent Opportunities</span></div>
          <div class="card-body" style="padding:0">
            ${active.slice(0,5).map(o => `
              <div style="padding:12px 18px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .1s" onclick="navigate('opportunity',${o.id})" onmouseover="this.style.background='var(--surface-2)'" onmouseout="this.style.background=''">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                  ${stagePill(o.stage)}
                  <span style="font-size:12px;font-weight:700;flex:1">${esc(o.title)}</span>
                  <span style="font-size:12px;font-weight:700;color:var(--orange)">${fmtMoney(o.expected_value, o.currency)}</span>
                </div>
                <div style="font-size:11px;color:var(--text-muted)">${esc(o.contact_name||'')} ${o.org_name ? '· '+esc(o.org_name) : ''}</div>
              </div>
            `).join('') || '<div class="empty-state" style="padding:30px"><p>No active opportunities</p></div>'}
          </div>
        </div>
      </div>
    `);
  } catch (e) { render(`<div class="empty-state"><p>Error loading dashboard: ${esc(e.message)}</p></div>`); }
}

// ── Pipeline ──────────────────────────────────────────────────────────
let pipelineView = 'kanban';
async function viewPipeline(param) {
  setTitle('Pipeline');
  render('<div style="display:flex;align-items:center;justify-content:center;height:200px"><div class="spinner"></div></div>');
  try {
    const [opps, labels] = await Promise.all([
      api('GET', '/opportunities?status=Active'),
      api('GET', '/settings'),
    ]);

    const filterBar = `
      <div class="filters-bar">
        <div class="search-wrap">
          <span class="search-icon">🔍</span>
          <input class="form-input" id="pipeSearch" placeholder="Search…" oninput="filterPipeline()" value="" />
        </div>
        <select class="form-select" id="pipeStage" onchange="filterPipeline()">
          <option value="">All Stages</option>
          ${['Prospect','Tender','Analysis','Negotiation','Closing'].map(s=>`<option>${s}</option>`).join('')}
        </select>
        ${hasPerm('opps.create') ? `<button class="btn btn-primary" onclick="navigate('new-opportunity')">+ New Opportunity</button>` : ''}
      </div>
    `;

    const tabs = `
      <div class="page-header">
        <h2>Pipeline</h2>
        <div class="view-tabs">
          <div class="view-tab ${pipelineView==='kanban'?'active':''}" onclick="switchView('kanban')">Kanban</div>
          <div class="view-tab ${pipelineView==='list'?'active':''}" onclick="switchView('list')">List</div>
        </div>
      </div>
    `;

    render(tabs + filterBar + `<div id="pipelineBody"></div>`);
    window._pipelineOpps = opps;
    renderPipelineView();
  } catch (e) { render(`<div class="empty-state"><p>Error: ${esc(e.message)}</p></div>`); }
}

function filterPipeline() {
  const search = document.getElementById('pipeSearch')?.value.toLowerCase() || '';
  const stage  = document.getElementById('pipeStage')?.value || '';
  window._pipelineOpps = window._pipelineOpps.map(o => o);
  const filtered = (window._pipelineOpps || []).filter(o =>
    (!search || o.title.toLowerCase().includes(search) || (o.contact_name||'').toLowerCase().includes(search)) &&
    (!stage  || o.stage === stage)
  );
  renderPipelineView(filtered);
}

function switchView(v) {
  pipelineView = v;
  document.querySelectorAll('.view-tab').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.view-tab').forEach(el => { if (el.textContent.toLowerCase() === v) el.classList.add('active'); });
  renderPipelineView();
}

function renderPipelineView(opps) {
  opps = opps || window._pipelineOpps || [];
  if (pipelineView === 'kanban') renderKanban(opps);
  else renderList(opps);
}

function renderKanban(opps) {
  const stages = ['Prospect','Tender','Analysis','Negotiation','Closing'];
  document.getElementById('pipelineBody').innerHTML = `
    <div class="kanban-board">
      ${stages.map(stage => {
        const cards = opps.filter(o => o.stage === stage);
        const total = cards.reduce((s,o) => s+(o.expected_value||0), 0);
        return `
          <div class="kanban-col" data-stage="${stage}">
            <div class="kanban-col-header">
              <div class="kanban-col-dot" style="background:${STAGE_COLORS[stage]}"></div>
              <span class="kanban-col-name">${stage}</span>
              <span class="kanban-col-count">${cards.length}</span>
            </div>
            <div class="kanban-col-value">${fmtMoney(total)} JOD</div>
            <div class="kanban-cards" id="col-${stage}" ondragover="event.preventDefault()" ondrop="onDrop(event,'${stage}')">
              ${cards.map(o => kanbanCard(o)).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function kanbanCard(o) {
  const labelsHtml = (o.labels||[]).map(l => `<span class="kc-label" style="background:${l.color}">${esc(l.name)}</span>`).join('');
  return `
    <div class="kanban-card" draggable="true"
      ondragstart="onDragStart(event,${o.id})"
      onclick="navigate('opportunity',${o.id})">
      ${labelsHtml ? `<div class="kc-labels">${labelsHtml}</div>` : ''}
      <div class="kc-title">${esc(o.title)}</div>
      ${o.contact_name ? `<div class="kc-contact">👤 ${esc(o.contact_name)}</div>` : ''}
      <div class="kc-footer">
        <span class="kc-value">${fmtMoney(o.expected_value, o.currency)}</span>
        ${o.salesman_name ? `<span class="kc-salesman">${esc(o.salesman_name)}</span>` : ''}
      </div>
    </div>
  `;
}

let _dragId = null;
function onDragStart(e, id) { _dragId = id; e.dataTransfer.effectAllowed = 'move'; }
async function onDrop(e, toStage) {
  e.preventDefault();
  if (!_dragId) return;
  try {
    await api('POST', `/opportunities/${_dragId}/stage`, { to_stage: toStage });
    toast(`Moved to ${toStage}`, 'success');
    const opp = window._pipelineOpps.find(o => o.id === _dragId);
    if (opp) opp.stage = toStage;
    renderPipelineView();
  } catch (ex) { toast(ex.message, 'error'); }
  _dragId = null;
}

function renderList(opps) {
  document.getElementById('pipelineBody').innerHTML = `
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Opportunity</th><th>Contact</th><th>Stage</th><th>Value</th>
            <th>Salesman</th><th>Close Date</th><th>Updated</th>
          </tr></thead>
          <tbody>
            ${opps.map(o => `
              <tr onclick="navigate('opportunity',${o.id})" style="cursor:pointer">
                <td><b>${esc(o.title)}</b></td>
                <td class="muted">${esc(o.contact_name||'—')}</td>
                <td>${stagePill(o.stage)}</td>
                <td style="font-weight:700;color:var(--orange)">${fmtMoney(o.expected_value,o.currency)}</td>
                <td class="muted">${esc(o.salesman_name||'—')}</td>
                <td class="muted">${fmtDate(o.close_date)}</td>
                <td class="muted">${fmtDate(o.updated_at)}</td>
              </tr>
            `).join('') || `<tr><td colspan="7"><div class="empty-state" style="padding:30px"><p>No opportunities</p></div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ── New Opportunity ───────────────────────────────────────────────────
async function viewNewOpportunity() {
  setTitle('New Opportunity');
  const settings = await api('GET', '/settings').catch(() => ({}));
  const salesmen = await api('GET', '/users').catch(() => []);
  const smList   = salesmen.filter(u => ['salesman','sales_manager'].includes(u.role));
  const sources  = settings.lead_sources  || ['Walk-in','Internet','Consultant','Contractor','Referral'];
  const segments = settings.segments       || ['Commercial','Residential','Government'];
  const products = settings.product_groups || ['VRF','Split','Chiller','Ducted','Fan Coils','AHU'];
  const currencies = settings.currencies  || ['JOD','USD'];

  render(`
    <div class="page-header">
      <button class="btn btn-secondary btn-sm" onclick="navigate('pipeline')">← Back</button>
      <h2>New Opportunity</h2>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Opportunity Details</span></div>
      <div class="card-body">
        <form id="oppForm" onsubmit="submitOpp(event)">
          <div class="form-grid">
            <div class="form-group full">
              <label class="form-label">Title <span class="req">*</span></label>
              <input class="form-input" name="title" required placeholder="e.g. HVAC System — ABC Tower" />
            </div>
            <div class="form-group">
              <label class="form-label">Contact Person</label>
              <div class="search-wrap">
                <span class="search-icon">👤</span>
                <input class="form-input" id="contactSearch" placeholder="Search contact…" autocomplete="off" oninput="searchEntity('contact',this.value)" />
                <input type="hidden" name="contact_id" id="contactId" />
                <div class="search-dropdown" id="contactDropdown"></div>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Organization</label>
              <div class="search-wrap">
                <span class="search-icon">🏢</span>
                <input class="form-input" id="orgSearch" placeholder="Search organization…" autocomplete="off" oninput="searchEntity('org',this.value)" />
                <input type="hidden" name="org_id" id="orgId" />
                <div class="search-dropdown" id="orgDropdown"></div>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Source</label>
              <select class="form-select" name="source">
                <option value="">— Select —</option>
                ${sources.map(s=>`<option>${s}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Segment</label>
              <select class="form-select" name="segment">
                <option value="">— Select —</option>
                ${segments.map(s=>`<option>${s}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Product Group</label>
              <select class="form-select" name="product_group">
                <option value="">— Select —</option>
                ${products.map(s=>`<option>${s}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Expected Value</label>
              <input class="form-input" name="expected_value" type="number" min="0" placeholder="0" />
            </div>
            <div class="form-group">
              <label class="form-label">Currency</label>
              <select class="form-select" name="currency">
                ${currencies.map(c=>`<option>${c}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Expected Close Date</label>
              <input class="form-input" name="close_date" type="date" />
            </div>
            <div class="form-group">
              <label class="form-label">District</label>
              <input class="form-input" name="district" placeholder="e.g. Abdoun" />
            </div>
            <div class="form-group">
              <label class="form-label">Engineering Office</label>
              <input class="form-input" name="eng_office" />
            </div>
            <div class="form-group">
              <label class="form-label">Contractor</label>
              <input class="form-input" name="contractor" />
            </div>
            ${hasPerm('opps.assign_salesman') ? `
            <div class="form-group">
              <label class="form-label">Assign Salesman</label>
              <select class="form-select" name="salesman_id">
                <option value="">Self</option>
                ${smList.map(u=>`<option value="${u.id}">${esc(u.name)}</option>`).join('')}
              </select>
            </div>` : ''}
            <div class="form-group full">
              <label class="form-label">Notes</label>
              <textarea class="form-textarea" name="notes" placeholder="Internal notes…"></textarea>
            </div>
          </div>
          <div style="margin-top:20px;display:flex;gap:10px">
            <button type="submit" class="btn btn-primary">Create Opportunity</button>
            <button type="button" class="btn btn-secondary" onclick="navigate('pipeline')">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `);
}

async function submitOpp(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = {};
  fd.forEach((v,k) => { if(v) body[k] = v; });
  body.contact_id = document.getElementById('contactId').value || null;
  body.org_id     = document.getElementById('orgId').value     || null;
  try {
    const res = await api('POST', '/opportunities', body);
    toast('Opportunity created!', 'success');
    navigate('opportunity', res.id);
  } catch (ex) { toast(ex.message, 'error'); }
}

// Inline search for contacts/orgs
let _searchTimer;
async function searchEntity(type, q) {
  clearTimeout(_searchTimer);
  if (!q || q.length < 2) {
    document.getElementById(`${type === 'contact' ? 'contact' : 'org'}Dropdown`).classList.remove('open');
    return;
  }
  _searchTimer = setTimeout(async () => {
    const endpoint = type === 'contact' ? '/contacts' : '/organizations';
    const items    = await api('GET', `${endpoint}?search=${encodeURIComponent(q)}`).catch(() => []);
    const ddId     = type === 'contact' ? 'contactDropdown' : 'orgDropdown';
    const inputId  = type === 'contact' ? 'contactId' : 'orgId';
    const searchId = type === 'contact' ? 'contactSearch' : 'orgSearch';
    const dd = document.getElementById(ddId);
    dd.innerHTML = [
      ...items.map(item => `<div class="search-item" onclick="selectEntity('${type}',${item.id},'${esc(item.name)}')">${esc(item.name)}</div>`),
      `<div class="search-item" onclick="createEntity('${type}','${esc(q)}')"><b>+ Create "${q}"</b> <span class="new-badge">NEW</span></div>`,
    ].join('');
    dd.classList.add('open');
  }, 250);
}

function selectEntity(type, id, name) {
  const isContact = type === 'contact';
  document.getElementById(isContact ? 'contactSearch' : 'orgSearch').value = name;
  document.getElementById(isContact ? 'contactId' : 'orgId').value = id;
  document.getElementById(isContact ? 'contactDropdown' : 'orgDropdown').classList.remove('open');
}

async function createEntity(type, name) {
  try {
    const endpoint = type === 'contact' ? '/contacts' : '/organizations';
    const body = type === 'contact' ? { name } : { name };
    const res = await api('POST', endpoint, body);
    selectEntity(type, res.id, name);
    toast(`${type === 'contact' ? 'Contact' : 'Organization'} created!`, 'success');
  } catch (ex) { toast(ex.message, 'error'); }
}

// ── Opportunity Detail ────────────────────────────────────────────────
async function viewOpportunityDetail(id) {
  setTitle('Opportunity');
  render('<div style="display:flex;align-items:center;justify-content:center;height:200px"><div class="spinner"></div></div>');
  try {
    const [opp, quotations, activities, settings] = await Promise.all([
      api('GET', `/opportunities/${id}`),
      api('GET', `/quotations/opp/${id}`),
      api('GET', `/activities?opp_id=${id}`),
      api('GET', '/settings'),
    ]);

    const lostReasons = settings.lost_reasons || [];
    const nextStages  = getNextStages(opp.stage, opp.status);
    const canClose    = hasPerm('opps.close') && opp.status === 'Active';
    const canStage    = hasPerm('opps.change_stage') && opp.status === 'Active';
    const canAssignD  = hasPerm('opps.assign_designer');
    const canReqQuot  = hasPerm('quot.create');

    render(`
      <div class="page-header">
        <button class="btn btn-secondary btn-sm" onclick="navigate('pipeline')">← Pipeline</button>
        <h2>${esc(opp.title)}</h2>
        ${statusPill(opp.status)}
        ${opp.status === 'Active' ? stagePill(opp.stage) : ''}
      </div>

      <div style="display:grid;grid-template-columns:2fr 1fr;gap:20px">
        <div>
          <!-- Details card -->
          <div class="card" style="margin-bottom:20px">
            <div class="card-header">
              <span class="card-title">Details</span>
            </div>
            <div class="card-body">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                ${detailRow('Contact',   opp.contact_name||'—')}
                ${detailRow('Organization', opp.org_name||'—')}
                ${detailRow('Salesman',  opp.salesman_name||'—')}
                ${detailRow('Designer',  opp.designer_name||'—')}
                ${detailRow('Value',     fmtMoney(opp.expected_value, opp.currency), 'var(--orange)')}
                ${detailRow('Source',    opp.source||'—')}
                ${detailRow('Segment',   opp.segment||'—')}
                ${detailRow('Product',   opp.product_group||'—')}
                ${detailRow('District',  opp.district||'—')}
                ${detailRow('Close Date',fmtDate(opp.close_date))}
                ${detailRow('Created',   fmtDate(opp.created_at))}
                ${detailRow('Updated',   fmtDate(opp.updated_at))}
              </div>
              ${opp.notes ? `<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)"><div style="font-size:11px;color:var(--text-muted);font-weight:700;margin-bottom:4px">NOTES</div><div style="font-size:12px;line-height:1.6">${esc(opp.notes)}</div></div>` : ''}
              ${opp.status === 'Lost' ? `<div style="margin-top:14px;padding:12px;background:var(--red-dim);border-radius:8px"><b style="color:var(--red)">Lost:</b> ${esc(opp.lost_reason_label||'')} ${opp.lost_notes ? '— '+esc(opp.lost_notes) : ''}</div>` : ''}
            </div>
          </div>

          <!-- Quotations -->
          <div class="card" style="margin-bottom:20px">
            <div class="card-header">
              <span class="card-title">Quotations</span>
              ${canReqQuot && opp.status === 'Active' ? `<button class="btn btn-primary btn-sm" onclick="openNewQuotModal(${opp.id})">+ New Quotation</button>` : ''}
            </div>
            <div class="card-body" style="padding:0">
              ${quotations.length === 0
                ? '<div class="empty-state" style="padding:30px"><p>No quotations yet</p></div>'
                : quotations.map(q => `
                    <div style="padding:14px 18px;border-bottom:1px solid var(--border);cursor:pointer" onclick="navigate('quotation',${q.id})">
                      <div style="display:flex;align-items:center;gap:8px">
                        <b style="font-size:12px">v${q.version}</b>
                        ${quotStatusPill(q.status)}
                        <span style="flex:1;font-size:12px;color:var(--text-muted)">${esc(q.designer_name||'')}</span>
                        <span style="font-size:12px;font-weight:700;color:var(--orange)">${fmtMoney(q.final_value)} JOD</span>
                      </div>
                      <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${fmtDate(q.created_at)}</div>
                    </div>
                  `).join('')}
            </div>
          </div>

          <!-- Activities -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">Activities</span>
              <button class="btn btn-secondary btn-sm" onclick="openActivityModal(${opp.id})">+ Activity</button>
            </div>
            <div class="card-body" style="padding:0">
              ${activities.length === 0
                ? '<div class="empty-state" style="padding:30px"><p>No activities yet</p></div>'
                : activities.map(a => `
                    <div style="padding:12px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px">
                      <span style="font-size:16px">${activityIcon(a.type)}</span>
                      <div style="flex:1">
                        <div style="font-size:12px;font-weight:700">${esc(a.title)}</div>
                        <div style="font-size:11px;color:var(--text-muted)">${fmtDate(a.start_dt)} · ${esc(a.assigned_to_name||'')}</div>
                      </div>
                      <span class="pill ${a.status==='Done'?'pill-won':'pill-active'}">${a.status}</span>
                      ${a.status !== 'Done' ? `<button class="btn btn-sm btn-secondary" onclick="markActivityDone(${a.id},${opp.id})">Done</button>` : ''}
                    </div>
                  `).join('')}
            </div>
          </div>
        </div>

        <!-- Right panel: actions + timeline -->
        <div>
          ${opp.status === 'Active' ? `
          <div class="card" style="margin-bottom:20px">
            <div class="card-header"><span class="card-title">Actions</span></div>
            <div class="card-body" style="display:flex;flex-direction:column;gap:10px">
              ${canStage && nextStages.length ? nextStages.map(s => `
                <button class="btn btn-primary" onclick="advanceStage(${opp.id},'${s}')">Move to ${s} →</button>
              `).join('') : ''}
              ${canAssignD ? `
                <button class="btn btn-secondary" onclick="openAssignDesignerModal(${opp.id})">Assign Designer</button>
              ` : ''}
              ${canClose ? `
                <button class="btn btn-success" onclick="openCloseModal(${opp.id},'Won',${JSON.stringify(lostReasons)})">Mark as Won ✓</button>
                <button class="btn btn-danger" onclick="openCloseModal(${opp.id},'Lost',${JSON.stringify(lostReasons)})">Mark as Lost ✗</button>
              ` : ''}
            </div>
          </div>
          ` : ''}

          <!-- Stage history timeline -->
          <div class="card">
            <div class="card-header"><span class="card-title">Stage History</span></div>
            <div class="card-body">
              <div class="timeline">
                ${(opp.history||[]).map(h => `
                  <div class="timeline-item">
                    <div class="timeline-dot">→</div>
                    <div class="timeline-content">
                      <div class="timeline-stage">${h.to_stage}</div>
                      <div class="timeline-meta">${esc(h.changed_by_name||'System')} · ${fmtDate(h.changed_at)}</div>
                    </div>
                  </div>
                `).join('') || '<div style="color:var(--text-muted);font-size:12px">No history</div>'}
              </div>
            </div>
          </div>
        </div>
      </div>
    `);
  } catch (e) { render(`<div class="empty-state"><p>Error: ${esc(e.message)}</p></div>`); }
}

function detailRow(label, value, color) {
  return `<div>
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:2px">${label}</div>
    <div style="font-size:12px;font-weight:600;${color?'color:'+color:''}">${value}</div>
  </div>`;
}
function getNextStages(current, status) {
  if (status !== 'Active') return [];
  const all = ['Prospect','Tender','Analysis','Negotiation','Closing'];
  const i = all.indexOf(current);
  return i >= 0 && i < all.length - 1 ? [all[i + 1]] : [];
}
function activityIcon(t) {
  return { Call:'📞', Meeting:'🤝', Task:'✅', Deadline:'⏰' }[t] || '📌';
}

async function advanceStage(oppId, toStage) {
  try {
    await api('POST', `/opportunities/${oppId}/stage`, { to_stage: toStage });
    toast(`Moved to ${toStage}!`, 'success');
    viewOpportunityDetail(oppId);
  } catch (ex) { toast(ex.message, 'error'); }
}

function openCloseModal(oppId, outcome, lostReasons) {
  const isLost = outcome === 'Lost';
  openModal(`Close as ${outcome}`, `
    <form id="closeForm">
      ${isLost ? `
        <div class="form-group" style="margin-bottom:14px">
          <label class="form-label">Lost Reason <span class="req">*</span></label>
          <select class="form-select" name="lost_reason_id" required>
            <option value="">— Select reason —</option>
            ${lostReasons.map((r,i)=>`<option value="${i+1}">${esc(r)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea class="form-textarea" name="lost_notes" placeholder="Additional context…"></textarea>
        </div>
      ` : `<p style="margin-bottom:14px">Are you sure you want to mark this opportunity as <b>Won</b>?</p>`}
    </form>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn ${isLost?'btn-danger':'btn-success'}" onclick="submitClose(${oppId},'${outcome}')">Confirm ${outcome}</button>
  `);
}

async function submitClose(oppId, outcome) {
  const form = document.getElementById('closeForm');
  const fd   = new FormData(form);
  const body = { outcome };
  fd.forEach((v,k) => { if(v) body[k] = v; });
  try {
    await api('POST', `/opportunities/${oppId}/close`, body);
    closeModal();
    toast(`Closed as ${outcome}!`, outcome === 'Won' ? 'success' : 'info');
    viewOpportunityDetail(oppId);
  } catch (ex) { toast(ex.message, 'error'); }
}

function openAssignDesignerModal(oppId) {
  api('GET', '/users').then(users => {
    const designers = users.filter(u => u.role === 'designer' && u.is_active);
    openModal('Assign Designer', `
      <div class="form-group">
        <label class="form-label">Designer</label>
        <select class="form-select" id="designerSelect">
          ${designers.map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join('')}
        </select>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitAssignDesigner(${oppId})">Assign</button>
    `);
  });
}
async function submitAssignDesigner(oppId) {
  const did = document.getElementById('designerSelect').value;
  try {
    await api('POST', `/opportunities/${oppId}/assign-designer`, { designer_id: did });
    closeModal();
    toast('Designer assigned!', 'success');
    viewOpportunityDetail(oppId);
  } catch (ex) { toast(ex.message, 'error'); }
}

function openNewQuotModal(oppId) {
  openModal('New Quotation', `
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Total Value (JOD) <span class="req">*</span></label>
        <input class="form-input" id="quotValue" type="number" min="0" placeholder="0" />
      </div>
      <div class="form-group">
        <label class="form-label">Discount %</label>
        <input class="form-input" id="quotDiscount" type="number" min="0" max="100" value="0" />
      </div>
      <div class="form-group full">
        <label class="form-label">Notes</label>
        <textarea class="form-textarea" id="quotNotes"></textarea>
      </div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="submitNewQuot(${oppId})">Create Quotation</button>
  `);
}
async function submitNewQuot(oppId) {
  const val      = document.getElementById('quotValue').value;
  const disc     = document.getElementById('quotDiscount').value;
  const notes    = document.getElementById('quotNotes').value;
  if (!val) { toast('Value is required', 'error'); return; }
  try {
    const res = await api('POST', '/quotations', { opp_id: oppId, total_value: parseFloat(val), discount_pct: parseFloat(disc)||0, notes });
    closeModal();
    toast(`Quotation v${res.version} created!`, 'success');
    viewOpportunityDetail(oppId);
  } catch (ex) { toast(ex.message, 'error'); }
}

function openActivityModal(oppId) {
  openModal('Log Activity', `
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Type <span class="req">*</span></label>
        <select class="form-select" id="actType">
          <option>Call</option><option>Meeting</option><option>Task</option><option>Deadline</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Title <span class="req">*</span></label>
        <input class="form-input" id="actTitle" placeholder="e.g. Follow-up call" />
      </div>
      <div class="form-group">
        <label class="form-label">Date</label>
        <input class="form-input" id="actDate" type="datetime-local" />
      </div>
      <div class="form-group">
        <label class="form-label">Priority</label>
        <select class="form-select" id="actPriority">
          <option>Medium</option><option>High</option><option>Low</option>
        </select>
      </div>
      <div class="form-group full">
        <label class="form-label">Notes</label>
        <textarea class="form-textarea" id="actNotes"></textarea>
      </div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="submitActivity(${oppId})">Save Activity</button>
  `);
}
async function submitActivity(oppId) {
  const title = document.getElementById('actTitle').value;
  if (!title) { toast('Title is required', 'error'); return; }
  try {
    await api('POST', '/activities', {
      opp_id: oppId,
      type:     document.getElementById('actType').value,
      title,
      start_dt: document.getElementById('actDate').value || null,
      priority: document.getElementById('actPriority').value,
      notes:    document.getElementById('actNotes').value || null,
    });
    closeModal();
    toast('Activity logged!', 'success');
    viewOpportunityDetail(oppId);
  } catch (ex) { toast(ex.message, 'error'); }
}
async function markActivityDone(actId, oppId) {
  await api('PUT', `/activities/${actId}/done`);
  toast('Marked as done', 'success');
  viewOpportunityDetail(oppId);
}

// ── Quotation Detail ──────────────────────────────────────────────────
async function viewQuotationDetail(id) {
  setTitle('Quotation');
  render('<div style="display:flex;align-items:center;justify-content:center;height:200px"><div class="spinner"></div></div>');
  try {
    const q = await api('GET', `/quotations/${id}`);
    const canApprove = hasPerm('quot.approve');
    const canRevise  = hasPerm('quot.request_revision');
    const canRelease = hasPerm('quot.release');
    const canSubmit  = hasPerm('quot.create') && q.designer_id === USER.id;

    render(`
      <div class="page-header">
        <button class="btn btn-secondary btn-sm" onclick="navigate('opportunity',${q.opp_id})">← Opportunity</button>
        <h2>Quotation v${q.version}</h2>
        ${quotStatusPill(q.status)}
      </div>
      <div class="card" style="max-width:600px">
        <div class="card-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
            ${detailRow('Total Value', fmtMoney(q.total_value))}
            ${detailRow('Discount', q.discount_pct + '%')}
            ${detailRow('Final Value', fmtMoney(q.final_value), 'var(--orange)')}
            ${detailRow('Designer', q.designer_name||'—')}
            ${detailRow('Reviewed By', q.reviewed_by_name||'—')}
            ${detailRow('Created', fmtDate(q.created_at))}
            ${q.released_at ? detailRow('Released', fmtDate(q.released_at)) : ''}
          </div>
          ${q.notes ? `<div style="padding:12px;background:var(--surface-2);border-radius:8px;font-size:12px;line-height:1.6;margin-bottom:20px">${esc(q.notes)}</div>` : ''}
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            ${canSubmit && q.status === 'Draft' ? `<button class="btn btn-primary" onclick="submitQuot(${q.id})">Submit for Review</button>` : ''}
            ${canApprove && q.status === 'UnderReview' ? `<button class="btn btn-success" onclick="quotAction(${q.id},'approve')">Approve ✓</button>` : ''}
            ${canRevise  && q.status === 'UnderReview' ? `<button class="btn btn-danger" onclick="openReviseModal(${q.id})">Request Revision</button>` : ''}
            ${canRelease && q.status === 'Approved'    ? `<button class="btn btn-primary" onclick="quotAction(${q.id},'release')">Release to Salesman →</button>` : ''}
          </div>
        </div>
      </div>
    `);
  } catch (e) { render(`<div class="empty-state"><p>Error: ${esc(e.message)}</p></div>`); }
}

async function submitQuot(id) {
  try { await api('POST', `/quotations/${id}/submit`); toast('Submitted for review!', 'success'); viewQuotationDetail(id); }
  catch (ex) { toast(ex.message, 'error'); }
}
async function quotAction(id, action) {
  try { await api('POST', `/quotations/${id}/${action}`); toast('Done!', 'success'); viewQuotationDetail(id); }
  catch (ex) { toast(ex.message, 'error'); }
}
function openReviseModal(id) {
  openModal('Request Revision', `
    <div class="form-group">
      <label class="form-label">Revision Notes <span class="req">*</span></label>
      <textarea class="form-textarea" id="revNotes" placeholder="Explain what needs to change…"></textarea>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-danger" onclick="submitRevise(${id})">Request Revision</button>
  `);
}
async function submitRevise(id) {
  const notes = document.getElementById('revNotes').value;
  if (!notes) { toast('Notes required', 'error'); return; }
  try { await api('POST', `/quotations/${id}/revise`, { revision_notes: notes }); closeModal(); toast('Revision requested', 'info'); viewQuotationDetail(id); }
  catch (ex) { toast(ex.message, 'error'); }
}

// ── Design Queue ──────────────────────────────────────────────────────
async function viewDesignQueue() {
  setTitle('Design Queue');
  render('<div style="display:flex;align-items:center;justify-content:center;height:200px"><div class="spinner"></div></div>');
  try {
    const [opps, users, settings] = await Promise.all([
      api('GET', '/opportunities?status=Active'),
      api('GET', '/users'),
      api('GET', '/settings'),
    ]);
    const designers  = users.filter(u => u.role === 'designer' && u.is_active);
    const threshold  = parseInt(settings.designer_overload || '4');
    const inDesign   = opps.filter(o => o.stage === 'Prospect');
    const unassigned = inDesign.filter(o => !o.designer_id);

    render(`
      <div class="page-header"><h2>Design Queue</h2></div>
      ${unassigned.length ? `
        <div class="card" style="margin-bottom:20px;border-color:var(--amber)">
          <div class="card-header"><span class="card-title" style="color:var(--amber)">⚠ Unassigned Requests (${unassigned.length})</span></div>
          <div class="card-body" style="padding:0">
            ${unassigned.map(o => `
              <div style="padding:12px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px">
                <div style="flex:1;cursor:pointer" onclick="navigate('opportunity',${o.id})">
                  <b style="font-size:12px">${esc(o.title)}</b>
                  <div style="font-size:11px;color:var(--text-muted)">${esc(o.salesman_name||'')}</div>
                </div>
                ${hasPerm('opps.assign_designer') ? `<button class="btn btn-primary btn-sm" onclick="openAssignDesignerModal(${o.id})">Assign</button>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <h3 style="font-size:14px;font-weight:700;margin-bottom:14px">Designer Workload</h3>
      <div class="workload-grid">
        ${designers.map(d => {
          const tasks    = inDesign.filter(o => o.designer_id === d.id).length;
          const pct      = Math.min(100, Math.round(tasks / threshold * 100));
          const status   = tasks === 0 ? 'available' : tasks < threshold ? 'busy' : 'overloaded';
          const statusTxt = { available:'Available', busy:'Busy', overloaded:'Overloaded' }[status];
          return `
            <div class="workload-card">
              <div class="workload-name">${esc(d.name)}</div>
              <div class="workload-status ${status}">${statusTxt}</div>
              <div class="workload-bar-bg">
                <div class="workload-bar-fill" style="width:${pct}%;background:${status==='overloaded'?'var(--red)':status==='busy'?'var(--amber)':'var(--green)'}"></div>
              </div>
              <div class="workload-stat"><span>${tasks} active</span><span>${threshold} threshold</span></div>
            </div>
          `;
        }).join('')}
      </div>
    `);
  } catch (e) { render(`<div class="empty-state"><p>Error: ${esc(e.message)}</p></div>`); }
}

// ── Discount Approvals ────────────────────────────────────────────────
async function viewApprovals() {
  setTitle('Discount Approvals');
  render('<div style="display:flex;align-items:center;justify-content:center;height:200px"><div class="spinner"></div></div>');
  try {
    const pending = await api('GET', '/approvals/pending');
    render(`
      <div class="page-header"><h2>Pending Discount Approvals</h2></div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Opportunity</th><th>Requested By</th><th>Discount %</th><th>Date</th><th>Actions</th></tr></thead>
            <tbody>
              ${pending.length === 0 ? `<tr><td colspan="5"><div class="empty-state" style="padding:30px"><p>No pending approvals</p></div></td></tr>` :
                pending.map(a => `
                  <tr>
                    <td><b>${esc(a.opp_title||'—')}</b></td>
                    <td class="muted">${esc(a.requester_name||'—')}</td>
                    <td><b style="color:var(--orange)">${a.requested_pct}%</b></td>
                    <td class="muted">${fmtDate(a.request_date)}</td>
                    <td>
                      <button class="btn btn-success btn-sm" onclick="respondApproval(${a.id},'Approved',${a.requested_pct})">Approve</button>
                      <button class="btn btn-danger btn-sm" onclick="respondApproval(${a.id},'Rejected',${a.requested_pct})">Reject</button>
                    </td>
                  </tr>
                `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `);
  } catch (e) { render(`<div class="empty-state"><p>Error: ${esc(e.message)}</p></div>`); }
}
async function respondApproval(id, decision, pct) {
  try {
    await api('POST', `/approvals/${id}/respond`, { decision, approved_pct: pct });
    toast(`${decision}!`, decision === 'Approved' ? 'success' : 'info');
    viewApprovals();
  } catch (ex) { toast(ex.message, 'error'); }
}

// ── Contacts ──────────────────────────────────────────────────────────
async function viewContacts() {
  setTitle('Contacts');
  render('<div style="display:flex;align-items:center;justify-content:center;height:200px"><div class="spinner"></div></div>');
  try {
    const contacts = await api('GET', '/contacts');
    render(`
      <div class="page-header">
        <h2>Contacts</h2>
        <button class="btn btn-primary" onclick="openNewContactModal()">+ New Contact</button>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Organization</th><th>Phone</th><th>Email</th></tr></thead>
            <tbody>
              ${contacts.map(c => `
                <tr>
                  <td><b>${esc(c.name)}</b></td>
                  <td class="muted">${esc(c.org_name||'—')}</td>
                  <td class="muted">${(c.phones||[]).map(p=>esc(p.number||p)).join(', ')||'—'}</td>
                  <td class="muted">${(c.emails||[]).map(e=>esc(e.address||e)).join(', ')||'—'}</td>
                </tr>
              `).join('') || `<tr><td colspan="4"><div class="empty-state" style="padding:30px"><p>No contacts yet</p></div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `);
  } catch (e) { render(`<div class="empty-state"><p>Error: ${esc(e.message)}</p></div>`); }
}
function openNewContactModal() {
  openModal('New Contact', `
    <div class="form-grid">
      <div class="form-group full"><label class="form-label">Name <span class="req">*</span></label><input class="form-input" id="cName" required /></div>
      <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="cPhone" /></div>
      <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="cEmail" type="email" /></div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="submitNewContact()">Create</button>
  `);
}
async function submitNewContact() {
  const name  = document.getElementById('cName').value;
  const phone = document.getElementById('cPhone').value;
  const email = document.getElementById('cEmail').value;
  if (!name) { toast('Name required', 'error'); return; }
  try {
    await api('POST', '/contacts', { name, phones: phone?[{number:phone,type:'Work'}]:[], emails: email?[{address:email,type:'Work'}]:[] });
    closeModal(); toast('Contact created!', 'success'); viewContacts();
  } catch (ex) { toast(ex.message, 'error'); }
}

// ── Organizations ─────────────────────────────────────────────────────
async function viewOrganizations() {
  setTitle('Organizations');
  render('<div style="display:flex;align-items:center;justify-content:center;height:200px"><div class="spinner"></div></div>');
  try {
    const orgs = await api('GET', '/organizations');
    render(`
      <div class="page-header">
        <h2>Organizations</h2>
        <button class="btn btn-primary" onclick="openNewOrgModal()">+ New Organization</button>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Type</th><th>Phone</th><th>Email</th></tr></thead>
            <tbody>
              ${orgs.map(o => `
                <tr><td><b>${esc(o.name)}</b></td><td class="muted">${esc(o.type||'—')}</td><td class="muted">${esc(o.phone||'—')}</td><td class="muted">${esc(o.email||'—')}</td></tr>
              `).join('') || `<tr><td colspan="4"><div class="empty-state" style="padding:30px"><p>No organizations yet</p></div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `);
  } catch (e) { render(`<div class="empty-state"><p>Error: ${esc(e.message)}</p></div>`); }
}
function openNewOrgModal() {
  openModal('New Organization', `
    <div class="form-grid">
      <div class="form-group full"><label class="form-label">Name <span class="req">*</span></label><input class="form-input" id="oName" required /></div>
      <div class="form-group"><label class="form-label">Type</label><select class="form-select" id="oType"><option value="">—</option><option>Contractor</option><option>Engineering Office</option><option>Customer</option><option>Supplier</option></select></div>
      <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="oPhone" /></div>
      <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="oEmail" type="email" /></div>
      <div class="form-group full"><label class="form-label">Address</label><input class="form-input" id="oAddress" /></div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="submitNewOrg()">Create</button>
  `);
}
async function submitNewOrg() {
  const name = document.getElementById('oName').value;
  if (!name) { toast('Name required', 'error'); return; }
  try {
    await api('POST', '/organizations', { name, type: document.getElementById('oType').value, phone: document.getElementById('oPhone').value, email: document.getElementById('oEmail').value, address: document.getElementById('oAddress').value });
    closeModal(); toast('Organization created!', 'success'); viewOrganizations();
  } catch (ex) { toast(ex.message, 'error'); }
}

// ── Activities ─────────────────────────────────────────────────────────
async function viewActivities() {
  setTitle('Activities');
  render('<div style="display:flex;align-items:center;justify-content:center;height:200px"><div class="spinner"></div></div>');
  try {
    const acts = await api('GET', `/activities?user_id=${USER.id}`);
    render(`
      <div class="page-header"><h2>My Activities</h2></div>
      <div class="card">
        <div class="card-body" style="padding:0">
          ${acts.length === 0
            ? '<div class="empty-state" style="padding:40px"><div class="icon">📅</div><p>No activities scheduled</p></div>'
            : acts.map(a => `
                <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px">
                  <span style="font-size:20px">${activityIcon(a.type)}</span>
                  <div style="flex:1">
                    <div style="font-size:12px;font-weight:700">${esc(a.title)}</div>
                    <div style="font-size:11px;color:var(--text-muted)">${a.opp_title ? esc(a.opp_title)+' · ' : ''}${fmtDate(a.start_dt)}</div>
                  </div>
                  <span class="pill ${a.status==='Done'?'pill-won':'pill-active'}">${a.status}</span>
                  ${a.status !== 'Done' ? `<button class="btn btn-sm btn-secondary" onclick="markActivityDone(${a.id},null)">Done</button>` : ''}
                </div>
              `).join('')}
        </div>
      </div>
    `);
  } catch (e) { render(`<div class="empty-state"><p>Error: ${esc(e.message)}</p></div>`); }
}

// ── Admin: Users ──────────────────────────────────────────────────────
async function viewAdminUsers() {
  setTitle('Users');
  render('<div style="display:flex;align-items:center;justify-content:center;height:200px"><div class="spinner"></div></div>');
  try {
    const [users, roles] = await Promise.all([api('GET', '/users'), api('GET', '/roles')]);
    render(`
      <div class="page-header">
        <h2>Users</h2>
        <button class="btn btn-primary" onclick="openNewUserModal(${JSON.stringify(roles.roles).replace(/"/g,'&quot;')})">+ New User</button>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              ${users.map(u => `
                <tr>
                  <td><b>${esc(u.name)}</b></td>
                  <td class="muted">${esc(u.email)}</td>
                  <td>${esc(roleLabel(u.role))}</td>
                  <td><span class="pill ${u.is_active?'pill-won':'pill-lost'}">${u.is_active?'Active':'Inactive'}</span></td>
                  <td><button class="btn btn-secondary btn-sm" onclick="openEditUserModal(${u.id})">Edit</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `);
  } catch (e) { render(`<div class="empty-state"><p>Error: ${esc(e.message)}</p></div>`); }
}
function openNewUserModal(roles) {
  openModal('New User', `
    <div class="form-grid">
      <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="uName" /></div>
      <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="uEmail" type="email" /></div>
      <div class="form-group"><label class="form-label">Password</label><input class="form-input" id="uPass" type="password" /></div>
      <div class="form-group"><label class="form-label">Role</label>
        <select class="form-select" id="uRole">
          ${roles.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')}
        </select>
      </div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="submitNewUser()">Create</button>
  `);
}
async function submitNewUser() {
  try {
    await api('POST', '/users', { name: document.getElementById('uName').value, email: document.getElementById('uEmail').value, password: document.getElementById('uPass').value, role_id: document.getElementById('uRole').value });
    closeModal(); toast('User created!', 'success'); viewAdminUsers();
  } catch (ex) { toast(ex.message, 'error'); }
}
async function openEditUserModal(id) {
  const [user, roles] = await Promise.all([api('GET', `/users/${id}`), api('GET', '/roles')]);
  openModal('Edit User', `
    <div class="form-grid">
      <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="euName" value="${esc(user.name)}" /></div>
      <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="euEmail" value="${esc(user.email)}" /></div>
      <div class="form-group"><label class="form-label">New Password (leave blank to keep)</label><input class="form-input" id="euPass" type="password" /></div>
      <div class="form-group"><label class="form-label">Role</label>
        <select class="form-select" id="euRole">
          ${roles.roles.map(r=>`<option value="${r.id}" ${r.id===user.role_id?'selected':''}>${esc(r.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Status</label>
        <select class="form-select" id="euActive"><option value="1" ${user.is_active?'selected':''}>Active</option><option value="0" ${!user.is_active?'selected':''}>Inactive</option></select>
      </div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="submitEditUser(${id})">Save</button>
  `);
}
async function submitEditUser(id) {
  const body = { name: document.getElementById('euName').value, email: document.getElementById('euEmail').value, role_id: document.getElementById('euRole').value, is_active: document.getElementById('euActive').value === '1' };
  const pw = document.getElementById('euPass').value;
  if (pw) body.password = pw;
  try { await api('PUT', `/users/${id}`, body); closeModal(); toast('User updated!', 'success'); viewAdminUsers(); }
  catch (ex) { toast(ex.message, 'error'); }
}

// ── Admin: Roles ──────────────────────────────────────────────────────
async function viewAdminRoles() {
  setTitle('Roles & Permissions');
  render('<div style="display:flex;align-items:center;justify-content:center;height:200px"><div class="spinner"></div></div>');
  try {
    const { roles, permissions, matrix } = await api('GET', '/roles');
    const matrixSet = new Set(matrix.map(m => `${m.role_id}:${m.permission_id}`));
    const categories = [...new Set(permissions.map(p => p.category))];

    render(`
      <div class="page-header"><h2>Roles & Permissions</h2></div>
      <div class="card">
        <div class="table-wrap">
          <table class="perm-matrix">
            <thead><tr>
              <th>Permission</th>
              ${roles.map(r=>`<th>${esc(r.name)}</th>`).join('')}
            </tr></thead>
            <tbody>
              ${categories.map(cat => `
                <tr><td colspan="${roles.length+1}" style="background:var(--bg);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);padding:8px 12px">${cat}</td></tr>
                ${permissions.filter(p=>p.category===cat).map(p => `
                  <tr>
                    <td class="perm-key">${esc(p.key)}</td>
                    ${roles.map(r => `
                      <td style="text-align:center">
                        <input type="checkbox" class="perm-toggle" data-role="${r.id}" data-perm="${p.id}"
                          ${matrixSet.has(`${r.id}:${p.id}`) ? 'checked' : ''}
                          onchange="togglePerm(${r.id},${p.id},this.checked)" />
                      </td>
                    `).join('')}
                  </tr>
                `).join('')}
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `);
  } catch (e) { render(`<div class="empty-state"><p>Error: ${esc(e.message)}</p></div>`); }
}
async function togglePerm(roleId, permId, checked) {
  const { roles, permissions, matrix } = await api('GET', '/roles');
  const current = new Set(matrix.filter(m=>m.role_id===roleId).map(m=>m.permission_id));
  if (checked) current.add(permId); else current.delete(permId);
  try { await api('PUT', `/roles/${roleId}/permissions`, { permissionIds: [...current] }); }
  catch (ex) { toast(ex.message, 'error'); }
}

// ── Admin: Settings ───────────────────────────────────────────────────
async function viewAdminSettings() {
  setTitle('System Settings');
  render('<div style="display:flex;align-items:center;justify-content:center;height:200px"><div class="spinner"></div></div>');
  try {
    const raw = await api('GET', '/settings/raw');
    render(`
      <div class="page-header"><h2>System Settings</h2></div>
      <div class="card" style="max-width:700px">
        <div class="card-body">
          ${raw.map(s => `
            <div style="margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid var(--border)">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                <b style="font-size:12px">${esc(s.key)}</b>
                <span class="pill" style="font-size:9px">${s.type}</span>
              </div>
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">${esc(s.description||'')}</div>
              ${s.type === 'number'
                ? `<div style="display:flex;gap:8px;align-items:center"><input class="form-input" id="s_${s.key}" type="number" value="${esc(s.value)}" style="width:120px" /><button class="btn btn-primary btn-sm" onclick="saveSetting('${s.key}')">Save</button></div>`
                : s.type === 'list'
                  ? `<div><textarea class="form-textarea" id="s_${s.key}" style="font-size:11px;font-family:monospace">${esc(s.value)}</textarea><button class="btn btn-primary btn-sm" onclick="saveListSetting('${s.key}')" style="margin-top:6px">Save JSON</button></div>`
                  : `<div style="display:flex;gap:8px;align-items:center"><input class="form-input" id="s_${s.key}" value="${esc(s.value||'')}" /><button class="btn btn-primary btn-sm" onclick="saveSetting('${s.key}')">Save</button></div>`
              }
            </div>
          `).join('')}
        </div>
      </div>
    `);
  } catch (e) { render(`<div class="empty-state"><p>Error: ${esc(e.message)}</p></div>`); }
}
async function saveSetting(key) {
  const val = document.getElementById(`s_${key}`).value;
  try { await api('PUT', `/settings/${key}`, { value: val }); toast('Saved!', 'success'); if (key==='imi_portal_url') IMI_URL = val; }
  catch (ex) { toast(ex.message, 'error'); }
}
async function saveListSetting(key) {
  const raw = document.getElementById(`s_${key}`).value;
  try { JSON.parse(raw); await api('PUT', `/settings/${key}`, { value: JSON.parse(raw) }); toast('Saved!', 'success'); }
  catch (ex) { toast('Invalid JSON: ' + ex.message, 'error'); }
}

// ── Change Password ───────────────────────────────────────────────────
function viewChangePassword() {
  setTitle('Change Password');
  render(`
    <div class="page-header"><h2>Change Password</h2></div>
    <div class="card" style="max-width:400px">
      <div class="card-body">
        <form onsubmit="submitChangePassword(event)">
          <div class="form-group" style="margin-bottom:14px"><label class="form-label">Current Password</label><input class="form-input" type="password" id="cpCurrent" required /></div>
          <div class="form-group" style="margin-bottom:14px"><label class="form-label">New Password</label><input class="form-input" type="password" id="cpNew" required /></div>
          <div class="form-group" style="margin-bottom:20px"><label class="form-label">Confirm New Password</label><input class="form-input" type="password" id="cpConfirm" required /></div>
          <button class="btn btn-primary" type="submit">Update Password</button>
        </form>
      </div>
    </div>
  `);
}
async function submitChangePassword(e) {
  e.preventDefault();
  if (document.getElementById('cpNew').value !== document.getElementById('cpConfirm').value) { toast('Passwords do not match', 'error'); return; }
  try {
    await api('POST', '/auth/change-password', { currentPassword: document.getElementById('cpCurrent').value, newPassword: document.getElementById('cpNew').value });
    toast('Password updated! Please log in again.', 'success');
    setTimeout(logout, 1500);
  } catch (ex) { toast(ex.message, 'error'); }
}

// ── Notifications view ────────────────────────────────────────────────
async function viewNotifications() {
  setTitle('Notifications');
  await loadNotifications();
  navigate('dashboard');
}

// ════════════════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════════════════
async function init() {
  try {
    const data = await api('GET', '/auth/verify');
    USER  = data.user;
    PERMS = new Set(data.permissions);
    IMI_URL = data.imiPortalUrl || '';
    localStorage.setItem('img_user', JSON.stringify(USER));
    localStorage.setItem('img_perms', JSON.stringify(data.permissions));
    buildSidebar();
    loadNotifications();
    setInterval(loadNotifications, 30000);
    navigate('dashboard');
  } catch {
    logout();
  }
}

// Close dropdowns on outside click
document.addEventListener('click', e => {
  if (!document.getElementById('userChip').contains(e.target))
    document.getElementById('userDropdown').classList.remove('open');
  if (!document.getElementById('notifBtn').contains(e.target) && !document.getElementById('notifPanel').contains(e.target))
    document.getElementById('notifPanel').classList.remove('open');
  // Close search dropdowns
  document.querySelectorAll('.search-dropdown').forEach(d => {
    if (!d.closest('.search-wrap').contains(e.target)) d.classList.remove('open');
  });
});

init();
