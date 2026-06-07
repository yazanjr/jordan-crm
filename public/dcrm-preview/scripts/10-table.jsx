// Monday-style table — grouped by stage, colored stage cells, owner avatars,
// deal value, probability bar, expected close date, sum row per group.

function DealsTable({ deals, onSelectDeal, onStageClick }) {
  const { ChevDown, ChevRight, Plus, Calendar } = window.Icons;
  const [openGroups, setOpenGroups] = React.useState(() =>
    Object.fromEntries(window.STAGE_ORDER.map(s => [s, true]))
  );

  const byStage = React.useMemo(() => {
    const m = Object.fromEntries(window.STAGE_ORDER.map(s => [s, []]));
    deals.forEach(d => { if (m[d.stage]) m[d.stage].push(d); });
    return m;
  }, [deals]);

  const Th = ({ children, w, align = 'left', first }) => (
    <th style={{
      padding: '8px 10px', textAlign: align,
      fontSize: 11, fontWeight: 600, color: 'var(--fg-secondary)',
      borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
      width: w, position: 'sticky', top: 0, zIndex: 1,
      borderLeft: first ? 'none' : '1px solid var(--border-subtle)',
    }}>{children}</th>
  );

  const Td = ({ children, align = 'left', noPad = false, first, style }) => (
    <td style={{
      padding: noPad ? 0 : '8px 10px', textAlign: align,
      fontSize: 12, color: 'var(--fg-primary)',
      borderBottom: '1px solid var(--border-subtle)',
      borderLeft: first ? 'none' : '1px solid var(--border-subtle)',
      verticalAlign: 'middle', height: 40,
      ...style,
    }}>{children}</td>
  );

  return (
    <div style={{
      flex: 1, overflow: 'auto', padding: '0 24px 24px',
      background: 'var(--bg-page)',
    }}>
      {window.STAGE_ORDER.map(stage => {
        const meta = window.STAGE_META[stage];
        const stageDeals = byStage[stage];
        const total = stageDeals.reduce((s, d) => s + d.value, 0);
        const isOpen = openGroups[stage];

        return (
          <div key={stage} style={{ marginTop: 16 }}>
            {/* Group header */}
            <button
              onClick={() => setOpenGroups({ ...openGroups, [stage]: !isOpen })}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: '4px 0', marginBottom: 6,
                color: meta.fg, fontSize: 14, fontWeight: 700,
              }}
            >
              {isOpen ? <ChevDown size={14} /> : <ChevRight size={14} />}
              <span>{meta.label}</span>
              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--fg-secondary)', marginLeft: 4 }}>
                {stageDeals.length} {stageDeals.length === 1 ? 'deal' : 'deals'}
              </span>
            </button>

            {isOpen && (
              <div style={{
                background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                borderLeft: `3px solid ${meta.fg}`,
                borderRadius: 8, overflow: 'hidden',
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '32%' }} />
                    <col style={{ width: '110px' }} />
                    <col style={{ width: '150px' }} />
                    <col style={{ width: '60px' }} />
                    <col style={{ width: '120px' }} />
                    <col style={{ width: '90px' }} />
                    <col style={{ width: '120px' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <Th first>Deal</Th>
                      <Th>Stage</Th>
                      <Th>Owner</Th>
                      <Th align="right">Prob.</Th>
                      <Th align="right">Value</Th>
                      <Th>Scope</Th>
                      <Th>Close date</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {stageDeals.map((d, i) => (
                      <tr
                        key={d.id}
                        onClick={() => onSelectDeal?.(d)}
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <Td first>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <span style={{ fontWeight: 500, color: 'var(--fg-primary)' }}>{d.name}</span>
                            <span className="t-mono" style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>{d.id}</span>
                          </div>
                        </Td>
                        <Td noPad style={{ padding: 0 }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onStageClick?.(d, e.currentTarget.getBoundingClientRect());
                            }}
                            style={{
                              all: 'unset', display: 'block', width: '100%', height: '100%',
                              cursor: 'pointer',
                            }}
                          >
                            <window.StageChip stage={d.stage} variant="cell" />
                          </button>
                        </Td>
                        <Td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <window.Avatar name={d.owner} size={22} />
                            <span style={{ color: 'var(--fg-primary)' }}>{d.owner}</span>
                          </div>
                        </Td>
                        <Td align="right">
                          <span className="t-num" style={{ fontWeight: 600 }}>{d.probability}%</span>
                        </Td>
                        <Td align="right">
                          <span className="t-num" style={{ fontWeight: 600, color: 'var(--fg-primary)' }}>{window.formatJOD(d.value)}</span>
                        </Td>
                        <Td>
                          <span style={{
                            display: 'inline-block', background: 'var(--neutral-100)', color: 'var(--neutral-600)',
                            padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 500,
                          }}>{d.scope}</span>
                        </Td>
                        <Td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--fg-secondary)' }}>
                            <Calendar size={12} /> {window.formatDate(d.closeDate)}
                          </span>
                        </Td>
                      </tr>
                    ))}

                    {/* Add row */}
                    <tr>
                      <Td first style={{ color: 'var(--fg-secondary)' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                          <Plus size={12} /> Add deal
                        </span>
                      </Td>
                      <Td colSpan={6}></Td>
                    </tr>

                    {/* Sum row */}
                    <tr style={{ background: 'var(--neutral-50)' }}>
                      <Td first style={{ fontWeight: 500, color: 'var(--fg-secondary)' }}>Total</Td>
                      <Td></Td>
                      <Td></Td>
                      <Td></Td>
                      <Td align="right" style={{ fontWeight: 700, color: 'var(--fg-primary)' }}>
                        <span className="t-num">{window.formatJOD(total)}</span>
                        <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--fg-tertiary)', marginTop: 1 }}>sum</div>
                      </Td>
                      <Td></Td>
                      <Td></Td>
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
