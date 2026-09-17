// Costing page — quotation-level profitability.
// A salesman asks the Product Manager for a discount on a quotation. The PM
// opens Costing, picks that quotation, and immediately sees: at each discount,
// is it profitable and by how much (GP value + %), and what is the MAX discount
// that still meets a target GP. Same idea as the pricelist GP tiers, but summed
// across the whole quotation, using the LIVE landed cost of each item.
// Backend: GET /api/quotation-versions  and  /:id/discount-analysis. PM/Admin only.

const { useState, useEffect, useMemo } = React;

const num = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const pct = (n) => n == null ? '—' : `${(n * 100).toFixed(1)}%`;

const BASES = [
  { id: 'inclusive', label: 'Inclusive (incl. tax & customs)' },
  { id: 'stax',      label: 'Sales-Tax Exempt' },
  { id: 'exempted',  label: 'Fully Exempted (no tax/customs)' },
];

// ── Step 1: pick a quotation ────────────────────────────────────────────────
function QuotationList({ onPick }) {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    window.api.get('/quotation-versions').then(setRows).catch(e => setErr(e.message));
  }, []);
  const filtered = useMemo(() => {
    if (!rows) return [];
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(r => [r.reference, r.project_name, r.opp_title, r.brand].some(x => String(x || '').toLowerCase().includes(s)));
  }, [rows, q]);

  const th = { padding: '9px 12px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--fg-tertiary)', textAlign: 'left', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' };
  const td = { padding: '9px 12px', fontSize: 12.5, borderBottom: '1px solid var(--border-subtle)' };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 24px 80px' }}>
      <div style={{ fontSize: 12.5, color: 'var(--fg-secondary)', marginBottom: 14 }}>
        Pick a quotation to cost. You'll see its profit at every discount and the highest discount that still hits your target margin.
      </div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search reference, project, deal…"
        style={{ width: '100%', maxWidth: 360, height: 34, padding: '0 12px', border: '1px solid var(--border-default)', borderRadius: 8, fontSize: 13, marginBottom: 14, background: 'var(--bg-surface)' }} />
      {err && <div style={{ padding: 12, background: 'var(--color-danger-bg)', color: '#B0241D', borderRadius: 7, fontSize: 12 }}>{err}</div>}
      {!rows && !err && <div style={{ color: 'var(--fg-tertiary)' }}>Loading…</div>}
      {rows && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>Reference</th><th style={th}>Project / Deal</th><th style={th}>Ver.</th>
              <th style={th}>Status</th><th style={{ ...th, textAlign: 'right' }}>Value (JOD)</th><th style={th}></th>
            </tr></thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => onPick(r.id)}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ ...td, fontWeight: 600 }}>{r.reference || <span style={{ color: 'var(--fg-tertiary)' }}>— no ref —</span>}</td>
                  <td style={td}>{r.project_name || r.opp_title || '—'}</td>
                  <td style={td}>V{r.version_number}</td>
                  <td style={td}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--neutral-100)', color: 'var(--fg-secondary)' }}>{r.review_status}</span></td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700 }} className="t-num">{num(r.total_value)}</td>
                  <td style={{ ...td, textAlign: 'right', color: 'var(--img-orange-700)' }}>Cost it →</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--fg-tertiary)', padding: 30 }}>No quotations found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Step 2: cost the chosen quotation ───────────────────────────────────────
function CostingDetail({ quotationId, onBack, fireToast }) {
  const [basis, setBasis] = useState('inclusive');
  const [targetGP, setTargetGP] = useState(15);       // percent
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [customDisc, setCustomDisc] = useState(0);    // percent

  // Fetch only when the quotation or the price BASIS changes (basis picks the
  // cost tier on the server). Target GP does NOT refetch — it only re-colours
  // things, computed live below — so typing in it never loses focus.
  useEffect(() => {
    setData(null); setErr('');
    window.api.get(`/quotation-versions/${quotationId}/discount-analysis?basis=${basis}`)
      .then(setData).catch(e => setErr(e.message));
  }, [quotationId, basis]);

  const base = data?.base;
  const tgt = (Number(targetGP) || 0) / 100;

  // Suggested max discount for the current target (client-side, so it tracks
  // the target field instantly):  GP≥t ⇒ d ≤ 1 − cost/(list×(1−t)).
  const suggestedMax = useMemo(() => {
    if (!base || !base.list_total) return null;
    const d = 1 - base.cost_total / (base.list_total * (1 - tgt));
    return Math.min(0.99, Math.max(0, d));
  }, [base, tgt]);

  // Live custom-discount math (client-side, from the returned base totals).
  const custom = useMemo(() => {
    if (!base || !base.list_total) return null;
    const d = Math.max(0, Math.min(0.99, (Number(customDisc) || 0) / 100));
    const revenue = base.list_total * (1 - d);
    const gp_value = revenue - base.cost_total;
    const gp_pct = revenue > 0 ? gp_value / revenue : null;
    return { d, revenue, gp_value, gp_pct, ok: gp_pct != null && gp_pct >= tgt };
  }, [base, customDisc, tgt]);

  const th = { padding: '9px 12px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--fg-tertiary)', textAlign: 'right', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' };
  const td = { padding: '9px 12px', fontSize: 13, textAlign: 'right', borderBottom: '1px solid var(--border-subtle)', whiteSpace: 'nowrap' };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '18px 24px 80px' }}>
      <button onClick={onBack} style={{ border: 'none', background: 'transparent', color: 'var(--img-orange-700)', cursor: 'pointer', fontSize: 13, fontWeight: 600, marginBottom: 12, padding: 0 }}>← All quotations</button>

      {/* Controls — always mounted (outside the data-loading block) so the
          Target GP field keeps focus while you type. */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 600, color: 'var(--fg-secondary)' }}>
          PRICE BASIS
          <select value={basis} onChange={e => setBasis(e.target.value)} style={{ height: 34, padding: '0 10px', border: '1px solid var(--border-default)', borderRadius: 7, fontSize: 13, background: 'var(--bg-surface)', minWidth: 250 }}>
            {BASES.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 600, color: 'var(--fg-secondary)' }}>
          TARGET GP %
          <input type="number" min="0" max="90" step="0.5" value={targetGP} onChange={e => setTargetGP(e.target.value)}
            style={{ height: 34, width: 110, padding: '0 10px', border: '1px solid var(--border-default)', borderRadius: 7, fontSize: 13, background: 'var(--bg-surface)' }} />
        </label>
      </div>

      {err && <div style={{ padding: 12, background: 'var(--color-danger-bg)', color: '#B0241D', borderRadius: 7, fontSize: 12 }}>{err}</div>}
      {!data && !err && <div style={{ color: 'var(--fg-tertiary)' }}>Loading…</div>}

      {data && <>
        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{data.quotation.reference || data.quotation.project_name || `Quotation #${data.quotation.id}`}</div>
          <div style={{ fontSize: 12.5, color: 'var(--fg-secondary)' }}>
            {[data.opp?.title, data.quotation.project_name, data.quotation.city, `V${data.quotation.version}`].filter(Boolean).join(' · ')}
          </div>
        </div>

        {/* Base totals + missing-cost warning */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
          <Stat label="List total (0% disc.)" value={num(base.list_total)} />
          <Stat label="Total cost (live)" value={num(base.cost_total)} />
          <Stat label="GP at list" value={pct(base.list_total > 0 ? (base.list_total - base.cost_total) / base.list_total : null)} strong />
        </div>
        {base.lines_missing_cost > 0 && (
          <div style={{ padding: '8px 12px', background: 'var(--color-warning-bg, #FEF6E7)', border: '1px solid var(--color-warning, #E0A106)', borderRadius: 7, fontSize: 12, color: '#8A6100', marginBottom: 14 }}>
            ⚠ {base.lines_missing_cost} of {base.line_count} line(s) have no cost linked, so this analysis understates cost. Link those items to GREE SKUs to make it exact.
          </div>
        )}

        {/* Suggested max discount */}
        {suggestedMax != null && (
          <div style={{ padding: '14px 16px', borderRadius: 10, marginBottom: 18, background: 'var(--img-green-50, #ECF8F1)', border: '1px solid var(--img-green, #1E9E5A)' }}>
            <div style={{ fontSize: 12, color: 'var(--fg-secondary)' }}>To keep at least a <b>{pct(tgt)}</b> gross profit, you can discount this quotation up to</div>
            <div className="t-num" style={{ fontSize: 30, fontWeight: 800, color: 'var(--img-green-700)' }}>{pct(suggestedMax)}</div>
            <div style={{ fontSize: 11.5, color: 'var(--fg-tertiary)' }}>Beyond this, the quotation falls below your target margin.</div>
          </div>
        )}

        {/* Discount tier table */}
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--fg-tertiary)', marginBottom: 6 }}>Profit at each discount</div>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={{ ...th, textAlign: 'left' }}>Discount</th>
              <th style={th}>Selling total</th><th style={th}>Cost</th><th style={th}>Gross profit</th><th style={th}>GP %</th><th style={th}>Verdict</th>
            </tr></thead>
            <tbody>
              {data.tiers.map((t, i) => {
                const ok = t.gp_pct != null && t.gp_pct >= tgt;   // vs the live target
                return (
                <tr key={i} style={{ background: t.discount === 0 ? 'var(--neutral-25)' : 'transparent' }}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{t.discount === 0 ? 'List (0%)' : `−${(t.discount * 100).toFixed(0)}%`}</td>
                  <td style={td} className="t-num">{num(t.revenue)}</td>
                  <td style={{ ...td, color: 'var(--fg-secondary)' }} className="t-num">{num(t.cost)}</td>
                  <td style={{ ...td, fontWeight: 700, color: t.gp_value < 0 ? 'var(--color-danger)' : 'var(--fg-primary)' }} className="t-num">{num(t.gp_value)}</td>
                  <td style={{ ...td, fontWeight: 800, color: ok ? 'var(--img-green-700)' : 'var(--color-danger)' }} className="t-num">{pct(t.gp_pct)}</td>
                  <td style={td}>
                    <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 999, color: '#fff', background: ok ? 'var(--img-green)' : 'var(--color-danger)' }}>{ok ? 'OK' : 'BELOW'}</span>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Custom discount check */}
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--fg-tertiary)', marginBottom: 6 }}>Check a specific discount</div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 600, color: 'var(--fg-secondary)' }}>
            THE SALESMAN WANTS
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="number" min="0" max="99" step="0.5" value={customDisc} onChange={e => setCustomDisc(e.target.value)}
                style={{ height: 34, width: 90, padding: '0 10px', border: '1px solid var(--border-default)', borderRadius: 7, fontSize: 13, background: 'var(--bg-surface)', textAlign: 'right' }} />
              <span style={{ fontWeight: 700 }}>% off</span>
            </div>
          </label>
          {custom && <>
            <Stat label="Selling total" value={num(custom.revenue)} />
            <Stat label="Gross profit" value={num(custom.gp_value)} danger={custom.gp_value < 0} />
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>GP at {pct(custom.d)} off</div>
              <div className="t-num" style={{ fontSize: 24, fontWeight: 800, color: custom.ok ? 'var(--img-green-700)' : 'var(--color-danger)' }}>{pct(custom.gp_pct)}</div>
              <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 10px', borderRadius: 999, color: '#fff', background: custom.ok ? 'var(--img-green)' : 'var(--color-danger)' }}>
                {custom.ok ? '✓ Profitable enough' : '✕ Below target'}
              </span>
            </div>
          </>}
        </div>
      </>}
    </div>
  );
}

function Stat({ label, value, strong, danger }) {
  return (
    <div style={{ padding: '10px 14px', border: '1px solid var(--border-subtle)', borderRadius: 9, background: 'var(--bg-surface)', minWidth: 120 }}>
      <div style={{ fontSize: 10.5, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</div>
      <div className="t-num" style={{ fontSize: strong ? 20 : 17, fontWeight: strong ? 800 : 700, color: danger ? 'var(--color-danger)' : 'var(--fg-primary)' }}>{value}</div>
    </div>
  );
}

function CostingApp() {
  const [ready, setReady] = useState(false);
  const [popover, setPopover] = useState(null);
  const [pickedId, setPickedId] = useState(null);
  const [toast, setToast] = useState(null);
  const fireToast = (msg, opts) => { setToast({ msg, ...(opts || {}) }); setTimeout(() => setToast(null), 3200); };
  useEffect(() => { window.loadRealUsers().then(() => setReady(true)); }, []);
  if (!ready) return <div style={{ padding: 40, color: 'var(--fg-tertiary)' }}>Loading…</div>;

  const me = window.CURRENT_USER;
  const allowed = me && (me.role === 'Product Manager' || me.role === 'Admin');

  return (
    <>
      <window.Sidebar
        active="costing"
        onNav={(id) => {
          if (id === 'pipeline')     { window.location.href = 'Pipeline.html'; return; }
          if (id === 'contacts')     { window.location.href = 'Contacts.html'; return; }
          if (id === 'reports')      { window.location.href = 'Reports.html'; return; }
          if (id === 'design-board') { window.location.href = 'DesignBoard.html'; return; }
          if (id === 'my-tasks')     { window.location.href = 'MyTasks.html'; return; }
          if (id === 'pricelist')    { window.location.href = 'Pricelist.html'; return; }
          if (id === 'settings')     { window.location.href = 'Settings.html'; return; }
        }}
        onUserMenu={(rect) => setPopover({ kind: 'user', rect })}
        onNotifications={(rect) => setPopover({ kind: 'notif', rect })}
      />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowY: 'auto' }}>
        <window.TopBar title="Costing — quotation profitability" right={null} />
        {allowed ? (
          pickedId == null
            ? <QuotationList onPick={setPickedId} />
            : <CostingDetail quotationId={pickedId} onBack={() => setPickedId(null)} fireToast={fireToast} />
        ) : (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--fg-tertiary)' }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Costing is for Product Management.</div>
            <div style={{ fontSize: 12 }}>You're signed in as <b>{me?.name || 'unknown'}</b> ({me?.role || '—'}).</div>
          </div>
        )}
      </main>
      {toast && <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 90, padding: '10px 18px', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, background: toast.danger ? 'var(--color-danger)' : 'var(--fg-primary)' }}>{toast.msg}</div>}
      {popover?.kind === 'notif' && window.NotificationsPopover && <window.NotificationsPopover anchorRect={popover.rect} onClose={() => setPopover(null)} />}
      {popover?.kind === 'user'  && window.UserMenu             && <window.UserMenu             anchorRect={popover.rect} onClose={() => setPopover(null)} onAction={() => {}} />}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<CostingApp />);
