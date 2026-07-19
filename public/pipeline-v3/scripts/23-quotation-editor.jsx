// Standalone quotation editor.
//
// URL: /pipeline-v3/Quotation.html?requestId=<id>
//
// This page replaces the in-drawer Submit form. It owns its own component
// tree so input changes don't ripple through the whole MyTasks drawer (which
// was causing the scroll-to-top bug). Wide layout, single column.

const { useState, useEffect, useMemo, useRef, useCallback } = React;

function QuotationEditor() {
  const params = new URLSearchParams(window.location.search);
  const requestId = +params.get('requestId') || 0;
  const salesMode = params.get('mode') === 'sales';
  const [parentQuote, setParentQuote] = useState(null);   // latest released, hydrates sales-mode
  const [categoryBulk, setCategoryBulk] = useState({ category: '', pct: 0 });

  const [request,   setRequest]   = useState(null);
  const [brands,    setBrands]    = useState([]);
  const [books,     setBooks]     = useState([]);
  const [categories,setCategories]= useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [submitting,setSubmitting]= useState(false);
  const [ready,     setReady]     = useState(false);

  // Load users first (so window.CURRENT_USER is real, not stub).
  useEffect(() => {
    let cancelled = false;
    window.loadRealUsers().then(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, []);

  // Load the request + reference data once user roster is ready.
  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        if (!requestId) throw new Error('Missing ?requestId in URL.');
        const r = await window.api.get(`/design-requests/${requestId}`);
        setRequest(r);
        if (salesMode) {
          // Hydrate from the latest released quotation. Sales mode = edit discounts only.
          const released = r.latest_quotation;
          if (!released) throw new Error('No released quotation to revise.');
          setParentQuote(released);
        }
        const [bs, bks] = await Promise.all([
          window.api.get('/brands'),
          window.api.get('/price-books'),
        ]);
        setBrands(bs);
        setBooks(bks);
      } catch (e) {
        setError(e.message || 'Could not load.');
      } finally {
        setLoading(false);
      }
    })();
  }, [ready, requestId, salesMode]);

  // ─── Header state ──────────────────────────────────────────────────────
  const meName = window.CURRENT_USER?.name || 'Designer';
  const versionNumber = (request?.quotations?.length || 0) + 1;
  const [header, setHeader] = useState(null);
  useEffect(() => {
    if (!request) return;
    setHeader(prev => prev || {
      reference:             `IMG_${request.opportunity_id}_V${versionNumber}`,
      quote_date:            new Date().toISOString().slice(0, 10),
      project_name:          request.opp_title || '',
      city:                  '',
      project_type:          '',
      pricing_mode:          (request.form_data && request.form_data.project_nature) || '',
      sales_engineer_name:   request.salesman_name || '',
      design_engineer_name:  meName,
      brand:                 'Gree',
      intro_text:            '',
      maintenance_text:      '',
      tnc_text:              '',
    });
  }, [request, versionNumber, meName]);
  const setHdr = useCallback((k, v) => setHeader(h => h ? { ...h, [k]: v } : h), []);

  // ─── Discount. Above the limit raises a manager-approval request. ───────
  const [discountPct, setDiscountPct] = useState(0);
  const discountFraction = Math.max(0, Math.min(99, Number(discountPct) || 0)) / 100;
  // Over-limit approval request surfaced by the server (needs_approval).
  const [approval,  setApproval]  = useState(null);   // { opp_id, quotation_id, requested_pct }
  const [apprNote,  setApprNote]  = useState('');
  const [apprState, setApprState] = useState(null);   // 'sending' | 'sent'

  // ─── Target release stage (designer picks at submit time) ──────────────
  const [targetRelease, setTargetRelease] = useState('');

  // ─── Brand / book selectors above the line items ───────────────────────
  const [brandId, setBrandId] = useState(null);
  const [bookId,  setBookId]  = useState(null);
  useEffect(() => {
    if (brands.length && brandId == null) {
      const gree = brands.find(b => /Gree/i.test(b.name)) || brands[0];
      setBrandId(gree.id);
    }
  }, [brands, brandId]);
  useEffect(() => {
    if (!brandId) return;
    const firstBook = books.find(bk => bk.brand_id === brandId);
    if (firstBook && bookId == null) setBookId(firstBook.id);
  }, [brandId, books, bookId]);
  // Reload the 3-layer category tree whenever the book changes.
  const [categoryTree, setCategoryTree] = useState([]);
  useEffect(() => {
    if (!bookId) return;
    window.api.get(`/product-skus/categories?price_book_id=${bookId}`)
      .then(setCategories)
      .catch(() => setCategories([]));
    window.api.get(`/product-skus/category-tree?price_book_id=${bookId}`)
      .then(setCategoryTree)
      .catch(() => setCategoryTree([]));
  }, [bookId]);
  const booksForBrand = useMemo(() => books.filter(b => b.brand_id === brandId), [books, brandId]);

  // Flatten the tree to the Layer-2 groups, and a lookup group → families.
  const groupList = useMemo(() => categoryTree.flatMap(t => t.groups.map(g => g.l2)), [categoryTree]);
  const familiesOf = useMemo(() => {
    const m = {};
    categoryTree.forEach(t => t.groups.forEach(g => { m[g.l2] = g.families; }));
    return m;
  }, [categoryTree]);

  // ─── Line items ────────────────────────────────────────────────────────
  const blankItem = () => ({
    category: '', category_l2: '', category_l3: '', sku_id: '', model: '', description: '',
    list_price: 0, qty: 1, unit: 'pc', unit_price: 0,
    is_override: 0, models: [],
  });
  const [lineItems, setLineItems] = useState([blankItem()]);

  // Sales-mode: once the parent quotation arrives, hydrate the line items + header
  // from it. Designer fields stay read-only; only discount % is editable.
  useEffect(() => {
    if (!salesMode || !parentQuote || !request) return;
    setHeader({
      reference: (parentQuote.reference || '') + ' (sales rev)',
      quote_date: new Date().toISOString().slice(0, 10),
      project_name: parentQuote.project_name || request.opp_title || '',
      city: parentQuote.city || '',
      project_type: parentQuote.project_type || '',
      pricing_mode: parentQuote.pricing_mode || '',
      sales_engineer_name: parentQuote.sales_engineer_name || request.salesman_name || '',
      design_engineer_name: parentQuote.design_engineer_name || '',
      brand: parentQuote.brand || 'Gree',
      intro_text: parentQuote.intro_text || '',
      maintenance_text: parentQuote.maintenance_text || '',
      tnc_text: parentQuote.tnc_text || '',
    });
    setDiscountPct(Math.round((parentQuote.discount_pct_global || 0) * 100));
    setTargetRelease(parentQuote.target_release_stage || 'Tender');
    // Items: read from parentQuote.line_items
    setLineItems((parentQuote.line_items || []).map(li => ({
      _parent_line_id: li.id,
      category: li.category,
      category_l2: li.category_l2 || '',
      category_l3: li.category_l3 || '',
      sku_id: li.sku_id,
      model: li.model,
      description: li.description,
      list_price: li.list_price,
      qty: li.qty,
      unit: li.unit,
      unit_price: li.unit_price,
      discount_pct: li.discount_pct || 0,
      is_override: !!li.is_override,
      models: [],
    })));
  }, [salesMode, parentQuote, request]);
  const patchItem = (i, patch) => setLineItems(items => items.map((it, j) => j === i ? { ...it, ...patch } : it));
  const addItem = () => setLineItems(items => [...items, blankItem()]);
  const removeItem = (i) => setLineItems(items => items.length > 1 ? items.filter((_, j) => j !== i) : items);

  // Group (Layer 2) → clears family + model.
  const pickGroup = (i, l2) => {
    patchItem(i, { category_l2: l2, category_l3: '', category: '', models: [], sku_id: '', model: '', description: '', list_price: 0, unit_price: 0 });
  };
  // Family (Layer 3) → loads the models in that group+family.
  const pickFamily = async (i, l3) => {
    patchItem(i, { category_l3: l3, category: l3, models: [], sku_id: '', model: '', description: '', list_price: 0, unit_price: 0 });
    if (!l3 || !bookId) return;
    const it = lineItems[i] || {};
    const qs = new URLSearchParams({ price_book_id: String(bookId), category_l2: it.category_l2 || '', category_l3: l3 });
    const models = await window.api.get(`/product-skus?${qs.toString()}`).catch(() => []);
    setLineItems(items => items.map((x, j) => j === i ? { ...x, models } : x));
  };
  const pickModel = (i, skuId) => {
    setLineItems(items => items.map((it, j) => {
      if (j !== i) return it;
      const sku = (it.models || []).find(m => String(m.id) === String(skuId));
      if (!sku) return { ...it, sku_id: null };
      const unit_price = +(sku.list_price * (1 - discountFraction)).toFixed(2);
      return {
        ...it, sku_id: sku.id, model: sku.model,
        description: sku.description || '',
        category: sku.category || it.category,
        category_l2: sku.category_l2 || it.category_l2,
        category_l3: sku.category_l3 || it.category_l3,
        list_price: sku.list_price, unit: sku.unit || 'pc',
        unit_price, is_override: 0,
      };
    }));
  };
  useEffect(() => {
    setLineItems(items => items.map(it => {
      if (it.is_override || !it.list_price) return it;
      return { ...it, unit_price: +(it.list_price * (1 - discountFraction)).toFixed(2) };
    }));
  }, [discountFraction]);

  const setOverride = (i, val) => {
    setLineItems(items => items.map((it, j) => {
      if (j !== i) return it;
      const v = Number(val) || 0;
      const computed = it.list_price ? +(it.list_price * (1 - discountFraction)).toFixed(2) : 0;
      return { ...it, unit_price: v, is_override: Math.abs(v - computed) > 0.5 ? 1 : 0 };
    }));
  };

  const itemSubtotal = (it) => (+it.qty || 0) * (+it.unit_price || 0);
  const totalValue = lineItems.reduce((s, it) => s + itemSubtotal(it), 0);
  const validItems = lineItems.filter(it => it.sku_id && (+it.qty > 0));
  const canSubmit = salesMode ? validItems.length > 0 : (!!targetRelease && validItems.length > 0);

  // Sales-mode helpers: set a per-line discount (override unit_price too)
  const setLineDiscount = (i, pct) => {
    setLineItems(items => items.map((it, j) => {
      if (j !== i) return it;
      const d = Math.max(0, Math.min(0.99, (+pct || 0) / 100));
      const unit_price = it.list_price ? +(it.list_price * (1 - d)).toFixed(2) : it.unit_price;
      return { ...it, discount_pct: d, unit_price };
    }));
  };
  const applyCategoryBulk = () => {
    if (!categoryBulk.category) return;
    const d = Math.max(0, Math.min(0.99, (+categoryBulk.pct || 0) / 100));
    setLineItems(items => items.map(it => {
      if (it.category !== categoryBulk.category) return it;
      const unit_price = it.list_price ? +(it.list_price * (1 - d)).toFixed(2) : it.unit_price;
      return { ...it, discount_pct: d, unit_price };
    }));
  };

  // Distinct categories present on this quotation (for the bulk picker)
  const inUseCategories = Array.from(new Set(lineItems.map(it => it.category).filter(Boolean)));

  const [designerNotes, setDesignerNotes] = useState('');
  const [pendingFiles,  setPendingFiles]  = useState([]);
  const [uploadName,    setUploadName]    = useState('');
  const addFile = () => {
    if (!uploadName.trim()) return;
    setPendingFiles(fs => [...fs, { name: uploadName.trim(), size: Math.round(Math.random() * 3e6 + 2e5) }]);
    setUploadName('');
  };

  // Raise the over-limit discount approval request for a sales manager.
  const requestApproval = async () => {
    if (!approval) return;
    setApprState('sending');
    try {
      await window.api.post('/approvals', {
        opp_id: approval.opp_id,
        quotation_id: approval.quotation_id,
        requested_pct: approval.requested_pct,
        notes: apprNote.trim() || null,
      });
      setApprState('sent'); setError(null);
    } catch (e) {
      setApprState(null);
      setError(e?.message || 'Could not send the approval request.');
    }
  };

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    setApproval(null);
    try {
      if (salesMode) {
        // Sales revision: per-line discounts, posted to /sales-revision.
        const line_discounts = {};
        for (const it of lineItems) if (it._parent_line_id) line_discounts[it._parent_line_id] = it.discount_pct || 0;
        await window.api.post(`/quotation-versions/${parentQuote.id}/sales-revision`, {
          line_discounts,
          notes: designerNotes.trim() || null,
        });
        // Send the salesman back to their deal in the pipeline.
        window.location.href = 'Pipeline.html';
        return;
      }
      await window.api.post('/quotation-versions', {
        request_id: requestId,
        header,
        discount_pct_global: discountFraction,
        target_release_stage: targetRelease,
        line_items: validItems.map(it => ({
          sku_id: it.sku_id, category: it.category, model: it.model,
          description: it.description, qty: +it.qty, unit: it.unit,
          list_price: it.list_price, discount_pct: discountFraction,
          unit_price: it.unit_price,
        })),
        files: pendingFiles,
        designer_notes: designerNotes.trim() || null,
      });
      await window.api.put(`/design-requests/${requestId}/stage`, { stage: 'Review' });
      window.location.href = 'MyTasks.html';
    } catch (e) {
      if (e?.data?.needs_approval) {
        // Over the limit — offer the manager-approval request (same flow as the deal page).
        setApproval({ opp_id: e.data.opp_id, quotation_id: e.data.quotation_id, requested_pct: e.data.requested_pct });
        setApprState(null); setApprNote('');
        setError(e.data.error);
      } else if (e?.data?.over_cap) {
        const lines = e.data.over_cap.map(o => `${o.model} → ${(o.requested_pct * 100).toFixed(1)}%`).join('; ');
        setError(`${e.data.error} Lines over cap: ${lines}`);
      } else {
        setError(e.message || 'Submit failed.');
      }
      setSubmitting(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────
  if (!ready || loading) {
    return <div style={{ padding: 40, color: 'var(--fg-secondary)' }}>Loading…</div>;
  }
  if (error && !request) {
    return <div style={{ padding: 40, color: '#B0241D' }}>Error: {error}</div>;
  }
  if (!request || !header) return null;

  const fieldStyle = {
    padding: '8px 10px', fontSize: 13, border: '1px solid var(--border-default)',
    borderRadius: 6, background: 'var(--bg-surface)', color: 'var(--fg-primary)',
    fontFamily: 'inherit', outline: 'none', width: '100%',
  };
  const labelStyle = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5, fontWeight: 600, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' };
  const sectionStyle = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 18, marginBottom: 14 };
  const sectionTitle = { fontSize: 13, fontWeight: 700, color: 'var(--fg-primary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 60px' }}>
      {/* Sticky header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20, background: 'var(--bg-page)',
        padding: '16px 0', borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18,
      }}>
        <a href={salesMode ? 'Pipeline.html' : 'MyTasks.html'} style={{ fontSize: 13, color: 'var(--fg-secondary)', textDecoration: 'none', fontWeight: 600 }}>
          ← Back to {salesMode ? 'Pipeline' : 'My Tasks'}
        </a>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {salesMode ? `SALES REVISION · based on ${parentQuote?.reference || `V${versionNumber}`}` : `QUOTATION V${versionNumber} · ${header.reference}`}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg-primary)' }}>{request.opp_title}</div>
        </div>
        <div className="t-num" style={{ fontSize: 22, fontWeight: 800, color: 'var(--fg-primary)' }}>
          {window.formatJOD ? window.formatJOD(totalValue) : `JOD ${totalValue.toFixed(2)}`}
        </div>
        <button onClick={submit} disabled={!canSubmit || submitting} style={{
          padding: '10px 22px', borderRadius: 8, border: 'none',
          background: canSubmit && !submitting ? 'var(--img-orange)' : 'var(--neutral-200)',
          color: '#fff', fontWeight: 700, fontSize: 14,
          cursor: canSubmit && !submitting ? 'pointer' : 'not-allowed',
        }}>{submitting ? 'Submitting…' : (salesMode ? 'Save sales revision' : 'Submit for review')}</button>
      </div>

      {error && (
        <div style={{ padding: 12, background: 'var(--color-danger-bg)', color: '#B0241D', borderRadius: 7, fontSize: 12.5, marginBottom: 14 }}>{error}</div>
      )}

      {approval && apprState === 'sent' && (
        <div style={{ padding: 12, background: 'var(--img-green-50, #ECFAF1)', color: 'var(--img-green-700, #1F7A3D)', border: '1px solid var(--img-green-200, #B7E1C4)', borderRadius: 7, fontSize: 12.5, marginBottom: 14 }}>
          Approval requested for {approval.requested_pct}% — a sales manager will review it. Once approved, submit again to apply the discount.
        </div>
      )}

      {approval && apprState !== 'sent' && (
        <div style={{ padding: 14, background: 'var(--img-orange-50, #FEF7EC)', border: '1px solid var(--img-orange-200, #F5C77E)', borderRadius: 7, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--img-orange-700, #B8680E)', marginBottom: 8 }}>
            {approval.requested_pct}% exceeds the discount limit — request sales-manager approval
          </div>
          <textarea value={apprNote} onChange={e => setApprNote(e.target.value)} rows={2}
            placeholder="Note for the approver (optional) — e.g. why this discount is needed"
            style={{ width: '100%', padding: '8px 10px', fontSize: 12.5, fontFamily: 'inherit', borderRadius: 6, border: '1px solid var(--border-default)', resize: 'vertical', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button onClick={() => { setApproval(null); setError(null); }} disabled={apprState === 'sending'}
              style={{ padding: '7px 14px', borderRadius: 6, fontSize: 12.5, fontWeight: 600, background: 'var(--bg-surface)', color: 'var(--fg-primary)', border: '1px solid var(--border-default)', cursor: 'pointer' }}>Cancel</button>
            <button onClick={requestApproval} disabled={apprState === 'sending'}
              style={{ padding: '7px 16px', borderRadius: 6, fontSize: 12.5, fontWeight: 700, background: 'var(--img-orange)', color: '#fff', border: '1px solid var(--img-orange)', cursor: apprState === 'sending' ? 'wait' : 'pointer' }}>
              {apprState === 'sending' ? 'Sending…' : 'Request approval'}
            </button>
          </div>
        </div>
      )}

      {/* Header section */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>Quotation header — shown on customer PDF</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          {[
            ['reference', 'Reference', 'text'],
            ['quote_date', 'Date', 'date'],
            ['project_name', 'Project name', 'text'],
            ['city', 'City', 'text'],
            ['project_type', 'Project type', 'text'],
            ['pricing_mode', 'Pricing mode', 'text'],
            ['sales_engineer_name', 'Sales engineer', 'text'],
            ['design_engineer_name', 'Design engineer', 'text'],
          ].map(([k, lbl, type]) => (
            <label key={k} style={labelStyle}>
              <span>{lbl}</span>
              <input type={type} value={header[k] || ''} onChange={e => setHdr(k, e.target.value)}
                readOnly={salesMode}
                style={{ ...fieldStyle, background: salesMode ? 'var(--neutral-25)' : fieldStyle.background, color: salesMode ? 'var(--fg-secondary)' : fieldStyle.color }} />
            </label>
          ))}
        </div>
        <label style={{ ...labelStyle, marginTop: 14 }}>
          <span>Brand introduction (optional — appears at the top of the PDF)</span>
          <textarea value={header.intro_text || ''} onChange={e => setHdr('intro_text', e.target.value)}
            rows={3} style={{ ...fieldStyle, resize: 'vertical', height: 'auto' }} />
        </label>
      </div>

      {/* Discount + release */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>Commercial</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <label style={labelStyle}>
            <span>Sales discount (%) · internal only — customer sees only "Discount Applied"</span>
            <input type="number" min="0" max="99" step="0.5"
              value={discountPct} onChange={e => setDiscountPct(Math.max(0, Math.min(99, Number(e.target.value) || 0)))}
              style={fieldStyle} />
          </label>
          {!salesMode && (
            <label style={labelStyle}>
              <span>Release to (after approval) <span style={{ color: '#B0241D' }}>*</span></span>
              <div style={{ display: 'flex', gap: 14, padding: '6px 0' }}>
                {['Tender', 'Analysis'].map(s => (
                  <label key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)' }}>
                    <input type="radio" name="release_to" value={s} checked={targetRelease === s} onChange={() => setTargetRelease(s)} />
                    {s}
                  </label>
                ))}
              </div>
            </label>
          )}
        </div>
      </div>

      {/* Pricelist source — designer mode only */}
      {!salesMode && <div style={sectionStyle}>
        <div style={sectionTitle}>Pricelist source</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <label style={labelStyle}>
            <span>Brand</span>
            <select value={brandId || ''} onChange={e => { setBrandId(+e.target.value); setBookId(null); }} style={fieldStyle}>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label style={labelStyle}>
            <span>Price book</span>
            <select value={bookId || ''} onChange={e => setBookId(+e.target.value)} style={fieldStyle}>
              {booksForBrand.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        </div>
      </div>}

      {/* Line items */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Line items {salesMode && '(sales revision — discount only)'}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg-primary)' }}>Total: <span className="t-num">{window.formatJOD ? window.formatJOD(totalValue) : `JOD ${totalValue.toFixed(2)}`}</span></div>
        </div>
        {/* Sales-mode: category-bulk toolbar */}
        {salesMode && inUseCategories.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '8px 10px', background: 'var(--neutral-25)', border: '1px solid var(--border-subtle)', borderRadius: 7, fontSize: 12 }}>
            <span style={{ fontWeight: 700, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Discount by category:</span>
            <select value={categoryBulk.category} onChange={e => setCategoryBulk({ ...categoryBulk, category: e.target.value })}
              style={{ padding: '5px 8px', fontSize: 12, border: '1px solid var(--border-default)', borderRadius: 5 }}>
              <option value="">— pick category —</option>
              {inUseCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="number" min="0" max="99" step="0.5" placeholder="%"
              value={categoryBulk.pct} onChange={e => setCategoryBulk({ ...categoryBulk, pct: e.target.value })}
              style={{ width: 70, padding: '5px 8px', fontSize: 12, border: '1px solid var(--border-default)', borderRadius: 5, textAlign: 'right' }} />
            <button onClick={applyCategoryBulk} disabled={!categoryBulk.category}
              style={{ padding: '5px 12px', borderRadius: 5, border: 'none', background: categoryBulk.category ? 'var(--img-orange)' : 'var(--neutral-200)', color: '#fff', fontWeight: 600, fontSize: 12, cursor: categoryBulk.category ? 'pointer' : 'not-allowed' }}>Apply</button>
            <span style={{ fontSize: 11, color: 'var(--fg-tertiary)', fontStyle: 'italic' }}>fills every line in that category; you can still override individual lines after</span>
          </div>
        )}
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: salesMode ? '150px 150px 1fr 50px 70px 100px 100px 30px' : '160px 170px 1fr 60px 110px 100px 30px',
            gap: 8, padding: '8px 10px', background: 'var(--neutral-25)',
            fontSize: 10.5, fontWeight: 700, color: 'var(--fg-tertiary)',
            textTransform: 'uppercase', letterSpacing: '0.04em',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <span>{salesMode ? 'Category' : 'Group / Family'}</span><span>Model</span><span>Description</span>
            <span>Qty</span>
            {salesMode && <span>Disc%</span>}
            <span>Unit price</span><span>Subtotal</span><span></span>
          </div>
          {lineItems.map((it, i) => {
            const sub = itemSubtotal(it);
            const cell = { padding: '6px 8px', fontSize: 12.5, border: '1px solid var(--border-default)', borderRadius: 5, background: 'var(--bg-surface)', color: 'var(--fg-primary)', fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' };
            const ro = { ...cell, background: 'var(--neutral-50)', color: 'var(--fg-secondary)' };
            return (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: salesMode ? '150px 150px 1fr 50px 70px 100px 100px 30px' : '160px 170px 1fr 60px 110px 100px 30px',
                gap: 8, padding: '8px 10px',
                borderBottom: '1px solid var(--border-subtle)', alignItems: 'center',
              }}>
                {salesMode ? (
                  <span style={{ padding: '6px 8px', fontSize: 12, color: 'var(--fg-secondary)' }}>{it.category || '—'}</span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <select value={it.category_l2 || ''} onChange={e => pickGroup(i, e.target.value)} style={{ ...cell, fontSize: 11.5 }} title="Group">
                      <option value="">— group —</option>
                      {groupList.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                    <select value={it.category_l3 || ''} onChange={e => pickFamily(i, e.target.value)} disabled={!it.category_l2}
                      style={{ ...cell, fontSize: 11.5, opacity: it.category_l2 ? 1 : 0.5 }} title="Family">
                      <option value="">— family —</option>
                      {(familiesOf[it.category_l2] || []).map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                )}
                {salesMode ? (
                  <span className="t-mono" style={{ padding: '6px 8px', fontSize: 11, color: 'var(--fg-secondary)' }}>{it.model || '—'}</span>
                ) : (
                  <select value={it.sku_id || ''} onChange={e => pickModel(i, e.target.value)} disabled={!it.category_l3} style={{ ...cell, opacity: it.category_l3 ? 1 : 0.5 }}>
                    <option value="">— pick —</option>
                    {(it.models || []).map(m => <option key={m.id} value={m.id}>{m.model}</option>)}
                  </select>
                )}
                {salesMode ? (
                  <span style={{ padding: '6px 8px', fontSize: 12, color: 'var(--fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.description}>{it.description || '—'}</span>
                ) : (
                  <input value={it.description} onChange={e => patchItem(i, { description: e.target.value })}
                    placeholder="Customer-facing description" style={cell} />
                )}
                {salesMode ? (
                  <span className="t-num" style={{ padding: '6px 8px', textAlign: 'right', fontSize: 12 }}>{it.qty}</span>
                ) : (
                  <input type="number" min="0" value={it.qty} onChange={e => patchItem(i, { qty: e.target.value })} style={{ ...cell, textAlign: 'right' }} />
                )}
                {salesMode && (
                  <input type="number" min="0" max="99" step="0.5"
                    value={+((it.discount_pct || 0) * 100).toFixed(2)}
                    onChange={e => setLineDiscount(i, e.target.value)}
                    style={{ ...cell, textAlign: 'right', background: (it.discount_pct || 0) > 0 ? 'var(--img-orange-50)' : cell.background }}
                    title="Sales discount % for this line. Above the limit needs manager approval." />
                )}
                {salesMode ? (
                  <span className="t-num" style={{ padding: '6px 8px', textAlign: 'right', fontSize: 12 }}>{window.formatJOD ? window.formatJOD(it.unit_price).replace('JOD ', '') : it.unit_price}</span>
                ) : (
                  <input type="number" min="0" value={it.unit_price} onChange={e => setOverride(i, e.target.value)}
                    style={{ ...cell, textAlign: 'right', background: it.is_override ? 'var(--img-orange-50)' : cell.background }}
                    title={it.is_override ? `Override — list was ${it.list_price}` : `Auto = list ${it.list_price} × (1 − ${(discountFraction*100).toFixed(1)}%)`} />
                )}
                <span className="t-num" style={{ textAlign: 'right', fontWeight: 700, fontSize: 13 }}>
                  {sub ? sub.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}
                </span>
                {salesMode ? <span></span> : (
                  <button onClick={() => removeItem(i)} disabled={lineItems.length === 1}
                    title="Remove" style={{
                      width: 26, height: 26, borderRadius: 5,
                      border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
                      color: lineItems.length === 1 ? 'var(--neutral-300)' : 'var(--fg-secondary)',
                      cursor: lineItems.length === 1 ? 'not-allowed' : 'pointer',
                      fontSize: 14, lineHeight: 1,
                    }}>×</button>
                )}
              </div>
            );
          })}
          {!salesMode && (
            <div style={{ padding: '10px 12px', background: 'var(--neutral-25)' }}>
              <button onClick={addItem} style={{
                padding: '7px 14px', borderRadius: 6, background: 'var(--bg-surface)',
                color: 'var(--img-orange-700, #B8680E)', border: '1px dashed var(--img-orange)',
                cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
              }}>+ Add line</button>
            </div>
          )}
        </div>
      </div>

      {/* Notes + attachments */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>Internal · notes + attachments</div>
        <label style={labelStyle}>
          <span>Designer notes (internal — goes to the reviewer with the version)</span>
          <textarea value={designerNotes} onChange={e => setDesignerNotes(e.target.value)} rows={3}
            style={{ ...fieldStyle, resize: 'vertical', height: 'auto' }} />
        </label>
        <div style={{ marginTop: 12 }}>
          <div style={{ ...labelStyle, marginBottom: 6 }}><span>Attach files</span></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={uploadName} onChange={e => setUploadName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFile(); } }}
              placeholder="e.g. design-rev2.dwg" style={{ ...fieldStyle, flex: 1 }} />
            <button onClick={addFile} disabled={!uploadName.trim()} style={{
              padding: '8px 14px', borderRadius: 6, border: 'none',
              background: uploadName.trim() ? 'var(--img-orange)' : 'var(--neutral-200)',
              color: '#fff', cursor: uploadName.trim() ? 'pointer' : 'not-allowed', fontSize: 12.5, fontWeight: 600,
            }}>Add</button>
          </div>
          {pendingFiles.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {pendingFiles.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: 'var(--neutral-25)', borderRadius: 5, fontSize: 12 }}>
                  <span style={{ flex: 1 }}>{f.name}</span>
                  <button onClick={() => setPendingFiles(fs => fs.filter((_, j) => j !== i))}
                    style={{ border: 'none', background: 'transparent', color: 'var(--fg-tertiary)', cursor: 'pointer', fontSize: 14 }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Provide a lightweight formatJOD if formatters file isn't loaded.
if (!window.formatJOD) window.formatJOD = (n) => `JOD ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

ReactDOM.createRoot(document.getElementById('root')).render(<QuotationEditor />);
