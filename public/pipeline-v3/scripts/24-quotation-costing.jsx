// PM Costing — runs inside the portal chrome (sidebar + topbar).
//
//   index  (no ?quoteId): list of every quotation with a "View costing" link
//   detail (?quoteId=<n>): costing for the quotation
//                          + "Edit (what-if)" toggle that lets PM tweak
//                          qty / unit_price / discount per line and see the
//                          rollup recompute. Saves create a quotation_scenario
//                          (detached from canonical numbers).
//
// Gated to product_manager / admin / users with can_view_costs.

const { useState, useEffect, useMemo } = React;

const num = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const pct = (n) => n == null ? '—' : `${(n * 100).toFixed(1)}%`;

function Index() {
  const [rows, setRows]  = useState([]);
  const [err, setErr]    = useState(null);
  const [load, setLoad]  = useState(true);

  useEffect(() => {
    window.api.get('/quotation-versions')
      .then(r => { setRows(Array.isArray(r) ? r : []); setLoad(false); })
      .catch(e => { setErr(e.message); setLoad(false); });
  }, []);

  return (
    <div style={{ padding: '24px 24px 60px' }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Costing</h1>
        <p style={{ color: 'var(--fg-secondary)', marginTop: 4 }}>
          Every submitted/approved/released quotation. Click into any one to see per-line cost + margin and run "what-if" scenarios.
        </p>
      </div>
      {err && <div style={{ padding: 12, background: 'var(--color-danger-bg)', color: '#B0241D', borderRadius: 7 }}>{err}</div>}
      {load && <div style={{ padding: 20, color: 'var(--fg-tertiary)' }}>Loading…</div>}
      {!load && rows.length === 0 && !err && (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--fg-tertiary)' }}>No quotations submitted yet.</div>
      )}
      {!load && rows.length > 0 && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '110px 110px 1fr 130px 110px 100px 110px',
            gap: 8, padding: '8px 12px', background: 'var(--neutral-25)',
            fontSize: 10.5, fontWeight: 700, color: 'var(--fg-tertiary)',
            textTransform: 'uppercase', letterSpacing: '0.04em',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <span>Ref</span><span>Brand</span><span>Project</span><span>Designer</span><span>Stage</span><span style={{ textAlign: 'right' }}>Total</span><span></span>
          </div>
          {rows.map(r => (
            <div key={r.id} style={{
              display: 'grid', gridTemplateColumns: '110px 110px 1fr 130px 110px 100px 110px',
              gap: 8, padding: '10px 12px', alignItems: 'center',
              borderBottom: '1px solid var(--border-subtle)', fontSize: 12.5,
            }}>
              <span className="t-mono" style={{ fontSize: 11, color: 'var(--fg-secondary)' }}>{r.reference || `V${r.version_number}`}</span>
              <span style={{ color: 'var(--fg-secondary)' }}>{r.brand || '—'}</span>
              <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.opp_title || r.project_name}>{r.opp_title || r.project_name || '—'}</span>
              <span style={{ color: 'var(--fg-secondary)' }}>{r.designer_name || '—'}</span>
              <span>
                <span style={{ padding: '2px 7px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                  background: r.design_stage === 'Released' ? 'var(--img-green-50)' : 'var(--neutral-100)',
                  color:      r.design_stage === 'Released' ? 'var(--img-green-700)' : 'var(--fg-secondary)' }}>{r.design_stage}</span>
              </span>
              <span className="t-num" style={{ textAlign: 'right', fontWeight: 700 }}>{num(r.total_value)}</span>
              <a href={`QuotationCosting.html?quoteId=${r.id}`} style={{
                padding: '5px 10px', borderRadius: 5, textAlign: 'center',
                background: 'var(--img-orange-50)', color: 'var(--img-orange-700, #B8680E)',
                textDecoration: 'none', fontSize: 11.5, fontWeight: 700,
              }}>View costing →</a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Detail({ quoteId }) {
  const [data,       setData]      = useState(null);
  const [err,        setErr]       = useState(null);
  const [editMode,   setEditMode]  = useState(false);
  const [overrides,  setOverrides] = useState({});         // { lineId: { qty?, unit_price?, discount_pct? } }
  const [scenarios,  setScenarios] = useState([]);
  const [activeScn,  setActiveScn] = useState('released');  // 'released' | scenario.id
  const [savingName, setSavingName]= useState('');
  const [saving,     setSaving]    = useState(false);

  const reload = React.useCallback(() => {
    window.api.get(`/quotation-versions/${quoteId}/costing`)
      .then(setData)
      .catch(e => setErr(e.message));
    window.api.get(`/quotation-versions/${quoteId}/scenarios`)
      .then(setScenarios)
      .catch(() => setScenarios([]));
  }, [quoteId]);
  useEffect(() => { reload(); }, [reload]);

  // Compute the "view" line items based on activeScn + overrides
  const view = useMemo(() => {
    if (!data) return null;
    let baseOverrides = {};
    if (activeScn !== 'released') {
      const s = scenarios.find(x => x.id === Number(activeScn));
      if (s && s.payload?.line_overrides) baseOverrides = s.payload.line_overrides;
    }
    if (editMode) baseOverrides = overrides;
    const items = data.line_items.map(li => {
      const o = baseOverrides[li.id] || {};
      const qty = o.qty != null ? +o.qty : li.qty;
      const discount_pct = o.discount_pct != null ? +o.discount_pct : li.discount_pct;
      let unit_price = o.unit_price != null ? +o.unit_price
                     : (o.discount_pct != null && li.list_price ? +(li.list_price * (1 - discount_pct)).toFixed(2) : li.unit_price);
      const revenue = +(qty * unit_price).toFixed(2);
      const cost_unit  = li.cost_unit;
      const cost_total = cost_unit != null ? +(qty * cost_unit).toFixed(2) : null;
      const margin = cost_total != null ? +(revenue - cost_total).toFixed(2) : null;
      const margin_pct = margin != null && revenue > 0 ? +(margin / revenue).toFixed(4) : null;
      return { ...li, qty, unit_price, discount_pct, revenue, cost_total, margin, margin_pct };
    });
    const totalCost    = items.reduce((s, li) => s + (li.cost_total || 0), 0);
    const totalRevenue = items.reduce((s, li) => s + (li.revenue || 0), 0);
    const grossProfit  = +(totalRevenue - totalCost).toFixed(2);
    const grossPct     = totalRevenue > 0 ? +(grossProfit / totalRevenue).toFixed(4) : null;
    return { items, totals: { totalCost, totalRevenue, grossProfit, grossPct } };
  }, [data, scenarios, activeScn, overrides, editMode]);

  if (err) return <div style={{ padding: 40, color: '#B0241D' }}>{err}</div>;
  if (!data || !view) return <div style={{ padding: 40, color: 'var(--fg-tertiary)' }}>Loading…</div>;

  const { quotation, opp, designer, totals } = data;
  const setOver = (lineId, patch) => setOverrides(o => ({ ...o, [lineId]: { ...(o[lineId] || {}), ...patch } }));

  const saveScenario = async () => {
    if (!savingName.trim()) return;
    setSaving(true);
    try {
      const created = await window.api.post(`/quotation-versions/${quoteId}/scenarios`, {
        name: savingName.trim(),
        payload: { line_overrides: overrides },
      });
      setSavingName('');
      setEditMode(false);
      setOverrides({});
      reload();
      setActiveScn(String(created.id));
    } catch (e) {
      alert(e.message);
    } finally { setSaving(false); }
  };

  return (
    <div style={{ padding: '24px 24px 60px', maxWidth: 1300, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 4 }}>
        <a href="QuotationCosting.html" style={{ fontSize: 13, color: 'var(--fg-secondary)', textDecoration: 'none', fontWeight: 600 }}>← All quotations</a>
        <span style={{ fontSize: 11, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Costing · V{quotation.version}{quotation.revision_type === 'sales' ? ' (sales revision)' : ''}</span>
      </div>
      <h1 style={{ margin: '4px 0 16px', fontSize: 22, fontWeight: 800 }}>{quotation.project_name || opp?.title || '—'}</h1>

      {/* Top facts */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14,
      }}>
        {[
          ['Reference', quotation.reference],
          ['Brand', quotation.brand],
          ['Designer', designer?.name || '—'],
          ['Stage', quotation.review_status],
          ['Release target', quotation.target_release_stage || '—'],
          ['Global discount', quotation.discount_pct_global ? `${(quotation.discount_pct_global*100).toFixed(1)}%` : '—'],
          ['City', quotation.city || '—'],
          ['Customer total', num(quotation.total_value)],
        ].map(([k, v]) => (
          <div key={k} style={{ padding: '10px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg-primary)', marginTop: 4 }}>{v == null || v === '' ? '—' : v}</div>
          </div>
        ))}
      </div>

      {/* Scenario toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', marginBottom: 12,
        background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Viewing:</span>
        <select value={activeScn} onChange={e => { setActiveScn(e.target.value); setEditMode(false); setOverrides({}); }}
          style={{ padding: '6px 10px', fontSize: 12.5, border: '1px solid var(--border-default)', borderRadius: 6, background: 'var(--bg-surface)', fontWeight: 600 }}>
          <option value="released">Released (canonical)</option>
          {scenarios.map(s => <option key={s.id} value={s.id}>📊 {s.name}</option>)}
        </select>
        <div style={{ flex: 1 }}></div>
        {!editMode && (
          <button onClick={() => { setEditMode(true); setActiveScn('released'); setOverrides({}); }}
            style={{ padding: '6px 12px', borderRadius: 6, background: 'var(--img-orange)', color: '#fff', border: 'none', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
            Edit (what-if)
          </button>
        )}
        {editMode && (
          <>
            <input value={savingName} onChange={e => setSavingName(e.target.value)} placeholder="Name this scenario…"
              style={{ padding: '6px 10px', fontSize: 12.5, border: '1px solid var(--border-default)', borderRadius: 6, width: 200 }} />
            <button onClick={saveScenario} disabled={!savingName.trim() || saving} style={{
              padding: '6px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 700, border: 'none',
              background: savingName.trim() && !saving ? 'var(--img-green-700, #1E7A3C)' : 'var(--neutral-200)',
              color: '#fff', cursor: savingName.trim() && !saving ? 'pointer' : 'not-allowed',
            }}>{saving ? 'Saving…' : 'Save as scenario'}</button>
            <button onClick={() => { setEditMode(false); setOverrides({}); }} style={{
              padding: '6px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 600,
              background: 'var(--bg-surface)', color: 'var(--fg-primary)', border: '1px solid var(--border-default)', cursor: 'pointer',
            }}>Cancel</button>
          </>
        )}
      </div>

      {/* Costing table */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '130px 1fr 60px 70px 90px 100px 100px 90px 100px 70px',
          gap: 6, padding: '8px 10px', background: 'var(--neutral-25)',
          fontSize: 10.5, fontWeight: 700, color: 'var(--fg-tertiary)',
          textTransform: 'uppercase', letterSpacing: '0.04em',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <span>Model</span><span>Description</span>
          <span style={{ textAlign: 'right' }}>Qty</span>
          <span style={{ textAlign: 'right' }}>Disc%</span>
          <span style={{ textAlign: 'right' }}>Cost / unit</span>
          <span style={{ textAlign: 'right' }}>Cost total</span>
          <span style={{ textAlign: 'right' }}>Unit price</span>
          <span style={{ textAlign: 'right' }}>Revenue</span>
          <span style={{ textAlign: 'right' }}>Margin $</span>
          <span style={{ textAlign: 'right' }}>GP%</span>
        </div>
        {view.items.map(li => {
          const mp = li.margin_pct;
          const mpColor = mp == null ? 'var(--fg-tertiary)' : mp < 0 ? '#B0241D' : mp < 0.15 ? 'var(--img-orange-700, #B8680E)' : 'var(--img-green-700)';
          const inputCell = { padding: '4px 6px', fontSize: 12, border: '1px solid var(--border-default)', borderRadius: 4, background: 'var(--bg-surface)', textAlign: 'right', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' };
          return (
            <div key={li.id} style={{
              display: 'grid',
              gridTemplateColumns: '130px 1fr 60px 70px 90px 100px 100px 90px 100px 70px',
              gap: 6, padding: '6px 10px', alignItems: 'center',
              borderBottom: '1px solid var(--border-subtle)', fontSize: 12,
            }}>
              <span className="t-mono" style={{ fontSize: 11, color: 'var(--fg-secondary)' }}>{li.model || '—'}</span>
              <span title={li.description} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{li.description || '—'}</span>
              {editMode ? (
                <input type="number" min="0" value={li.qty} onChange={e => setOver(li.id, { qty: +e.target.value })} style={inputCell} />
              ) : (
                <span className="t-num" style={{ textAlign: 'right' }}>{li.qty}</span>
              )}
              {editMode ? (
                <input type="number" min="0" max="60" step="0.5" value={+((li.discount_pct||0)*100).toFixed(2)}
                  onChange={e => setOver(li.id, { discount_pct: Math.max(0, Math.min(0.6, (+e.target.value || 0) / 100)) })}
                  style={inputCell} title="What-if discount %" />
              ) : (
                <span className="t-num" style={{ textAlign: 'right', color: 'var(--fg-secondary)' }}>{pct(li.discount_pct)}</span>
              )}
              <span className="t-num" style={{ textAlign: 'right', color: 'var(--fg-secondary)' }}>{li.cost_unit == null ? '—' : num(li.cost_unit)}</span>
              <span className="t-num" style={{ textAlign: 'right', color: 'var(--fg-secondary)' }}>{li.cost_total == null ? '—' : num(li.cost_total)}</span>
              {editMode ? (
                <input type="number" min="0" value={li.unit_price} onChange={e => setOver(li.id, { unit_price: +e.target.value })} style={inputCell} />
              ) : (
                <span className="t-num" style={{ textAlign: 'right' }}>{num(li.unit_price)}</span>
              )}
              <span className="t-num" style={{ textAlign: 'right', fontWeight: 700 }}>{num(li.revenue)}</span>
              <span className="t-num" style={{ textAlign: 'right', color: mpColor }}>{li.margin == null ? '—' : num(li.margin)}</span>
              <span className="t-num" style={{ textAlign: 'right', fontWeight: 700, color: mpColor }}>{pct(mp)}</span>
            </div>
          );
        })}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '130px 1fr 60px 70px 90px 100px 100px 90px 100px 70px',
          gap: 6, padding: '10px', alignItems: 'center',
          background: 'var(--neutral-25)', fontSize: 12.5, fontWeight: 700,
        }}>
          <span></span><span style={{ textAlign: 'right' }}>Totals</span>
          <span></span><span></span><span></span>
          <span className="t-num" style={{ textAlign: 'right' }}>{num(view.totals.totalCost)}</span>
          <span></span>
          <span className="t-num" style={{ textAlign: 'right' }}>{num(view.totals.totalRevenue)}</span>
          <span className="t-num" style={{ textAlign: 'right', color: view.totals.grossProfit < 0 ? '#B0241D' : 'var(--img-green-700)' }}>{num(view.totals.grossProfit)}</span>
          <span className="t-num" style={{ textAlign: 'right', color: view.totals.grossPct == null ? 'var(--fg-tertiary)' : view.totals.grossPct < 0 ? '#B0241D' : 'var(--img-green-700)' }}>{pct(view.totals.grossPct)}</span>
        </div>
      </div>

      {/* Scenarios list */}
      {scenarios.length > 0 && (
        <div style={{ marginTop: 18, padding: 14, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Saved scenarios ({scenarios.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {scenarios.map(s => (
              <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px 120px 80px 60px', gap: 8, padding: '8px 4px', fontSize: 12.5, borderBottom: '1px dashed var(--border-subtle)', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>📊 {s.name}</span>
                <span className="t-num" style={{ textAlign: 'right', color: 'var(--fg-secondary)' }}>cost {num(s.total_cost)}</span>
                <span className="t-num" style={{ textAlign: 'right', fontWeight: 700 }}>rev {num(s.total_revenue)}</span>
                <span className="t-num" style={{ textAlign: 'right', color: s.gross_profit < 0 ? '#B0241D' : 'var(--img-green-700)' }}>{num(s.gross_profit)} ({pct(s.gross_pct)})</span>
                <span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{s.created_by_name || ''}</span>
                <button onClick={async () => { if (confirm('Delete scenario "' + s.name + '"?')) { await window.api.del(`/quotation-scenarios/${s.id}`); reload(); } }}
                  style={{ border: 'none', background: 'transparent', color: 'var(--fg-tertiary)', cursor: 'pointer', fontSize: 13 }}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CostingApp() {
  const [ready, setReady] = useState(false);
  const [popover, setPopover] = useState(null);
  useEffect(() => { window.loadRealUsers().then(() => setReady(true)); }, []);
  if (!ready) return <div style={{ padding: 40, color: 'var(--fg-tertiary)' }}>Loading…</div>;

  const me = window.CURRENT_USER;
  const allowed = me && (me.role === 'Product Manager' || me.role === 'Admin');
  const qid = new URLSearchParams(window.location.search).get('quoteId');

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
        }}
        onUserMenu={(rect) => setPopover({ kind: 'user', rect })}
        onNotifications={(rect) => setPopover({ kind: 'notif', rect })}
      />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowY: 'auto' }}>
        <window.TopBar title="Costing" right={null} />
        {!allowed ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--fg-tertiary)' }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Costing is for Product Management.</div>
            <div style={{ fontSize: 12 }}>You're signed in as <b>{me?.name || 'unknown'}</b> ({me?.role || '—'}).</div>
          </div>
        ) : qid ? <Detail quoteId={+qid} /> : <Index />}
      </main>
      {popover?.kind === 'notif' && window.NotificationsPopover && <window.NotificationsPopover anchorRect={popover.rect} onClose={() => setPopover(null)} />}
      {popover?.kind === 'user'  && window.UserMenu             && <window.UserMenu             anchorRect={popover.rect} onClose={() => setPopover(null)} onAction={() => {}} />}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<CostingApp />);
