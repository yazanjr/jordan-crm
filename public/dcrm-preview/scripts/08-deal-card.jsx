// Deal card — three layout variants used across the kanban board.
//
//   compact   — title + value + owner avatar
//   standard  — title, ref, value, contact pill (customer, stage-tinted), meta + owner avatar
//   detailed  — adds probability bar and close date
//
// The CONTACT (customer) is the full-name stage-tinted pill.
// The OWNER (internal salesperson) is the compact initials avatar.

// Resolve the primary contact PERSON for a deal. Tries the global CONTACTS
// directory first (matching by company), then falls back to a deterministic
// pseudo-contact derived from the account name so cards never look duplicated.
window.primaryContactFor = function primaryContactFor(deal) {
  if (!deal) return null;
  if (deal.contactName) return { name: deal.contactName, role: deal.contactRole || 'Primary contact' };
  const list = window.CONTACTS || [];
  // Best match: contact whose company appears in deal.account (or vice-versa)
  const acct = (deal.account || '').toLowerCase();
  const match = list.find(c => {
    const co = (c.company || '').toLowerCase();
    if (!co || !acct) return false;
    return acct.includes(co.split(' ')[0]) || co.includes(acct.split(' ')[0]);
  });
  if (match) return { name: match.name, role: match.role };
  // Fallback: deterministic pick keyed on deal.id so it's stable across renders.
  const fallbacks = [
    { name: 'Khaled Mansour',   role: 'Facilities Director' },
    { name: 'Rana Odeh',        role: 'Procurement Manager' },
    { name: 'Tareq Halaseh',    role: 'Chief Engineer' },
    { name: 'Mira Saleh',       role: 'Operations Manager' },
    { name: 'Omar Khasawneh',   role: 'Project Lead' },
    { name: 'Layla Nashashibi', role: 'Maintenance Head' },
    { name: 'Ziad Al-Rifai',    role: 'GM' },
    { name: 'Nadia Barakat',    role: 'Site Engineer' },
  ];
  let h = 0;
  const key = deal.id || deal.account || deal.name || '';
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return fallbacks[h % fallbacks.length];
};

function DealCard({ deal, variant = 'standard', onClick, onUpdate, dragging }) {
  const { Calendar, Clock, Chat: MessageSquare, Attach: Paperclip } = window.Icons;
  const meta = window.STAGE_META[deal.stage] || {};
  const stageBg = meta.bg || 'var(--neutral-100)';
  const contactFg = deal.stage === 'negotiation' ? '#B7710F'
                  : deal.stage === 'closing'     ? 'var(--img-green-700)'
                  : deal.stage === 'won'         ? 'var(--img-green-700)'
                  : deal.stage === 'lost'        ? '#B0241D'
                  : (meta.fg || 'var(--neutral-500)');

  const probColor = deal.probability >= 70 ? 'var(--img-green)' :
                    deal.probability >= 40 ? 'var(--img-orange)' :
                                             'var(--neutral-300)';

  const cardStyle = {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 10,
    padding: variant === 'compact' ? 10 : 12,
    boxShadow: dragging ? 'var(--shadow-lg)' : 'var(--shadow-xs)',
    transform: dragging ? 'rotate(1.5deg) scale(1.02)' : 'none',
    transition: 'box-shadow 120ms, transform 120ms, border-color 120ms',
    display: 'flex', flexDirection: 'column',
    gap: variant === 'compact' ? 6 : 8,
    cursor: 'pointer', userSelect: 'none',
  };

  // Contact (customer) is deal.account; owner is deal.owner
  const customer = deal.account || deal.name;
  // Primary contact PERSON on the deal
  const contact = window.primaryContactFor(deal) || { name: customer, role: 'Primary contact' };
  const contactPerson = contact.name;
  const contactRole = contact.role;

  // ---- compact ----
  if (variant === 'compact') {
    return (
      <div
        onClick={onClick}
        style={cardStyle}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.boxShadow = 'var(--shadow-xs)'; }}
      >
        <CardEditableText
          value={deal.name}
          onSave={v => onUpdate?.({ name: v })}
          style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-primary)', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <CardEditableNumber
            value={deal.value}
            onSave={v => onUpdate?.({ value: v })}
            format={n => window.formatJODshort(n)}
            className="t-num"
            style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)' }}
          />
          <OwnerDot name={deal.owner} />
        </div>
      </div>
    );
  }

  // ---- detailed ----
  if (variant === 'detailed') {
    return (
      <div
        onClick={onClick}
        style={cardStyle}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.boxShadow = 'var(--shadow-xs)'; }}
      >
        <CardEditableText
          value={deal.name}
          onSave={v => onUpdate?.({ name: v })}
          style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)', lineHeight: 1.35 }}
        />
        <div className="t-mono" style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>{deal.id}</div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <CardEditableNumber
            value={deal.value}
            onSave={v => onUpdate?.({ value: v })}
            format={n => window.formatJODshort(n)}
            className="t-num"
            style={{ fontSize: 18, fontWeight: 700, color: 'var(--fg-primary)', letterSpacing: '-0.01em' }}
          />
          <CardEditableNumber
            value={deal.probability}
            onSave={v => onUpdate?.({ probability: Math.max(0, Math.min(100, v)) })}
            format={n => `${n}%`}
            style={{ fontSize: 11, fontWeight: 600, color: probColor }}
            align="right"
          />
        </div>

        <div style={{ height: 4, background: 'var(--neutral-100)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${deal.probability}%`, height: '100%', background: probColor, transition: 'width 280ms' }}></div>
        </div>

        <ContactPill name={contactPerson} subtitle={`${contactRole} · ${customer}`} bg={stageBg} fg={contactFg} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--fg-tertiary)', borderTop: '1px solid var(--border-subtle)', paddingTop: 8, marginTop: 2 }}>
          <MetaItem icon={Calendar} tip={`Expected close: ${window.formatDate(deal.closeDate)}`}>{window.formatDate(deal.closeDate)}</MetaItem>
          <span style={{ flex: 1 }}></span>
          <MetaItem icon={Clock} tip={`${deal.age} days in this stage`}>{deal.age}d</MetaItem>
          <OwnerDot name={deal.owner} />
        </div>
      </div>
    );
  }

  // ---- standard ----
  const notes = deal.notesCount ?? 4;
  const files = deal.filesCount ?? 3;

  return (
    <div
      onClick={onClick}
      style={cardStyle}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.boxShadow = 'var(--shadow-xs)'; }}
    >
      <CardEditableText
        value={deal.name}
        onSave={v => onUpdate?.({ name: v })}
        style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)', lineHeight: 1.35 }}
      />
      <div className="t-mono" style={{ fontSize: 10, color: 'var(--fg-tertiary)', marginTop: -4 }}>{deal.id}</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
        <CardEditableNumber
          value={deal.value}
          onSave={v => onUpdate?.({ value: v })}
          format={n => window.formatJODshort(n)}
          className="t-num"
          style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg-primary)' }}
        />
        <span style={{
          background: 'var(--neutral-100)', color: 'var(--neutral-600)',
          fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
        }}>{deal.scope}</span>
      </div>

      <ContactPill name={contactPerson} subtitle={`${contactRole} · ${customer}`} bg={stageBg} fg={contactFg} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--fg-tertiary)' }}>
        <MetaItem icon={MessageSquare} tip={`${notes} notes on this deal`}>{notes}</MetaItem>
        <MetaItem icon={Paperclip} tip={`${files} files attached`}>{files}</MetaItem>
        <MetaItem icon={Clock} tip={`${deal.age} days in this stage`}>{deal.age}d</MetaItem>
        <span style={{ flex: 1 }}></span>
        <OwnerDot name={deal.owner} />
      </div>
    </div>
  );
}

// =================================================================
// Inline edit primitives for the kanban card
// =================================================================
// Double-click (or click the small pencil that appears on hover) to edit.
// Single click on the card body still opens the deal detail drawer.

function CardEditableText({ value, onSave, style }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const [hover, setHover] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => { setDraft(value); }, [value]);
  React.useEffect(() => { if (editing && ref.current) { ref.current.focus(); ref.current.select(); } }, [editing]);

  const commit = () => { setEditing(false); if (draft.trim() && draft !== value) onSave?.(draft.trim()); };
  const cancel = () => { setEditing(false); setDraft(value); };

  if (editing) {
    return (
      <textarea
        ref={ref}
        value={draft}
        onClick={e => e.stopPropagation()}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          e.stopPropagation();
          if (e.key === 'Escape') { e.preventDefault(); cancel(); }
          else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
        }}
        rows={2}
        style={{
          ...style,
          width: '100%', resize: 'none',
          background: 'var(--bg-surface)',
          border: '1px solid var(--img-orange)',
          boxShadow: 'var(--shadow-focus)',
          borderRadius: 4, padding: '2px 4px', margin: '-2px -4px',
          outline: 'none', fontFamily: 'inherit',
        }}
      />
    );
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onDoubleClick={e => { e.stopPropagation(); setEditing(true); }}
      style={{
        position: 'relative',
        background: hover ? 'var(--img-orange-50)' : 'transparent',
        borderRadius: 4,
        margin: '-2px -4px', padding: '2px 4px',
        transition: 'background 100ms',
      }}
    >
      <div style={style}>{value}</div>
      {hover && (
        <button
          onClick={e => { e.stopPropagation(); setEditing(true); }}
          title="Edit name (double-click)"
          style={{
            position: 'absolute', top: 2, right: 2,
            width: 18, height: 18, borderRadius: 4,
            background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
            color: 'var(--fg-secondary)', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--shadow-xs)',
          }}
        >
          <PencilIcon />
        </button>
      )}
    </div>
  );
}

function CardEditableNumber({ value, onSave, format, style, className, align }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const [hover, setHover] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => { setDraft(value); }, [value]);
  React.useEffect(() => { if (editing && ref.current) { ref.current.focus(); ref.current.select(); } }, [editing]);

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
        onClick={e => e.stopPropagation()}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          e.stopPropagation();
          if (e.key === 'Escape') { e.preventDefault(); cancel(); }
          else if (e.key === 'Enter') { e.preventDefault(); commit(); }
        }}
        className={className}
        style={{
          ...style,
          width: align === 'right' ? 64 : 110,
          textAlign: align === 'right' ? 'right' : 'left',
          background: 'var(--bg-surface)',
          border: '1px solid var(--img-orange)',
          boxShadow: 'var(--shadow-focus)',
          borderRadius: 4, padding: '1px 4px',
          outline: 'none', fontFamily: 'inherit',
        }}
      />
    );
  }

  return (
    <span
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onDoubleClick={e => { e.stopPropagation(); setEditing(true); }}
      className={className}
      style={{
        ...style,
        cursor: 'text',
        background: hover ? 'var(--img-orange-50)' : 'transparent',
        borderRadius: 4, padding: '0 4px', margin: '0 -4px',
        transition: 'background 100ms',
      }}
    >{format ? format(value) : value}</span>
  );
}

function PencilIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>
  );
}

// Customer-contact pill, stage-tinted, with avatar disc and rich hover card.
function ContactPill({ name, subtitle, bg, fg }) {
  const initials = name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  const [anchor, setAnchor] = React.useState(null);
  const ref = React.useRef(null);
  const onEnter = () => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      setAnchor({ left: r.left + r.width / 2, top: r.top });
    }
  };
  return (
    <span
      ref={ref}
      onMouseEnter={onEnter}
      onMouseLeave={() => setAnchor(null)}
      style={{
        position: 'relative',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '3px 9px 3px 3px', borderRadius: 999,
        background: bg, color: fg,
        fontSize: 11, fontWeight: 600, lineHeight: 1,
        alignSelf: 'flex-start', cursor: 'default',
        maxWidth: '100%',
      }}
    >
      <span style={{
        width: 20, height: 20, borderRadius: '50%',
        background: fg, color: '#fff',
        fontSize: 9, fontWeight: 700,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>{initials}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      {anchor && <ContactHoverCard anchor={anchor} name={name} subtitle={subtitle} initials={initials} accent={fg} />}
    </span>
  );
}

// Rich hover card for the contact pill — portals to <body> so it overlays
// every column / card / drawer regardless of overflow:hidden ancestors.
function ContactHoverCard({ anchor, name, subtitle, initials, accent }) {
  if (!window.ReactDOM || !anchor) return null;
  const W = 240;
  const left = Math.max(8, Math.min(window.innerWidth - W - 8, anchor.left - W / 2));
  const top = Math.max(8, anchor.top - 12);
  const node = (
    <div style={{
      position: 'fixed', left, top, width: W,
      transform: 'translateY(-100%)',
      background: '#fff',
      border: '1px solid var(--border-default)',
      borderRadius: 10,
      boxShadow: '0 12px 32px rgba(15, 23, 42, 0.18), 0 2px 6px rgba(15, 23, 42, 0.08)',
      padding: 12,
      pointerEvents: 'none',
      zIndex: 10000,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 36, height: 36, borderRadius: '50%',
          background: accent, color: '#fff',
          fontSize: 13, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>{initials}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
          {subtitle && <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 2, lineHeight: 1.3 }}>{subtitle}</div>}
        </div>
      </div>
    </div>
  );
  return window.ReactDOM.createPortal(node, document.body);
}

// Compact owner — initials disc only, with hover tooltip.
function OwnerDot({ name }) {
  const [hover, setHover] = React.useState(false);
  return (
    <span
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ position: 'relative', display: 'inline-flex' }}
    >
      <window.Avatar name={name} size={22} />
      {hover && <Tooltip>Owner — {name}</Tooltip>}
    </span>
  );
}

function MetaItem({ icon: Icon, tip, children }) {
  const [hover, setHover] = React.useState(false);
  return (
    <span
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 4px', borderRadius: 4,
        cursor: 'default',
        background: hover ? 'var(--bg-hover)' : 'transparent',
        color: hover ? 'var(--fg-primary)' : 'var(--fg-tertiary)',
        transition: 'background 120ms, color 120ms',
      }}
    >
      <Icon size={12} />{children}
      {hover && <Tooltip>{tip}</Tooltip>}
    </span>
  );
}

function Tooltip({ children }) {
  return (
    <span style={{
      position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%',
      transform: 'translateX(-50%)',
      background: 'var(--neutral-900)', color: '#fff',
      fontSize: 11, fontWeight: 500, lineHeight: 1.35,
      padding: '6px 9px', borderRadius: 6,
      whiteSpace: 'nowrap',
      boxShadow: 'var(--shadow-md)',
      pointerEvents: 'none',
      zIndex: 20,
    }}>
      {children}
      <span style={{
        position: 'absolute', top: '100%', left: '50%',
        transform: 'translateX(-50%)',
        border: '4px solid transparent',
        borderTopColor: 'var(--neutral-900)',
      }}></span>
    </span>
  );
}

window.DealCard = DealCard;
