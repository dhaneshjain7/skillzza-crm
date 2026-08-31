import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import StatCard from '../../components/common/StatCard';
import StatusBadge, { ADMIN_LABELS } from '../../components/common/StatusBadge';
import API from '../../api/axios';

// Mini bar chart using pure CSS/SVG
const BarChart = ({ data }) => {
  if (!data || data.length === 0) return <div style={{ color:'#94a3b8', fontSize:'0.8rem', textAlign:'center', padding:'2rem' }}>No data yet</div>;
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:'6px', height:'80px', padding:'0 4px' }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'4px' }}>
          <div style={{ width:'100%', background:'#1e3a5f', borderRadius:'3px 3px 0 0', height:`${Math.max((d.count/max)*70,2)}px`, transition:'height 0.4s', minHeight:'2px' }} />
          <span style={{ fontSize:'0.6rem', color:'#94a3b8', whiteSpace:'nowrap' }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
};

// Generic donut renderer — takes pre-built entries of { key, label, count, color }
const Donut = ({ entries, total, centerLabel = 'SCHOOLS', legendMaxHeight }) => {
  if (entries.length === 0) return <div style={{ color:'#94a3b8', fontSize:'0.8rem', textAlign:'center', padding:'1rem' }}>No schools yet</div>;

  let cumulative = 0;
  const radius = 50, cx = 60, cy = 60, stroke = 14;
  const circumference = 2 * Math.PI * radius;

  return (
    <div style={{ display:'flex', alignItems:'center', gap:'1.5rem', flexWrap:'wrap' }}>
      <svg width="120" height="120" viewBox="0 0 120 120" style={{ flexShrink:0 }}>
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
        {/* Rotate -90deg so slices start at 12 o'clock, then stack sequentially */}
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          {entries.map(({ key, count, color }) => {
            const pct = count / total;
            const arcLength = pct * circumference;
            const dasharray  = `${arcLength} ${circumference - arcLength}`;
            const dashoffset = -(cumulative * circumference);
            cumulative += pct;
            return (
              <circle key={key} cx={cx} cy={cy} r={radius} fill="none"
                stroke={color} strokeWidth={stroke}
                strokeDasharray={dasharray} strokeDashoffset={dashoffset}
                strokeLinecap="butt"
                style={{ transition:'all 0.5s' }} />
            );
          })}
        </g>
        <text x={cx} y={cy-4} textAnchor="middle" fontSize="14" fontWeight="800" fill="#1e293b">{total}</text>
        <text x={cx} y={cy+12} textAnchor="middle" fontSize="8" fill="#94a3b8">{centerLabel}</text>
      </svg>
      <div style={{ display:'flex', flexDirection:'column', gap:'5px', flex:1, minWidth:'120px', maxHeight: legendMaxHeight, overflowY: legendMaxHeight ? 'auto' : 'visible' }}>
        {entries.map(({ key, label, count, color }) => (
          <div key={key} style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'0.75rem' }}>
            <div style={{ width:'8px', height:'8px', borderRadius:'2px', background: color, flexShrink:0 }} />
            <span style={{ color:'#475569', flex:1 }}>{label}</span>
            <span style={{ fontWeight:'700', color:'#1e293b' }}>{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const STATUS_COLORS = {
  'New':'#3b82f6','Contacted':'#f59e0b','LOI Pending':'#f97316',
  'LOI Received':'#22c55e','Verification':'#8b5cf6',
  'Data Requested':'#0ea5e9','Data Received':'#06b6d4',
  'Completed':'#0e7490',
};

// Donut-style status distribution
const StatusDonut = ({ counts, total }) => {
  // Rejected/Archived are excluded from this breakdown — not shown in admin/superadmin status views.
  const entries = Object.entries(counts)
    .filter(([s,v]) => v > 0 && s !== 'Rejected' && s !== 'Archived')
    .map(([status, count]) => ({ key: status, label: ADMIN_LABELS[status] || status, count, color: STATUS_COLORS[status] || '#94a3b8' }));
  return <Donut entries={entries} total={total} centerLabel="SCHOOLS" />;
};

const STATE_PALETTE = ['#1e3a5f','#3b82f6','#f59e0b','#22c55e','#8b5cf6','#ef4444','#0e7490','#ec4899','#84cc16','#f97316','#6366f1','#14b8a6'];

// Donut-style state distribution — schools grouped by address.state
const StateDonut = ({ counts, total }) => {
  const entries = Object.entries(counts)
    .filter(([,v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([state, count], i) => ({ key: state, label: state, count, color: STATE_PALETTE[i % STATE_PALETTE.length] }));
  return <Donut entries={entries} total={total} centerLabel="SCHOOLS" legendMaxHeight="170px" />;
};

const SuperAdminDashboard = () => {
  const navigate = useNavigate();
  const [stats,    setStats]    = useState(null);
  const [schools,  setSchools]  = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [refresh,  setRefresh]  = useState(0);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [statsRes, schoolsRes, growthRes] = await Promise.all([
          API.get('/schools/stats'),
          API.get('/schools?limit=6&sortBy=createdAt&order=desc'),
          API.get('/reports/growth?months=6'),
        ]);
        setStats(statsRes.data.stats);
        setSchools(schoolsRes.data.schools);

        // Real monthly data from growth report
        const rows = growthRes.data.rows || [];
        setActivity(rows.map(r => ({ label: r['Month'], count: r['Added'] })));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [refresh]);

  const sc         = stats?.statusCounts || {};
  const stc        = stats?.stateCounts || {};
  const total      = stats?.total || 0;
  const totalAdmins= stats?.totalAdmins || 0;

  const STATS = [
    { label:'Total Schools',  value: total,              icon:'🏫', color:'#1e3a5f', bg:'#e8f0f9', sub:'All time' },
    { label:'Total Admins',   value: totalAdmins,        icon:'👥', color:'#6d28d9', bg:'#ede9fe', sub:'Active administrators' },
    { label:'New',            value: sc['New']||0,        icon:'🆕', color:'#1d4ed8', bg:'#dbeafe', sub:'Schools to be assign' },
    { label:'LOI Received',   value: sc['LOI Received']||0, icon:'📄', color:'#15803d', bg:'#dcfce7', sub:'Schools that submitted LOI' },
    { label:'CPD Training Done', value: stats?.cpdTrainingDone||0, icon:'🎓', color:'#9333ea', bg:'#f3e8ff', sub:'Schools with CPD training done' },
    { label:'DCAIS Participated', value: stats?.dcaisReceived||0, icon:'📑', color:'#0e7490', bg:'#cffafe', sub:'Schools that participated in DCAIS' },
    { label:'Completed',      value: sc['Completed']||0,  icon:'🎓', color:'#0e7490', bg:'#cffafe', sub:'Fully onboarded' },
    { label:'Hackathon Participated', value: stats?.hackathonParticipated||0, icon:'🏆', color:'#6d28d9', bg:'#ede9fe', sub:'Schools that took part' },
  ];

  return (
    <Layout>
      {/* Welcome bar */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem', flexWrap:'wrap', gap:'0.75rem' }}>
        <div>
          <h2 style={{ margin:'0 0 0.2rem', fontSize:'1.25rem', fontWeight:'800', color:'#1e293b' }}>Platform Overview</h2>
          <p style={{ margin:0, fontSize:'0.82rem', color:'#64748b' }}>Real-time stats across all schools and administrators</p>
        </div>
        <button onClick={() => setRefresh(r => r+1)} style={{ background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:'8px', padding:'0.5rem 1rem', fontSize:'0.8rem', color:'#475569', cursor:'pointer', fontFamily:'inherit', fontWeight:'600' }}>
          ↻ Refresh
        </button>
      </div>

      {loading ? (
        <Loader />
      ) : (
        <>
          {/* KPI Stats Grid */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:'1rem', marginBottom:'1.5rem' }}>
            {STATS.map(s => <StatCard key={s.label} {...s} />)}
          </div>

          {/* Row 2: Status Distribution + Monthly Growth */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1.25rem', marginBottom:'1.25rem' }}>

            {/* Status Distribution */}
            <div style={card}>
              <SectionTitle>Status Distribution</SectionTitle>
              <StatusDonut counts={sc} total={total} />
            </div>

            {/* Monthly Growth */}
            <div style={card}>
              <SectionTitle>Schools Added Monthly</SectionTitle>
              <BarChart data={activity} />
            </div>
          </div>

          {/* Row 2b: State Distribution */}
          <div style={{ marginBottom:'1.25rem' }}>
            <div style={card}>
              <SectionTitle>State Distribution</SectionTitle>
              <StateDonut counts={stc} total={total} />
            </div>
          </div>

          {/* Row 3: Recent Schools + Quick Actions */}
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:'1.25rem', marginBottom:'1.25rem' }}>

            {/* Recent Schools */}
            <div style={card}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
                <SectionTitle noMargin>Recent Schools</SectionTitle>
                <button onClick={() => navigate('/superadmin/schools')} style={linkBtn}>View all →</button>
              </div>
              {schools.length === 0 ? <Empty text="No schools added yet" /> : (
                <div style={{ display:'flex', flexDirection:'column', gap:'0' }}>
                  {schools.map((school, i) => (
                    <div key={school._id}
                      onClick={() => navigate(`/superadmin/schools/${school._id}`)}
                      style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.7rem 0.5rem', borderBottom: i < schools.length-1 ? '1px solid #f8fafc' : 'none', cursor:'pointer', borderRadius:'6px', transition:'background 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background='#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}
                    >
                      <div style={{ width:'34px', height:'34px', borderRadius:'8px', background:'#e8f0f9', color:'#1e3a5f', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'800', fontSize:'0.9rem', flexShrink:0 }}>
                        {school.schoolName[0]}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:'0.875rem', fontWeight:'600', color:'#1e293b', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{school.schoolName}</div>
                        <div style={{ fontSize:'0.72rem', color:'#94a3b8' }}>{school.address?.city}, {school.address?.state} · {school.board || 'Board N/A'}</div>
                      </div>
                      <div style={{ flexShrink:0 }}>
                        <StatusBadge status={school.currentStatus} size="sm" />
                      </div>
                      <div style={{ fontSize:'0.72rem', color:'#94a3b8', flexShrink:0, minWidth:'60px', textAlign:'right' }}>
                        {new Date(school.createdAt).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div style={card}>
              <SectionTitle>Quick Actions</SectionTitle>
              <div style={{ display:'flex', flexDirection:'column', gap:'0.625rem' }}>
                {[
                  { label:'Add New School',  icon:'➕', path:'/superadmin/schools', color:'#1e3a5f', bg:'#e8f0f9' },
                  { label:'Manage Admins',   icon:'👥', path:'/superadmin/admins',  color:'#6d28d9', bg:'#ede9fe' },
                  { label:'View Reports',    icon:'📊', path:'/superadmin/reports', color:'#0e7490', bg:'#cffafe' },
                  { label:'Activity Logs',   icon:'📋', path:'/superadmin/logs',    color:'#065f46', bg:'#d1fae5' },
                  { label:'Settings',        icon:'⚙️', path:'/superadmin/settings',color:'#92400e', bg:'#fef3c7' },
                ].map(a => (
                  <button key={a.label} onClick={() => navigate(a.path)}
                    style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.7rem 0.875rem', background:a.bg, border:'none', borderRadius:'8px', cursor:'pointer', fontFamily:'inherit', textAlign:'left', transition:'opacity 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.opacity='0.8'}
                    onMouseLeave={e => e.currentTarget.style.opacity='1'}
                  >
                    <span style={{ fontSize:'1.1rem' }}>{a.icon}</span>
                    <span style={{ fontSize:'0.82rem', fontWeight:'600', color: a.color }}>{a.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 4: Latest Activity Feed */}
          <div style={card}>
            <SectionTitle>Latest Activity Feed</SectionTitle>
            {schools.length === 0 ? <Empty text="No recent activity" /> : (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:'0.75rem' }}>
                {schools.slice(0,4).map(school => (
                  <div key={school._id} style={{ display:'flex', gap:'0.75rem', padding:'0.75rem', background:'#f8fafc', borderRadius:'8px', border:'1px solid #f1f5f9' }}>
                    <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:'#1e3a5f', marginTop:'5px', flexShrink:0 }} />
                    <div>
                      <div style={{ fontSize:'0.8rem', fontWeight:'600', color:'#1e293b' }}>School added: {school.schoolName}</div>
                      <div style={{ fontSize:'0.72rem', color:'#94a3b8', marginTop:'2px' }}>
                        {new Date(school.createdAt).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})} · Status: <StatusBadge status={school.currentStatus} size="sm" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </Layout>
  );
};

const card       = { background:'#fff', borderRadius:'12px', padding:'1.25rem', boxShadow:'0 1px 3px rgba(0,0,0,0.06)', border:'1px solid #f1f5f9' };
const linkBtn    = { background:'none', border:'none', color:'#1e3a5f', fontWeight:'600', fontSize:'0.78rem', cursor:'pointer', padding:0, fontFamily:'inherit' };
const SectionTitle = ({ children, noMargin }) => <h3 style={{ margin: noMargin ? 0 : '0 0 1rem', fontSize:'0.9rem', fontWeight:'700', color:'#1e293b' }}>{children}</h3>;
const Empty      = ({ text }) => <div style={{ textAlign:'center', padding:'2rem', color:'#94a3b8', fontSize:'0.85rem' }}>{text}</div>;
const Loader     = () => <div style={{ textAlign:'center', padding:'4rem', color:'#94a3b8' }}>Loading dashboard...</div>;

export default SuperAdminDashboard;
