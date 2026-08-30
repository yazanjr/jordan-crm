// Horizontal top navigation — an alternative to the left Sidebar, used on the
// Pipeline page so the board gets the full width of the screen. Same nav
// contract as window.Sidebar ({ active, onNav, onUserMenu, onNotifications }).
// Once approved on Pipeline, other pages can swap Sidebar → TopNav the same way.

function TopNav({ active = 'pipeline', onNav, onUserMenu, onNotifications }) {
  const { Briefcase, Users, Trend, Sparkle, Edit, Layers, Bell, Settings } = window.Icons;

  // Grouped so we can draw a faint divider between sections, like the sidebar.
  const GROUPS = [
    [
      { id: 'pipeline',    icon: Briefcase, label: 'Pipeline' },
      { id: 'contacts',    icon: Users,     label: 'Contacts' },
      { id: 'reports',     icon: Trend,     label: 'Reports' },
    ],
    [
      { id: 'design-board', icon: Sparkle, label: 'Design Board' },
      { id: 'my-tasks',     icon: Edit,    label: 'My Tasks' },
    ],
    [
      { id: 'pricelist', icon: Layers, label: 'Pricelist' },
      { id: 'costing',   icon: Trend,  label: 'Costing' },
    ],
  ];

  const NavItem = ({ id, icon: Icon, label }) => {
    const isActive = active === id;
    return (
      <button
        onClick={() => onNav?.(id)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '7px 12px', borderRadius: 8, whiteSpace: 'nowrap',
          background: isActive ? 'var(--img-orange)' : 'transparent',
          color: isActive ? '#fff' : 'rgba(255,255,255,0.82)',
          border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: isActive ? 600 : 500,
          transition: 'background 120ms, color 120ms',
        }}
        onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = '#fff'; } }}
        onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.82)'; } }}
      >
        <Icon size={15} />
        <span>{label}</span>
      </button>
    );
  };

  const u = window.CURRENT_USER || { name: '—', role: '' };

  return (
    <header style={{
      flexShrink: 0, height: 54, display: 'flex', alignItems: 'center', gap: 4,
      padding: '0 14px', background: 'var(--img-green-800)', color: '#fff',
      borderBottom: '1px solid var(--img-green-900)',
      boxShadow: '0 1px 3px rgba(0,0,0,0.14)',
    }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, paddingRight: 10, flexShrink: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: 7, background: 'linear-gradient(180deg, var(--img-orange-50) 0%, #FFFDFA 100%)', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
          <img src="assets/img-mark.png" style={{ width: 26, height: 26, objectFit: 'contain', mixBlendMode: 'multiply' }} alt="" />
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.01em' }}>IMG CRM</span>
      </div>

      {/* Nav — horizontally scrollable if the window is narrow, never wraps */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: 3, flex: 1, minWidth: 0, overflowX: 'auto', padding: '0 4px' }}>
        {GROUPS.map((group, gi) => (
          <React.Fragment key={gi}>
            {gi > 0 && <span style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.16)', margin: '0 6px', flexShrink: 0 }}></span>}
            {group.map(item => <NavItem key={item.id} {...item} />)}
          </React.Fragment>
        ))}
      </nav>

      {/* Right cluster: notifications + user */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <button title="Notifications" onClick={e => onNotifications?.(e.currentTarget.getBoundingClientRect())} style={{
          width: 34, height: 34, borderRadius: 8, border: 'none', background: 'transparent',
          color: 'rgba(255,255,255,0.85)', cursor: 'pointer', position: 'relative',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.10)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <Bell size={17} />
          <span style={{ position: 'absolute', top: 7, right: 7, width: 7, height: 7, borderRadius: '50%', background: 'var(--img-orange)', border: '1.5px solid var(--img-green-800)' }}></span>
        </button>

        <button onClick={e => onUserMenu?.(e.currentTarget.getBoundingClientRect())} title={`${u.name} — ${u.role}`} style={{
          display: 'inline-flex', alignItems: 'center', gap: 9, padding: '4px 8px 4px 4px',
          border: 'none', borderRadius: 999, background: 'rgba(0,0,0,0.16)', cursor: 'pointer',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.28)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.16)'}>
          <window.Avatar name={u.name} size={28} />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, textAlign: 'left', maxWidth: 130 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</span>
            <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.role}</span>
          </div>
        </button>
      </div>
    </header>
  );
}

window.TopNav = TopNav;
