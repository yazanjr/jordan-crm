// Pipeline app — orchestrates the existing components (Sidebar, TopBar, Toolbar,
// Kanban, Table, DealDetail, Dashboard) and ALL the pop-up windows.

const { useState, useMemo, useEffect, useCallback } = React;

function PipelineApp() {
  const { Briefcase, Trend, Import, Zap, Bell, Search, ChevDown, Plus, Layers, Eye } = window.Icons;

  // ---- Core state ----
  const [deals, setDeals] = useState(window.DEALS);
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
  const updateDeal = useCallback((id, patch) => {
    setDeals(ds => ds.map(d => d.id === id ? { ...d, ...patch } : d));
    setSelectedDeal(sd => sd && sd.id === id ? { ...sd, ...patch } : sd);
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
        onConfirm: () => {
          setDeals(ds => ds.filter(d => d.id !== deal.id));
          closeModal();
          setSelectedDeal(null);
          fireToast(`${deal.name} closed as Won 🎉`);
        }
      });
    } else {
      const nextStage = order[i + 1];
      setDeals(ds => ds.map(d => d.id === deal.id ? { ...d, stage: nextStage } : d));
      setSelectedDeal({ ...deal, stage: nextStage });
      fireToast(`Moved to ${window.STAGE_META[nextStage].label}`, {
        action: { label: 'Undo', onClick: () => {
          setDeals(ds => ds.map(d => d.id === deal.id ? { ...d, stage: deal.stage } : d));
          setSelectedDeal(deal);
          setToast(null);
        }}
      });
    }
  };

  const handleCardAction = (action, deal) => {
    if (action === 'delete') {
      openModal('confirm', {
        title: 'Delete this deal?',
        body: `"${deal.name}" and all its activity will be permanently removed. This cannot be undone.`,
        confirmLabel: 'Delete deal', danger: true,
        onConfirm: () => {
          setDeals(ds => ds.filter(d => d.id !== deal.id));
          closeModal();
          fireToast('Deal deleted');
        }
      });
    } else if (action === 'won') {
      setDeals(ds => ds.map(d => d.id === deal.id ? { ...d, stage: 'closing' } : d));
      fireToast(`${deal.name} → Closing`);
    } else if (action === 'lost') {
      openModal('confirm', {
        title: 'Mark as Lost?',
        body: `"${deal.name}" will be archived as Closed-Lost. Add a reason in the next step.`,
        confirmLabel: 'Mark as Lost', danger: true,
        onConfirm: () => {
          setDeals(ds => ds.filter(d => d.id !== deal.id));
          closeModal();
          fireToast('Deal archived as Lost');
        }
      });
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
        onNav={(id) => {
          if (id === 'contacts') { window.location.href = 'Contacts.html'; return; }
          if (id === 'reports') { window.location.href = 'Reports.html'; return; }
          setActiveNav(id);
        }}
        onUserMenu={(rect) => openPop('user', rect)}
        onNotifications={(rect) => openPop('notif', rect)}
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
            onQuickAdd={(d) => {
              const newId = 'D-2026-0' + (400 + Math.floor(Math.random()*99));
              setDeals(ds => [{
                id: newId, name: d.name, account: d.account, value: d.value, stage: d.stage,
                owner: 'Hala Jaber', probability: 15, scope: 'VRF',
                closeDate: '2026-09-01', age: 0,
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
          onClose={closeModal}
          onSubmit={(data) => {
            const newId = 'D-2026-0' + (400 + Math.floor(Math.random()*99));
            setDeals(ds => [{
              id: newId, name: data.name, account: data.account, value: +data.value || 0,
              stage: data.stage, owner: data.owner, probability: data.probability,
              scope: data.scope, closeDate: data.closeDate, age: 0,
            }, ...ds]);
            closeModal();
            fireToast(`Created deal "${data.name}"`);
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
            setDeals(ds => ds.map(d => d.id === deal.id ? { ...d, stage: newStage } : d));
            fireToast(`${deal.name} → ${window.STAGE_META[newStage].label}`, {
              action: { label: 'Undo', onClick: () => {
                setDeals(ds => ds.map(d => d.id === deal.id ? { ...d, stage: deal.stage } : d));
                setToast(null);
              }}
            });
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
