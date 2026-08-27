// Top bar — warm cream surface with orange title accent. Bridges the deep
// green sidebar and the colored Kanban columns below; orange underline ties
// the page identity to the brand primary.

function TopBar({ title = 'Pipeline', tabs = [], activeTab, onTab, right, showBreadcrumb = true }) {
  const { ChevDown, ChevRight } = window.Icons;

  return (
    <header style={{
      borderBottom: '1px solid var(--border-subtle)',
      background: 'linear-gradient(180deg, var(--img-orange-50) 0%, #FFFDFA 100%)',
      padding: '10px 24px 0',
      position: 'sticky', top: 0, zIndex: 10,
    }}>
      {showBreadcrumb ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--fg-secondary)', paddingBottom: 6 }}>
          <span>Workspace</span>
          <ChevRight size={12} />
          <span>Sales</span>
          <ChevRight size={12} />
          <span style={{ color: 'var(--fg-primary)', fontWeight: 600 }}>{title}</span>
        </div>
      ) : null}

      {/* Single compact row: orange bar + title on the left, actions on the right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: tabs.length > 0 ? 8 : 10 }}>
        <span style={{ width: 4, height: 20, borderRadius: 2, background: 'var(--img-orange)' }}></span>
        <h1 className="t-h1" style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>{title}</h1>
        <div style={{ flex: 1 }}></div>
        {right}
      </div>

      {/* Tabs */}
      {tabs.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: -1 }}>
          {tabs.map(t => {
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onTab?.(t.id)}
                style={{
                  padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: 13, fontWeight: 500,
                  color: isActive ? 'var(--fg-primary)' : 'var(--fg-secondary)',
                  borderBottom: isActive ? '2px solid var(--img-orange)' : '2px solid transparent',
                  marginBottom: 0, display: 'inline-flex', alignItems: 'center', gap: 6,
                  transition: 'color 120ms, border-color 120ms',
                }}
              >
                {t.icon && <t.icon size={14} />}
                {t.label}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
}

window.TopBar = TopBar;
