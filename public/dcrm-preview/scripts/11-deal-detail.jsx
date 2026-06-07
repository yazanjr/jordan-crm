// Right-side deal-detail drawer. Shows when a deal is clicked.
// Every field in "Details" is inline-editable: click → input, Enter/blur saves.
// Header value, probability, name, and stage are also editable.

function DealDetail({ deal, onClose, onAdvance, onMore, onUpdate, onAction, showActivity = true, showFiles = true }) {
  const { Close, Calendar, Mail, Phone, Building, File, Chat, Attach, More, Plus, Check, Edit } = window.Icons;
  if (!deal) return null;

  const save = (patch) => onUpdate?.(patch);
  const act = (a, payload) => onAction?.(a, payload);

  const Section = ({ title, action, children }) => (
    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span className="t-label">{title}</span>
        {action}
      </div>
      {children}
    </div>
  );

  const probColor = deal.probability >= 70 ? 'var(--img-green)' :
                    deal.probability >= 40 ? 'var(--img-orange)' :
                                             'var(--neutral-400)';

  // Owners + scopes + stages — kept in sync with NewDealModal
  const OWNERS = ['Hala Jaber', 'Rami Haddad', 'Sana Khalil', 'Ahmad Marji', 'Layla Odeh'];
  const SCOPES = ['VRF', 'Chillers', 'AHU', 'FCU', 'Chillers + AHU', 'Full MEP HVAC', 'Industrial vent.', 'Central plant', 'VRF + AHU', 'AHU + ducting', 'Full HVAC'];
  const STAGES = ['prospect', 'tender', 'analysis', 'negotiation', 'closing', 'won', 'lost'];

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(40, 38, 36, 0.32)',
        zIndex: 100, animation: 'fadeIn 180ms cubic-bezier(0.2, 0, 0, 1)',
      }}></div>

      {/* Drawer */}
      <aside style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, width: 460,
        background: 'var(--bg-surface)', boxShadow: 'var(--shadow-xl)',
        zIndex: 101, display: 'flex', flexDirection: 'column',
        animation: 'slideIn 280ms cubic-bezier(0.16, 1, 0.3, 1)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="t-mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginBottom: 4 }}>{deal.id}</div>

              {/* Editable deal name */}
              <EditableText
                value={deal.name}
                onSave={(v) => v.trim() && save({ name: v.trim() })}
                multiline
                style={{
                  margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--fg-primary)',
                  letterSpacing: '-0.01em', lineHeight: 1.3,
                }}
                hoverHint="Click to rename"
              />

              {/* Editable stage */}
              <div style={{ marginTop: 8, display: 'inline-block' }}>
                <EditableSelect
                  value={deal.stage}
                  options={STAGES.map(s => ({ value: s, label: window.STAGE_META[s]?.label || s }))}
                  onSave={(v) => save({ stage: v })}
                  renderDisplay={() => <window.StageChip stage={deal.stage} />}
                />
              </div>
            </div>
            <button onClick={onClose} title="Close" style={{
              width: 32, height: 32, borderRadius: 6, border: 'none', background: 'transparent',
              color: 'var(--fg-secondary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}><Close size={18} /></button>
          </div>

          {/* Big value — both fields editable */}
          <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--neutral-50)', borderRadius: 8, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 11, color: 'var(--fg-secondary)', fontWeight: 500 }}>Deal value</span>
              <EditableNumber
                value={deal.value}
                onSave={(v) => save({ value: v })}
                format={(n) => window.formatJOD(n)}
                style={{
                  fontSize: 22, fontWeight: 700, color: 'var(--fg-primary)',
                  letterSpacing: '-0.02em',
                }}
                className="t-num"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span style={{ fontSize: 11, color: 'var(--fg-secondary)', fontWeight: 500 }}>Probability</span>
              <EditableNumber
                value={deal.probability}
                onSave={(v) => save({ probability: Math.max(0, Math.min(100, v)) })}
                format={(n) => `${n}%`}
                style={{
                  fontSize: 22, fontWeight: 700, color: probColor,
                  letterSpacing: '-0.02em',
                }}
                className="t-num"
                align="right"
                max={100}
              />
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            <button onClick={() => onAdvance?.(deal)} style={{
              flex: 1, padding: '7px 10px', height: 32, borderRadius: 7,
              background: 'var(--img-orange)', color: '#fff', border: 'none',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}><Check size={14} /> Move to next stage</button>
            <button onClick={() => act('quote')} style={{
              padding: '7px 10px', height: 32, borderRadius: 7,
              background: 'var(--bg-surface)', color: 'var(--fg-primary)',
              border: '1px solid var(--border-default)',
              fontSize: 12, fontWeight: 500, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-surface)'}
            ><File size={14} /> Quote</button>
            <button title="More" onClick={e => onMore?.(deal, e.currentTarget.getBoundingClientRect())} style={{
              width: 32, height: 32, borderRadius: 7,
              background: 'var(--bg-surface)', color: 'var(--fg-primary)',
              border: '1px solid var(--border-default)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}><More size={14} /></button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Section title="Details">
            <EditableField label="Account" type="text"
              value={deal.account} onSave={(v) => save({ account: v })} />
            <EditableField label="Owner" type="select"
              value={deal.owner} options={OWNERS.map(o => ({ value: o, label: o }))}
              onSave={(v) => save({ owner: v })} />
            <EditableField label="HVAC scope" type="select"
              value={deal.scope} options={SCOPES.map(s => ({ value: s, label: s }))}
              onSave={(v) => save({ scope: v })} />
            <EditableField label="Days in stage" type="number" suffix=" days"
              value={deal.age} onSave={(v) => save({ age: Math.max(0, v|0) })} />
            <EditableField label="Expected close" type="date"
              value={deal.closeDate}
              display={window.formatDate(deal.closeDate)}
              onSave={(v) => save({ closeDate: v })} />
          </Section>

          <Section title="Contacts" action={
            <button onClick={() => act('addContact')} style={{ background: 'transparent', border: 'none', color: 'var(--img-orange-700)', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--img-orange)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--img-orange-700)'}
            ><Plus size={11} />Add</button>
          }>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { name: 'Khaled Mansour', role: 'Facilities Director', email: 'k.mansour@example.com', phone: '+962 79 555 0142' },
                { name: 'Nour El-Saidi',   role: 'Procurement Lead',    email: 'n.elsaidi@example.com', phone: '+962 79 555 0331' },
              ].map(c => (
                <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                  <window.Avatar name={c.name} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-primary)' }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--fg-secondary)' }}>{c.role}</div>
                  </div>
                  <a
                    href={`mailto:${c.email}`}
                    title={`Email ${c.email}`}
                    onClick={(e) => { e.stopPropagation(); act('email', c); }}
                    style={{ ...iconBtn, textDecoration: 'none' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--img-orange-50)'; e.currentTarget.style.color = 'var(--img-orange-700)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-surface)'; e.currentTarget.style.color = 'var(--fg-secondary)'; }}
                  ><Mail size={14} /></a>
                  <a
                    href={`tel:${c.phone.replace(/\s+/g, '')}`}
                    title={`Call ${c.phone}`}
                    onClick={(e) => { e.stopPropagation(); act('call', c); }}
                    style={{ ...iconBtn, textDecoration: 'none' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--img-orange-50)'; e.currentTarget.style.color = 'var(--img-orange-700)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-surface)'; e.currentTarget.style.color = 'var(--fg-secondary)'; }}
                  ><Phone size={14} /></a>
                </div>
              ))}
            </div>
          </Section>

          {showActivity && (
            <Section title="Activity">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
                {[
                  { who: 'Rami Haddad',  what: 'sent revised BoQ',                when: '2 hours ago',  icon: File },
                  { who: 'Sana Khalil',  what: 'logged a call with Khaled M.',   when: 'yesterday',    icon: Phone },
                  { who: 'Hala Jaber',   what: 'moved deal to Tender',           when: '3 days ago',   icon: Check },
                  { who: 'Ahmad Marji',  what: 'attached chiller datasheet.pdf', when: '5 days ago',   icon: Attach },
                ].map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                    <span style={{
                      width: 26, height: 26, borderRadius: '50%', background: 'var(--neutral-100)',
                      color: 'var(--fg-secondary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}><a.icon size={13} /></span>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: 'var(--fg-primary)' }}>
                        <span style={{ fontWeight: 600 }}>{a.who}</span> <span style={{ color: 'var(--fg-secondary)' }}>{a.what}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 2 }}>{a.when}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {showFiles && (
            <Section title="Files">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { name: 'BoQ — mechanical v3.xlsx',     size: '142 KB' },
                  { name: 'Chiller datasheet — york.pdf', size: '2.4 MB' },
                  { name: 'Site survey — 04 Mar.docx',    size: '88 KB' },
                ].map(f => (
                  <div key={f.name} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                    border: '1px solid var(--border-subtle)', borderRadius: 6, fontSize: 12,
                  }}>
                    <File size={14} style={{ color: 'var(--fg-secondary)' }} />
                    <span style={{ flex: 1, color: 'var(--fg-primary)', fontWeight: 500 }}>{f.name}</span>
                    <span className="t-mono" style={{ color: 'var(--fg-tertiary)', fontSize: 10 }}>{f.size}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      </aside>
      <style>{`
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </>
  );
}

// =================================================================
// Editable primitives
// =================================================================

// Inline-editable text (single or multi-line). Click → input. Enter saves; Esc cancels.
function EditableText({ value, onSave, multiline, style, hoverHint, className }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const ref = React.useRef(null);
  React.useEffect(() => { setDraft(value); }, [value]);
  React.useEffect(() => {
    if (editing && ref.current) { ref.current.focus(); ref.current.select?.(); }
  }, [editing]);

  const commit = () => { setEditing(false); if (draft !== value) onSave?.(draft); };
  const cancel = () => { setEditing(false); setDraft(value); };

  if (editing) {
    const Tag = multiline ? 'textarea' : 'input';
    return (
      <Tag
        ref={ref}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); cancel(); }
          else if (e.key === 'Enter' && !multiline) { e.preventDefault(); commit(); }
          else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); }
        }}
        rows={multiline ? 2 : undefined}
        className={className}
        style={{
          ...style,
          width: '100%', resize: 'none',
          background: 'var(--bg-surface)',
          border: '1px solid var(--img-orange)',
          boxShadow: 'var(--shadow-focus)',
          borderRadius: 6, padding: '4px 6px',
          outline: 'none', fontFamily: 'inherit',
        }}
      />
    );
  }
  return (
    <EditableHover hint={hoverHint}>
      <div
        onClick={() => setEditing(true)}
        className={className}
        style={{ ...style, cursor: 'text', borderRadius: 4, padding: '2px 4px', margin: '-2px -4px' }}
      >{value || <span style={{ color: 'var(--fg-tertiary)', fontStyle: 'italic' }}>Click to add…</span>}</div>
    </EditableHover>
  );
}

// Inline-editable number. Same UX as EditableText, formatted on blur.
function EditableNumber({ value, onSave, format, style, className, align, max }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const ref = React.useRef(null);
  React.useEffect(() => { setDraft(value); }, [value]);
  React.useEffect(() => {
    if (editing && ref.current) { ref.current.focus(); ref.current.select?.(); }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const n = +draft;
    if (!isNaN(n) && n !== value) onSave?.(n);
  };
  const cancel = () => { setEditing(false); setDraft(value); };

  if (editing) {
    return (
      <input
        ref={ref}
        type="number"
        value={draft}
        max={max}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); cancel(); }
          else if (e.key === 'Enter') { e.preventDefault(); commit(); }
        }}
        className={className}
        style={{
          ...style,
          width: '100%', textAlign: align === 'right' ? 'right' : 'left',
          background: 'var(--bg-surface)',
          border: '1px solid var(--img-orange)',
          boxShadow: 'var(--shadow-focus)',
          borderRadius: 6, padding: '2px 6px',
          outline: 'none', fontFamily: 'inherit',
        }}
      />
    );
  }
  return (
    <EditableHover hint="Click to edit">
      <div
        onClick={() => setEditing(true)}
        className={className}
        style={{ ...style, cursor: 'text', borderRadius: 4, padding: '0 4px', margin: '0 -4px' }}
      >{format ? format(value) : value}</div>
    </EditableHover>
  );
}

// Inline-editable select. Click renders a real <select> that auto-opens.
function EditableSelect({ value, options, onSave, renderDisplay }) {
  const [editing, setEditing] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      // Try to programmatically open the menu (works in most browsers)
      try {
        const ev = document.createEvent('MouseEvents');
        ev.initMouseEvent('mousedown', true, true, window);
        ref.current.dispatchEvent(ev);
      } catch {}
    }
  }, [editing]);

  if (editing) {
    return (
      <select
        ref={ref}
        defaultValue={value}
        onChange={e => { onSave?.(e.target.value); setEditing(false); }}
        onBlur={() => setEditing(false)}
        style={{
          height: 28, padding: '0 8px',
          border: '1px solid var(--img-orange)', borderRadius: 6,
          fontSize: 12, fontWeight: 500, color: 'var(--fg-primary)',
          background: 'var(--bg-surface)', boxShadow: 'var(--shadow-focus)',
          outline: 'none', fontFamily: 'inherit', maxWidth: '100%',
        }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  return (
    <EditableHover hint="Click to change">
      <span onClick={() => setEditing(true)} style={{ cursor: 'pointer', display: 'inline-block' }}>
        {renderDisplay ? renderDisplay() : (options.find(o => o.value === value)?.label ?? value)}
      </span>
    </EditableHover>
  );
}

// One row in "Details" — label on top, editable value below, both left-aligned.
// Long values wrap rather than truncate so everything is always legible.
function EditableField({ label, type, value, options, onSave, suffix, display }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const ref = React.useRef(null);
  React.useEffect(() => { setDraft(value); }, [value]);
  React.useEffect(() => {
    if (editing && ref.current) { ref.current.focus(); ref.current.select?.(); }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    let next = draft;
    if (type === 'number') {
      next = +draft;
      if (isNaN(next)) return;
    }
    if (next !== value) onSave?.(next);
  };
  const cancel = () => { setEditing(false); setDraft(value); };

  let editor = null;
  const baseInputStyle = {
    height: 28, width: '100%', padding: '0 8px',
    border: '1px solid var(--img-orange)', borderRadius: 6,
    fontSize: 12, color: 'var(--fg-primary)', background: 'var(--bg-surface)',
    boxShadow: 'var(--shadow-focus)', outline: 'none', fontFamily: 'inherit',
    textAlign: 'left',
  };
  if (editing) {
    if (type === 'select') {
      editor = (
        <select ref={ref} defaultValue={value}
          onChange={e => { onSave?.(e.target.value); setEditing(false); }}
          onBlur={() => setEditing(false)}
          style={baseInputStyle}>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    } else if (type === 'date') {
      editor = (
        <input ref={ref} type="date" value={draft || ''}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Escape') cancel(); else if (e.key === 'Enter') commit(); }}
          style={baseInputStyle} />
      );
    } else if (type === 'number') {
      editor = (
        <input ref={ref} type="number" value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Escape') cancel(); else if (e.key === 'Enter') commit(); }}
          style={baseInputStyle} />
      );
    } else {
      editor = (
        <input ref={ref} type="text" value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Escape') cancel(); else if (e.key === 'Enter') commit(); }}
          style={baseInputStyle} />
      );
    }
  }

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '110px 1fr',
      alignItems: 'baseline', columnGap: 12, rowGap: 2,
      padding: '8px 0', fontSize: 12,
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      <span style={{
        color: 'var(--fg-secondary)', fontWeight: 500,
        paddingTop: editing ? 6 : 2,
      }}>{label}</span>
      {editing ? (
        <div style={{ minWidth: 0 }}>{editor}</div>
      ) : (
        <EditableHover hint="Click to edit" block>
          <button onClick={() => setEditing(true)} style={{
            background: 'transparent', border: 'none', cursor: 'text',
            padding: '2px 6px', borderRadius: 4, margin: '-2px -6px',
            color: 'var(--fg-primary)', fontWeight: 500, fontSize: 12,
            textAlign: 'left', width: '100%',
            wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.45,
            display: 'block',
          }}>
            {display ?? (value !== '' && value != null
              ? value
              : <span style={{ color: 'var(--fg-tertiary)', fontStyle: 'italic' }}>—</span>)}
            {value != null && suffix}
          </button>
        </EditableHover>
      )}
    </div>
  );
}

// Hover wrapper — shows a subtle dotted underline + tooltip on hover, signalling editability.
function EditableHover({ children, hint, align, block }) {
  const [hover, setHover] = React.useState(false);
  return (
    <span
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', display: block ? 'block' : 'inline-block',
        background: hover ? 'var(--img-orange-50)' : 'transparent',
        borderRadius: 5, transition: 'background 100ms',
      }}
    >
      {children}
      {hover && hint && (
        <span style={{
          position: 'absolute',
          top: '100%', marginTop: 4,
          [align === 'right' ? 'right' : 'left']: 0,
          background: 'var(--neutral-900)', color: '#fff',
          fontSize: 10, fontWeight: 500, padding: '3px 6px', borderRadius: 4,
          whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 30,
        }}>{hint}</span>
      )}
    </span>
  );
}

const iconBtn = {
  width: 26, height: 26, borderRadius: 5, border: '1px solid var(--border-subtle)',
  background: 'var(--bg-surface)', color: 'var(--fg-secondary)', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};

window.DealDetail = DealDetail;
