// Monday-style table — grouped by stage. Columns are configurable (show/hide via
// the column picker), headers are renamable, widths are drag-resizable, and every
// editable cell saves inline to the database. Driven by window.OPP_FIELDS.

// Per-column default pixel widths; anything not listed falls back to DEFAULT_COL_W.
// A user's drag-resized widths (window.loadTableConfig().widths) override these.
const COL_WIDTHS = {
  name: 260, stage: 110, owner: 150, value: 120, status: 120,
  segment: 110, district: 140, system: 100, subSystem: 120, brand: 110,
  contractor: 160, engOffice: 160, ownerRep: 140, personResponsible: 150,
  nextAction: 180, remarks: 220, account: 160, installationBy: 120,
  salesTax: 90, priceExempted: 140, signingPrice: 130, expectedClosing: 130,
  lostNotes: 180, lostToWhom: 150, notes: 220,
};
const DEFAULT_COL_W = 140;
const MIN_COL_W = 60;

function DealsTable({ deals, onSelectDeal, onStageClick, onUpdateDeal, columns, labels, widths, onRenameColumn, onResizeColumn }) {
  const { ChevDown, ChevRight, Plus, Calendar } = window.Icons;
  const OPP_FIELD_BY_KEY = window.OPP_FIELD_BY_KEY || {};

  // Fall back to stored config if the parent didn't supply column state.
  const cfg = (columns && labels) ? { columns, labels, widths } : window.loadTableConfig();
  const visibleCols = (cfg.columns || []).filter(c => c.visible && OPP_FIELD_BY_KEY[c.key]);
  const colLabels = cfg.labels || {};
  const savedWidths = cfg.widths || {};

  const [openGroups, setOpenGroups] = React.useState(() =>
    Object.fromEntries(window.STAGE_ORDER.map(s => [s, true]))
  );

  // Live widths during a drag (per column key). Committed to the parent on mouseup.
  const [dragWidths, setDragWidths] = React.useState({});

  const colWidth = (key) =>
    dragWidths[key] ?? savedWidths[key] ?? COL_WIDTHS[key] ?? DEFAULT_COL_W;

  const onResizeStart = (key, e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = colWidth(key);
    let currentWidth = startWidth;     // closure — kept current by onMove

    const onMove = (ev) => {
      currentWidth = Math.max(MIN_COL_W, startWidth + (ev.clientX - startX));
      setDragWidths(w => ({ ...w, [key]: currentWidth }));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // Commit to the parent (persists), then clear the local live override.
      onResizeColumn?.(key, currentWidth);
      setDragWidths(w => { const next = { ...w }; delete next[key]; return next; });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const byStage = React.useMemo(() => {
    const m = Object.fromEntries(window.STAGE_ORDER.map(s => [s, []]));
    deals.forEach(d => { if (m[d.stage]) m[d.stage].push(d); });
    return m;
  }, [deals]);

  const thStyle = {
    padding: '8px 10px', textAlign: 'left',
    fontSize: 11, fontWeight: 600, color: 'var(--fg-secondary)',
    borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
    position: 'sticky', top: 0, zIndex: 1,
  };
  const tdStyle = {
    padding: '6px 10px', fontSize: 12, color: 'var(--fg-primary)',
    borderBottom: '1px solid var(--border-subtle)',
    borderLeft: '1px solid var(--border-subtle)',
    verticalAlign: 'middle', height: 40,
  };

  // Thin draggable divider on the right edge of a header cell.
  const ResizeHandle = ({ colKey }) => (
    <span
      onMouseDown={(e) => onResizeStart(colKey, e)}
      onClick={(e) => e.stopPropagation()}
      title="Drag to resize column"
      style={{
        position: 'absolute', top: 0, right: -3, width: 7, height: '100%',
        cursor: 'col-resize', zIndex: 2,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--img-orange)'; e.currentTarget.style.opacity = 0.4; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.opacity = 1; }}
    />
  );

  // A wrapper that stops a cell click from bubbling to the row (which opens the drawer).
  const EditCell = ({ children }) => (
    <div onClick={e => e.stopPropagation()}>{children}</div>
  );

  // Render one cell for a deal + column field.
  function renderCell(d, field) {
    const key = field.key;
    const raw = d[key];
    const save = (v) => onUpdateDeal?.(d.id, { [key]: v });

    if (key === 'name') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontWeight: 500, color: 'var(--fg-primary)' }}>{d.name}</span>
          <span className="t-mono" style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>{d.id}</span>
        </div>
      );
    }
    if (key === 'stage') {
      return (
        <button
          onClick={(e) => { e.stopPropagation(); onStageClick?.(d, e.currentTarget.getBoundingClientRect()); }}
          style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer' }}>
          <window.StageChip stage={d.stage} variant="cell" />
        </button>
      );
    }
    if (key === 'owner') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <window.Avatar name={d.owner} size={22} />
          <span>{d.owner}</span>
        </div>
      );
    }
    // Read-only fields (e.g. calculated Exempted price).
    if (field.editable === false) {
      const shown = (key === 'priceExempted' && raw != null) ? window.formatJOD(raw)
                  : (raw != null && raw !== '' ? raw : '—');
      return <span style={{ color: 'var(--fg-secondary)' }}>{shown}</span>;
    }
    // Editable cells — inline editors, click contained so the row doesn't open.
    if (field.type === 'number') {
      const fmt = (key === 'value' || key === 'signingPrice')
        ? (v => v != null && v !== '' ? window.formatJOD(v) : '—')
        : (v => v != null && v !== '' ? v : '—');
      return <EditCell><window.EditableNumber value={raw == null ? '' : raw} onSave={save}
        format={fmt} className="t-num" style={{ fontWeight: 600 }} /></EditCell>;
    }
    if (field.type === 'select') {
      const opts = (field.options || []).map(o => ({ value: o, label: o }));
      return <EditCell><window.EditableSelect value={raw || ''} options={opts} onSave={save} /></EditCell>;
    }
    // text / textarea / date — all use EditableText.
    return <EditCell><window.EditableText
      value={raw == null ? '' : raw}
      onSave={save}
      hoverHint="Click to edit"
      style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
    /></EditCell>;
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '0 24px 24px', background: 'var(--bg-page)' }}>
      {window.STAGE_ORDER.map(stage => {
        const meta = window.STAGE_META[stage];
        const stageDeals = byStage[stage];
        const total = stageDeals.reduce((s, d) => s + (d.value || 0), 0);
        const isOpen = openGroups[stage];

        return (
          <div key={stage} style={{ marginTop: 16 }}>
            <button
              onClick={() => setOpenGroups({ ...openGroups, [stage]: !isOpen })}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: '4px 0', marginBottom: 6, color: meta.fg, fontSize: 14, fontWeight: 700,
              }}>
              {isOpen ? <ChevDown size={14} /> : <ChevRight size={14} />}
              <span>{meta.label}</span>
              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--fg-secondary)', marginLeft: 4 }}>
                {stageDeals.length} {stageDeals.length === 1 ? 'deal' : 'deals'}
              </span>
            </button>

            {isOpen && (
              <div style={{
                background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                borderLeft: `3px solid ${meta.fg}`, borderRadius: 8, overflow: 'auto',
              }}>
                <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: '100%' }}>
                  <colgroup>
                    {visibleCols.map((c) => (
                      <col key={c.key} style={{ width: colWidth(c.key) + 'px' }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      {visibleCols.map((c, i) => {
                        const field = OPP_FIELD_BY_KEY[c.key];
                        const label = colLabels[c.key] || field.label;
                        return (
                          <th key={c.key} style={{ ...thStyle, position: 'sticky', borderLeft: i === 0 ? 'none' : '1px solid var(--border-subtle)' }}>
                            <span style={{ position: 'relative', display: 'block' }}>
                              {onRenameColumn ? (
                                <span onClick={e => e.stopPropagation()}>
                                  <window.EditableText value={label}
                                    onSave={(v) => onRenameColumn(c.key, v.trim() || field.label)}
                                    hoverHint="Rename column"
                                    style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-secondary)' }} />
                                </span>
                              ) : label}
                            </span>
                            {onResizeColumn && <ResizeHandle colKey={c.key} />}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {stageDeals.map(d => (
                      <tr key={d.id}
                        onClick={() => onSelectDeal?.(d)}
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        {visibleCols.map((c, i) => {
                          const field = OPP_FIELD_BY_KEY[c.key];
                          return (
                            <td key={c.key} style={{ ...tdStyle, borderLeft: i === 0 ? 'none' : '1px solid var(--border-subtle)' }}>
                              {renderCell(d, field)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}

                    {/* Sum row — totals the Value column, if shown. */}
                    <tr style={{ background: 'var(--neutral-50)' }}>
                      {visibleCols.map((c, i) => (
                        <td key={c.key} style={{ ...tdStyle, borderLeft: i === 0 ? 'none' : '1px solid var(--border-subtle)', fontWeight: 700 }}>
                          {i === 0 ? <span style={{ color: 'var(--fg-secondary)', fontWeight: 500 }}>Total</span>
                            : c.key === 'value'
                              ? <span className="t-num" style={{ color: 'var(--fg-primary)' }}>{window.formatJOD(total)}</span>
                              : null}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

window.DealsTable = DealsTable;
