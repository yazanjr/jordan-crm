// My Tasks — Designer's view. Lists only requests assigned to the current user.
// Active (Queued + In Progress + Review) and Completed (Released) sections.

const { useState, useMemo, useEffect } = React;

function MyTasksApp() {
  const { Briefcase, Sparkle, Edit, Plus, Calendar, Clock, File: FileI, Attach, Check, ChevDown, Close, Mail, Phone } = window.Icons;

  const me = window.CURRENT_USER;
  const [tasks, setTasks]         = useState([]);   // adapted shape
  const [loadError, setLoadError] = useState(null);
  const [activeNav, setActiveNav] = useState('my-tasks');
  const [popover, setPopover]     = useState(null);
  const [selected, setSelected]   = useState(null);
  const [toast, setToast]         = useState(null);
  const fireToast = (msg, opts = {}) => setToast({ msg, ...opts });

  // ---- Load the real user roster so the sidebar + switcher match every page ----
  const [, setUsersReady] = useState(false);
  useEffect(() => {
    window.loadRealUsers().then(ok => { if (ok) setUsersReady(true); });
  }, []);

  // ---- Load + 30s polling ----
  const reload = React.useCallback(async () => {
    if (!me) return;
    try {
      const data = await window.api.get('/my-design-tasks');
      setTasks((data.tasks || []).map(window.adaptDesignRequest));
      setLoadError(null);
    } catch (e) {
      setLoadError(e.message || 'Failed to load tasks');
      if (e.status !== 403) console.error(e);
    }
  }, [me]);

  useEffect(() => {
    reload();
    const t = setInterval(reload, 30000);
    return () => clearInterval(t);
  }, [reload]);

  // Backward-compat alias — keeps the rest of this file untouched.
  const myTasks = tasks;

  const active    = myTasks.filter(r => r.stage !== 'Released');
  const completed = myTasks.filter(r => r.stage === 'Released');
  const overdue   = active.filter(r => {
    const d = window.daysUntil(r.assignment?.dueDate);
    return d != null && d < 0;
  });

  const startWorking = async (r) => {
    try {
      await window.api.put(`/design-requests/${r.id}/stage`, { stage: 'In Progress' });
      fireToast(`Started "${r.oppTitle}"`);
      reload();
    } catch (e) { fireToast(`Failed: ${e.message}`); }
  };

  const submitForReview = async (r, { lineItems, designerNotes, files, header, discountPct } = {}) => {
    try {
      // Create a new quotation version. Server sums total_value from line_items.
      await window.api.post('/quotation-versions', {
        request_id: r.id,
        line_items: lineItems || [],
        files: files || [],
        designer_notes: designerNotes || null,
        header: header || null,
        discount_pct_global: discountPct || 0,
      });
      // Move stage to Review.
      await window.api.put(`/design-requests/${r.id}/stage`, { stage: 'Review' });
      fireToast(`Submitted "${r.oppTitle}" for review`);
      reload();
    } catch (e) { fireToast(`Failed: ${e.message}`); }
  };

  return (
    <>
      <window.Sidebar
        active={activeNav}
        onNav={(id) => {
          if (id === 'pipeline')       { window.location.href = 'Pipeline.html'; return; }
          if (id === 'contacts')       { window.location.href = 'Contacts.html'; return; }
          if (id === 'reports')        { window.location.href = 'Reports.html'; return; }
          if (id === 'design-board')   { window.location.href = 'DesignBoard.html'; return; }
          if (id === 'pricelist')      { window.location.href = 'Pricelist.html'; return; }
          if (id === 'costing')        { window.location.href = 'QuotationCosting.html'; return; }
          setActiveNav(id);
        }}
        onUserMenu={(rect) => setPopover({ kind: 'user', rect })}
        onNotifications={(rect) => setPopover({ kind: 'notif', rect })}
      />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <window.TopBar title="My Tasks" right={null} />

        {/* Stat strip */}
        <div style={{
          padding: '14px 24px', borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16,
        }}>
          <Stat label="Active" value={active.length} accent="orange" />
          <Stat label="In review" value={active.filter(r => r.stage === 'Review').length} accent="green" />
          <Stat label="Overdue" value={overdue.length} accent={overdue.length ? 'danger' : null} />
          <Stat label="Completed" value={completed.length} />
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)' }}>
          {!me ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-tertiary)' }}>No user selected.</div>
          ) : !['Designer','Design Manager'].includes(me.role) ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--fg-tertiary)' }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>This page is for designers.</div>
              <div style={{ fontSize: 12 }}>You're logged in as <b>{me.name}</b> (role: {me.role}). Switch user from the sidebar to preview as a designer or design manager.</div>
            </div>
          ) : loadError ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#B0241D' }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Couldn't load your tasks.</div>
              <div style={{ fontSize: 12, color: 'var(--fg-secondary)' }}>{loadError}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 8 }}>You're signed in as <b>{me.name}</b>. If you're not the assigned designer on any task, this list will be empty.</div>
            </div>
          ) : (
            <>
              <SectionHeader title={`Active (${active.length})`} subtitle="Queued, in progress, and awaiting review" />
              {active.length === 0 ? (
                <EmptyRow>You have no active design tasks. New assignments will appear here.</EmptyRow>
              ) : (
                <div>
                  {active
                    .slice()
                    .sort((a, b) => (a.assignment?.priority || 9) - (b.assignment?.priority || 9))
                    .map(r => (
                      <TaskRow key={r.id} request={r}
                        onOpen={() => setSelected(r)}
                        onStart={() => startWorking(r)}
                        onSubmit={() => submitForReview(r)}
                      />
                    ))}
                </div>
              )}

              <SectionHeader title={`Completed (${completed.length})`} subtitle="Released and approved" />
              {completed.length === 0 ? (
                <EmptyRow>No completed tasks yet.</EmptyRow>
              ) : (
                <div>
                  {completed.map(r => (
                    <TaskRow key={r.id} request={r} onOpen={() => setSelected(r)} compact />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Detail drawer */}
      {selected && <TaskDetail
        request={selected}
        onClose={() => setSelected(null)}
        onStart={() => startWorking(selected)}
        onSubmit={(payload) => { submitForReview(selected, payload); setSelected(null); }}
      />}

      {/* Popovers */}
      {popover?.kind === 'notif' && <window.NotificationsPopover anchorRect={popover.rect} onClose={() => setPopover(null)} />}
      {popover?.kind === 'user'  && <window.UserMenu anchorRect={popover.rect} onClose={() => setPopover(null)} onAction={(a) => fireToast(`Open ${a}…`)} />}

      <window.Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

// ============================================================
// SECTIONS / PRIMITIVES
// ============================================================
function Stat({ label, value, accent }) {
  const colors = {
    orange: 'var(--img-orange-700)',
    green:  'var(--img-green-700)',
    danger: '#B0241D',
  };
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div className="t-num" style={{ fontSize: 22, fontWeight: 700, color: colors[accent] || 'var(--fg-primary)', letterSpacing: '-0.01em' }}>{value}</div>
    </div>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div style={{
      padding: '14px 24px 8px', display: 'flex', alignItems: 'baseline', gap: 10,
      borderBottom: '1px solid var(--border-subtle)',
      background: 'var(--neutral-50)',
    }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fg-primary)', letterSpacing: '-0.01em' }}>{title}</span>
      {subtitle && <span style={{ fontSize: 11, color: 'var(--fg-secondary)' }}>· {subtitle}</span>}
    </div>
  );
}

function EmptyRow({ children }) {
  return <div style={{ padding: 30, textAlign: 'center', color: 'var(--fg-tertiary)', fontSize: 12.5, background: 'var(--bg-surface)' }}>{children}</div>;
}

function TaskRow({ request, onOpen, onStart, onSubmit, compact }) {
  const { File: FileI, Attach, Calendar, Clock, Check, ChevRight } = window.Icons;
  const r = request;
  const meta = window.DESIGN_STAGE_META[r.stage];
  const urgentMeta = window.URGENCY_META[r.urgency] || {};
  const dueDays = r.assignment?.dueDate ? window.daysUntil(r.assignment.dueDate) : null;
  const overdue = dueDays != null && dueDays < 0;
  const dueSoon = dueDays != null && dueDays >= 0 && dueDays <= 3;
  const latestQuote = r.quotations[r.quotations.length - 1];
  const hasRevision = r.stage === 'In Progress' && r.revisionNotes;

  return (
    <div onClick={onOpen} style={{
      display: 'grid',
      gridTemplateColumns: hasRevision ? '4px 1fr 280px' : '4px 1fr 280px',
      gap: 16, padding: '14px 24px',
      borderBottom: '1px solid var(--border-subtle)',
      background: 'var(--bg-surface)', cursor: 'pointer',
      transition: 'background 100ms',
    }}
    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
    onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-surface)'}>
      <div style={{ background: meta.fg, borderRadius: 2 }}></div>

      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
          <span className="t-mono" style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>{r.id} · {r.oppId}</span>
          <span style={{ padding: '2px 7px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: meta.bg, color: meta.fg, letterSpacing: '0.02em' }}>{meta.label}</span>
          {r.assignment && <window.PriorityChip priority={r.assignment.priority} />}
          <span style={{ padding: '2px 7px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: urgentMeta.bg, color: urgentMeta.fg }}>{r.urgency}</span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-primary)', lineHeight: 1.3 }}>{r.oppTitle}</div>
        <div style={{ fontSize: 12, color: 'var(--fg-secondary)', marginTop: 2 }}>
          {r.account}{r.scope ? ` · ${r.scope}` : ''} · Requested by {r.requestedBy}
        </div>
        {hasRevision && (
          <div style={{
            marginTop: 8, padding: '8px 10px', borderRadius: 6,
            background: 'var(--color-warning-bg)', color: 'var(--img-orange-700)',
            fontSize: 11.5, fontWeight: 500, lineHeight: 1.4,
            borderLeft: '3px solid #E89211',
          }}>
            <strong>Revision requested:</strong> {r.revisionNotes}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, minWidth: 0 }}>
        {!compact && r.assignment && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--fg-secondary)' }}>
              <Clock size={11} /> Est. {r.assignment.estimatedHours}h
            </span>
            {dueDays != null && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 7px', borderRadius: 4,
                background: overdue ? 'var(--color-danger-bg)' : dueSoon ? 'var(--color-warning-bg)' : 'var(--neutral-100)',
                color:      overdue ? '#B0241D' : dueSoon ? 'var(--img-orange-700)' : 'var(--fg-secondary)',
                fontWeight: 600,
              }}>
                <Calendar size={11} />
                {overdue ? `${-dueDays}d overdue` : dueDays === 0 ? 'due today' : `${dueDays}d to go`}
              </span>
            )}
          </div>
        )}
        {latestQuote && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
            background: 'var(--img-orange-50)', color: 'var(--img-orange-700)',
          }}>V{latestQuote.version} · {latestQuote.status}</span>
        )}
        {!compact && (
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }} onClick={e => e.stopPropagation()}>
            {r.stage === 'Queued' && (
              <button onClick={onStart} style={primaryBtn}>
                <Check size={12} /> Start working
              </button>
            )}
            {r.stage === 'In Progress' && (
              <button onClick={onSubmit} style={primaryBtn}>
                <ChevRight size={12} /> Submit for review
              </button>
            )}
            {r.stage === 'Review' && (
              <span style={{ fontSize: 11, color: 'var(--fg-secondary)', fontStyle: 'italic' }}>Waiting on Sally's review</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

window.PriorityChip = function PriorityChip({ priority }) {
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
};

const primaryBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '6px 12px', borderRadius: 6,
  background: 'var(--img-orange)', color: '#fff', border: 'none',
  cursor: 'pointer', fontSize: 12, fontWeight: 600,
};

// ============================================================
// TASK DETAIL DRAWER (designer side — view brief, upload, submit)
// ============================================================
function TaskDetail({ request, onClose, onStart, onSubmit }) {
  const { Close, Calendar, File: FileI, Attach, Check, ChevRight, Sparkle, Edit, Plus } = window.Icons;
  const r = request;
  const meta = window.DESIGN_STAGE_META[r.stage];
  const urgentMeta = window.URGENCY_META[r.urgency] || {};
  const dueDays = r.assignment?.dueDate ? window.daysUntil(r.assignment.dueDate) : null;

  // ── Quotation header (editable customer-facing fields). Defaults come from
  // the deal + design request. The reference auto-generates from the opp id.
  const meId = window.CURRENT_USER?.dbId;
  const meName = window.CURRENT_USER?.name || 'Designer';
  const defaultHeader = () => ({
    reference:             `IMG_${r.oppId?.toString().replace(/[^0-9]/g, '') || 'X'}_V${(r.quotations.length || 0) + 1}`,
    quote_date:            new Date().toISOString().slice(0, 10),
    project_name:          r.oppTitle || '',
    city:                  '',
    project_type:          '',
    pricing_mode:          (r.formData && r.formData.project_nature) || '',
    sales_engineer_name:   r.salesmanName || '',
    design_engineer_name:  meName,
    brand:                 'Gree',
    intro_text:            '',
    maintenance_text:      '',
    tnc_text:              '',
  });
  const [header, setHeader] = useState(defaultHeader);
  const setHdr = (k, v) => setHeader(h => ({ ...h, [k]: v }));
  const [headerExpanded, setHeaderExpanded] = useState(true);

  // ── Global discount % (0–30 for now; higher needs approval — not wired).
  const [discountPct, setDiscountPct] = useState(0);   // 0–30 (UI integer)
  const discountFraction = Math.max(0, Math.min(30, Number(discountPct) || 0)) / 100;

  // ── Categories (loaded once)
  const [categories, setCategories] = useState([]);
  useEffect(() => {
    window.api.get('/product-skus/categories?brand=Gree').then(setCategories).catch(() => {});
  }, []);

  // ── Line items. Each line knows its sku_id (or null for manual override).
  const blankItem = () => ({
    category: '',
    sku_id: null,
    model: '',
    description: '',
    list_price: 0,
    qty: 1,
    unit: 'pc',
    unit_price: 0,
    is_override: 0,
    models: [],     // populated when category is picked
  });
  const [lineItems, setLineItems] = useState([blankItem()]);
  const setItem = (i, patch) => setLineItems(items => items.map((it, j) => j === i ? { ...it, ...patch } : it));
  const addItem = () => setLineItems(items => [...items, blankItem()]);
  const removeItem = (i) => setLineItems(items => items.length > 1 ? items.filter((_, j) => j !== i) : items);

  const pickCategory = async (i, category) => {
    setItem(i, { category, models: [], sku_id: null, model: '', description: '', list_price: 0, unit_price: 0 });
    if (!category) return;
    try {
      const models = await window.api.get(`/product-skus?brand=Gree&category=${encodeURIComponent(category)}`);
      setLineItems(items => items.map((it, j) => j === i ? { ...it, models } : it));
    } catch (e) { /* ignore */ }
  };
  const pickModel = (i, skuId) => {
    setLineItems(items => items.map((it, j) => {
      if (j !== i) return it;
      const sku = (it.models || []).find(m => String(m.id) === String(skuId));
      if (!sku) return { ...it, sku_id: null };
      const unit_price = +(sku.list_price * (1 - discountFraction)).toFixed(2);
      return {
        ...it,
        sku_id: sku.id, model: sku.model,
        description: sku.description || '',
        list_price: sku.list_price,
        unit: sku.unit || 'pc',
        unit_price,
        is_override: 0,
      };
    }));
  };
  // When the global discount changes, recompute unit_price for non-override lines.
  useEffect(() => {
    setLineItems(items => items.map(it => {
      if (it.is_override || !it.list_price) return it;
      return { ...it, unit_price: +(it.list_price * (1 - discountFraction)).toFixed(2) };
    }));
    // intentionally exclude lineItems from deps to avoid loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discountFraction]);

  const setUnitPriceOverride = (i, val) => {
    setLineItems(items => items.map((it, j) => {
      if (j !== i) return it;
      const v = Number(val) || 0;
      const computed = it.list_price ? +(it.list_price * (1 - discountFraction)).toFixed(2) : 0;
      return { ...it, unit_price: v, is_override: Math.abs(v - computed) > 0.5 ? 1 : 0 };
    }));
  };

  const itemSubtotal = it => (+it.qty || 0) * (+it.unit_price || 0);
  const totalValue = lineItems.reduce((s, it) => s + itemSubtotal(it), 0);
  const validItems = lineItems.filter(it => it.sku_id && (+it.qty > 0));
  const canSubmit = validItems.length > 0;

  const [designerNotes, setDesignerNotes] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploadName, setUploadName] = useState('');
  const addFile = () => {
    if (!uploadName.trim()) return;
    setPendingFiles(fs => [...fs, { name: uploadName.trim(), size: Math.round(Math.random() * 3000000) + 200000 }]);
    setUploadName('');
  };

  const handleSubmit = () => {
    onSubmit({
      header,
      discountPct: discountFraction,
      lineItems: validItems.map(it => ({
        sku_id: it.sku_id,
        category: it.category,
        model: it.model,
        description: it.description,
        qty: +it.qty,
        unit: it.unit,
        list_price: it.list_price,
        discount_pct: discountFraction,
        unit_price: it.unit_price,
      })),
      designerNotes: designerNotes.trim() || null,
      files: pendingFiles,
    });
  };

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
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(40,38,36,0.32)', zIndex: 100 }}></div>
      <aside style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, width: 500,
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
                <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: meta.bg, color: meta.fg, letterSpacing: '0.02em' }}>{meta.label}</span>
                <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: urgentMeta.bg, color: urgentMeta.fg }}>{r.urgency}</span>
                {r.assignment && <window.PriorityChip priority={r.assignment.priority} />}
              </div>
            </div>
            <button onClick={onClose} style={{
              width: 32, height: 32, borderRadius: 6, border: 'none', background: 'transparent',
              color: 'var(--fg-secondary)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}><Close size={18} /></button>
          </div>

          {/* Primary action */}
          {r.stage === 'Queued' && (
            <button onClick={onStart} style={{
              width: '100%', marginTop: 14,
              padding: '9px 12px', borderRadius: 7,
              background: 'var(--img-orange)', color: '#fff', border: 'none',
              cursor: 'pointer', fontSize: 13, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}><Check size={14} /> Start working</button>
          )}
          {r.stage === 'In Progress' && (
            <button onClick={handleSubmit} disabled={!canSubmit} style={{
              width: '100%', marginTop: 14,
              padding: '9px 12px', borderRadius: 7,
              background: canSubmit ? 'var(--img-orange)' : 'var(--neutral-200)',
              color: '#fff', border: 'none',
              cursor: canSubmit ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <ChevRight size={14} /> Submit for review · {window.formatJOD(totalValue)}
              <span style={{ fontSize: 10, fontWeight: 600, marginLeft: 4, opacity: 0.85 }}>(as V{(r.quotations.length || 0) + 1})</span>
            </button>
          )}
          {r.stage === 'Review' && (
            <div style={{ marginTop: 14, padding: 10, borderRadius: 7, background: 'var(--stage-closing-bg)', color: 'var(--img-green-700)', fontSize: 12, fontWeight: 500, textAlign: 'center' }}>
              Submitted — waiting on Sally's review.
            </div>
          )}
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {r.revisionNotes && r.stage === 'In Progress' && (
            <Section title="Revision requested by Sally">
              <div style={{
                padding: 14, background: 'var(--color-warning-bg)', borderRadius: 8,
                fontSize: 13, color: 'var(--img-orange-700)', lineHeight: 1.5,
                border: '1px solid #E89211', fontWeight: 500,
              }}>{r.revisionNotes}</div>
            </Section>
          )}

          <Section title="Brief">
            <Row label="Requested by">{r.requestedBy}</Row>
            <Row label="Requested">{window.formatDate(r.requestedDate)} ({window.formatRelativeDate(r.requestedDate)})</Row>
            <Row label="Project type">{r.projectType}</Row>
            <Row label="Value">{window.formatJOD(r.value)}</Row>
            {r.notes && (
              <div style={{ marginTop: 10, padding: 12, background: 'var(--neutral-50)', borderRadius: 8, fontSize: 12.5, color: 'var(--fg-primary)', lineHeight: 1.5 }}>
                {r.notes}
              </div>
            )}
          </Section>

          {r.assignment && (
            <Section title="Your assignment">
              <Row label="Reviewer">
                {r.assignment.reviewerName
                  ? <><b>{r.assignment.reviewerName}</b> will review your V<sup>n</sup></>
                  : <span style={{ color: 'var(--fg-tertiary)' }}>Any design manager (Sally)</span>}
              </Row>
              <Row label="Priority"><window.PriorityChip priority={r.assignment.priority} /></Row>
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
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Sally's design notes</span>
                  {r.assignment.designNotes}
                </div>
              )}
            </Section>
          )}

          {r.formData && r.formData.form_type && window.DesignRequestSummary && (
            <Section title={`Form submission — ${r.formData.form_type === 'AC' ? 'AC / HVAC' : 'Heating'}`}>
              <window.DesignRequestSummary form={r.formData} />
            </Section>
          )}

          {window.DesignRequestThread && (
            <Section title="Notes thread">
              <window.DesignRequestThread request={r} />
            </Section>
          )}

          <Section title={`Site plans from sales (${r.sitePlans.length})`}>
            {r.sitePlans.length === 0
              ? <div style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>No files attached.</div>
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

          {/* Quotation submission form lives on a dedicated page now — opens
              in a wide single-column layout so input changes don't scroll the
              drawer around (Phase 8.1 fix). */}
          {r.stage === 'In Progress' && (
            <Section title={`Submit V${(r.quotations.length || 0) + 1}`}>
              <a href={`Quotation.html?requestId=${r.id}`} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '14px 18px', borderRadius: 8, textDecoration: 'none',
                background: 'var(--img-orange)', color: '#fff',
                fontSize: 14, fontWeight: 700,
              }}>Open quotation editor →</a>
              <div style={{ fontSize: 11.5, color: 'var(--fg-tertiary)', marginTop: 8, lineHeight: 1.45 }}>
                The editor is a full-page form so you can fill the quotation header, pick line items, set the discount, and choose whether the release goes to Tender or Analysis. It opens in this tab; submitting brings you back here.
              </div>
            </Section>
          )}

          {/* OLD in-drawer editor — kept commented for reference / fallback. */}
          {false && r.stage === 'In Progress' && (
            <Section title={`Submit V${(r.quotations.length || 0) + 1}`} action={<span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>total auto-sums</span>}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* ── Header block (collapsible). All fields shown on the customer PDF. */}
                <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 7, overflow: 'hidden' }}>
                  <button onClick={() => setHeaderExpanded(v => !v)} style={{
                    width: '100%', textAlign: 'left', padding: '8px 10px', background: 'var(--neutral-25)',
                    border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    fontSize: 11.5, fontWeight: 700, color: 'var(--fg-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>
                    <span>Quotation header — {header.reference || 'New'}</span>
                    <span style={{ fontSize: 12 }}>{headerExpanded ? '▾' : '▸'}</span>
                  </button>
                  {headerExpanded && (
                    <div style={{ padding: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {[
                        ['reference',            'Reference'],
                        ['quote_date',           'Date',          'date'],
                        ['project_name',         'Project name'],
                        ['city',                 'City'],
                        ['project_type',         'Project type'],
                        ['pricing_mode',         'Pricing mode'],
                        ['sales_engineer_name',  'Sales engineer'],
                        ['design_engineer_name', 'Design engineer'],
                      ].map(([key, label, type]) => (
                        <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--fg-tertiary)' }}>
                          <span style={{ fontWeight: 600 }}>{label}</span>
                          <input type={type || 'text'} value={header[key] || ''} onChange={e => setHdr(key, e.target.value)}
                            style={{ ...window.PopupShell.inputStyle, padding: '5px 7px', fontSize: 12 }} />
                        </label>
                      ))}
                      <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--fg-tertiary)' }}>
                        <span style={{ fontWeight: 600 }}>Brand intro (optional — leave blank for default)</span>
                        <textarea rows={2} value={header.intro_text || ''} onChange={e => setHdr('intro_text', e.target.value)}
                          style={{ ...window.PopupShell.inputStyle, padding: 6, fontSize: 12, height: 'auto', resize: 'vertical', fontFamily: 'inherit' }} />
                      </label>
                    </div>
                  )}
                </div>

                {/* ── Global discount */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                  background: discountPct > 0 ? 'var(--img-orange-50)' : 'var(--neutral-25)',
                  border: `1px solid ${discountPct > 0 ? 'var(--img-orange)' : 'var(--border-subtle)'}`,
                  borderRadius: 7 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-secondary)' }}>Sales discount</span>
                  <input type="number" min="0" max="30" step="0.5"
                    value={discountPct}
                    onChange={e => setDiscountPct(Math.max(0, Math.min(30, Number(e.target.value) || 0)))}
                    style={{ width: 70, ...window.PopupShell.inputStyle, padding: '5px 7px', fontSize: 13, textAlign: 'right' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg-primary)' }}>%</span>
                  <span style={{ flex: 1, fontSize: 10.5, color: 'var(--fg-tertiary)', fontStyle: 'italic' }}>
                    Internal only — customer sees "Discount Applied" if {`>`} 0. Max 30% without approval. Higher tiers need Sales Manager (30–40%) or HVAC GM (40%+).
                  </span>
                </div>

                {/* ── Line items: category → model picker */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-secondary)', marginBottom: 6 }}>Line items</div>
                  <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 7, overflow: 'hidden' }}>
                    <div style={{
                      display: 'grid', gridTemplateColumns: '120px 130px 1fr 50px 70px 80px 26px',
                      gap: 6, padding: '6px 8px', background: 'var(--neutral-25)',
                      fontSize: 10.5, fontWeight: 700, color: 'var(--fg-tertiary)',
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}>
                      <span>Category</span><span>Model</span><span>Description</span><span>Qty</span><span>Unit price</span><span>Subtotal</span><span></span>
                    </div>
                    {lineItems.map((it, i) => {
                      const sub = itemSubtotal(it);
                      const cellStyle = { ...window.PopupShell.inputStyle, padding: '4px 6px', fontSize: 12 };
                      return (
                        <div key={i} style={{
                          display: 'grid', gridTemplateColumns: '120px 130px 1fr 50px 70px 80px 26px',
                          gap: 6, padding: '6px 8px',
                          borderBottom: '1px solid var(--border-subtle)', alignItems: 'center',
                        }}>
                          <select value={it.category} onChange={e => pickCategory(i, e.target.value)} style={cellStyle}>
                            <option value="">— pick —</option>
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <select value={it.sku_id || ''} onChange={e => pickModel(i, e.target.value)}
                            disabled={!it.category} style={{ ...cellStyle, opacity: it.category ? 1 : 0.5 }}>
                            <option value="">— pick —</option>
                            {(it.models || []).map(m => <option key={m.id} value={m.id}>{m.model}</option>)}
                          </select>
                          <input value={it.description} onChange={e => setItem(i, { description: e.target.value })}
                            placeholder="Customer-facing description" style={cellStyle} title={it.is_override ? 'Manually edited' : ''} />
                          <input type="number" min="0" value={it.qty} onChange={e => setItem(i, { qty: e.target.value })} style={{ ...cellStyle, textAlign: 'right' }} />
                          <input type="number" min="0" value={it.unit_price} onChange={e => setUnitPriceOverride(i, e.target.value)}
                            style={{ ...cellStyle, textAlign: 'right', background: it.is_override ? 'var(--img-orange-50)' : undefined }}
                            title={it.is_override ? `Override — list price was ${it.list_price}` : `Auto = list ${it.list_price} × (1 − ${(discountFraction*100).toFixed(1)}%)`} />
                          <span className="t-num" style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-primary)', textAlign: 'right' }}>
                            {sub ? sub.toLocaleString() : '—'}
                          </span>
                          <button onClick={() => removeItem(i)} disabled={lineItems.length === 1}
                            title="Remove line"
                            style={{
                              width: 22, height: 22, borderRadius: 4,
                              border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
                              color: lineItems.length === 1 ? 'var(--neutral-300)' : 'var(--fg-secondary)',
                              cursor: lineItems.length === 1 ? 'not-allowed' : 'pointer',
                              fontSize: 13, lineHeight: 1,
                            }}>×</button>
                        </div>
                      );
                    })}
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 10px', background: 'var(--neutral-25)',
                    }}>
                      <button onClick={addItem} style={{
                        padding: '5px 10px', borderRadius: 6,
                        background: 'var(--bg-surface)', color: 'var(--img-orange-700, #B8680E)',
                        border: '1px dashed var(--img-orange)', cursor: 'pointer',
                        fontSize: 11.5, fontWeight: 600,
                      }}>+ Add line</button>
                      <div className="t-num" style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg-primary)' }}>
                        Total: {window.formatJOD(totalValue)}
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-secondary)', marginBottom: 4 }}>Designer notes (optional)</div>
                  <textarea value={designerNotes} onChange={e => setDesignerNotes(e.target.value)}
                    rows={3} placeholder="Anything Sally should know about this version…"
                    style={{ width: '100%', ...window.PopupShell.inputStyle, height: 'auto', padding: 10, resize: 'vertical', fontFamily: 'inherit' }} />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-secondary)', marginBottom: 4 }}>Attach files</div>
                  <div style={{
                    padding: 10, border: '1px dashed var(--border-default)', borderRadius: 7,
                    background: 'var(--neutral-25)', display: 'flex', flexDirection: 'column', gap: 8,
                  }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        value={uploadName} onChange={e => setUploadName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFile(); } }}
                        placeholder="e.g. design-rev2.dwg"
                        style={{ flex: 1, ...window.PopupShell.inputStyle }} />
                      <button onClick={addFile} disabled={!uploadName.trim()} style={{
                        padding: '6px 12px', borderRadius: 7, border: 'none',
                        background: uploadName.trim() ? 'var(--img-orange)' : 'var(--neutral-200)',
                        color: '#fff', cursor: uploadName.trim() ? 'pointer' : 'not-allowed',
                        fontSize: 12, fontWeight: 600,
                      }}>Add</button>
                    </div>
                    {pendingFiles.map((f, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                        background: 'var(--bg-surface)', borderRadius: 5, fontSize: 11.5,
                      }}>
                        <FileI size={12} style={{ color: 'var(--fg-secondary)' }} />
                        <span style={{ flex: 1 }}>{f.name}</span>
                        <button onClick={() => setPendingFiles(fs => fs.filter((_, j) => j !== i))}
                          style={{ border: 'none', background: 'transparent', color: 'var(--fg-tertiary)', cursor: 'pointer', fontSize: 16 }}>×</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Section>
          )}

          {r.quotations.length > 0 && (
            <Section title={`Quotation versions (${r.quotations.length})`}>
              {r.quotations.map(q => (
                <div key={q.version} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                  border: '1px solid var(--border-subtle)', borderRadius: 6, fontSize: 12, marginBottom: 6,
                }}>
                  <span style={{
                    padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                    background: 'var(--img-orange-50)', color: 'var(--img-orange-700)',
                  }}>V{q.version}</span>
                  <span style={{ flex: 1, color: 'var(--fg-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.file}</span>
                  <span style={{
                    fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                    background: q.status === 'Approved' ? 'var(--img-green-50)'   : q.status === 'Submitted' ? 'var(--stage-closing-bg)'  : 'var(--neutral-100)',
                    color:      q.status === 'Approved' ? 'var(--img-green-700)'  : q.status === 'Submitted' ? 'var(--img-green-700)'     : 'var(--fg-secondary)',
                  }}>{q.status}</span>
                </div>
              ))}
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

ReactDOM.createRoot(document.getElementById('root')).render(<MyTasksApp />);
