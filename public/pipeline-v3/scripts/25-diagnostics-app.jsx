// Diagnostics console — the four-hypothesis reporting layer.
// Every panel is fed by /api/diagnostics/* with a shared date range and the
// internal-account exclusion toggle. Honest empty states where data hasn't accrued.

const { useState, useEffect, useCallback } = React;

const fmtJOD = (n) => n == null ? '—' : 'JOD ' + Math.round(n).toLocaleString('en-US');
const pct = (x) => x == null ? '—' : `${(x * 100).toFixed(0)}%`;
const isoToday = () => new Date().toISOString().slice(0, 10);
const isoYearsAgo = (y) => { const d = new Date(); d.setFullYear(d.getFullYear() - y); return d.toISOString().slice(0, 10); };

// ── tiny primitives ─────────────────────────────────────────────────────────
function Card({ title, subtitle, hypo, children }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 10, boxShadow: 'var(--shadow-xs)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg-primary)' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11.5, color: 'var(--fg-secondary)', marginTop: 1 }}>{subtitle}</div>}
        </div>
        {hypo && <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: 'var(--img-orange-700, #B8680E)', background: 'var(--img-orange-50, #FEF7EC)', border: '1px solid var(--img-orange-200, #F5C77E)', borderRadius: 999, padding: '2px 8px' }}>{hypo}</span>}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}
function Empty({ children }) {
  return <div style={{ padding: 20, border: '1px dashed var(--border-default)', borderRadius: 8, textAlign: 'center', fontSize: 12, color: 'var(--fg-tertiary)', lineHeight: 1.5 }}>{children}</div>;
}
function Table({ cols, rows, right = [] }) {
  if (!rows || !rows.length) return <Empty>No rows in this range.</Empty>;
  const th = (i) => ({ textAlign: right.includes(i) ? 'right' : 'left', padding: '7px 9px', fontSize: 10.5, fontWeight: 700, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--border-subtle)' });
  const td = (i) => ({ textAlign: right.includes(i) ? 'right' : 'left', padding: '7px 9px', fontSize: 12.5, borderBottom: '1px solid var(--border-subtle)' });
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{cols.map((c, i) => <th key={i} style={th(i)}>{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((cell, ci) => <td key={ci} style={td(ci)}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
function Bars({ data, money }) {
  if (!data || !data.length) return <Empty>No data.</Empty>;
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 150, fontSize: 12, color: 'var(--fg-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.label}>{d.label}</span>
          <div style={{ flex: 1, background: 'var(--neutral-100, #f1f1f1)', borderRadius: 5, height: 18 }}>
            <div style={{ width: `${(d.value / max) * 100}%`, height: '100%', minWidth: d.value ? 3 : 0, background: d.color || 'var(--img-orange)', borderRadius: 5 }}></div>
          </div>
          <span className="t-num" style={{ width: 90, textAlign: 'right', fontSize: 12, fontWeight: 700 }}>{money ? fmtJOD(d.value) : d.value}</span>
        </div>
      ))}
    </div>
  );
}
function KPI({ label, value, sub }) {
  return (
    <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div className="t-num" style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
const LIGHT = { green: '#2EA44F', yellow: '#E0A800', red: '#D64545' };

// ── data hook ───────────────────────────────────────────────────────────────
function useDiag(path, params, deps) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let live = true;
    setData(null); setErr(null);
    const qs = new URLSearchParams(params).toString();
    window.api.get(`/diagnostics/${path}?${qs}`)
      .then(d => { if (live) setData(d); })
      .catch(e => { if (live) setErr(e?.status === 403 ? 'forbidden' : (e?.message || 'error')); });
    return () => { live = false; };
  }, deps);
  return [data, err];
}
function Panel({ title, subtitle, hypo, path, params, deps, render }) {
  const [data, err] = useDiag(path, params, deps);
  return (
    <Card title={title} subtitle={subtitle} hypo={hypo}>
      {err === 'forbidden' ? <Empty>Management only.</Empty>
        : err ? <Empty>Could not load ({err}).</Empty>
        : !data ? <Empty>Loading…</Empty>
        : render(data)}
    </Card>
  );
}

// ── app ──────────────────────────────────────────────────────────────────────
function DiagnosticsApp() {
  const { Trend } = window.Icons;
  const [, setReady] = useState(false);
  useEffect(() => { window.loadRealUsers().then(ok => ok && setReady(true)); }, []);

  // draft vs applied range so we don't refetch on every keystroke.
  const [draft, setDraft] = useState({ start: isoYearsAgo(2), end: isoToday(), include_internal: false });
  const [applied, setApplied] = useState(draft);
  const p = { start: applied.start, end: applied.end };
  if (applied.include_internal) p.include_internal = 'true';
  const deps = [applied.start, applied.end, applied.include_internal];

  const inp = { height: 32, padding: '0 10px', border: '1px solid var(--border-default)', borderRadius: 7, fontSize: 13, fontFamily: 'inherit' };

  return (
    <>
      <window.Sidebar active="diagnostics" onNav={(id) => {
        const map = { pipeline: 'Pipeline.html', contacts: 'Contacts.html', reports: 'Reports.html', 'design-board': 'DesignBoard.html', 'my-tasks': 'MyTasks.html', pricelist: 'Pricelist.html', costing: 'QuotationCosting.html' };
        if (map[id]) window.location.href = map[id];
      }} />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <window.TopBar title="Diagnostics" tabs={[]} showBreadcrumbs={true} right={null} />

        {/* date-range control — the system's first real range picker */}
        <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-secondary)' }}>Date range</span>
          <input type="date" value={draft.start} onChange={e => setDraft(d => ({ ...d, start: e.target.value }))} style={inp} />
          <span style={{ color: 'var(--fg-tertiary)' }}>→</span>
          <input type="date" value={draft.end} onChange={e => setDraft(d => ({ ...d, end: e.target.value }))} style={inp} />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg-secondary)' }}>
            <input type="checkbox" checked={draft.include_internal} onChange={e => setDraft(d => ({ ...d, include_internal: e.target.checked }))} />
            Include internal accounts
          </label>
          <button onClick={() => setApplied(draft)} style={{ height: 32, padding: '0 16px', borderRadius: 7, border: 'none', background: 'var(--img-orange)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Apply</button>
          {['This year', 'Last 12 mo', 'Last 2 yr'].map((lbl, i) => (
            <button key={lbl} onClick={() => { const r = { start: [`${new Date().getFullYear()}-01-01`, isoYearsAgo(1), isoYearsAgo(2)][i], end: isoToday(), include_internal: draft.include_internal }; setDraft(r); setApplied(r); }}
              style={{ height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid var(--border-default)', background: 'transparent', fontSize: 11.5, color: 'var(--fg-secondary)', cursor: 'pointer' }}>{lbl}</button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)', padding: 24, display: 'flex', flexDirection: 'column', gap: 26 }}>
          <Section id="H2" title="Close-stage strangulation" desc="Does discount policy kill winnable deals?">
            <Panel hypo="H2·1" title="Discount gap distribution" subtitle="requested − approved %, by outcome" path="h2/discount-gap" params={p} deps={deps}
              render={d => d.total_requests === 0 ? <Empty>No discount-approval requests in range. (Within-limit discounts are auto-approved and leave no row.)</Empty>
                : <><Bars data={d.histogram.map(h => ({ label: h.bin, value: h.count }))} />
                    <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--fg-secondary)' }}>{Object.entries(d.by_outcome).map(([k, v]) => `${k}: ${v.count} (avg gap ${v.avg_gap ?? '—'}%)`).join(' · ')}</div></>} />
            <Panel hypo="H2·2" title="Deals lost after discount rejection" subtitle="the JOD cost of the policy" path="h2/lost-after-rejection" params={p} deps={deps}
              render={d => <><div style={{ marginBottom: 10, fontSize: 13 }}>{d.count} deals · <b>{fmtJOD(d.total_value)}</b> lost value</div>
                <Table cols={['Deal', 'Req %', 'Appr %', 'Value']} right={[1, 2, 3]} rows={(d.deals || []).map(r => [r.title, r.requested_pct + '%', (r.approved_pct ?? '—') + '%', fmtJOD(r.value)])} /></>} />
            <Panel hypo="H2·3" title="Stage-by-stage conversion" subtitle="% entering each stage that advanced" path="h2/stage-conversion" params={p} deps={deps}
              render={d => d.deals === 0 ? <Empty>No stage transitions in range.</Empty>
                : <Table cols={['Stage', 'Reached', '→ next']} right={[1, 2]} rows={d.stages.map(s => [s.stage, s.reached, s.conversion_to_next == null ? '—' : pct(s.conversion_to_next)])} />} />
            <Panel hypo="H2·4" title="Time in stage" subtitle="avg / median days, won vs lost" path="h2/time-in-stage" params={p} deps={deps}
              render={d => <Table cols={['Stage', 'Won avg', 'Won med', 'Lost avg', 'Lost med']} right={[1, 2, 3, 4]} rows={d.stages.map(s => [s.stage, s.won.avg_days ?? '—', s.won.median_days ?? '—', s.lost.avg_days ?? '—', s.lost.median_days ?? '—'])} />} />
            <Panel hypo="H2·5" title="Loss reasons" subtitle="watch for over-concentration in 'price'" path="h2/loss-reasons" params={p} deps={deps}
              render={d => <Bars data={d.reasons.map(r => ({ label: `${r.reason} (${r.count})`, value: r.total_value || 0 }))} money />} />
          </Section>

          <Section id="H1" title="Market access" desc="Are we absent from the specification chain?">
            <Panel hypo="H1·6" title="Awareness-stage distribution" subtitle="when did we learn of each project?" path="h1/awareness-distribution" params={p} deps={deps}
              render={d => <Bars data={d.stages.map(s => ({ label: `${s.awareness_stage} (${s.count})`, value: s.count, color: s.awareness_stage.startsWith('aware-late') || s.awareness_stage === 'unaware' ? LIGHT.red : LIGHT.green }))} />} />
            <Panel hypo="H1·7" title="Projects known but not pursued" subtitle="the missed market" path="h1/not-pursued" params={p} deps={deps}
              render={d => <><div style={{ marginBottom: 10, fontSize: 13 }}>{d.count} projects · <b>{fmtJOD(d.total_missed_value)}</b> est. missed</div>
                <Table cols={['Project', 'Awareness', 'Est. value']} right={[2]} rows={(d.projects || []).map(r => [r.name, r.awareness_stage || '—', fmtJOD(r.estimated_hvac_value)])} /></>} />
            <Panel hypo="H1·8" title="Key-contact coverage" subtitle="influencers contacted recently (traffic light)" path="h1/contact-coverage" params={{ ...p, days: 30 }} deps={deps}
              render={d => (d.contacts || []).length === 0 ? <Empty>No contacts flagged as key targets yet.</Empty>
                : <><div style={{ marginBottom: 10, fontSize: 12 }}>{['green', 'yellow', 'red'].map(k => <span key={k} style={{ marginRight: 12 }}><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 9, background: LIGHT[k], marginRight: 5 }}></span>{d.counts[k]}</span>)}</div>
                  <Table cols={['', 'Contact', 'Tier', 'Days since']} right={[3]} rows={d.contacts.map(r => [<span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 10, background: LIGHT[r.light] }}></span>, r.name, r.influence_tier || '—', r.days_since_last_activity ?? 'never'])} /></>} />
            <Panel hypo="H1·9" title="Project source" subtitle="how we source projects" path="h1/project-source" params={p} deps={deps}
              render={d => <Bars data={d.sources.map(s => ({ label: `${s.source} (${s.count})`, value: s.count }))} />} />
          </Section>

          <Section id="H3" title="Retention & concentration" desc="Do top customers churn without replacement?">
            <Panel hypo="H3·10" title="Cohort retention" subtitle="accounts by first-purchase year" path="h3/cohort-retention" params={p} deps={deps}
              render={d => (d.cohorts || []).length === 0 ? <Empty>{d.note || 'No cohorts yet.'}</Empty>
                : <Table cols={['Cohort', 'Size', 'Years active (accounts · revenue)']} rows={d.cohorts.map(c => [c.cohort_year, c.cohort_size, Object.entries(c.years).map(([y, v]) => `${y}: ${v.accounts}·${fmtJOD(v.revenue)}`).join('  |  ')])} />} />
            <Panel hypo="H3·11" title="Silent-account watchlist" subtitle="no won activity in 6 months" path="h3/silent-accounts" params={{ ...p, months: 6 }} deps={deps}
              render={d => <Table cols={['Account', 'Lifetime rev', 'Last purchase', 'Churn reason']} right={[1]} rows={(d.accounts || []).map(r => [r.name, fmtJOD(r.lifetime_revenue), (r.last_purchase || '').slice(0, 10), r.churn_reason || '—'])} />} />
            <Panel hypo="H3·12" title="New vs returning revenue" subtitle="share of revenue from new accounts" path="h3/new-vs-returning" params={p} deps={deps}
              render={d => <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <KPI label="New accounts" value={fmtJOD(d.new.revenue)} sub={`${d.new.accounts} accounts`} />
                <KPI label="Returning" value={fmtJOD(d.returning.revenue)} sub={`${d.returning.accounts} accounts`} />
                <KPI label="New share" value={pct(d.new_revenue_share)} /></div>} />
            <Panel hypo="H3·13" title="Concentration" subtitle="revenue share of top accounts, per year" path="h3/concentration" params={p} deps={deps}
              render={d => <Table cols={['Year', 'Accounts', 'Revenue', 'Top 5', 'Top 10', 'Top 20']} right={[1, 2, 3, 4, 5]} rows={(d.years || []).map(y => [y.year, y.accounts, fmtJOD(y.total_revenue), pct(y.top5), pct(y.top10), pct(y.top20)])} />} />
          </Section>

          <Section id="H4" title="Capacity" desc="Is headcount decline driving revenue decline?">
            <Panel hypo="H4·14" title="Active salesmen vs revenue" subtitle="monthly" path="h4/salesman-count" params={p} deps={deps}
              render={d => <><div style={{ marginBottom: 8, fontSize: 12, color: 'var(--fg-secondary)' }}>Current active salesmen: <b>{d.current_active}</b></div>
                <Table cols={['Month', 'Active', 'Deals', 'Revenue']} right={[1, 2, 3]} rows={(d.months || []).map(m => [m.month, m.active_salesmen, m.deals, fmtJOD(m.revenue)])} /></>} />
            <Panel hypo="H4·15" title="Revenue per active salesman" subtitle="per-head productivity" path="h4/revenue-per-salesman" params={p} deps={deps}
              render={d => <Table cols={['Month', 'Heads', 'Rev/head']} right={[1, 2]} rows={(d.months || []).map(m => [m.month, m.active_salesmen, fmtJOD(m.revenue_per_head)])} />} />
            <Panel hypo="H4·16" title="Activity per salesman / week" subtitle="leading indicator of disengagement" path="h4/activity-per-salesman" params={p} deps={deps}
              render={d => d.note ? <Empty>{d.note}</Empty> : <Table cols={['Salesman', 'Activities', 'Avg/week']} right={[1, 2]} rows={d.salesmen.map(s => [s.name, s.activities, s.avg_per_week])} />} />
            <Panel hypo="H4·17" title="Departure tier attribution" subtitle="are we losing top or bottom performers?" path="h4/departure-attribution" params={p} deps={deps}
              render={d => (d.departed || []).length === 0 ? <Empty>No departures recorded.</Empty>
                : <Table cols={['Salesman', 'Left', 'Prior-12mo rev', 'Tier']} right={[2]} rows={d.departed.map(r => [r.name, (r.departure_date || '').slice(0, 10), fmtJOD(r.prior_12mo_revenue), r.tier])} />} />
            <Panel hypo="H4·18" title="Departure reasons" subtitle="structured + reviewed" path="h4/departure-reasons" params={p} deps={deps}
              render={d => (d.reasons || []).length === 0 ? <Empty>No departures recorded.</Empty> : <Bars data={d.reasons.map(r => ({ label: r.reason, value: r.count }))} />} />
          </Section>

          <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', lineHeight: 1.6, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
            Revenue = Won deals (close date × signing price × linked account). Internal accounts excluded by default.
            Most panels accrue evidence forward from launch — they cannot reconstruct the historical decline.
          </div>
        </div>
      </main>
    </>
  );
}

function Section({ title, desc, children }) {
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--fg-secondary)' }}>{desc}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>{children}</div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<DiagnosticsApp />);
