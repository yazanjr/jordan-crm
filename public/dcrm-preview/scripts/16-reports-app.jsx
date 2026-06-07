// Reports page — IMG CRM. Pulls from window.DEALS, plus seeded historical
// data for trend charts. Uses inline SVG for charts (no external libs).

const { useState, useMemo, useEffect } = React;

// ---------- Seeded historical data (12 months ending May 2026) ----------
const REVENUE_TREND = [
  { m: 'Jun', y: 25, won: 380000, lost: 120000, target: 450000 },
  { m: 'Jul', y: 25, won: 412000, lost: 95000,  target: 450000 },
  { m: 'Aug', y: 25, won: 358000, lost: 180000, target: 480000 },
  { m: 'Sep', y: 25, won: 495000, lost: 132000, target: 480000 },
  { m: 'Oct', y: 25, won: 524000, lost: 88000,  target: 500000 },
  { m: 'Nov', y: 25, won: 460000, lost: 215000, target: 500000 },
  { m: 'Dec', y: 25, won: 612000, lost: 105000, target: 520000 },
  { m: 'Jan', y: 26, won: 388000, lost: 142000, target: 520000 },
  { m: 'Feb', y: 26, won: 542000, lost: 96000,  target: 540000 },
  { m: 'Mar', y: 26, won: 674000, lost: 188000, target: 540000 },
  { m: 'Apr', y: 26, won: 590000, lost: 124000, target: 560000 },
  { m: 'May', y: 26, won: 318000, lost: 72000,  target: 560000 },
];

const SCOPE_BREAKDOWN = [
  { label: 'VRF',              value: 1240000, color: 'var(--stage-tender)' },
  { label: 'Chillers',         value: 1860000, color: 'var(--img-orange)' },
  { label: 'AHU + ducting',    value:  720000, color: 'var(--stage-analysis)' },
  { label: 'Full MEP / HVAC',  value: 2110000, color: 'var(--img-green)' },
  { label: 'FCU',              value:  340000, color: 'var(--stage-prospect)' },
  { label: 'Industrial vent.', value:  280000, color: 'var(--stage-negotiation)' },
];

function ReportsApp() {
  const Icons = window.Icons;
  const { Trend, Briefcase, Users, File, Download, Calendar, ChevDown, Filter, Check } = Icons;

  const [activeNav, setActiveNav] = useState('reports');
  const [activeTab, setActiveTab] = useState('overview');
  const [dateRange, setDateRange] = useState('Last 12 months');
  const [popover, setPopover] = useState(null);
  const [toast, setToast] = useState(null);
  const fireToast = (msg) => setToast({ msg });

  // ---------- Derived metrics ----------
  const deals = window.DEALS || [];
  const stats = useMemo(() => {
    const totalPipeline = deals.reduce((s, d) => s + d.value, 0);
    const weighted = deals.reduce((s, d) => s + (d.value * d.probability / 100), 0);
    const totalWonYTD = REVENUE_TREND.filter(m => m.y === 26).reduce((s, m) => s + m.won, 0);
    const totalLostYTD = REVENUE_TREND.filter(m => m.y === 26).reduce((s, m) => s + m.lost, 0);
    const winRate = totalWonYTD / (totalWonYTD + totalLostYTD);
    const avgDeal = totalPipeline / deals.length;
    return { totalPipeline, weighted, totalWonYTD, totalLostYTD, winRate, avgDeal, count: deals.length };
  }, [deals]);

  // Pipeline by stage
  const byStage = useMemo(() => {
    const map = {};
    window.STAGE_ORDER.forEach(k => { map[k] = { count: 0, value: 0 }; });
    deals.forEach(d => {
      if (map[d.stage]) {
        map[d.stage].count += 1;
        map[d.stage].value += d.value;
      }
    });
    return window.STAGE_ORDER.map(k => ({ stage: k, ...map[k], meta: window.STAGE_META[k] }));
  }, [deals]);

  // Sales by owner
  const byOwner = useMemo(() => {
    const map = {};
    deals.forEach(d => {
      if (!map[d.owner]) map[d.owner] = { name: d.owner, deals: 0, value: 0, weighted: 0 };
      map[d.owner].deals += 1;
      map[d.owner].value += d.value;
      map[d.owner].weighted += d.value * d.probability / 100;
    });
    // Add seeded YTD won column for leaderboard interest
    const wonYTD = {
      'Hala Jaber':  920000,
      'Rami Haddad': 1240000,
      'Sana Khalil':  860000,
      'Ahmad Marji':  580000,
      'Layla Odeh':   410000,
    };
    return Object.values(map).map(o => ({ ...o, won: wonYTD[o.name] || 0 }))
      .sort((a, b) => b.won - a.won);
  }, [deals]);

  return (
    <>
      <window.Sidebar
        active={activeNav}
        onNav={(id) => {
          if (id === 'pipeline' || id === 'dashboard') { window.location.href = 'Pipeline.html'; return; }
          if (id === 'contacts') { window.location.href = 'Contacts.html'; return; }
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
            { id: 'performance', label: 'Performance', icon: Users },
            { id: 'forecast',    label: 'Forecast',    icon: Calendar },
          ]}
          activeTab={activeTab}
          onTab={setActiveTab}
          right={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={(e) => setPopover({ kind: 'daterange', rect: e.currentTarget.getBoundingClientRect() })} style={tbBtn}>
                <Calendar size={14} /> {dateRange} <ChevDown size={12} />
              </button>
              <button style={tbBtn}><Filter size={14} /> Filters</button>
              <button onClick={() => fireToast('Exporting CSV…')} style={tbBtn}><Download size={14} /> Export</button>
              <button onClick={() => fireToast('Report scheduled')} style={tbPrimary}>
                <File size={14} /> Schedule report
              </button>
            </div>
          }
          showBreadcrumbs={true}
        />

        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)' }}>
          {activeTab === 'overview'    && <OverviewTab stats={stats} byStage={byStage} byOwner={byOwner} />}
          {activeTab === 'pipeline'    && <PipelineTab byStage={byStage} deals={deals} />}
          {activeTab === 'performance' && <PerformanceTab byOwner={byOwner} />}
          {activeTab === 'forecast'    && <ForecastTab stats={stats} byStage={byStage} />}
        </div>
      </main>

      {popover?.kind === 'notif' && <window.NotificationsPopover anchorRect={popover.rect} onClose={() => setPopover(null)} />}
      {popover?.kind === 'user' && <window.UserMenu anchorRect={popover.rect} onClose={() => setPopover(null)} onAction={(a) => fireToast(`Open ${a}…`)} />}
      {popover?.kind === 'daterange' && (
        <window.PopupShell.Popover anchorRect={popover.rect} onClose={() => setPopover(null)} width={200} align="right">
          <div style={{ padding: 4 }}>
            {['This month', 'This quarter', 'YTD', 'Last 12 months', 'Last 24 months', 'Custom range…'].map(r => (
              <window.PopupShell.MenuItem key={r}
                icon={dateRange === r ? Check : null}
                onClick={() => { setDateRange(r); setPopover(null); }}>
                {r}
              </window.PopupShell.MenuItem>
            ))}
          </div>
        </window.PopupShell.Popover>
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
const tbPrimary = {
  ...tbBtn, padding: '6px 14px', height: 32,
  background: 'var(--img-orange)', color: '#fff', borderRadius: 7, fontWeight: 600,
};

// ============================================================
// OVERVIEW TAB
// ============================================================
function OverviewTab({ stats, byStage, byOwner }) {
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KPI label="Pipeline value"  value={fmt(stats.totalPipeline)} sub={`${stats.count} open deals`} delta={+12.4} accent="orange" />
        <KPI label="Weighted forecast" value={fmt(stats.weighted)}    sub="Probability-adjusted"        delta={+8.1} accent="green" />
        <KPI label="Won YTD"          value={fmt(stats.totalWonYTD)}  sub={`Win rate ${(stats.winRate*100).toFixed(1)}%`} delta={+24.6} accent="green" />
        <KPI label="Avg deal size"    value={fmt(stats.avgDeal)}      sub="Across all stages"           delta={-3.2} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16 }}>
        {/* Revenue trend */}
        <Card title="Revenue trend" subtitle="Won vs target — last 12 months"
          right={<Legend items={[
            { label: 'Won',    color: 'var(--img-green)' },
            { label: 'Lost',   color: 'var(--color-danger)' },
            { label: 'Target', color: 'var(--neutral-400)', dashed: true },
          ]} />}
        >
          <RevenueChart />
        </Card>

        {/* Win/loss donut */}
        <Card title="Win / loss" subtitle="Year-to-date">
          <WinLossDonut won={stats.totalWonYTD} lost={stats.totalLostYTD} />
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Pipeline funnel */}
        <Card title="Pipeline by stage" subtitle="Active deals & value">
          <Funnel byStage={byStage} />
        </Card>

        {/* Sales leaderboard */}
        <Card title="Sales leaderboard" subtitle="Won YTD by owner"
          right={<a style={linkBtn} onClick={() => {}}>View all</a>}>
          <Leaderboard rows={byOwner} />
        </Card>
      </div>

      {/* Scope breakdown */}
      <Card title="Won revenue by scope" subtitle="Last 12 months">
        <ScopeBars items={SCOPE_BREAKDOWN} />
      </Card>
    </div>
  );
}

// ============================================================
// PIPELINE TAB
// ============================================================
function PipelineTab({ byStage, deals }) {
  const total = byStage.reduce((s, x) => s + x.value, 0);
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        {byStage.map(s => (
          <div key={s.stage} className="img-card" style={{
            padding: 14, borderRadius: 10, background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderTop: `3px solid ${s.meta.fg.replace('var(--', '').replace(')', '') ? s.meta.fg : 'var(--neutral-300)'}`,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{s.meta.label}</div>
            <div className="t-num" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{fmtShort(s.value)}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-secondary)', marginTop: 2 }}>{s.count} deals · {((s.value/total)*100).toFixed(0)}%</div>
          </div>
        ))}
      </div>

      <Card title="Conversion funnel" subtitle="Drop-off between stages">
        <ConvFunnel byStage={byStage} />
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <Card title="Top open deals" subtitle="By weighted value">
          <DealList deals={[...deals].sort((a, b) => (b.value*b.probability) - (a.value*a.probability)).slice(0, 8)} />
        </Card>
        <Card title="Aging deals" subtitle="In-stage > 21 days">
          <AgingList deals={deals.filter(d => d.age > 21).sort((a, b) => b.age - a.age)} />
        </Card>
      </div>
    </div>
  );
}

// ============================================================
// PERFORMANCE TAB
// ============================================================
function PerformanceTab({ byOwner }) {
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card title="Owner performance" subtitle="Won, weighted pipeline & open deals">
        <OwnerTable rows={byOwner} />
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card title="Activities this week" subtitle="Calls, emails, meetings logged">
          <ActivityHeatmap />
        </Card>
        <Card title="Quota attainment" subtitle="Q2 2026">
          <QuotaList />
        </Card>
      </div>
    </div>
  );
}

// ============================================================
// FORECAST TAB
// ============================================================
function ForecastTab({ stats, byStage }) {
  const commit  = stats.totalPipeline * 0.30;
  const best    = stats.weighted * 1.35;
  const worst   = stats.weighted * 0.55;
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        <KPI label="Commit"        value={fmt(commit)} sub="High-confidence deals"   accent="green" />
        <KPI label="Best case"     value={fmt(best)}   sub="If everything closes"     accent="orange" />
        <KPI label="Worst case"    value={fmt(worst)}  sub="Conservative scenario"   />
      </div>

      <Card title="Forecast vs target" subtitle="Q2 2026 — JOD 1.6M target">
        <ForecastBar weighted={stats.weighted} target={1600000} />
      </Card>

      <Card title="Deals expected to close — next 60 days">
        <DealList deals={(window.DEALS || []).filter(d => {
          const days = window.daysUntil(d.closeDate);
          return days >= 0 && days <= 60;
        }).sort((a, b) => window.daysUntil(a.closeDate) - window.daysUntil(b.closeDate))} showClose />
      </Card>
    </div>
  );
}

// ============================================================
// PRIMITIVES
// ============================================================
function KPI({ label, value, sub, delta, accent }) {
  const accentColors = {
    green:  { bg: 'var(--img-green-50)',  fg: 'var(--img-green-700)' },
    orange: { bg: 'var(--img-orange-50)', fg: 'var(--img-orange-700)' },
  }[accent];
  const positive = (delta || 0) >= 0;
  return (
    <div className="img-card" style={{
      padding: '14px 16px', borderRadius: 10,
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      boxShadow: 'var(--shadow-xs)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
        {delta != null && (
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
            background: positive ? 'var(--img-green-50)' : 'var(--color-danger-bg)',
            color: positive ? 'var(--img-green-700)' : '#B0241D',
          }}>
            {positive ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
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

function Legend({ items }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {items.map(i => (
        <div key={i.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--fg-secondary)' }}>
          <span style={{
            width: 14, height: i.dashed ? 0 : 8, borderRadius: i.dashed ? 0 : 2,
            background: i.dashed ? 'transparent' : i.color,
            borderTop: i.dashed ? `2px dashed ${i.color}` : 'none',
          }}></span>
          {i.label}
        </div>
      ))}
    </div>
  );
}

const linkBtn = {
  fontSize: 12, color: 'var(--img-orange-700)', cursor: 'pointer', fontWeight: 500,
};

// ============================================================
// CHARTS
// ============================================================
function RevenueChart() {
  const W = 720, H = 220, PAD_L = 44, PAD_R = 12, PAD_T = 16, PAD_B = 30;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const maxY = Math.max(...REVENUE_TREND.map(d => Math.max(d.won, d.target))) * 1.1;

  const x = (i) => PAD_L + (i / (REVENUE_TREND.length - 1)) * innerW;
  const y = (v) => PAD_T + innerH - (v / maxY) * innerH;

  // area + line for won
  const wonPath = REVENUE_TREND.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.won)}`).join(' ');
  const wonArea = `${wonPath} L ${x(REVENUE_TREND.length - 1)} ${PAD_T + innerH} L ${x(0)} ${PAD_T + innerH} Z`;
  const targetPath = REVENUE_TREND.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.target)}`).join(' ');

  const yTicks = 4;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => (maxY / yTicks) * i);

  const [hoverI, setHoverI] = useState(null);

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}
           onMouseLeave={() => setHoverI(null)}>
        <defs>
          <linearGradient id="wonGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--img-green)" stopOpacity="0.28"/>
            <stop offset="100%" stopColor="var(--img-green)" stopOpacity="0"/>
          </linearGradient>
        </defs>

        {/* gridlines + y-axis labels */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} stroke="var(--border-subtle)" strokeWidth="1" />
            <text x={PAD_L - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--fg-tertiary)" fontFamily="JetBrains Mono">
              {t === 0 ? '0' : (t / 1000).toFixed(0) + 'k'}
            </text>
          </g>
        ))}

        {/* lost bars (small, behind) */}
        {REVENUE_TREND.map((d, i) => (
          <rect key={i} x={x(i) - 3} y={y(0) - (d.lost / maxY) * innerH * 0.4}
            width={6} height={(d.lost / maxY) * innerH * 0.4}
            fill="var(--color-danger)" opacity="0.35" rx="1" />
        ))}

        {/* won area + line */}
        <path d={wonArea} fill="url(#wonGrad)" />
        <path d={wonPath} fill="none" stroke="var(--img-green)" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" />

        {/* target dashed line */}
        <path d={targetPath} fill="none" stroke="var(--neutral-400)" strokeWidth="1.5" strokeDasharray="4 3" />

        {/* points */}
        {REVENUE_TREND.map((d, i) => (
          <circle key={i} cx={x(i)} cy={y(d.won)} r={hoverI === i ? 5 : 3.5}
            fill="var(--bg-surface)" stroke="var(--img-green)" strokeWidth="2" />
        ))}

        {/* x-axis labels */}
        {REVENUE_TREND.map((d, i) => (
          <text key={i} x={x(i)} y={H - 10} textAnchor="middle" fontSize="10" fill="var(--fg-secondary)" fontFamily="Poppins">
            {d.m}
          </text>
        ))}

        {/* hover hit areas */}
        {REVENUE_TREND.map((d, i) => (
          <rect key={i} x={x(i) - innerW/(REVENUE_TREND.length-1)/2}
            y={PAD_T} width={innerW/(REVENUE_TREND.length-1)} height={innerH}
            fill="transparent" onMouseEnter={() => setHoverI(i)} />
        ))}

        {/* hover tooltip */}
        {hoverI != null && (
          <g>
            <line x1={x(hoverI)} x2={x(hoverI)} y1={PAD_T} y2={PAD_T + innerH}
              stroke="var(--img-orange)" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />
          </g>
        )}
      </svg>
      {hoverI != null && (
        <div style={{
          position: 'absolute', top: 8, left: `${(x(hoverI)/W)*100}%`,
          transform: 'translateX(-50%)', pointerEvents: 'none',
          background: 'var(--neutral-900)', color: '#fff',
          padding: '6px 10px', borderRadius: 6, fontSize: 11,
          whiteSpace: 'nowrap', boxShadow: 'var(--shadow-md)',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{REVENUE_TREND[hoverI].m} '{String(REVENUE_TREND[hoverI].y)}</div>
          <div className="t-num">Won {fmtShort(REVENUE_TREND[hoverI].won)}</div>
          <div className="t-num" style={{ opacity: 0.7 }}>Target {fmtShort(REVENUE_TREND[hoverI].target)}</div>
        </div>
      )}
    </div>
  );
}

function WinLossDonut({ won, lost }) {
  const total = won + lost;
  const winPct = won / total;
  const R = 54, CX = 100, CY = 100, STROKE = 18;
  const C = 2 * Math.PI * R;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
      <svg width="200" height="200" viewBox="0 0 200 200" style={{ flexShrink: 0 }}>
        <circle cx={CX} cy={CY} r={R} fill="none"
          stroke="var(--color-danger-bg)" strokeWidth={STROKE} />
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
        <DonutLegend color="var(--img-green)" label="Won"  value={won}  total={total} />
        <DonutLegend color="var(--color-danger)" label="Lost" value={lost} total={total} />
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 8, fontSize: 11.5, color: 'var(--fg-secondary)' }}>
          <span style={{ fontWeight: 600, color: 'var(--fg-primary)' }} className="t-num">{fmt(total)}</span> closed YTD
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
        <span className="t-num" style={{ fontSize: 12, color: 'var(--fg-secondary)' }}>{((value/total)*100).toFixed(1)}%</span>
      </div>
      <div className="t-num" style={{ fontSize: 14, fontWeight: 600 }}>{fmt(value)}</div>
    </div>
  );
}

function Funnel({ byStage }) {
  const max = Math.max(...byStage.map(s => s.value));
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
  // Reverse-funnel: each stage gets its count as a horizontal bar tapering down.
  const max = Math.max(...byStage.map(s => s.count));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {byStage.map((s, i) => {
        const w = 30 + (s.count / max) * 70;
        const next = byStage[i + 1];
        const drop = next ? Math.round(((s.count - next.count) / s.count) * 100) : null;
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
  const max = Math.max(...rows.map(r => r.won));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.map((r, i) => (
        <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="t-num" style={{ width: 18, fontSize: 11, color: 'var(--fg-tertiary)', fontWeight: 600, textAlign: 'right' }}>{i + 1}</div>
          <window.Avatar name={r.name} size={28} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 12.5, fontWeight: 500 }}>{r.name}</span>
              <span className="t-num" style={{ fontSize: 12.5, fontWeight: 600 }}>{fmtShort(r.won)}</span>
            </div>
            <div style={{ height: 6, background: 'var(--neutral-50)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                width: `${(r.won / max) * 100}%`, height: '100%',
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
      {/* stacked bar */}
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
  if (!deals.length) return <Empty>No deals match this filter.</Empty>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {deals.map(d => {
        const meta = window.STAGE_META[d.stage];
        return (
          <a key={d.id} onClick={() => window.location.href = 'Pipeline.html'}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
              borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', textDecoration: 'none' }}>
            <div style={{ width: 4, height: 28, borderRadius: 2, background: meta.fg }}></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-secondary)', display: 'flex', gap: 6 }}>
                <span>{d.account}</span><span>·</span><span>{d.owner}</span>
                {showClose && <><span>·</span><span>Closes {window.formatDate(d.closeDate)}</span></>}
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
  if (!deals.length) return <Empty>No aging deals — pipeline is healthy.</Empty>;
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
        <div style={{ textAlign: 'right' }}>Won YTD</div>
        <div style={{ textAlign: 'right' }}>Weighted</div>
        <div style={{ textAlign: 'right' }}>Open</div>
        <div style={{ textAlign: 'right' }}>Avg deal</div>
      </div>
      {rows.map((r, i) => (
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
          <div className="t-num" style={{ fontSize: 13, fontWeight: 600, textAlign: 'right' }}>{fmtShort(r.won)}</div>
          <div className="t-num" style={{ fontSize: 13, color: 'var(--fg-secondary)', textAlign: 'right' }}>{fmtShort(r.weighted)}</div>
          <div className="t-num" style={{ fontSize: 13, textAlign: 'right' }}>{r.deals}</div>
          <div className="t-num" style={{ fontSize: 13, color: 'var(--fg-secondary)', textAlign: 'right' }}>{fmtShort(r.value / r.deals)}</div>
        </div>
      ))}
    </div>
  );
}

function ActivityHeatmap() {
  // 7 days × 5 owners
  const owners = ['Hala J.', 'Rami H.', 'Sana K.', 'Ahmad M.', 'Layla O.'];
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  // deterministic fake data
  const cells = owners.map((o, oi) =>
    days.map((d, di) => {
      const v = ((oi + 1) * 7 + di * 3 + (oi * di * 5)) % 13;
      return v;
    })
  );
  const max = 12;
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '70px repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
        <div></div>
        {days.map(d => <div key={d} style={{ fontSize: 10, color: 'var(--fg-tertiary)', textAlign: 'center', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{d}</div>)}
      </div>
      {owners.map((o, oi) => (
        <div key={o} style={{ display: 'grid', gridTemplateColumns: '70px repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
          <div style={{ fontSize: 11.5, color: 'var(--fg-secondary)', display: 'flex', alignItems: 'center' }}>{o}</div>
          {cells[oi].map((v, di) => {
            const intensity = v / max;
            return (
              <div key={di} title={`${v} activities`} style={{
                height: 28, borderRadius: 4,
                background: v === 0 ? 'var(--neutral-50)' : `color-mix(in oklab, var(--img-orange) ${intensity * 90 + 10}%, white)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 600,
                color: intensity > 0.55 ? '#fff' : 'var(--fg-secondary)',
              }} className="t-num">{v || ''}</div>
            );
          })}
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 11, color: 'var(--fg-tertiary)' }}>
        <span>Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map(v => (
          <span key={v} style={{ width: 14, height: 10, borderRadius: 2,
            background: v === 0 ? 'var(--neutral-50)' : `color-mix(in oklab, var(--img-orange) ${v * 90 + 10}%, white)` }}></span>
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

function QuotaList() {
  const data = [
    { name: 'Rami Haddad', quota: 1500000, attained: 1240000 },
    { name: 'Hala Jaber',  quota: 1200000, attained:  920000 },
    { name: 'Sana Khalil', quota: 1100000, attained:  860000 },
    { name: 'Ahmad Marji', quota:  900000, attained:  580000 },
    { name: 'Layla Odeh',  quota:  700000, attained:  410000 },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {data.map(d => {
        const pct = d.attained / d.quota;
        const ok = pct >= 0.7;
        return (
          <div key={d.name}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 12.5, fontWeight: 500 }}>{d.name}</span>
              <span style={{ fontSize: 11.5, color: 'var(--fg-secondary)' }}>
                <span className="t-num" style={{ color: ok ? 'var(--img-green-700)' : 'var(--img-orange-700)', fontWeight: 600 }}>{(pct*100).toFixed(0)}%</span>
                <span style={{ color: 'var(--fg-tertiary)' }}> · {fmtShort(d.attained)} / {fmtShort(d.quota)}</span>
              </span>
            </div>
            <div style={{ height: 8, background: 'var(--neutral-50)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
              <div style={{
                width: `${Math.min(pct, 1) * 100}%`, height: '100%',
                background: ok ? 'var(--img-green)' : 'var(--img-orange)',
                transition: 'width 600ms var(--ease-out)',
              }}></div>
              <div style={{ position: 'absolute', top: -2, left: '100%', width: 2, height: 12, background: 'var(--neutral-400)' }}></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ForecastBar({ weighted, target }) {
  const pct = weighted / target;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="t-num" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{fmt(weighted)}</span>
        <span style={{ fontSize: 12, color: 'var(--fg-secondary)' }}>
          <span className="t-num" style={{ fontWeight: 600, color: pct >= 0.85 ? 'var(--img-green-700)' : 'var(--img-orange-700)' }}>{(pct*100).toFixed(0)}%</span> of target
        </span>
      </div>
      <div style={{ height: 14, background: 'var(--neutral-50)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
        <div style={{
          width: `${Math.min(pct, 1) * 100}%`, height: '100%',
          background: 'linear-gradient(90deg, var(--img-orange), var(--img-orange-600))',
          transition: 'width 800ms var(--ease-out)',
        }}></div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--fg-tertiary)' }}>
        <span>0</span>
        <span className="t-num">Target {fmtShort(target)}</span>
      </div>
    </div>
  );
}

function Empty({ children }) {
  return (
    <div style={{
      padding: 28, border: '1px dashed var(--border-default)', borderRadius: 8,
      textAlign: 'center', fontSize: 12.5, color: 'var(--fg-tertiary)',
    }}>{children}</div>
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

ReactDOM.createRoot(document.getElementById('root')).render(<ReportsApp />);
