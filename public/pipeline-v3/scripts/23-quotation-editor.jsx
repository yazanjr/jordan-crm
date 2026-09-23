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
  const editVersionId = +params.get('versionId') || 0;    // editing an existing DRAFT
  const [draftId, setDraftId] = useState(editVersionId || null);
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
      warranty_years:        1,
      pm_years:              1,
      pm_visits_per_year:    1,
    });
  }, [request, versionNumber, meName]);
  // Net price like the offer file: ROUNDUP((1 − discount) × list, 0); no discount → list unchanged.
  const netOf = (list, d) => (d > 0 ? Math.ceil(list * (1 - d) - 1e-9) : +(+list).toFixed(2));
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

  // ─── Price basis (tax tier). Defaults from the salesman's project nature; the
  //     designer can override. Decides which pricelist tier each line is priced at.
  const NATURE_TO_BASIS = { 'Including tax & customs': 'inclusive', 'Tax exempt only': 'stax', 'Exempt': 'exempted' };
  const PRICE_BASES = [
    { id: 'inclusive', label: 'Including tax & customs' },
    { id: 'stax',      label: 'Tax exempt only' },
    { id: 'exempted',  label: 'Exempt customs & tax' },
  ];
  const basisLabel = (b) => (PRICE_BASES.find(x => x.id === b) || {}).label || '';
  const [basis, setBasis] = useState('inclusive');
  const basisInit = useRef(false);
  useEffect(() => {
    if (!request || basisInit.current) return;
    basisInit.current = true;
    const nat = request.form_data && request.form_data.project_nature;
    if (nat && NATURE_TO_BASIS[nat]) setBasis(NATURE_TO_BASIS[nat]);
  }, [request]);
  // Price map for the current book: { skuId: {inclusive, stax, exempted} } +
  // the distinct quotation sections in this book (for the picker's fast-finder).
  const [priceMap, setPriceMap] = useState({});
  const [bookSections, setBookSections] = useState([]);
  useEffect(() => {
    if (!bookId) return;
    window.api.get(`/product-skus?price_book_id=${bookId}`).then(rows => {
      const m = {}; const secs = new Set();
      (rows || []).forEach(s => {
        m[s.id] = {
          inclusive: Number(s.price1_inclusive) || Number(s.list_price) || 0,
          stax:      Number(s.price2_stax_exempt) || 0,
          exempted:  Number(s.price3_exempted) || 0,
        };
        if (s.quote_section) secs.add(s.quote_section);
      });
      setPriceMap(m);
      setBookSections([...secs].sort());
    }).catch(() => { setPriceMap({}); setBookSections([]); });
  }, [bookId]);
  // Tier price for a sku at a basis, with a >0 fallback to inclusive (legacy SKUs store 0).
  const priceForBasis = (skuId, b) => {
    const p = priceMap[skuId]; if (!p) return null;
    const v = p[b || basis];
    return v > 0 ? v : (p.inclusive > 0 ? p.inclusive : null);
  };
  // Re-price every SKU-linked line when the basis (or the loaded map) changes; keep
  // manual overrides. Also record the basis label as the printed "pricing mode".
  useEffect(() => {
    if (salesMode) return;
    setHeader(h => h ? { ...h, pricing_mode: basisLabel(basis) } : h);
    setLineItems(items => items.map(it => {
      if (!it.sku_id) return it;
      const lp = priceForBasis(it.sku_id, basis);
      if (lp == null) return it;
      const next = { ...it, list_price: lp };
      if (!it.is_override) next.unit_price = netOf(lp, discountFraction);
      return next;
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basis, priceMap]);

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
  const [install, setInstall] = useState({
    enabled: false, copper: {}, insulation: '13mm', cora_qty: '', cladding_qty: '',
    tray_qty: '', tray_type: '1mm 1sys', valves: false, additional_qty: '', count_overrides: {}, split_copper_m: '',
  });

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
    setLineItems((parentQuote.line_items || []).filter(li => li.model !== 'INSTALL-VRF' && li.model !== 'COPPER-SPLIT').map(li => ({
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
  // Draft-edit mode (designer): hydrate the editor from an existing Draft version.
  useEffect(() => {
    if (salesMode || !editVersionId || !request) return;
    const dq = (request.quotations || []).find(q => q.id === editVersionId);
    if (!dq) return;
    setHeader(h => ({
      ...h,
      reference: dq.reference || h.reference,
      quote_date: dq.quote_date || h.quote_date,
      project_name: dq.project_name || h.project_name,
      city: dq.city || h.city,
      project_type: dq.project_type || h.project_type,
      pricing_mode: dq.pricing_mode || h.pricing_mode,
      sales_engineer_name: dq.sales_engineer_name || h.sales_engineer_name,
      design_engineer_name: dq.design_engineer_name || h.design_engineer_name,
      brand: dq.brand || h.brand,
      intro_text: dq.intro_text || h.intro_text,
      maintenance_text: dq.maintenance_text || h.maintenance_text,
      tnc_text: dq.tnc_text || h.tnc_text,
      warranty_years: dq.warranty_years ?? h.warranty_years,
      pm_years: dq.pm_years ?? h.pm_years,
      pm_visits_per_year: dq.pm_visits_per_year ?? h.pm_visits_per_year,
    }));
    setDiscountPct(Math.round((dq.discount_pct_global || 0) * 100));
    if (dq.target_release_stage) setTargetRelease(dq.target_release_stage);
    if (dq.designer_notes) setDesignerNotes(dq.designer_notes);
    if (dq.installation) setInstall(v => ({ ...v, ...dq.installation }));
    setAttachments((dq.files || []).filter(x => x && x.stored));
    if (!(dq.line_items || []).some(li => li.model !== 'INSTALL-VRF' && li.model !== 'COPPER-SPLIT') && dq.total_value) setManualTotal(String(dq.total_value));
    if ((dq.line_items || []).filter(li => li.model !== 'INSTALL-VRF' && li.model !== 'COPPER-SPLIT').length) {
      setLineItems(dq.line_items.filter(li => li.model !== 'INSTALL-VRF' && li.model !== 'COPPER-SPLIT').map(li => ({
        category: li.category, category_l2: li.category_l2 || '', category_l3: li.category_l3 || '',
        sku_id: li.sku_id, model: li.model, description: li.description,
        list_price: li.list_price, qty: li.qty, unit: li.unit, unit_price: li.unit_price,
        discount_pct: li.discount_pct || 0, is_override: !!li.is_override, models: [],
      })));
    }
  }, [salesMode, editVersionId, request]);

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
    // Guard: phased-out items are not quotable (dropdown disables them too).
    const cur = lineItems[i];
    const chosen = cur && (cur.models || []).find(m => String(m.id) === String(skuId));
    if (chosen && /phased/i.test(chosen.status || '')) {
      setError(`"${chosen.model}" is phased out and can't be added to a quotation. Choose an active model.`);
      return;
    }
    setLineItems(items => items.map((it, j) => {
      if (j !== i) return it;
      const sku = (it.models || []).find(m => String(m.id) === String(skuId));
      if (!sku) return { ...it, sku_id: null };
      const unit_price = netOf(sku.list_price, discountFraction);
      return {
        ...it, sku_id: sku.id, model: sku.model,
        description: sku.description || '',
        category: sku.quote_section || sku.category || it.category,
        category_l2: sku.category_l2 || it.category_l2,
        category_l3: sku.category_l3 || it.category_l3,
        list_price: sku.list_price, unit: sku.unit || 'pc',
        unit_price, is_override: 0,
      };
    }));
  };
  // Select a SKU directly from the searchable picker (no category cascade needed).
  // Auto-fills model/description/price so the designer never types a description.
  const selectSku = (i, sku) => {
    if (!sku) return;
    if (/phased/i.test(sku.status || '')) {
      setError(`"${sku.model}" is phased out and can't be added to a quotation. Choose an active model.`);
      return;
    }
    // Price from the current basis tier (P1/P2/P3), falling back to the SKU list.
    const lp = priceForBasis(sku.id, basis) ?? (Number(sku.list_price) || 0);
    const unit_price = netOf(lp, discountFraction);
    patchItem(i, {
      sku_id: sku.id, model: sku.model,
      description: sku.description || '',
      // Group the quote by the customer-facing quotation section when the item has
      // one; fall back to its plain category otherwise.
      category: sku.quote_section || sku.category || sku.category_l3 || sku.category_l2 || '',
      category_l2: sku.category_l2 || '', category_l3: sku.category_l3 || '',
      list_price: lp, unit: sku.unit || 'pc',
      unit_price, is_override: 0,
    });
  };
  useEffect(() => {
    setLineItems(items => items.map(it => {
      if (it.is_override || !it.list_price) return it;
      return { ...it, unit_price: netOf(it.list_price, discountFraction) };
    }));
  }, [discountFraction]);

  const setOverride = (i, val) => {
    setLineItems(items => items.map((it, j) => {
      if (j !== i) return it;
      const v = Number(val) || 0;
      const computed = it.list_price ? netOf(it.list_price, discountFraction) : 0;
      // Keep discount in step with the manually-entered price so the two never
      // contradict each other (discount = 1 − price/list, clamped to 0–99%).
      const discount_pct = it.list_price ? Math.max(0, Math.min(0.99, +(1 - v / it.list_price).toFixed(4))) : (it.discount_pct || 0);
      return { ...it, unit_price: v, discount_pct, is_override: Math.abs(v - computed) > 0.5 ? 1 : 0 };
    }));
  };

  const itemSubtotal = (it) => (+it.qty || 0) * (+it.unit_price || 0);
  const totalValue = lineItems.reduce((s, it) => s + itemSubtotal(it), 0);
  const validItems = lineItems.filter(it => it.sku_id && (+it.qty > 0));

  // ─── VRF installation (same maths as the IMG offer file's "Installation Price"
  //     sheet; rates live in Pricelist → Installation parameters). The designer only
  //     enters inputs — the server counts the units and returns the price.
  const [installCalc, setInstallCalc] = useState(null);
  const setInst = (patch) => setInstall(v => ({ ...v, ...patch }));
  const hasVrf = validItems.some(it => it.category === 'VRF System');
  // Like the offer file, a VRF quotation includes installation by default; the
  // designer can untick it. (A reopened draft keeps whatever was saved.)
  const installTouched = useRef(false);
  useEffect(() => {
    if (salesMode || editVersionId || installTouched.current || !hasVrf) return;
    installTouched.current = true;
    setInstall(v => ({ ...v, enabled: true }));
  }, [hasVrf]);
  const installKey = JSON.stringify([install, validItems.map(it => [it.sku_id, +it.qty, it.list_price]), discountFraction, header && [header.pricing_mode, header.city, header.project_type, header.brand, header.warranty_years, header.pm_years, header.pm_visits_per_year]]);
  useEffect(() => {
    if (salesMode || (!install.enabled && !(Number(install.split_copper_m) > 0))) { setInstallCalc(null); return; }
    const t = setTimeout(() => {
      window.api.post('/installation/preview', {
        line_items: validItems.map(it => ({ sku_id: it.sku_id, category: it.category, model: it.model, description: it.description, qty: +it.qty, list_price: it.list_price })),
        installation: install, discount_pct_global: discountFraction,
        header: { pricing_mode: header && header.pricing_mode, city: header && header.city, project_type: header && header.project_type, brand: header && header.brand, warranty_years: header && header.warranty_years, pm_years: header && header.pm_years, pm_visits_per_year: header && header.pm_visits_per_year },
      }).then(setInstallCalc).catch(() => setInstallCalc(null));
    }, 350);
    return () => clearTimeout(t);
  }, [installKey]);
  const installPrice = install.enabled && installCalc ? installCalc.result.net : 0;
  const splitCopperPrice = installCalc && installCalc.split_copper ? installCalc.split_copper.net : 0;
  const grandTotal = totalValue + installPrice + splitCopperPrice;
  // A quotation can also be an uploaded file (the designer's own offer) with a typed total.
  const canSubmit = salesMode ? validItems.length > 0 : (!!targetRelease && (validItems.length > 0 || (hasAttachment && Number(manualTotal) > 0)));

  // Sales-mode helpers: set a per-line discount (override unit_price too)
  const setLineDiscount = (i, pct) => {
    setLineItems(items => items.map((it, j) => {
      if (j !== i) return it;
      const d = Math.max(0, Math.min(0.99, (+pct || 0) / 100));
      const unit_price = it.list_price ? netOf(it.list_price, d) : it.unit_price;
      return { ...it, discount_pct: d, unit_price };
    }));
  };
  const applyCategoryBulk = () => {
    if (!categoryBulk.category) return;
    const d = Math.max(0, Math.min(0.99, (+categoryBulk.pct || 0) / 100));
    setLineItems(items => items.map(it => {
      if (it.category !== categoryBulk.category) return it;
      const unit_price = it.list_price ? netOf(it.list_price, d) : it.unit_price;
      return { ...it, discount_pct: d, unit_price };
    }));
  };

  // Distinct categories present on this quotation (for the bulk picker)
  const inUseCategories = Array.from(new Set(lineItems.map(it => it.category).filter(Boolean)));

  const [designerNotes, setDesignerNotes] = useState('');
  // Real attachments. Files picked before the version exists are held here and
  // uploaded right after the first save/submit; files on a saved draft upload at once.
  const [pendingFiles,  setPendingFiles]  = useState([]);          // File objects
  const [attachments,   setAttachments]   = useState([]);          // saved on the server
  const [uploading,     setUploading]     = useState(false);
  const [manualTotal,   setManualTotal]   = useState('');          // used only when there are no line items
  const uploadPending = async (versionId) => {
    if (!pendingFiles.length || !versionId) return;
    setUploading(true);
    try {
      const fd = new FormData();
      pendingFiles.forEach(f => fd.append('file', f, f.name));
      const r = await window.uploadForm(`/api/quotation-versions/${versionId}/attachments`, fd);
      setAttachments(r.files || []); setPendingFiles([]);
    } finally { setUploading(false); }
  };
  const onPickFiles = async (e) => {
    const picked = Array.from(e.target.files || []); e.target.value = '';
    if (!picked.length) return;
    if (draftId) {
      setUploading(true);
      try {
        const fd = new FormData(); picked.forEach(f => fd.append('file', f, f.name));
        const r = await window.uploadForm(`/api/quotation-versions/${draftId}/attachments`, fd);
        setAttachments(r.files || []);
      } catch (err) { setError(err.message || 'Upload failed.'); } finally { setUploading(false); }
    } else setPendingFiles(fs => [...fs, ...picked]);
  };
  const removeAttachment = async (i) => {
    if (!draftId || !window.confirm('Remove this file from the quotation?')) return;
    try { const r = await window.api.del(`/quotation-versions/${draftId}/attachments/${i}`); setAttachments(r.files || []); }
    catch (err) { setError(err.message || 'Could not remove the file.'); }
  };
  const hasAttachment = pendingFiles.length > 0 || attachments.some(x => x && x.stored);

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

  // Common designer payload for both "save draft" and "submit".
  const designerBody = () => ({
    request_id: requestId,
    header,
    discount_pct_global: discountFraction,
    target_release_stage: targetRelease,
    line_items: validItems.map(it => ({
      sku_id: it.sku_id, category: it.category, model: it.model,
      description: it.description, qty: +it.qty, unit: it.unit,
      list_price: it.list_price,
      discount_pct: (it.discount_pct != null ? it.discount_pct : discountFraction),
      unit_price: it.unit_price,
    })),
    total_value: validItems.length ? undefined : (Number(manualTotal) || 0),
    designer_notes: designerNotes.trim() || null,
    installation: install,
  });

  const [savingDraft, setSavingDraft] = useState(false);
  const [draftMsg, setDraftMsg] = useState('');
  // Save privately as a Draft (no submit, no review). Create on first save, then update.
  const saveDraft = async () => {
    if (salesMode || savingDraft) return;
    if (!validItems.length && !hasAttachment) { setError('Add at least one item, or attach a quotation file, before saving a draft.'); return; }
    setSavingDraft(true); setError(null);
    try {
      if (draftId) {
        await window.api.put(`/quotation-versions/${draftId}`, designerBody());
      } else {
        const r = await window.api.post('/quotation-versions', { ...designerBody(), as_draft: true });
        setDraftId(r.id);
        await uploadPending(r.id);
      }
      setDraftMsg('Draft saved ✓'); setTimeout(() => setDraftMsg(''), 2500);
    } catch (e) { setError(e.message || 'Could not save draft.'); }
    finally { setSavingDraft(false); }
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
      if (draftId) {
        // Existing draft → save the latest edits, then submit that draft.
        await window.api.put(`/quotation-versions/${draftId}`, designerBody());
        await uploadPending(draftId);
        await window.api.post(`/quotation-versions/${draftId}/submit`, {});
      } else {
        // No draft → create + submit in one step (original behaviour).
        const created = await window.api.post('/quotation-versions', designerBody());
        await uploadPending(created.id);
      }
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
          {window.formatJOD ? window.formatJOD(grandTotal) : `JOD ${grandTotal.toFixed(2)}`}
        </div>
        {(() => {
          const savedId = (parentQuote && parentQuote.id) || (request && request.latest_quotation && request.latest_quotation.id);
          if (!savedId) return null;
          return (
            <>
              <button onClick={() => window.downloadBlob(`/api/quotation-versions/${savedId}/export.xlsm`, `${header.reference || 'quotation'}.xlsm`).catch(err => setError(err.message || 'Download failed'))}
                title="Download the saved quotation as the original IMG offer workbook, filled in"
                style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--img-green-700)', background: 'var(--bg-surface)', color: 'var(--img-green-700)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                ⬇ Excel
              </button>
              <button onClick={() => window.downloadBlob(`/api/quotation-versions/${savedId}/export.doc`, `${header.reference || 'quotation'}.doc`).catch(err => setError(err.message || 'Download failed'))}
                title="Download the saved quotation as a Word file"
                style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--fg-primary)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                ⬇ Word
              </button>
            </>
          );
        })()}
        {!salesMode && (
          <button onClick={saveDraft} disabled={savingDraft || submitting}
            title="Save privately as a draft — not submitted. Build several, then submit one."
            style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--img-orange)', background: 'var(--bg-surface)', color: 'var(--img-orange-700, #B8680E)', fontWeight: 700, fontSize: 13, cursor: savingDraft ? 'default' : 'pointer' }}>
            {savingDraft ? 'Saving…' : (draftMsg || (draftId ? 'Save draft' : 'Save as draft'))}
          </button>
        )}
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
        {!salesMode && (
          <label style={{ ...labelStyle, marginBottom: 14 }}>
            <span>Price basis (tax tier) — sets which pricelist price each item uses. Defaults from the salesman's project nature.</span>
            <select value={basis} onChange={e => setBasis(e.target.value)} style={fieldStyle}>
              {PRICE_BASES.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
          </label>
        )}
        {!salesMode && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
            <label style={labelStyle}><span>Factory warranty (years)</span>
              <input type="number" min="0" max="10" value={header.warranty_years ?? 1} onChange={e => setHdr('warranty_years', e.target.value)} style={fieldStyle} /></label>
            <label style={labelStyle}><span>Preventive maintenance (years)</span>
              <input type="number" min="0" max="10" value={header.pm_years ?? 1} onChange={e => setHdr('pm_years', e.target.value)} style={fieldStyle} /></label>
            <label style={labelStyle}><span>Visits per year</span>
              <input type="number" min="0" max="12" value={header.pm_visits_per_year ?? 1} onChange={e => setHdr('pm_visits_per_year', e.target.value)} style={fieldStyle} /></label>
          </div>
        )}
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
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg-primary)' }}>Total: <span className="t-num">{window.formatJOD ? window.formatJOD(grandTotal) : `JOD ${grandTotal.toFixed(2)}`}</span></div>
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
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'visible' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: salesMode ? '150px 150px 1fr 50px 70px 100px 100px 30px' : '200px 1fr 70px 120px 110px 30px',
            gap: 8, padding: '8px 10px', background: 'var(--neutral-25)',
            fontSize: 10.5, fontWeight: 700, color: 'var(--fg-tertiary)',
            textTransform: 'uppercase', letterSpacing: '0.04em',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <span>{salesMode ? 'Category' : 'Item (pick section → search)'}</span>{salesMode && <span>Model</span>}<span>Description</span>
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
                display: 'grid', gridTemplateColumns: salesMode ? '150px 150px 1fr 50px 70px 100px 100px 30px' : '200px 1fr 70px 120px 110px 30px',
                gap: 8, padding: '8px 10px',
                borderBottom: '1px solid var(--border-subtle)', alignItems: salesMode ? 'center' : 'flex-start',
              }}>
                {salesMode ? (
                  <span style={{ padding: '6px 8px', fontSize: 12, color: 'var(--fg-secondary)' }}>{it.category || '—'}</span>
                ) : (
                  <QuoteItemPicker bookId={bookId} value={it.model} onPick={sku => selectSku(i, sku)} sections={bookSections} />
                )}
                {salesMode && (
                  <span className="t-mono" style={{ padding: '6px 8px', fontSize: 11, color: 'var(--fg-secondary)' }}>{it.model || '—'}</span>
                )}
                <span style={{ padding: '6px 8px', fontSize: 12, color: 'var(--fg-primary)', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.35 }}>{it.description || '—'}</span>
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

      {/* VRF installation */}
      {!salesMode && (
        <div style={sectionStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: install.enabled ? 12 : 0 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!install.enabled} onChange={e => { installTouched.current = true; setInst({ enabled: e.target.checked }); }} style={{ width: 17, height: 17 }} />
              <span style={{ ...sectionTitle, marginBottom: 0 }}>VRF installation — copper network &amp; installation</span>
            </label>
            {install.enabled && installCalc && (
              <div style={{ fontSize: 14, fontWeight: 700 }}>Installation: <span className="t-num">{window.formatJOD ? window.formatJOD(installPrice) : `JOD ${installPrice.toFixed(2)}`}</span></div>
            )}
          </div>
          {!install.enabled && <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', marginTop: 6 }}>{hasVrf ? 'Tick to add the installation price (calculated like the offer file — from the number of indoor units, copper, options and city).' : 'Applies to VRF quotations. Add VRF items first.'}</div>}
          {install.enabled && (() => {
            const c = installCalc; const auto = (c && c.auto_counts) || {}; const b = (c && c.result.breakdown) || {};
            const num = (v, on, w = 90, ph = '0') => <input type="number" min="0" value={v} placeholder={ph} onChange={e => on(e.target.value)} style={{ ...fieldStyle, width: w, textAlign: 'right' }} />;
            const money = (n) => (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
            const countBox = (k, label) => (
              <label style={labelStyle} key={k}><span>{label}</span>
                {num(install.count_overrides[k] ?? '', v => setInst({ count_overrides: { ...install.count_overrides, [k]: v } }), 110, String(auto[k] ?? 0))}
              </label>);
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Unit counts <span style={{ fontWeight: 400, color: 'var(--fg-tertiary)' }}>— counted from the lines above; type only to override</span></div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                    {countBox('indoor', 'Indoor units')}{countBox('ducted', 'Ducted')}{countBox('cassette', 'Cassette')}{countBox('modules', 'Outdoor modules')}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Options</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <label style={labelStyle}><span>Insulation</span>
                      <select value={install.insulation} onChange={e => setInst({ insulation: e.target.value })} style={fieldStyle}><option>13mm</option><option>19mm</option></select></label>
                    <label style={labelStyle}><span>Shut-off valves</span>
                      <select value={install.valves ? 'yes' : 'no'} onChange={e => setInst({ valves: e.target.value === 'yes' })} style={fieldStyle}><option value="no">No</option><option value="yes">Yes</option></select></label>
                    <label style={labelStyle}><span>Cora cloth (qty)</span>{num(install.cora_qty, v => setInst({ cora_qty: v }), '100%')}</label>
                    <label style={labelStyle}><span>Cladding (qty)</span>{num(install.cladding_qty, v => setInst({ cladding_qty: v }), '100%')}</label>
                    <label style={labelStyle}><span>Cable tray (m)</span>{num(install.tray_qty, v => setInst({ tray_qty: v }), '100%')}</label>
                    <label style={labelStyle}><span>Cable tray type</span>
                      <select value={install.tray_type} onChange={e => setInst({ tray_type: e.target.value })} style={fieldStyle}>
                        {['1mm 1sys', '1mm 2sys', '1mm 3sys', '2mm 1sys', '2mm 2sys', '2mm 3sys'].map(t => <option key={t}>{t}</option>)}</select></label>
                    <label style={labelStyle}><span>Additional charge (qty × 16)</span>{num(install.additional_qty, v => setInst({ additional_qty: v }), '100%')}</label>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Copper pipes (metres) <span style={{ fontWeight: 400, color: 'var(--fg-tertiary)' }}>— leave empty to use the per-unit estimate</span></div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 14 }}>
                    {((c && c.result.copper_rows) || []).map(r => (
                      <label key={r.code} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
                        <span style={{ flex: 1, color: 'var(--fg-secondary)' }}>{r.label}</span>
                        {num(install.copper[r.code] ?? '', v => setInst({ copper: { ...install.copper, [r.code]: v } }), 64)}
                      </label>))}
                  </div>
                  <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden', fontSize: 12.5 }}>
                    {[['Installation labour' + (c ? ` (${c.result.counts.indoor} units × ${c.result.labour_rate})` : ''), b.labour, true],
                      ['Copper' + (c && c.result.copper_estimated ? ' (estimate per unit)' : c ? ` (${c.result.copper_metres} m incl. safety)` : ''), b.copper, true],
                      ['Shop drawings', b.shop_drawings, true], ['Insulation', b.insulation], ['Cora cloth', b.cora], ['Cladding', b.cladding],
                      ['Cable tray', b.cable_tray], ['Shut-off valves', b.valves],
                      ['Location extra' + (c && c.result.city ? ` (${c.result.city})` : ' (no city set)'), b.location, true],
                      ['Supervision / maintenance', b.supervision, true], ['Additional charge', b.additional]]
                      .filter(([, v, always]) => always || Number(v) > 0)
                      .map(([l, v]) => (
                        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 10px', borderBottom: '1px solid var(--border-subtle)' }}>
                          <span style={{ color: 'var(--fg-secondary)' }}>{l}</span><span className="t-num">{money(v)}</span></div>))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', fontWeight: 700, background: 'var(--neutral-25)' }}>
                      <span>Installation list price</span><span className="t-num">{money(c && c.result.price)}</span></div>
                    {discountFraction > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', fontWeight: 700 }}>
                        <span>After {Math.round(discountFraction * 100)}% discount</span><span className="t-num">{money(installPrice)}</span></div>)}
                  </div>
                </div>
              </div>);
          })()}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ ...sectionTitle, marginBottom: 0 }}>Copper for split system</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>Extra copper (metres)
              <input type="number" min="0" value={install.split_copper_m ?? ''} placeholder="0" onChange={e => setInst({ split_copper_m: e.target.value })} style={{ ...fieldStyle, width: 90, textAlign: 'right' }} /></label>
            {installCalc && installCalc.split_copper && installCalc.split_copper.metres > 0 && (
              <span style={{ fontSize: 12.5, color: 'var(--fg-secondary)' }}>{installCalc.split_copper.metres} m × {installCalc.split_copper.unit_price} = <b className="t-num">{installCalc.split_copper.price.toLocaleString()}</b>{discountFraction > 0 ? <> · net <b className="t-num">{installCalc.split_copper.net.toLocaleString()}</b></> : null}</span>)}
            <span style={{ fontSize: 11.5, color: 'var(--fg-tertiary)' }}>{/gree/i.test(header.brand || 'Gree') ? 'GREE split units come with an aluminium kit (4 m) inside the unit price — no free copper; only extra metres are charged.' : 'Free copper (3–4 m per unit) is inside the split unit price; only extra metres are charged.'}</span>
          </div>
        </div>
      )}

      {/* Notes + attachments */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>Internal · notes + attachments</div>
        <label style={labelStyle}>
          <span>Designer notes (internal — goes to the reviewer with the version)</span>
          <textarea value={designerNotes} onChange={e => setDesignerNotes(e.target.value)} rows={3}
            style={{ ...fieldStyle, resize: 'vertical', height: 'auto' }} />
        </label>
        <div style={{ marginTop: 12 }}>
          <div style={{ ...labelStyle, marginBottom: 6 }}><span>Attach files — your own quotation file (Excel / PDF), drawings, selections</span></div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 6, border: '1px dashed var(--img-orange)', color: 'var(--img-orange-700, #B8680E)', cursor: uploading ? 'wait' : 'pointer', fontSize: 12.5, fontWeight: 600, background: 'var(--bg-surface)' }}>
            {uploading ? 'Uploading…' : '⬆ Choose file(s)'}
            <input type="file" multiple onChange={onPickFiles} disabled={uploading} style={{ display: 'none' }} />
          </label>
          {(attachments.length > 0 || pendingFiles.length > 0) && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {attachments.map((f, i) => f && f.stored ? (
                <div key={'a' + i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: 'var(--neutral-25)', borderRadius: 5, fontSize: 12 }}>
                  <a href={`/api/quotation-versions/${draftId}/attachments/${i}?as=${window.api.userId()}`} target="_blank" rel="noopener" style={{ flex: 1, color: 'var(--fg-primary)' }}>📎 {f.name}</a>
                  <span style={{ color: 'var(--fg-tertiary)' }}>{f.size ? Math.round(f.size / 1024) + ' KB' : ''}</span>
                  <button onClick={() => removeAttachment(i)} title="Remove" style={{ border: 'none', background: 'transparent', color: 'var(--fg-tertiary)', cursor: 'pointer', fontSize: 14 }}>×</button>
                </div>) : null)}
              {pendingFiles.map((f, i) => (
                <div key={'p' + i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: 'var(--neutral-25)', borderRadius: 5, fontSize: 12 }}>
                  <span style={{ flex: 1 }}>📎 {f.name} <span style={{ color: 'var(--fg-tertiary)' }}>(uploads when you save)</span></span>
                  <button onClick={() => setPendingFiles(fs => fs.filter((_, j) => j !== i))}
                    style={{ border: 'none', background: 'transparent', color: 'var(--fg-tertiary)', cursor: 'pointer', fontSize: 14 }}>×</button>
                </div>
              ))}
            </div>
          )}
          {!salesMode && validItems.length === 0 && (
            <label style={{ ...labelStyle, marginTop: 12, maxWidth: 320 }}>
              <span>No line items — quotation total (JOD) from the attached file</span>
              <input type="number" min="0" value={manualTotal} onChange={e => setManualTotal(e.target.value)} placeholder="0" style={{ ...fieldStyle, textAlign: 'right' }} />
              <span style={{ fontSize: 11, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>Costing can only analyse line items — an uploaded quotation shows a total but no cost breakdown.</span>
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

// Search-as-you-type item picker for the quotation editor. Replaces the old
// group→family→model cascade (which dead-ended on GREE items that have no
// family). Picking a result auto-fills description + price via onPick(sku).
function QuoteItemPicker({ bookId, value, onPick, sections = [] }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');        // quotation-section fast-finder filter
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const wrap = useRef(null);
  const inputRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const t = setTimeout(() => {
      const qs = new URLSearchParams();
      if (bookId) qs.set('price_book_id', String(bookId));
      if (cat) qs.set('quote_section', cat);
      if (q.trim()) qs.set('search', q.trim());
      window.api.get('/product-skus?' + qs.toString())
        .then(r => setRows((r || []).slice(0, 60)))
        .catch(() => setRows([]))
        .finally(() => setLoading(false));
    }, 140);
    return () => clearTimeout(t);
  }, [q, cat, open, bookId]);
  useEffect(() => {
    const h = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  const cell = { padding: '6px 8px', fontSize: 12.5, border: '1px solid var(--border-default)', borderRadius: 5, background: 'var(--bg-surface)', width: '100%', boxSizing: 'border-box', outline: 'none' };
  return (
    <div ref={wrap} style={{ position: 'relative' }}>
      {/* Step 1: pick a category to narrow. Step 2: search within it. */}
      <select value={cat} onChange={e => { setCat(e.target.value); setOpen(true); setTimeout(() => inputRef.current && inputRef.current.focus(), 0); }}
        style={{ ...cell, fontSize: 11.5, marginBottom: 4, cursor: 'pointer', color: cat ? 'var(--fg-primary)' : 'var(--fg-tertiary)' }} title="Filter items by section to find them faster">
        <option value="">All sections</option>
        {sections.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <input ref={inputRef} value={open ? q : (value || q)} placeholder={cat ? `Search in ${cat}…` : 'Search model / code / description…'}
        onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => { setQ(''); setOpen(true); }}
        style={{ ...cell, fontFamily: 'inherit' }} />
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 3px)', left: 0, zIndex: 60, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, boxShadow: 'var(--shadow-lg, 0 10px 30px rgba(0,0,0,.16))', maxHeight: 460, overflowY: 'auto', width: 460, maxWidth: '80vw' }}>
          {loading && rows.length === 0 && <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--fg-tertiary)' }}>Searching…</div>}
          {!loading && rows.length === 0 && <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--fg-tertiary)' }}>No items{cat ? ` in ${cat}` : ''}{q ? ` matching “${q}”` : ''}.</div>}
          {rows.length > 0 && <div style={{ padding: '5px 10px', fontSize: 10.5, color: 'var(--fg-tertiary)', borderBottom: '1px solid var(--border-subtle)', position: 'sticky', top: 0, background: 'var(--bg-surface)' }}>{rows.length} item{rows.length === 1 ? '' : 's'}{cat ? ` · ${cat}` : ''}</div>}
          {rows.map(r => {
            const ph = /phased/i.test(r.status || '');
            return (
              <button key={r.id} type="button" disabled={ph}
                onClick={() => { onPick(r); setOpen(false); setQ(''); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 11px', border: 'none', borderTop: '1px solid var(--border-subtle)', background: 'transparent', cursor: ph ? 'not-allowed' : 'pointer', opacity: ph ? 0.55 : 1, fontSize: 12 }}
                onMouseEnter={e => { if (!ph) e.currentTarget.style.background = 'var(--bg-hover, #f5f5f5)'; }}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div>
                  <span className="t-mono" style={{ fontWeight: 700 }}>{r.model}</span>
                  {r.erp_code ? <span style={{ color: 'var(--fg-tertiary)' }}> · {r.erp_code}</span> : null}
                  {r.quote_section ? <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, color: 'var(--img-orange-700, #B8680E)', background: 'var(--img-orange-50, #FFF7EE)', borderRadius: 4, padding: '0 5px' }}>{r.quote_section}</span> : null}
                  {ph && <span style={{ color: 'var(--color-danger)', marginLeft: 6, fontWeight: 700 }}>PHASED OUT</span>}
                </div>
                {r.description ? <div style={{ fontSize: 11, color: 'var(--fg-secondary)', marginTop: 2, lineHeight: 1.35, whiteSpace: 'normal' }}>{r.description}</div> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Provide a lightweight formatJOD if formatters file isn't loaded.
if (!window.formatJOD) window.formatJOD = (n) => `JOD ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

ReactDOM.createRoot(document.getElementById('root')).render(<QuotationEditor />);
