// Design Board — Sally's view. Kanban of design requests across 5 stages,
// designer workload strip on top, drag-to-assign, approve/revise in Review.

const { useState, useMemo, useEffect } = React;

function DesignBoardApp() {
  const { Briefcase, Trend, Search, Plus, Filter, Layers, More, ChevDown, Check, Close, Sparkle, Edit, Calendar, File: FileI, Attach } = window.Icons;

  const [requests, setRequests]   = useState([]);
  const [workloadAPI, setWorkloadAPI] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [activeNav, setActiveNav] = useState('design-board');
  const [search, setSearch]       = useState('');
  const [designerFilter, setDesignerFilter] = useState(null);
  const [priorityFilter, setPriorityFilter] = useState(null);
  const [popover, setPopover]     = useState(null);
  const [modal, setModal]         = useState(null);
  const [toast, setToast]         = useState(null);
  const [selected, setSelected]   = useState(null);

  const fireToast = (msg, opts = {}) => setToast({ msg, ...opts });

  // ---- Load the real user roster so the sidebar + switcher match every page ----
  const [, setUsersReady] = useState(false);
  useEffect(() => {
    window.loadRealUsers().then(ok => { if (ok) setUsersReady(true); });
    if (typeof window.loadProductGroups === 'function') window.loadProductGroups();
  }, []);

  // ---- Load from API + poll every 30s ----
  const reload = React.useCallback(async () => {
    try {
      const data = await window.api.get('/design-board');
      setRequests((data.requests || []).map(window.adaptDesignRequest));
      setWorkloadAPI(data.workload || []);
      setLoadError(null);
    } catch (e) {
      setLoadError(e.message || 'Failed to load board');
    }
  }, []);

  useEffect(() => {
    reload();
    const t = setInterval(reload, 30000);
    return () => clearInterval(t);
  }, [reload]);

  // ---- Drag state ----
  const [draggingId, setDraggingId]     = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);

  // ---- Filtering ----
  const filtered = useMemo(() => {
    let list = requests;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.oppTitle.toLowerCase().includes(q) ||
        (r.account || '').toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        (r.requestedBy || '').toLowerCase().includes(q) ||
        (r.assignment?.designer || '').toLowerCase().includes(q)
      );
    }
    if (designerFilter) list = list.filter(r => r.assignment && r.assignment.designerId === designerFilter);
    if (priorityFilter) list = list.filter(r => r.assignment && r.assignment.priority === priorityFilter);
    return list;
  }, [requests, search, designerFilter, priorityFilter]);

  // ---- Group by stage ----
  const byStage = useMemo(() => {
    const m = Object.fromEntries(window.DESIGN_STAGES.map(s => [s, []]));
    filtered.forEach(r => { if (m[r.stage]) m[r.stage].push(r); });
    return m;
  }, [filtered]);

  // ---- Designer workload — sourced from the API (authoritative) ----
  const workload = workloadAPI.map(w => ({
    id: w.designer_id, name: w.name, role: '',
    total: w.active_tasks, active: 0, queued: 0, review: 0,
  }));

  // ---- Mutations call the API; reload after each ----
  const moveToStage = async (id, stage, notes) => {
    try {
      await window.api.put(`/design-requests/${id}/stage`, { stage, notes });
      reload();
    } catch (e) { fireToast(`Failed: ${e.message}`); }
  };

  const assignDesigner = async (id, assignment) => {
    try {
      await window.api.post(`/design-requests/${id}/assign`, {
        designer_id:          assignment.designerId,
        assigned_reviewer_id: assignment.reviewerId || null,
        priority:             assignment.priority,
        estimated_hours:      assignment.estimatedHours,
        due_date:             assignment.dueDate,
        design_notes:         assignment.designNotes,
      });
      reload();
      setSelected(null);
    } catch (e) { fireToast(`Failed: ${e.message}`); }
  };

  // ---- Drag-and-drop (only used for Incoming → assignment now) ----
  const handleDrop = (stage) => {
    if (!draggingId) return;
    const r = requests.find(x => x.id === draggingId);
    setDraggingId(null);
    setDragOverStage(null);
    if (!r) return;
    if (r.stage === 'Incoming' && stage !== 'Incoming' && !r.assignment) {
      setModal({ kind: 'assign', request: r, targetStage: stage });
    }
    // All other moves go through stage transition buttons / API,
    // since the backend enforces allowed transitions.
  };

  // ---- Actions (all call the API) ----
  const approveRequest = async (r) => {
    await moveToStage(r.id, 'Approved');
    fireToast(`Approved "${r.oppTitle}" — click Release to send to sales`);
  };
  // Phase 2 — Release now opens a modal so Sally picks Tender or Analysis as the
  // post-release pipeline stage for the parent deal.
  const releaseRequest = (r) => {
    setModal({ kind: 'release-route', request: r });
  };
  // Phase 2 — Return-to-sales: Sally rejects a request with a reason; backend moves
  // the deal back to Prospect and notifies the salesman.
  const returnRequest = async (id, reason) => {
    try {
      await window.api.post(`/design-requests/${id}/return`, { reason });
      reload();
      setSelected(null);
      fireToast('Returned to sales');
    } catch (e) { fireToast(`Failed: ${e.message || 'could not return'}`, { danger: true }); }
  };
  const requestRevision = async (r, notes) => {
    await moveToStage(r.id, 'In Progress', notes);
    fireToast(`Revision requested on "${r.oppTitle}"`);
  };

  // ---- Top-right area ----
  const tbBtn = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '6px 10px', height: 30, borderRadius: 6,
    background: 'transparent', color: 'var(--fg-primary)', border: 'none',
    fontSize: 13, fontWeight: 500, cursor: 'pointer',
  };
  // designerFilter is the integer DB id of the designer. window.USERS stores
  // ids as both the 'U010' string and a numeric .dbId — match by either so the
  // topbar dropdown name renders correctly.
  const filteredDesigner = designerFilter
    ? (workloadAPI.find(w => w.designer_id === designerFilter)
       || (window.USERS || []).find(u => u.dbId === designerFilter || u.id === designerFilter)
       || { name: '#' + designerFilter })
    : null;

  const topRight = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button onClick={e => setPopover({ kind: 'designer', rect: e.currentTarget.getBoundingClientRect() })} style={tbBtn}>
        {filteredDesigner ? <window.Avatar name={filteredDesigner.name} size={16} /> : <span style={{ width: 16, height: 16, borderRadius: '50%', border: '1px dashed var(--border-default)' }}></span>}
        {filteredDesigner ? filteredDesigner.name : 'Designer'} <ChevDown size={12} />
      </button>
      {designerFilter && (
        <button onClick={() => setDesignerFilter(null)} title="Clear designer filter" style={{
          ...tbBtn, padding: '6px 8px', background: 'var(--img-orange-50)',
          color: 'var(--img-orange-700, #B8680E)', fontWeight: 700,
        }}>
          Clear ×
        </button>
      )}
      <button onClick={e => setPopover({ kind: 'priority', rect: e.currentTarget.getBoundingClientRect() })} style={tbBtn}>
        <Filter size={14} /> {priorityFilter ? `Priority ${priorityFilter}` : 'Priority'} <ChevDown size={12} />
      </button>
    </div>
  );

  return (
    <>
      <window.Sidebar
        active={activeNav}
        onNav={(id) => {
          if (id === 'pipeline') { window.location.href = 'Pipeline.html'; return; }
          if (id === 'contacts') { window.location.href = 'Contacts.html'; return; }
          if (id === 'reports')  { window.location.href = 'Reports.html'; return; }
          if (id === 'my-tasks') { window.location.href = 'MyTasks.html'; return; }
          if (id === 'pricelist') { window.location.href = 'Pricelist.html'; return; }
          if (id === 'costing')   { window.location.href = 'QuotationCosting.html'; return; }
          setActiveNav(id);
        }}
        onUserMenu={(rect) => setPopover({ kind: 'user', rect })}
        onNotifications={(rect) => setPopover({ kind: 'notif', rect })}
      />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <window.TopBar
          title="Design Board"
          tabs={[
            { id: 'all',   label: 'All requests', icon: Sparkle },
            { id: 'urgent', label: 'Urgent only', icon: Filter },
          ]}
          activeTab="all"
          right={topRight}
        />

        {/* Toolbar with search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 24px',
          borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
        }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-tertiary)' }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search project, account, designer…"
              style={{
                width: '100%', height: 32, padding: '0 10px 0 30px',
                border: '1px solid var(--border-default)', borderRadius: 7,
                fontSize: 13, fontFamily: 'inherit', outline: 'none',
                background: 'var(--bg-surface)',
              }}
            />
          </div>
          <div style={{ flex: 1 }}></div>
          <span style={{ fontSize: 12, color: 'var(--fg-secondary)' }}>{filtered.length} of {requests.length}</span>
        </div>

        {/* Designer workload strip */}
        <WorkloadStrip workload={workload} onPickDesigner={(id) => setDesignerFilter(designerFilter === id ? null : id)} active={designerFilter} />

        {/* Kanban board */}
        <div style={{
          flex: 1, overflow: 'auto', padding: '16px 24px 24px',
          background: 'var(--neutral-50)',
          display: 'flex', gap: 12, alignItems: 'flex-start',
        }}>
          {window.DESIGN_STAGES.map(stage => {
            const meta = window.DESIGN_STAGE_META[stage];
            const items = byStage[stage] || [];
            const totalValue = items.reduce((s, r) => s + (r.value || 0), 0);
            const isOver = dragOverStage === stage && draggingId;
            return (
              <div
                key={stage}
                onDragOver={e => { e.preventDefault(); setDragOverStage(stage); }}
                onDragLeave={() => setDragOverStage(null)}
                onDrop={() => handleDrop(stage)}
                style={{
                  width: 290, flexShrink: 0,
                  background: meta.bg,
                  border: `1px solid ${isOver ? meta.fg : 'transparent'}`,
                  borderRadius: 12,
                  display: 'flex', flexDirection: 'column',
                  maxHeight: 'calc(100vh - 280px)',
                  overflow: 'hidden',
                  boxShadow: isOver ? `0 0 0 3px ${meta.fg}33` : 'none',
                  transition: 'box-shadow 120ms, border-color 120ms',
                }}>
                {/* Column header */}
                <div style={{
                  background: meta.fg, padding: '10px 12px', color: '#fff',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', opacity: 0.9 }}></span>
                  <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{meta.label}</span>
                  <span className="t-num" style={{
                    fontSize: 11, fontWeight: 600,
                    background: 'rgba(255,255,255,0.22)', padding: '1px 7px', borderRadius: 999,
                  }}>{items.length}</span>
                </div>
                {/* Column total */}
                <div style={{
                  padding: '8px 12px 6px', fontSize: 11, color: meta.fg, fontWeight: 600,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  borderBottom: `1px dashed ${meta.fg}33`,
                }}>
                  <span style={{ opacity: 0.85 }}>Pipeline value</span>
                  <span className="t-num" style={{ fontWeight: 700 }}>{window.formatJODshort(totalValue)}</span>
                </div>
                {/* Cards */}
                <div style={{ padding: '10px 10px 12px', display: 'flex', flexDirection: 'column', gap: 8, overflow: 'auto', flex: 1 }}>
                  {items.map(r => (
                    <div
                      key={r.id}
                      draggable
                      onDragStart={() => setDraggingId(r.id)}
                      onDragEnd={() => { setDraggingId(null); setDragOverStage(null); }}
                      style={{ opacity: draggingId === r.id ? 0.4 : 1 }}>
                      <RequestCard
                        request={r}
                        onClick={() => setSelected(r)}
                        onApprove={() => approveRequest(r)}
                        onRelease={() => releaseRequest(r)}
                        onRevise={() => setModal({ kind: 'revise', request: r })}
                        onAssign={() => setModal({ kind: 'assign', request: r, targetStage: 'Queued' })}
                      />
                    </div>
                  ))}
                  {items.length === 0 && (
                    <div style={{
                      padding: '14px 8px', textAlign: 'center', fontSize: 11.5,
                      color: 'var(--fg-tertiary)', fontStyle: 'italic',
                    }}>No requests</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Detail drawer */}
      {selected && <RequestDetail
        request={selected}
        onClose={() => setSelected(null)}
        onApprove={() => { approveRequest(selected); }}
        onRelease={() => { releaseRequest(selected); }}
        onRevise={() => setModal({ kind: 'revise', request: selected })}
        onAssign={() => setModal({ kind: 'assign', request: selected, targetStage: 'Queued' })}
        onMoveStage={(s) => moveToStage(selected.id, s)}
        onReturn={() => setModal({ kind: 'return-to-sales', request: selected })}
      />}

      {/* Modals */}
      {modal?.kind === 'assign' && (
        <AssignmentModal
          request={modal.request}
          targetStage={modal.targetStage}
          workload={workload}
          onClose={() => setModal(null)}
          onSave={(assignment) => {
            assignDesigner(modal.request.id, assignment);
            // Move to the target stage (defaults to Queued)
            if (modal.targetStage && modal.targetStage !== 'Incoming') {
              setRequests(rs => rs.map(r => r.id === modal.request.id ? { ...r, stage: modal.targetStage } : r));
            }
            setModal(null);
            fireToast(`Assigned "${modal.request.oppTitle}" → ${assignment.designer}`);
          }}
        />
      )}
      {modal?.kind === 'revise' && (
        <ReviseModal
          request={modal.request}
          onClose={() => setModal(null)}
          onSave={(notes) => { requestRevision(modal.request, notes); setModal(null); }}
        />
      )}
      {modal?.kind === 'return-to-sales' && (
        <window.DesignReturnModal
          request={modal.request}
          onClose={() => setModal(null)}
          onSubmit={({ reason }) => { returnRequest(modal.request.id, reason); setModal(null); }}
        />
      )}
      {modal?.kind === 'release-route' && (
        <window.DesignReleaseRouteModal
          request={modal.request}
          onClose={() => setModal(null)}
          onSubmit={({ released_to_stage }) => {
            window.api.put(`/design-requests/${modal.request.id}/stage`, { stage: 'Released', released_to_stage })
              .then(() => { reload(); setSelected(null); setModal(null);
                            fireToast(`Released "${modal.request.oppTitle}" → ${released_to_stage}`); })
              .catch(e => fireToast(`Failed: ${e.message || 'could not release'}`, { danger: true }));
          }}
        />
      )}

      {/* Popovers */}
      {popover?.kind === 'notif' && <window.NotificationsPopover anchorRect={popover.rect} onClose={() => setPopover(null)} />}
      {popover?.kind === 'user'  && <window.UserMenu anchorRect={popover.rect} onClose={() => setPopover(null)} onAction={(a) => fireToast(`Open ${a}…`)} />}
      {popover?.kind === 'designer' && (
        <window.PopupShell.Popover anchorRect={popover.rect} onClose={() => setPopover(null)} width={220}>
          <div style={{ padding: '6px 0' }}>
            <window.PopupShell.MenuLabel>Filter by designer</window.PopupShell.MenuLabel>
            <window.PopupShell.MenuItem onClick={() => { setDesignerFilter(null); setPopover(null); }} checked={!designerFilter}>All designers</window.PopupShell.MenuItem>
            {(window.USERS || []).filter(u => ['Designer','Design Manager'].includes(u.role)).map(u => (
              <window.PopupShell.MenuItem key={u.id} onClick={() => { setDesignerFilter(u.id); setPopover(null); }} checked={designerFilter === u.id}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <window.Avatar name={u.name} size={20} />
                  <span>{u.name}</span>
                </span>
              </window.PopupShell.MenuItem>
            ))}
          </div>
        </window.PopupShell.Popover>
      )}
      {popover?.kind === 'priority' && (
        <window.PopupShell.Popover anchorRect={popover.rect} onClose={() => setPopover(null)} width={180}>
          <div style={{ padding: '6px 0' }}>
            <window.PopupShell.MenuLabel>Filter by priority</window.PopupShell.MenuLabel>
            <window.PopupShell.MenuItem onClick={() => { setPriorityFilter(null); setPopover(null); }} checked={!priorityFilter}>All priorities</window.PopupShell.MenuItem>
            {[1, 2, 3, 4].map(p => (
              <window.PopupShell.MenuItem key={p} onClick={() => { setPriorityFilter(p); setPopover(null); }} checked={priorityFilter === p}>
                <PriorityChip priority={p} /> <span style={{ marginLeft: 6 }}>Priority {p}</span>
              </window.PopupShell.MenuItem>
            ))}
          </div>
        </window.PopupShell.Popover>
      )}

      <window.Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

// ============================================================
// DESIGNER WORKLOAD STRIP
// ============================================================
function WorkloadStrip({ workload, onPickDesigner, active }) {
  const overload = window.DESIGNER_OVERLOAD || 4;
  return (
    <div style={{
      padding: '12px 24px', borderBottom: '1px solid var(--border-subtle)',
      background: 'var(--bg-surface)',
      display: 'flex', alignItems: 'center', gap: 12, overflowX: 'auto',
    }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
        Designer load
        {active != null && (
          <span style={{
            marginInlineStart: 8, padding: '2px 7px', borderRadius: 999,
            background: 'var(--img-orange)', color: '#fff', fontSize: 10,
            letterSpacing: '0.02em', textTransform: 'none',
          }}>Filtering</span>
        )}
      </span>
      {workload.map(w => {
        const pct = Math.min(w.total / overload, 1);
        const isOverload = w.total >= overload;
        const isActive = active === w.id;
        return (
          <button
            key={w.id}
            onClick={() => onPickDesigner?.(w.id)}
            title={isActive ? `Filtering by ${w.name} — click again to clear` : `Filter board to ${w.name}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', borderRadius: 8,
              border: '2px solid ' + (isActive ? 'var(--img-orange)' : 'transparent'),
              outline: '1px solid ' + (isActive ? 'transparent' : 'var(--border-subtle)'),
              background: isActive ? 'var(--img-orange-50)' : 'var(--bg-surface)',
              boxShadow: isActive ? '0 0 0 3px rgba(247,148,29,0.18)' : 'none',
              cursor: 'pointer', minWidth: 200,
              transition: 'border-color 120ms, background 120ms, box-shadow 120ms',
            }}>
            <window.Avatar name={w.name} size={28} />
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg-primary)' }}>{w.name.split(' ')[0]}</span>
                <span className="t-num" style={{
                  fontSize: 11, fontWeight: 700,
                  color: isOverload ? '#B0241D' : 'var(--fg-secondary)',
                }}>{w.total} / {overload}</span>
              </div>
              <div style={{ height: 5, background: 'var(--neutral-100)', borderRadius: 999, overflow: 'hidden', marginTop: 4 }}>
                <div style={{
                  width: `${pct * 100}%`, height: '100%',
                  background: isOverload ? 'var(--color-danger)' : pct > 0.7 ? 'var(--img-orange)' : 'var(--img-green)',
                  transition: 'width 360ms var(--ease-out)',
                }}></div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// REQUEST CARD (kanban)
// ============================================================
function RequestCard({ request, onClick, onApprove, onRelease, onRevise, onAssign }) {
  const { Calendar, File: FileI, Attach, Clock, Check } = window.Icons;
  const r = request;
  const urgentMeta = window.URGENCY_META[r.urgency] || {};
  const dueDays = r.assignment?.dueDate ? window.daysUntil(r.assignment.dueDate) : null;
  const overdue = dueDays != null && dueDays < 0;
  const dueSoon = dueDays != null && dueDays >= 0 && dueDays <= 3;
  const latestQuote = r.quotations[r.quotations.length - 1];

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
        borderRadius: 10, padding: 12,
        boxShadow: 'var(--shadow-xs)',
        display: 'flex', flexDirection: 'column', gap: 8,
        cursor: 'pointer', userSelect: 'none',
        transition: 'box-shadow 120ms, border-color 120ms',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.boxShadow = 'var(--shadow-xs)'; }}>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
        <div className="t-mono" style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>{r.id} · {r.oppId}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {r.assignment && <PriorityChip priority={r.assignment.priority} />}
          <span style={{
            padding: '2px 7px', borderRadius: 999, fontSize: 10, fontWeight: 700,
            background: urgentMeta.bg, color: urgentMeta.fg, letterSpacing: '0.02em',
          }}>{r.urgency}</span>
        </div>
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)', lineHeight: 1.35 }}>
        {r.oppTitle}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--fg-secondary)' }}>
        {r.account}{r.scope ? ` · ${r.scope}` : ''}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
        <span style={{
          padding: '2px 7px', borderRadius: 4, fontSize: 10.5, fontWeight: 600,
          background: 'var(--neutral-100)', color: 'var(--neutral-600)',
        }}>{r.projectType}</span>
        {latestQuote && (
          <span style={{
            padding: '2px 7px', borderRadius: 4, fontSize: 10.5, fontWeight: 700,
            background: 'var(--img-orange-50)', color: 'var(--img-orange-700)',
          }}>V{latestQuote.version} · {latestQuote.status}</span>
        )}
        {r.sitePlans.length > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--fg-tertiary)' }}>
            <Attach size={11} />{r.sitePlans.length}
          </span>
        )}
      </div>

      {/* Footer: designer + due date */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        paddingTop: 8, borderTop: '1px solid var(--border-subtle)', marginTop: 2,
      }}>
        {r.assignment ? (
          <>
            <window.Avatar name={r.assignment.designer} size={22} />
            <span style={{ fontSize: 11, color: 'var(--fg-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.assignment.designer.split(' ')[0]}
            </span>
            {dueDays != null && (
              <span style={{
                fontSize: 10.5, fontWeight: 600,
                padding: '2px 6px', borderRadius: 4,
                background: overdue ? 'var(--color-danger-bg)' : dueSoon ? 'var(--color-warning-bg)' : 'var(--neutral-100)',
                color:      overdue ? '#B0241D' : dueSoon ? 'var(--img-orange-700)' : 'var(--fg-secondary)',
              }} className="t-num">
                {overdue ? `${-dueDays}d overdue` : dueDays === 0 ? 'due today' : `${dueDays}d`}
              </span>
            )}
          </>
        ) : (
          <button onClick={(e) => { e.stopPropagation(); onAssign(); }} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', borderRadius: 6,
            background: 'var(--img-orange-50)', color: 'var(--img-orange-700)',
            border: '1px solid var(--img-orange)', cursor: 'pointer',
            fontSize: 11, fontWeight: 600,
          }}>
            <Plus size={11} /> Assign designer
          </button>
        )}
      </div>

      {/* Review actions */}
      {r.stage === 'Review' && (
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <button onClick={(e) => { e.stopPropagation(); onApprove(); }} style={{
            flex: 1, padding: '6px 10px', borderRadius: 6,
            background: 'var(--img-green)', color: '#fff', border: 'none',
            cursor: 'pointer', fontSize: 11.5, fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}>
            <Check size={12} /> Approve
          </button>
          <button onClick={(e) => { e.stopPropagation(); onRevise(); }} style={{
            flex: 1, padding: '6px 10px', borderRadius: 6,
            background: 'var(--bg-surface)', color: 'var(--fg-primary)',
            border: '1px solid var(--border-default)', cursor: 'pointer',
            fontSize: 11.5, fontWeight: 500,
          }}>
            Request revision
          </button>
        </div>
      )}

      {/* Approved → Release action */}
      {r.stage === 'Approved' && (
        <button onClick={(e) => { e.stopPropagation(); onRelease(); }} style={{
          padding: '7px 10px', borderRadius: 6,
          background: 'var(--img-orange)', color: '#fff', border: 'none',
          cursor: 'pointer', fontSize: 12, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          marginTop: 4,
        }}>
          Release to salesman
        </button>
      )}
    </div>
  );
}

const Plus = (p) => <svg {...p} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>;

function PriorityChip({ priority }) {
  const colors = {
    1: { bg: 'var(--color-danger-bg)',     fg: '#B0241D' },
    2: { bg: 'var(--img-orange-50)',        fg: 'var(--img-orange-700)' },
    3: { bg: 'var(--stage-tender-bg)',      fg: 'var(--stage-tender)' },
    4: { bg: 'var(--neutral-100)',          fg: 'var(--neutral-500)' },
  }[priority] || { bg: 'var(--neutral-100)', fg: 'var(--neutral-500)' };
  return (
    <span style={{
      padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700,
      background: colors.bg, color: colors.fg,
    }}>P{priority}</span>
  );
}

// ============================================================
// REQUEST DETAIL DRAWER
// ============================================================
function RequestDetail({ request, onClose, onApprove, onRelease, onRevise, onAssign, onMoveStage, onReturn }) {
  const { Close, Calendar, File: FileI, Attach, Check, ChevDown, Edit } = window.Icons;
  const r = request;
  const meta = window.DESIGN_STAGE_META[r.stage];
  const urgentMeta = window.URGENCY_META[r.urgency] || {};
  const dueDays = r.assignment?.dueDate ? window.daysUntil(r.assignment.dueDate) : null;

  const Section = ({ title, children, action }) => (
    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span className="t-label">{title}</span>
        {action}
      </div>
      {children}
    </div>
  );

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(40,38,36,0.32)', zIndex: 100,
      }}></div>
      <aside style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, width: 480,
        background: 'var(--bg-surface)', boxShadow: 'var(--shadow-xl)',
        zIndex: 101, display: 'flex', flexDirection: 'column',
        animation: 'slideIn 280ms cubic-bezier(0.16, 1, 0.3, 1)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="t-mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginBottom: 4 }}>{r.id} · {r.oppId}</div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--fg-primary)', lineHeight: 1.3, letterSpacing: '-0.01em' }}>{r.oppTitle}</h2>
              <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--fg-secondary)' }}>{r.account}</div>
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{
                  padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                  background: meta.bg, color: meta.fg, letterSpacing: '0.02em',
                }}>{meta.label}</span>
                <span style={{
                  padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                  background: urgentMeta.bg, color: urgentMeta.fg,
                }}>{r.urgency}</span>
                <span style={{
                  padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                  background: 'var(--neutral-100)', color: 'var(--neutral-600)',
                }}>{r.projectType}</span>
                {r.assignment && <PriorityChip priority={r.assignment.priority} />}
              </div>
            </div>
            <button onClick={onClose} style={{
              width: 32, height: 32, borderRadius: 6, border: 'none', background: 'transparent',
              color: 'var(--fg-secondary)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}><Close size={18} /></button>
          </div>

          {/* Action buttons */}
          {r.stage === 'Review' ? (
            <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
              <button onClick={onApprove} style={{
                flex: 1, padding: '8px 12px', borderRadius: 7,
                background: 'var(--img-green)', color: '#fff', border: 'none',
                cursor: 'pointer', fontSize: 13, fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}><Check size={14} /> Approve</button>
              <button onClick={onRevise} style={{
                flex: 1, padding: '8px 12px', borderRadius: 7,
                background: 'var(--bg-surface)', color: 'var(--fg-primary)',
                border: '1px solid var(--border-default)', cursor: 'pointer',
                fontSize: 13, fontWeight: 600,
              }}>Request revision</button>
            </div>
          ) : r.stage === 'Approved' ? (
            <button onClick={onRelease} style={{
              width: '100%', marginTop: 14,
              padding: '9px 12px', borderRadius: 7,
              background: 'var(--img-orange)', color: '#fff', border: 'none',
              cursor: 'pointer', fontSize: 13, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>Release to salesman</button>
          ) : !r.assignment && r.stage === 'Incoming' ? (
            <button onClick={onAssign} style={{
              width: '100%', marginTop: 14,
              padding: '8px 12px', borderRadius: 7,
              background: 'var(--img-orange)', color: '#fff', border: 'none',
              cursor: 'pointer', fontSize: 13, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}><Plus /> Assign designer</button>
          ) : null}

          {/* Phase 2 — Return to sales is available on any pre-Released stage */}
          {onReturn && !['Released', 'Returned'].includes(r.stage) && (
            <button onClick={onReturn} style={{
              width: '100%', marginTop: 8,
              padding: '7px 12px', borderRadius: 7,
              background: '#FDECEC', color: '#B0241D',
              border: '1px solid #B0241D',
              cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}>↩ Return to sales</button>
          )}
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Section title="Request">
            <Row label="Requested by">{r.requestedBy}</Row>
            <Row label="Requested">{window.formatDate(r.requestedDate)} ({window.formatRelativeDate(r.requestedDate)})</Row>
            <Row label="Value">{window.formatJOD(r.value)}</Row>
            {r.stage === 'Released' && r.releasedToStage && (
              <Row label="Released to">
                <span style={{
                  padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                  background: r.releasedToStage === 'Tender' ? 'var(--stage-tender-bg)' : 'var(--stage-analysis-bg)',
                  color: r.releasedToStage === 'Tender' ? 'var(--stage-tender)' : 'var(--stage-analysis)',
                }}>{r.releasedToStage}</span>
              </Row>
            )}
            <Row label="Type">
              {r.requestType === 'Modification' ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ padding: '1px 7px', borderRadius: 999, fontSize: 10.5, fontWeight: 700,
                    background: 'var(--img-orange-50)', color: 'var(--img-orange-700, #B8680E)' }}>MODIFICATION</span>
                  {r.version > 1 && <span style={{ fontSize: 11, color: 'var(--fg-secondary)' }}>V{r.version}</span>}
                </span>
              ) : (
                <span>New design{r.version > 1 ? ` · V${r.version} (re-request)` : ''}</span>
              )}
            </Row>
            {r.modificationReason && (
              <Row label="Modification reason">
                <span style={{ fontWeight: 600, color: 'var(--img-orange-700, #B8680E)' }}>{r.modificationReason}</span>
              </Row>
            )}
            {r.notes && (
              <div style={{ marginTop: 10, padding: 12, background: 'var(--neutral-50)', borderRadius: 8, fontSize: 12.5, color: 'var(--fg-primary)', lineHeight: 1.5 }}>
                {r.notes}
              </div>
            )}
          </Section>

          {r.formData && r.formData.form_type && window.DesignRequestSummary && (
            <Section title={`Form submission — ${r.formData.form_type === 'AC' ? 'AC / HVAC نموذج التكييف' : 'Heating نموذج التدفئة'}`}>
              <window.DesignRequestSummary form={r.formData} />
            </Section>
          )}

          <Section title={`Site plans (${r.sitePlans.length})`}>
            {r.sitePlans.length === 0
              ? <div style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>No site plans attached.</div>
              : r.sitePlans.map(f => (
                <div key={f.name} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                  border: '1px solid var(--border-subtle)', borderRadius: 6, fontSize: 12, marginBottom: 6,
                }}>
                  <FileI size={14} style={{ color: 'var(--fg-secondary)' }} />
                  <span style={{ flex: 1, color: 'var(--fg-primary)', fontWeight: 500 }}>{f.name}</span>
                  <span className="t-mono" style={{ color: 'var(--fg-tertiary)', fontSize: 10 }}>{window.formatFileSize(f.size)}</span>
                </div>
              ))}
          </Section>

          {r.assignment && (
            <Section title="Assignment" action={
              <button onClick={onAssign} style={{ background: 'transparent', border: 'none', color: 'var(--img-orange-700)', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <Edit size={11} /> Edit
              </button>
            }>
              <Row label="Designer">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <window.Avatar name={r.assignment.designer} size={20} />
                  {r.assignment.designer}
                </span>
              </Row>
              <Row label="Reviewer">
                {r.assignment.reviewerName ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <window.Avatar name={r.assignment.reviewerName} size={20} />
                    {r.assignment.reviewerName}
                  </span>
                ) : (
                  <span style={{ color: 'var(--fg-tertiary)', fontStyle: 'italic' }}>Any design manager</span>
                )}
              </Row>
              <Row label="Priority"><PriorityChip priority={r.assignment.priority} /></Row>
              <Row label="Estimated">{r.assignment.estimatedHours} hours</Row>
              <Row label="Due">
                {window.formatDate(r.assignment.dueDate)}
                {dueDays != null && (
                  <span style={{
                    fontSize: 11, fontWeight: 600, marginLeft: 8,
                    padding: '2px 6px', borderRadius: 4,
                    background: dueDays < 0 ? 'var(--color-danger-bg)' : dueDays <= 3 ? 'var(--color-warning-bg)' : 'var(--neutral-100)',
                    color:      dueDays < 0 ? '#B0241D' : dueDays <= 3 ? 'var(--img-orange-700)' : 'var(--fg-secondary)',
                  }}>{dueDays < 0 ? `${-dueDays}d overdue` : `${dueDays}d to go`}</span>
                )}
              </Row>
              {r.assignment.designNotes && (
                <div style={{ marginTop: 10, padding: 12, background: 'var(--neutral-50)', borderRadius: 8, fontSize: 12.5, color: 'var(--fg-primary)', lineHeight: 1.5 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Design notes</span>
                  {r.assignment.designNotes}
                </div>
              )}
            </Section>
          )}

          {r.quotations.length > 0 && (
            <Section title={`Quotation versions (${r.quotations.length})`}>
              {r.quotations.map(q => (
                <div key={q.version} style={{
                  border: '1px solid var(--border-subtle)', borderRadius: 6, marginBottom: 8,
                  background: 'var(--bg-surface)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', fontSize: 12, flexWrap: 'wrap',
                    borderBottom: (q.lineItems || []).length ? '1px solid var(--border-subtle)' : 'none' }}>
                    <span style={{
                      padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                      background: 'var(--img-orange-50)', color: 'var(--img-orange-700)',
                    }}>V{q.version}</span>
                    <span style={{ flex: 1, color: 'var(--fg-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.file}</span>
                    {q.totalValue != null && (
                      <span className="t-num" style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-primary)' }}>
                        {window.formatJODshort(q.totalValue)}
                      </span>
                    )}
                    {/* Discount Applied — only the existence is shown to non-PM users; value stays internal. */}
                    {(q.lineItems || []).some(li => (li.discount_pct || 0) > 0) && (
                      <span style={{
                        fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
                        background: 'var(--img-orange-50)', color: 'var(--img-orange-700, #B8680E)',
                        letterSpacing: '0.04em',
                      }}>Discount Applied</span>
                    )}
                    <span style={{
                      fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                      background: q.status === 'Approved' ? 'var(--img-green-50)'   : q.status === 'Submitted' ? 'var(--stage-closing-bg)'  : 'var(--neutral-100)',
                      color:      q.status === 'Approved' ? 'var(--img-green-700)'  : q.status === 'Submitted' ? 'var(--img-green-700)'     : 'var(--fg-secondary)',
                    }}>{q.status}</span>
                  </div>
                  {(q.lineItems || []).length > 0 && (
                    <div style={{ padding: '6px 8px', fontSize: 11 }}>
                      <div style={{
                        display: 'grid', gridTemplateColumns: '64px 90px 1fr 30px 80px 84px',
                        gap: 4, color: 'var(--fg-tertiary)', fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 9.5,
                        padding: '4px 0',
                      }}>
                        <span>Cat</span><span>Model</span><span>Description</span><span>Qty</span><span style={{ textAlign: 'right' }}>Unit price</span><span style={{ textAlign: 'right' }}>Subtotal</span>
                      </div>
                      {q.lineItems.map(li => (
                        <div key={li.id} style={{
                          display: 'grid', gridTemplateColumns: '64px 90px 1fr 30px 80px 84px',
                          gap: 4, padding: '4px 0', borderTop: '1px dashed var(--border-subtle)',
                          fontSize: 11, color: 'var(--fg-primary)',
                        }}>
                          <span style={{ color: 'var(--fg-secondary)' }}>{li.category || '—'}</span>
                          <span className="t-mono" style={{ fontSize: 10.5, color: 'var(--fg-secondary)' }}>{li.model || '—'}</span>
                          <span title={li.is_override ? 'Manually overridden price' : undefined}>
                            {li.description || '—'} {li.unit ? <span style={{ color: 'var(--fg-tertiary)' }}>({li.unit})</span> : null}
                            {li.is_override ? <span style={{ marginLeft: 4, fontSize: 9, fontWeight: 700, color: 'var(--img-orange-700)' }}>· OVR</span> : null}
                          </span>
                          <span className="t-num">{li.qty}</span>
                          <span className="t-num" style={{ textAlign: 'right' }}>{(li.unit_price || 0).toLocaleString()}</span>
                          <span className="t-num" style={{ textAlign: 'right', fontWeight: 600 }}>{(li.subtotal || 0).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </Section>
          )}

          {r.revisionNotes && (
            <Section title="Revision notes (from Sally)">
              <div style={{
                padding: 12, background: 'var(--color-warning-bg)', borderRadius: 8,
                fontSize: 12.5, color: 'var(--img-orange-700)', lineHeight: 1.5,
                border: '1px solid #E89211',
              }}>{r.revisionNotes}</div>
            </Section>
          )}

          {window.DesignRequestThread && (
            <Section title="Notes thread">
              <window.DesignRequestThread request={r} />
            </Section>
          )}
        </div>
      </aside>
      <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
    </>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '6px 0' }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 100 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--fg-primary)', flex: 1 }}>{children}</span>
    </div>
  );
}

// ============================================================
// ASSIGNMENT MODAL
// ============================================================
function AssignmentModal({ request, targetStage, workload, onClose, onSave }) {
  const { ModalShell, Btn, Field, TextInput, Select } = window.PopupShell;
  const designers = (window.USERS || []).filter(u => ['Designer','Design Manager'].includes(u.role));
  // Reviewers = design managers + senior designers (per backend gate).
  const reviewers = (window.USERS || []).filter(u =>
    u.role === 'Design Manager' || (u.role === 'Designer' && u.isSenior)
  );
  const existing = request.assignment;
  const [data, setData] = useState({
    // dbId — the raw integer the backend's WHERE u.id = ? expects (not the 'U0XX' display id).
    designerId:     existing?.designerId     || designers[0]?.dbId || '',
    reviewerId:     existing?.reviewerId     || '',     // empty = "any design manager"
    priority:       existing?.priority       || 2,
    estimatedHours: existing?.estimatedHours || 16,
    dueDate:        existing?.dueDate        || '',
    designNotes:    existing?.designNotes    || '',
  });
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));
  const can = data.designerId && data.dueDate;
  const designer = designers.find(u => String(u.dbId) === String(data.designerId));

  // Show designer current load while assigning — from the live API workload (raw int ids).
  const designerLoad = (workload || []).find(w => String(w.id) === String(data.designerId));
  const overload = window.DESIGNER_OVERLOAD || 4;

  return (
    <ModalShell
      title={existing ? 'Edit assignment' : 'Assign designer'}
      subtitle={`${request.oppTitle} · ${request.account}`}
      onClose={onClose}
      width={560}
      footer={
        <>
          <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" disabled={!can} onClick={() => onSave({
            designerId: data.designerId,
            designer:   designer?.name,
            reviewerId: data.reviewerId || null,
            priority:   +data.priority,
            estimatedHours: +data.estimatedHours,
            dueDate:    data.dueDate,
            designNotes: data.designNotes,
            assignedDate: new Date().toISOString().slice(0, 10),
          })}>Save assignment</Btn>
        </>
      }>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Designer" required hint={designerLoad ? `Currently has ${designerLoad.total} active task(s)${designerLoad.total >= overload ? ' — overloaded' : ''}` : ''}>
          <Select value={data.designerId} onChange={e => set('designerId', e.target.value)}
            options={designers.map(u => ({ value: u.dbId, label: `${u.name} (${u.role})` }))} />
        </Field>
        <Field label="Reviewer" hint="Who approves at the Review stage. Defaults to any design manager — pick a teammate or senior designer to delegate.">
          <Select value={data.reviewerId} onChange={e => set('reviewerId', e.target.value)}
            options={[
              { value: '', label: 'Any design manager (default)' },
              ...reviewers.map(u => ({
                value: u.dbId,
                label: `${u.name} · ${u.role}${u.role === 'Designer' && u.isSenior ? ' (senior)' : ''}`,
              })),
            ]} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Priority">
            <Select value={data.priority} onChange={e => set('priority', e.target.value)}
              options={[
                { value: 1, label: 'P1 · Critical' },
                { value: 2, label: 'P2 · High' },
                { value: 3, label: 'P3 · Normal' },
                { value: 4, label: 'P4 · Low' },
              ]} />
          </Field>
          <Field label="Estimated hours">
            <TextInput type="number" value={data.estimatedHours} onChange={e => set('estimatedHours', e.target.value)} />
          </Field>
        </div>
        <Field label="Due date" required>
          <TextInput type="date" value={data.dueDate} onChange={e => set('dueDate', e.target.value)} />
        </Field>
        <Field label="Design notes" hint="Instructions, constraints, references — visible to the designer">
          <textarea value={data.designNotes} onChange={e => set('designNotes', e.target.value)}
            rows={4}
            style={{
              ...window.PopupShell.inputStyle, height: 'auto',
              padding: 10, resize: 'vertical', fontFamily: 'inherit',
            }} />
        </Field>
      </div>
    </ModalShell>
  );
}

// ============================================================
// REVISION MODAL
// ============================================================
function ReviseModal({ request, onClose, onSave }) {
  const { ModalShell, Btn, Field } = window.PopupShell;
  const [notes, setNotes] = useState('');
  return (
    <ModalShell
      title="Request revision"
      subtitle={`${request.oppTitle} — currently V${request.quotations[request.quotations.length - 1]?.version || 1}`}
      onClose={onClose}
      width={520}
      footer={
        <>
          <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" disabled={!notes.trim()} onClick={() => onSave(notes.trim())}>Send back for revision</Btn>
        </>
      }>
      <div style={{ padding: 20 }}>
        <Field label="Revision notes" required hint="What needs to change? The designer will see this when they open the task.">
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            rows={6}
            placeholder="e.g. Fan capacity is 15% under code minimum. Resize and resubmit."
            style={{
              ...window.PopupShell.inputStyle, height: 'auto',
              padding: 10, resize: 'vertical', fontFamily: 'inherit', width: '100%',
            }} />
        </Field>
      </div>
    </ModalShell>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<DesignBoardApp />);
