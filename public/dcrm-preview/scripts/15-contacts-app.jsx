// Contacts page — second page of the IMG CRM. Reuses Sidebar/TopBar from the
// pipeline scripts. Has list view + detail drawer + Add Contact pop-up.

const { useState, useMemo, useEffect } = React;

function ContactsApp() {
  const { Briefcase, Trend, Import, Zap, Search, Plus, Mail, Phone, Building, MapPin, Star, More, Filter, Layers, Close, Calendar, Chat } = window.Icons;

  const ME = 'Hala Jaber';

  const [contacts, setContacts] = useState(window.CONTACTS);
  const [activeNav, setActiveNav] = useState('contacts');
  const [activeTab, setActiveTab] = useState('all');           // all | mine | vip
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');     // all | active | inactive
  const [tagFilter, setTagFilter] = useState(null);
  const [selected, setSelected] = useState(null);
  const [modal, setModal] = useState(null);
  const [popover, setPopover] = useState(null);
  const [toast, setToast] = useState(null);

  const fireToast = (msg) => setToast({ msg });

  // Update a contact field; keep selected in sync.
  const updateContact = (id, patch) => {
    setContacts(cs => cs.map(c => c.id === id ? { ...c, ...patch } : c));
    setSelected(s => s && s.id === id ? { ...s, ...patch } : s);
  };

  // Companies on deals owned by me — drives "My contacts" tab.
  const myCompanies = useMemo(() => {
    const set = new Set();
    (window.DEALS || []).forEach(d => { if (d.owner === ME) set.add(d.account); });
    return set;
  }, []);
  const isMine = (c) => myCompanies.has(c.company);

  // Group by first letter
  const filtered = useMemo(() => {
    let list = contacts;
    if (activeTab === 'mine') list = list.filter(isMine);
    else if (activeTab === 'vip') list = list.filter(c => c.tags.includes('VIP') || c.tags.includes('Key account'));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.role.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') list = list.filter(c => c.status === statusFilter);
    if (tagFilter) list = list.filter(c => c.tags.includes(tagFilter));
    return list;
  }, [contacts, activeTab, myCompanies, search, statusFilter, tagFilter]);

  const grouped = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    const groups = {};
    sorted.forEach(c => {
      const letter = c.name[0].toUpperCase();
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(c);
    });
    return groups;
  }, [filtered]);

  // Stats
  const stats = useMemo(() => ({
    total: contacts.length,
    active: contacts.filter(c => c.status === 'active').length,
    vip: contacts.filter(c => c.tags.includes('VIP')).length,
    deals: contacts.reduce((s, c) => s + c.deals, 0),
  }), [contacts]);

  const tbBtn = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '6px 10px', height: 30, borderRadius: 6,
    background: 'transparent', color: 'var(--fg-primary)', border: 'none',
    fontSize: 13, fontWeight: 500, cursor: 'pointer',
  };

  const topRight = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button style={tbBtn} onClick={() => setModal({ kind: 'import' })}><Import size={14} /> Import</button>
      <button style={tbBtn}><Zap size={14} /> Export</button>
      <button onClick={() => setModal({ kind: 'addcontact' })} style={{
        ...tbBtn, padding: '6px 14px', height: 32,
        background: 'var(--img-orange)', color: '#fff', borderRadius: 7, fontWeight: 600,
      }}>
        <Plus size={14} /> Add contact
      </button>
    </div>
  );

  return (
    <>
      <window.Sidebar
        active={activeNav}
        onNav={(id) => {
          if (id === 'pipeline') { window.location.href = 'Pipeline.html'; return; }
          if (id === 'dashboard') { window.location.href = 'Pipeline.html'; return; }
          if (id === 'reports') { window.location.href = 'Reports.html'; return; }
          setActiveNav(id);
        }}
        onUserMenu={(rect) => setPopover({ kind: 'user', rect })}
        onNotifications={(rect) => setPopover({ kind: 'notif', rect })}
      />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <window.TopBar
          title="Contacts"
          tabs={[
            { id: 'all', label: 'All contacts', icon: window.Icons.Users },
            { id: 'mine', label: 'My contacts', icon: window.Icons.Users },
            { id: 'vip', label: 'VIP & key', icon: Star },
          ]}
          activeTab={activeTab}
          onTab={setActiveTab}
          right={topRight}
          showBreadcrumbs={true}
        />

        {/* Stat strip */}
        <div style={{
          padding: '14px 24px', borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16,
        }}>
          <Stat label="Total contacts" value={stats.total} />
          <Stat label="Active" value={stats.active} accent="green" />
          <Stat label="VIP / Key accounts" value={stats.vip} accent="orange" />
          <Stat label="Linked deals" value={stats.deals} />
        </div>

        {/* Filter bar */}
        <div style={{
          padding: '10px 24px', borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-tertiary)' }} />
            <input
              type="text" placeholder="Search by name, company, email…"
              value={search} onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', height: 32, padding: '0 10px 0 30px',
                border: '1px solid var(--border-default)', borderRadius: 7,
                fontSize: 13, fontFamily: 'inherit', outline: 'none',
                background: 'var(--bg-surface)',
              }}
            />
          </div>
          <SegBtn>
            {['all', 'active', 'inactive'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} style={{
                padding: '5px 12px', borderRadius: 5, border: 'none',
                background: statusFilter === s ? 'var(--bg-surface)' : 'transparent',
                color: statusFilter === s ? 'var(--fg-primary)' : 'var(--fg-secondary)',
                fontSize: 12, fontWeight: statusFilter === s ? 600 : 500, cursor: 'pointer',
                textTransform: 'capitalize',
                boxShadow: statusFilter === s ? 'var(--shadow-xs)' : 'none',
              }}>{s}</button>
            ))}
          </SegBtn>
          <div style={{ width: 1, height: 20, background: 'var(--border-subtle)' }}></div>
          {['VIP', 'Key account', 'Decision maker', 'Technical'].map(t => (
            <button key={t} onClick={() => setTagFilter(tagFilter === t ? null : t)} style={{
              padding: '4px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 500,
              border: '1px solid ' + (tagFilter === t ? 'var(--img-orange)' : 'var(--border-default)'),
              background: tagFilter === t ? 'var(--img-orange-50)' : 'transparent',
              color: tagFilter === t ? 'var(--img-orange-700)' : 'var(--fg-secondary)',
              cursor: 'pointer',
            }}>{t}</button>
          ))}
          <div style={{ flex: 1 }}></div>
          <span style={{ fontSize: 12, color: 'var(--fg-secondary)' }}>{filtered.length} of {contacts.length}</span>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)' }}>
          {Object.keys(grouped).sort().map(letter => (
            <div key={letter}>
              <div style={{
                position: 'sticky', top: 0, zIndex: 2,
                padding: '6px 24px', background: 'var(--neutral-50)',
                borderBottom: '1px solid var(--border-subtle)',
                fontSize: 11, fontWeight: 700, color: 'var(--fg-secondary)',
                letterSpacing: '0.08em', textTransform: 'uppercase',
              }}>{letter}</div>
              <div style={{ background: 'var(--bg-surface)' }}>
                {grouped[letter].map(c => (
                  <ContactRow key={c.id} contact={c} active={selected?.id === c.id}
                    onClick={() => setSelected(c)}
                    onMore={(rect) => setPopover({ kind: 'rowmenu', rect, contact: c })}
                  />
                ))}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--fg-tertiary)' }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>No contacts match</div>
              <div style={{ fontSize: 12 }}>Try a different search or clear filters.</div>
            </div>
          )}
        </div>
      </main>

      {selected && <ContactDetail contact={selected}
        onClose={() => setSelected(null)}
        onAction={(a) => fireToast(`${a} ${selected.name}…`)}
        onUpdate={(patch) => updateContact(selected.id, patch)}
        isMine={isMine(selected)}
      />}

      {/* Modals */}
      {modal?.kind === 'addcontact' && (
        <AddContactModal
          onClose={() => setModal(null)}
          onSubmit={(d) => {
            const id = 'C-' + (1100 + Math.floor(Math.random()*99));
            setContacts(cs => [{ ...d, id, deals: 0, status: 'active', tags: d.tags || [], lastContact: 'Just now' }, ...cs]);
            setModal(null);
            fireToast(`Added ${d.name}`);
          }}
        />
      )}
      {modal?.kind === 'import' && (
        <window.ImportModal onClose={() => setModal(null)} onImport={(f) => { setModal(null); fireToast(`Importing ${f.rows} contacts…`); }} />
      )}

      {/* Popovers */}
      {popover?.kind === 'notif' && <window.NotificationsPopover anchorRect={popover.rect} onClose={() => setPopover(null)} />}
      {popover?.kind === 'user' && <window.UserMenu anchorRect={popover.rect} onClose={() => setPopover(null)} onAction={(a) => fireToast(`Open ${a}…`)} />}
      {popover?.kind === 'rowmenu' && (
        <window.PopupShell.Popover anchorRect={popover.rect} onClose={() => setPopover(null)} width={200} align="right">
          <div style={{ padding: 4 }}>
            <window.PopupShell.MenuItem icon={Mail} onClick={() => { fireToast(`Email ${popover.contact.name}`); setPopover(null); }}>Send email</window.PopupShell.MenuItem>
            <window.PopupShell.MenuItem icon={Phone} onClick={() => { fireToast(`Call ${popover.contact.name}`); setPopover(null); }}>Log call</window.PopupShell.MenuItem>
            <window.PopupShell.MenuItem icon={Calendar} onClick={() => { fireToast(`Schedule meeting`); setPopover(null); }}>Schedule meeting</window.PopupShell.MenuItem>
            <window.PopupShell.MenuSeparator />
            <window.PopupShell.MenuItem icon={Briefcase} onClick={() => { window.location.href = 'Pipeline.html'; }}>View deals</window.PopupShell.MenuItem>
            <window.PopupShell.MenuItem onClick={() => { fireToast('Edit'); setPopover(null); }}>Edit contact</window.PopupShell.MenuItem>
            <window.PopupShell.MenuSeparator />
            <window.PopupShell.MenuItem danger onClick={() => {
              setContacts(cs => cs.filter(c => c.id !== popover.contact.id));
              setPopover(null);
              fireToast('Contact deleted');
            }}>Delete contact</window.PopupShell.MenuItem>
          </div>
        </window.PopupShell.Popover>
      )}

      <window.Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

function Stat({ label, value, accent }) {
  const colors = {
    green: { bg: 'var(--img-green-50)', fg: 'var(--img-green-700)' },
    orange: { bg: 'var(--img-orange-50)', fg: 'var(--img-orange-700)' },
  }[accent];
  return (
    <div style={{
      padding: '12px 14px', border: '1px solid var(--border-subtle)', borderRadius: 10,
      background: 'var(--bg-surface)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
      <div style={{
        fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em',
        color: colors ? colors.fg : 'var(--fg-primary)',
      }} className="t-num">{value.toLocaleString()}</div>
    </div>
  );
}

function SegBtn({ children }) {
  return <div style={{ display: 'flex', background: 'var(--neutral-100)', borderRadius: 7, padding: 2, gap: 2 }}>{children}</div>;
}

function ContactRow({ contact, active, onClick, onMore }) {
  const { More, Mail, Phone, MapPin, Briefcase, Building } = window.Icons;
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '32px 1fr 1.2fr 1fr 0.8fr 80px 32px',
        alignItems: 'center', gap: 14,
        padding: '12px 24px', cursor: 'pointer',
        borderBottom: '1px solid var(--border-subtle)',
        background: active ? 'var(--img-orange-50)' : (hover ? 'var(--bg-hover)' : 'transparent'),
        borderLeft: active ? '3px solid var(--img-orange)' : '3px solid transparent',
        paddingLeft: active ? 21 : 24,
      }}>
      <window.Avatar name={contact.name} size={32} />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)' }}>{contact.name}</span>
          {contact.tags.includes('VIP') && (
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
              background: 'var(--img-orange-100)', color: 'var(--img-orange-700)',
              letterSpacing: '0.04em',
            }}>VIP</span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--fg-secondary)', marginTop: 1 }}>{contact.role}</div>
      </div>
      <div style={{ minWidth: 0, fontSize: 12.5, color: 'var(--fg-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Building size={12} style={{ color: 'var(--fg-tertiary)', flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.company}</span>
      </div>
      <div style={{ minWidth: 0, fontSize: 12, color: 'var(--fg-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Mail size={12} style={{ flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.email}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--fg-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <MapPin size={12} />{contact.city}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Briefcase size={12} style={{ color: 'var(--fg-tertiary)' }} />
        <span className="t-num" style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg-primary)' }}>{contact.deals}</span>
        <span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>deals</span>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onMore?.(e.currentTarget.getBoundingClientRect()); }} style={{
        width: 28, height: 28, borderRadius: 6, border: 'none', background: hover ? 'var(--bg-pressed)' : 'transparent',
        color: 'var(--fg-secondary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <More size={14} />
      </button>
    </div>
  );
}

// Detail drawer
function ContactDetail({ contact, onClose, onAction, onUpdate, isMine }) {
  const Icons = window.Icons;
  const { Close, Mail, Phone, Building, MapPin, Briefcase, Calendar, Chat, Star, Plus } = Icons;
  const update = onUpdate || (() => {});
  const CITIES = ['Amman', 'Aqaba', 'Irbid', 'Petra', 'Zarqa'];
  const OWNERS = ['Hala Jaber', 'Omar Najjar', 'Sami Odeh', 'Rami Haddad', 'Sana Khalil', 'Ahmad Marji', 'Layla Odeh'];
  return (
    <aside style={{
      width: 420, height: '100vh', background: 'var(--bg-surface)',
      borderLeft: '1px solid var(--border-subtle)', boxShadow: '-8px 0 16px -8px rgba(40,38,36,0.08)',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
      animation: 'imgPopoverIn 200ms cubic-bezier(0.16,1,0.3,1)',
    }}>
      {/* Header */}
      <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <window.Avatar name={contact.name} size={56} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <EditText
                value={contact.name}
                onSave={(v) => v.trim() && update({ name: v.trim() })}
                style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--fg-primary)' }}
              />
              {contact.tags.includes('VIP') && <Star size={14} style={{ color: 'var(--img-orange)' }} />}
              {isMine && (
                <span style={{
                  fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 3,
                  background: 'var(--img-green-50)', color: 'var(--img-green-700)',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>Mine</span>
              )}
            </div>
            <div style={{ marginTop: 2 }}>
              <EditText
                value={contact.role}
                placeholder="Add role"
                onSave={(v) => update({ role: v.trim() })}
                style={{ fontSize: 13, color: 'var(--fg-secondary)' }}
              />
            </div>
            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Building size={13} style={{ color: 'var(--fg-tertiary)', flexShrink: 0 }} />
              <EditText
                value={contact.company}
                onSave={(v) => v.trim() && update({ company: v.trim() })}
                style={{ fontSize: 12.5, color: 'var(--fg-primary)' }}
              />
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent',
            cursor: 'pointer', color: 'var(--fg-secondary)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}><Close size={16} /></button>
        </div>

        {/* Tags */}
        {contact.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 4, marginTop: 12, flexWrap: 'wrap' }}>
            {contact.tags.map(t => (
              <span key={t} style={{
                fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4,
                background: t === 'VIP' ? 'var(--img-orange-100)' : 'var(--neutral-100)',
                color: t === 'VIP' ? 'var(--img-orange-700)' : 'var(--fg-secondary)',
              }}>{t}</span>
            ))}
          </div>
        )}

        {/* Action row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginTop: 14 }}>
          {[
            { icon: Mail, label: 'Email' },
            { icon: Phone, label: 'Call' },
            { icon: Chat, label: 'WhatsApp' },
            { icon: Calendar, label: 'Meet' },
          ].map(a => (
            <button key={a.label} onClick={() => onAction(a.label)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              padding: '10px 6px', borderRadius: 8,
              background: 'var(--neutral-50)', border: '1px solid var(--border-subtle)',
              color: 'var(--fg-primary)', cursor: 'pointer', fontSize: 11, fontWeight: 500,
            }}>
              <a.icon size={16} style={{ color: 'var(--img-orange-700)' }} />
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        <Section title="Contact info">
          <Field icon={Mail} label="Email" value={contact.email} mono onSave={(v) => update({ email: v.trim() })} type="email" />
          <Field icon={Phone} label="Phone" value={contact.phone} mono onSave={(v) => update({ phone: v.trim() })} type="tel" />
          <Field icon={MapPin} label="City" value={contact.city} onSave={(v) => update({ city: v })} options={CITIES} />
          <Field icon={Briefcase} label="Owner" value={contact.owner} onSave={(v) => update({ owner: v })} options={OWNERS} />
        </Section>

        <Section title={`Linked deals (${contact.deals})`} action={<button style={ghostBtn}><Plus size={12} /> Link</button>}>
          {contact.deals === 0 ? (
            <Empty>No linked deals yet</Empty>
          ) : (
            Array.from({ length: Math.min(contact.deals, 3) }).map((_, i) => (
              <DealItem key={i} idx={i} contact={contact} />
            ))
          )}
        </Section>

        <Section title="Recent activity">
          <ActivityItem icon={Mail} title={`Email sent — Re: ${contact.company} HVAC quote`} time={contact.lastContact} who={contact.owner} />
          <ActivityItem icon={Phone} title="Call logged — discovery call" time="3 days ago" who={contact.owner} />
          <ActivityItem icon={Calendar} title="Meeting — site walkthrough" time="1 week ago" who="Hala Jaber" />
        </Section>
      </div>
    </aside>
  );
}

const ghostBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '4px 8px', borderRadius: 5, border: 'none', background: 'transparent',
  color: 'var(--fg-secondary)', fontSize: 11.5, fontWeight: 500, cursor: 'pointer',
};

function Section({ title, action, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'var(--fg-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</h3>
        {action}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  );
}

function Field({ icon: Icon, label, value, mono, onSave, options, type }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = React.useRef(null);

  React.useEffect(() => { setDraft(value); }, [value]);
  React.useEffect(() => { if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select?.(); } }, [editing]);

  const editable = !!onSave;
  const commit = () => {
    if (draft !== value) onSave?.(draft);
    setEditing(false);
  };
  const cancel = () => { setDraft(value); setEditing(false); };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--neutral-50)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-secondary)', flexShrink: 0 }}>
        <Icon size={14} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10.5, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{label}</div>
        {editing && options ? (
          <select
            ref={inputRef}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); onSave?.(e.target.value); setEditing(false); }}
            onBlur={() => setEditing(false)}
            style={{
              width: '100%', height: 24, fontSize: 13, fontFamily: 'inherit',
              border: '1px solid var(--img-orange)', borderRadius: 4,
              padding: '0 4px', margin: '-1px -5px', background: 'var(--bg-surface)',
              color: 'var(--fg-primary)', outline: 'none',
            }}
          >
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : editing ? (
          <input
            ref={inputRef}
            type={type || 'text'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit(); }
              else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
            }}
            className={mono ? 't-mono' : ''}
            style={{
              width: '100%', height: 22, fontSize: mono ? 12 : 13, fontFamily: 'inherit',
              border: '1px solid var(--img-orange)', borderRadius: 4,
              padding: '0 4px', margin: '-1px -5px', background: 'var(--bg-surface)',
              color: 'var(--fg-primary)', outline: 'none',
            }}
          />
        ) : (
          <div
            onClick={() => editable && setEditing(true)}
            className={mono ? 't-mono' : ''}
            title={editable ? 'Click to edit' : undefined}
            style={{
              fontSize: mono ? 12 : 13, color: 'var(--fg-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              cursor: editable ? 'text' : 'default',
              padding: '1px 4px', margin: '-1px -4px', borderRadius: 4,
              ...(editable ? { transition: 'background 120ms' } : {}),
            }}
            onMouseEnter={(e) => { if (editable) e.currentTarget.style.background = 'var(--bg-hover)'; }}
            onMouseLeave={(e) => { if (editable) e.currentTarget.style.background = 'transparent'; }}
          >{value || <span style={{ color: 'var(--fg-tertiary)', fontStyle: 'italic' }}>Not set</span>}</div>
        )}
      </div>
    </div>
  );
}

// Inline-editable text used in the detail header (name, role, company).
function EditText({ value, onSave, style, placeholder }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = React.useRef(null);

  React.useEffect(() => { setDraft(value); }, [value]);
  React.useEffect(() => { if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select?.(); } }, [editing]);

  const commit = () => { if (draft !== value) onSave?.(draft); setEditing(false); };
  const cancel = () => { setDraft(value); setEditing(false); };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        }}
        style={{
          ...style, fontFamily: 'inherit',
          border: '1px solid var(--img-orange)', borderRadius: 4,
          padding: '1px 4px', margin: '-2px -5px', background: 'var(--bg-surface)',
          outline: 'none', minWidth: 0,
        }}
      />
    );
  }
  return (
    <span
      onClick={() => setEditing(true)}
      title="Click to edit"
      style={{
        ...style, cursor: 'text', borderRadius: 4,
        padding: '1px 4px', margin: '-1px -4px',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >{value || <span style={{ color: 'var(--fg-tertiary)', fontStyle: 'italic' }}>{placeholder || 'Click to add…'}</span>}</span>
  );
}

function Empty({ children }) {
  return (
    <div style={{
      padding: 16, border: '1px dashed var(--border-default)', borderRadius: 8,
      textAlign: 'center', fontSize: 12, color: 'var(--fg-tertiary)',
    }}>{children}</div>
  );
}

function DealItem({ idx, contact }) {
  const Icons = window.Icons;
  const stages = ['negotiation', 'analysis', 'closing'];
  const stage = stages[idx % 3];
  const meta = window.STAGE_META[stage];
  const values = [125000, 84500, 312000];
  return (
    <a onClick={() => window.location.href = 'Pipeline.html'} style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
      border: '1px solid var(--border-subtle)', borderRadius: 8, cursor: 'pointer',
      background: 'var(--bg-surface)', textDecoration: 'none',
    }}>
      <div style={{ width: 4, height: 32, borderRadius: 2, background: meta.color, flexShrink: 0 }}></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {contact.company} — {['VRF system','Chiller upgrade','Maintenance contract'][idx % 3]}
        </div>
        <div style={{ fontSize: 11, color: 'var(--fg-secondary)', marginTop: 2 }}>{meta.label}</div>
      </div>
      <div className="t-num" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg-primary)' }}>JD {values[idx % 3].toLocaleString()}</div>
    </a>
  );
}

function ActivityItem({ icon: Icon, title, time, who }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '8px 0' }}>
      <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--img-green-50)', color: 'var(--img-green-700)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={12} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: 'var(--fg-primary)', lineHeight: 1.4 }}>{title}</div>
        <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 2 }}>{who} · {time}</div>
      </div>
    </div>
  );
}

// Add Contact Modal — simple single-step form
function AddContactModal({ onClose, onSubmit }) {
  const { ModalShell, Btn, Field: FormField, TextInput, Select } = window.PopupShell;
  const [data, setData] = useState({
    name: '', role: '', company: '', email: '', phone: '', city: 'Amman',
    owner: 'Hala Jaber', tags: [],
  });
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));
  const can = data.name && data.email && data.company;

  const allTags = ['VIP', 'Key account', 'Decision maker', 'Technical'];

  return (
    <ModalShell
      title="Add new contact"
      subtitle="Create a contact record in IMG CRM"
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
        <FormField label="Full name" required>
          <TextInput value={data.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Tariq Al-Sayed" />
        </FormField>
        <FormField label="Role / title">
          <TextInput value={data.role} onChange={e => set('role', e.target.value)} placeholder="e.g. Facilities Director" />
        </FormField>
        <FormField label="Company" required>
          <TextInput value={data.company} onChange={e => set('company', e.target.value)} placeholder="e.g. Royal Jordanian" />
        </FormField>
        <FormField label="City">
          <Select value={data.city} onChange={e => set('city', e.target.value)}
            options={['Amman', 'Aqaba', 'Irbid', 'Petra', 'Zarqa'].map(c => ({ value: c, label: c }))} />
        </FormField>
        <FormField label="Email" required>
          <TextInput value={data.email} onChange={e => set('email', e.target.value)} placeholder="name@example.com" type="email" />
        </FormField>
        <FormField label="Phone">
          <TextInput value={data.phone} onChange={e => set('phone', e.target.value)} placeholder="+962 6 ..." />
        </FormField>
        <FormField label="Owner">
          <Select value={data.owner} onChange={e => set('owner', e.target.value)}
            options={['Hala Jaber', 'Omar Najjar', 'Sami Odeh'].map(c => ({ value: c, label: c }))} />
        </FormField>
        <FormField label="Tags">
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', paddingTop: 4 }}>
            {allTags.map(t => {
              const on = data.tags.includes(t);
              return (
                <button key={t} type="button" onClick={() => set('tags', on ? data.tags.filter(x => x !== t) : [...data.tags, t])}
                  style={{
                    padding: '4px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 500,
                    border: '1px solid ' + (on ? 'var(--img-orange)' : 'var(--border-default)'),
                    background: on ? 'var(--img-orange-50)' : 'transparent',
                    color: on ? 'var(--img-orange-700)' : 'var(--fg-secondary)',
                    cursor: 'pointer',
                  }}>{t}</button>
              );
            })}
          </div>
        </FormField>
      </div>
    </ModalShell>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<ContactsApp />);
