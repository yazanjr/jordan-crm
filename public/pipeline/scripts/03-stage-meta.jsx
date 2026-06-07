// Pipeline stage chip — used in tables, cards, filters.
// Variants:
//   pill   — rounded badge with dot, used in cards/lists (default)
//   cell   — Monday-style filled cell, used in tables
//   ghost  — outlined version, used in filters
//
// Stage keys: prospect | tender | analysis | negotiation | closing | won | lost

const STAGE_META = {
  prospect:    { label: 'Prospect',    fg: 'var(--stage-prospect)',    bg: 'var(--stage-prospect-bg)',    cellFg: '#fff', cellBg: 'var(--stage-prospect)' },
  tender:      { label: 'Tender',      fg: 'var(--stage-tender)',      bg: 'var(--stage-tender-bg)',      cellFg: '#fff', cellBg: 'var(--stage-tender)' },
  analysis:    { label: 'Analysis',    fg: 'var(--stage-analysis)',    bg: 'var(--stage-analysis-bg)',    cellFg: '#fff', cellBg: 'var(--stage-analysis)' },
  negotiation: { label: 'Negotiation', fg: '#B7710F',                  bg: 'var(--stage-negotiation-bg)', cellFg: '#fff', cellBg: 'var(--stage-negotiation)' },
  closing:     { label: 'Closing',     fg: 'var(--img-green-700)',     bg: 'var(--stage-closing-bg)',     cellFg: '#fff', cellBg: 'var(--stage-closing)' },
  won:         { label: 'Won',         fg: 'var(--img-green-700)',     bg: 'var(--color-success-bg)',     cellFg: '#fff', cellBg: 'var(--stage-won)' },
  lost:        { label: 'Lost',        fg: '#B0241D',                  bg: 'var(--color-danger-bg)',      cellFg: '#fff', cellBg: 'var(--stage-lost)' },
};

function StageChip({ stage, variant = 'pill', size = 'md' }) {
  const meta = STAGE_META[stage];
  if (!meta) return null;

  if (variant === 'cell') {
    return (
      <span
        className="t-num"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: meta.cellBg, color: meta.cellFg,
          fontWeight: 600, fontSize: 12, letterSpacing: '0.01em',
          width: '100%', height: '100%', minHeight: 32,
        }}
      >
        {meta.label}
      </span>
    );
  }

  const pad = size === 'sm' ? '2px 7px' : '3px 9px';
  const fontSize = size === 'sm' ? 10 : 11;
  const dot = size === 'sm' ? 5 : 6;

  if (variant === 'ghost') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: pad, borderRadius: 'var(--radius-full)',
        background: 'transparent', color: meta.fg,
        border: `1px solid ${meta.fg}33`,
        fontSize, fontWeight: 600, lineHeight: 1,
      }}>
        <span style={{ width: dot, height: dot, borderRadius: '50%', background: meta.fg }}></span>
        {meta.label}
      </span>
    );
  }

  // pill
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: pad, borderRadius: 'var(--radius-full)',
      background: meta.bg, color: meta.fg,
      fontSize, fontWeight: 600, lineHeight: 1,
    }}>
      <span style={{ width: dot, height: dot, borderRadius: '50%', background: meta.fg }}></span>
      {meta.label}
    </span>
  );
}

window.StageChip = StageChip;
window.STAGE_META = STAGE_META;
window.STAGE_ORDER = ['prospect', 'tender', 'analysis', 'negotiation', 'closing'];
