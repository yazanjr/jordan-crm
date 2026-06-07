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
  const top = anchorRect.bottom + 6;
  let left = align === 'right' ? anchorRect.right - width : anchorRect.left;
  left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
  return (
    <div ref={ref} style={{
      position: 'fixed', top, left, width, zIndex: 300,
      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 10, boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
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

// ============================================================
// 1) NEW DEAL MODAL — 3-step wizard
// ============================================================
function NewDealModal({ onClose, onSubmit, users }) {
  const ownerOptions = (users && users.length)
    ? users.map(u => ({ value: u.name, label: u.name }))
    : [
      { value: 'Hala Jaber',  label: 'Hala Jaber' },
      { value: 'Rami Haddad', label: 'Rami Haddad' },
      { value: 'Sana Khalil', label: 'Sana Khalil' },
      { value: 'Ahmad Marji', label: 'Ahmad Marji' },
      { value: 'Layla Odeh',  label: 'Layla Odeh' },
    ];
  const defaultOwner = ownerOptions[0]?.value || 'Hala Jaber';

  const [step, setStep] = React.useState(0);
  const [data, setData] = React.useState({
    name: '', account: '', value: '', stage: 'prospect',
    owner: defaultOwner, scope: 'VRF', closeDate: '2026-08-15', probability: 20,
    closeQuarter: 'Q3 2026',
    contactName: '', contactRole: '', contactEmail: '', contactPhone: '',
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
                : step === 1 ? data.contactName && data.contactEmail
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
            <TextInput value={data.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Marriott Amman — VRF retrofit, 8 floors" />
          </Field>
          <Field label="Account / customer" required>
            <TextInput value={data.account} onChange={e => set('account', e.target.value)} placeholder="Search or create account…" />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Owner">
              <Select value={data.owner} onChange={e => set('owner', e.target.value)} options={ownerOptions} />
            </Field>
            <Field label="HVAC scope">
              <Select value={data.scope} onChange={e => set('scope', e.target.value)} options={[
                { value: 'VRF', label: 'VRF' },
                { value: 'Chillers', label: 'Chillers' },
                { value: 'AHU', label: 'AHU' },
                { value: 'FCU', label: 'FCU' },
                { value: 'Chillers + AHU', label: 'Chillers + AHU' },
                { value: 'Full MEP HVAC', label: 'Full MEP HVAC' },
                { value: 'Industrial vent.', label: 'Industrial vent.' },
                { value: 'Central plant', label: 'Central plant' },
              ]} />
            </Field>
          </div>
        </>}

        {step === 1 && <>
          <Field label="Contact name" required>
            <TextInput value={data.contactName} onChange={e => set('contactName', e.target.value)} placeholder="e.g. Khaled Mansour" />
          </Field>
          <Field label="Role">
            <TextInput value={data.contactRole} onChange={e => set('contactRole', e.target.value)} placeholder="e.g. Facilities Director" />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
            <Field label="Email" required>
              <TextInput type="email" value={data.contactEmail} onChange={e => set('contactEmail', e.target.value)} placeholder="name@example.com" />
            </Field>
            <Field label="Phone">
              <TextInput value={data.contactPhone} onChange={e => set('contactPhone', e.target.value)} placeholder="+962 79 …" />
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

// ============================================================
// 6) NOTIFICATIONS DROPDOWN
// ============================================================
function NotificationsPopover({ anchorRect, onClose, onMarkAllRead, notifications }) {
  const { Bell, Check, File: FileI, Phone, Briefcase } = window.Icons;
  const ICON_FOR_TYPE = {
    new_opportunity:    Briefcase,
    stage_change:       Briefcase,
    assignment:         FileI,
    opportunity_closed: Check,
    quotation:          FileI,
    discount:           Bell,
    activity:           Phone,
  };
  const COLOR_FOR_TYPE = {
    new_opportunity:    'var(--img-orange)',
    stage_change:       'var(--img-orange)',
    assignment:         'var(--img-green)',
    opportunity_closed: 'var(--img-green)',
    quotation:          'var(--img-green)',
    discount:           'var(--color-warning)',
    activity:           'var(--neutral-400)',
  };

  function relTime(iso) {
    if (!iso) return '';
    const ms = Date.now() - new Date(iso).getTime();
    const m = Math.floor(ms / 60000);
    if (m < 1)    return 'just now';
    if (m < 60)   return m + 'm';
    const h = Math.floor(m / 60);
    if (h < 24)   return h + 'h';
    const d = Math.floor(h / 24);
    if (d === 1)  return 'yesterday';
    if (d < 7)    return d + 'd';
    return Math.floor(d / 7) + 'w';
  }

  const items = (notifications || []).slice(0, 30).map(n => ({
    raw: n,
    icon: ICON_FOR_TYPE[n.type] || Bell,
    color: COLOR_FOR_TYPE[n.type] || 'var(--neutral-400)',
    who: n.type.replace(/_/g, ' '),
    what: n.message,
    when: relTime(n.created_at),
    unread: !n.is_read,
  }));
  return (
    <Popover anchorRect={anchorRect} onClose={onClose} width={360} align="right">
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>Notifications</span>
        <button
          onClick={() => { onMarkAllRead?.(); onClose?.(); }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--img-orange)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--img-orange-700)'}
          style={{ background: 'transparent', border: 'none', color: 'var(--img-orange-700)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
        >Mark all read</button>
      </div>
      <div style={{ maxHeight: 360, overflowY: 'auto' }}>
        {items.length === 0 && (
          <div style={{ padding: '32px 14px', textAlign: 'center', color: 'var(--fg-tertiary)', fontSize: 12 }}>
            No notifications yet.
          </div>
        )}
        {items.map((n, i) => (
          <div key={n.raw?.id || i} style={{
            display: 'flex', gap: 10, padding: '10px 14px',
            borderBottom: i < items.length - 1 ? '1px solid var(--border-subtle)' : 'none',
            background: n.unread ? 'var(--img-orange-50)' : 'transparent',
            cursor: 'pointer',
          }}>
            <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#fff', color: n.color, border: `1px solid ${n.color}33`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <n.icon size={13} />
            </span>
            <div style={{ flex: 1, fontSize: 12, lineHeight: 1.4 }}>
              <div><span style={{ fontWeight: 600 }}>{n.who}</span> <span style={{ color: 'var(--fg-secondary)' }}>{n.what}</span></div>
              <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 2 }}>{n.when} ago</div>
            </div>
            {n.unread && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--img-orange)', flexShrink: 0, marginTop: 8 }}></span>}
          </div>
        ))}
      </div>
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-subtle)', textAlign: 'center' }}>
        <a href="#" style={{ fontSize: 12, fontWeight: 600, color: 'var(--img-orange-700)' }}>View all activity →</a>
      </div>
    </Popover>
  );
}
window.NotificationsPopover = NotificationsPopover;

// ============================================================
// 7) FILTER POPOVER
// ============================================================
function FilterPopover({ anchorRect, onClose, filters, setFilters }) {
  const stages = ['prospect', 'tender', 'analysis', 'negotiation', 'closing'];
  const scopes = ['VRF', 'Chillers', 'AHU', 'FCU', 'Chillers + AHU', 'Full MEP HVAC', 'Industrial vent.', 'Central plant'];
  const toggle = (key, val) => {
    const arr = filters[key] || [];
    const next = arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];
    setFilters({ ...filters, [key]: next });
  };
  return (
    <Popover anchorRect={anchorRect} onClose={onClose} width={320}>
      <div style={{ padding: 14 }}>
        <MenuLabel>Stage</MenuLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {stages.map(s => {
            const meta = window.STAGE_META[s];
            const on = (filters.stages || []).includes(s);
            return (
              <button key={s} onClick={() => toggle('stages', s)} style={{
                padding: '4px 10px', borderRadius: 999,
                border: `1px solid ${on ? meta.fg : 'var(--border-default)'}`,
                background: on ? meta.bg : 'transparent',
                color: on ? meta.fg : 'var(--fg-secondary)',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}>{meta.label}</button>
            );
          })}
        </div>

        <MenuLabel>Scope</MenuLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {scopes.map(s => {
            const on = (filters.scopes || []).includes(s);
            return (
              <button key={s} onClick={() => toggle('scopes', s)} style={{
                padding: '4px 10px', borderRadius: 999,
                border: `1px solid ${on ? 'var(--img-orange)' : 'var(--border-default)'}`,
                background: on ? 'var(--img-orange-50)' : 'transparent',
                color: on ? 'var(--img-orange-700)' : 'var(--fg-secondary)',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}>{s}</button>
            );
          })}
        </div>

        <MenuLabel>Min value (JOD)</MenuLabel>
        <input type="range" min="0" max="600000" step="10000" value={filters.minValue || 0}
          onChange={e => setFilters({ ...filters, minValue: +e.target.value })}
          style={{ width: '100%', accentColor: 'var(--img-orange)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--fg-secondary)' }}>
          <span>JOD 0</span>
          <span className="t-num" style={{ color: 'var(--fg-primary)', fontWeight: 600 }}>≥ {window.formatJODshort(filters.minValue || 0)}</span>
        </div>
      </div>
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={() => setFilters({})} style={{ background: 'transparent', border: 'none', color: 'var(--fg-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Clear all</button>
        <Btn kind="primary" size="sm" onClick={onClose}>Apply</Btn>
      </div>
    </Popover>
  );
}
window.FilterPopover = FilterPopover;

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
function PersonPopover({ anchorRect, onClose, person, setPerson, users }) {
  const list = (users && users.length)
    ? users.map(u => u.name)
    : ['Hala Jaber', 'Rami Haddad', 'Sana Khalil', 'Ahmad Marji', 'Layla Odeh'];
  const people = ['All people', ...list];
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
function UserMenu({ anchorRect, onClose, onAction, user }) {
  const { Settings, Users, Bell, More } = window.Icons;
  const name  = user?.name  || 'User';
  const email = user?.email || '';
  return (
    <Popover anchorRect={anchorRect} onClose={onClose} width={240} align="left">
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <window.Avatar name={name} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{name}</div>
          <div style={{ fontSize: 11, color: 'var(--fg-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>
        </div>
      </div>
      <div style={{ padding: '6px 0' }}>
        <MenuItem icon={Settings} onClick={() => { onAction('profile'); onClose(); }}>Profile settings</MenuItem>
        <MenuItem icon={Bell}     onClick={() => { onAction('notif'); onClose(); }}>Notifications</MenuItem>
        <MenuItem icon={Users}    onClick={() => { onAction('team'); onClose(); }}>Team management</MenuItem>
        <MenuSeparator />
        <MenuItem icon={More}     onClick={() => { onAction('help'); onClose(); }}>Help &amp; support</MenuItem>
        <MenuItem icon={More} danger onClick={() => { onAction('signout'); onClose(); }}>Sign out</MenuItem>
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
function CommandPalette({ onClose, onJump, deals }) {
  const { Search, Briefcase, Users, Building, File: FileI, Plus } = window.Icons;
  const [q, setQ] = React.useState('');
  const sourceDeals = (deals && deals.length) ? deals : (window.DEALS || []);
  const allItems = [
    { type: 'action', icon: Plus, label: 'Create new deal', section: 'Actions', go: 'new-deal' },
    { type: 'action', icon: FileI, label: 'Create quotation', section: 'Actions', go: 'new-quote' },
    { type: 'page', icon: Users, label: 'Contacts', section: 'Navigate', go: 'page:contacts' },
    { type: 'page', icon: Building, label: 'Companies', section: 'Navigate', go: 'page:companies' },
    ...sourceDeals.slice(0, 8).map(d => ({ type: 'deal', icon: Briefcase, label: d.name, sub: d.id, section: 'Deals', go: 'deal:' + d.id })),
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

// ============================================================
// 16) LOST-REASON MODAL — shown when closing a deal as Lost
// (the API requires a lost_reason_id)
// ============================================================
function LostReasonModal({ deal, lostReasons = [], onClose, onConfirm }) {
  const [reasonId, setReasonId] = React.useState(lostReasons[0]?.id || null);
  const [notes, setNotes] = React.useState('');

  return (
    <ModalShell
      title="Mark deal as Lost"
      subtitle={deal ? `"${deal.name}" will be archived as Closed-Lost.` : ''}
      width={480}
      onClose={onClose}
      footer={
        <>
          <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
          <Btn kind="danger" disabled={!reasonId} onClick={() => onConfirm?.({ lostReasonId: reasonId, lostNotes: notes })}>
            Mark as Lost
          </Btn>
        </>
      }
    >
      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Reason" required>
          <Select
            value={reasonId || ''}
            onChange={e => setReasonId(Number(e.target.value))}
            options={lostReasons.map(r => ({ value: r.id, label: r.label }))}
          />
        </Field>
        <Field label="Notes (optional)" hint="Anything the team should know — e.g. competitor name, key blocker.">
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Optional notes…"
            style={{ ...inputStyle, height: 80, padding: 10, resize: 'vertical' }}
          />
        </Field>
      </div>
    </ModalShell>
  );
}
window.LostReasonModal = LostReasonModal;
