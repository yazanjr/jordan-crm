// PM Portal — Pricelist page.
// Gated to product_manager / admin / users with can_view_costs. The cost
// columns shown here come from the API only when the caller has rights.

const { useState, useMemo, useEffect } = React;

function PricelistApp() {
  const { Search, Plus, Filter, Layers } = window.Icons;
  const me = window.CURRENT_USER;
  const [brands, setBrands]       = useState([]);
  const [books, setBooks]         = useState([]);
  const [brandId, setBrandId]     = useState(null);
  const [bookId,  setBookId]      = useState(null);
  const [skus, setSkus]           = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoryTree, setCategoryTree] = useState([]);
  const [versions, setVersions]   = useState([]);
  const [groupFilter, setGroupFilter]   = useState('');  // Layer 2
  const [familyFilter, setFamilyFilter] = useState('');  // Layer 3
  const [search, setSearch]       = useState('');
  const [loadError, setLoadError] = useState(null);
  const [toast, setToast]         = useState(null);
  const [popover, setPopover]     = useState(null);
  const [uploading, setUploading] = useState(false);
  const [skuModal, setSkuModal]   = useState(null);  // null | {mode:'add'|'edit', row}
  const [deactivate, setDeactivate] = useState(null); // null | { sku, loading, usage }
  const fireToast = (msg, opts={}) => setToast({ msg, ...opts });

  const [, setUsersReady] = useState(false);
  useEffect(() => { window.loadRealUsers().then(ok => { if (ok) setUsersReady(true); }); }, []);

  // Load brands + books once.
  useEffect(() => {
    Promise.all([window.api.get('/brands'), window.api.get('/price-books')]).then(([bs, bks]) => {
      setBrands(bs); setBooks(bks);
      if (bs.length && !brandId) setBrandId(bs[0].id);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (brandId == null) return;
    const firstBook = books.find(b => b.brand_id === brandId);
    if (firstBook && (!bookId || !books.find(b => b.id === bookId && b.brand_id === brandId))) setBookId(firstBook.id);
  }, [brandId, books, bookId]);
  const booksForBrand = books.filter(b => b.brand_id === brandId);

  const reload = React.useCallback(async () => {
    if (!bookId) { setSkus([]); setCategories([]); setCategoryTree([]); return; }
    try {
      const [cats, tree] = await Promise.all([
        window.api.get(`/product-skus/categories?price_book_id=${bookId}`),
        window.api.get(`/product-skus/category-tree?price_book_id=${bookId}`).catch(() => []),
      ]);
      setCategories(cats);
      setCategoryTree(tree);
      const qs = new URLSearchParams({ price_book_id: String(bookId) });
      if (groupFilter)  qs.set('category_l2', groupFilter);
      if (familyFilter) qs.set('category_l3', familyFilter);
      if (search)       qs.set('search', search);
      const rows = await window.api.get('/product-skus?' + qs.toString());
      setSkus(rows);
      const vrs = await window.api.get(`/price-books/${bookId}/versions`).catch(() => []);
      setVersions(vrs);
      setLoadError(null);
    } catch (e) {
      setLoadError(e.message || 'Could not load pricelist.');
    }
  }, [bookId, groupFilter, familyFilter, search]);

  // group → families lookup for the cascading filters + modal.
  const groupList = React.useMemo(() => categoryTree.flatMap(t => t.groups.map(g => g.l2)), [categoryTree]);
  const familiesOf = React.useMemo(() => { const m = {}; categoryTree.forEach(t => t.groups.forEach(g => { m[g.l2] = g.families; })); return m; }, [categoryTree]);
  useEffect(() => { reload(); }, [reload]);

  const handleUpload = async (file) => {
    if (!file) return;
    if (!bookId) { fireToast('Pick a price book first.', { danger: true }); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('price_book_id', String(bookId));
      const r = await fetch('/api/pricelist-versions/upload', {
        method: 'POST',
        headers: { 'x-demo-user-id': window.api.userId() },
        body: fd,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'Upload failed');
      fireToast(`Uploaded — ${data.inserted} SKUs replaced (${data.skipped} skipped)`);
      reload();
    } catch (e) {
      fireToast(`Failed: ${e.message}`, { danger: true });
    } finally {
      setUploading(false);
    }
  };

  const canSeeCosts = me && (me.role === 'Product Manager' || me.role === 'Admin' || me.isSenior);
  const allowed = me && ['Product Manager', 'Admin'].includes(me.role);

  return (
    <>
      <window.Sidebar
        active="pricelist"
        onNav={(id) => {
          if (id === 'pipeline') { window.location.href = 'Pipeline.html'; return; }
          if (id === 'contacts') { window.location.href = 'Contacts.html'; return; }
          if (id === 'reports')  { window.location.href = 'Reports.html'; return; }
          if (id === 'design-board') { window.location.href = 'DesignBoard.html'; return; }
          if (id === 'costing')      { window.location.href = 'QuotationCosting.html'; return; }
          if (id === 'my-tasks') { window.location.href = 'MyTasks.html'; return; }
        }}
        onUserMenu={(rect) => setPopover({ kind: 'user', rect })}
        onNotifications={(rect) => setPopover({ kind: 'notif', rect })}
      />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <window.TopBar title="Pricelist" right={null} />

        {!allowed && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-tertiary)' }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>This page is for Product Management.</div>
            <div style={{ fontSize: 12 }}>You're signed in as <b>{me?.name || 'unknown'}</b> ({me?.role || '—'}). Switch user from the sidebar to preview as a Product Manager.</div>
          </div>
        )}

        {allowed && (
          <>
            {/* Top action bar */}
            <div style={{
              padding: '10px 24px', borderBottom: '1px solid var(--border-subtle)',
              background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            }}>
              <select value={brandId || ''} onChange={e => { setBrandId(+e.target.value); setBookId(null); }}
                title="Brand"
                style={{ height: 32, padding: '0 8px', border: '1px solid var(--border-default)', borderRadius: 7, fontSize: 13, fontWeight: 600, background: 'var(--bg-surface)' }}>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <select value={bookId || ''} onChange={e => setBookId(+e.target.value)}
                title="Price book"
                style={{ height: 32, padding: '0 8px', border: '1px solid var(--border-default)', borderRadius: 7, fontSize: 13, background: 'var(--bg-surface)' }}>
                {booksForBrand.map(b => <option key={b.id} value={b.id}>{b.name} ({b.sku_count || 0})</option>)}
              </select>
              <button onClick={async () => {
                const name = prompt('Name for the new price book under ' + (brands.find(b => b.id === brandId)?.name || '?'));
                if (!name) return;
                try {
                  const created = await window.api.post('/price-books', { brand_id: brandId, name });
                  setBooks(prev => [...prev, { ...created, brand_id: brandId, sku_count: 0 }]);
                  setBookId(created.id);
                  fireToast(`Book "${name}" created`);
                } catch (e) { fireToast(`Failed: ${e.message}`, { danger: true }); }
              }} style={{ padding: '6px 10px', border: '1px dashed var(--img-orange)', borderRadius: 7, background: 'transparent', color: 'var(--img-orange-700, #B8680E)', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>+ Book</button>
              <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-tertiary)' }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search model, ERP code, description…"
                  style={{ width: '100%', height: 32, padding: '0 10px 0 30px', border: '1px solid var(--border-default)', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: 'var(--bg-surface)' }} />
              </div>
              <select value={groupFilter} onChange={e => { setGroupFilter(e.target.value); setFamilyFilter(''); }}
                title="Group (Layer 2)"
                style={{ height: 32, padding: '0 8px', border: '1px solid var(--border-default)', borderRadius: 7, fontSize: 13, background: 'var(--bg-surface)' }}>
                <option value="">All groups</option>
                {groupList.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <select value={familyFilter} onChange={e => setFamilyFilter(e.target.value)} disabled={!groupFilter}
                title="Family (Layer 3)"
                style={{ height: 32, padding: '0 8px', border: '1px solid var(--border-default)', borderRadius: 7, fontSize: 13, background: 'var(--bg-surface)', opacity: groupFilter ? 1 : 0.5 }}>
                <option value="">{groupFilter ? 'All families' : '— pick group —'}</option>
                {(familiesOf[groupFilter] || []).map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <span style={{ flex: 1 }}></span>
              <span style={{ fontSize: 12, color: 'var(--fg-secondary)' }}>{skus.length} SKUs</span>
              <button onClick={() => bookId ? setSkuModal({ mode: 'add', row: null }) : fireToast('Pick a price book first.', { danger: true })}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 7, cursor: 'pointer',
                  background: 'var(--bg-surface)', color: 'var(--img-orange-700, #B8680E)',
                  border: '1px solid var(--img-orange)', fontSize: 13, fontWeight: 600,
                }}>+ Add SKU</button>
              <label style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 7, cursor: uploading ? 'wait' : 'pointer',
                background: 'var(--img-orange)', color: '#fff', fontSize: 13, fontWeight: 600,
              }}>
                {uploading ? 'Uploading…' : '⬆ Upload pricelist'}
                <input type="file" accept=".xlsx,.xls" disabled={uploading}
                  onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; handleUpload(f); }}
                  style={{ display: 'none' }} />
              </label>
            </div>

            {/* Pricelist versions strip */}
            {versions.length > 0 && (
              <div style={{ padding: '8px 24px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--neutral-25)', fontSize: 11, color: 'var(--fg-secondary)' }}>
                <span style={{ fontWeight: 700, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: 10 }}>Versions:</span>
                {versions.slice(0, 4).map(v => (
                  <span key={v.id} style={{
                    display: 'inline-block', marginRight: 10, padding: '2px 7px', borderRadius: 999,
                    background: v.is_active ? 'var(--img-green-50)' : 'var(--neutral-100)',
                    color:      v.is_active ? 'var(--img-green-700)' : 'var(--fg-secondary)',
                    fontWeight: 600,
                  }} title={`Uploaded ${v.uploaded_at} by ${v.uploaded_by_name || 'system'}`}>
                    {v.is_active ? '● ' : ''}V{v.id} · {v.source_filename || 'manual'} · {v.sku_count} SKUs · USD→JOD {v.usd_to_jod}
                  </span>
                ))}
              </div>
            )}

            {/* SKU table */}
            <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
              {loadError && <div style={{ padding: 12, background: 'var(--color-danger-bg)', color: '#B0241D', borderRadius: 7, fontSize: 12, marginBottom: 10 }}>{loadError}</div>}
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: canSeeCosts
                    ? '180px 110px 200px 1fr 90px 100px 80px 70px'
                    : '180px 110px 200px 1fr 100px 70px',
                  gap: 8, padding: '8px 12px', background: 'var(--neutral-25)',
                  fontSize: 10.5, fontWeight: 700, color: 'var(--fg-tertiary)',
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                  borderBottom: '1px solid var(--border-subtle)',
                }}>
                  <span>Category</span><span>ERP</span><span>Model</span><span>Description</span>
                  {canSeeCosts && <span style={{ textAlign: 'right' }}>Cost JOD</span>}
                  <span style={{ textAlign: 'right' }}>List price</span>
                  {canSeeCosts && <span style={{ textAlign: 'right' }}>GP@25%</span>}
                  <span style={{ textAlign: 'right' }}>Actions</span>
                </div>
                {skus.map(s => {
                  const ns25 = s.list_price * 0.75;
                  const gp25 = canSeeCosts && s.cost_jod ? (ns25 - s.cost_jod) / ns25 : null;
                  return (
                    <div key={s.id} style={{
                      display: 'grid',
                      gridTemplateColumns: canSeeCosts
                        ? '180px 110px 200px 1fr 90px 100px 80px 70px'
                        : '180px 110px 200px 1fr 100px 70px',
                      gap: 8, padding: '8px 12px',
                      borderBottom: '1px solid var(--border-subtle)', alignItems: 'center',
                      fontSize: 12,
                    }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={[s.category_l2, s.category_l3].filter(Boolean).join(' › ') || s.category}>
                        {s.category_l2 && <span style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>{s.category_l2} › </span>}
                        <span style={{ color: 'var(--fg-secondary)' }}>{s.category_l3 || s.category}</span>
                      </span>
                      <span className="t-mono" style={{ fontSize: 10.5, color: 'var(--fg-tertiary)' }}>{s.erp_code || '—'}</span>
                      <span className="t-mono" style={{ fontWeight: 600 }}>{s.model}</span>
                      <span style={{ color: 'var(--fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.description}>{s.description}</span>
                      {canSeeCosts && <span className="t-num" style={{ textAlign: 'right', color: 'var(--fg-secondary)' }}>{(s.cost_jod || 0).toLocaleString()}</span>}
                      <span className="t-num" style={{ textAlign: 'right', fontWeight: 700 }}>{(s.list_price || 0).toLocaleString()}</span>
                      {canSeeCosts && <span className="t-num" style={{ textAlign: 'right', color: gp25 != null ? (gp25 < 0.15 ? '#B0241D' : 'var(--img-green-700)') : 'var(--fg-tertiary)' }}>{gp25 != null ? `${(gp25 * 100).toFixed(1)}%` : '—'}</span>}
                      <span style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button onClick={() => setSkuModal({ mode: 'edit', row: s })} title="Edit"
                          style={{ width: 26, height: 26, border: '1px solid var(--border-default)', borderRadius: 5, background: 'var(--bg-surface)', cursor: 'pointer', fontSize: 12 }}>✎</button>
                        <button onClick={async () => {
                          setDeactivate({ sku: s, loading: true, usage: null });
                          try {
                            const usage = await window.api.get(`/product-skus/${s.id}/usage`);
                            setDeactivate({ sku: s, loading: false, usage });
                          } catch (e) {
                            setDeactivate({ sku: s, loading: false, usage: { total: 0, active_count: 0, active: [], all: [] } });
                          }
                        }} title="Deactivate"
                          style={{ width: 26, height: 26, border: '1px solid var(--border-default)', borderRadius: 5, background: 'var(--bg-surface)', cursor: 'pointer', fontSize: 12, color: '#B0241D' }}>🗑</button>
                      </span>
                    </div>
                  );
                })}
                {skus.length === 0 && (
                  <div style={{ padding: 30, textAlign: 'center', color: 'var(--fg-tertiary)', fontSize: 12 }}>No SKUs match this filter.</div>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {/* Popovers */}
      {popover?.kind === 'notif' && <window.NotificationsPopover anchorRect={popover.rect} onClose={() => setPopover(null)} />}
      {popover?.kind === 'user'  && <window.UserMenu anchorRect={popover.rect} onClose={() => setPopover(null)} onAction={() => {}} />}

      {skuModal && (
        <SkuModal
          mode={skuModal.mode}
          row={skuModal.row}
          priceBookId={bookId}
          categoryTree={categoryTree}
          groupList={groupList}
          familiesOf={familiesOf}
          onClose={() => setSkuModal(null)}
          onSaved={() => { setSkuModal(null); reload(); }}
          fireToast={fireToast}
        />
      )}

      {deactivate && (
        <DeactivateModal
          sku={deactivate.sku}
          loading={deactivate.loading}
          usage={deactivate.usage}
          onClose={() => setDeactivate(null)}
          onConfirm={async () => {
            try { await window.api.del(`/product-skus/${deactivate.sku.id}`); fireToast(`Deactivated ${deactivate.sku.model}`); setDeactivate(null); reload(); }
            catch (e) { fireToast(`Failed: ${e.message}`, { danger: true }); }
          }}
        />
      )}

      <window.Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

function SkuModal({ mode, row, priceBookId, categoryTree, groupList, familiesOf, onClose, onSaved, fireToast }) {
  const initial = row || {};
  const [form, setForm] = useState({
    category_l2: initial.category_l2 || '',
    category_l3: initial.category_l3 || '',
    model:       initial.model || '',
    description: initial.description || '',
    unit:        initial.unit || 'pc',
    list_price:  initial.list_price != null ? String(initial.list_price) : '',
    erp_code:    initial.erp_code || '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  // Derive Layer 1 from the tree for the chosen group (all "AC" today, but future-proof).
  const l1Of = (l2) => { for (const t of (categoryTree || [])) if (t.groups.some(g => g.l2 === l2)) return t.l1; return null; };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setGroup = (l2) => setForm(f => ({ ...f, category_l2: l2, category_l3: '' }));

  const submit = async () => {
    if (!form.model.trim())      { setError('Model is required.'); return; }
    if (!form.list_price)        { setError('List price is required.'); return; }
    if (!form.category_l2)       { setError('Group is required.'); return; }
    if (!form.category_l3)       { setError('Family is required.'); return; }
    setSaving(true); setError(null);
    try {
      const body = {
        price_book_id: priceBookId,
        category_l1: l1Of(form.category_l2),
        category_l2: form.category_l2,
        category_l3: form.category_l3,
        model:       form.model.trim(),
        description: form.description.trim() || null,
        unit:        (form.unit || 'pc').trim(),
        list_price:  Number(form.list_price),
        erp_code:    form.erp_code.trim() || null,
      };
      if (mode === 'add') await window.api.post('/product-skus', body);
      else                await window.api.put(`/product-skus/${row.id}`, body);
      fireToast(`${mode === 'add' ? 'Added' : 'Updated'} ${body.model}`);
      onSaved();
    } catch (e) {
      setError(e?.message || 'Save failed.');
      setSaving(false);
    }
  };

  const field = (label, child) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      {child}
    </label>
  );
  const input = { height: 32, padding: '0 10px', border: '1px solid var(--border-default)', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', background: 'var(--bg-surface)' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(40,38,36,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: 20, width: 460, boxShadow: 'var(--shadow-xl)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>{mode === 'add' ? 'Add SKU' : `Edit ${row.model}`}</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {field('Group (Layer 2) *', (
            <select value={form.category_l2} onChange={e => setGroup(e.target.value)} style={input}>
              <option value="">— pick group —</option>
              {(groupList || []).map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          ))}
          {field('Family (Layer 3) *', (
            <select value={form.category_l3} onChange={e => set('category_l3', e.target.value)} disabled={!form.category_l2} style={{ ...input, opacity: form.category_l2 ? 1 : 0.5 }}>
              <option value="">{form.category_l2 ? '— pick family —' : '— pick group first —'}</option>
              {((familiesOf || {})[form.category_l2] || []).map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          ))}
          {field('Unit', <input value={form.unit} onChange={e => set('unit', e.target.value)} placeholder="pc" style={input} />)}
          {field('Model *', <input value={form.model} onChange={e => set('model', e.target.value)} style={input} />)}
          {field('ERP Code', <input value={form.erp_code} onChange={e => set('erp_code', e.target.value)} style={input} />)}
          <div style={{ gridColumn: '1 / span 2' }}>
            {field('Description', <input value={form.description} onChange={e => set('description', e.target.value)} style={input} />)}
          </div>
          {field('List Price (JOD) *', <input type="number" step={0.01} value={form.list_price} onChange={e => set('list_price', e.target.value)} style={input} />)}
        </div>

        {error && (
          <div style={{ marginTop: 10, padding: 8, fontSize: 12, color: '#B0241D', background: '#FDECEC', border: '1px solid #F5B6B1', borderRadius: 6 }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <button onClick={onClose} disabled={saving} style={{ padding: '7px 14px', borderRadius: 6, fontSize: 12.5, fontWeight: 600, background: 'var(--bg-surface)', color: 'var(--fg-primary)', border: '1px solid var(--border-default)', cursor: 'pointer' }}>Cancel</button>
          <button onClick={submit} disabled={saving} style={{ padding: '7px 14px', borderRadius: 6, fontSize: 12.5, fontWeight: 700, background: 'var(--img-orange)', color: '#fff', border: '1px solid var(--img-orange)', cursor: saving ? 'wait' : 'pointer' }}>{saving ? 'Saving…' : (mode === 'add' ? 'Add SKU' : 'Save')}</button>
        </div>
      </div>
    </div>
  );
}

// Confirmation modal for deactivating a SKU. Shows the active quotations that
// still reference it so the PM knows what's affected before retiring it.
function DeactivateModal({ sku, loading, usage, onClose, onConfirm }) {
  const [working, setWorking] = useState(false);
  const active = usage?.active || [];
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(40,38,36,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: 20, width: 'min(560px, 92vw)', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-xl)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Deactivate “{sku.model}”?</div>
        <div style={{ fontSize: 12.5, color: 'var(--fg-secondary)', marginBottom: 12 }}>
          It will be hidden from new quotations. Existing quotations keep their own saved copy and stay intact.
        </div>

        {loading ? (
          <div style={{ padding: 16, fontSize: 13, color: 'var(--fg-tertiary)' }}>Checking which quotations use it…</div>
        ) : active.length === 0 ? (
          <div style={{ padding: 10, fontSize: 12.5, color: 'var(--img-green-700)', background: 'var(--img-green-50)', border: '1px solid var(--img-green-200, #B7E1C4)', borderRadius: 6 }}>
            Not used by any active quotation — safe to deactivate.
            {usage?.total > 0 && <span style={{ color: 'var(--fg-secondary)' }}> (Used by {usage.total} closed/past quotation{usage.total === 1 ? '' : 's'}, which are unaffected.)</span>}
          </div>
        ) : (
          <div style={{ overflowY: 'auto', border: '1px solid #F5C77E', borderRadius: 7 }}>
            <div style={{ padding: '8px 12px', background: 'var(--img-orange-50)', color: 'var(--img-orange-700, #B8680E)', fontSize: 12, fontWeight: 700, borderBottom: '1px solid #F5C77E' }}>
              ⚠ Used by {active.length} active quotation{active.length === 1 ? '' : 's'} (still editable deals):
            </div>
            {active.map((q, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', fontSize: 12.5 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={q.opp_title}>{q.opp_title || `Opp #${q.opportunity_id}`}</span>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                  <span className="t-mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{q.reference || `V${q.version_number}`}</span>
                  <span style={{ fontSize: 10.5, padding: '1px 6px', borderRadius: 999, background: 'var(--stage-tender-bg, #E8F0FE)', color: 'var(--stage-tender, #1A56DB)' }}>{q.opp_stage}</span>
                </span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} disabled={working} style={{ padding: '7px 14px', borderRadius: 6, fontSize: 12.5, fontWeight: 600, background: 'var(--bg-surface)', color: 'var(--fg-primary)', border: '1px solid var(--border-default)', cursor: 'pointer' }}>Cancel</button>
          <button onClick={async () => { setWorking(true); await onConfirm(); }} disabled={loading || working}
            style={{ padding: '7px 14px', borderRadius: 6, fontSize: 12.5, fontWeight: 700, background: '#B0241D', color: '#fff', border: '1px solid #B0241D', cursor: (loading || working) ? 'wait' : 'pointer' }}>
            {working ? 'Deactivating…' : (active.length ? 'Deactivate anyway' : 'Deactivate')}
          </button>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<PricelistApp />);
