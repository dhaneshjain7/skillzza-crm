// Renders the DCAIS School Health Score (0-100, Green/Amber/Red) computed
// server-side in server/utils/healthScore.js. `health` is the `.healthScore`
// object attached to a school by getSchools/getSchoolById — { score, status }.

const STATUS_COLORS = {
  Green: { bg: '#d1fae5', color: '#065f46', dot: '#16a34a' },
  Amber: { bg: '#fef9c3', color: '#854d0e', dot: '#ca8a04' },
  Red:   { bg: '#fee2e2', color: '#991b1b', dot: '#dc2626' },
};

const HealthBadge = ({ health, size = 'md' }) => {
  if (!health || health.score == null) {
    return <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic' }}>—</span>;
  }
  const c = STATUS_COLORS[health.status] || { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' };
  const fs = size === 'sm' ? '0.68rem' : size === 'lg' ? '0.875rem' : '0.75rem';
  const px = size === 'sm' ? '0.45rem' : '0.6rem';
  const py = size === 'sm' ? '0.18rem' : '0.28rem';
  return (
    <span title={`${health.status} · ${health.score}/100`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: c.bg, color: c.color, fontSize: fs, fontWeight: '700', padding: `${py} ${px}`, borderRadius: '20px', whiteSpace: 'nowrap' }}>
      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
      {health.score}
    </span>
  );
};

export default HealthBadge;
