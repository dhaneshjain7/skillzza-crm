const MAP = {
  'New':                { bg:'#dbeafe', color:'#1d4ed8' },
  'Contacted':          { bg:'#fef9c3', color:'#854d0e' },
  'LOI Pending':        { bg:'#ffedd5', color:'#9a3412' },
  'LOI Received':       { bg:'#dcfce7', color:'#15803d' },
  'Verification':       { bg:'#ede9fe', color:'#6d28d9' },
  'Data Requested':     { bg:'#e0f2fe', color:'#0369a1' },
  'Data Received':      { bg:'#cffafe', color:'#0e7490' },
  'Completed':          { bg:'#d1fae5', color:'#065f46' },
};

// Admin/superadmin-facing relabeling — the stored currentStatus value is unchanged,
// only the text shown to staff differs. Pass `raw` to show the stored value verbatim
// (used on the school's own dashboard, which keeps its original wording).
export const ADMIN_LABELS = {
  'Contacted':    'Assigned to Admin',
  'Verification': 'Approval Recived',
};

const StatusBadge = ({ status, size = 'md', raw = false }) => {
  const c     = MAP[status] || { bg:'#f1f5f9', color:'#475569' };
  const label = raw ? status : (ADMIN_LABELS[status] || status);
  const fs = size === 'sm' ? '0.68rem' : size === 'lg' ? '0.875rem' : '0.75rem';
  const px = size === 'sm' ? '0.45rem' : '0.65rem';
  const py = size === 'sm' ? '0.18rem' : '0.3rem';
  return (
    <span style={{ display:'inline-block', background:c.bg, color:c.color, fontSize:fs, fontWeight:'600', padding:`${py} ${px}`, borderRadius:'20px', whiteSpace:'nowrap', letterSpacing:'0.01em' }}>
      {label}
    </span>
  );
};

export default StatusBadge;
