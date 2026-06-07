// Avatar with deterministic per-name color from a warm-toned palette.
const AVATAR_COLORS = [
  '#B45309', // warm amber
  '#C2410C', // warm orange
  '#9F1239', // berry
  '#047857', // forest
  '#0F766E', // teal
  '#1D4ED8', // indigo
  '#6D28D9', // purple
  '#7C2D12', // brown
  '#A16207', // gold
  '#15803D', // green
];

function hashName(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h) % AVATAR_COLORS.length;
}

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');
}

function Avatar({ name, size = 28, ring = false }) {
  const color = AVATAR_COLORS[hashName(name)];
  const fontSize = Math.round(size * 0.40);
  return (
    <span
      title={name}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: '50%', background: color, color: '#fff',
        fontWeight: 600, fontSize, lineHeight: 1, flexShrink: 0,
        border: ring ? '2px solid var(--bg-surface)' : undefined,
        userSelect: 'none',
      }}
    >
      {initials(name)}
    </span>
  );
}

function AvatarGroup({ names, size = 24, max = 3 }) {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <span style={{ display: 'inline-flex' }}>
      {shown.map((n, i) => (
        <span key={n} style={{ marginLeft: i === 0 ? 0 : -8 }}>
          <Avatar name={n} size={size} ring />
        </span>
      ))}
      {extra > 0 && (
        <span
          style={{
            marginLeft: -8,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: size, height: size, borderRadius: '50%',
            background: 'var(--neutral-100)', color: 'var(--neutral-600)',
            fontWeight: 500, fontSize: Math.round(size * 0.36),
            border: '2px solid var(--bg-surface)',
          }}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}

window.Avatar = Avatar;
window.AvatarGroup = AvatarGroup;
