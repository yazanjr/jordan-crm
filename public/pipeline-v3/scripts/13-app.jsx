// Pipeline app — orchestrates the existing components (Sidebar, TopBar, Toolbar,
// Kanban, Table, DealDetail, Dashboard) and ALL the pop-up windows.

const { useState, useMemo, useEffect, useCallback } = React;

// Stages where the salesman cannot freely move cards in/out. Dropping a card
// INTO a locked stage opens a workflow modal (the Request Design form for
// 'lead'); moving OUT happens only via the dedicated server-side action
// (Sally's release for Design/Redesign).
const LOCKED_STAGES = new Set(['lead']);

// Map a row from GET /api/opportunities to the window.DEALS shape that the rest
// of pipeline-v3 expects. Added in B.1 — preserves every field name so downstream
// components (Kanban, DealDetail, popups) need no changes. `dbId` is added as the
// raw integer for future API calls (drag-to-update, edit, close).
function adaptOppFromApi(row) {
  // Stage stays the REAL pipeline stage regardless of status — a Won deal still
  // lives in (say) 'closing'. The Kanban hides non-Active deals by default; the
  // Status filter reveals them in their real stage column.
  const finalStage = String(row.stage || '').toLowerCase();
  const status = row.status || 'Active';
  const owner = window.findUserByFirstName
    ? window.findUserByFirstName(row.salesman_name)
    : null;
  return {
    id:           `OPP-${row.id}`,
    dbId:         row.id,
    name:         row.title,
    account:      row.owner_name || row.org_name || '',
    orgId:        row.org_id || null,                 // raw integer (Phase 2 convention)
    contactId:    row.contact_id || null,
    contactName:  row.contact_name || '',
    value:        row.expected_value || 0,
    stage:        finalStage,
    status,
    owner:        owner ? owner.name : (row.salesman_name || ''),
    ownerId:      owner ? owner.id   : null,
    probability:  (window.STAGE_PROBABILITY || {})[finalStage] ?? 0,
    scope:        row.product_group || null,
    closeDate:    row.close_date    || null,
    closeQuarter: null,
    age:          row.created_at ? Math.floor((Date.now() - new Date(row.created_at).getTime()) / 86400000) : 0,
    segment:      row.segment    || null,
    source:       row.source     || null,
    district:     row.district   || null,
    engOffice:    row.eng_office || null,
    contractor:   row.contractor || null,
    discount:     row.discount_pct || 0,
    notes:        row.notes        || '',
    // Excel-parity columns.
    nextAction:        row.next_action       || '',
    remarks:           row.remarks           || '',
    system:            row.system            || null,
    subSystem:         row.sub_system        || null,
    brand:             row.brand             || null,
    signingPrice:      row.signing_price     || null,
    ownerRep:          row.owner_rep         || '',
    personResponsible: row.person_responsible || '',
    installationBy:    row.installation_by   || '',
    expectedClosing:   row.expected_closing  || '',
    salesTax:          row.sales_tax         || 0,
    priceExempted:     row.price_exempted    || null,
    lostNotes:         row.lost_notes        || '',
    lostToWhom:        row.lost_to_whom      || '',
    // Enriched only on GET /:id — the 4 role-contacts on this deal.
    contacts:     row.contacts || undefined,
  };
}

function PipelineApp() {
  const { Briefcase, Trend, Import, Zap, Bell, Search, ChevDown, Plus, Layers, Eye, Check, Kanban, Table, More } = window.Icons;

  // ---- Core state ----
  const [deals, setDeals] = useState(window.DEALS);
  const [activeNav, setActiveNav] = useState('pipeline');
  const [view, setView] = useState('kanban');
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [search, setSearch] = useState('');
  const [cardVariant, setCardVariant] = useState('standard');

  // ---- Table column config (visible columns + custom header labels) ----
  const [tableConfig, setTableConfig] = useState(() =>
    (window.loadTableConfig ? window.loadTableConfig() : { columns: [], labels: {} })
  );
  const setTableColumns = useCallback((columns) => {
    setTableConfig(cfg => {
      const next = { ...cfg, columns };
      window.saveTableConfig?.(next);
      return next;
    });
  }, []);
  const renameTableColumn = useCallback((key, label) => {
    setTableConfig(cfg => {
      const next = { ...cfg, labels: { ...cfg.labels, [key]: label } };
      window.saveTableConfig?.(next);
      return next;
    });
  }, []);
  const resizeTableColumn = useCallback((key, width) => {
    setTableConfig(cfg => {
      const next = { ...cfg, widths: { ...(cfg.widths || {}), [key]: width } };
      window.saveTableConfig?.(next);
      return next;
    });
  }, []);
  const resetTableConfig = useCallback(() => {
    setTableConfig(window.resetTableConfig ? window.resetTableConfig() : { columns: [], labels: {} });
  }, []);

  // ---- Filter / group / person ----
  const [filters, setFilters] = useState({});
  const [groupBy, setGroupBy] = useState(null);
  const [person, setPerson] = useState(null);

  // ---- Modal stack ----
  const [modal, setModal] = useState(null); // { kind, props }
  const openModal = (kind, props = {}) => setModal({ kind, props });
  const closeModal = () => setModal(null);

  // ---- Popover stack ----
  const [popover, setPopover] = useState(null); // { kind, anchorRect, props }
  const openPop = (kind, anchorRect, props = {}) => setPopover({ kind, anchorRect, props });
  const closePop = () => setPopover(null);

  // ---- Toast ----
  const [toast, setToast] = useState(null);
  const fireToast = useCallback((msg, opts = {}) => setToast({ msg, ...opts }), []);

  // ---- Quick add ----
  const [quickAddStage, setQuickAddStage] = useState(null);

  // ---- Design integration ----
  // Map opp title → DB id. Loaded once so we can call /api/design-board/by-opportunity/:dbId.
  const [oppDbMap, setOppDbMap] = useState({});                // { 'Abdali Mall HVAC System': 5, ... }
  const [designByOpp, setDesignByOpp] = useState({});           // { 5: [request, ...] }
  // Lightweight status map keyed by DB opp_id, used to put badges on every kanban card.
  // { 5: { design_stage, version, designer_name, latest_quote_status, has_released } }
  const [designStatusMap, setDesignStatusMap] = useState({});

  const reloadStatusMap = useCallback(() => {
    window.api.get('/design-status-map')
      .then(setDesignStatusMap)
      .catch(() => { /* offline — okay, no badges */ });
  }, []);

  useEffect(() => {
    window.api.get('/design-board/opportunity-map')
      .then(rows => {
        const m = {};
        rows.forEach(r => { m[r.title] = r.id; });
        setOppDbMap(m);
      })
      .catch(() => { /* offline / unauthorized — okay, badges just won't show */ });
    reloadStatusMap();
    // Preload all design requests, keyed by opp id, so the deal-detail drawer
    // doesn't have to wait for a per-click round-trip before showing the
    // "Request modification" button. Per-click refresh still runs as a safety.
    window.api.get('/design-board/by-opportunity')
      .then(byOpp => { if (byOpp && typeof byOpp === 'object') setDesignByOpp(byOpp); })
      .catch(() => { /* offline / unauthorized — okay, fall back to per-click load */ });
    // Refresh window.PRODUCT_GROUPS from the DB so the New Deal modal stays current.
    if (typeof window.loadProductGroups === 'function') window.loadProductGroups();
  }, [reloadStatusMap]);

  // ---- Load the real user roster (shared with every pipeline-v3 page) ----
  // window.loadRealUsers (00c-user-context.jsx) replaces the demo USERS array and
  // resolves CURRENT_USER; bumping usersReady forces the sidebar to re-render.
  const [usersReady, setUsersReady] = useState(false);
  useEffect(() => {
    window.loadRealUsers().then(ok => { if (ok) setUsersReady(true); });
  }, []);

  // ---- Load real contacts + organizations from the API ----
  // Replaces the hardcoded demo arrays in 14-contacts-data.jsx. ids are kept as
  // RAW INTEGERS (not the demo 'ORGxxx'/'Cxxx' form) so they match the integer
  // ids the opportunities API returns.
  const [contactsReady, setContactsReady] = useState(false);
  useEffect(() => {
    Promise.all([
      window.api.get('/contacts').catch(() => null),
      window.api.get('/organizations').catch(() => null),
      window.api.get('/opportunities/meta/areas').catch(() => null),
    ]).then(([contacts, orgs, areas]) => {
      if (Array.isArray(areas)) window.AREAS = areas;
      if (Array.isArray(orgs)) {
        window.ORGANIZATIONS = orgs.map(o => ({
          id: o.id, name: o.name, type: o.type || '', dbId: o.id,
        }));
      }
      if (Array.isArray(contacts)) {
        window.CONTACTS = contacts.map(c => ({
          id:       c.id,
          dbId:     c.id,
          name:     c.name,
          orgId:    c.organization_id || null,
          company:  c.org_name || '',
          phones:   Array.isArray(c.phones) ? c.phones : [],
          emails:   Array.isArray(c.emails) ? c.emails : [],
          phone:    (Array.isArray(c.phones) && c.phones[0]) || '',
          email:    (Array.isArray(c.emails) && c.emails[0]) || '',
          notes:    c.notes || '',
          role:     '',          // role is now per-deal (deal_contacts), not per-contact
          primary:  false,
          status:   'active',
          tags:     [],
          is_blacklisted:    c.is_blacklisted || 0,            // Phase 6
          blacklist_reason:  c.blacklist_reason || null,
        }));
        window.findContactById = (id) => window.CONTACTS.find(c => c.id === id) || null;
        setContactsReady(true);
        console.log(`Pipeline: loaded ${window.CONTACTS.length} contacts + ${(window.ORGANIZATIONS||[]).length} organizations from API`);
      }
    });
  }, []);

  // ---- Live notifications via socket.io (C.4) ----
  // The server emits 'notification' events to user:<id> rooms; we join our room
  // and surface each as a toast. Re-runs when usersReady flips so we join with
  // the real user id, not the demo fallback.
  useEffect(() => {
    if (typeof window.io !== 'function') return;
    const socket = window.io();
    const join = () => {
      const uid = window.CURRENT_USER && window.CURRENT_USER.dbId;
      if (uid) socket.emit('join', uid);
    };
    socket.on('connect', join);
    socket.on('notification', (n) => { if (n && n.message) fireToast(n.message); });
    return () => socket.disconnect();
  }, [usersReady, fireToast]);

  // ---- Load opportunities from the API (B.1: replaces hardcoded window.DEALS) ----
  // On success the demo deals are replaced with real DB rows mapped to the same
  // shape. On failure (API down, network error) we keep the demo data so the page
  // still renders for offline development.
  useEffect(() => {
    window.api.get('/opportunities')
      .then(rows => {
        const mapped = (rows || []).map(adaptOppFromApi);
        setDeals(mapped);
        console.log(`Pipeline: loaded ${mapped.length} opportunities from API`);
      })
      .catch(err => {
        console.warn('Pipeline: failed to load /api/opportunities — keeping demo data.', err);
      });
  }, []);

  // Helper: look up the status badge data for a deal using oppDbMap → designStatusMap.
  const designStatusFor = useCallback((deal) => {
    if (!deal) return null;
    const dbId = oppDbMap[deal.name];
    return dbId ? (designStatusMap[dbId] || null) : null;
  }, [oppDbMap, designStatusMap]);

  // Fetch design requests for the selected deal whenever it changes.
  useEffect(() => {
    if (!selectedDeal) return;
    const dbId = oppDbMap[selectedDeal.name];
    if (!dbId) return;
    window.api.get(`/design-board/by-opportunity/${dbId}`)
      .then(reqs => setDesignByOpp(m => ({ ...m, [dbId]: reqs })))
      .catch(() => {});
  }, [selectedDeal, oppDbMap]);

  // Fetch the enriched deal (incl. its 4 role-contacts) when one is opened.
  // The list endpoint doesn't include `contacts` — only GET /:id does.
  useEffect(() => {
    if (!selectedDeal || !selectedDeal.dbId) return;
    if (selectedDeal.contacts) return;            // already enriched
    window.api.get(`/opportunities/${selectedDeal.dbId}`)
      .then(full => {
        if (!full) return;
        setSelectedDeal(sd => (sd && sd.dbId === full.id)
          ? { ...sd, contacts: full.contacts || [], history: full.history || [], events: full.events || [] }
          : sd);
      })
      .catch(() => {});
  }, [selectedDeal]);

  const reloadDesignForDeal = useCallback((deal) => {
    const dbId = oppDbMap[deal.name];
    if (!dbId) return;
    window.api.get(`/design-board/by-opportunity/${dbId}`)
      .then(reqs => setDesignByOpp(m => ({ ...m, [dbId]: reqs })))
      .catch(() => {});
  }, [oppDbMap]);

  const designForDeal = (deal) => {
    if (!deal) return [];
    const dbId = oppDbMap[deal.name];
    return dbId ? (designByOpp[dbId] || []) : [];
  };

  // ---- Module visibility (for Tweaks: show/hide modules) ----
  const DEFAULT_MODULES = /*EDITMODE-BEGIN*/{
    "showSavedViews": true,
    "showImport": true,
    "showAutomate": false,
    "showInvite": false,
    "showCommandPalette": false,
    "showProbabilityBadge": true,
    "showColumnTotals": true,
    "showBreadcrumbs": false,
    "showActivityFeed": true,
    "showFilesSection": true
  }/*EDITMODE-END*/;
  const [modules, setModules] = useState(DEFAULT_MODULES);

  // ---- Tweaks panel visibility ----
  const [tweaksOpen, setTweaksOpen] = useState(false);
  useEffect(() => {
    const onMsg = (e) => {
      if (!e.data) return;
      if (e.data.type === '__activate_edit_mode') setTweaksOpen(true);
      if (e.data.type === '__deactivate_edit_mode') setTweaksOpen(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);
  const setModule = (k, v) => {
    setModules(m => {
      const next = { ...m, [k]: v };
      window.parent.postMessage({ type: '__edit_mode_set_keys', edits: next }, '*');
      return next;
    });
  };

  // ---- Cmd-K command palette ----
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    if (!modules.showCommandPalette) return;
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setPaletteOpen(p => !p); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modules.showCommandPalette]);

  // ---- Filter option lists, derived from the loaded deals ----
  // Each of the 8 filters offers exactly the values that actually occur in the data.
  const FILTER_KEYS = ['district', 'status', 'stage', 'system', 'subSystem', 'brand', 'installationBy', 'segment'];
  const filterOptions = useMemo(() => {
    const out = {};
    FILTER_KEYS.forEach(k => {
      if (k === 'stage') { out[k] = (window.STAGE_ORDER || []).slice(); return; }
      if (k === 'district') { out[k] = (window.AREAS || []).slice(); return; }  // curated Project Location list
      const seen = new Set();
      deals.forEach(d => { const v = d[k]; if (v != null && v !== '') seen.add(v); });
      out[k] = [...seen].sort((a, b) => String(a).localeCompare(String(b)));
    });
    return out;
  }, [deals, contactsReady]);

  // ---- Filtering pipeline ----
  const filteredDeals = useMemo(() => {
    let list = deals;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d =>
        (d.name || '').toLowerCase().includes(q) ||
        (d.account || '').toLowerCase().includes(q) ||
        (d.id || '').toLowerCase().includes(q) ||
        (d.owner || '').toLowerCase().includes(q)
      );
    }
    if (person) list = list.filter(d => d.owner === person);
    FILTER_KEYS.forEach(k => {
      if (filters[k]?.length) list = list.filter(d => filters[k].includes(d[k]));
    });
    return list;
  }, [deals, search, person, filters]);

  // The Kanban shows only Active deals by default; selecting a Status value reveals
  // Won / Lost / On-Hold / De-Prioritized. The Table always shows everything.
  const kanbanDeals = useMemo(() => (
    filters.status?.length ? filteredDeals : filteredDeals.filter(d => d.status === 'Active')
  ), [filteredDeals, filters.status]);

  const filterCount = FILTER_KEYS.reduce((sum, k) => sum + (filters[k]?.length || 0), 0);
  const groupByLabel = ({ stage: 'Stage', owner: 'Owner', scope: 'Scope', closeMonth: 'Month' })[groupBy];

  // ---- Update deal (used by inline-edit on board, table, + detail drawer) ----
  // Optimistically updates local state, then persists to the API. On failure the
  // optimistic change is reverted and a danger toast is shown. Demo fallback rows
  // (no dbId) update locally only — there is nothing to persist them to.
  // ---- Move a deal's stage and persist via POST /opportunities/:id/stage ----
  // Used by the Kanban drag, the stage picker, and the "advance" button. Backward
  // moves are allowed; the backend still gates Tender behind a released quotation.
  const updateStage = useCallback((id, newStage, reason) => {
    const prev = deals.find(d => d.id === id);
    if (!prev || prev.stage === newStage) return;

    // A backward move must carry a reason (that's where the diagnostic signal is).
    // Forward advances need none. Prompt on regress; abort if the user cancels.
    const order = window.STAGE_ORDER || [];
    const isRegress = order.indexOf(newStage) >= 0 && order.indexOf(prev.stage) >= 0 && order.indexOf(newStage) < order.indexOf(prev.stage);
    if (isRegress && !reason) {
      const r = window.prompt(`Moving "${prev.name}" back to ${window.STAGE_META[newStage]?.label || newStage}.\nWhy is it moving backward? (required)`);
      if (r == null || !r.trim()) return;   // cancelled — no move at all
      reason = r.trim();
    }

    setDeals(ds => ds.map(d => d.id === id ? { ...d, stage: newStage } : d));
    setSelectedDeal(sd => sd && sd.id === id ? { ...sd, stage: newStage } : sd);

    if (!prev.dbId) return;  // demo row — local only

    // Frontend stage is lowercase; the API's STAGES array is TitleCase.
    const toStage = newStage.charAt(0).toUpperCase() + newStage.slice(1);
    window.api.post(`/opportunities/${prev.dbId}/stage`, { to_stage: toStage, reason: reason || undefined })
      .then(() => {
        // Phase 5 — success toast with Undo for stage moves.
        fireToast(`Moved → ${window.STAGE_META[newStage]?.label || newStage}`, {
          action: { label: 'Undo', onClick: () => updateStage(id, prev.stage) },
        });
      })
      .catch(err => {
        setDeals(ds => ds.map(d => d.id === id ? prev : d));
        setSelectedDeal(sd => sd && sd.id === id ? prev : sd);
        fireToast(err?.data?.error || err?.message || 'Stage change failed — reverted', { danger: true });
      });
  }, [deals, fireToast]);

  const updateDeal = useCallback((id, patch) => {
    const prev = deals.find(d => d.id === id);
    setDeals(ds => ds.map(d => d.id === id ? { ...d, ...patch } : d));
    setSelectedDeal(sd => sd && sd.id === id ? { ...sd, ...patch } : sd);

    if (!prev || !prev.dbId) return;  // demo row — local only

    // NOTE: avoid object-rest ({stage, ...rest}) here — Babel-standalone compiles
    // it to a top-level `const _excluded`, which collides with the same helper in
    // 01-icons.jsx and makes this whole script silently fail to execute.
    const stage = patch.stage;
    const rest = Object.assign({}, patch);
    delete rest.stage;
    const apiPatch = window.toApiPatch ? window.toApiPatch(rest) : rest;
    if (stage && Object.keys(apiPatch).length === 0) {
      // Stage-only change → dedicated stage endpoint.
      updateStage(id, stage);
      return;
    }
    if (Object.keys(apiPatch).length === 0) return;

    window.api.put(`/opportunities/${prev.dbId}`, apiPatch)
      .then(() => {
        // Phase 5 — success toast with Undo. Build the inverse patch from `prev`
        // so clicking Undo restores every changed field to its prior value.
        const inverse = {};
        Object.keys(rest).forEach(k => { inverse[k] = prev[k]; });
        if (Object.keys(inverse).length) {
          fireToast('Saved', { action: { label: 'Undo', onClick: () => updateDeal(id, inverse) } });
        }
      })
      .catch(err => {
        // Revert the optimistic update.
        setDeals(ds => ds.map(d => d.id === id ? prev : d));
        setSelectedDeal(sd => sd && sd.id === id ? prev : sd);
        fireToast(err?.status === 403 ? 'You can only edit your own deals' : 'Save failed — change reverted', { danger: true });
      });
  }, [deals, fireToast, updateStage]);

  // ---- Action handlers ----
  const handleAdvance = (deal) => {
    const order = window.STAGE_ORDER;
    const i = order.indexOf(deal.stage);
    if (i < 0) return;
    if (i === order.length - 1) {
      // Already at Closing → open the Close-deal modal (Won / Lost).
      openModal('closeDeal', { deal });
    } else {
      updateStage(deal.id, order[i + 1]);
    }
  };

  const handleCardAction = (action, deal) => {
    if (action === 'delete') {
      // Phase 5 — soft delete with a 10-second undo window.
      // The row is hidden locally immediately; the actual DELETE is scheduled, and
      // clicking Undo cancels the timer + restores the row before it ever hits the API.
      const prev = deal;
      setDeals(ds => ds.filter(d => d.id !== deal.id));
      if (selectedDeal && selectedDeal.id === deal.id) setSelectedDeal(null);
      const timer = setTimeout(() => {
        if (prev.dbId) window.api.del(`/opportunities/${prev.dbId}`).catch(() => {});
      }, 10000);
      fireToast(`"${deal.name}" deleted`, {
        action: { label: 'Undo', onClick: () => {
          clearTimeout(timer);
          setDeals(ds => ds.some(d => d.id === prev.id) ? ds : [prev, ...ds]);
        } },
        duration: 10000,
      });
    } else if (action === 'won') {
      openModal('closeDeal', { deal, outcome: 'Won' });
    } else if (action === 'lost') {
      openModal('closeDeal', { deal, outcome: 'Lost' });
    } else if (action === 'email') {
      fireToast(`Drafting email for ${deal.name}…`);
    } else if (action === 'call') {
      fireToast(`Logging call for ${deal.name}…`);
    } else if (action === 'quote') {
      fireToast(`Creating quotation from ${deal.id}…`);
    } else if (action === 'schedule') {
      fireToast(`Schedule activity on ${deal.name}…`);
    }
  };

  // ---- Top-right toolbar buttons (gated by modules) ----
  const tbBtn = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '6px 10px', height: 30, borderRadius: 6,
    background: 'transparent', color: 'var(--fg-primary)', border: 'none',
    fontSize: 13, fontWeight: 500, cursor: 'pointer',
  };

  const topRight = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {/* Search — moved up into the title bar */}
      <div style={{ position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-tertiary)' }} />
        <input value={search ?? ''} onChange={e => setSearch(e.target.value)} placeholder="Search"
          style={{ height: 32, padding: '0 10px 0 28px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', borderRadius: 7, fontSize: 13, width: 160, color: 'var(--fg-primary)', outline: 'none', fontFamily: 'inherit' }} />
      </div>

      {/* View switch */}
      <div style={{ display: 'inline-flex', padding: 2, borderRadius: 8, background: 'var(--neutral-100)', gap: 2 }}>
        {[{ id: 'kanban', label: 'Kanban', icon: Kanban }, { id: 'table', label: 'Table', icon: Table }].map(v => {
          const isActive = view === v.id;
          return (
            <button key={v.id} onClick={() => setView(v.id)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', height: 26, borderRadius: 6, border: 'none',
              background: isActive ? 'var(--bg-surface)' : 'transparent', color: isActive ? 'var(--fg-primary)' : 'var(--fg-secondary)',
              fontSize: 12, fontWeight: isActive ? 600 : 500, cursor: 'pointer', boxShadow: isActive ? 'var(--shadow-xs)' : 'none',
            }}><v.icon size={14} /> {v.label}</button>
          );
        })}
      </div>

      {/* Discount-approval inbox — sales managers + admins only. */}
      {['Sales Manager', 'Admin'].includes(window.CURRENT_USER?.role) && (
        <button style={tbBtn}
          onClick={e => openPop('approvalinbox', e.currentTarget.getBoundingClientRect())}
          onMouseEnter={e => e.currentTarget.style.background='var(--bg-hover)'}
          onMouseLeave={e => e.currentTarget.style.background='transparent'}>
          <Check size={14} /> Approvals
        </button>
      )}
      {modules.showImport && <button style={tbBtn} onClick={() => openModal('import')} onMouseEnter={e => e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.background='transparent'}><Import size={14} /> Import</button>}
      <button style={tbBtn} title="More options" onClick={e => openPop('toolbarmore', e.currentTarget.getBoundingClientRect())}
        onMouseEnter={e => e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
        <More size={16} />
      </button>

      {/* New deal — primary action, moved up into the title bar */}
      <button onClick={() => openModal('newdeal')} style={{
        display: 'inline-flex', alignItems: 'center', height: 32,
        background: 'var(--img-orange)', color: '#fff', border: 'none',
        borderRadius: 999, paddingLeft: 14, paddingRight: 4, fontWeight: 600, fontSize: 13,
        cursor: 'pointer', boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.08)',
      }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--img-orange-600)'}
        onMouseLeave={e => e.currentTarget.style.background = 'var(--img-orange)'}>
        New deal
        <span style={{ marginLeft: 10, width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <ChevDown size={14} />
        </span>
      </button>
    </div>
  );

  return (
    <>
      <window.TopNav
        active={activeNav}
        onNav={(id) => {
          if (id === 'contacts')     { window.location.href = 'Contacts.html'; return; }
          if (id === 'reports')      { window.location.href = 'Reports.html'; return; }
          if (id === 'diagnostics')  { window.location.href = 'Diagnostics.html'; return; }
          if (id === 'design-board') { window.location.href = 'DesignBoard.html'; return; }
          if (id === 'my-tasks')     { window.location.href = 'MyTasks.html'; return; }
          if (id === 'pricelist')    { window.location.href = 'Pricelist.html'; return; }
          if (id === 'costing')      { window.location.href = 'QuotationCosting.html'; return; }
          setActiveNav(id);
        }}
        onUserMenu={(rect) => openPop('user', rect)}
        onNotifications={(rect) => openPop('notif', rect)}
      />

      <main style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <window.TopBar
          title="Pipeline"
          tabs={[]}
          right={topRight}
          showBreadcrumb={modules.showBreadcrumbs}
        />

        {/* ONE scroll surface. The filter cards live INSIDE it so they scroll
            away; the board's stage headers pin to the top instead. New deal,
            search and the view switch now live up in the title bar. */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <window.FilterPanel
            filterKeys={FILTER_KEYS}
            filterOptions={filterOptions}
            filters={filters}
            setFilters={setFilters}
            person={person}
            setPerson={setPerson}
            deals={deals}
          />

          {/* Board sticks to the top of the surface: once the toolbar + filters
              scroll away, the stage headers freeze here and the cards scroll
              inside each column. Horizontal scroll stays for the columns. */}
          <div style={{ position: 'sticky', top: 0, zIndex: 5, overflowX: 'auto', background: 'var(--neutral-50)' }}>
          {view === 'kanban' ? (
          <window.KanbanBoard
            deals={kanbanDeals}
            setDeals={setDeals}
            onSelectDeal={setSelectedDeal}
            onUpdateDeal={updateDeal}
            onStageChange={updateStage}
            cardVariant={cardVariant}
            designStatusFor={designStatusFor}
            lockedStages={LOCKED_STAGES}
            onInterceptDropInto={(stage, deal) => openModal('requestDesign', { deal })}
            onColumnMenu={(stage, rect) => openPop('column', rect, { stage })}
            onCardMenu={(deal, rect) => openPop('cardmenu', rect, { deal })}
            quickAddStage={quickAddStage}
            onStartQuickAdd={setQuickAddStage}
            onCancelQuickAdd={() => setQuickAddStage(null)}
            onQuickAdd={(d) => {
              const nextNum = (window.DEALS || []).length + 1;
              const newId = 'OPP' + String(nextNum + 100).padStart(3, '0');
              const me = window.CURRENT_USER;
              setDeals(ds => [{
                id: newId, name: d.name, account: d.account, value: d.value, stage: d.stage,
                owner: me ? me.name : '', ownerId: me ? me.id : null,
                probability: window.STAGE_PROBABILITY[d.stage] ?? 10,
                scope: window.PRODUCT_GROUPS[0],
                closeDate: null, age: 0,
              }, ...ds]);
              setQuickAddStage(null);
              fireToast(`Added "${d.name}" to ${window.STAGE_META[d.stage].label}`);
            }}
          />
        ) : (
          <window.DealsTable
            deals={filteredDeals}
            onSelectDeal={setSelectedDeal}
            onStageClick={(deal, rect) => openPop('stagepicker', rect, { deal })}
            onUpdateDeal={updateDeal}
            columns={tableConfig.columns}
            labels={tableConfig.labels}
            widths={tableConfig.widths}
            onRenameColumn={renameTableColumn}
            onResizeColumn={resizeTableColumn}
          />
          )}
          </div>
        </div>
      </main>

      {selectedDeal && (
        <window.DealDetail
          deal={selectedDeal}
          onClose={() => setSelectedDeal(null)}
          onAdvance={handleAdvance}
          onMore={(deal, rect) => openPop('cardmenu', rect, { deal })}
          onUpdate={(patch) => updateDeal(selectedDeal.id, patch)}
          designRequests={designForDeal(selectedDeal)}
          onRefreshDesign={() => reloadDesignForDeal(selectedDeal)}
          onRequestDesign={() => openModal('requestDesign', { deal: selectedDeal })}
          onRequestModification={(priorRequestId) => openModal('requestModification', { deal: selectedDeal, priorRequestId })}
          onAction={(a, payload) => {
            if (a === 'quote')      fireToast(`Creating quotation from ${selectedDeal.id}…`);
            else if (a === 'email') fireToast(`Drafting email to ${payload?.name || 'contact'}…`);
            else if (a === 'call')  fireToast(`Logging call with ${payload?.name || 'contact'}…`);
            else if (a === 'closeWon')      openModal('closeDeal', { deal: selectedDeal, outcome: 'Won' });
            else if (a === 'closeLost')     openModal('closeDeal', { deal: selectedDeal, outcome: 'Lost' });
            else if (a === 'applyDiscount') openModal('applyDiscount', { deal: selectedDeal });
            else if (a === 'openContact' && payload?.id) {
              window.location.href = `Contacts.html?contact=${payload.id}`;
            }
            else if (a === 'addContact') openModal('addDealContact', {
              dealDbId: selectedDeal.dbId,
              dealName: selectedDeal.name,
              onAdded: () => {
                // Re-fetch the enriched deal so the new link shows immediately.
                window.api.get(`/opportunities/${selectedDeal.dbId}`)
                  .then(full => full && setSelectedDeal(sd => sd && sd.dbId === full.id
                    ? { ...sd, contacts: full.contacts || [], events: full.events || [] } : sd))
                  .catch(() => {});
                closeModal();
              },
            });
          }}
          showActivity={modules.showActivityFeed}
          showFiles={modules.showFilesSection}
        />
      )}

      {/* ============== MODALS ============== */}
      {modal?.kind === 'newdeal' && (
        <window.NewDealModal
          onClose={closeModal}
          onSubmit={async (data) => {
            // Real persistence: create org/contact/area as needed, then the deal.
            try {
              const fired = [];
              // 1) Organization — reuse the picked one, else create it.
              let org_id = data.orgId;
              if (!org_id && data.account && data.account.trim()) {
                const r = await window.api.post('/organizations', { name: data.account.trim(), type: 'Customer' });
                org_id = r.id; fired.push(`account "${data.account.trim()}"`);
              }
              // 2) Contact — reuse the picked one, else create it.
              let contact_id = data.contactId;
              if (!contact_id && data.contactName && data.contactName.trim()) {
                const r = await window.api.post('/contacts', {
                  name: data.contactName.trim(),
                  emails: data.contactEmail ? [data.contactEmail] : [],
                  phones: data.contactPhone ? [data.contactPhone] : [],
                  organization_id: org_id || null,
                });
                contact_id = r.id; fired.push(`contact "${data.contactName.trim()}"`);
              }
              // 3) Project location — persist a newly-typed area (search-or-create).
              const area = (data.district || '').trim();
              if (area && !(window.AREAS || []).includes(area)) {
                const r = await window.api.post('/opportunities/meta/areas', { name: area }).catch(() => null);
                if (r && Array.isArray(r.areas)) window.AREAS = r.areas;
                fired.push(`area "${area}"`);
              }
              // 4) The opportunity itself (defaults to Prospect server-side).
              const ownerUser = (window.USERS || []).find(u => u.name === data.owner);
              const created = await window.api.post('/opportunities', {
                title: data.name,
                salesman_id: ownerUser ? ownerUser.dbId : undefined,
                product_group: data.scope || null,
                district: area || null,
                expected_value: +data.value || 0,
                close_date: data.closeDate || null,
                contact_id: contact_id || null,
                org_id: org_id || null,
              });
              // 5) Move to the chosen stage if it isn't Prospect.
              const stg = (data.stage || 'prospect');
              const stageCap = stg.charAt(0).toUpperCase() + stg.slice(1);
              if (created && created.id && stageCap !== 'Prospect') {
                await window.api.post(`/opportunities/${created.id}/stage`, { to_stage: stageCap }).catch(() => {});
              }
              // 6) Reload the board so the real, persisted deal appears.
              const rows = await window.api.get('/opportunities').catch(() => null);
              if (Array.isArray(rows)) setDeals(rows.map(adaptOppFromApi));
              closeModal();
              fireToast(fired.length
                ? `Created deal "${data.name}" + new ${fired.join(' + ')}`
                : `Created deal "${data.name}"`);
            } catch (e) {
              fireToast((e && e.message) || 'Could not create the deal.');
            }
          }}
        />
      )}
      {modal?.kind === 'addDealContact' && (
        <window.AddDealContactModal
          dealName={modal.props.dealName}
          onClose={closeModal}
          onSubmit={({ role, contactId, name }) => {
            const body = { opportunity_id: modal.props.dealDbId, role };
            if (contactId) body.contact_id = contactId; else body.name = name;
            window.api.post('/deal-contacts', body)
              .then(() => { fireToast(`Added ${name || 'contact'} as ${role}`); modal.props.onAdded?.(); })
              .catch(err => fireToast(err?.data?.error || 'Could not add contact', { danger: true }));
          }}
        />
      )}
      {modal?.kind === 'closeDeal' && (
        <window.CloseDealModal
          deal={modal.props.deal}
          outcome={modal.props.outcome}
          onClose={closeModal}
          onSubmit={(data) => {
            const deal = modal.props.deal;
            if (!deal.dbId) { closeModal(); return; }
            window.api.post(`/opportunities/${deal.dbId}/close`, {
              outcome: data.outcome,
              lost_reason_id: data.lost_reason_id,
              lost_notes: data.lost_notes,
              won_reason: data.won_reason,
              won_note: data.won_note,
              signing_price: data.signing_price,
            })
              .then(() => {
                setDeals(ds => ds.map(d => d.id === deal.id
                  ? { ...d, status: data.outcome, stage: 'closing',
                      signingPrice: data.signing_price != null ? data.signing_price : d.signingPrice }
                  : d));
                setSelectedDeal(null);
                closeModal();
                fireToast(`${deal.name} closed as ${data.outcome}`);
              })
              .catch(err => fireToast(err?.data?.error || 'Could not close deal', { danger: true }));
          }}
        />
      )}
      {modal?.kind === 'applyDiscount' && (
        <window.ApplyDiscountModal
          deal={modal.props.deal}
          onClose={closeModal}
          onSubmit={({ pct, overLimit, notes }) => {
            const deal = modal.props.deal;
            if (!deal.dbId) { closeModal(); return; }
            if (overLimit) {
              window.api.post('/approvals', { opp_id: deal.dbId, requested_pct: pct, notes })
                .then(() => { closeModal(); fireToast(`Discount request sent for approval (${pct}%)`); })
                .catch(err => fireToast(err?.data?.error || 'Could not request approval', { danger: true }));
            } else {
              window.api.put(`/opportunities/${deal.dbId}`, { discount_pct: pct })
                .then(() => {
                  setDeals(ds => ds.map(d => d.id === deal.id ? { ...d, discount: pct } : d));
                  setSelectedDeal(sd => sd && sd.id === deal.id ? { ...sd, discount: pct } : sd);
                  closeModal();
                  fireToast(`${pct}% discount applied`);
                })
                .catch(err => fireToast(err?.data?.error || 'Could not apply discount', { danger: true }));
            }
          }}
        />
      )}
      {(modal?.kind === 'requestDesign' || modal?.kind === 'requestModification') && (
        <window.RequestDesignModal
          deal={modal.props.deal}
          kind={modal.kind === 'requestModification' ? 'modification' : 'new'}
          priorRequestId={modal.props.priorRequestId}
          oppDbMap={oppDbMap}
          onClose={closeModal}
          onSubmitted={(req) => {
            closeModal();
            // The server moved the deal to 'Lead' (Design/Redesign). Mirror that
            // locally so the card jumps columns without a manual refresh.
            const affected = modal.props.deal;
            setDeals(ds => ds.map(d => d.id === affected.id ? { ...d, stage: 'lead' } : d));
            setSelectedDeal(sd => sd && sd.id === affected.id ? { ...sd, stage: 'lead' } : sd);
            reloadDesignForDeal(affected);
            reloadStatusMap();
            fireToast(modal.kind === 'requestModification'
              ? `Modification (V${req.version}) requested for "${affected.name}"`
              : `Design requested for "${affected.name}"`);
          }}
        />
      )}
      {modal?.kind === 'import' && (
        <window.ImportModal onClose={closeModal} onImport={(f) => { closeModal(); fireToast(`Importing ${f.rows} deals…`); }} />
      )}
      {modal?.kind === 'automate' && (
        <window.AutomationModal onClose={closeModal} onCreate={() => { closeModal(); fireToast('Automation created'); }} />
      )}
      {modal?.kind === 'invite' && (
        <window.InviteModal onClose={closeModal} onInvite={() => { closeModal(); fireToast('Invitations sent'); }} />
      )}
      {modal?.kind === 'confirm' && (
        <window.ConfirmModal onClose={closeModal} {...modal.props} />
      )}
      {modal?.kind === 'editLabels' && (
        <window.EditLabelsModal onClose={closeModal} onSave={() => { closeModal(); fireToast('Stage labels updated'); }} />
      )}

      {/* ============== POPOVERS ============== */}
      {popover?.kind === 'notif' && (
        <window.NotificationsPopover anchorRect={popover.anchorRect} onClose={closePop} onMarkAllRead={() => fireToast('All notifications marked as read')} />
      )}
      {popover?.kind === 'user' && (
        <window.UserMenu anchorRect={popover.anchorRect} onClose={closePop} onAction={(a) => fireToast(`Open ${a}…`)} />
      )}
      {popover?.kind === 'toolbarmore' && (
        <window.ToolbarMoreMenu
          anchorRect={popover.anchorRect}
          onClose={closePop}
          onAction={(a, rect) => {
            if (a === 'export')         fireToast('Exporting pipeline as CSV…');
            else if (a === 'customize') openPop('columnpicker', popover.anchorRect);
            else if (a === 'density')   fireToast('Density set to compact');
            else if (a === 'settings')  fireToast('Open pipeline settings…');
          }}
        />
      )}
      {popover?.kind === 'approvalinbox' && (
        <window.ApprovalInboxPopover
          anchorRect={popover.anchorRect}
          onClose={closePop}
          onChanged={() => fireToast('Approval updated')}
        />
      )}
      {popover?.kind === 'columnpicker' && (
        <window.ColumnPickerPopover
          anchorRect={popover.anchorRect}
          onClose={closePop}
          columns={tableConfig.columns}
          onChange={setTableColumns}
          onReset={resetTableConfig}
        />
      )}
      {popover?.kind === 'filter' && (
        <window.FilterPopover anchorRect={popover.anchorRect} onClose={closePop}
          filters={filters} setFilters={setFilters} filterOptions={filterOptions} />
      )}
      {popover?.kind === 'groupby' && (
        <window.GroupByPopover anchorRect={popover.anchorRect} onClose={closePop} groupBy={groupBy} setGroupBy={setGroupBy} />
      )}
      {popover?.kind === 'person' && (
        <window.PersonPopover anchorRect={popover.anchorRect} onClose={closePop} person={person} setPerson={setPerson} />
      )}
      {popover?.kind === 'column' && (
        <window.ColumnMenu anchorRect={popover.anchorRect} stage={popover.props.stage} onClose={closePop}
          onAction={(a) => {
            if (a === 'add') setQuickAddStage(popover.props.stage);
            else if (a === 'archive') {
              openModal('confirm', {
                title: `Archive all in ${window.STAGE_META[popover.props.stage].label}?`,
                body: 'All deals in this column will be moved to the archive. You can restore them within 30 days.',
                confirmLabel: 'Archive all', danger: true,
                onConfirm: () => {
                  const stage = popover.props.stage;
                  setDeals(ds => ds.filter(d => d.stage !== stage));
                  closeModal();
                  fireToast('Stage archived');
                }
              });
            } else fireToast(`${a} stage…`);
          }}
        />
      )}
      {popover?.kind === 'cardmenu' && (
        <window.DealCardMenu anchorRect={popover.anchorRect} deal={popover.props.deal} onClose={closePop}
          onAction={(a) => handleCardAction(a, popover.props.deal)} />
      )}
      {popover?.kind === 'stagepicker' && (
        <window.StagePickerPopover
          anchorRect={popover.anchorRect}
          currentStage={popover.props.deal.stage}
          onClose={closePop}
          onPick={(newStage) => {
            const deal = popover.props.deal;
            if (newStage === deal.stage) return;
            updateStage(deal.id, newStage);
            fireToast(`${deal.name} → ${window.STAGE_META[newStage].label}`);
          }}
          onEditLabels={() => openModal('editLabels', {})}
          onAutoAssign={() => fireToast('Auto-assigning stage labels…')}
        />
      )}

      {/* ============== COMMAND PALETTE ============== */}
      {paletteOpen && (
        <window.CommandPalette
          onClose={() => setPaletteOpen(false)}
          onJump={(go) => {
            if (go === 'new-deal') openModal('newdeal');
            else if (go === 'page:contacts') window.location.href = 'Contacts.html';
            else if (go === 'page:companies') fireToast('Companies — coming soon');
            else if (go.startsWith('deal:')) {
              const d = window.DEALS.find(x => x.id === go.slice(5));
              if (d) setSelectedDeal(d);
            } else fireToast(go);
          }}
        />
      )}

      {/* ============== TOAST ============== */}
      <window.Toast toast={toast} onClose={() => setToast(null)} />

      {/* ============== TWEAKS PANEL ============== */}
      {tweaksOpen && (
        <TweaksPanel
          modules={modules}
          setModule={setModule}
          cardVariant={cardVariant}
          setCardVariant={setCardVariant}
          onClose={() => {
            setTweaksOpen(false);
            window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*');
          }}
          onDemoPopup={(kind) => openModal(kind)}
          onDemoPop={(kind, e) => openPop(kind, e.target.getBoundingClientRect())}
        />
      )}
    </>
  );
}

// ============================================================
// TWEAKS PANEL — show/hide modules + demo any pop-up
// ============================================================
function TweaksPanel({ modules, setModule, cardVariant, setCardVariant, onClose, onDemoPopup, onDemoPop }) {
  const { Close } = window.Icons;
  const groups = [
    { label: 'Top bar', items: [
      { k: 'showBreadcrumbs', label: 'Breadcrumbs' },
      { k: 'showCommandPalette', label: 'Quick search (⌘K)' },
      { k: 'showImport', label: 'Import button' },
      { k: 'showAutomate', label: 'Automate button' },
      { k: 'showInvite', label: 'Invite team button' },
    ]},
    { label: 'Sidebar', items: [
      { k: 'showSavedViews', label: 'Saved views' },
    ]},
    { label: 'Kanban', items: [
      { k: 'showColumnTotals', label: 'Column totals' },
      { k: 'showProbabilityBadge', label: 'Probability badge' },
    ]},
    { label: 'Deal detail', items: [
      { k: 'showActivityFeed', label: 'Activity feed' },
      { k: 'showFilesSection', label: 'Files section' },
    ]},
  ];
  const popups = [
    { id: 'newdeal',  label: 'New deal' },
    { id: 'import',   label: 'Import CSV' },
    { id: 'automate', label: 'Automation' },
    { id: 'invite',   label: 'Invite team' },
  ];
  return (
    <div style={{
      position: 'fixed', top: 16, right: 16, width: 320, zIndex: 400,
      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 12, boxShadow: 'var(--shadow-xl)', overflow: 'hidden',
      maxHeight: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--neutral-25)' }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em' }}>Tweaks</span>
        <button onClick={onClose} style={{ width: 24, height: 24, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 4, color: 'var(--fg-secondary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Close size={14} />
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {/* Card density */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Card density</div>
          <div style={{ display: 'flex', background: 'var(--neutral-100)', borderRadius: 7, padding: 2, gap: 2 }}>
            {['compact', 'standard', 'detailed'].map(v => {
              const on = cardVariant === v;
              return (
                <button key={v} onClick={() => setCardVariant(v)} style={{
                  flex: 1, padding: '6px 8px', borderRadius: 5, border: 'none',
                  background: on ? 'var(--bg-surface)' : 'transparent',
                  color: on ? 'var(--fg-primary)' : 'var(--fg-secondary)',
                  fontSize: 11.5, fontWeight: on ? 600 : 500, cursor: 'pointer',
                  boxShadow: on ? 'var(--shadow-xs)' : 'none', textTransform: 'capitalize',
                }}>{v}</button>
              );
            })}
          </div>
        </div>

        {/* Show/hide modules */}
        {groups.map(g => (
          <div key={g.label} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{g.label}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {g.items.map(item => (
                <ToggleRow key={item.k} label={item.label} on={modules[item.k]} onChange={v => setModule(item.k, v)} />
              ))}
            </div>
          </div>
        ))}

        {/* Demo popups */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Open a pop-up</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {popups.map(p => (
              <button key={p.id} onClick={() => onDemoPopup(p.id)} style={{
                padding: '7px 10px', border: '1px solid var(--border-default)', borderRadius: 6,
                background: 'var(--bg-surface)', color: 'var(--fg-primary)',
                fontSize: 12, fontWeight: 500, cursor: 'pointer',
              }}>{p.label}</button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-subtle)', background: 'var(--neutral-25)', fontSize: 11, color: 'var(--fg-tertiary)', lineHeight: 1.4 }}>
        <strong style={{ color: 'var(--fg-secondary)' }}>Tip:</strong> right-click any kanban card for the deal menu. Press <span className="t-mono" style={{ background: 'var(--neutral-100)', padding: '1px 4px', borderRadius: 3 }}>⌘K</span> for quick search.
      </div>
    </div>
  );
}

function ToggleRow({ label, on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '6px 8px', borderRadius: 6, border: 'none', background: 'transparent',
      cursor: 'pointer', textAlign: 'left',
    }}
    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <span style={{ fontSize: 12.5, color: 'var(--fg-primary)', fontWeight: 500 }}>{label}</span>
      <span style={{
        width: 30, height: 18, borderRadius: 999,
        background: on ? 'var(--img-orange)' : 'var(--neutral-200)',
        position: 'relative', transition: 'background 160ms', flexShrink: 0,
      }}>
        <span style={{
          position: 'absolute', top: 2, left: on ? 14 : 2,
          width: 14, height: 14, borderRadius: '50%', background: '#fff',
          boxShadow: 'var(--shadow-sm)', transition: 'left 160ms',
        }}></span>
      </span>
    </button>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<PipelineApp />);
