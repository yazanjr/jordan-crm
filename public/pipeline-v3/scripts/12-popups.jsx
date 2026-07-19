// Pop-up windows for the IMG CRM Pipeline page.
// Includes: modals (NewDeal, Import, Automation, Invite, Delete confirm),
// menus (column more, deal more, user menu, saved-views menu),
// popovers (filter, group-by, person filter, notifications, command palette),
// inline (quick-add card), and toast.

// ---------- Reusable shells ----------
function ModalShell({ title, subtitle, onClose, width = 520, children, footer }) {
  const { Close } = window.Icons;
  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(40, 38, 36, 0.42)',
        zIndex: 200, animation: 'imgFadeIn 160ms cubic-bezier(0.2,0,0,1)',
      }}></div>
      <div role="dialog" aria-modal="true" style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 64px)',
        background: 'var(--bg-surface)', borderRadius: 14,
        boxShadow: 'var(--shadow-xl)',
        zIndex: 201, display: 'flex', flexDirection: 'column',
        animation: 'imgPopIn 220ms cubic-bezier(0.16,1,0.3,1)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--fg-primary)', letterSpacing: '-0.01em' }}>{title}</h2>
            {subtitle && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--fg-secondary)' }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent',
            color: 'var(--fg-secondary)', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }} onMouseEnter={e => e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
            <Close size={16} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>{children}</div>
        {footer && (
          <div style={{
            padding: '12px 20px', borderTop: '1px solid var(--border-subtle)',
            background: 'var(--neutral-25)',
            display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end',
          }}>{footer}</div>
        )}
      </div>
      <style>{`
        @keyframes imgFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes imgPopIn { from { opacity: 0; transform: translate(-50%, -48%) scale(0.97); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
        @keyframes imgPopoverIn { from { opacity: 0; transform: translateY(-4px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes imgToastIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </>
  );
}

function Btn({ kind = 'secondary', children, onClick, disabled, icon: Icon, full, size = 'md', type = 'button' }) {
  const sizes = { sm: { h: 28, px: '8px 12px', fs: 12 }, md: { h: 32, px: '8px 14px', fs: 13 } };
  const s = sizes[size];
  const styles = {
    primary: { bg: 'var(--img-orange)', fg: '#fff', bd: 'transparent', hover: 'var(--img-orange-600)' },
    secondary: { bg: 'var(--bg-surface)', fg: 'var(--fg-primary)', bd: 'var(--border-default)', hover: 'var(--bg-hover)' },
    ghost: { bg: 'transparent', fg: 'var(--fg-primary)', bd: 'transparent', hover: 'var(--bg-hover)' },
    danger: { bg: 'var(--color-danger)', fg: '#fff', bd: 'transparent', hover: '#B0241D' },
  }[kind];
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      height: s.h, padding: s.px, borderRadius: 7,
      background: styles.bg, color: styles.fg,
      border: `1px solid ${styles.bd}`,
      fontSize: s.fs, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1, transition: 'background 120ms',
      width: full ? '100%' : undefined,
    }}
    onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = styles.hover; }}
    onMouseLeave={e => { if (!disabled) e.currentTarget.style.background = styles.bg; }}>
      {Icon && <Icon size={14} />}{children}
    </button>
  );
}

function Field({ label, hint, children, required }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-secondary)', letterSpacing: '0.02em' }}>
        {label}{required && <span style={{ color: 'var(--color-danger)', marginLeft: 2 }}>*</span>}
      </span>
      {children}
      {hint && <span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{hint}</span>}
    </label>
  );
}

const inputStyle = {
  height: 34, padding: '0 10px',
  border: '1px solid var(--border-default)', borderRadius: 7,
  fontSize: 13, color: 'var(--fg-primary)', background: 'var(--bg-surface)',
  outline: 'none', fontFamily: 'inherit',
};

function TextInput(props) {
  return <input {...props} style={{ ...inputStyle, ...(props.style || {}) }}
    onFocus={e => { e.target.style.borderColor = 'var(--img-orange)'; e.target.style.boxShadow = 'var(--shadow-focus)'; }}
    onBlur={e => { e.target.style.borderColor = 'var(--border-default)'; e.target.style.boxShadow = 'none'; }} />;
}

function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={onChange}
      style={{ ...inputStyle, paddingRight: 28, appearance: 'none', backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236E6862' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><path d='M6 9l6 6 6-6'/></svg>\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ---------- Popover (anchored) ----------
function Popover({ anchorRect, onClose, width = 240, align = 'left', children }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) onClose?.(); }
    function onEsc(e) { if (e.key === 'Escape') onClose?.(); }
    setTimeout(() => document.addEventListener('mousedown', onDoc), 0);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, [onClose]);

  if (!anchorRect) return null;

  const margin = 8;
  const gap    = 6;
  const vh     = window.innerHeight;
  const vw     = window.innerWidth;
  const spaceBelow = vh - anchorRect.bottom - margin;
  const spaceAbove = anchorRect.top - margin;
  // Flip up when there's more room above than below.
  const flipUp = spaceAbove > spaceBelow;
  // Cap popover height so the visible portion always fits on screen.
  const availHeight = Math.max(120, (flipUp ? spaceAbove : spaceBelow) - gap);

  let left = align === 'right' ? anchorRect.right - width : anchorRect.left;
  left = Math.max(margin, Math.min(left, vw - width - margin));

  // When flipping up, anchor the BOTTOM of the popover to just above the anchor.
  // CSS `bottom` avoids needing to measure the popover's height.
  const position = flipUp
    ? { bottom: vh - anchorRect.top + gap }
    : { top: anchorRect.bottom + gap };

  return (
    <div ref={ref} style={{
      position: 'fixed', left, width, zIndex: 300,
      ...position,
      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 10, boxShadow: 'var(--shadow-lg)',
      maxHeight: availHeight, overflowY: 'auto', overflowX: 'hidden',
      animation: 'imgPopoverIn 160ms cubic-bezier(0.16,1,0.3,1)',
    }}>{children}</div>
  );
}

function MenuItem({ icon: Icon, children, onClick, danger, shortcut, disabled, checked }) {
  const { Check } = window.Icons;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
      padding: '7px 12px', border: 'none', background: 'transparent',
      color: danger ? 'var(--color-danger)' : 'var(--fg-primary)',
      fontSize: 12.5, fontWeight: 500, cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1, textAlign: 'left',
    }}
    onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'var(--bg-hover)'; }}
    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
      {Icon && <Icon size={14} style={{ color: danger ? 'var(--color-danger)' : 'var(--fg-secondary)' }} />}
      {checked != null && <span style={{ width: 14, display: 'inline-flex', justifyContent: 'center' }}>{checked && <Check size={12} />}</span>}
      <span style={{ flex: 1 }}>{children}</span>
      {shortcut && <span className="t-mono" style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>{shortcut}</span>}
    </button>
  );
}

function MenuSeparator() {
  return <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }}></div>;
}
function MenuLabel({ children }) {
  return <div style={{ padding: '8px 12px 4px', fontSize: 10, fontWeight: 700, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{children}</div>;
}

window.PopupShell = { ModalShell, Btn, Field, TextInput, Select, Popover, MenuItem, MenuSeparator, MenuLabel, inputStyle };

// =============================================================================
// COMBOBOXES — search-as-you-type with "+ Create new" hint when no exact match.
// Both render an inline dropdown (not a portal), so they live happily inside
// modals and forms. Keyboard: ↑/↓ navigate, Enter pick, Esc close.
// =============================================================================
const _comboDropdown = {
  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
  borderRadius: 8, boxShadow: 'var(--shadow-lg)', zIndex: 250,
  maxHeight: 280, overflowY: 'auto', padding: 4,
};
const _comboRow = (active) => ({
  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
  padding: '7px 8px', border: 'none', cursor: 'pointer', textAlign: 'left',
  borderRadius: 6,
  background: active ? 'var(--img-orange-50)' : 'transparent',
  color: 'var(--fg-primary)', fontSize: 13, fontWeight: 500,
});

function ContactCombobox({ value, onChange, onPick, orgId, placeholder = 'Search existing or type new…', autoFocus }) {
  const [open, setOpen]   = React.useState(false);
  const [hi, setHi]       = React.useState(0);
  const wrapRef = React.useRef(null);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    function onDoc(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  React.useEffect(() => { if (autoFocus && inputRef.current) inputRef.current.focus(); }, [autoFocus]);

  const candidates = React.useMemo(() => {
    let pool = window.CONTACTS || [];
    if (orgId) pool = pool.filter(c => c.orgId === orgId);
    const q = (value || '').toLowerCase().trim();
    if (!q) return pool.slice(0, 8);
    return pool.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.emailWork || '').toLowerCase().includes(q) ||
      (c.role || '').toLowerCase().includes(q)
    ).slice(0, 8);
  }, [value, orgId]);

  const exact = (value || '').trim().length > 0 &&
    candidates.some(c => c.name.toLowerCase() === value.toLowerCase().trim());
  const showCreate = (value || '').trim().length >= 2 && !exact;
  const total = candidates.length + (showCreate ? 1 : 0);

  const onKey = (e) => {
    if (!open) { if (e.key === 'ArrowDown' || e.key === 'Enter') { setOpen(true); e.preventDefault(); } return; }
    if (e.key === 'ArrowDown') { setHi(h => Math.min(h + 1, total - 1)); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { setHi(h => Math.max(h - 1, 0)); e.preventDefault(); }
    else if (e.key === 'Escape')  { setOpen(false); e.preventDefault(); }
    else if (e.key === 'Enter')   {
      if (hi < candidates.length) { onPick?.(candidates[hi]); setOpen(false); }
      else { setOpen(false); }
      e.preventDefault();
    }
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        value={value || ''}
        onChange={(e) => { onChange?.(e.target.value); setOpen(true); setHi(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder={placeholder}
        style={{ ...inputStyle, width: '100%' }}
      />
      {open && total > 0 && (
        <div style={_comboDropdown}>
          {candidates.length > 0 && (
            <div style={{ padding: '4px 8px', fontSize: 10, fontWeight: 700, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {orgId ? 'At this organization' : 'Existing contacts'}
            </div>
          )}
          {candidates.map((c, i) => (
            <button key={c.id} type="button"
              onMouseEnter={() => setHi(i)}
              onClick={() => { onPick?.(c); setOpen(false); }}
              style={_comboRow(hi === i)}>
              <window.Avatar name={c.name} size={26} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.name}
                  {c.primary && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'var(--img-orange-100)', color: 'var(--img-orange-700)', marginLeft: 6, letterSpacing: '0.04em' }}>PRIMARY</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--fg-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.role}{c.role && c.company ? ' · ' : ''}{c.company}
                </div>
              </div>
            </button>
          ))}
          {showCreate && (
            <>
              {candidates.length > 0 && <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }}></div>}
              <button type="button"
                onMouseEnter={() => setHi(candidates.length)}
                onClick={() => setOpen(false)}
                style={{ ..._comboRow(hi === candidates.length), color: 'var(--img-orange-700)', fontWeight: 600 }}>
                <span style={{ width: 26, height: 26, borderRadius: '50%', border: '1px dashed var(--img-orange)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--img-orange-700)', fontSize: 16, fontWeight: 700 }}>+</span>
                <span style={{ flex: 1 }}>Create new contact "<span style={{ fontWeight: 700 }}>{value}</span>"</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AccountCombobox({ value, onChange, onPick, placeholder = 'Search existing or type new…', autoFocus }) {
  const [open, setOpen] = React.useState(false);
  const [hi, setHi]     = React.useState(0);
  const wrapRef  = React.useRef(null);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    function onDoc(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  React.useEffect(() => { if (autoFocus && inputRef.current) inputRef.current.focus(); }, [autoFocus]);

  const candidates = React.useMemo(() => {
    const pool = window.ORGANIZATIONS || [];
    const q = (value || '').toLowerCase().trim();
    if (!q) return pool.slice(0, 8);
    return pool.filter(o =>
      o.name.toLowerCase().includes(q) ||
      (o.industry || '').toLowerCase().includes(q)
    ).slice(0, 8);
  }, [value]);

  const exact = (value || '').trim().length > 0 &&
    candidates.some(o => o.name.toLowerCase() === value.toLowerCase().trim());
  const showCreate = (value || '').trim().length >= 2 && !exact;
  const total = candidates.length + (showCreate ? 1 : 0);

  const onKey = (e) => {
    if (!open) { if (e.key === 'ArrowDown' || e.key === 'Enter') { setOpen(true); e.preventDefault(); } return; }
    if (e.key === 'ArrowDown') { setHi(h => Math.min(h + 1, total - 1)); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { setHi(h => Math.max(h - 1, 0)); e.preventDefault(); }
    else if (e.key === 'Escape')  { setOpen(false); e.preventDefault(); }
    else if (e.key === 'Enter')   {
      if (hi < candidates.length) { onPick?.(candidates[hi]); setOpen(false); }
      else { setOpen(false); }
      e.preventDefault();
    }
  };

  const typeColor = {
    'Customer':           'var(--img-green-700)',
    'Engineering Office': 'var(--stage-tender)',
    'Contractor':         'var(--img-orange-700)',
    'Subcontractor':      'var(--neutral-500)',
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        value={value || ''}
        onChange={(e) => { onChange?.(e.target.value); setOpen(true); setHi(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder={placeholder}
        style={{ ...inputStyle, width: '100%' }}
      />
      {open && total > 0 && (
        <div style={_comboDropdown}>
          {candidates.length > 0 && (
            <div style={{ padding: '4px 8px', fontSize: 10, fontWeight: 700, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Existing organizations
            </div>
          )}
          {candidates.map((o, i) => (
            <button key={o.id} type="button"
              onMouseEnter={() => setHi(i)}
              onClick={() => { onPick?.(o); setOpen(false); }}
              style={_comboRow(hi === i)}>
              <span style={{
                width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                background: 'var(--neutral-100)', display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: 'var(--fg-secondary)',
              }}>{(o.name[0] || '?').toUpperCase()}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-secondary)' }}>
                  <span style={{ color: typeColor[o.type] || 'var(--fg-secondary)', fontWeight: 600 }}>{o.type}</span>
                  {o.industry ? ` · ${o.industry}` : ''}
                  {o.city ? ` · ${o.city}` : ''}
                </div>
              </div>
            </button>
          ))}
          {showCreate && (
            <>
              {candidates.length > 0 && <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }}></div>}
              <button type="button"
                onMouseEnter={() => setHi(candidates.length)}
                onClick={() => setOpen(false)}
                style={{ ..._comboRow(hi === candidates.length), color: 'var(--img-orange-700)', fontWeight: 600 }}>
                <span style={{ width: 26, height: 26, borderRadius: 6, border: '1px dashed var(--img-orange)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--img-orange-700)', fontSize: 16, fontWeight: 700, flexShrink: 0 }}>+</span>
                <span style={{ flex: 1 }}>Create new organization "<span style={{ fontWeight: 700 }}>{value}</span>"</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// AreaCombobox — search-or-create over the managed project-location list
// (window.AREAS, a flat array of names). onPick(name) selects an existing area;
// onChange(value) keeps the typed text (a new area, created on save).
function AreaCombobox({ value, onChange, onPick, onClose, placeholder = 'Search area or type new…', autoFocus }) {
  const [open, setOpen] = React.useState(false);
  const [hi, setHi]     = React.useState(0);
  const wrapRef  = React.useRef(null);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    function onDoc(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) { setOpen(false); onClose?.(); } }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  React.useEffect(() => { if (autoFocus && inputRef.current) inputRef.current.focus(); }, [autoFocus]);

  const candidates = React.useMemo(() => {
    const pool = window.AREAS || [];
    const q = (value || '').toLowerCase().trim();
    if (!q) return pool.slice(0, 10);
    return pool.filter(a => String(a).toLowerCase().includes(q)).slice(0, 10);
  }, [value, open]);

  const exact = (value || '').trim().length > 0 &&
    candidates.some(a => String(a).toLowerCase() === value.toLowerCase().trim());
  const showCreate = (value || '').trim().length >= 2 && !exact;
  const total = candidates.length + (showCreate ? 1 : 0);

  const onKey = (e) => {
    if (!open) { if (e.key === 'ArrowDown' || e.key === 'Enter') { setOpen(true); e.preventDefault(); } return; }
    if (e.key === 'ArrowDown') { setHi(h => Math.min(h + 1, total - 1)); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { setHi(h => Math.max(h - 1, 0)); e.preventDefault(); }
    else if (e.key === 'Escape')  { setOpen(false); onClose?.(); e.preventDefault(); }
    else if (e.key === 'Enter')   {
      if (hi < candidates.length) { onPick?.(candidates[hi]); setOpen(false); }
      else if (showCreate)        { onPick?.((value || '').trim()); setOpen(false); }
      else { setOpen(false); onClose?.(); }
      e.preventDefault();
    }
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        value={value || ''}
        onChange={(e) => { onChange?.(e.target.value); setOpen(true); setHi(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder={placeholder}
        style={{ ...inputStyle, width: '100%' }}
      />
      {open && total > 0 && (
        <div style={_comboDropdown}>
          {candidates.length > 0 && (
            <div style={{ padding: '4px 8px', fontSize: 10, fontWeight: 700, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Areas
            </div>
          )}
          {candidates.map((a, i) => (
            <button key={a} type="button"
              onMouseEnter={() => setHi(i)}
              onClick={() => { onPick?.(a); setOpen(false); }}
              style={_comboRow(hi === i)}>
              <span style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, background: 'var(--neutral-100)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>📍</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a}</span>
            </button>
          ))}
          {showCreate && (
            <>
              {candidates.length > 0 && <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }}></div>}
              <button type="button"
                onMouseEnter={() => setHi(candidates.length)}
                onClick={() => { onPick?.((value || '').trim()); setOpen(false); }}
                style={{ ..._comboRow(hi === candidates.length), color: 'var(--img-orange-700)', fontWeight: 600 }}>
                <span style={{ width: 22, height: 22, borderRadius: 6, border: '1px dashed var(--img-orange)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--img-orange-700)', fontSize: 15, fontWeight: 700, flexShrink: 0 }}>+</span>
                <span style={{ flex: 1 }}>Create new area "<span style={{ fontWeight: 700 }}>{value}</span>"</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

window.ContactCombobox = ContactCombobox;
window.AccountCombobox = AccountCombobox;
window.AreaCombobox = AreaCombobox;

// ============================================================
// 1) NEW DEAL MODAL — 3-step wizard
// ============================================================
function NewDealModal({ onClose, onSubmit }) {
  const me = window.CURRENT_USER;
  const defaultOwner = me ? me.name : (window.SALES_TEAM?.[0]?.name || '');
  const defaultScope = window.PRODUCT_GROUPS?.[0] || '';
  const [step, setStep] = React.useState(0);
  const [data, setData] = React.useState({
    name: '', account: '', orgId: null, value: '', stage: 'prospect',
    owner: defaultOwner, scope: defaultScope, closeDate: '', probability: window.STAGE_PROBABILITY?.prospect ?? 10,
    closeQuarter: '', district: '',
    contactId: null, contactName: '', contactRole: '', contactEmail: '', contactPhone: '',
    customFields: [], // [{id, label, type, value}]
  });
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));

  // Custom field add UI state
  const [addingField, setAddingField] = React.useState(false);
  const [newFieldLabel, setNewFieldLabel] = React.useState('');
  const [newFieldType, setNewFieldType] = React.useState('text');

  const addCustomField = () => {
    if (!newFieldLabel.trim()) return;
    setData(d => ({
      ...d,
      customFields: [...d.customFields, {
        id: 'cf_' + Date.now(),
        label: newFieldLabel.trim(),
        type: newFieldType,
        value: '',
      }],
    }));
    setNewFieldLabel('');
    setNewFieldType('text');
    setAddingField(false);
  };
  const updateCustomField = (id, value) => {
    setData(d => ({
      ...d,
      customFields: d.customFields.map(f => f.id === id ? { ...f, value } : f),
    }));
  };
  const removeCustomField = (id) => {
    setData(d => ({ ...d, customFields: d.customFields.filter(f => f.id !== id) }));
  };

  // Auto-derive quarter from closeDate when changed
  const dateToQuarter = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return 'Q' + (Math.floor(d.getMonth() / 3) + 1) + ' ' + d.getFullYear();
  };
  React.useEffect(() => {
    const q = dateToQuarter(data.closeDate);
    if (q && q !== data.closeQuarter) set('closeQuarter', q);
    // eslint-disable-next-line
  }, [data.closeDate]);

  const steps = [
    { id: 'basics',  label: 'Basics' },
    { id: 'contact', label: 'Customer contact' },
    { id: 'stage',   label: 'Stage & value' },
  ];
  const isLast = step === steps.length - 1;
  const canNext = step === 0 ? data.name && data.account
                // If a contact is linked, email comes from the record so it's not required.
                : step === 1 ? data.contactName && (data.contactId || data.contactEmail)
                : data.value;

  return (
    <ModalShell
      title="Create new deal"
      subtitle="Add an HVAC opportunity to the pipeline"
      onClose={onClose}
      width={560}
      footer={
        <>
          <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
          {step > 0 && <Btn kind="secondary" onClick={() => setStep(step - 1)}>Back</Btn>}
          {!isLast
            ? <Btn kind="primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Continue</Btn>
            : <Btn kind="primary" disabled={!canNext} onClick={() => onSubmit?.(data)}>Create deal</Btn>}
        </>
      }
    >
      {/* Stepper */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 20px', background: 'var(--neutral-25)', borderBottom: '1px solid var(--border-subtle)' }}>
        {steps.map((s, i) => {
          const done = i < step, active = i === step;
          return (
            <React.Fragment key={s.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: done ? 'var(--img-green)' : active ? 'var(--img-orange)' : 'var(--neutral-150)',
                  color: done || active ? '#fff' : 'var(--fg-secondary)',
                  fontSize: 11, fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>{done ? '✓' : i + 1}</span>
                <span style={{ fontSize: 12, fontWeight: active ? 600 : 500, color: active ? 'var(--fg-primary)' : 'var(--fg-secondary)' }}>{s.label}</span>
              </div>
              {i < steps.length - 1 && <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }}></div>}
            </React.Fragment>
          );
        })}
      </div>

      <div style={{ padding: '20px 20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {step === 0 && <>
          <Field label="Deal name" required>
            <TextInput value={data.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Abdali Mall — VRF retrofit" />
          </Field>
          <Field label="Account / customer" required hint={data.orgId ? `Linked to existing organization` : (data.account.length >= 2 ? 'New organization — will be created on save' : 'Type to search the 20 organizations on file')}>
            <window.AccountCombobox
              value={data.account}
              onChange={(v) => setData(d => ({ ...d, account: v, orgId: null }))}
              onPick={(o) => setData(d => ({ ...d, account: o.name, orgId: o.id }))}
            />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Owner">
              <Select value={data.owner} onChange={e => set('owner', e.target.value)}
                options={(window.SALES_TEAM || []).map(u => ({ value: u.name, label: u.name }))} />
            </Field>
            <Field label="Product group">
              <Select value={data.scope} onChange={e => set('scope', e.target.value)}
                options={(window.PRODUCT_GROUPS || []).map(s => ({ value: s, label: s }))} />
            </Field>
          </div>
          <Field label="Project location"
            hint={(window.AREAS || []).includes(data.district) ? 'Existing area' : (data.district.trim().length >= 2 ? 'New area — will be created on save' : 'Type to search areas, or add a new one')}>
            <window.AreaCombobox
              value={data.district}
              onChange={(v) => set('district', v)}
              onPick={(name) => set('district', name)}
            />
          </Field>
        </>}

        {step === 1 && <>
          <Field label="Contact name" required
            hint={data.contactId
              ? 'Linked to existing contact — fields below auto-filled'
              : (data.contactName.length >= 2
                ? 'New contact — will be created on save and linked to this account'
                : (data.orgId ? `Type to search contacts at ${data.account} or create new` : 'Type to search all 25 contacts on file'))}>
            <window.ContactCombobox
              value={data.contactName}
              orgId={data.orgId}
              onChange={(v) => setData(d => ({ ...d,
                contactName: v,
                // typing in the name field clears the link + autofilled fields
                contactId: null,
                contactRole: d.contactId ? '' : d.contactRole,
                contactEmail: d.contactId ? '' : d.contactEmail,
                contactPhone: d.contactId ? '' : d.contactPhone,
              }))}
              onPick={(c) => setData(d => ({ ...d,
                contactId:    c.id,
                contactName:  c.name,
                contactRole:  c.role || '',
                contactEmail: c.emailWork || c.emailPersonal || '',
                contactPhone: c.phoneMobile || c.phoneWork || '',
                // If picking a contact whose org we know, also lock the account to that org
                account: d.orgId ? d.account : (c.company || d.account),
                orgId:   d.orgId || c.orgId || null,
              }))}
            />
          </Field>
          <Field label="Role">
            <TextInput value={data.contactRole} onChange={e => set('contactRole', e.target.value)} placeholder="e.g. Facilities Director" disabled={!!data.contactId} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
            <Field label="Email" required>
              <TextInput type="email" value={data.contactEmail} onChange={e => set('contactEmail', e.target.value)} placeholder="name@example.com" disabled={!!data.contactId} />
            </Field>
            <Field label="Phone">
              <TextInput value={data.contactPhone} onChange={e => set('contactPhone', e.target.value)} placeholder="079 …" disabled={!!data.contactId} />
            </Field>
          </div>
        </>}

        {step === 2 && <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Pipeline stage">
              <Select value={data.stage} onChange={e => set('stage', e.target.value)} options={[
                { value: 'prospect', label: 'Prospect' },
                { value: 'tender',   label: 'Tender' },
                { value: 'analysis', label: 'Analysis' },
                { value: 'negotiation', label: 'Negotiation' },
                { value: 'closing',  label: 'Closing' },
              ]} />
            </Field>
            <Field label="Expected close">
              <TextInput type="date" value={data.closeDate} onChange={e => set('closeDate', e.target.value)} />
            </Field>
          </div>
          <Field label="Expected close quarter" hint="Auto-set from the close date — override if the date is provisional">
            <Select value={data.closeQuarter} onChange={e => set('closeQuarter', e.target.value)} options={(() => {
              const baseYear = new Date().getFullYear();
              const opts = [];
              for (let y = baseYear; y <= baseYear + 2; y++) {
                for (let q = 1; q <= 4; q++) opts.push({ value: `Q${q} ${y}`, label: `Q${q} ${y}` });
              }
              // Ensure the current value (e.g. derived for an older year) is present
              if (data.closeQuarter && !opts.find(o => o.value === data.closeQuarter)) {
                opts.unshift({ value: data.closeQuarter, label: data.closeQuarter });
              }
              return opts;
            })()} />
          </Field>
          <Field label="Deal value (JOD)" required>
            <TextInput type="number" value={data.value} onChange={e => set('value', e.target.value)} placeholder="0" />
          </Field>
          <Field label={`Probability — ${data.probability}%`}>
            <input type="range" min="0" max="100" step="5" value={data.probability}
              onChange={e => set('probability', +e.target.value)}
              style={{ accentColor: 'var(--img-orange)', width: '100%' }} />
          </Field>

          {/* ---------- Custom fields ---------- */}
          {(data.customFields.length > 0 || addingField) && (
            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }}></div>
          )}

          {data.customFields.map(f => (
            <div key={f.id} style={{ display: 'grid', gridTemplateColumns: '1fr 28px', gap: 8, alignItems: 'end' }}>
              <Field label={`${f.label}  ·  ${f.type}`}>
                {f.type === 'longtext' ? (
                  <textarea value={f.value} onChange={e => updateCustomField(f.id, e.target.value)}
                    placeholder={`Enter ${f.label.toLowerCase()}…`}
                    style={{ ...inputStyle, height: 64, padding: 8, resize: 'vertical' }} />
                ) : f.type === 'select' ? (
                  <TextInput value={f.value} onChange={e => updateCustomField(f.id, e.target.value)}
                    placeholder="Option 1, Option 2, …" />
                ) : (
                  <TextInput
                    type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'url' ? 'url' : 'text'}
                    value={f.value}
                    onChange={e => updateCustomField(f.id, e.target.value)}
                    placeholder={`Enter ${f.label.toLowerCase()}…`} />
                )}
              </Field>
              <button onClick={() => removeCustomField(f.id)} title="Remove field"
                style={{
                  height: 34, width: 28, borderRadius: 6,
                  border: '1px solid var(--border-default)', background: 'var(--bg-surface)',
                  color: 'var(--fg-secondary)', cursor: 'pointer', fontSize: 14, lineHeight: 1,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--color-danger)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-surface)'; e.currentTarget.style.color = 'var(--fg-secondary)'; }}
              >×</button>
            </div>
          ))}

          {addingField ? (
            <div style={{
              padding: 12, borderRadius: 8,
              border: '1px dashed var(--img-orange)', background: 'var(--img-orange-50)',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--img-orange-700)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                New custom field
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 8 }}>
                <TextInput autoFocus value={newFieldLabel}
                  onChange={e => setNewFieldLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomField(); } }}
                  placeholder="Field name (e.g. Site address)" />
                <Select value={newFieldType} onChange={e => setNewFieldType(e.target.value)} options={[
                  { value: 'text', label: 'Text' },
                  { value: 'longtext', label: 'Long text' },
                  { value: 'number', label: 'Number' },
                  { value: 'date', label: 'Date' },
                  { value: 'url', label: 'URL' },
                  { value: 'select', label: 'Select (comma-sep)' },
                ]} />
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <Btn kind="ghost" size="sm" onClick={() => { setAddingField(false); setNewFieldLabel(''); }}>Cancel</Btn>
                <Btn kind="primary" size="sm" disabled={!newFieldLabel.trim()} onClick={addCustomField}>Add field</Btn>
              </div>
            </div>
          ) : (
            <button onClick={() => setAddingField(true)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              alignSelf: 'flex-start',
              padding: '6px 10px', borderRadius: 6,
              border: '1px dashed var(--border-default)', background: 'transparent',
              color: 'var(--fg-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--img-orange)'; e.currentTarget.style.color = 'var(--img-orange-700)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--fg-secondary)'; }}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> Add custom field
            </button>
          )}
        </>}
      </div>
    </ModalShell>
  );
}
window.NewDealModal = NewDealModal;

// ============================================================
// 2) IMPORT CSV MODAL
// ============================================================
function ImportModal({ onClose, onImport }) {
  const [drag, setDrag] = React.useState(false);
  const [file, setFile] = React.useState(null);
  const { Import: ImportIcon, File: FileIcon, Check } = window.Icons;
  return (
    <ModalShell
      title="Import deals"
      subtitle="Upload a CSV to add deals in bulk"
      onClose={onClose}
      width={520}
      footer={<>
        <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
        <Btn kind="primary" disabled={!file} onClick={() => onImport?.(file)}>Import {file ? `(${file.rows} rows)` : ''}</Btn>
      </>}
    >
      <div style={{ padding: 20 }}>
        <div
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); setFile({ name: 'deals-q3-2026.csv', rows: 47, size: '12.4 KB' }); }}
          style={{
            border: `2px dashed ${drag ? 'var(--img-orange)' : 'var(--border-default)'}`,
            background: drag ? 'var(--img-orange-50)' : 'var(--neutral-25)',
            borderRadius: 12, padding: 32, textAlign: 'center',
            transition: 'border 120ms, background 120ms',
          }}
        >
          {!file ? <>
            <div style={{ width: 44, height: 44, margin: '0 auto 10px', borderRadius: 10, background: 'var(--img-orange-100)', color: 'var(--img-orange-700)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <ImportIcon size={20} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)' }}>Drag &amp; drop your CSV here</div>
            <div style={{ fontSize: 12, color: 'var(--fg-secondary)', marginTop: 4 }}>or click to browse — max 5MB</div>
            <Btn kind="secondary" size="sm" onClick={() => setFile({ name: 'deals-q3-2026.csv', rows: 47, size: '12.4 KB' })}>Browse files</Btn>
          </> : <>
            <div style={{ width: 44, height: 44, margin: '0 auto 10px', borderRadius: 10, background: 'var(--color-success-bg)', color: 'var(--img-green-700)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <Check size={22} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{file.name}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-secondary)', marginTop: 4 }}>{file.rows} rows · {file.size}</div>
            <button onClick={() => setFile(null)} style={{ marginTop: 10, background: 'transparent', border: 'none', color: 'var(--img-orange-700)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Replace file</button>
          </>}
        </div>

        <div style={{ marginTop: 16, padding: 12, background: 'var(--neutral-50)', borderRadius: 8, fontSize: 12, color: 'var(--fg-secondary)', display: 'flex', gap: 10 }}>
          <FileIcon size={14} style={{ marginTop: 2, flexShrink: 0 }} />
          <div>
            Required columns: <span className="t-mono" style={{ color: 'var(--fg-primary)' }}>name, account, value, stage, owner</span>.
            <a href="#" style={{ color: 'var(--img-orange-700)', fontWeight: 600, marginLeft: 4 }}>Download template</a>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
window.ImportModal = ImportModal;

// ============================================================
// 3) AUTOMATION MODAL — pick recipe
// ============================================================
function AutomationModal({ onClose, onCreate }) {
  const { Zap, Mail, Bell, Calendar: CalIcon, Check } = window.Icons;
  const recipes = [
    { id: 'r1', icon: Bell,  title: 'Notify owner when stage changes', desc: 'Send a Slack DM whenever a deal moves between stages.' },
    { id: 'r2', icon: Mail,  title: 'Auto-email contact on Tender',    desc: 'Trigger a templated email when a deal enters Tender.' },
    { id: 'r3', icon: CalIcon, title: 'Create follow-up if idle 7 days', desc: 'Add a task for the owner if no activity for a week.' },
    { id: 'r4', icon: Zap,   title: 'Push won deals to Finance',       desc: 'Sync closed-won deals to the ERP for invoicing.' },
  ];
  const [picked, setPicked] = React.useState(null);
  return (
    <ModalShell
      title="Create automation"
      subtitle="Pick a recipe to start — you can customize after."
      onClose={onClose}
      width={580}
      footer={<>
        <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
        <Btn kind="primary" disabled={!picked} onClick={() => onCreate?.(picked)}>Use this recipe</Btn>
      </>}
    >
      <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {recipes.map(r => {
          const sel = picked === r.id;
          return (
            <button key={r.id} onClick={() => setPicked(r.id)} style={{
              textAlign: 'left', padding: 14, borderRadius: 10,
              border: `1px solid ${sel ? 'var(--img-orange)' : 'var(--border-subtle)'}`,
              background: sel ? 'var(--img-orange-50)' : 'var(--bg-surface)',
              cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6,
              boxShadow: sel ? 'var(--shadow-focus)' : 'none',
              transition: 'all 120ms',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 30, height: 30, borderRadius: 7, background: 'var(--img-orange-100)', color: 'var(--img-orange-700)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <r.icon size={15} />
                </span>
                {sel && <span style={{ marginLeft: 'auto', color: 'var(--img-orange)' }}><Check size={16} /></span>}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)', lineHeight: 1.3 }}>{r.title}</div>
              <div style={{ fontSize: 11.5, color: 'var(--fg-secondary)', lineHeight: 1.4 }}>{r.desc}</div>
            </button>
          );
        })}
      </div>
    </ModalShell>
  );
}
window.AutomationModal = AutomationModal;

// ============================================================
// 4) INVITE TEAM MODAL
// ============================================================
function InviteModal({ onClose, onInvite }) {
  const [emails, setEmails] = React.useState('');
  const [role, setRole] = React.useState('member');
  const { Link: LinkIcon, Check } = window.Icons;
  const [copied, setCopied] = React.useState(false);
  return (
    <ModalShell
      title="Invite teammates"
      subtitle="Add sales reps and managers to IMG CRM"
      onClose={onClose}
      width={500}
      footer={<>
        <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
        <Btn kind="primary" disabled={!emails.trim()} onClick={() => onInvite?.({ emails, role })}>Send invites</Btn>
      </>}
    >
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Email addresses" hint="Separate multiple addresses with commas">
          <textarea value={emails} onChange={e => setEmails(e.target.value)} placeholder="rami@izzatmarji.com, sana@izzatmarji.com"
            style={{ ...inputStyle, height: 80, padding: '10px', resize: 'vertical' }} />
        </Field>
        <Field label="Role">
          <Select value={role} onChange={e => setRole(e.target.value)} options={[
            { value: 'member', label: 'Member — can edit deals they own' },
            { value: 'manager', label: 'Manager — can edit all deals' },
            { value: 'admin', label: 'Admin — full workspace access' },
          ]} />
        </Field>
        <div style={{ marginTop: 4, padding: 12, borderRadius: 8, border: '1px dashed var(--border-default)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <LinkIcon size={14} style={{ color: 'var(--fg-secondary)' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Or share an invite link</div>
            <div className="t-mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>app.imgcrm.jo/i/k4j2-xq8m</div>
          </div>
          <Btn kind="secondary" size="sm" icon={copied ? Check : undefined} onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            {copied ? 'Copied' : 'Copy'}
          </Btn>
        </div>
      </div>
    </ModalShell>
  );
}
window.InviteModal = InviteModal;

// ============================================================
// 5) DELETE / STAGE-CHANGE CONFIRM
// ============================================================
function ConfirmModal({ title, body, confirmLabel = 'Confirm', danger, onClose, onConfirm }) {
  return (
    <ModalShell
      title={title}
      onClose={onClose}
      width={420}
      footer={<>
        <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
        <Btn kind={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Btn>
      </>}
    >
      <div style={{ padding: '8px 20px 20px', fontSize: 13, color: 'var(--fg-secondary)', lineHeight: 1.5 }}>{body}</div>
    </ModalShell>
  );
}
window.ConfirmModal = ConfirmModal;

// Add a person to a deal under one of the 4 roles. Typing a name that matches an
// existing contact links that contact; a new name creates + links a new contact.
function AddDealContactModal({ dealName, onClose, onSubmit }) {
  const [role, setRole] = React.useState('Owner');
  const [name, setName] = React.useState('');
  const allContacts = window.CONTACTS || [];
  const inputStyle = {
    width: '100%', padding: '7px 9px', fontSize: 13, borderRadius: 6,
    border: '1px solid var(--border-default)', background: 'var(--bg-surface)',
    color: 'var(--fg-primary)', boxSizing: 'border-box',
  };
  const submit = () => {
    const clean = name.trim();
    if (!clean) return;
    const match = allContacts.find(c => (c.name || '').trim().toLowerCase() === clean.toLowerCase());
    onSubmit({ role, contactId: match ? match.id : null, name: clean });
  };
  return (
    <ModalShell title={`Add contact to "${dealName}"`} onClose={onClose} width={440}
      footer={<>
        <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
        <Btn kind="primary" onClick={submit}>Add contact</Btn>
      </>}>
      <div style={{ padding: '12px 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-secondary)' }}>Role</span>
          <select value={role} onChange={e => setRole(e.target.value)} style={inputStyle}>
            <option>Owner</option><option>Owner Rep</option>
            <option>Contractor</option><option>Consultant</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-secondary)' }}>
            Person — type a new name or pick an existing contact
          </span>
          <input list="img-contacts-datalist" value={name} autoFocus
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            placeholder="Contact name" style={inputStyle} />
          <datalist id="img-contacts-datalist">
            {allContacts.slice(0, 500).map(c => <option key={c.id} value={c.name} />)}
          </datalist>
        </label>
      </div>
    </ModalShell>
  );
}
window.AddDealContactModal = AddDealContactModal;

// Shared input style for the C.1-C.3 modals below.
const _closeInput = {
  width: '100%', padding: '7px 9px', fontSize: 13, borderRadius: 6,
  border: '1px solid var(--border-default)', background: 'var(--bg-surface)',
  color: 'var(--fg-primary)', boxSizing: 'border-box',
};

// C.1 — Close a deal as Won or Lost. Won optionally records the signing price;
// Lost requires a reason (loaded from /opportunities/meta/lost-reasons).
const WON_REASONS = ['price', 'product fit', 'delivery time', 'relationship', 'spec locked to us', 'incumbent', 'other'];
function CloseDealModal({ deal, outcome: presetOutcome, onClose, onSubmit }) {
  const [outcome, setOutcome] = React.useState(presetOutcome || '');
  const [signingPrice, setSigningPrice] = React.useState(deal.signingPrice || deal.value || '');
  const [wonReason, setWonReason] = React.useState('');
  const [wonNote, setWonNote] = React.useState('');
  const [lostReasonId, setLostReasonId] = React.useState('');
  const [lostNotes, setLostNotes] = React.useState('');
  const [reasons, setReasons] = React.useState([]);
  React.useEffect(() => {
    window.api.get('/opportunities/meta/lost-reasons').then(setReasons).catch(() => setReasons([]));
  }, []);
  // Match the server rules: Won needs a signing price + reason; Lost needs a reason + notes.
  const canSubmit = outcome === 'Won'
    ? (Number(signingPrice) > 0 && !!wonReason)
    : (outcome === 'Lost' && !!lostReasonId && !!lostNotes.trim());
  const submit = () => {
    if (!canSubmit) return;
    if (outcome === 'Won') {
      onSubmit({ outcome: 'Won', signing_price: Number(signingPrice), won_reason: wonReason, won_note: wonNote.trim() || null });
    } else {
      onSubmit({ outcome: 'Lost', lost_reason_id: Number(lostReasonId), lost_notes: lostNotes.trim() || null });
    }
  };
  return (
    <ModalShell title={`Close deal — ${deal.name}`} onClose={onClose} width={460}
      footer={<>
        <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
        <Btn kind={outcome === 'Lost' ? 'danger' : 'primary'} disabled={!canSubmit} onClick={submit}>
          {outcome === 'Lost' ? 'Close as Lost' : 'Close as Won'}
        </Btn>
      </>}>
      <div style={{ padding: '12px 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {['Won', 'Lost'].map(o => {
            const on = outcome === o;
            const c = o === 'Won' ? 'var(--img-green-700)' : '#B0241D';
            const bg = o === 'Won' ? 'var(--img-green-50)' : '#FDECEC';
            return (
              <button key={o} onClick={() => setOutcome(o)} style={{
                flex: 1, padding: '10px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${on ? c : 'var(--border-default)'}`,
                background: on ? bg : 'transparent',
                color: on ? c : 'var(--fg-secondary)',
              }}>{o === 'Won' ? '✓ Won' : '✕ Lost'}</button>
            );
          })}
        </div>
        {outcome === 'Won' && <>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-secondary)' }}>Signing price — actual signed amount (JOD) <span style={{ color: '#B0241D' }}>*</span></span>
            <input type="number" value={signingPrice} onChange={e => setSigningPrice(e.target.value)}
              style={{ ..._closeInput, borderColor: Number(signingPrice) > 0 ? 'var(--border-default)' : '#F5B6B1' }} placeholder="e.g. 48500" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-secondary)' }}>Why did we win? <span style={{ color: '#B0241D' }}>*</span></span>
            <select value={wonReason} onChange={e => setWonReason(e.target.value)} style={{ ..._closeInput, borderColor: wonReason ? 'var(--border-default)' : '#F5B6B1' }}>
              <option value="">Select a reason…</option>
              {WON_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-secondary)' }}>Note (optional)</span>
            <textarea value={wonNote} onChange={e => setWonNote(e.target.value)} rows={2} style={{ ..._closeInput, resize: 'vertical' }} />
          </label>
        </>}
        {outcome === 'Lost' && <>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-secondary)' }}>Lost reason <span style={{ color: '#B0241D' }}>*</span></span>
            <select value={lostReasonId} onChange={e => setLostReasonId(e.target.value)} style={{ ..._closeInput, borderColor: lostReasonId ? 'var(--border-default)' : '#F5B6B1' }}>
              <option value="">Select a reason…</option>
              {reasons.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-secondary)' }}>What happened? <span style={{ color: '#B0241D' }}>*</span></span>
            <textarea value={lostNotes} onChange={e => setLostNotes(e.target.value)} rows={2}
              placeholder="Required — the story behind the loss" style={{ ..._closeInput, resize: 'vertical', borderColor: lostNotes.trim() ? 'var(--border-default)' : '#F5B6B1' }} />
          </label>
        </>}
      </div>
    </ModalShell>
  );
}
window.CloseDealModal = CloseDealModal;

// C.2 — Apply a discount. At or below the limit it applies immediately; above the
// limit it creates an approval request for a sales manager.
function ApplyDiscountModal({ deal, onClose, onSubmit }) {
  const [pct, setPct] = React.useState(deal.discount || '');
  const [notes, setNotes] = React.useState('');
  const [limit, setLimit] = React.useState(30);
  React.useEffect(() => {
    window.api.get('/settings').then(rows => {
      const s = (Array.isArray(rows) ? rows : []).find(x => x.key === 'discount_limit');
      if (s) setLimit(Number(s.value) || 30);
    }).catch(() => {});
  }, []);
  const n = Number(pct) || 0;
  const overLimit = n > limit;
  const submit = () => { if (n) onSubmit({ pct: n, overLimit, notes: notes.trim() || null }); };
  return (
    <ModalShell title={`Apply discount — ${deal.name}`} onClose={onClose} width={440}
      footer={<>
        <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
        <Btn kind="primary" disabled={!n} onClick={submit}>
          {overLimit ? 'Request approval' : 'Apply discount'}
        </Btn>
      </>}>
      <div style={{ padding: '12px 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-secondary)' }}>Discount %</span>
          <input type="number" value={pct} autoFocus onChange={e => setPct(e.target.value)} style={_closeInput} />
        </label>
        <div style={{ fontSize: 11, color: overLimit ? '#B0241D' : 'var(--fg-secondary)' }}>
          {overLimit
            ? `Above the ${limit}% limit — needs sales-manager approval.`
            : `Within the ${limit}% limit — applies immediately.`}
        </div>
        {overLimit && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-secondary)' }}>Note for the approver (optional)</span>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              style={{ ..._closeInput, resize: 'vertical' }} />
          </label>
        )}
      </div>
    </ModalShell>
  );
}
window.ApplyDiscountModal = ApplyDiscountModal;

// C.3 — Sales-manager inbox of pending discount-approval requests.
function ApprovalInboxPopover({ anchorRect, onClose, onChanged }) {
  const [rows, setRows] = React.useState(null);
  const load = React.useCallback(() => {
    window.api.get('/approvals/pending').then(r => setRows(Array.isArray(r) ? r : [])).catch(() => setRows([]));
  }, []);
  React.useEffect(() => { load(); }, [load]);
  const respond = (id, decision) => {
    window.api.post(`/approvals/${id}/respond`, { decision })
      .then(() => { load(); onChanged && onChanged(); })
      .catch(() => {});
  };
  return (
    <Popover anchorRect={anchorRect} onClose={onClose} width={360} align="right">
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', fontSize: 13, fontWeight: 700 }}>
        Discount approvals
      </div>
      <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
        {rows === null ? (
          <div style={{ padding: 20, fontSize: 12, color: 'var(--fg-tertiary)' }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '28px 24px', textAlign: 'center', fontSize: 12, color: 'var(--fg-tertiary)' }}>
            No pending requests.
          </div>
        ) : rows.map(r => (
          <div key={r.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg-primary)' }}>{r.opp_title || `Opportunity #${r.opp_id}`}</div>
            <div style={{ fontSize: 11, color: 'var(--fg-secondary)', marginBottom: 8 }}>
              {r.requester_name || 'A salesman'} requested <b>{r.requested_pct}%</b>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Btn kind="primary" size="sm" onClick={() => respond(r.id, 'Approved')}>Approve</Btn>
              <Btn kind="ghost"   size="sm" onClick={() => respond(r.id, 'Rejected')}>Reject</Btn>
            </div>
          </div>
        ))}
      </div>
    </Popover>
  );
}
window.ApprovalInboxPopover = ApprovalInboxPopover;

// Phase 2 — Sally returns a design request to sales with a reason.
function DesignReturnModal({ request, onClose, onSubmit }) {
  const [reason, setReason] = React.useState('');
  return (
    <ModalShell title={`Return design request — ${request.oppTitle || ''}`} onClose={onClose} width={460}
      footer={<>
        <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
        <Btn kind="danger" disabled={!reason.trim()} onClick={() => onSubmit({ reason: reason.trim() })}>
          Return to sales
        </Btn>
      </>}>
      <div style={{ padding: '12px 20px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--fg-secondary)' }}>
          The deal will move back to <b>Prospect</b>. The salesman will see your reason.
        </span>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-secondary)' }}>Reason (required)</span>
          <textarea autoFocus value={reason} onChange={e => setReason(e.target.value)} rows={3}
            placeholder="e.g. Missing site plans, low buying probability, scope unclear…"
            style={{ ..._closeInput, resize: 'vertical', minHeight: 80 }} />
        </label>
      </div>
    </ModalShell>
  );
}
window.DesignReturnModal = DesignReturnModal;

// Phase 2 — Sally releases a design and picks where the deal goes next.
function DesignReleaseRouteModal({ request, onClose, onSubmit }) {
  const [target, setTarget] = React.useState('Tender');
  return (
    <ModalShell title={`Release design — ${request.oppTitle || ''}`} onClose={onClose} width={420}
      footer={<>
        <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
        <Btn kind="primary" onClick={() => onSubmit({ released_to_stage: target })}>Release</Btn>
      </>}>
      <div style={{ padding: '12px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--fg-secondary)' }}>
          Where should the deal go after the quotation is released?
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          {['Tender', 'Analysis'].map(t => {
            const on = target === t;
            return (
              <button key={t} onClick={() => setTarget(t)} style={{
                flex: 1, padding: '12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${on ? 'var(--img-orange)' : 'var(--border-default)'}`,
                background: on ? 'var(--img-orange-50)' : 'transparent',
                color: on ? 'var(--img-orange-700)' : 'var(--fg-secondary)',
              }}>{t}</button>
            );
          })}
        </div>
      </div>
    </ModalShell>
  );
}
window.DesignReleaseRouteModal = DesignReleaseRouteModal;

// ============================================================
// 6) NOTIFICATIONS DROPDOWN
// ============================================================
function NotificationsPopover({ anchorRect, onClose, onMarkAllRead }) {
  const { Bell } = window.Icons;
  return (
    <Popover anchorRect={anchorRect} onClose={onClose} width={360} align="right">
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>Notifications</span>
      </div>
      <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--fg-tertiary)' }}>
        <Bell size={28} style={{ opacity: 0.4, marginBottom: 10 }} />
        <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
          You're all caught up.<br />
          Notifications will appear here as deals are updated.
        </div>
      </div>
    </Popover>
  );
}
window.NotificationsPopover = NotificationsPopover;

// ============================================================
// 7) FILTER POPOVER
// ============================================================
// 8 multi-select filter groups, every option derived from the loaded deals.
// `filterOptions` is { district:[], status:[], stage:[], system:[], subSystem:[],
//  brand:[], installationBy:[], segment:[] } supplied by PipelineApp.
// `groups` (optional) overrides the default pipeline groups so other pages (e.g.
// Reports) can reuse this same popover with their own filter dimensions. Each
// entry is [filterKey, label, optionsArray, isStage]; omit it to keep the
// pipeline's hardcoded groups (back-compat).
function FilterPopover({ anchorRect, onClose, filters, setFilters, filterOptions = {}, groups = null }) {
  const toggle = (key, val) => {
    const arr = filters[key] || [];
    const next = arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];
    setFilters({ ...filters, [key]: next });
  };
  // [filterKey, label, optionsArray, isStage]
  const GROUPS = groups || [
    ['district',       'Project Location', filterOptions.district     || [], false],
    ['status',         'Status',           filterOptions.status       || [], false],
    ['stage',          'Stage',            filterOptions.stage        || [], true ],
    ['system',         'System',           filterOptions.system       || [], false],
    ['subSystem',      'Sub-System',       filterOptions.subSystem    || [], false],
    ['brand',          'Brand',            filterOptions.brand        || [], false],
    ['installationBy', 'Installation',     filterOptions.installationBy || [], false],
    ['segment',        'Sector',           filterOptions.segment      || [], false],
  ];
  const Chip = ({ on, label, color, onClick }) => (
    <button onClick={onClick} style={{
      padding: '4px 10px', borderRadius: 999,
      border: `1px solid ${on ? (color || 'var(--img-orange)') : 'var(--border-default)'}`,
      background: on ? (color ? color + '22' : 'var(--img-orange-50)') : 'transparent',
      color: on ? (color || 'var(--img-orange-700)') : 'var(--fg-secondary)',
      fontSize: 11, fontWeight: 600, cursor: 'pointer',
    }}>{label}</button>
  );
  return (
    <Popover anchorRect={anchorRect} onClose={onClose} width={340}>
      <div style={{ padding: 14, maxHeight: '60vh', overflowY: 'auto' }}>
        {GROUPS.map(([key, label, opts, isStage]) => (
          <div key={key} style={{ marginBottom: 12 }}>
            <MenuLabel>{label}</MenuLabel>
            {opts.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', padding: '2px 0' }}>No values</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {opts.map(v => {
                  const on = (filters[key] || []).includes(v);
                  const meta = isStage ? (window.STAGE_META || {})[String(v).toLowerCase()] : null;
                  return (
                    <Chip key={v} on={on}
                      label={meta ? meta.label : v}
                      color={meta ? meta.fg : null}
                      onClick={() => toggle(key, v)} />
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={() => setFilters({})} style={{ background: 'transparent', border: 'none', color: 'var(--fg-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Clear all</button>
        <Btn kind="primary" size="sm" onClick={onClose}>Apply</Btn>
      </div>
    </Popover>
  );
}
window.FilterPopover = FilterPopover;

// Column picker for the Table view — show/hide any of the ~25 deal fields.
// `columns` is the ordered [{key, visible}] config; onChange gets the new array.
function ColumnPickerPopover({ anchorRect, onClose, columns = [], onChange, onReset }) {
  const byKey = window.OPP_FIELD_BY_KEY || {};
  const toggle = (key) => {
    onChange(columns.map(c => c.key === key ? { ...c, visible: !c.visible } : c));
  };
  const visibleCount = columns.filter(c => c.visible).length;
  return (
    <Popover anchorRect={anchorRect} onClose={onClose} width={300}>
      <div style={{ padding: '12px 14px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>Table columns</span>
        <span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{visibleCount} shown</span>
      </div>
      <div style={{ padding: '4px 6px 8px', maxHeight: '55vh', overflowY: 'auto' }}>
        {columns.map(c => {
          const field = byKey[c.key];
          if (!field) return null;
          return (
            <label key={c.key} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
              borderRadius: 6, cursor: 'pointer', fontSize: 12.5, color: 'var(--fg-primary)',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <input type="checkbox" checked={!!c.visible} onChange={() => toggle(c.key)}
                style={{ accentColor: 'var(--img-orange)' }} />
              <span>{field.label}</span>
            </label>
          );
        })}
      </div>
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={() => { onReset?.(); }} style={{ background: 'transparent', border: 'none', color: 'var(--fg-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Reset to default</button>
        <Btn kind="primary" size="sm" onClick={onClose}>Done</Btn>
      </div>
    </Popover>
  );
}
window.ColumnPickerPopover = ColumnPickerPopover;

// ============================================================
// 8) GROUP-BY POPOVER
// ============================================================
function GroupByPopover({ anchorRect, onClose, groupBy, setGroupBy }) {
  const opts = [
    { id: 'stage',  label: 'Stage' },
    { id: 'owner',  label: 'Owner' },
    { id: 'scope',  label: 'HVAC scope' },
    { id: 'closeMonth', label: 'Close month' },
    { id: 'none',   label: 'No grouping' },
  ];
  return (
    <Popover anchorRect={anchorRect} onClose={onClose} width={220}>
      <div style={{ padding: '6px 0' }}>
        <MenuLabel>Group by</MenuLabel>
        {opts.map(o => (
          <MenuItem key={o.id} checked={groupBy === o.id} onClick={() => { setGroupBy(o.id); onClose(); }}>
            {o.label}
          </MenuItem>
        ))}
      </div>
    </Popover>
  );
}
window.GroupByPopover = GroupByPopover;

// ============================================================
// 9) PERSON FILTER POPOVER
// ============================================================
function PersonPopover({ anchorRect, onClose, person, setPerson }) {
  const people = ['All people', ...(window.SALES_TEAM || []).map(u => u.name)];
  return (
    <Popover anchorRect={anchorRect} onClose={onClose} width={220}>
      <div style={{ padding: '6px 0' }}>
        <MenuLabel>Filter by owner</MenuLabel>
        {people.map(p => (
          <button key={p} onClick={() => { setPerson(p === 'All people' ? null : p); onClose(); }} style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            padding: '6px 12px', border: 'none', background: 'transparent',
            color: 'var(--fg-primary)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
            textAlign: 'left',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            {p === 'All people'
              ? <span style={{ width: 22, height: 22, borderRadius: '50%', border: '1px dashed var(--border-default)' }}></span>
              : <window.Avatar name={p} size={22} />}
            <span style={{ flex: 1 }}>{p}</span>
            {((person === null && p === 'All people') || person === p) && <span style={{ color: 'var(--img-orange)' }}>✓</span>}
          </button>
        ))}
      </div>
    </Popover>
  );
}
window.PersonPopover = PersonPopover;

// ============================================================
// 10) COLUMN MORE MENU (Kanban)
// ============================================================
function ColumnMenu({ anchorRect, stage, onClose, onAction }) {
  const { Plus, Filter, Layers, More } = window.Icons;
  return (
    <Popover anchorRect={anchorRect} onClose={onClose} width={220} align="right">
      <div style={{ padding: '6px 0' }}>
        <MenuLabel>{window.STAGE_META[stage]?.label} column</MenuLabel>
        <MenuItem icon={Plus}   onClick={() => { onAction('add'); onClose(); }}>Add deal here</MenuItem>
        <MenuItem icon={Layers} onClick={() => { onAction('sort'); onClose(); }}>Sort by value</MenuItem>
        <MenuItem icon={Filter} onClick={() => { onAction('filter'); onClose(); }}>Filter this stage</MenuItem>
        <MenuSeparator />
        <MenuItem icon={More}   onClick={() => { onAction('rename'); onClose(); }}>Rename stage</MenuItem>
        <MenuItem icon={More} danger onClick={() => { onAction('archive'); onClose(); }}>Archive all in stage</MenuItem>
      </div>
    </Popover>
  );
}
window.ColumnMenu = ColumnMenu;

// ============================================================
// 11) DEAL CARD CONTEXT MENU (right-click / "more")
// ============================================================
function DealCardMenu({ anchorRect, deal, onClose, onAction }) {
  const { Mail, Phone, File: FileI, Calendar: CalIcon, More, Check } = window.Icons;
  return (
    <Popover anchorRect={anchorRect} onClose={onClose} width={240} align="right">
      <div style={{ padding: '6px 0' }}>
        <MenuLabel>{deal.id}</MenuLabel>
        <MenuItem icon={CalIcon} onClick={() => { onAction('schedule'); onClose(); }}>Schedule activity</MenuItem>
        <MenuItem icon={Mail}    onClick={() => { onAction('email'); onClose(); }} shortcut="E">Email contact</MenuItem>
        <MenuItem icon={Phone}   onClick={() => { onAction('call'); onClose(); }}>Log a call</MenuItem>
        <MenuItem icon={FileI}   onClick={() => { onAction('quote'); onClose(); }}>Create quotation</MenuItem>
        <MenuSeparator />
        <MenuItem icon={Check}   onClick={() => { onAction('won'); onClose(); }}>Mark as Won</MenuItem>
        <MenuItem icon={More} danger onClick={() => { onAction('lost'); onClose(); }}>Mark as Lost</MenuItem>
        <MenuSeparator />
        <MenuItem icon={More} danger onClick={() => { onAction('delete'); onClose(); }} shortcut="⌫">Delete deal</MenuItem>
      </div>
    </Popover>
  );
}
window.DealCardMenu = DealCardMenu;

// ============================================================
// 12) USER MENU (sidebar footer)
// ============================================================
function UserMenu({ anchorRect, onClose, onAction }) {
  const { Settings, Users, Bell, More, Check } = window.Icons;
  const u = window.CURRENT_USER || { name: '—', email: '', role: '' };

  const switchTo = (id) => {
    try { localStorage.setItem('imgCurrentUserId', id); } catch {}
    window.location.reload();
  };

  return (
    <Popover anchorRect={anchorRect} onClose={onClose} width={260} align="left">
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <window.Avatar name={u.name} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{u.name}</div>
          <div style={{ fontSize: 11, color: 'var(--fg-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {u.role}{u.email ? ` · ${u.email}` : ''}
          </div>
        </div>
      </div>

      <div style={{ padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
        <MenuLabel>Switch user (demo)</MenuLabel>
        {(window.USERS || []).map(usr => (
          <MenuItem
            key={usr.id}
            onClick={() => switchTo(usr.id)}
            checked={usr.id === u.id}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <window.Avatar name={usr.name} size={20} />
              <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                <span style={{ fontSize: 12.5, fontWeight: 500 }}>{usr.name}</span>
                <span style={{ fontSize: 10.5, color: 'var(--fg-tertiary)' }}>{usr.role}</span>
              </span>
            </span>
          </MenuItem>
        ))}
      </div>

      <div style={{ padding: '6px 0' }}>
        <MenuItem icon={Settings} onClick={() => { onAction('profile'); onClose(); }}>Profile settings</MenuItem>
        <MenuItem icon={Bell}     onClick={() => { onAction('notif'); onClose(); }}>Notifications</MenuItem>
        <MenuItem icon={More}     onClick={() => { onAction('help'); onClose(); }}>Help &amp; support</MenuItem>
      </div>
    </Popover>
  );
}
window.UserMenu = UserMenu;

// ============================================================
// 12b) TOOLBAR MORE MENU (••• in toolbar)
// ============================================================
function ToolbarMoreMenu({ anchorRect, onClose, onAction }) {
  const { File: FileI, Layout, Settings, More, Check } = window.Icons;
  return (
    <Popover anchorRect={anchorRect} onClose={onClose} width={220} align="right">
      <div style={{ padding: '6px 0' }}>
        <MenuLabel>View</MenuLabel>
        <MenuItem icon={Layout}   onClick={() => { onAction('customize'); onClose(); }}>Customize columns</MenuItem>
        <MenuItem icon={Check}    onClick={() => { onAction('density'); onClose(); }}>Density: comfortable</MenuItem>
        <MenuSeparator />
        <MenuLabel>Pipeline</MenuLabel>
        <MenuItem icon={FileI}    onClick={() => { onAction('export'); onClose(); }}>Export pipeline</MenuItem>
        <MenuItem icon={Settings} onClick={() => { onAction('settings'); onClose(); }}>Pipeline settings</MenuItem>
      </div>
    </Popover>
  );
}
window.ToolbarMoreMenu = ToolbarMoreMenu;

// ============================================================
// 13) COMMAND PALETTE (Cmd-K)
// ============================================================
function CommandPalette({ onClose, onJump }) {
  const { Search, Briefcase, Users, Building, File: FileI, Plus } = window.Icons;
  const [q, setQ] = React.useState('');
  const allItems = [
    { type: 'action', icon: Plus, label: 'Create new deal', section: 'Actions', go: 'new-deal' },
    { type: 'action', icon: FileI, label: 'Create quotation', section: 'Actions', go: 'new-quote' },
    { type: 'page', icon: Users, label: 'Contacts', section: 'Navigate', go: 'page:contacts' },
    { type: 'page', icon: Building, label: 'Companies', section: 'Navigate', go: 'page:companies' },
    ...window.DEALS.slice(0, 8).map(d => ({ type: 'deal', icon: Briefcase, label: d.name, sub: d.id, section: 'Deals', go: 'deal:' + d.id })),
  ];
  const filtered = q.trim() ? allItems.filter(i => i.label.toLowerCase().includes(q.toLowerCase())) : allItems;
  React.useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(40,38,36,0.4)', zIndex: 200, animation: 'imgFadeIn 160ms' }}></div>
      <div style={{
        position: 'fixed', top: '15%', left: '50%', transform: 'translateX(-50%)', width: 560,
        maxWidth: 'calc(100vw - 32px)', background: 'var(--bg-surface)', borderRadius: 12,
        boxShadow: 'var(--shadow-xl)', zIndex: 201, overflow: 'hidden',
        animation: 'imgPopIn 200ms cubic-bezier(0.16,1,0.3,1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <Search size={16} style={{ color: 'var(--fg-tertiary)' }} />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search deals, contacts, actions…"
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, color: 'var(--fg-primary)', background: 'transparent' }} />
          <span className="t-mono" style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--neutral-100)', color: 'var(--fg-secondary)' }}>ESC</span>
        </div>
        <div style={{ maxHeight: 380, overflowY: 'auto', padding: 6 }}>
          {filtered.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--fg-tertiary)', fontSize: 13 }}>No matches for "{q}"</div>}
          {['Actions', 'Navigate', 'Deals'].map(section => {
            const items = filtered.filter(i => i.section === section);
            if (!items.length) return null;
            return (
              <div key={section}>
                <MenuLabel>{section}</MenuLabel>
                {items.map((i, idx) => (
                  <button key={idx} onClick={() => { onJump?.(i.go); onClose(); }} style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '8px 10px', border: 'none', background: 'transparent', borderRadius: 6,
                    color: 'var(--fg-primary)', fontSize: 13, fontWeight: 500, cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--img-orange-50)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <span style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--neutral-100)', color: 'var(--fg-secondary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i.icon size={14} />
                    </span>
                    <span style={{ flex: 1 }}>
                      <div>{i.label}</div>
                      {i.sub && <div className="t-mono" style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>{i.sub}</div>}
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
window.CommandPalette = CommandPalette;

// ============================================================
// 14) TOAST
// ============================================================
function Toast({ toast, onClose }) {
  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, toast.duration || 3200);
    return () => clearTimeout(t);
  }, [toast, onClose]);
  if (!toast) return null;
  const { Check, Close } = window.Icons;
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      background: 'var(--neutral-900)', color: '#fff',
      padding: '10px 14px', borderRadius: 10, boxShadow: 'var(--shadow-xl)',
      display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 500,
      zIndex: 350, animation: 'imgToastIn 200ms cubic-bezier(0.16,1,0.3,1)',
      maxWidth: 460,
    }}>
      <span style={{ width: 22, height: 22, borderRadius: '50%', background: toast.kind === 'error' ? 'var(--color-danger)' : 'var(--img-green)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Check size={13} />
      </span>
      <span style={{ flex: 1 }}>{toast.msg}</span>
      {toast.action && <button onClick={toast.action.onClick} style={{ background: 'transparent', border: 'none', color: 'var(--img-orange)', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>{toast.action.label}</button>}
      <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', display: 'inline-flex' }}><Close size={14} /></button>
    </div>
  );
}
window.Toast = Toast;

// ============================================================
// 15) QUICK ADD ROW (inline column quick-add)
// ============================================================
function QuickAdd({ stage, onCancel, onAdd }) {
  const [name, setName] = React.useState('');
  const [account, setAccount] = React.useState('');
  const [value, setValue] = React.useState('');
  const meta = window.STAGE_META[stage];
  const submit = () => name && account && onAdd?.({ name, account, value: +value || 0, stage });
  return (
    <div style={{
      background: 'var(--bg-surface)', border: `1px solid ${meta.fg}`,
      borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 6,
      boxShadow: 'var(--shadow-md)',
    }}>
      <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Deal name"
        style={{ ...inputStyle, height: 28, fontSize: 12, padding: '0 8px' }}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }} />
      <input value={account} onChange={e => setAccount(e.target.value)} placeholder="Account"
        style={{ ...inputStyle, height: 28, fontSize: 12, padding: '0 8px' }} />
      <input type="number" value={value} onChange={e => setValue(e.target.value)} placeholder="Value (JOD)"
        style={{ ...inputStyle, height: 28, fontSize: 12, padding: '0 8px' }} />
      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        <Btn kind="primary" size="sm" onClick={submit} full>Add</Btn>
        <Btn kind="ghost" size="sm" onClick={onCancel}>Cancel</Btn>
      </div>
    </div>
  );
}
window.QuickAdd = QuickAdd;

// ============================================================
// 16) STAGE PICKER POPOVER (table cell)
// ============================================================
// Click a Stage cell in the table view → opens a list of stages
// styled as filled chips (matching the cell color), plus an "Edit Labels"
// row and an "Auto-assign labels" footer row.
function StagePickerPopover({ anchorRect, currentStage, onClose, onPick, onEditLabels, onAutoAssign }) {
  const { Edit, Sparkle } = window.Icons;
  const stages = ['prospect', 'tender', 'analysis', 'negotiation', 'closing', 'won', 'lost'];
  return (
    <Popover anchorRect={anchorRect} onClose={onClose} width={240} align="left">
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {stages.map(s => {
          const meta = window.STAGE_META[s];
          const isActive = s === currentStage;
          return (
            <button
              key={s}
              onClick={() => { onPick?.(s); onClose(); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '100%', height: 32,
                background: meta.cellBg, color: meta.cellFg,
                border: 'none', borderRadius: 6,
                fontSize: 12, fontWeight: 600, letterSpacing: '0.01em',
                cursor: 'pointer', position: 'relative',
                outline: isActive ? `2px solid var(--fg-primary)` : 'none',
                outlineOffset: isActive ? -2 : 0,
                boxShadow: 'var(--shadow-xs)',
                transition: 'transform 80ms',
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
            >
              {meta.label}
            </button>
          );
        })}
      </div>
      <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <button
          onClick={() => { onEditLabels?.(); onClose(); }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            width: '100%', padding: '10px 12px',
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 500, color: 'var(--fg-primary)',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <Edit size={13} /> Edit Labels
        </button>
      </div>
      <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <button
          onClick={() => { onAutoAssign?.(); onClose(); }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            width: '100%', padding: '10px 12px',
            background: 'var(--neutral-50)', border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 500, color: 'var(--fg-primary)',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-pressed)'}
          onMouseLeave={e => e.currentTarget.style.background = 'var(--neutral-50)'}
        >
          <Sparkle size={13} style={{ color: 'var(--img-orange)' }} /> Auto-assign labels
        </button>
      </div>
    </Popover>
  );
}
window.StagePickerPopover = StagePickerPopover;

// ============================================================
// 17) EDIT LABELS MODAL — rename / recolor stages
// ============================================================
function EditLabelsModal({ onClose, onSave }) {
  const [labels, setLabels] = React.useState(() =>
    ['prospect','tender','analysis','negotiation','closing','won','lost'].map(id => ({
      id,
      label: window.STAGE_META[id].label,
      color: window.STAGE_META[id].cellBg,
    }))
  );

  const palette = ['#94A3B8', '#2D7BD2', '#8856D9', '#E89211', '#00A050', '#00713A', '#D9342B', '#F0A028', '#6E6862'];

  return (
    <ModalShell
      title="Edit stage labels"
      subtitle="Rename or recolor stages used across this pipeline."
      width={520}
      onClose={onClose}
      footer={
        <>
          <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" onClick={() => { onSave?.(labels); onClose(); }}>Save labels</Btn>
        </>
      }
    >
      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {labels.map((row, i) => (
          <div key={row.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: 8, border: '1px solid var(--border-subtle)', borderRadius: 8, background: 'var(--bg-surface)',
          }}>
            <span style={{
              width: 110, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: row.color, color: '#fff', borderRadius: 6, fontSize: 12, fontWeight: 600,
            }}>{row.label || '—'}</span>
            <input
              value={row.label}
              onChange={e => setLabels(ls => ls.map((l, j) => j === i ? { ...l, label: e.target.value } : l))}
              style={{ ...inputStyle, flex: 1, height: 30 }}
            />
            <div style={{ display: 'flex', gap: 4 }}>
              {palette.map(c => (
                <button
                  key={c}
                  onClick={() => setLabels(ls => ls.map((l, j) => j === i ? { ...l, color: c } : l))}
                  title={c}
                  style={{
                    width: 18, height: 18, borderRadius: '50%', border: row.color === c ? '2px solid var(--fg-primary)' : '1px solid var(--border-default)',
                    background: c, cursor: 'pointer', padding: 0,
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}
window.EditLabelsModal = EditLabelsModal;

// =============================================================================
// ADD CONTACT MODAL — shared between Contacts page and Pipeline (DealDetail).
// Uses AccountCombobox so company auto-suggests from real organizations.
// `defaults` lets callers pre-fill (e.g., DealDetail passes the deal's org).
// =============================================================================
function AddContactModal({ onClose, onSubmit, defaults }) {
  const meName = window.CURRENT_USER?.name || (window.SALES_TEAM?.[0]?.name || '');
  const [data, setData] = React.useState({
    name: '', role: '',
    company: defaults?.company || '',
    orgId:   defaults?.orgId   || null,
    emailWork: '', emailPersonal: '', phoneWork: '', phoneMobile: '',
    city: defaults?.city || 'Amman',
    owner: defaults?.owner || meName,
    primary: false,
    notes: '',
  });
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));
  const can = data.name && data.emailWork && data.company;

  return (
    <ModalShell
      title="Add new contact"
      subtitle={defaults?.company ? `New contact at ${defaults.company}` : 'Create a contact record in IMG CRM'}
      onClose={onClose}
      width={560}
      footer={
        <>
          <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" disabled={!can} onClick={() => onSubmit?.(data)}>Add contact</Btn>
        </>
      }
    >
      <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Full name" required>
          <TextInput value={data.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Tariq Al-Sayed" />
        </Field>
        <Field label="Role / title">
          <TextInput value={data.role} onChange={e => set('role', e.target.value)} placeholder="e.g. Facilities Director" />
        </Field>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Company" required hint={data.orgId ? 'Linked to existing organization' : (data.company.length >= 2 ? 'New organization — will be created on save' : 'Type to search the 20 organizations on file')}>
            <window.AccountCombobox
              value={data.company}
              onChange={(v) => setData(d => ({ ...d, company: v, orgId: null }))}
              onPick={(o) => setData(d => ({ ...d, company: o.name, orgId: o.id, city: o.city || d.city }))}
            />
          </Field>
        </div>
        <Field label="City">
          <Select value={data.city} onChange={e => set('city', e.target.value)}
            options={['Amman', 'Aqaba', 'Irbid', 'Zarqa', 'Dead Sea'].map(c => ({ value: c, label: c }))} />
        </Field>
        <Field label="Owner">
          <Select value={data.owner} onChange={e => set('owner', e.target.value)}
            options={(window.SALES_TEAM || []).map(u => ({ value: u.name, label: u.name }))} />
        </Field>
        <Field label="Work email" required>
          <TextInput type="email" value={data.emailWork} onChange={e => set('emailWork', e.target.value)} placeholder="name@example.com" />
        </Field>
        <Field label="Mobile">
          <TextInput value={data.phoneMobile} onChange={e => set('phoneMobile', e.target.value)} placeholder="079 ..." />
        </Field>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Primary contact?">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 6 }}>
              <button type="button" onClick={() => set('primary', !data.primary)}
                style={{
                  width: 36, height: 20, borderRadius: 999, border: 'none', cursor: 'pointer',
                  background: data.primary ? 'var(--img-orange)' : 'var(--neutral-200)',
                  position: 'relative', transition: 'background 160ms', flexShrink: 0,
                }}>
                <span style={{
                  position: 'absolute', top: 2, left: data.primary ? 18 : 2,
                  width: 16, height: 16, borderRadius: '50%', background: '#fff',
                  boxShadow: 'var(--shadow-sm)', transition: 'left 160ms',
                }}></span>
              </button>
              <span style={{ fontSize: 12, color: 'var(--fg-secondary)' }}>
                {data.primary ? 'Primary contact for this organization' : 'Secondary contact'}
              </span>
            </div>
          </Field>
        </div>
      </div>
    </ModalShell>
  );
}
window.AddContactModal = AddContactModal;

// =============================================================================
// REQUEST DESIGN MODAL — used by the Pipeline "Request Design" / "Request Modification" buttons.
// Calls POST /api/design-requests (new) or POST /api/design-requests/:id/revision (modification).
// =============================================================================
function RequestDesignModal({ deal, kind = 'new', priorRequestId, oppDbMap, onClose, onSubmitted }) {
  const isMod = kind === 'modification';
  const [data, setData] = React.useState({
    project_type: isMod ? 'Modification' : 'New Design',
    urgency: 'Standard',
    salesman_notes: '',
    site_plans: [],
  });
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [fileName, setFileName] = React.useState('');
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));

  const dbOppId = oppDbMap?.[deal.name];
  const canSubmit = data.salesman_notes.trim().length > 5 && (dbOppId || isMod);

  const addFile = () => {
    if (!fileName.trim()) return;
    set('site_plans', [...data.site_plans, { name: fileName.trim(), size: Math.round(Math.random() * 3000000) + 200000 }]);
    setFileName('');
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      let result;
      if (isMod && priorRequestId) {
        result = await window.api.post(`/design-requests/${priorRequestId}/revision`, data);
      } else {
        if (!dbOppId) throw new Error(`Opportunity "${deal.name}" not found in DB — run the design seed.`);
        result = await window.api.post(`/design-requests`, { ...data, opportunity_id: dbOppId });
      }
      onSubmitted?.(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      title={isMod ? 'Request modification' : 'Request design'}
      subtitle={`${deal.name} · ${deal.account}`}
      onClose={onClose}
      width={580}
      footer={
        <>
          <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" disabled={!canSubmit || submitting} onClick={submit}>
            {submitting ? 'Submitting…' : (isMod ? 'Request modification' : 'Send to design team')}
          </Btn>
        </>
      }
    >
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && (
          <div style={{ padding: 10, background: 'var(--color-danger-bg)', color: '#B0241D', borderRadius: 6, fontSize: 12 }}>{error}</div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Project type">
            <Select value={data.project_type} onChange={e => set('project_type', e.target.value)}
              options={['New Design', 'Modification', 'As-Built'].map(v => ({ value: v, label: v }))} />
          </Field>
          <Field label="Urgency">
            <Select value={data.urgency} onChange={e => set('urgency', e.target.value)}
              options={['Standard', 'Urgent', 'Critical'].map(v => ({ value: v, label: v }))} />
          </Field>
        </div>
        <Field label="Notes for the design team" required hint="Context, constraints, expected deliverables — anything Sally or the designer needs to know">
          <textarea value={data.salesman_notes} onChange={e => set('salesman_notes', e.target.value)}
            rows={5} placeholder={isMod
              ? 'What needs to change from the previous version?'
              : 'Describe the scope, project size, key constraints, expected close date…'}
            style={{ ...inputStyle, height: 'auto', padding: 10, resize: 'vertical', fontFamily: 'inherit', width: '100%' }} />
        </Field>
        <Field label="Site plans" hint="Optional — attach drawings, surveys, or the architect's brief">
          <div style={{
            padding: 10, border: '1px dashed var(--border-default)', borderRadius: 7,
            background: 'var(--neutral-25)', display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={fileName} onChange={e => setFileName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFile(); } }}
                placeholder="e.g. site-survey.pdf"
                style={{ flex: 1, ...inputStyle }} />
              <Btn kind="secondary" size="sm" onClick={addFile} disabled={!fileName.trim()}>Add file</Btn>
            </div>
            {data.site_plans.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'var(--bg-surface)', borderRadius: 5, fontSize: 11.5 }}>
                <span style={{ flex: 1 }}>{f.name}</span>
                <button onClick={() => set('site_plans', data.site_plans.filter((_, j) => j !== i))}
                  style={{ border: 'none', background: 'transparent', color: 'var(--fg-tertiary)', cursor: 'pointer', fontSize: 16 }}>×</button>
              </div>
            ))}
            {data.site_plans.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>No files attached.</div>
            )}
          </div>
        </Field>
      </div>
    </ModalShell>
  );
}
window.RequestDesignModal = RequestDesignModal;
