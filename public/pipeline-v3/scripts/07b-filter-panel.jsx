// Always-visible filter panel for the Pipeline — a strip of cards, one per
// filter dimension, in the "cross-filter list" style. Wired directly to the
// app's filter state so ticking a box filters the board immediately.
//
// Props:
//   filterKeys     – ordered array of filter field keys (e.g. 'stage')
//   filterOptions  – { key: [values] } the values that actually occur
//   filters        – { key: [selectedValues] } current selection
//   setFilters     – state setter for `filters`
//   person         – currently selected owner name (or null)
//   setPerson      – setter for `person`
//   deals          – full deal list, for the per-value counts shown on the right

function FilterPanel({ filterKeys, filterOptions, filters, setFilters, person, setPerson, deals }) {
  // Human labels for the raw field keys.
  const LABELS = {
    district: 'Location', status: 'Status', stage: 'Stage', system: 'System',
    subSystem: 'Sub-system', brand: 'Brand', installationBy: 'Installation By', segment: 'Segment',
  };

  // Owners present in the data → the "Person" card options.
  const personOptions = React.useMemo(() => {
    const seen = new Set();
    (deals || []).forEach(d => { if (d.owner) seen.add(d.owner); });
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [deals]);

  // Count of deals per value, per key — the muted figure on the right of each row.
  const counts = React.useMemo(() => {
    const out = { __person: {} };
    (filterKeys || []).forEach(k => { out[k] = {}; });
    (deals || []).forEach(d => {
      if (d.owner) out.__person[d.owner] = (out.__person[d.owner] || 0) + 1;
      (filterKeys || []).forEach(k => {
        const v = d[k];
        if (v != null && v !== '') out[k][v] = (out[k][v] || 0) + 1;
      });
    });
    return out;
  }, [deals, filterKeys]);

  const toggleValue = (key, value) => {
    setFilters(prev => {
      const cur = prev[key] || [];
      const next = cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value];
      return { ...prev, [key]: next };
    });
  };
  const clearKey = (key) => setFilters(prev => ({ ...prev, [key]: [] }));
  const togglePerson = (name) => setPerson(p => (p === name ? null : name));

  const activeTotal =
    (person ? 1 : 0) +
    (filterKeys || []).reduce((s, k) => s + (filters[k]?.length || 0), 0);

  const resetAll = () => { setFilters({}); setPerson(null); };

  // ── One card ─────────────────────────────────────────────────────────────
  const Card = ({ title, options, selected, onToggle, onClear, countMap, stageColors }) => (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 10, display: 'flex', flexDirection: 'column', minWidth: 0,
      boxShadow: 'var(--shadow-xs, 0 1px 2px rgba(16,24,40,0.05))', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', background: 'var(--img-orange-50, #FEF4E7)',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--fg-secondary)' }}>{title}</span>
        {selected.length > 0 && (
          <button onClick={onClear} style={{ border: 'none', background: 'transparent', color: 'var(--img-orange-700, #B8680E)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Clear</button>
        )}
      </div>
      {/* Rows — compact, scroll inside the card when a filter has many values. */}
      <div style={{ maxHeight: 128, overflowY: 'auto', padding: '4px 0' }}>
        {options.length === 0 && (
          <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--fg-tertiary)' }}>No values.</div>
        )}
        {options.map(opt => {
          const isOn = selected.includes(opt);
          const dot = stageColors ? window.STAGE_META?.[opt]?.fg : null;
          return (
            <label key={opt} style={{
              display: 'flex', alignItems: 'center', gap: 9, padding: '6px 12px', cursor: 'pointer',
              background: isOn ? 'var(--img-orange-50, #FEF4E7)' : 'transparent',
            }}
            onMouseEnter={e => { if (!isOn) e.currentTarget.style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { if (!isOn) e.currentTarget.style.background = 'transparent'; }}>
              <input type="checkbox" checked={isOn} onChange={() => onToggle(opt)}
                style={{ width: 15, height: 15, accentColor: 'var(--img-orange)', cursor: 'pointer', flexShrink: 0 }} />
              {dot && <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }}></span>}
              <span style={{ flex: 1, fontSize: 12.5, color: 'var(--fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={window.STAGE_META?.[opt]?.label || String(opt)}>
                {stageColors ? (window.STAGE_META?.[opt]?.label || opt) : opt}
              </span>
              <span className="t-num" style={{ fontSize: 11, color: 'var(--fg-tertiary)', flexShrink: 0 }}>{countMap?.[opt] || 0}</span>
            </label>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={{
      flexShrink: 0, padding: '10px 24px 12px', background: 'var(--neutral-50)',
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      <div style={{
        display: 'grid', gap: 12,
        gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
      }}>
        {/* Person card (single-select) */}
        <Card
          title="Person"
          options={personOptions}
          selected={person ? [person] : []}
          onToggle={togglePerson}
          onClear={() => setPerson(null)}
          countMap={counts.__person}
        />
        {/* One card per filter dimension */}
        {(filterKeys || []).map(key => (
          <Card
            key={key}
            title={LABELS[key] || key}
            options={filterOptions[key] || []}
            selected={filters[key] || []}
            onToggle={(v) => toggleValue(key, v)}
            onClear={() => clearKey(key)}
            countMap={counts[key]}
            stageColors={key === 'stage'}
          />
        ))}
      </div>

      {/* Footer: tip + reset */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>
          Tip: tick any box to filter the board. {activeTotal > 0 ? <b style={{ color: 'var(--fg-secondary)' }}>{activeTotal} filter{activeTotal === 1 ? '' : 's'} active.</b> : 'Combine cards to narrow deals.'}
        </span>
        <span style={{ flex: 1 }}></span>
        <button onClick={resetAll} disabled={activeTotal === 0} style={{
          padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600,
          border: '1px solid var(--img-orange)', cursor: activeTotal === 0 ? 'default' : 'pointer',
          background: activeTotal === 0 ? 'transparent' : 'var(--img-orange-50, #FEF4E7)',
          color: 'var(--img-orange-700, #B8680E)', opacity: activeTotal === 0 ? 0.45 : 1,
        }}>Reset all filters</button>
      </div>
    </div>
  );
}

window.FilterPanel = FilterPanel;
