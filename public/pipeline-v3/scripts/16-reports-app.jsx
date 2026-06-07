// Reports page — IMG CRM. Computes everything possible from real DEALS;
// shows empty states where real history/activities/quotas don't exist yet.
// (Backend for historical trends, activities, and quotas is not built yet.)

const { useState, useMemo, useEffect } = React;

// Stage → win probability (server uses the same map). Keys are lowercase.
const STAGE_PROB = { prospect: 25, lead: 10, tender: 40, analysis: 50, negotiation: 75, closing: 90 };

// Derive a "Q<n> YYYY" label from a date string (used by the closing-quarter filter).
function deriveQuarter(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
}

// Adapt a real /api/opportunities row to the lightweight deal shape the report
// aggregations use. Replaces the old static window.DEALS demo data.
function adaptDeal(row) {
  const stage = String(row.stage || '').toLowerCase();
  const closingSource = row.expected_closing || row.close_date || null;
  return {
    id: 'OPP-' + row.id, dbId: row.id, name: row.title,
    value: row.expected_value || 0,
    status: row.status || 'Active',
    stage,
    probability: STAGE_PROB[stage] ?? 0,
    owner: row.salesman_name || '—',
    salesmanId: row.salesman_id || null,
    scope: row.product_group || 'Other',
    system: row.system || null,
    brand: row.brand || null,
    segment: row.segment || null,
    district: row.district || null,
    quarter: deriveQuarter(closingSource),
    closeDate: row.close_date || null,
    closedAt: row.closed_at || null,
    lostReason: row.lost_reason_label || null,
    age: row.created_at ? Math.floor((Date.now() - new Date(row.created_at).getTime()) / 86400000) : 0,
  };
}

function ReportsApp() {
  const Icons = window.Icons;
  const { Trend, Briefcase, Users, File, Download, Calendar, ChevDown, Filter, Check } = Icons;

  const [activeNav, setActiveNav] = useState('reports');
  const [activeTab, setActiveTab] = useState('overview');
  const [popover, setPopover] = useState(null);
  const [toast, setToast] = useState(null);
  const fireToast = (msg) => setToast({ msg });

  // Per-tab filters — each tab keeps its own selection so filtering one view
  // doesn't disturb another. Shape: { overview:{key:[vals]}, pipeline:{}, design:{} }.
  const [filtersByTab, setFiltersByTab] = useState({ overview: {}, pipeline: {}, design: {} });
  const filters = filtersByTab[activeTab] || {};
  const setFilters = (next) => setFiltersByTab(prev => ({ ...prev, [activeTab]: typeof next === 'function' ? next(prev[activeTab] || {}) : next }));
  const activeFilterCount = Object.values(filters).reduce((n, arr) => n + (arr?.length || 0), 0);

  // ---- Load the real user roster so the sidebar + switcher match every page ----
  const [, setUsersReady] = useState(false);
  useEffect(() => {
    window.loadRealUsers().then(ok => { if (ok) setUsersReady(true); });
  }, []);

  // Real pipeline data — role-scoped by the API (salesman → own; managers → all).
  const [dealsState, setDealsState] = useState(null);
  useEffect(() => {
    window.api.get('/opportunities')
      .then(rows => setDealsState((rows || []).map(adaptDeal)))
      .catch(() => setDealsState([]));
  }, []);
  const dealsReady = dealsState !== null;
  const deals = dealsState || [];

  // ---- Filter dimensions. Each entry: [dealKey, label, isStage]. Options are
  //      derived live from the loaded deals (stage uses the canonical order). ----
  const FILTER_GROUPS_META = [
    ['owner',    'Salesman',                false],
    ['scope',    'Product',                 false],
    ['quarter',  'Expected closing quarter', false],
    ['stage',    'Stage',                   true ],
    ['status',   'Status',                  false],
    ['system',   'System',                  false],
    ['brand',    'Brand',                   false],
    ['segment',  'Sector',                  false],
    ['district', 'Location',                false],
  ];
  const filterOptions = useMemo(() => {
    const out = {};
    FILTER_GROUPS_META.forEach(([key]) => {
      if (key === 'stage') { out[key] = (window.STAGE_ORDER || []).slice(); return; }
      const seen = new Set();
      deals.forEach(d => { const v = d[key]; if (v != null && v !== '') seen.add(v); });
      out[key] = [...seen].sort((a, b) => String(a).localeCompare(String(b)));
    });
    return out;
  }, [deals]);
  // FilterPopover group config (adds the live options per group).
  const filterGroups = FILTER_GROUPS_META.map(([key, label, isStage]) => [key, label, filterOptions[key] || [], isStage]);

  // Active tab's deals after applying its filters (client-side, like the pipeline).
  const filteredDeals = useMemo(() => {
    let list = deals;
    FILTER_GROUPS_META.forEach(([key]) => {
      if (filters[key]?.length) list = list.filter(d => filters[key].includes(d[key]));
    });
    return list;
  }, [deals, filters]);

  // When the Salesman filter narrows to exactly one person, drive the merged
  // sales scorecard's drill-in to that person.
  const selectedSalesmen = filters.owner || [];

  // Targets (for the dashboard gauges). Only privileged roles can read; ignore errors for others.
  const [targets, setTargets] = useState(null);
  const reloadTargets = React.useCallback(() => {
    window.api.get('/reports/targets').then(setTargets).catch(() => setTargets(null));
  }, []);
  useEffect(() => { reloadTargets(); }, [reloadTargets]);
  const roleKey = (window.CURRENT_USER && window.CURRENT_USER.roleKey) || '';
  const canEditTargets = ['admin', 'product_manager'].includes(roleKey);

  // ---------- Derived metrics (all real, computed live) ----------
  const stats = useMemo(() => {
    const open       = filteredDeals.filter(d => d.status === 'Active');
    const won        = filteredDeals.filter(d => d.status === 'Won');
    const lost       = filteredDeals.filter(d => d.status === 'Lost');
    const totalPipeline = open.reduce((s, d) => s + d.value, 0);
    const weighted   = open.reduce((s, d) => s + (d.value * d.probability / 100), 0);
    const totalWon   = won.reduce((s, d) => s + d.value, 0);
    const totalLost  = lost.reduce((s, d) => s + d.value, 0);
    const winRate    = (won.length + lost.length) > 0 ? totalWon / (totalWon + totalLost) : null;
    const winRateCount = (won.length + lost.length) > 0 ? won.length / (won.length + lost.length) : null;
    const avgDeal    = open.length > 0 ? totalPipeline / open.length : 0;
    return { open, won, lost, totalPipeline, weighted, totalWon, totalLost, winRate, winRateCount, avgDeal };
  }, [filteredDeals]);

  // Pipeline by stage (active deals only — won/lost are excluded from kanban columns)
  const byStage = useMemo(() => {
    const map = {};
    window.STAGE_ORDER.forEach(k => { map[k] = { count: 0, value: 0 }; });
    filteredDeals.forEach(d => {
      if (map[d.stage]) {
        map[d.stage].count += 1;
        map[d.stage].value += d.value;
      }
    });
    return window.STAGE_ORDER.map(k => ({ stage: k, ...map[k], meta: window.STAGE_META[k] }));
  }, [filteredDeals]);

  // Sales by owner — real users only
  const byOwner = useMemo(() => {
    const map = {};
    filteredDeals.forEach(d => {
      if (!d.owner) return;
      if (!map[d.owner]) map[d.owner] = { name: d.owner, deals: 0, value: 0, weighted: 0, won: 0 };
      if (d.status === 'Won') {
        map[d.owner].won += d.value;
      } else if (d.status === 'Active') {
        map[d.owner].deals += 1;
        map[d.owner].value += d.value;
        map[d.owner].weighted += d.value * d.probability / 100;
      }
    });
    return Object.values(map).sort((a, b) => b.value - a.value);
  }, [filteredDeals]);

  // Won revenue by product group (live aggregation)
  const scopeBreakdown = useMemo(() => {
    const colors = {
      'VRF Systems':     'var(--stage-tender)',
      'Split Units':     'var(--img-orange)',
      'Chiller Systems': 'var(--stage-analysis)',
      'Ducted Units':    'var(--img-green)',
      'Fan Coils':       'var(--stage-prospect)',
      'AHU':             'var(--stage-negotiation)',
    };
    const map = {};
    filteredDeals.filter(d => d.status === 'Active').forEach(d => {
      const k = d.scope || 'Other';
      map[k] = (map[k] || 0) + d.value;
    });
    return Object.entries(map).map(([label, value]) => ({ label, value, color: colors[label] || 'var(--neutral-300)' }))
      .sort((a, b) => b.value - a.value);
  }, [filteredDeals]);

  return (
    <>
      <window.Sidebar
        active={activeNav}
        onNav={(id) => {
          if (id === 'pipeline')     { window.location.href = 'Pipeline.html'; return; }
          if (id === 'contacts')     { window.location.href = 'Contacts.html'; return; }
          if (id === 'design-board') { window.location.href = 'DesignBoard.html'; return; }
          if (id === 'my-tasks')     { window.location.href = 'MyTasks.html'; return; }
          if (id === 'pricelist')    { window.location.href = 'Pricelist.html'; return; }
          if (id === 'costing')      { window.location.href = 'QuotationCosting.html'; return; }
          setActiveNav(id);
        }}
        onUserMenu={(rect) => setPopover({ kind: 'user', rect })}
        onNotifications={(rect) => setPopover({ kind: 'notif', rect })}
      />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <window.TopBar
          title="Reports"
          tabs={[
            { id: 'overview',    label: 'Overview',    icon: Trend },
            { id: 'pipeline',    label: 'Pipeline',    icon: Briefcase },
            { id: 'design',      label: 'Design',      icon: File },
          ]}
          activeTab={activeTab}
          onTab={setActiveTab}
          right={activeTab === 'design' ? null : (
            <button style={{ ...tbBtn, gap: 6 }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              onClick={e => setPopover({ kind: 'filter', rect: e.currentTarget.getBoundingClientRect() })}>
              <Filter size={14} /> Filter
              {activeFilterCount > 0 && (
                <span style={{ background: 'var(--img-orange)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999 }}>{activeFilterCount}</span>
              )}
            </button>
          )}
          showBreadcrumbs={true}
        />

        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)' }}>
          {activeTab === 'design' ? <DesignTab />
            : !dealsReady ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-tertiary)' }}>Loading…</div>
            : activeTab === 'overview' ? <OverviewTab stats={stats} byStage={byStage} byOwner={byOwner} scopeBreakdown={scopeBreakdown} deals={filteredDeals} targets={targets} canEditTargets={canEditTargets} onTargetsSaved={reloadTargets} selectedSalesmen={selectedSalesmen} />
            : activeTab === 'pipeline' ? <PipelineTab byStage={byStage} deals={filteredDeals} />
            : null}
        </div>
      </main>

      {popover?.kind === 'notif' && <window.NotificationsPopover anchorRect={popover.rect} onClose={() => setPopover(null)} />}
      {popover?.kind === 'user'  && <window.UserMenu anchorRect={popover.rect} onClose={() => setPopover(null)} onAction={(a) => fireToast(`Open ${a}…`)} />}
      {popover?.kind === 'filter' && (
        <window.FilterPopover anchorRect={popover.rect} onClose={() => setPopover(null)}
          filters={filters} setFilters={setFilters} groups={filterGroups} />
      )}

      <window.Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

const tbBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '6px 10px', height: 30, borderRadius: 6,
  background: 'transparent', color: 'var(--fg-primary)', border: 'none',
  fontSize: 13, fontWeight: 500, cursor: 'pointer',
};

// ============================================================
// OVERVIEW TAB
// ============================================================
// Reusable colour palette for the system/brand breakdown charts.
const CHART_PALETTE = [
  'var(--stage-tender, #4C8DFF)', 'var(--img-orange, #F0A028)', 'var(--stage-analysis, #8B5CF6)',
  'var(--img-green, #2EA44F)', 'var(--stage-prospect, #64748B)', 'var(--stage-negotiation, #E0731A)',
  '#D64545', '#0EA5E9', '#CA8A04', '#DB2777',
];

function OverviewTab({ stats, byStage, byOwner, scopeBreakdown, deals = [], targets, canEditTargets, onTargetsSaved, selectedSalesmen = [] }) {
  const [targetsOpen, setTargetsOpen] = useState(false);
  const [chartMode, setChartMode] = useState('won');   // 'won' = closed sales · 'pipeline' = active value

  // Sales-by-dimension aggregation for the System/Brand charts. `won` sums Won
  // deal value; `pipeline` sums Active deal value. Built from the filtered deals.
  const breakdownBy = (key) => {
    const map = {};
    deals.forEach(d => {
      const inScope = chartMode === 'won' ? d.status === 'Won' : d.status === 'Active';
      if (!inScope) return;
      const k = d[key] || 'Unspecified';
      map[k] = (map[k] || 0) + (d.value || 0);
    });
    return Object.entries(map)
      .map(([label, value], i) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .map((row, i) => ({ ...row, color: CHART_PALETTE[i % CHART_PALETTE.length] }));
  };
  const bySystemSales = breakdownBy('system');
  const byBrandSales  = breakdownBy('brand');
  const ChartToggle = () => (
    <div style={{ display: 'inline-flex', border: '1px solid var(--border-default)', borderRadius: 6, overflow: 'hidden' }}>
      {['won', 'pipeline'].map(m => (
        <button key={m} onClick={() => setChartMode(m)} style={{
          padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none',
          background: chartMode === m ? 'var(--img-orange)' : 'transparent',
          color: chartMode === m ? '#fff' : 'var(--fg-secondary)',
        }}>{m === 'won' ? 'Won' : 'Pipeline'}</button>
      ))}
    </div>
  );

  // Annual target gauge: actual = won-to-date (already filtered via stats).
  // Target must match the filter scope — company when unfiltered, else the sum
  // of the selected salesmen's targets so we don't compare a rep's won to the
  // whole department's target.
  const targetScope = (() => {
    if (!selectedSalesmen.length) {
      return { annual: targets?.company?.annual || 0, monthly: targets?.company?.monthly || 0, label: 'Whole department' };
    }
    const sel = (targets?.salesmen || []).filter(s => selectedSalesmen.includes(s.name));
    return {
      annual: sel.reduce((a, s) => a + (s.annual || 0), 0),
      monthly: sel.reduce((a, s) => a + (s.monthly || 0), 0),
      label: selectedSalesmen.join(', '),
    };
  })();
  const annualTarget = targetScope.annual;
  const monthlyTarget = targetScope.monthly;
  const wonToDate = stats.totalWon;

  // Monthly actual = won deals closed in the current calendar month (by closed_at).
  const now = new Date();
  const monthWon = deals.filter(d => d.status === 'Won' && d.closedAt &&
    new Date(d.closedAt).getFullYear() === now.getFullYear() &&
    new Date(d.closedAt).getMonth() === now.getMonth())
    .reduce((s, d) => s + d.value, 0);

  // Deal status distribution (counts) → pie.
  const statusPie = [
    { label: 'Active', value: stats.open.length, color: 'var(--stage-tender, #4C8DFF)' },
    { label: 'Won',    value: stats.won.length,  color: 'var(--img-green, #2EA44F)' },
    { label: 'Lost',   value: stats.lost.length, color: 'var(--color-danger, #D64545)' },
  ].filter(s => s.value > 0);

  // Actual revenue by month (won, by closed_at) → bars (last 6 months).
  const revByMonth = (() => {
    const buckets = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString('en', { month: 'short' }), value: 0 });
    }
    const idx = Object.fromEntries(buckets.map((b, i) => [b.key, i]));
    deals.filter(d => d.status === 'Won' && d.closedAt).forEach(d => {
      const dt = new Date(d.closedAt); const k = `${dt.getFullYear()}-${dt.getMonth()}`;
      if (k in idx) buckets[idx[k]].value += d.value;
    });
    return buckets;
  })();
  const hasMonthRevenue = revByMonth.some(b => b.value > 0);

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top row: target gauge + KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr', gap: 16 }}>
        <Card title="Annual target" subtitle={`Won to date vs target · ${targetScope.label}`}
          right={canEditTargets ? <button onClick={() => setTargetsOpen(true)} style={tbBtn}>Set targets</button> : null}>
          {annualTarget > 0
            ? <Gauge actual={wonToDate} target={annualTarget} />
            : <NoHistory>{canEditTargets ? 'No annual target set yet — click "Set targets".' : 'No annual target set yet.'}</NoHistory>}
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <KPI label="Avg deal value" value={stats.open.length ? fmt(stats.avgDeal) : '—'} sub={stats.open.length ? 'Across open deals' : 'No open deals'} />
          <KPI label="Active deals — forecasted revenue" value={fmt(stats.weighted)} sub="Probability-weighted" accent="orange" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <KPI label="Won to date" value={fmt(stats.totalWon)} sub={`${stats.won.length} won deals`} accent="green" />
          <KPI label="Win rate" value={stats.winRateCount != null ? `${(stats.winRateCount*100).toFixed(0)}%` : '—'} sub={stats.winRateCount != null ? `by deal count · ${stats.winRate != null ? (stats.winRate*100).toFixed(0) : '—'}% by value` : 'No closed deals'} accent="green" />
        </div>
      </div>

      {/* Monthly target progress */}
      <Card title="Monthly target" subtitle={`This month's won vs target · ${targetScope.label}`}>
        {monthlyTarget > 0
          ? <TargetBar actual={monthWon} target={monthlyTarget} />
          : <NoHistory>No monthly target set{canEditTargets ? ' — set an annual target and it splits to monthly.' : '.'}</NoHistory>}
      </Card>

      {/* Status pie + win/loss donut */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card title="Deal status distribution" subtitle="All deals by status">
          {statusPie.length === 0 ? <NoHistory>No deals.</NoHistory> : <Pie segments={statusPie} />}
        </Card>
        <Card title="Win / loss" subtitle={stats.won.length + stats.lost.length === 0 ? 'No closed deals yet' : 'By value'}>
          {stats.won.length + stats.lost.length === 0
            ? <NoHistory>No deals have been closed Won or Lost yet.</NoHistory>
            : <WinLossDonut won={stats.totalWon} lost={stats.totalLost} />}
        </Card>
      </div>

      {/* Revenue by month */}
      <Card title="Actual revenue by month (deals won)" subtitle="By close date">
        {hasMonthRevenue ? <MonthBars data={revByMonth} />
          : <NoHistory>No won deals have a recorded close date yet — this fills in as deals close from now on.</NoHistory>}
      </Card>

      {/* Pipeline funnel + leaderboard */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card title="Pipeline by stage" subtitle="Active deals & value">
          <Funnel byStage={byStage} />
        </Card>
        <Card title="Sales leaderboard" subtitle="Pipeline value by owner">
          <Leaderboard rows={byOwner} />
        </Card>
      </div>

      <Card title="Open pipeline by product group" subtitle="Live aggregation">
        {scopeBreakdown.length === 0 ? <NoHistory>No open deals.</NoHistory> : <ScopeBars items={scopeBreakdown} />}
      </Card>

      {/* Sales by system + by brand — Won (closed sales) vs Pipeline (active value) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card title="Sales by system" subtitle={chartMode === 'won' ? 'Won deal value' : 'Active pipeline value'} right={<ChartToggle />}>
          {bySystemSales.length === 0 ? <NoHistory>No {chartMode === 'won' ? 'won' : 'open'} deals.</NoHistory> : <Pie segments={bySystemSales} money />}
        </Card>
        <Card title="Sales by brand" subtitle={chartMode === 'won' ? 'Won deal value' : 'Active pipeline value'} right={<ChartToggle />}>
          {byBrandSales.length === 0 ? <NoHistory>No {chartMode === 'won' ? 'won' : 'open'} deals.</NoHistory> : <ScopeBars items={byBrandSales} />}
        </Card>
      </div>

      {/* Merged sales scorecard — whole team by default; one salesman when the
          Salesman filter narrows to a single person. */}
      <div style={{ marginTop: 4, paddingTop: 16, borderTop: '2px solid var(--border-subtle)' }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>Sales performance</div>
        <div style={{ fontSize: 12, color: 'var(--fg-secondary)', marginBottom: 12 }}>
          Profitability, mix, speed & accuracy{selectedSalesmen.length ? ` · filtered to ${selectedSalesmen.join(', ')}` : ' · whole department'}
        </div>
        <PerformanceTab filterNames={selectedSalesmen} embedded />
      </div>

      {targetsOpen && (
        <TargetsModal targets={targets} onClose={() => setTargetsOpen(false)}
          onSaved={() => { setTargetsOpen(false); onTargetsSaved?.(); }} />
      )}
    </div>
  );
}

// ============================================================
// PIPELINE TAB
// ============================================================
function PipelineTab({ byStage, deals }) {
  const total = byStage.reduce((s, x) => s + x.value, 0);
  const aging = []; // age=0 in seed data — no aging info until we track stage entry timestamps
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        {byStage.map(s => (
          <div key={s.stage} className="img-card" style={{
            padding: 14, borderRadius: 10, background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderTop: `3px solid ${s.meta.fg}`,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{s.meta.label}</div>
            <div className="t-num" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{fmtShort(s.value)}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-secondary)', marginTop: 2 }}>
              {s.count} deals{total > 0 ? ` · ${((s.value/total)*100).toFixed(0)}%` : ''}
            </div>
          </div>
        ))}
      </div>

      <Card title="Conversion funnel" subtitle="Deal counts across stages">
        <ConvFunnel byStage={byStage} />
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <Card title="Top open deals" subtitle="By weighted value">
          <DealList deals={[...deals]
            .filter(d => d.status === 'Active')
            .sort((a, b) => (b.value*b.probability) - (a.value*a.probability))
            .slice(0, 8)} />
        </Card>
        <Card title="Aging deals" subtitle="In-stage > 21 days">
          {aging.length === 0
            ? <NoHistory>No stage-history yet — deal age tracking will activate once we record stage transitions.</NoHistory>
            : <AgingList deals={aging} />}
        </Card>
      </div>
    </div>
  );
}

// ============================================================
// PERFORMANCE TAB — real salesman scorecard (role-scoped)
//   • salesman  → own scorecard only (no peers, no margin)
//   • managers/PM/admin → comparison table → drill into a scorecard (with margin)
// ============================================================
const pctFmt = (x) => x == null ? '—' : `${(x * 100).toFixed(0)}%`;

// `filterNames` (optional) = salesman names selected in the report's Salesman
// filter; narrows the table and auto-drills when exactly one matches.
// `embedded` drops the outer padding (it lives inside OverviewTab).
function PerformanceTab({ filterNames = [], embedded = false }) {
  const [data, setData]       = useState(null);   // { scope, can_view_margin, salesmen[] }
  const [error, setError]     = useState(null);
  const [selectedId, setSel]  = useState(null);    // manual drill-in (team view)

  useEffect(() => {
    window.api.get('/reports/salesman-performance')
      .then(setData)
      .catch(e => setError(e?.status === 403 ? 'forbidden' : (e?.message || 'Could not load report.')));
  }, []);
  // Reset manual drill-in whenever the external filter changes.
  useEffect(() => { setSel(null); }, [filterNames.join('|')]);

  const pad = embedded ? 0 : 24;
  if (error === 'forbidden') {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-tertiary)', fontSize: 13 }}>
      The salesman performance report is for sales management.
    </div>;
  }
  if (error) return <div style={{ padding: pad, color: '#B0241D', fontSize: 13 }}>{error}</div>;
  if (!data) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-tertiary)' }}>Loading…</div>;

  const { scope, can_view_margin, salesmen } = data;

  // Apply the external Salesman filter (by name) to the team list.
  const filtered = filterNames.length ? salesmen.filter(s => filterNames.includes(s.salesman_name)) : salesmen;
  // Auto-drill when the filter pins exactly one person; else honor a manual click.
  const effectiveId = filterNames.length === 1 && filtered[0] ? filtered[0].salesman_id : selectedId;

  // Self view, or a single (filtered/clicked) salesman → scorecard.
  if (scope === 'self' || effectiveId != null) {
    const person = scope === 'self' ? salesmen[0] : salesmen.find(s => s.salesman_id === effectiveId);
    if (!person) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-tertiary)' }}>No data for this salesman yet.</div>;
    const showBack = scope === 'team' && filterNames.length !== 1; // filter-driven drill has no manual back
    return (
      <div style={{ padding: pad, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {showBack && (
          <button onClick={() => setSel(null)} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--fg-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}>← Back to team</button>
        )}
        <Scorecard person={person} showMargin={can_view_margin} />
      </div>
    );
  }

  // Team view → comparison table.
  return (
    <div style={{ padding: pad, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card title="Salesman performance" subtitle="All-time · click a row for the full scorecard">
        <SalesComparison rows={filtered} showMargin={can_view_margin} onPick={setSel} />
      </Card>
    </div>
  );
}

function Scorecard({ person, showMargin }) {
  const p = person;
  const stages = Object.entries(p.by_stage || {});
  return (
    <>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{p.salesman_name}</div>

      {/* PROFITABILITY LEADS — margin is what keeps the lights on, not revenue.
          Managers/PM only. Empty states fill in as costed quotes accrue. */}
      {showMargin && (
        <Card title="Profitability — gross margin" subtitle="The headline metric: price vs cost">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--fg-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Won deals</div>
              {p.won_margin_pct == null
                ? <NoHistory>No won deal has a costed quotation yet — won-deal margin fills in as quoted deals are won.</NoHistory>
                : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                    <KPI label="Gross margin" value={pctFmt(p.won_margin_pct)} accent={p.won_margin_pct < 0.15 ? 'orange' : 'green'} sub={`${p.won_deal_count} won w/ quote`} />
                    <KPI label="Revenue" value={fmt(p.won_revenue)} />
                    <KPI label="Cost"    value={fmt(p.won_cost)} />
                  </div>
                )}
            </div>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--fg-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Quoted deals (any status)</div>
              {p.quoted_margin_pct == null
                ? <NoHistory>No quotations with cost data for this salesman yet.</NoHistory>
                : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                    <KPI label="Gross margin" value={pctFmt(p.quoted_margin_pct)} accent={p.quoted_margin_pct < 0.15 ? 'orange' : 'green'} sub={`${p.quoted_deal_count} quoted deal${p.quoted_deal_count === 1 ? '' : 's'}`} />
                    <KPI label="Revenue (costed)" value={fmt(p.quoted_revenue)} />
                    <KPI label="Cost"    value={fmt(p.quoted_cost)} />
                  </div>
                )}
            </div>
          </div>
        </Card>
      )}

      {/* Results */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KPI label="Won revenue"      value={fmt(p.won_value)} sub={`${p.won_count} won${p.lost_count ? ` · ${p.lost_count} lost` : ''}`} accent="green" />
        <KPI label="Win rate"         value={pctFmt(p.win_rate_count)} sub={p.win_rate_value != null ? `${pctFmt(p.win_rate_value)} by value` : 'No closed deals'} />
        <KPI label="Open pipeline"    value={fmt(p.open_value)} sub={`${p.open_count} open deals`} accent="orange" />
        <KPI label="Weighted forecast" value={fmt(p.weighted_value)} sub="Probability-adjusted" accent="green" />
      </div>

      {/* Efficiency & accuracy — verifiable leverage, not assumed effort */}
      <Card title="Efficiency & accuracy" subtitle="Speed, follow-up and technical accuracy">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <MiniStat label="Stalled deals" value={p.stalled_ratio == null ? '—' : `${(p.stalled_ratio * 100).toFixed(0)}%`}
            hint={`${p.stalled_count} open deal(s) with no movement in 30+ days. The real follow-up signal.`}
            warn={p.stalled_ratio != null && p.stalled_ratio >= 0.3} />
          <MiniStat label="Avg cycle (won)" value={p.avg_cycle_days == null ? '—' : `${p.avg_cycle_days} d`}
            hint="Average days from creation to won. Faster = accurate specs, less friction." />
          <MiniStat label="Cross-sell" value={p.avg_categories == null ? '—' : p.avg_categories.toFixed(1)}
            hint={`Avg distinct product families per quoted deal (${p.cross_sell_deals} deal(s)). Higher = bundling accessories/controls.`} />
          <MiniStat label="Technical rework" value={p.rework_ratio == null ? '—' : `${(p.rework_ratio * 100).toFixed(0)}%`}
            hint={`Share of modifications caused by our own sizing/selection errors (${p.internal_mods}/${p.total_mods}). External & commercial changes don't count.`}
            warn={p.rework_ratio != null && p.rework_ratio >= 0.4} />
          <MiniStat label="Modifications" value={p.modification_requests}
            hint="Total modification requests — neutral. Iteration is often value-engineering, not a fault; the cause split (rework) is what matters." />
          <MiniStat label="Avg discount" value={pctFmt(p.avg_discount_pct)}
            hint="Average discount given. Only a problem if it breaks margin — read it next to gross margin above." />
        </div>
      </Card>

      {/* Conversion by system tier — a blended win rate hides everything */}
      <Card title="Conversion by system" subtitle="Win rate split by system — a blended rate is a vanity metric">
        {Object.keys(p.by_system || {}).length === 0
          ? <NoHistory>No deals to break down by system yet.</NoHistory>
          : <SystemBreakdown bySystem={p.by_system} />}
      </Card>

      {/* Loss by reason — distinguishes early disqualification from late loss */}
      <Card title="Losses by reason" subtitle="Why deals were lost">
        {Object.keys(p.loss_by_reason || {}).length === 0
          ? <NoHistory>No lost deals yet.</NoHistory>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(p.loss_by_reason).sort((a, b) => b[1] - a[1]).map(([reason, n]) => (
                <div key={reason} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--fg-secondary)' }}>{reason}</span>
                  <span style={{ fontWeight: 700 }}>{n}</span>
                </div>
              ))}
            </div>
          )}
      </Card>

      {/* Their pipeline by stage */}
      <Card title="Open deals by stage" subtitle="Where their active pipeline sits">
        {stages.length === 0
          ? <NoHistory>No open deals.</NoHistory>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stages.map(([stage, count]) => (
                <div key={stage} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--fg-secondary)' }}>{(window.STAGE_META?.[String(stage).toLowerCase()]?.label) || stage}</span>
                  <span style={{ fontWeight: 700 }}>{count}</span>
                </div>
              ))}
            </div>
          )}
      </Card>
    </>
  );
}

// Win-rate-by-system table — the segmentation that makes conversion meaningful.
function SystemBreakdown({ bySystem }) {
  const th = { textAlign: 'right', padding: '6px 8px', fontSize: 10.5, fontWeight: 700, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--border-subtle)' };
  const thL = { ...th, textAlign: 'left' };
  const td = { textAlign: 'right', padding: '7px 8px', borderBottom: '1px solid var(--border-subtle)', fontSize: 12.5 };
  const tdL = { ...td, textAlign: 'left', fontWeight: 600 };
  const rows = Object.entries(bySystem).map(([sys, v]) => {
    const closed = v.won_count + v.lost_count;
    return { sys, ...v, winRate: closed > 0 ? v.won_count / closed : null };
  }).sort((a, b) => b.won_value - a.won_value);
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr>
        <th style={thL}>System</th>
        <th style={th}>Won</th><th style={th}>Lost</th><th style={th}>Open</th>
        <th style={th}>Win rate</th><th style={th}>Won value</th>
      </tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.sys}>
            <td style={tdL}>{r.sys}</td>
            <td style={td}>{r.won_count}</td>
            <td style={td}>{r.lost_count}</td>
            <td style={td}>{r.open_count}</td>
            <td style={td}>{r.winRate == null ? '—' : `${(r.winRate * 100).toFixed(0)}%`}</td>
            <td style={td}>{fmt(r.won_value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MiniStat({ label, value, hint, warn }) {
  return (
    <div title={hint} style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg-surface)', border: `1px solid ${warn ? '#F5C77E' : 'var(--border-subtle)'}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: warn ? 'var(--img-orange-700, #B8680E)' : 'var(--fg-primary)' }}>{value}</div>
      <div style={{ fontSize: 10.5, color: 'var(--fg-tertiary)', marginTop: 4, lineHeight: 1.35 }}>{hint}</div>
    </div>
  );
}

function SalesComparison({ rows, showMargin, onPick }) {
  if (!rows.length) return <NoHistory>No salesmen with deals yet.</NoHistory>;
  const th = { textAlign: 'right', padding: '8px 10px', fontSize: 10.5, fontWeight: 700, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--border-subtle)' };
  const thL = { ...th, textAlign: 'left' };
  const td = { textAlign: 'right', padding: '9px 10px', borderBottom: '1px solid var(--border-subtle)', fontSize: 12.5 };
  const tdL = { ...td, textAlign: 'left', fontWeight: 600 };
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr>
        <th style={thL}>Salesman</th>
        {showMargin && <th style={th} title="Gross margin on quoted deals — the headline">Margin</th>}
        <th style={th}>Won</th><th style={th}>Win rate</th>
        <th style={th}>Open pipeline</th><th style={th}>Weighted</th>
        <th style={th} title="Open deals with no movement in 30+ days">Stalled</th>
        <th style={th} title="Modifications caused by our own sizing/selection errors">Rework</th>
        <th style={th}>Avg disc</th>
      </tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.salesman_id} onClick={() => onPick(r.salesman_id)} style={{ cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover, #f7f7f7)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <td style={tdL}>{r.salesman_name}</td>
            {showMargin && <td style={{ ...td, fontWeight: 700, color: (r.quoted_margin_pct != null && r.quoted_margin_pct < 0.15) ? 'var(--img-orange-700, #B8680E)' : 'var(--fg-primary)' }}>{pctFmt(r.quoted_margin_pct)}</td>}
            <td style={td}>{fmt(r.won_value)}</td>
            <td style={td}>{pctFmt(r.win_rate_count)}</td>
            <td style={td}>{fmt(r.open_value)}</td>
            <td style={td}>{fmt(r.weighted_value)}</td>
            <td style={{ ...td, color: (r.stalled_ratio != null && r.stalled_ratio >= 0.3) ? 'var(--img-orange-700, #B8680E)' : 'var(--fg-primary)' }}>{r.stalled_ratio == null ? '—' : `${(r.stalled_ratio * 100).toFixed(0)}%`}</td>
            <td style={{ ...td, color: (r.rework_ratio != null && r.rework_ratio >= 0.4) ? 'var(--img-orange-700, #B8680E)' : 'var(--fg-primary)' }}>{r.rework_ratio == null ? '—' : `${(r.rework_ratio * 100).toFixed(0)}%`}</td>
            <td style={{ ...td, color: (r.avg_discount_pct != null && r.avg_discount_pct >= 0.20) ? 'var(--img-orange-700, #B8680E)' : 'var(--fg-primary)' }}>{pctFmt(r.avg_discount_pct)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ============================================================
// DESIGN TAB — designer performance (role-scoped)
//   • designer → own scorecard only
//   • managers/PM/admin → comparison table → drill into a designer
//   • salesman → restricted
// ============================================================
function fmtDuration(min) {
  if (min == null || min === 0) return '—';
  if (min >= 1440) return (min / 1440).toFixed(1) + ' d';
  if (min >= 60)   return (min / 60).toFixed(1) + ' h';
  return Math.round(min) + ' m';
}

function DesignTab() {
  const [data, setData]      = useState(null);
  const [error, setError]    = useState(null);
  const [selectedId, setSel] = useState(null);

  useEffect(() => {
    window.api.get('/design-performance')
      .then(setData)
      .catch(e => setError(e?.status === 403 ? 'forbidden' : (e?.message || 'Could not load report.')));
  }, []);

  if (error === 'forbidden') {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-tertiary)', fontSize: 13 }}>
      The designer performance report is for design management.
    </div>;
  }
  if (error) return <div style={{ padding: 24, color: '#B0241D', fontSize: 13 }}>{error}</div>;
  if (!data) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-tertiary)' }}>Loading…</div>;

  const { scope, designers } = data;

  if (scope === 'self' || selectedId != null) {
    const d = scope === 'self' ? designers[0] : designers.find(x => x.id === selectedId);
    if (!d) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-tertiary)' }}>No data for this designer yet.</div>;
    return (
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {scope === 'per_designer' && (
          <button onClick={() => setSel(null)} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--fg-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}>← Back to team</button>
        )}
        <DesignerScorecard d={d} />
      </div>
    );
  }

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card title="Designer performance" subtitle="All-time · click a row for the full scorecard">
        <DesignComparison rows={designers} onPick={setSel} />
      </Card>
    </div>
  );
}

function DesignerScorecard({ d }) {
  return (
    <>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{d.name}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        <KPI label="Completed designs" value={d.completed_count} sub="Released / approved" accent="green" />
        <KPI label="Active load"       value={d.active_count} sub="In progress now" accent="orange" />
        <KPI label="Avg design time"   value={fmtDuration(d.avg_design_time)} sub="In-progress + review" />
      </div>
      <Card title="Quality & speed" subtitle="How cleanly and quickly they deliver">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <MiniStat label="Avg turnaround" value={fmtDuration(d.avg_total_turnaround)}
            hint="Incoming → released, end to end." />
          <MiniStat label="Revision rate" value={pctFmt(d.revision_rate)}
            hint="Share of designs sent back for rework. Lower is better."
            warn={d.revision_rate >= 0.3} />
          <MiniStat label="First-time approval" value={pctFmt(d.first_time_approval_rate)}
            hint="Share approved without any revision. Higher is better."
            warn={d.first_time_approval_rate > 0 && d.first_time_approval_rate < 0.6} />
        </div>
      </Card>
    </>
  );
}

function DesignComparison({ rows, onPick }) {
  if (!rows.length) return <NoHistory>No designers yet.</NoHistory>;
  const th = { textAlign: 'right', padding: '8px 10px', fontSize: 10.5, fontWeight: 700, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--border-subtle)' };
  const thL = { ...th, textAlign: 'left' };
  const td = { textAlign: 'right', padding: '9px 10px', borderBottom: '1px solid var(--border-subtle)', fontSize: 12.5 };
  const tdL = { ...td, textAlign: 'left', fontWeight: 600 };
  const sorted = [...rows].sort((a, b) => b.completed_count - a.completed_count);
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr>
        <th style={thL}>Designer</th>
        <th style={th}>Completed</th><th style={th}>Active</th>
        <th style={th}>Avg design time</th><th style={th}>Turnaround</th>
        <th style={th} title="Lower is better">Revision rate</th>
        <th style={th} title="Higher is better">1st-time approval</th>
      </tr></thead>
      <tbody>
        {sorted.map(d => (
          <tr key={d.id} onClick={() => onPick(d.id)} style={{ cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover, #f7f7f7)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <td style={tdL}>{d.name}</td>
            <td style={td}>{d.completed_count}</td>
            <td style={td}>{d.active_count}</td>
            <td style={td}>{fmtDuration(d.avg_design_time)}</td>
            <td style={td}>{fmtDuration(d.avg_total_turnaround)}</td>
            <td style={{ ...td, color: d.revision_rate >= 0.3 ? 'var(--img-orange-700, #B8680E)' : 'var(--fg-primary)' }}>{pctFmt(d.revision_rate)}</td>
            <td style={td}>{pctFmt(d.first_time_approval_rate)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// (Forecast tab removed — its job is now the "Expected closing quarter" filter,
//  which narrows every chart and the scorecard by quarter.)

// ============================================================
// PRIMITIVES
// ============================================================
function KPI({ label, value, sub, accent }) {
  const accentColors = {
    green:  { bg: 'var(--img-green-50)',  fg: 'var(--img-green-700)' },
    orange: { bg: 'var(--img-orange-50)', fg: 'var(--img-orange-700)' },
  }[accent];
  return (
    <div className="img-card" style={{
      padding: '14px 16px', borderRadius: 10,
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      boxShadow: 'var(--shadow-xs)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      </div>
      <div className="t-num" style={{
        fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 6,
        color: accentColors ? accentColors.fg : 'var(--fg-primary)',
      }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--fg-secondary)', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function Card({ title, subtitle, right, children }) {
  return (
    <div className="img-card" style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 10, boxShadow: 'var(--shadow-xs)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11.5, color: 'var(--fg-secondary)', marginTop: 1 }}>{subtitle}</div>}
        </div>
        {right}
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </div>
  );
}

function NoHistory({ children }) {
  return (
    <div style={{
      padding: 28, border: '1px dashed var(--border-default)', borderRadius: 8,
      textAlign: 'center', fontSize: 12.5, color: 'var(--fg-tertiary)', lineHeight: 1.5,
    }}>{children}</div>
  );
}

// ============================================================
// CHARTS — only the ones with real data left in
// ============================================================
function WinLossDonut({ won, lost }) {
  const total = won + lost;
  const winPct = total > 0 ? won / total : 0;
  const R = 54, CX = 100, CY = 100, STROKE = 18;
  const C = 2 * Math.PI * R;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
      <svg width="200" height="200" viewBox="0 0 200 200" style={{ flexShrink: 0 }}>
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--color-danger-bg)" strokeWidth={STROKE} />
        <circle cx={CX} cy={CY} r={R} fill="none"
          stroke="var(--img-green)" strokeWidth={STROKE}
          strokeDasharray={`${C * winPct} ${C * (1 - winPct)}`}
          strokeDashoffset={C / 4} transform="rotate(-90 100 100) scale(1, -1) translate(0, -200)"
          strokeLinecap="butt" />
        <text x={CX} y={CY - 4} textAnchor="middle" fontSize="26" fontWeight="700" fill="var(--fg-primary)" fontFamily="Poppins" style={{ letterSpacing: '-0.02em' }}>
          {(winPct * 100).toFixed(0)}%
        </text>
        <text x={CX} y={CY + 16} textAnchor="middle" fontSize="11" fill="var(--fg-secondary)" fontFamily="Poppins">Win rate</text>
      </svg>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <DonutLegend color="var(--img-green)" label="Won"   value={won}  total={total} />
        <DonutLegend color="var(--color-danger)" label="Lost" value={lost} total={total} />
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 8, fontSize: 11.5, color: 'var(--fg-secondary)' }}>
          <span style={{ fontWeight: 600, color: 'var(--fg-primary)' }} className="t-num">{fmt(total)}</span> closed
        </div>
      </div>
    </div>
  );
}

function DonutLegend({ color, label, value, total }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg-primary)', fontWeight: 500 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: color }}></span>
          {label}
        </span>
        <span className="t-num" style={{ fontSize: 12, color: 'var(--fg-secondary)' }}>{total > 0 ? ((value/total)*100).toFixed(0) : 0}%</span>
      </div>
      <div className="t-num" style={{ fontSize: 14, fontWeight: 600 }}>{fmt(value)}</div>
    </div>
  );
}

function Funnel({ byStage }) {
  const max = Math.max(1, ...byStage.map(s => s.value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {byStage.map(s => {
        const pct = s.value / max;
        return (
          <div key={s.stage}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 500 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: s.meta.fg }}></span>
                {s.meta.label}
                <span style={{ color: 'var(--fg-tertiary)', fontWeight: 400 }}>· {s.count}</span>
              </span>
              <span className="t-num" style={{ fontSize: 12.5, fontWeight: 600 }}>{fmtShort(s.value)}</span>
            </div>
            <div style={{ height: 14, background: 'var(--neutral-50)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                width: `${pct * 100}%`, height: '100%',
                background: `linear-gradient(90deg, ${s.meta.fg}, ${s.meta.fg}cc)`,
                transition: 'width 600ms var(--ease-out)',
              }}></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ConvFunnel({ byStage }) {
  const max = Math.max(1, ...byStage.map(s => s.count));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {byStage.map((s, i) => {
        const w = 30 + (s.count / max) * 70;
        const next = byStage[i + 1];
        const drop = next && s.count > 0 ? Math.round(((s.count - next.count) / s.count) * 100) : null;
        return (
          <div key={s.stage} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 110, fontSize: 12.5, fontWeight: 500, textAlign: 'right', color: 'var(--fg-secondary)' }}>{s.meta.label}</div>
            <div style={{ flex: 1, position: 'relative', height: 38, display: 'flex', alignItems: 'center' }}>
              <div style={{
                width: `${w}%`, height: 28, background: s.meta.fg,
                clipPath: 'polygon(0 0, 100% 0, 96% 100%, 4% 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 12, fontWeight: 600,
              }}>
                <span className="t-num">{s.count} · {fmtShort(s.value)}</span>
              </div>
            </div>
            <div style={{ width: 90, fontSize: 11, color: drop != null && drop > 0 ? 'var(--color-danger)' : 'var(--fg-tertiary)' }}>
              {drop != null ? (drop > 0 ? `↓ ${drop}% drop-off` : '—') : <span style={{ color: 'var(--img-green-700)', fontWeight: 600 }}>↑ to close</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Leaderboard({ rows }) {
  if (rows.length === 0) return <NoHistory>No deals assigned to owners yet.</NoHistory>;
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.map((r, i) => (
        <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="t-num" style={{ width: 18, fontSize: 11, color: 'var(--fg-tertiary)', fontWeight: 600, textAlign: 'right' }}>{i + 1}</div>
          <window.Avatar name={r.name} size={28} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 12.5, fontWeight: 500 }}>{r.name}</span>
              <span className="t-num" style={{ fontSize: 12.5, fontWeight: 600 }}>{fmtShort(r.value)}</span>
            </div>
            <div style={{ height: 6, background: 'var(--neutral-50)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                width: `${(r.value / max) * 100}%`, height: '100%',
                background: i === 0 ? 'var(--img-orange)' : 'var(--img-green)',
                transition: 'width 600ms var(--ease-out)',
              }}></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ScopeBars({ items }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  return (
    <div>
      <div style={{ display: 'flex', height: 16, borderRadius: 4, overflow: 'hidden', marginBottom: 14 }}>
        {items.map(i => (
          <div key={i.label} title={`${i.label} · ${fmt(i.value)}`}
            style={{ width: `${(i.value/total)*100}%`, background: i.color }}></div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {items.map(i => (
          <div key={i.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: i.color, flexShrink: 0 }}></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.label}</div>
              <div className="t-num" style={{ fontSize: 11, color: 'var(--fg-secondary)' }}>{fmtShort(i.value)} · {((i.value/total)*100).toFixed(0)}%</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DealList({ deals, showClose }) {
  if (!deals.length) return <NoHistory>No deals match this filter.</NoHistory>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {deals.map(d => {
        const meta = window.STAGE_META[d.stage];
        return (
          <a key={d.id} onClick={() => window.location.href = 'Pipeline.html'}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
              borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', textDecoration: 'none' }}>
            <div style={{ width: 4, height: 28, borderRadius: 2, background: meta?.fg || 'var(--neutral-300)' }}></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-secondary)', display: 'flex', gap: 6 }}>
                <span>{d.account}</span><span>·</span><span>{d.owner}</span>
                {showClose && d.closeDate && <><span>·</span><span>Closes {window.formatDate(d.closeDate)}</span></>}
              </div>
            </div>
            <window.StageChip stage={d.stage} variant="pill" size="sm" />
            <div className="t-num" style={{ fontSize: 12.5, fontWeight: 600, width: 90, textAlign: 'right' }}>{fmtShort(d.value)}</div>
            <div className="t-num" style={{ fontSize: 11, color: 'var(--fg-secondary)', width: 36, textAlign: 'right' }}>{d.probability}%</div>
          </a>
        );
      })}
    </div>
  );
}

function AgingList({ deals }) {
  if (!deals.length) return <NoHistory>No aging deals — pipeline is healthy.</NoHistory>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {deals.slice(0, 6).map(d => {
        const danger = d.age > 28;
        return (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0',
            borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-secondary)' }}>{d.owner} · {window.STAGE_META[d.stage].label}</div>
            </div>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4,
              background: danger ? 'var(--color-danger-bg)' : 'var(--color-warning-bg)',
              color: danger ? '#B0241D' : 'var(--img-orange-700)',
            }} className="t-num">{d.age}d</span>
          </div>
        );
      })}
    </div>
  );
}

function OwnerTable({ rows }) {
  if (rows.length === 0) return <NoHistory>No deals assigned to owners yet.</NoHistory>;
  return (
    <div>
      <div style={{
        display: 'grid', gridTemplateColumns: '32px 1.4fr 1fr 1fr 0.8fr 0.8fr',
        gap: 12, padding: '8px 4px', fontSize: 10.5, fontWeight: 700,
        color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div></div>
        <div>Owner</div>
        <div style={{ textAlign: 'right' }}>Won</div>
        <div style={{ textAlign: 'right' }}>Weighted</div>
        <div style={{ textAlign: 'right' }}>Open</div>
        <div style={{ textAlign: 'right' }}>Avg deal</div>
      </div>
      {rows.map((r) => (
        <div key={r.name} style={{
          display: 'grid', gridTemplateColumns: '32px 1.4fr 1fr 1fr 0.8fr 0.8fr',
          gap: 12, padding: '12px 4px', alignItems: 'center',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <window.Avatar name={r.name} size={28} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</div>
            <div style={{ fontSize: 11, color: 'var(--fg-secondary)' }}>Sales · {r.deals} active</div>
          </div>
          <div className="t-num" style={{ fontSize: 13, fontWeight: 600, textAlign: 'right' }}>{r.won > 0 ? fmtShort(r.won) : '—'}</div>
          <div className="t-num" style={{ fontSize: 13, color: 'var(--fg-secondary)', textAlign: 'right' }}>{fmtShort(r.weighted)}</div>
          <div className="t-num" style={{ fontSize: 13, textAlign: 'right' }}>{r.deals}</div>
          <div className="t-num" style={{ fontSize: 13, color: 'var(--fg-secondary)', textAlign: 'right' }}>{r.deals ? fmtShort(r.value / r.deals) : '—'}</div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// FORMATTERS
// ============================================================
function fmt(n) { return 'JOD ' + Math.round(n).toLocaleString('en-US'); }
function fmtShort(n) {
  if (n >= 1_000_000) return 'JOD ' + (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return 'JOD ' + (n / 1_000).toFixed(0) + 'k';
  return 'JOD ' + Math.round(n);
}

// ============================================================
// NEW DASHBOARD PRIMITIVES (gauge, target bar, pie, month bars) + targets modal
// ============================================================
function Gauge({ actual, target }) {
  const pct = target > 0 ? Math.max(0, Math.min(1, actual / target)) : 0;
  // Semicircle: 180° sweep from left (180°) to right (0°).
  const CX = 110, CY = 110, R = 90, STROKE = 18;
  const polar = (deg) => {
    const rad = (Math.PI / 180) * deg;
    return [CX + R * Math.cos(rad), CY - R * Math.sin(rad)];
  };
  const arc = (fromDeg, toDeg) => {
    const [x1, y1] = polar(fromDeg), [x2, y2] = polar(toDeg);
    const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`;
  };
  const valDeg = 180 - pct * 180;      // 180° (0%) → 0° (100%)
  const [nx, ny] = polar(valDeg);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width="220" height="135" viewBox="0 0 220 135">
        <path d={arc(180, 0)} fill="none" stroke="var(--neutral-200)" strokeWidth={STROKE} strokeLinecap="round" />
        {pct > 0 && <path d={arc(180, valDeg)} fill="none" stroke="var(--img-green)" strokeWidth={STROKE} strokeLinecap="round" />}
        <line x1={CX} y1={CY} x2={nx} y2={ny} stroke="var(--fg-primary)" strokeWidth="3" />
        <circle cx={CX} cy={CY} r="5" fill="var(--fg-primary)" />
        <text x={CX} y={CY - 22} textAnchor="middle" fontSize="24" fontWeight="800" fill="var(--fg-primary)" fontFamily="Poppins">{(pct * 100).toFixed(0)}%</text>
      </svg>
      <div style={{ display: 'flex', gap: 28, marginTop: 4 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Actual</div>
          <div className="t-num" style={{ fontSize: 18, fontWeight: 800 }}>{fmtShort(actual)}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Target</div>
          <div className="t-num" style={{ fontSize: 18, fontWeight: 800 }}>{fmtShort(target)}</div>
        </div>
      </div>
    </div>
  );
}

function TargetBar({ actual, target }) {
  const pct = target > 0 ? Math.max(0, Math.min(1, actual / target)) : 0;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}>
        <span className="t-num" style={{ fontWeight: 700 }}>{fmt(actual)}</span>
        <span style={{ color: 'var(--fg-secondary)' }}>target {fmt(target)}</span>
      </div>
      <div style={{ height: 16, borderRadius: 8, background: 'var(--neutral-200)', overflow: 'hidden' }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: pct >= 1 ? 'var(--img-green)' : 'var(--img-orange)', borderRadius: 8, transition: 'width 200ms' }}></div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--fg-secondary)', marginTop: 4 }}>{(pct * 100).toFixed(0)}% of target</div>
    </div>
  );
}

function Pie({ segments, money }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const CX = 90, CY = 90, R = 80;
  let acc = 0;
  const polar = (frac) => {
    const ang = 2 * Math.PI * frac - Math.PI / 2;
    return [CX + R * Math.cos(ang), CY + R * Math.sin(ang)];
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <svg width="180" height="180" viewBox="0 0 180 180" style={{ flexShrink: 0 }}>
        {segments.map((seg, i) => {
          const frac = seg.value / total;
          const [x1, y1] = polar(acc); acc += frac; const [x2, y2] = polar(acc);
          const large = frac > 0.5 ? 1 : 0;
          if (segments.length === 1) return <circle key={i} cx={CX} cy={CY} r={R} fill={seg.color} />;
          return <path key={i} d={`M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`} fill={seg.color} />;
        })}
      </svg>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {segments.map((seg, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: seg.color }}></span>{seg.label}
            </span>
            <span style={{ color: 'var(--fg-secondary)' }}>{money ? fmtShort(seg.value) : seg.value} · {((seg.value / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthBars({ data }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 200, padding: '10px 4px 0' }}>
      {data.map((b, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 6 }}>
          <span className="t-num" style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-secondary)' }}>{b.value ? fmtShort(b.value) : ''}</span>
          <div style={{ width: '70%', maxWidth: 64, height: `${(b.value / max) * 100}%`, minHeight: b.value ? 4 : 0, background: 'var(--stage-tender, #4C8DFF)', borderRadius: '5px 5px 0 0' }}></div>
          <span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{b.label}</span>
        </div>
      ))}
    </div>
  );
}

function TargetsModal({ targets, onClose, onSaved }) {
  const year = targets?.year || new Date().getFullYear();
  const [companyAnnual, setCompanyAnnual] = useState(targets?.company?.annual || '');
  const [rows, setRows] = useState((targets?.salesmen || []).map(s => ({ salesman_id: s.salesman_id, name: s.name, annual: s.annual || '' })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const inp = { height: 32, padding: '0 10px', border: '1px solid var(--border-default)', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', textAlign: 'right', width: 160 };

  const save = async () => {
    setSaving(true); setError(null);
    try {
      await window.api.put('/reports/targets', {
        year,
        company_annual: companyAnnual === '' ? 0 : Number(companyAnnual),
        per_salesman: rows.map(r => ({ salesman_id: r.salesman_id, annual_amount: r.annual === '' ? 0 : Number(r.annual) })),
      });
      onSaved();
    } catch (e) { setError(e?.message || 'Save failed.'); setSaving(false); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(40,38,36,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: 20, width: 'min(520px, 92vw)', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-xl)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Sales targets — {year}</div>
        <div style={{ fontSize: 12, color: 'var(--fg-secondary)', marginBottom: 14 }}>Annual amounts (JOD). Monthly target = annual ÷ 12.</div>
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ fontWeight: 700 }}>Company (all sales)</span>
            <input type="number" value={companyAnnual} onChange={e => setCompanyAnnual(e.target.value)} placeholder="0" style={inp} />
          </div>
          {rows.map((r, i) => (
            <div key={r.salesman_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: 'var(--fg-secondary)' }}>{r.name}</span>
              <input type="number" value={r.annual} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, annual: e.target.value } : x))} placeholder="0" style={inp} />
            </div>
          ))}
        </div>
        {error && <div style={{ marginTop: 10, padding: 8, fontSize: 12, color: '#B0241D', background: '#FDECEC', border: '1px solid #F5B6B1', borderRadius: 6 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} disabled={saving} style={{ padding: '7px 14px', borderRadius: 6, fontSize: 12.5, fontWeight: 600, background: 'var(--bg-surface)', color: 'var(--fg-primary)', border: '1px solid var(--border-default)', cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ padding: '7px 14px', borderRadius: 6, fontSize: 12.5, fontWeight: 700, background: 'var(--img-orange)', color: '#fff', border: '1px solid var(--img-orange)', cursor: saving ? 'wait' : 'pointer' }}>{saving ? 'Saving…' : 'Save targets'}</button>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<ReportsApp />);
