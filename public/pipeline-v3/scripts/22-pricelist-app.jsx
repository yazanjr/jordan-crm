// PM Portal — Pricelist page.
// Gated to product_manager / admin / users with can_view_costs. The cost
// columns shown here come from the API only when the caller has rights.

const { useState, useMemo, useEffect } = React;

const selBtn = {
  padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
  background: 'var(--bg-surface)', color: 'var(--fg-primary)', border: '1px solid var(--border-default)',
};

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
  const [selected, setSelected]   = useState(() => new Set()); // selected SKU ids
  const [bulkOpen, setBulkOpen]   = useState(false);
  const [uploadMode, setUploadMode] = useState('merge'); // 'merge' | 'replace'
  const [busy, setBusy]           = useState(false);
  const [paramsOpen, setParamsOpen] = useState(false);   // GREE parameters editor
  const [buildupId, setBuildupId]   = useState(null);    // SKU id whose build-up modal is open
  const fireToast = (msg, opts={}) => setToast({ msg, ...opts });

  // Drop the selection whenever the book or filters change (ids no longer shown).
  useEffect(() => { setSelected(new Set()); }, [bookId, groupFilter, familyFilter, search]);
  const toggleSel = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allShownSelected = skus.length > 0 && skus.every(s => selected.has(s.id));
  const toggleSelAll = () => setSelected(prev => {
    if (skus.every(s => prev.has(s.id))) { const n = new Set(prev); skus.forEach(s => n.delete(s.id)); return n; }
    const n = new Set(prev); skus.forEach(s => n.add(s.id)); return n;
  });
  const selectedIds = () => [...selected];

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

  // When the active book actually changes (manual switch, brand switch, or the
  // auto-select above), clear the group/family/search filters — otherwise a
  // filter from the previous book silently applies to the new one and can hide
  // all its rows. A ref guards against firing on unrelated re-renders / mount.
  const prevBookRef = React.useRef(bookId);
  useEffect(() => {
    if (prevBookRef.current !== bookId) {
      prevBookRef.current = bookId;
      setGroupFilter(''); setFamilyFilter(''); setSearch('');
    }
  }, [bookId]);

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
  const groupList = React.useMemo(() => [...new Set(categoryTree.flatMap(t => t.groups.map(g => g.l2)))], [categoryTree]);
  const familiesOf = React.useMemo(() => { const m = {}; categoryTree.forEach(t => t.groups.forEach(g => { m[g.l2] = g.families; })); return m; }, [categoryTree]);
  useEffect(() => { reload(); }, [reload]);

  const handleUpload = async (file) => {
    if (!file) return;
    if (uploadMode === 'replace' && !window.confirm('Replace mode hides every item in the GREE book that is NOT in your sheet, then loads the sheet. Continue?')) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mode', uploadMode);
      // New computing importer: reads Item ID/Model/Category/Section/FOB (+ optional
      // Price 1) and CALCULATES all costs & derived prices from the parameters.
      const data = await window.uploadForm('/api/pricing/import', fd);
      const msg = data.mode === 'replace'
        ? `Replaced — ${data.items_inserted} added, ${data.items_updated} updated, ${data.retired} hidden${data.skipped ? `, ${data.skipped} skipped` : ''}`
        : `Added ${data.items_inserted} · updated ${data.items_updated}${data.skipped ? ` · ${data.skipped} skipped` : ''} (prices computed)`;
      fireToast(msg);
      reload();
    } catch (e) {
      fireToast(`Failed: ${e.message}`, { danger: true });
    } finally {
      setUploading(false);
    }
  };
  const downloadTemplate = () =>
    window.downloadBlob('/api/pricing/import-template', 'GREE-pricelist-upload-template.xlsx')
      .catch(e => fireToast(e.message || 'Download failed', { danger: true }));

  // Build the export URL for the current book, honoring active filters. Pass an
  // array of ids to export only the selected rows.
  const exportUrl = (ids) => {
    const qs = new URLSearchParams({ price_book_id: String(bookId) });
    if (groupFilter)  qs.set('category_l2', groupFilter);
    if (familyFilter) qs.set('category_l3', familyFilter);
    if (search)       qs.set('search', search);
    if (ids && ids.length) qs.set('ids', ids.join(','));
    return '/api/product-skus/export?' + qs.toString();
  };
  const bookName = () => (booksForBrand.find(b => b.id === bookId) || {}).name || 'pricelist';
  // Returns the download promise so callers can AWAIT it — critical when an
  // export is followed by a delete (must finish downloading rows while they're
  // still active, otherwise the file comes out empty).
  const doExport = (ids) => {
    if (!bookId) { fireToast('Pick a price book first.', { danger: true }); return Promise.resolve(); }
    const fname = `${bookName()}${ids && ids.length ? `-${ids.length}-selected` : ''}-${new Date().toISOString().slice(0,10)}.xlsx`;
    return window.downloadBlob(exportUrl(ids), fname).catch(e => fireToast(e.message || 'Export failed', { danger: true }));
  };

  const bulkDeactivate = async (ids, { alsoExport } = {}) => {
    if (!ids.length) return;
    const whole = ids.length === skus.length ? ' — that\'s every item shown' : '';
    if (!window.confirm(`${alsoExport ? 'Export, then remove' : 'Remove'} the ${ids.length} selected SKU${ids.length === 1 ? '' : 's'}${whole}? They are retired (hidden), so existing quotations keep working.`)) return;
    setBusy(true);
    try {
      if (alsoExport) await doExport(ids);   // finish the download BEFORE retiring
      const r = await window.api.post('/product-skus/bulk-deactivate', { ids });
      fireToast(`Removed ${r.deactivated} SKU${r.deactivated === 1 ? '' : 's'}`);
      setSelected(new Set());
      reload();
    } catch (e) { fireToast(`Failed: ${e.message}`, { danger: true }); }
    finally { setBusy(false); }
  };

  const clearBook = async () => {
    if (!bookId) { fireToast('Pick a price book first.', { danger: true }); return; }
    if (!window.confirm(`Back up to Excel, then retire ALL SKUs in the WHOLE book "${bookName()}"? Existing quotations keep their snapshots.`)) return;
    setBusy(true);
    try {
      await doExport(null); // full-book backup first — awaited so it can't come out empty
      const all = await window.api.get('/product-skus?' + new URLSearchParams({ price_book_id: String(bookId) }).toString());
      const ids = all.map(s => s.id);
      if (!ids.length) { fireToast('Nothing to clear.'); return; }
      const r = await window.api.post('/product-skus/bulk-deactivate', { ids });
      fireToast(`Backed up & retired ${r.deactivated} SKUs`);
      setSelected(new Set());
      reload();
    } catch (e) { fireToast(`Failed: ${e.message}`, { danger: true }); }
    finally { setBusy(false); }
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
          if (id === 'settings') { window.location.href = 'Settings.html'; return; }
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
              <button onClick={() => setParamsOpen(true)} title="Edit the pricing parameters (rates, tiers, exchange rate)"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', background: 'var(--bg-surface)', color: 'var(--fg-primary)', border: '1px solid var(--border-default)', fontSize: 13, fontWeight: 600 }}>⚙ Parameters</button>
              <button onClick={() => bookId ? setSkuModal({ mode: 'add', row: null }) : fireToast('Pick a price book first.', { danger: true })}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', background: 'var(--bg-surface)', color: 'var(--img-orange-700, #B8680E)', border: '1px solid var(--img-orange)', fontSize: 13, fontWeight: 600 }}>+ Add SKU</button>
              <button onClick={() => doExport(null)} title="Download the entire price book as Excel"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', background: 'var(--bg-surface)', color: 'var(--fg-primary)', border: '1px solid var(--border-default)', fontSize: 13, fontWeight: 600 }}>⬇ Export whole book</button>
              <button onClick={clearBook} disabled={busy} title="Back up to Excel, then retire EVERY SKU in this whole book"
                style={{ padding: '6px 10px', borderRadius: 7, cursor: busy ? 'default' : 'pointer', background: 'var(--color-danger-bg)', color: 'var(--color-danger)', border: '1px solid var(--color-danger)', fontSize: 12.5, fontWeight: 700 }}>🗑 Clear whole book</button>
              <button onClick={downloadTemplate} title="Download the blank Excel template to fill in and upload"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', background: 'var(--bg-surface)', color: 'var(--fg-primary)', border: '1px solid var(--border-default)', fontSize: 13, fontWeight: 600 }}>⬇ Template</button>
              {/* Upload with a merge/replace mode toggle */}
              <div style={{ display: 'inline-flex', alignItems: 'stretch', borderRadius: 7, overflow: 'hidden', border: '1px solid var(--img-orange)' }}>
                <select value={uploadMode} onChange={e => setUploadMode(e.target.value)} title="How an upload treats items not in the sheet"
                  style={{ height: 32, border: 'none', borderRight: '1px solid var(--img-orange-100)', padding: '0 6px', fontSize: 12, fontWeight: 600, background: 'var(--img-orange-50)', color: 'var(--img-orange-700)', cursor: 'pointer' }}>
                  <option value="merge">Update &amp; add</option>
                  <option value="replace">Replace all</option>
                </select>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 12px', cursor: uploading ? 'wait' : 'pointer', background: 'var(--img-orange)', color: '#fff', fontSize: 13, fontWeight: 600 }}>
                  {uploading ? 'Uploading…' : '⬆ Upload'}
                  <input type="file" accept=".xlsx,.xls" disabled={uploading}
                    onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; handleUpload(f); }}
                    style={{ display: 'none' }} />
                </label>
              </div>
            </div>

            {/* Selection action bar — appears when rows are ticked */}
            {selected.size > 0 && (
              <div style={{ padding: '8px 24px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--img-green-50, #ECF8F1)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--img-green-700)' }}>
                  {selected.size} of {skus.length} shown selected
                  {selected.size === skus.length && <span style={{ color: 'var(--color-danger)', marginLeft: 6 }}>— that’s every item shown</span>}
                </span>
                <span style={{ flex: 1 }}></span>
                <span style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginRight: 2 }}>These act on the {selected.size} selected only:</span>
                <button onClick={() => doExport(selectedIds())} style={selBtn}>⬇ Export selected</button>
                <button onClick={() => setBulkOpen(true)} style={selBtn}>✎ Bulk edit selected</button>
                <button onClick={() => bulkDeactivate(selectedIds(), { alsoExport: true })} disabled={busy} style={{ ...selBtn, color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}>Export &amp; remove selected</button>
                <button onClick={() => bulkDeactivate(selectedIds())} disabled={busy} style={{ ...selBtn, color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}>Remove selected</button>
                <button onClick={() => setSelected(new Set())} style={{ ...selBtn, border: 'none', background: 'transparent' }}>Clear</button>
              </div>
            )}

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
                    ? '32px 180px 110px 200px 1fr 90px 100px 80px 70px'
                    : '32px 180px 110px 200px 1fr 100px 70px',
                  gap: 8, padding: '8px 12px', background: 'var(--neutral-25)',
                  fontSize: 10.5, fontWeight: 700, color: 'var(--fg-tertiary)',
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                  borderBottom: '1px solid var(--border-subtle)',
                }}>
                  <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
                    <input type="checkbox" checked={allShownSelected} onChange={toggleSelAll} title="Select ALL shown rows" style={{ cursor: 'pointer' }} />
                    <span style={{ fontSize: 8, marginTop: 2 }}>ALL</span>
                  </span>
                  <span>Category</span><span>ERP</span><span>Model</span><span>Description</span>
                  {canSeeCosts && <span style={{ textAlign: 'right' }}>Cost JOD</span>}
                  <span style={{ textAlign: 'right' }}>List price</span>
                  {canSeeCosts && <span style={{ textAlign: 'right' }}>GP@List</span>}
                  <span style={{ textAlign: 'right' }}>Actions</span>
                </div>
                {skus.map(s => {
                  // GP @ list (0% discount). GREE rows carry gp_list from the API; others fall back.
                  const gpList = s.gp_list != null ? s.gp_list
                    : (canSeeCosts && s.cost_jod && s.list_price ? (s.list_price - s.cost_jod) / s.list_price : null);
                  const isGree = !!s.item_id;
                  const phased = /phased/i.test(s.status || '');
                  return (
                    <div key={s.id} style={{
                      display: 'grid',
                      gridTemplateColumns: canSeeCosts
                        ? '32px 180px 110px 200px 1fr 90px 100px 80px 70px'
                        : '32px 180px 110px 200px 1fr 100px 70px',
                      gap: 8, padding: '8px 12px',
                      borderBottom: '1px solid var(--border-subtle)', alignItems: 'center',
                      fontSize: 12, background: selected.has(s.id) ? 'var(--img-orange-50)' : 'transparent',
                    }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                        <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSel(s.id)} style={{ cursor: 'pointer' }} />
                      </span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={[s.category_l2, s.category_l3].filter(Boolean).join(' › ') || s.category}>
                        {s.category_l2 && <span style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>{s.category_l2} › </span>}
                        <span style={{ color: 'var(--fg-secondary)' }}>{s.category_l3 || s.category}</span>
                      </span>
                      <span className="t-mono" style={{ fontSize: 10.5, color: 'var(--fg-tertiary)' }}>{s.erp_code || '—'}</span>
                      <span className="t-mono" style={{ fontWeight: 600 }}>
                        {s.model}
                        {phased && <span style={{ marginLeft: 6, fontSize: 8.5, fontWeight: 700, color: 'var(--color-danger)', border: '1px solid var(--color-danger)', borderRadius: 4, padding: '0 4px', verticalAlign: 'middle' }}>PHASED OUT</span>}
                      </span>
                      <span style={{ color: 'var(--fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.description}>{s.description}</span>
                      {canSeeCosts && <span className="t-num" style={{ textAlign: 'right', color: 'var(--fg-secondary)' }}>{((isGree ? s.cost_inclusive : s.cost_jod) || 0).toLocaleString()}</span>}
                      <span className="t-num" style={{ textAlign: 'right', fontWeight: 700 }}>{(s.list_price || 0).toLocaleString()}</span>
                      {canSeeCosts && <span className="t-num" style={{ textAlign: 'right', color: gpList != null ? (gpList < 0.15 ? '#B0241D' : 'var(--img-green-700)') : 'var(--fg-tertiary)' }}>{gpList != null ? `${(gpList * 100).toFixed(1)}%` : '—'}</span>}
                      <span style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        {isGree && canSeeCosts && <button onClick={() => setBuildupId(s.id)} title="Cost build-up & GP tiers"
                          style={{ width: 26, height: 26, border: '1px solid var(--border-default)', borderRadius: 5, background: 'var(--bg-surface)', cursor: 'pointer', fontSize: 12 }}>📊</button>}
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

      {bulkOpen && (
        <BulkEditModal
          count={selected.size}
          groupList={groupList}
          onClose={() => setBulkOpen(false)}
          onApply={async (payload) => {
            setBusy(true);
            try {
              const r = await window.api.put('/product-skus/bulk', { ids: selectedIds(), ...payload });
              fireToast(`Updated ${r.updated} SKU${r.updated === 1 ? '' : 's'}`);
              setBulkOpen(false); setSelected(new Set()); reload();
            } catch (e) { fireToast(`Failed: ${e.message}`, { danger: true }); }
            finally { setBusy(false); }
          }}
        />
      )}

      {paramsOpen && <ParametersModal onClose={() => setParamsOpen(false)} onSaved={(n) => { fireToast(`Saved — recomputed ${n} items`); reload(); }} fireToast={fireToast} />}
      {buildupId != null && <BuildUpModal skuId={buildupId} onClose={() => setBuildupId(null)} onChanged={() => reload()} fireToast={fireToast} />}

      <window.Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

// Bulk edit for the selected SKUs. Price change (adjust % OR set exact), plus
// optional group/family/unit overrides. Only filled fields are applied.
function BulkEditModal({ count, groupList, onClose, onApply }) {
  const { ModalShell, Btn, Field, TextInput } = window.PopupShell;
  const [mode, setMode] = useState('adjust');   // 'adjust' | 'set' | 'none'
  const [pct, setPct]   = useState('');
  const [price, setPrice] = useState('');
  const [l2, setL2]     = useState('');
  const [l3, setL3]     = useState('');
  const [unit, setUnit] = useState('');

  const apply = () => {
    const payload = {};
    if (mode === 'adjust' && pct !== '' && Number(pct) !== 0) payload.priceAdjustPct = Number(pct);
    if (mode === 'set' && price !== '') payload.setPrice = Number(price);
    const patch = {};
    if (l2.trim()) patch.category_l2 = l2.trim();
    if (l3.trim()) patch.category_l3 = l3.trim();
    if (unit.trim()) patch.unit = unit.trim();
    if (Object.keys(patch).length) payload.patch = patch;
    onApply(payload);
  };
  const priceEmpty = (mode === 'adjust' && (pct === '' || Number(pct) === 0)) || (mode === 'set' && price === '');
  const canApply = !( (mode === 'none' || priceEmpty) && !l2.trim() && !l3.trim() && !unit.trim() );

  const seg = (val, label) => (
    <button type="button" onClick={() => setMode(val)} style={{
      flex: 1, padding: '6px 8px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
      border: '1px solid var(--border-default)',
      background: mode === val ? 'var(--img-orange)' : 'var(--bg-surface)',
      color: mode === val ? '#fff' : 'var(--fg-secondary)',
    }}>{label}</button>
  );

  return (
    <ModalShell title={`Bulk edit ${count} SKU${count === 1 ? '' : 's'}`} subtitle="Only the fields you fill are changed." width={440} onClose={onClose}
      footer={<>
        <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
        <Btn kind="primary" disabled={!canApply} onClick={apply}>Apply to {count}</Btn>
      </>}>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="List price">
          <div style={{ display: 'flex', borderRadius: 7, overflow: 'hidden', marginBottom: 8 }}>
            {seg('adjust', 'Adjust by %')}{seg('set', 'Set to')}{seg('none', 'Leave')}
          </div>
          {mode === 'adjust' && <TextInput type="number" value={pct} onChange={e => setPct(e.target.value)} placeholder="e.g. 5 for +5%, -10 for −10%" />}
          {mode === 'set' && <TextInput type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="New list price for all selected" />}
        </Field>
        <Field label="Group (Layer 2)" hint="Leave blank to keep each SKU's own">
          <TextInput value={l2} onChange={e => setL2(e.target.value)} list="pl-groups" placeholder="Unchanged" />
          <datalist id="pl-groups">{(groupList || []).map(g => <option key={g} value={g} />)}</datalist>
        </Field>
        <Field label="Family (Layer 3)">
          <TextInput value={l3} onChange={e => setL3(e.target.value)} placeholder="Unchanged" />
        </Field>
        <Field label="Unit">
          <TextInput value={unit} onChange={e => setUnit(e.target.value)} placeholder="Unchanged (e.g. pc, set, mtr)" />
        </Field>
      </div>
    </ModalShell>
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

// ── GREE pricing parameters editor ──────────────────────────────────────────
function ParametersModal({ onClose, onSaved, fireToast }) {
  const { ModalShell, Btn } = window.PopupShell;
  const [rows, setRows] = useState(null);
  const [edited, setEdited] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { window.api.get('/pricing-params').then(setRows).catch(() => setRows([])); }, []);
  const setVal = (code, v) => setEdited(e => ({ ...e, [code]: v }));
  const groups = useMemo(() => { const g = {}; (rows || []).forEach(r => (g[r.category] = g[r.category] || []).push(r)); return g; }, [rows]);
  const dirty = Object.keys(edited).filter(code => { const r = (rows || []).find(x => x.code === code); return r && String(edited[code]) !== String(r.value); });
  const save = async () => {
    if (!dirty.length) { onClose(); return; }
    setSaving(true);
    try { const r = await window.api.put('/pricing-params', { updates: dirty.map(code => ({ code, value: Number(edited[code]) || 0 })) }); onSaved(r.recomputed); onClose(); }
    catch (e) { fireToast('Failed: ' + e.message, { danger: true }); } finally { setSaving(false); }
  };
  return (
    <ModalShell title="Pricing parameters" subtitle="Global + per-category inputs. Saving recomputes every GREE item." width={560} onClose={onClose}
      footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={saving || !dirty.length} onClick={save}>{saving ? 'Saving…' : `Save${dirty.length ? ` (${dirty.length})` : ''}`}</Btn></>}>
      <div style={{ padding: 20, maxHeight: '62vh', overflowY: 'auto' }}>
        {rows == null ? <div style={{ color: 'var(--fg-tertiary)' }}>Loading…</div> :
          Object.keys(groups).map(cat => (
            <div key={cat} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--img-orange-700)', marginBottom: 8 }}>{cat}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: '6px 12px', alignItems: 'center' }}>
                {groups[cat].map(r => {
                  const val = edited[r.code] !== undefined ? edited[r.code] : r.value;
                  return <React.Fragment key={r.code}>
                    <label style={{ fontSize: 12.5, color: 'var(--fg-secondary)' }}>{r.label || r.code} <span className="t-mono" style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>({r.code})</span></label>
                    <input type="number" step="any" value={val} onChange={e => setVal(r.code, e.target.value)}
                      style={{ height: 30, padding: '0 8px', border: '1px solid var(--border-default)', borderRadius: 6, fontSize: 12.5, textAlign: 'right', background: 'var(--bg-surface)' }} />
                  </React.Fragment>;
                })}
              </div>
            </div>
          ))}
      </div>
    </ModalShell>
  );
}

function GpChip({ label, v, price }) {
  const c = v == null ? 'var(--fg-tertiary)' : (v < 0.15 ? 'var(--color-danger)' : 'var(--img-green-700)');
  return (
    <div style={{ padding: '6px 12px', border: `1px solid ${c}`, borderRadius: 8, textAlign: 'center', minWidth: 78 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-tertiary)' }}>{label}</div>
      {price != null && <div className="t-num" style={{ fontWeight: 700, fontSize: 14, color: 'var(--fg-primary)' }}>{Number(price).toLocaleString()}</div>}
      <div className="t-num" style={{ fontWeight: 700, fontSize: 11.5, color: c }}>GP {v == null ? '—' : `${(v * 100).toFixed(1)}%`}</div>
    </div>
  );
}

// ── Cost build-up + GP tiers, with editable Price 1 and a target-GP suggester ──
function BuildUpModal({ skuId, onClose, onChanged, fireToast }) {
  const { ModalShell, Btn } = window.PopupShell;
  const [d, setD] = useState(null);
  const [p1, setP1] = useState('');
  const [targetGP, setTargetGP] = useState('');
  const [saving, setSaving] = useState(false);
  const money = n => n == null ? '—' : Number(n).toLocaleString();
  const load = () => window.api.get(`/product-skus/${skuId}/buildup`).then(x => { setD(x); setP1(x.prices.price1 != null ? x.prices.price1 : ''); }).catch(e => fireToast('Failed: ' + e.message, { danger: true }));
  useEffect(() => { load(); }, [skuId]);
  const savePrice = async () => {
    setSaving(true);
    try { await window.api.put(`/product-skus/${skuId}`, { price1_inclusive: p1 === '' ? null : Number(p1) }); await load(); onChanged && onChanged(); fireToast('Price 1 updated'); }
    catch (e) { fireToast('Failed: ' + e.message, { danger: true }); } finally { setSaving(false); }
  };
  const suggest = () => {
    if (!d) return; const g = (Number(targetGP) || 0) / 100; const cost = d.costs.inclusive || 0; const step = d.round_step || 5;
    if (cost <= 0 || g >= 1) { fireToast('Enter a target GP below 100%.', { danger: true }); return; }
    setP1(Math.ceil((cost / (1 - g)) / step) * step);
  };
  return (
    <ModalShell title={`Cost build-up${d ? ' · ' + d.category : ''}`} width={520} onClose={onClose}
      footer={<Btn kind="ghost" onClick={onClose}>Close</Btn>}>
      <div style={{ padding: 20 }}>
        {!d ? <div style={{ color: 'var(--fg-tertiary)' }}>Loading…</div> : <>
          <div style={{ fontSize: 12, color: 'var(--fg-secondary)', marginBottom: 10 }}>FOB Net: <b>${money(d.fob_net_usd)}</b> × FX {d.fx}</div>
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
            {d.steps.map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', fontSize: 12.5, borderTop: i ? '1px solid var(--border-subtle)' : 'none' }}>
                <span style={{ color: 'var(--fg-secondary)' }}>{s.label}</span><span className="t-num" style={{ fontWeight: 600 }}>{money(s.value)}</span></div>
            ))}
            {d.costs.adders > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', fontSize: 12.5, borderTop: '1px solid var(--border-subtle)', color: 'var(--fg-secondary)' }}><span>+ U-Match adders (copper + install)</span><span className="t-num">{money(d.costs.adders)}</span></div>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
            {[['Cost Inclusive', d.costs.inclusive], ['Cost STax-Exempt', d.costs.stax_exempt], ['Cost Exempted', d.costs.exempted]].map(([l, v]) => (
              <div key={l} style={{ padding: 8, border: '1px solid var(--border-subtle)', borderRadius: 8, textAlign: 'center' }}>
                <div className="t-num" style={{ fontWeight: 700, fontSize: 15 }}>{money(v)}</div><div style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>{l}</div></div>
            ))}
          </div>
          <div style={{ background: 'var(--neutral-25)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 12, marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 600, color: 'var(--fg-secondary)' }}>PRICE 1 (INCLUSIVE)
                <input type="number" value={p1} onChange={e => setP1(e.target.value)} style={{ height: 32, width: 130, padding: '0 8px', border: '1px solid var(--border-default)', borderRadius: 6, textAlign: 'right' }} /></label>
              <Btn kind="primary" disabled={saving} onClick={savePrice}>{saving ? 'Saving…' : 'Save price'}</Btn>
              <span style={{ flex: 1 }}></span>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 600, color: 'var(--fg-secondary)' }}>TARGET GP %
                <input type="number" value={targetGP} onChange={e => setTargetGP(e.target.value)} placeholder="e.g. 45" style={{ height: 32, width: 90, padding: '0 8px', border: '1px solid var(--border-default)', borderRadius: 6, textAlign: 'right' }} /></label>
              <Btn kind="secondary" onClick={suggest}>Suggest</Btn>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--fg-tertiary)', marginTop: 8 }}>Price 2 (STax-Exempt): <b>{money(d.prices.price2)}</b> · Price 3 (Exempted): <b>{money(d.prices.price3)}</b></div>
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--fg-tertiary)', marginBottom: 6 }}>Selling price &amp; gross profit at each discount</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <GpChip label="List (0%)" v={d.gp.gp_list} price={d.gp.price_list != null ? d.gp.price_list : d.prices.price1} />
            {(d.gp.gp_tiers || []).map((t, i) => <GpChip key={i} label={`−${(t.tier * 100).toFixed(0)}%`} v={t.gp} price={t.price} />)}
          </div>
        </>}
      </div>
    </ModalShell>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<PricelistApp />);
