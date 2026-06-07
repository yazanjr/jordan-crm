// Kanban board — 5 columns, drag-supported. Each column's entire pane is
// tinted in its stage color so the board reads as a colored map at a glance.
// Header strip uses the strong stage color; body uses the matching soft tint.

function KanbanBoard({ deals, setDeals, onSelectDeal, onUpdateDeal, onStageChange, cardVariant = 'standard', onColumnMenu, onCardMenu, quickAddStage, onQuickAdd, onStartQuickAdd, onCancelQuickAdd, designStatusFor, lockedStages, onInterceptDropInto }) {
  const lock = lockedStages instanceof Set ? lockedStages : new Set(lockedStages || []);
  const { Plus, More } = window.Icons;
  const [draggingId, setDraggingId] = React.useState(null);
  const [dragOverStage, setDragOverStage] = React.useState(null);
  React.useEffect(() => {
    if (document.getElementById('__kanban-drop-keyframes')) return;
    const style = document.createElement('style');
    style.id = '__kanban-drop-keyframes';
    style.textContent = `@keyframes dropPulse { 0%,100% { transform: translateY(0); opacity: 1; } 50% { transform: translateY(-1px); opacity: 0.92; } }`;
    document.head.appendChild(style);
  }, []);

  const byStage = React.useMemo(() => {
    const m = Object.fromEntries(window.STAGE_ORDER.map(s => [s, []]));
    deals.forEach(d => { if (m[d.stage]) m[d.stage].push(d); });
    return m;
  }, [deals]);

  const handleDrop = (stage) => {
    if (!draggingId) return;
    const id = draggingId;
    setDraggingId(null);
    setDragOverStage(null);
    // Locked target: instead of moving the card, fire an intercept so the host
    // app can open the right modal (e.g. Request Design form for the Lead column).
    const dropDeal = deals.find(d => d.id === id);
    if (lock.has(stage) && dropDeal && dropDeal.stage !== stage && onInterceptDropInto) {
      onInterceptDropInto(stage, dropDeal);
      return;
    }
    if (onStageChange) onStageChange(id, stage);
    else setDeals(deals.map(d => d.id === id ? { ...d, stage } : d));
  };

  return (
    <div style={{
      flex: 1, overflow: 'auto', padding: '16px 24px 24px',
      background: 'var(--neutral-50)',
      display: 'flex', gap: 12, alignItems: 'flex-start',
    }}>
      {window.STAGE_ORDER.map(stage => {
        const meta = window.STAGE_META[stage];
        const stageDeals = byStage[stage];
        const total = stageDeals.reduce((s, d) => s + d.value, 0);
        const isOver = dragOverStage === stage && draggingId;

        return (
          <div
            key={stage}
            onDragOver={e => { e.preventDefault(); setDragOverStage(stage); }}
            onDragLeave={() => setDragOverStage(null)}
            onDrop={() => handleDrop(stage)}
            style={{
              width: 280, flexShrink: 0,
              background: meta.bg,
              border: `1px solid ${isOver ? meta.fg : 'transparent'}`,
              borderRadius: 12,
              display: 'flex', flexDirection: 'column',
              maxHeight: 'calc(100vh - 200px)',
              overflow: 'hidden',
              boxShadow: isOver ? `0 0 0 3px ${meta.fg}33` : 'none',
              transition: 'box-shadow 120ms, border-color 120ms',
            }}
          >
            {/* Solid color header strip */}
            <div style={{
              background: meta.fg,
              padding: '10px 12px',
              display: 'flex', alignItems: 'center', gap: 8,
              color: '#fff',
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: '#fff', opacity: 0.9,
              }}></span>
              <span style={{
                fontSize: 12, fontWeight: 700, color: '#fff',
                textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>{meta.label}</span>
              <span className="t-num" style={{
                fontSize: 11, fontWeight: 600, color: '#fff',
                background: 'rgba(255,255,255,0.22)',
                padding: '1px 7px', borderRadius: 999,
              }}>{stageDeals.length}</span>
              {lock.has(stage) && (
                <span title="Form required — drop a card here to open the design request form. Cards can only leave when design releases." style={{
                  fontSize: 10, fontWeight: 700, color: '#fff',
                  background: 'rgba(0,0,0,0.22)',
                  padding: '1px 6px', borderRadius: 999,
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                }}>🔒 Locked</span>
              )}
              <div style={{ flex: 1 }}></div>
              <button title="Column actions" onClick={e => { e.stopPropagation(); onColumnMenu?.(stage, e.currentTarget.getBoundingClientRect()); }} style={{
                width: 22, height: 22, borderRadius: 4, border: 'none',
                background: 'transparent', color: 'rgba(255,255,255,0.85)',
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}><More size={14} /></button>
            </div>

            {/* Column total — sits on tinted body */}
            <div style={{
              padding: '8px 12px 6px',
              fontSize: 11, color: meta.fg,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontWeight: 600,
              borderBottom: `1px dashed ${meta.fg}33`,
            }}>
              <span style={{ opacity: 0.85 }}>Total value</span>
              <span className="t-num" style={{ fontWeight: 700 }}>{window.formatJODshort(total)}</span>
            </div>

            {/* Cards */}
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 8,
              padding: '10px 10px 12px',
              overflow: 'auto', flex: 1,
            }}>
              {stageDeals.map(d => {
                const isLockedOut = lock.has(d.stage);
                return (
                <div
                  key={d.id}
                  draggable={!isLockedOut}
                  title={isLockedOut ? 'Locked in this stage — design must release it' : undefined}
                  onDragStart={() => setDraggingId(d.id)}
                  onDragEnd={() => { setDraggingId(null); setDragOverStage(null); }}
                  onContextMenu={e => { e.preventDefault(); onCardMenu?.(d, { left: e.clientX, right: e.clientX + 1, bottom: e.clientY, top: e.clientY }); }}
                  style={{ opacity: draggingId === d.id ? 0.4 : 1, cursor: isLockedOut ? 'not-allowed' : 'grab' }}
                >
                  <window.DealCard
                    deal={d}
                    variant={cardVariant}
                    onClick={() => onSelectDeal?.(d)}
                    onUpdate={(patch) => onUpdateDeal?.(d.id, patch)}
                    designStatus={designStatusFor?.(d)}
                  />
                </div>
                );
              })}

              {/* Drop placeholder — appears at the bottom of the column being targeted */}
              {isOver && (() => {
                const dragDeal = deals.find(x => x.id === draggingId);
                if (!dragDeal || dragDeal.stage === stage) return null;
                return (
                  <div style={{
                    border: `1.5px dashed ${meta.fg}`,
                    background: '#ffffff',
                    borderRadius: 10,
                    padding: '10px 12px',
                    display: 'flex', flexDirection: 'column', gap: 6,
                    boxShadow: `0 4px 14px ${meta.fg}1f, 0 0 0 3px ${meta.fg}14`,
                    animation: 'dropPulse 1.2s ease-in-out infinite',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: meta.fg, flexShrink: 0,
                      }}></span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: meta.fg,
                        textTransform: 'uppercase', letterSpacing: '0.06em',
                      }}>Drop to move to {meta.label}</span>
                    </div>
                    <div style={{
                      fontSize: 12, fontWeight: 600, color: 'var(--fg-primary)',
                      lineHeight: 1.35,
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}>{dragDeal.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span className="t-num" style={{
                        fontSize: 13, fontWeight: 700, color: 'var(--fg-primary)',
                      }}>{window.formatJODshort(dragDeal.value)}</span>
                      <span style={{ fontSize: 11, color: 'var(--fg-tertiary)', fontWeight: 500 }}>
                        from {window.STAGE_META[dragDeal.stage]?.label || dragDeal.stage}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Quick-add inline OR Add card button */}
              {quickAddStage === stage ? (
                <window.QuickAdd
                  stage={stage}
                  onCancel={onCancelQuickAdd}
                  onAdd={onQuickAdd}
                />
              ) : (
                <button onClick={() => onStartQuickAdd?.(stage)} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '10px', background: 'transparent',
                  border: `1px dashed ${meta.fg}55`,
                  color: meta.fg, opacity: 0.85,
                  borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  transition: 'background 120ms, opacity 120ms',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.5)'; e.currentTarget.style.opacity = 1; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.opacity = 0.85; }}
                >
                  <Plus size={12} /> Add deal
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

window.KanbanBoard = KanbanBoard;
