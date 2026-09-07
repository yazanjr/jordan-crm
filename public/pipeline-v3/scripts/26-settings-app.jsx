// Settings page — IMG CRM. Admin-only console for the system-wide values stored
// in the `settings` table (GET/PUT /api/settings). Two tabs:
//   • General — the scalar knobs (discount limit, overload threshold, portal link,
//     default currency).
//   • Lists   — the editable option lists (currencies, product groups, segments,
//     lead sources, lost reasons, activity types) shown across the app.
// Only `admin` holds settings.manage, so non-admins get a friendly lock screen.

const { useState, useMemo, useEffect } = React;

// Human-friendly metadata for each setting key. `group` decides the tab; `kind`
// decides the editor. Any key returned by the API that isn't listed here falls
// back to a plain text field under General, so new settings never disappear.
const SETTING_META = {
  // ---- General (scalars) ----
  discount_limit: {
    group: 'general', kind: 'number', unit: '%',
    label: 'Standard discount limit',
    help: 'The highest discount a salesman can give on their own. Anything above this needs a manager’s approval.',
  },
  designer_overload: {
    group: 'general', kind: 'number', unit: 'tasks',
    label: 'Designer overload threshold',
    help: 'When a designer has this many active tasks, the system flags them as overloaded.',
  },
  currency_default: {
    group: 'general', kind: 'currency',
    label: 'Default currency',
    help: 'The currency pre-selected on new deals and quotations. Choose from the Currencies list.',
  },
  imi_portal_url: {
    group: 'general', kind: 'url',
    label: 'Iraq IMI Portal link',
    help: 'Web address of the Iraq portal. Used by the login screen’s “Open IMI Portal” link.',
  },
  // ---- Lists ----
  currencies: {
    group: 'lists', label: 'Currencies',
    help: 'Currencies that can be picked anywhere in the app.',
    placeholder: 'e.g. SAR',
  },
  product_groups: {
    group: 'lists', label: 'Product groups',
    help: 'HVAC product categories shown on deals and in the pipeline filter.',
    placeholder: 'e.g. Heat Pumps',
  },
  segments: {
    group: 'lists', label: 'Market segments',
    help: 'Sectors a project can belong to (Commercial, Government…).',
    placeholder: 'e.g. Hospitality',
  },
  lead_sources: {
    group: 'lists', label: 'Lead sources',
    help: 'Where an opportunity came from — offered when creating a deal.',
    placeholder: 'e.g. Exhibition',
  },
  lost_reasons: {
    group: 'lists', label: 'Lost reasons',
    help: 'Reasons a salesman must pick when marking a deal as lost.',
    placeholder: 'e.g. Timing not right',
  },
  activity_types: {
    group: 'lists', label: 'Activity types',
    help: 'Kinds of activity you can log against a deal (Call, Meeting…).',
    placeholder: 'e.g. Site visit',
  },
};

// Display order within each tab.
const GENERAL_ORDER = ['discount_limit', 'designer_overload', 'currency_default', 'imi_portal_url'];
const LISTS_ORDER   = ['currencies', 'product_groups', 'segments', 'lead_sources', 'lost_reasons', 'activity_types'];

const isListSetting = (row) => row.type === 'list';

// Parse a raw DB row's value into the shape the editor works with:
// lists → array, everything else → string.
function parseValue(row) {
  if (isListSetting(row)) {
    try { return Array.isArray(row.value) ? row.value : JSON.parse(row.value || '[]'); }
    catch { return []; }
  }
  return row.value == null ? '' : String(row.value);
}

// Format an ISO-ish timestamp as a short, friendly "last edited" line.
function friendlyDate(s) {
  if (!s) return null;
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function SettingsApp() {
  const { Settings, Layers, Link, Check, Close, Plus, Users } = window.Icons;

  const [popover, setPopover] = useState(null);
  const [toast, setToast]     = useState(null);
  const fireToast = (msg, tone) => setToast({ msg, kind: tone === 'danger' ? 'error' : undefined });

  const [activeTab, setActiveTab] = useState('general');

  // Keep the sidebar user roster in sync across pages.
  const [, setUsersReady] = useState(false);
  useEffect(() => { window.loadRealUsers().then(ok => { if (ok) setUsersReady(true); }); }, []);

  const roleKey = (window.CURRENT_USER && window.CURRENT_USER.roleKey) || '';
  const isAdmin = roleKey === 'admin';

  // rows: the raw setting rows from the server (source of truth for meta/type).
  // original / edited: key → parsed value. `edited` is what the form mutates.
  const [rows, setRows]         = useState(null);
  const [original, setOriginal] = useState({});
  const [edited, setEdited]     = useState({});
  const [saving, setSaving]     = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    window.api.get('/settings/raw')
      .then(list => {
        const safe = Array.isArray(list) ? list : [];
        setRows(safe);
        const map = {};
        safe.forEach(r => { map[r.key] = parseValue(r); });
        setOriginal(map);
        setEdited(JSON.parse(JSON.stringify(map)));
      })
      .catch(() => { setLoadError(true); setRows([]); });
  }, [isAdmin]);

  // Which keys have unsaved changes.
  const dirtyKeys = useMemo(() => {
    return Object.keys(edited).filter(k => JSON.stringify(edited[k]) !== JSON.stringify(original[k]));
  }, [edited, original]);
  const dirty = dirtyKeys.length > 0;

  const setField = (key, value) => setEdited(prev => ({ ...prev, [key]: value }));

  const discard = () => setEdited(JSON.parse(JSON.stringify(original)));

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      for (const key of dirtyKeys) {
        await window.api.put('/settings/' + key, { value: edited[key] });
      }
      setOriginal(JSON.parse(JSON.stringify(edited)));
      fireToast(`Saved ${dirtyKeys.length} change${dirtyKeys.length === 1 ? '' : 's'}`, 'success');
    } catch (e) {
      fireToast(e?.message || 'Could not save — please try again', 'danger');
    } finally {
      setSaving(false);
    }
  };

  // Rows grouped by tab, in display order, with unknown keys appended to General.
  const rowByKey = useMemo(() => {
    const m = {}; (rows || []).forEach(r => { m[r.key] = r; }); return m;
  }, [rows]);

  const generalRows = useMemo(() => {
    if (!rows) return [];
    const known = new Set([...GENERAL_ORDER, ...LISTS_ORDER]);
    const ordered = GENERAL_ORDER.filter(k => rowByKey[k]);
    const extras = rows.filter(r => !known.has(r.key) && !isListSetting(r)).map(r => r.key);
    return [...ordered, ...extras].map(k => rowByKey[k]).filter(Boolean);
  }, [rows, rowByKey]);

  const listRows = useMemo(() => {
    if (!rows) return [];
    const ordered = LISTS_ORDER.filter(k => rowByKey[k]);
    const extras = rows.filter(r => isListSetting(r) && !LISTS_ORDER.includes(r.key)).map(r => r.key);
    return [...ordered, ...extras].map(k => rowByKey[k]).filter(Boolean);
  }, [rows, rowByKey]);

  const currencyOptions = Array.isArray(edited.currencies) ? edited.currencies : [];

  return (
    <>
      <window.Sidebar
        active="settings"
        onNav={(id) => {
          if (id === 'pipeline')     { window.location.href = 'Pipeline.html'; return; }
          if (id === 'contacts')     { window.location.href = 'Contacts.html'; return; }
          if (id === 'reports')      { window.location.href = 'Reports.html'; return; }
          if (id === 'design-board') { window.location.href = 'DesignBoard.html'; return; }
          if (id === 'my-tasks')     { window.location.href = 'MyTasks.html'; return; }
          if (id === 'pricelist')    { window.location.href = 'Pricelist.html'; return; }
          if (id === 'costing')      { window.location.href = 'QuotationCosting.html'; return; }
          if (id === 'settings')     { window.location.href = 'Settings.html'; return; }
        }}
        onUserMenu={(rect) => setPopover({ kind: 'user', rect })}
        onNotifications={(rect) => setPopover({ kind: 'notif', rect })}
      />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <window.TopBar
          title="Settings"
          tabs={isAdmin ? [
            { id: 'general', label: 'General', icon: Settings },
            { id: 'lists',   label: 'Lists',   icon: Layers },
            { id: 'users',   label: 'Users',   icon: Users },
            { id: 'roles',   label: 'Roles & Permissions', icon: Check },
          ] : []}
          activeTab={activeTab}
          onTab={setActiveTab}
          showBreadcrumb={true}
        />

        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)', position: 'relative' }}>
          {!isAdmin ? (
            <LockScreen />
          ) : loadError ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--fg-tertiary)' }}>
              Could not load settings. Please refresh the page.
            </div>
          ) : !rows ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--fg-tertiary)' }}>Loading…</div>
          ) : activeTab === 'users' ? (
            <window.UsersTab onToast={fireToast} />
          ) : activeTab === 'roles' ? (
            <window.RolesTab onToast={fireToast} />
          ) : (
            <div style={{ maxWidth: 780, margin: '0 auto', padding: '24px 24px 120px' }}>
              {activeTab === 'general'
                ? <GeneralTab rows={generalRows} edited={edited} setField={setField} currencyOptions={currencyOptions} />
                : <ListsTab rows={listRows} edited={edited} setField={setField} />}
            </div>
          )}

          {/* Sticky unsaved-changes bar — only for the settings-form tabs */}
          {isAdmin && dirty && (activeTab === 'general' || activeTab === 'lists') && (
            <SaveBar count={dirtyKeys.length} saving={saving} onSave={save} onDiscard={discard} />
          )}
        </div>
      </main>

      {popover?.kind === 'notif' && <window.NotificationsPopover anchorRect={popover.rect} onClose={() => setPopover(null)} />}
      {popover?.kind === 'user'  && <window.UserMenu anchorRect={popover.rect} onClose={() => setPopover(null)} onAction={(a) => fireToast(`Open ${a}…`)} />}

      <window.Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

// ============================================================
// Shared field chrome
// ============================================================
function FieldCard({ meta, keyName, children, rightMeta }) {
  const label = meta?.label || keyName;
  const help  = meta?.help;
  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-lg)', padding: '16px 18px', marginBottom: 14,
      boxShadow: 'var(--shadow-xs)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: help ? 2 : 10 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-primary)', flex: 1 }}>{label}</div>
        {rightMeta}
      </div>
      {help && <div style={{ fontSize: 12, color: 'var(--fg-secondary)', lineHeight: 1.5, marginBottom: 12 }}>{help}</div>}
      {children}
    </div>
  );
}

const stInputStyle = {
  height: 36, padding: '0 12px', borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-default)', background: 'var(--bg-surface)',
  fontSize: 13, color: 'var(--fg-primary)', outline: 'none', width: '100%',
};
function focusRing(e, on) {
  e.currentTarget.style.borderColor = on ? 'var(--border-focus)' : 'var(--border-default)';
  e.currentTarget.style.boxShadow = on ? 'var(--shadow-focus)' : 'none';
}

// ============================================================
// GENERAL TAB
// ============================================================
function GeneralTab({ rows, edited, setField, currencyOptions }) {
  if (!rows.length) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-tertiary)' }}>No general settings.</div>;
  return (
    <div>
      <SectionIntro>System-wide values used across the CRM. Changes take effect immediately after you save.</SectionIntro>
      {rows.map(row => {
        const meta = SETTING_META[row.key] || { group: 'general', kind: 'text', label: row.key, help: row.description };
        const kind = meta.kind || 'text';
        const val  = edited[row.key] ?? '';
        const editedAt = friendlyDate(row.updated_at);
        return (
          <FieldCard key={row.key} meta={meta} keyName={row.key}
            rightMeta={editedAt ? <span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>edited {editedAt}</span> : null}>
            {kind === 'number' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, maxWidth: 220 }}>
                <input type="number" value={val} min="0"
                  onChange={e => setField(row.key, e.target.value)}
                  onFocus={e => focusRing(e, true)} onBlur={e => focusRing(e, false)}
                  style={{ ...stInputStyle }} />
                {meta.unit && <span style={{ fontSize: 13, color: 'var(--fg-secondary)', whiteSpace: 'nowrap' }}>{meta.unit}</span>}
              </div>
            ) : kind === 'currency' ? (
              <select value={val}
                onChange={e => setField(row.key, e.target.value)}
                onFocus={e => focusRing(e, true)} onBlur={e => focusRing(e, false)}
                style={{ ...stInputStyle, maxWidth: 220, cursor: 'pointer' }}>
                {!currencyOptions.includes(val) && val !== '' && <option value={val}>{val}</option>}
                {currencyOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <input type={kind === 'url' ? 'url' : 'text'} value={val}
                placeholder={kind === 'url' ? 'https://…' : ''}
                onChange={e => setField(row.key, e.target.value)}
                onFocus={e => focusRing(e, true)} onBlur={e => focusRing(e, false)}
                style={{ ...stInputStyle, maxWidth: 460 }} />
            )}
          </FieldCard>
        );
      })}
    </div>
  );
}

// ============================================================
// LISTS TAB
// ============================================================
function ListsTab({ rows, edited, setField }) {
  if (!rows.length) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-tertiary)' }}>No list settings.</div>;
  return (
    <div>
      <SectionIntro>These option lists appear in dropdowns and filters across the app. Add or remove items, then save.</SectionIntro>
      {rows.map(row => {
        const meta = SETTING_META[row.key] || { label: row.key, help: row.description };
        const items = Array.isArray(edited[row.key]) ? edited[row.key] : [];
        return (
          <FieldCard key={row.key} meta={meta} keyName={row.key}
            rightMeta={<span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{items.length} item{items.length === 1 ? '' : 's'}</span>}>
            <TagEditor
              items={items}
              placeholder={meta.placeholder || 'Add an item…'}
              onChange={next => setField(row.key, next)}
            />
          </FieldCard>
        );
      })}
    </div>
  );
}

// Chip-style editor for a list of strings. Add via input+Enter or the Add button;
// remove via each chip's ×. Blocks blank and case-insensitive duplicate entries.
function TagEditor({ items, onChange, placeholder }) {
  const { Close, Plus } = window.Icons;
  const [draft, setDraft] = useState('');

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (items.some(x => x.toLowerCase() === v.toLowerCase())) { setDraft(''); return; }
    onChange([...items, v]);
    setDraft('');
  };
  const remove = (idx) => onChange(items.filter((_, i) => i !== idx));

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: items.length ? 12 : 0 }}>
        {items.map((it, i) => (
          <span key={it + i} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'var(--img-orange-50)', border: '1px solid var(--img-orange-100)',
            color: 'var(--fg-primary)', borderRadius: 'var(--radius-full)',
            padding: '4px 6px 4px 12px', fontSize: 12.5, fontWeight: 500,
          }}>
            {it}
            <button title="Remove" onClick={() => remove(i)} style={{
              width: 18, height: 18, borderRadius: '50%', border: 'none', cursor: 'pointer',
              background: 'transparent', color: 'var(--fg-tertiary)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--img-orange)'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-tertiary)'; }}>
              <Close size={12} />
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, maxWidth: 360 }}>
        <input value={draft} placeholder={placeholder}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          onFocus={e => focusRing(e, true)} onBlur={e => focusRing(e, false)}
          style={{ ...stInputStyle, height: 34 }} />
        <button onClick={add} disabled={!draft.trim()} style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
          height: 34, padding: '0 12px', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-default)', background: 'var(--bg-surface)',
          color: draft.trim() ? 'var(--fg-primary)' : 'var(--fg-disabled)',
          fontSize: 13, fontWeight: 500, cursor: draft.trim() ? 'pointer' : 'not-allowed',
        }}>
          <Plus size={14} /> Add
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Chrome: intro line, save bar, lock screen
// ============================================================
function SectionIntro({ children }) {
  return <div style={{ fontSize: 12.5, color: 'var(--fg-secondary)', lineHeight: 1.5, marginBottom: 18 }}>{children}</div>;
}

function SaveBar({ count, saving, onSave, onDiscard }) {
  const { Check } = window.Icons;
  return (
    <div style={{
      position: 'sticky', bottom: 0, left: 0, right: 0,
      display: 'flex', justifyContent: 'center', pointerEvents: 'none',
      padding: '0 24px 20px',
    }}>
      <div style={{
        pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 14,
        background: 'var(--fg-primary)', color: '#fff',
        borderRadius: 'var(--radius-full)', padding: '8px 8px 8px 18px',
        boxShadow: 'var(--shadow-lg)',
      }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>
          {count} unsaved change{count === 1 ? '' : 's'}
        </span>
        <button onClick={onDiscard} disabled={saving} style={{
          height: 32, padding: '0 14px', borderRadius: 'var(--radius-full)', border: 'none',
          background: 'transparent', color: 'rgba(255,255,255,0.85)',
          fontSize: 13, fontWeight: 500, cursor: saving ? 'default' : 'pointer',
        }}>Discard</button>
        <button onClick={onSave} disabled={saving} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          height: 32, padding: '0 16px', borderRadius: 'var(--radius-full)', border: 'none',
          background: 'var(--img-orange)', color: '#fff',
          fontSize: 13, fontWeight: 600, cursor: saving ? 'default' : 'pointer',
          opacity: saving ? 0.7 : 1,
        }}>
          <Check size={15} /> {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}

function LockScreen() {
  const { Settings } = window.Icons;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 48, textAlign: 'center' }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%', background: 'var(--bg-sunken)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-tertiary)', marginBottom: 16,
      }}>
        <Settings size={26} />
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg-primary)', marginBottom: 6 }}>Settings are admin-only</div>
      <div style={{ fontSize: 13, color: 'var(--fg-secondary)', maxWidth: 340, lineHeight: 1.5 }}>
        System settings are managed by an administrator. Ask your admin if something here needs to change.
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<SettingsApp />);
