// Pipeline app — orchestrates the existing components (Sidebar, TopBar, Toolbar,
// Kanban, Table, DealDetail, Dashboard) and ALL the pop-up windows.

const { useState, useMemo, useEffect, useCallback, useRef } = React;

function PipelineApp() {
  const { Briefcase, Trend, Import, Zap, Bell, Search, ChevDown, Plus, Layers, Eye } = window.Icons;

  // ---- Core state ----
  const [deals, _setDealsRaw] = useState([]);
  const [loading, setLoading] = useState(true);
  const dealsRef = useRef([]);
  dealsRef.current = deals;

  // Wrapped setter — when a deal's stage changes, fire the API call to persist it
  // (optimistic update; revert on error).
  const setDeals = useCallback((updater) => {
    _setDealsRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      // Detect stage changes and persist them
      next.forEach(nd => {
        const od = prev.find(p => p.id === nd.id);
        if (od && od.stage !== nd.stage && nd._dbId) {
          window.IMG_API.changeStage(nd._dbId, nd.stage).catch(err => {
            console.error('Failed to persist stage change:', err);
            // Revert the stage on failure
            _setDealsRaw(cur => cur.map(d => d.id === nd.id ? { ...d, stage: od.stage } : d));
            window.__fireToast?.(err.message || 'Could not save stage change', { kind: 'error' });
          });
        }
      });
      return next;
    });
  }, []);

  // ---- Reference data loaded on mount ----
  const [users, setUsers] = useState([]);
  const [usersByName, setUsersByName] = useState({});
  const [lostReasons, setLostReasons] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const me = useMemo(() => window.IMG_API.me(), []);

  const refreshNotifications = useCallback(async () => {
    try {
      const data = await window.IMG_API.loadNotifications();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread || 0);
    } catch (e) { console.error('notifications:', e); }
  }, []);

  // Load deals + users + lost reasons + notifications on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, userList, reasons] = await Promise.all([
          window.IMG_API.loadDeals(),
          window.IMG_API.loadUsers().catch(() => []),
          window.IMG_API.loadLostReasons().catch(() => []),
        ]);
        if (cancelled) return;
        _setDealsRaw(list);
        setUsers(userList);
        setUsersByName(Object.fromEntries(userList.map(u => [u.name, u])));
        setLostReasons(reasons);
      } catch (err) {
        console.error('Failed to load deals:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    refreshNotifications();
    return () => { cancelled = true; };
  }, [refreshNotifications]);

  const [activeNav, setActiveNav] = useState('pipeline');
  const [view, setView] = useState('kanban');
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [search, setSearch] = useState('');
  const [cardVariant, setCardVariant] = useState('standard');

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
  useEffect(() => { window.__fireToast = fireToast; }, [fireToast]);

  // ---- Quick add ----
  const [quickAddStage, setQuickAddStage] = useState(null);

  // ---- Module visibility (for Tweaks: show/hide modules) ----
  const DEFAULT_MODULES = /*EDITMODE-BEGIN*/{
    "showSavedViews": true,
    "showImport": true,
    "showAutomate": true,
    "showInvite": true,
    "showCommandPalette": true,
    "showProbabilityBadge": true,
    "showColumnTotals": true,
    "showBreadcrumbs": true,
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

  // ---- Filtering pipeline ----
  const filteredDeals = useMemo(() => {
    let list = deals;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d =>
        d.name.toLowerCase().includes(q) ||
        d.account.toLowerCase().includes(q) ||
        d.id.toLowerCase().includes(q) ||
        d.owner.toLowerCase().includes(q)
      );
    }
    if (person) list = list.filter(d => d.owner === person);
    if (filters.stages?.length) list = list.filter(d => filters.stages.includes(d.stage));
    if (filters.scopes?.length) list = list.filter(d => filters.scopes.includes(d.scope));
    if (filters.minValue) list = list.filter(d => d.value >= filters.minValue);
    return list;
  }, [deals, search, person, filters]);

  const filterCount = (filters.stages?.length || 0) + (filters.scopes?.length || 0) + (filters.minValue ? 1 : 0);
  const groupByLabel = ({ stage: 'Stage', owner: 'Owner', scope: 'Scope', closeMonth: 'Month' })[groupBy];

  // ---- Update deal (used by inline-edit on board + detail drawer edit mode) ----
  const updateDeal = useCallback(async (id, patch) => {
    const before = dealsRef.current.find(d => d.id === id);
    if (!before) return;

    // Optimistic UI
    _setDealsRaw(ds => ds.map(d => d.id === id ? { ...d, ...patch } : d));
    setSelectedDeal(sd => sd && sd.id === id ? { ...sd, ...patch } : sd);

    // Handle stage changes via the dedicated stage / close endpoint.
    if ('stage' in patch && patch.stage !== before.stage) {
      const newStage = patch.stage;
      try {
        if (newStage === 'won') {
          await window.IMG_API.closeDeal(before._dbId, 'Won');
        } else if (newStage === 'lost') {
          // Need a reason — open the modal instead of silently changing.
          openModal('lost', { deal: before });
          // Revert optimistic stage change since user must confirm via modal.
          _setDealsRaw(ds => ds.map(d => d.id === id ? { ...d, stage: before.stage } : d));
          setSelectedDeal(sd => sd && sd.id === id ? { ...sd, stage: before.stage } : sd);
        } else {
          await window.IMG_API.changeStage(before._dbId, newStage);
        }
      } catch (err) {
        // Revert on failure
        _setDealsRaw(ds => ds.map(d => d.id === id ? { ...d, stage: before.stage } : d));
        setSelectedDeal(sd => sd && sd.id === id ? { ...sd, stage: before.stage } : sd);
        window.__fireToast?.(err.message || 'Could not change stage');
      }
    }

    // For non-stage fields persist via PUT.
    const fieldsForPut = { ...patch };
    delete fieldsForPut.stage;
    delete fieldsForPut.probability; // not stored on DB
    if (Object.keys(fieldsForPut).length === 0) return;
    try {
      await window.IMG_API.updateDeal(before._dbId, fieldsForPut);
    } catch (err) {
      console.error('updateDeal:', err);
      window.__fireToast?.(err.message || 'Could not save change');
    }
  }, []);

  // ---- Action handlers ----
  const handleAdvance = (deal) => {
    const order = window.STAGE_ORDER;
    const i = order.indexOf(deal.stage);
    if (i < 0) return;
    if (i === order.length - 1) {
      // Closing → confirm Won
      openModal('confirm', {
        title: 'Mark deal as Won?',
        body: `"${deal.name}" will be moved to Closed-Won and synced to Finance for invoicing.`,
        confirmLabel: 'Mark as Won',
        onConfirm: async () => {
          try {
            await window.IMG_API.closeDeal(deal._dbId, 'Won');
            _setDealsRaw(ds => ds.map(d => d.id === deal.id ? { ...d, stage: 'won', _status: 'Won' } : d));
            closeModal();
            setSelectedDeal(null);
            fireToast(`${deal.name} closed as Won 🎉`);
          } catch (err) { fireToast(err.message || 'Could not close deal'); }
        }
      });
    } else {
      // The setDeals wrapper will fire the API call automatically
      const nextStage = order[i + 1];
      setDeals(ds => ds.map(d => d.id === deal.id ? { ...d, stage: nextStage } : d));
      setSelectedDeal({ ...deal, stage: nextStage });
      fireToast(`Moved to ${window.STAGE_META[nextStage].label}`);
    }
  };

  const handleCardAction = (action, deal) => {
    if (action === 'delete') {
      openModal('confirm', {
        title: 'Delete this deal?',
        body: `"${deal.name}" and all its activity will be permanently removed. This cannot be undone.`,
        confirmLabel: 'Delete deal', danger: true,
        onConfirm: async () => {
          try {
            await window.IMG_API.deleteDeal(deal._dbId);
            _setDealsRaw(ds => ds.filter(d => d.id !== deal.id));
            if (selectedDeal?.id === deal.id) setSelectedDeal(null);
            closeModal();
            fireToast('Deal deleted');
          } catch (err) { fireToast(err.message || 'Could not delete'); }
        }
      });
    } else if (action === 'won') {
      openModal('confirm', {
        title: 'Mark deal as Won?',
        body: `"${deal.name}" will be moved to Closed-Won and synced to Finance for invoicing.`,
        confirmLabel: 'Mark as Won',
        onConfirm: async () => {
          try {
            await window.IMG_API.closeDeal(deal._dbId, 'Won');
            _setDealsRaw(ds => ds.map(d => d.id === deal.id ? { ...d, stage: 'won', _status: 'Won' } : d));
            if (selectedDeal?.id === deal.id) setSelectedDeal(null);
            closeModal();
            fireToast(`${deal.name} closed as Won 🎉`);
          } catch (err) { fireToast(err.message || 'Could not close deal'); }
        }
      });
    } else if (action === 'lost') {
      openModal('lost', { deal });
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {modules.showCommandPalette && (
        <button onClick={() => setPaletteOpen(true)} style={{
          ...tbBtn, gap: 8,
          border: '1px solid var(--border-default)', background: 'var(--bg-surface)',
          color: 'var(--fg-secondary)', borderRadius: 7, paddingLeft: 10, paddingRight: 8,
        }}>
          <Search size={13} />
          <span>Quick search</span>
          <span className="t-mono" style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'var(--neutral-100)' }}>⌘K</span>
        </button>
      )}
      {modules.showImport && <button style={tbBtn} onClick={() => openModal('import')} onMouseEnter={e => e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.background='transparent'}><Import size={14} /> Import</button>}
      {modules.showAutomate && <button style={tbBtn} onClick={() => openModal('automate')} onMouseEnter={e => e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.background='transparent'}><Zap size={14} /> Automate</button>}
      {modules.showInvite && (
        <button onClick={() => openModal('invite')} style={{ ...tbBtn, padding: '6px 14px', height: 32, background: '#fff', border: '1px solid var(--border-default)', borderRadius: 7 }}>
          Invite team
        </button>
      )}
    </div>
  );

  return (
    <>
      <window.Sidebar
        active={activeNav}
        user={me}
        unreadCount={unreadCount}
        onNav={(id) => {
          if (id === 'contacts') { window.location.href = 'Contacts.html'; return; }
          if (id === 'reports') { window.location.href = 'Reports.html'; return; }
          setActiveNav(id);
        }}
        onUserMenu={(rect) => openPop('user', rect)}
        onNotifications={(rect) => { refreshNotifications(); openPop('notif', rect); }}
        showSavedViews={modules.showSavedViews}
      />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <window.TopBar
          title="Pipeline"
          tabs={[
            { id: 'main',  label: 'Main pipeline', icon: Briefcase },
            { id: 'q3',    label: 'Q3 forecast',   icon: Trend },
            { id: 'amman', label: 'Amman region',  icon: Briefcase },
          ]}
          activeTab="main"
          right={topRight}
          showBreadcrumbs={modules.showBreadcrumbs}
        />

        <window.Toolbar
          view={view}
          onViewChange={setView}
          search={search}
          setSearch={setSearch}
          onNewDeal={() => openModal('newdeal')}
          onPerson={(rect) => openPop('person', rect)}
          onFilter={(rect) => openPop('filter', rect)}
          onGroupBy={(rect) => openPop('groupby', rect)}
          onMore={(rect) => openPop('toolbarmore', rect)}
          person={person}
          filterCount={filterCount}
          groupBy={groupByLabel}
        />

        {view === 'kanban' ? (
          <window.KanbanBoard
            deals={filteredDeals}
            setDeals={setDeals}
            onSelectDeal={setSelectedDeal}
            onUpdateDeal={updateDeal}
            cardVariant={cardVariant}
            onColumnMenu={(stage, rect) => openPop('column', rect, { stage })}
            onCardMenu={(deal, rect) => openPop('cardmenu', rect, { deal })}
            quickAddStage={quickAddStage}
            onStartQuickAdd={setQuickAddStage}
            onCancelQuickAdd={() => setQuickAddStage(null)}
            onQuickAdd={async (d) => {
              try {
                const created = await window.IMG_API.createDeal({
                  name: d.name, account: d.account, value: d.value, stage: d.stage,
                  owner: me?.name, scope: 'VRF', closeDate: null,
                }, usersByName);
                // Server starts new deals at 'Prospect'. If the user picked a different
                // column, advance the stage right after creation.
                if (d.stage !== 'prospect' && created._dbId) {
                  try { await window.IMG_API.changeStage(created._dbId, d.stage); created.stage = d.stage; } catch {}
                }
                _setDealsRaw(ds => [created, ...ds]);
                setQuickAddStage(null);
                fireToast(`Added "${d.name}" to ${window.STAGE_META[d.stage].label}`);
              } catch (err) { fireToast(err.message || 'Could not create deal'); }
            }}
          />
        ) : (
          <window.DealsTable
            deals={filteredDeals}
            onSelectDeal={setSelectedDeal}
            onStageClick={(deal, rect) => openPop('stagepicker', rect, { deal })}
          />
        )}
      </main>

      {selectedDeal && (
        <window.DealDetail
          deal={selectedDeal}
          onClose={() => setSelectedDeal(null)}
          onAdvance={handleAdvance}
          onMore={(deal, rect) => openPop('cardmenu', rect, { deal })}
          onUpdate={(patch) => updateDeal(selectedDeal.id, patch)}
          onAction={(a, payload) => {
            if (a === 'quote')      fireToast(`Creating quotation from ${selectedDeal.id}…`);
            else if (a === 'email') fireToast(`Drafting email to ${payload?.name || 'contact'}…`);
            else if (a === 'call')  fireToast(`Logging call with ${payload?.name || 'contact'}…`);
            else if (a === 'addContact') fireToast('Add contact — coming soon');
          }}
          showActivity={modules.showActivityFeed}
          showFiles={modules.showFilesSection}
        />
      )}

      {/* ============== MODALS ============== */}
      {modal?.kind === 'newdeal' && (
        <window.NewDealModal
          users={users}
          onClose={closeModal}
          onSubmit={async (data) => {
            try {
              const created = await window.IMG_API.createDeal(data, usersByName);
              // Backend starts new deals at 'Prospect'. If the user picked a different
              // stage in the wizard, advance immediately after creation.
              if (data.stage && data.stage !== 'prospect' && created._dbId) {
                try { await window.IMG_API.changeStage(created._dbId, data.stage); created.stage = data.stage; } catch {}
              }
              _setDealsRaw(ds => [created, ...ds]);
              closeModal();
              fireToast(`Created deal "${data.name}"`);
            } catch (err) { fireToast(err.message || 'Could not create deal'); }
          }}
        />
      )}
      {modal?.kind === 'lost' && (
        <window.LostReasonModal
          deal={modal.props.deal}
          lostReasons={lostReasons}
          onClose={closeModal}
          onConfirm={async ({ lostReasonId, lostNotes }) => {
            const deal = modal.props.deal;
            try {
              await window.IMG_API.closeDeal(deal._dbId, 'Lost', lostReasonId, lostNotes);
              _setDealsRaw(ds => ds.map(d => d.id === deal.id ? { ...d, stage: 'lost', _status: 'Lost' } : d));
              if (selectedDeal?.id === deal.id) setSelectedDeal(null);
              closeModal();
              fireToast('Deal archived as Lost');
            } catch (err) { fireToast(err.message || 'Could not close deal'); }
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
        <window.NotificationsPopover
          anchorRect={popover.anchorRect}
          notifications={notifications}
          onClose={closePop}
          onMarkAllRead={async () => {
            try {
              await window.IMG_API.markAllNotificationsRead();
              setUnreadCount(0);
              setNotifications(ns => ns.map(n => ({ ...n, is_read: 1 })));
              fireToast('All notifications marked as read');
            } catch (err) { fireToast(err.message || 'Could not mark as read'); }
          }}
        />
      )}
      {popover?.kind === 'user' && (
        <window.UserMenu
          anchorRect={popover.anchorRect}
          user={me}
          onClose={closePop}
          onAction={(a) => {
            if (a === 'signout') {
              window.IMG_API.signOut();
            } else if (a === 'notif') {
              openPop('notif', popover.anchorRect);
            } else {
              fireToast(`${a} — coming soon`);
            }
          }}
        />
      )}
      {popover?.kind === 'toolbarmore' && (
        <window.ToolbarMoreMenu
          anchorRect={popover.anchorRect}
          onClose={closePop}
          onAction={(a) => {
            if (a === 'export')         fireToast('Exporting pipeline as CSV…');
            else if (a === 'customize') fireToast('Customize columns — coming soon');
            else if (a === 'density')   fireToast('Density set to compact');
            else if (a === 'settings')  fireToast('Open pipeline settings…');
          }}
        />
      )}
      {popover?.kind === 'filter' && (
        <window.FilterPopover anchorRect={popover.anchorRect} onClose={closePop} filters={filters} setFilters={setFilters} />
      )}
      {popover?.kind === 'groupby' && (
        <window.GroupByPopover anchorRect={popover.anchorRect} onClose={closePop} groupBy={groupBy} setGroupBy={setGroupBy} />
      )}
      {popover?.kind === 'person' && (
        <window.PersonPopover anchorRect={popover.anchorRect} onClose={closePop} person={person} setPerson={setPerson} users={users} />
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
            // Won/Lost go through their dedicated close flow.
            if (newStage === 'won') {
              handleCardAction('won', deal);
              return;
            }
            if (newStage === 'lost') {
              openModal('lost', { deal });
              return;
            }
            // Forward stage move — setDeals wrapper persists via API.
            setDeals(ds => ds.map(d => d.id === deal.id ? { ...d, stage: newStage } : d));
            fireToast(`${deal.name} → ${window.STAGE_META[newStage].label}`);
          }}
          onEditLabels={() => openModal('editLabels', {})}
          onAutoAssign={() => fireToast('Auto-assigning stage labels…')}
        />
      )}

      {/* ============== COMMAND PALETTE ============== */}
      {paletteOpen && (
        <window.CommandPalette
          deals={deals}
          onClose={() => setPaletteOpen(false)}
          onJump={(go) => {
            if (go === 'new-deal') openModal('newdeal');
            else if (go === 'page:contacts') window.location.href = 'Contacts.html';
            else if (go === 'page:companies') fireToast('Companies — coming soon');
            else if (go.startsWith('deal:')) {
              const d = dealsRef.current.find(x => x.id === go.slice(5));
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
