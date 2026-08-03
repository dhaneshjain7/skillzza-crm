const MAP = {
  'New':                { bg:'#dbeafe', color:'#1d4ed8' },
  'Contacted':          { bg:'#fef9c3', color:'#854d0e' },
  'LOI Pending':        { bg:'#ffedd5', color:'#9a3412' },
  'LOI Received':       { bg:'#dcfce7', color:'#15803d' },
  'Verification':       { bg:'#ede9fe', color:'#6d28d9' },
  'Rejected':           { bg:'#fee2e2', color:'#991b1b' },
  'Completed':          { bg:'#d1fae5', color:'#065f46' },
  'Archived':           { bg:'#f1f5f9', color:'#475569' },
};

const StatusBadge = ({ status, size = 'md' }) => {
  const c  = MAP[status] || { bg:'#f1f5f9', color:'#475569' };
  const fs = size === 'sm' ? '0.68rem' : size === 'lg' ? '0.875rem' : '0.75rem';
  const px = size === 'sm' ? '0.45rem' : '0.65rem';
  const py = size === 'sm' ? '0.18rem' : '0.3rem';
  return (
    <span style={{ display:'inline-block', background:c.bg, color:c.color, fontSize:fs, fontWeight:'600', padding:`${py} ${px}`, borderRadius:'20px', whiteSpace:'nowrap', letterSpacing:'0.01em' }}>
      {status}
    </span>
  );
};

export default StatusBadge;
