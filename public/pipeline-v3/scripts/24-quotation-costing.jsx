// Special Price Simulator (the "Costing" page) — reproduces the Excel simulator:
// pick items, choose a price basis (Inclusive / STax-Exempt / Exempted), enter the
// special unit price the customer wants, and instantly see implied discount, per-line
// margin, and a blended GP% vs a target with an OK / BELOW-TARGET verdict.
// All cost/GP comes from the live pricing engine (POST /api/pricing/margin-check).
// Gated to Product Manager / Admin.

const { useState, useEffect, useMemo, useRef } = React;

const num = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const pct = (n) => n == null ? '—' : `${(n * 100).toFixed(1)}%`;

const BASES = [
  { id: 'inclusive', label: 'Inclusive (incl. tax & customs)' },
  { id: 'stax',      label: 'Sales-Tax Exempt' },
  { id: 'exempted',  label: 'Fully Exempted (no tax/customs)' },
];

// Search-as-you-type item picker (GREE items). onPick({sku_id,item_id,model,category}).
function ItemPicker({ value, bookId, onPick }) {
  const [q, setQ] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const wrap = useRef(null);
  useEffect(() => { setQ(value || ''); }, [value]);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const qs = new URLSearchParams();
      if (bookId) qs.set('price_book_id', String(bookId));
      if (q.trim()) qs.set('search', q.trim());
      window.api.get('/product-skus?' + qs.toString()).then(r => setRows((r || []).slice(0, 20))).catch(() => setRows([]));
    }, 180);
    return () => clearTimeout(t);
  }, [q, open, bookId]);
  useEffect(() => {
    const h = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div ref={wrap} style={{ position: 'relative' }}>
      <input value={q} placeholder="Search item ID / model…"
        onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        style={{ width: '100%', height: 30, padding: '0 8px', border: '1px solid var(--border-default)', borderRadius: 6, fontSize: 12.5, background: 'var(--bg-surface)' }} />
      {open && rows.length > 0 && (
        <div style={{ position: 'absolute', top: 'calc(100% + 3px)', left: 0, right: 0, zIndex: 40, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, boxShadow: 'var(--shadow-lg)', maxHeight: 260, overflowY: 'auto' }}>
          {rows.map(r => {
            const phased = /phased/i.test(r.status || '');
            return (
              <button key={r.id} type="button" disabled={phased}
                onClick={() => { onPick({ sku_id: r.id, item_id: r.item_id, model: r.model, category: r.category_l1 }); setQ(`${r.item_id} · ${r.model}`); setOpen(false); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', border: 'none', borderTop: '1px solid var(--border-subtle)', background: 'transparent', cursor: phased ? 'not-allowed' : 'pointer', opacity: phased ? 0.5 : 1, fontSize: 12 }}
                onMouseEnter={e => { if (!phased) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span className="t-mono" style={{ fontWeight: 700 }}>{r.item_id}</span> · {r.model}
                {phased && <span style={{ color: 'var(--color-danger)', marginLeft: 6 }}>PHASED OUT</span>}
                <div style={{ fontSize: 10.5, color: 'var(--fg-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.category_l1} · {r.description || ''}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Simulator() {
  const [basis, setBasis] = useState('inclusive');
  const [targetGP, setTargetGP] = useState(15);   // percent
  const [lines, setLines] = useState([{ key: 'l1', sku_id: null, item_id: '', model: '', qty: 1, special_price: '' }]);
  const [result, setResult] = useState(null);
  const [bookId, setBookId] = useState(null);

  useEffect(() => {
    window.api.get('/price-books').then(bks => {
      const b = (bks || []).find(x => /gree/i.test(x.name) || /gree/i.test(x.brand_name || ''));
      if (b) setBookId(b.id);
    }).catch(() => {});
  }, []);

  const setLine = (key, patch) => setLines(ls => ls.map(l => l.key === key ? { ...l, ...patch } : l));
  const addLine = () => setLines(ls => [...ls, { key: 'l' + Date.now(), sku_id: null, item_id: '', model: '', qty: 1, special_price: '' }]);
  const removeLine = (key) => setLines(ls => ls.length > 1 ? ls.filter(l => l.key !== key) : ls);

  // Recompute via the live engine whenever inputs change.
  const pickedSig = JSON.stringify(lines.map(l => [l.sku_id, l.qty, l.special_price]));
  useEffect(() => {
    const picked = lines.filter(l => l.sku_id && +l.qty > 0);
    if (!picked.length) { setResult(null); return; }
    let cancelled = false;
    window.api.post('/pricing/margin-check', {
      basis, target_gp: (Number(targetGP) || 0) / 100,
      lines: picked.map(l => ({ sku_id: l.sku_id, qty: +l.qty, special_price: l.special_price === '' ? null : +l.special_price })),
    }).then(r => { if (!cancelled) setResult(r); }).catch(() => {});
    return () => { cancelled = true; };
  }, [basis, targetGP, pickedSig]);

  // Map computed results back to each picked line (same order as sent).
  const computedByKey = useMemo(() => {
    const m = {};
    const picked = lines.filter(l => l.sku_id && +l.qty > 0);
    (result?.lines || []).forEach((rl, i) => { if (picked[i]) m[picked[i].key] = rl; });
    return m;
  }, [result, pickedSig]);

  const th = { padding: '8px 8px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--fg-tertiary)', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-default)' };
  const td = { padding: '6px 8px', fontSize: 12.5, textAlign: 'right', borderBottom: '1px solid var(--border-subtle)', whiteSpace: 'nowrap' };
  const cell = { height: 30, width: '100%', padding: '0 8px', border: '1px solid var(--border-default)', borderRadius: 6, fontSize: 12.5, textAlign: 'right', background: 'var(--bg-surface)' };
  const verdict = result?.verdict;

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '20px 24px 80px' }}>
      <div style={{ fontSize: 12.5, color: 'var(--fg-secondary)', marginBottom: 16 }}>
        Check the margin of a special-price request instantly. Pick items, choose the price basis, and enter the special unit price — cost and GP come live from the pricing engine.
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 600, color: 'var(--fg-secondary)' }}>
          PRICE BASIS
          <select value={basis} onChange={e => setBasis(e.target.value)} style={{ height: 34, padding: '0 10px', border: '1px solid var(--border-default)', borderRadius: 7, fontSize: 13, background: 'var(--bg-surface)', minWidth: 260 }}>
            {BASES.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 600, color: 'var(--fg-secondary)' }}>
          TARGET GP %
          <input type="number" min="0" max="90" step="0.5" value={targetGP} onChange={e => setTargetGP(e.target.value)}
            style={{ height: 34, width: 110, padding: '0 10px', border: '1px solid var(--border-default)', borderRadius: 7, fontSize: 13, background: 'var(--bg-surface)' }} />
        </label>
        {verdict && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>Blended GP</div>
              <div className="t-num" style={{ fontSize: 20, fontWeight: 800, color: verdict === 'OK' ? 'var(--img-green-700)' : 'var(--color-danger)' }}>{pct(result.totals.gp_pct)}</div>
            </div>
            <span style={{ padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 800, color: '#fff', background: verdict === 'OK' ? 'var(--img-green)' : 'var(--color-danger)' }}>
              {verdict === 'OK' ? '✓ OK' : '✕ BELOW TARGET'}
            </span>
          </div>
        )}
      </div>

      {/* Lines */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 10, overflow: 'visible' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={{ ...th, textAlign: 'left', width: '32%' }}>Item</th>
            <th style={th}>Qty</th>
            <th style={th}>List ({basis === 'inclusive' ? 'P1' : basis === 'stax' ? 'P2' : 'P3'})</th>
            <th style={th}>Unit cost</th>
            <th style={th}>Special price</th>
            <th style={th}>Implied disc.</th>
            <th style={th}>Line GP</th>
            <th style={th}>GP %</th>
            <th style={{ ...th, width: 34 }}></th>
          </tr></thead>
          <tbody>
            {lines.map(l => {
              const c = computedByKey[l.key];
              const gpColor = c && c.gp_pct != null ? (c.gp_pct < (Number(targetGP) || 0) / 100 ? 'var(--color-danger)' : 'var(--img-green-700)') : 'var(--fg-tertiary)';
              return (
                <tr key={l.key}>
                  <td style={{ ...td, textAlign: 'left' }}>
                    <ItemPicker value={l.item_id ? `${l.item_id} · ${l.model}` : ''} bookId={bookId}
                      onPick={(p) => setLine(l.key, { sku_id: p.sku_id, item_id: p.item_id, model: p.model })} />
                  </td>
                  <td style={td}><input type="number" min="0" value={l.qty} onChange={e => setLine(l.key, { qty: e.target.value })} style={cell} /></td>
                  <td style={td}>{c ? num(c.list_price) : '—'}</td>
                  <td style={td}>{c ? num(c.unit_cost) : '—'}</td>
                  <td style={td}><input type="number" min="0" value={l.special_price} placeholder={c ? String(c.list_price) : ''} onChange={e => setLine(l.key, { special_price: e.target.value })} style={cell} /></td>
                  <td style={{ ...td, color: c && c.implied_discount > 0.4 ? 'var(--color-danger)' : 'var(--fg-secondary)' }}>{c ? pct(c.implied_discount) : '—'}</td>
                  <td style={td}>{c ? num(c.gp_value) : '—'}</td>
                  <td style={{ ...td, fontWeight: 700, color: gpColor }}>{c ? pct(c.gp_pct) : '—'}</td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <button onClick={() => removeLine(l.key)} title="Remove" style={{ border: 'none', background: 'transparent', color: 'var(--fg-tertiary)', cursor: 'pointer', fontSize: 15 }}>×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {result && (
            <tfoot><tr style={{ background: 'var(--neutral-25)' }}>
              <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>Total</td>
              <td style={td}></td><td style={td}></td><td style={td}></td><td style={td}></td><td style={td}></td>
              <td style={{ ...td, fontWeight: 800 }}>{num(result.totals.gp_value)}</td>
              <td style={{ ...td, fontWeight: 800, color: verdict === 'OK' ? 'var(--img-green-700)' : 'var(--color-danger)' }}>{pct(result.totals.gp_pct)}</td>
              <td style={td}></td>
            </tr></tfoot>
          )}
        </table>
      </div>

      <button onClick={addLine} style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, border: '1px dashed var(--img-orange)', background: 'transparent', color: 'var(--img-orange-700)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Add item</button>
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
        <window.TopBar title="Special Price Simulator" right={null} />
        {allowed ? <Simulator /> : (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--fg-tertiary)' }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Costing is for Product Management.</div>
            <div style={{ fontSize: 12 }}>You're signed in as <b>{me?.name || 'unknown'}</b> ({me?.role || '—'}).</div>
          </div>
        )}
      </main>
      {popover?.kind === 'notif' && window.NotificationsPopover && <window.NotificationsPopover anchorRect={popover.rect} onClose={() => setPopover(null)} />}
      {popover?.kind === 'user'  && window.UserMenu             && <window.UserMenu             anchorRect={popover.rect} onClose={() => setPopover(null)} onAction={() => {}} />}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<CostingApp />);
