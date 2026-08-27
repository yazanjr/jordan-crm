// Toolbar — Monday-style row above the table/board.
// "+ New deal" pill button (orange), search, person filter, filter, group-by, view switch.

function Toolbar({ view = 'kanban', onViewChange, onNewDeal, search, setSearch, onPerson, onFilter, onGroupBy, onMore, person, filterCount, groupBy, hidePersonFilter = false }) {
  const { Plus, Search, Filter, Layers, Layout, Table, Kanban, ChevDown, More } = window.Icons;

  const baseBtn = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '6px 10px', height: 32, borderRadius: 7,
    background: 'transparent', color: 'var(--fg-primary)', border: 'none',
    fontSize: 13, fontWeight: 500, cursor: 'pointer',
    transition: 'background 120ms',
  };
  const onHover = (e) => e.currentTarget.style.background = 'var(--bg-hover)';
  const offHover = (e) => e.currentTarget.style.background = 'transparent';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '12px 24px',
      borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
    }}>
      {/* Primary CTA — pill button */}
      <button
        onClick={onNewDeal}
        style={{
          display: 'inline-flex', alignItems: 'center', height: 32,
          background: 'var(--img-orange)', color: '#fff', border: 'none',
          borderRadius: 999, paddingLeft: 14, paddingRight: 4, fontWeight: 600, fontSize: 13,
          cursor: 'pointer', transition: 'background 120ms',
          boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.08)',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--img-orange-600)'}
        onMouseLeave={e => e.currentTarget.style.background = 'var(--img-orange)'}
      >
        New deal
        <span style={{
          marginLeft: 10, width: 24, height: 24, borderRadius: '50%',
          background: 'rgba(255,255,255,0.2)', display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <ChevDown size={14} />
        </span>
      </button>

      {/* Search */}
      <div style={{ position: 'relative', marginLeft: 8 }}>
        <Search size={14} style={{ position: 'absolute', left: 9, top: 9, color: 'var(--fg-tertiary)' }} />
        <input
          value={search ?? ''}
          onChange={e => setSearch?.(e.target.value)}
          placeholder="Search"
          style={{
            height: 32, padding: '0 10px 0 30px', border: '1px solid transparent',
            background: 'transparent', borderRadius: 7, fontSize: 13, width: 130,
            color: 'var(--fg-primary)', outline: 'none',
          }}
          onFocus={e => { e.target.style.borderColor = 'var(--border-default)'; e.target.style.background = 'var(--bg-surface)'; }}
          onBlur={e => { e.target.style.borderColor = 'transparent'; e.target.style.background = 'transparent'; }}
        />
      </div>

      {!hidePersonFilter && (
        <button style={baseBtn} onMouseEnter={onHover} onMouseLeave={offHover}
          onClick={e => onPerson?.(e.currentTarget.getBoundingClientRect())}>
          {person ? <window.Avatar name={person} size={16} /> : <span style={{ width: 16, height: 16, borderRadius: '50%', border: '1px dashed var(--border-default)' }}></span>}
          {person || 'Person'}
        </button>
      )}
      {!hidePersonFilter && (
        <button style={baseBtn} onMouseEnter={onHover} onMouseLeave={offHover}
          onClick={e => onFilter?.(e.currentTarget.getBoundingClientRect())}>
          <Filter size={14} /> Filter
          {filterCount > 0 && <span style={{ background: 'var(--img-orange)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999 }}>{filterCount}</span>}
        </button>
      )}
      <button style={baseBtn} onMouseEnter={onHover} onMouseLeave={offHover}
        onClick={e => onGroupBy?.(e.currentTarget.getBoundingClientRect())}>
        <Layers size={14} /> Group by {groupBy && <span style={{ color: 'var(--img-orange-700)', fontWeight: 600 }}>{groupBy}</span>} <ChevDown size={12} style={{ marginLeft: -2, opacity: 0.6 }} />
      </button>
      <button style={baseBtn} onMouseEnter={onHover} onMouseLeave={offHover}
        title="More options"
        onClick={e => onMore?.(e.currentTarget.getBoundingClientRect())}>
        <More size={14} />
      </button>

      <div style={{ flex: 1 }}></div>

      {/* View switch */}
      <div style={{
        display: 'inline-flex', padding: 2, borderRadius: 8,
        background: 'var(--neutral-100)', gap: 2,
      }}>
        {[
          { id: 'kanban', label: 'Kanban', icon: Kanban },
          { id: 'table',  label: 'Table',  icon: Table },
        ].map(v => {
          const isActive = view === v.id;
          return (
            <button
              key={v.id}
              onClick={() => onViewChange?.(v.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 10px', height: 26, borderRadius: 6, border: 'none',
                background: isActive ? 'var(--bg-surface)' : 'transparent',
                color: isActive ? 'var(--fg-primary)' : 'var(--fg-secondary)',
                fontSize: 12, fontWeight: isActive ? 600 : 500, cursor: 'pointer',
                boxShadow: isActive ? 'var(--shadow-xs)' : 'none',
                transition: 'all 120ms',
              }}
            >
              <v.icon size={14} /> {v.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

window.Toolbar = Toolbar;
