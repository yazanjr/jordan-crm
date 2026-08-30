// Left sidebar — IMG branded. Collapsible: 240px expanded, 64px collapsed.
// State persists in localStorage so it survives page navigation.

function Sidebar({ active = 'pipeline', onNav, onUserMenu, onNotifications }) {
  const { Home, Briefcase, Users, Building, Trend, File, Settings, Bell, ChevRight, Sparkle, Edit, Layers } = window.Icons;
  const [collapsed, setCollapsed] = React.useState(() => {
    try { return localStorage.getItem('img-sidebar-collapsed') === '1'; } catch { return false; }
  });
  const toggle = () => {
    setCollapsed(c => {
      const next = !c;
      try { localStorage.setItem('img-sidebar-collapsed', next ? '1' : '0'); } catch {}
      return next;
    });
  };

  const NavItem = ({ id, icon: Icon, label, badge }) => {
    const isActive = active === id;
    return (
      <button
        onClick={() => onNav?.(id)}
        title={collapsed ? label : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          width: '100%', padding: collapsed ? '8px 0' : '7px 10px', borderRadius: 7,
          justifyContent: collapsed ? 'center' : 'flex-start',
          background: isActive ? 'var(--img-orange)' : 'transparent',
          color: isActive ? '#fff' : 'rgba(255,255,255,0.82)',
          border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: isActive ? 600 : 500,
          textAlign: 'left', transition: 'background 120ms, color 120ms',
          boxShadow: isActive ? 'inset 0 -1px 0 rgba(0,0,0,0.12)' : 'none',
          position: 'relative',
        }}
        onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#fff'; } }}
        onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.82)'; } }}
      >
        <Icon size={16} />
        {!collapsed && <span style={{ flex: 1 }}>{label}</span>}
        {badge != null && !collapsed && (
          <span className="t-num" style={{
            background: isActive ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)',
            color: '#fff',
            fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 999, lineHeight: '14px',
          }}>{badge}</span>
        )}
        {badge != null && collapsed && (
          <span style={{
            position: 'absolute', top: 2, right: 6, width: 6, height: 6, borderRadius: '50%',
            background: 'var(--img-orange)', boxShadow: '0 0 0 1.5px var(--img-green-800)',
          }}></span>
        )}
      </button>
    );
  };

  const SectionLabel = ({ children }) => (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
      color: 'rgba(255,255,255,0.55)', padding: '14px 12px 6px',
      whiteSpace: 'nowrap', overflow: 'hidden',
    }}>{children}</div>
  );

  const SectionDivider = () => (
    <div style={{ height: 1, background: 'rgba(255,255,255,0.10)', margin: '12px 8px 8px' }}></div>
  );

  return (
    <aside style={{
      width: collapsed ? 64 : 240, height: '100vh', position: 'sticky', top: 0, flexShrink: 0,
      background: 'var(--img-green-800)',
      borderRight: '1px solid var(--img-green-900)',
      display: 'flex', flexDirection: 'column',
      color: '#fff',
      transition: 'width 200ms cubic-bezier(0.2,0,0,1)',
    }}>
      {/* Brand header */}
      <div style={{
        height: 56, padding: collapsed ? '0' : '0 14px',
        display: 'flex', alignItems: 'center',
        gap: collapsed ? 0 : 10,
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'linear-gradient(180deg, var(--img-orange-50) 0%, #FFFDFA 100%)',
        overflow: 'hidden',
      }}>
        <img src="assets/img-mark.png" style={{ width: 32, height: 32, objectFit: 'contain', mixBlendMode: 'multiply', flexShrink: 0 }} alt="" />
        {!collapsed && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg-primary)' }}>IMG CRM</span>
              <span style={{ fontSize: 11, color: 'var(--fg-secondary)' }}>Izzat Marji Group</span>
            </div>
            <button title="Notifications" onClick={e => onNotifications?.(e.currentTarget.getBoundingClientRect())} style={{
              width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent',
              color: 'var(--fg-secondary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
            }}>
              <Bell size={16} />
              <span style={{ position: 'absolute', top: 4, right: 4, width: 7, height: 7, borderRadius: '50%', background: 'var(--img-orange)', border: '1.5px solid #FFFDFA' }}></span>
            </button>
          </>
        )}
      </div>

      <nav style={{ flex: 1, padding: '8px 8px', overflowY: 'auto', overflowX: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <NavItem id="pipeline"    icon={Briefcase} label="Pipeline" />
          <NavItem id="contacts"    icon={Users} label="Contacts" />
          <NavItem id="reports"     icon={Trend} label="Reports" />
        </div>
        {!collapsed && <SectionLabel>Design</SectionLabel>}
        {collapsed && <SectionDivider />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <NavItem id="design-board" icon={Sparkle} label="Design Board" />
          <NavItem id="my-tasks"     icon={Edit}    label="My Tasks" />
        </div>
        {!collapsed && <SectionLabel>Product Management</SectionLabel>}
        {collapsed && <SectionDivider />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <NavItem id="pricelist"    icon={Layers}  label="Pricelist" />
          <NavItem id="costing"      icon={Trend}   label="Costing" />
        </div>
      </nav>

      {/* Collapse toggle button — sits between nav and footer */}
      <button onClick={toggle} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} style={{
        margin: '4px 8px', padding: collapsed ? '6px 0' : '6px 10px',
        display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
        gap: 10, borderRadius: 7, border: 'none', background: 'transparent',
        color: 'rgba(255,255,255,0.65)', cursor: 'pointer', fontSize: 12, fontWeight: 500,
        transition: 'background 120ms',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#fff'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.65)'; }}>
        <ChevRight size={14} style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 200ms' }} />
        {!collapsed && <span>Collapse</span>}
      </button>

      {/* User footer */}
      <div style={{
        padding: collapsed ? '10px 0' : 10, borderTop: '1px solid rgba(255,255,255,0.10)',
        display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 10,
        justifyContent: collapsed ? 'center' : 'flex-start',
        background: 'rgba(0,0,0,0.15)',
      }}>
        {(() => {
          const u = window.CURRENT_USER || { name: '—', role: '' };
          return <>
            <button onClick={e => onUserMenu?.(e.currentTarget.getBoundingClientRect())} title={collapsed ? `${u.name} — ${u.role}` : undefined} style={{
              padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', flexShrink: 0,
              display: 'inline-flex', alignItems: 'center',
            }}>
              <window.Avatar name={u.name} size={30} />
            </button>
            {!collapsed && (
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{u.name}</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>{u.role}</span>
              </div>
            )}
          </>;
        })()}
        {!collapsed && (
          <>
            <button title="Settings" onClick={e => onUserMenu?.(e.currentTarget.getBoundingClientRect())} style={{
              width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent',
              color: 'rgba(255,255,255,0.75)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Settings size={16} />
            </button>
          </>
        )}
      </div>
    </aside>
  );
}

window.Sidebar = Sidebar;
