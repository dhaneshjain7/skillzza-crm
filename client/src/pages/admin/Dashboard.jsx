import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Layout from '../../components/layout/Layout';
import StatCard from '../../components/common/StatCard';
import StatusBadge from '../../components/common/StatusBadge';
import API from '../../api/axios';

const DOC_TYPE_LABELS = {
  school_approval:        'LOI',
  student_data:           'Student Data',
  teacher_data:           'Teacher Data',
  adobe_student_accounts: 'Adobe Student IDs',
  adobe_teacher_accounts: 'Adobe Teacher IDs',
  'Registration Certificate': 'Registration Certificate',
  'Affiliation Certificate':  'Affiliation Certificate',
  Other:                  'Other',
};

const DOC_STATUS_STYLE = {
  'Pending':             { bg: '#fef9c3', color: '#854d0e' },
  'Approved':            { bg: '#d1fae5', color: '#065f46' },
  'Rejected':            { bg: '#fee2e2', color: '#991b1b' },
  'Re-upload Requested': { bg: '#ffedd5', color: '#9a3412' },
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user }  = useAuth();
  const [stats,    setStats]    = useState(null);
  const [schools,  setSchools]  = useState([]);
  const [pending,  setPending]  = useState([]);
  const [pendingDocs, setPendingDocs] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [statsRes, schoolsRes, pendingRes] = await Promise.all([
          API.get('/schools/stats'),
          API.get('/schools?limit=5&sortBy=updatedAt&order=desc'),
          API.get('/schools?status=LOI%20Pending&limit=5'),
        ]);
        setStats(statsRes.data.stats);
        setSchools(schoolsRes.data.schools);
        setPending(pendingRes.data.schools);

        // Fetch pending documents from all assigned schools
        const allSchools = schoolsRes.data.schools;
        if (allSchools.length > 0) {
          const docsPromises = allSchools.map(s =>
            API.get(`/documents/school/${s._id}?latestOnly=true`)
              .then(res => res.data.documents?.filter(d => d.status === 'Pending').map(d => ({ ...d, schoolName: s.schoolName, schoolId: s._id })))
              .catch(() => [])
          );
          const allDocs = await Promise.all(docsPromises);
          const flatDocs = allDocs.flat().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          setPendingDocs(flatDocs);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const sc    = stats?.statusCounts || {};
  const total = stats?.total || 0;

  const STATS = [
    { label:'Assigned Schools', value: total,              icon:'🏫', color:'#1a3a5c', bg:'#dbeafe', sub:'Total assigned to you' },
    { label:'LOI Received',     value: sc['LOI Received']||0, icon:'📄', color:'#15803d', bg:'#dcfce7', sub:'Schools that submitted LOI' },
    { label:'DCAIS Participated', value: stats?.dcaisReceived||0, icon:'📑', color:'#0e7490', bg:'#cffafe', sub:'Schools that participated in DCAIS' },
    { label:'Completed',        value: sc['Completed']||0, icon:'✅', color:'#065f46', bg:'#d1fae5', sub:'Successfully closed' },
    { label:'Hackathon Participated', value: stats?.hackathonParticipated||0, icon:'🏆', color:'#6d28d9', bg:'#ede9fe', sub:'Schools that took part' },
  ];

  return (
    <Layout>
      {/* Welcome */}
      <div style={{ marginBottom:'1.5rem' }}>
        <h2 style={{ margin:'0 0 0.2rem', fontSize:'1.2rem', fontWeight:'800', color:'#1e293b' }}>
          Good {getGreeting()}, {user?.name?.split(' ')[0]} 👋
        </h2>
        <p style={{ margin:0, fontSize:'0.82rem', color:'#64748b' }}>
          Here's what's happening with your assigned schools today
        </p>
      </div>

      {loading ? <Loader /> : (
        <>
          {/* Stats */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))', gap:'1rem', marginBottom:'1.5rem' }}>
            {STATS.map(s => <StatCard key={s.label} {...s} />)}
          </div>

          {/* Today's Focus Banner */}
          <div style={{ background:'linear-gradient(135deg,#1a3a5c,#2d5986)', borderRadius:'12px', padding:'1.25rem 1.5rem', marginBottom:'1.5rem', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'1rem' }}>
            <div>
              <div style={{ color:'rgba(255,255,255,0.7)', fontSize:'0.75rem', fontWeight:'600', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'0.3rem' }}>Today's Focus</div>
              <div style={{ color:'#fff', fontSize:'1rem', fontWeight:'700' }}>
                {pendingDocs.length > 0
                  ? `${pendingDocs.length} document${pendingDocs.length > 1 ? 's' : ''} waiting for your review`
                  : pending.length > 0
                  ? `${pending.length} school${pending.length > 1 ? 's' : ''} waiting for document review`
                  : total === 0 ? 'No schools assigned yet' : 'All schools are up to date ✓'}
              </div>
            </div>
            {(pendingDocs.length > 0 || pending.length > 0) && (
              <button onClick={() => navigate('/admin/schools')} style={{ background:'#fff', color:'#1a3a5c', border:'none', borderRadius:'8px', padding:'0.6rem 1.25rem', fontWeight:'700', fontSize:'0.85rem', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                Review Now →
              </button>
            )}
          </div>

          {/* Main grid */}
          <div style={{ display:'grid', gridTemplateColumns:'3fr 2fr', gap:'1.25rem', marginBottom:'1.25rem' }}>

            {/* Pending Documents from Schools */}
            <div style={card}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
                <Title>📄 Documents Awaiting Review</Title>
                <span style={{ fontSize:'0.72rem', background: pendingDocs.length > 0 ? '#fef9c3' : '#f1f5f9', color: pendingDocs.length > 0 ? '#854d0e' : '#94a3b8', padding:'2px 8px', borderRadius:'10px', fontWeight:'600' }}>
                  {pendingDocs.length} pending
                </span>
              </div>

              {pendingDocs.length === 0 ? (
                <div style={{ textAlign:'center', padding:'2rem', color:'#94a3b8' }}>
                  <div style={{ fontSize:'2rem', marginBottom:'0.5rem' }}>✅</div>
                  <div style={{ fontSize:'0.82rem' }}>No documents pending review</div>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'0.625rem' }}>
                  {pendingDocs.slice(0, 6).map(doc => {
                    const st = DOC_STATUS_STYLE[doc.status] || { bg:'#f1f5f9', color:'#475569' };
                    return (
                      <div key={doc._id}
                        onClick={() => navigate(`/admin/schools/${doc.schoolId}/documents`)}
                        style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.75rem', background:'#f8fafc', border:'1px solid #f1f5f9', borderRadius:'8px', cursor:'pointer', transition:'background 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f0f6ff'}
                        onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
                      >
                        {/* File icon */}
                        <div style={{ width:'36px', height:'36px', borderRadius:'8px', background:'#ffedd5', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.1rem', flexShrink:0 }}>
                          {doc.fileExtension === 'csv' ? '📋' : doc.fileExtension === 'pdf' ? '📕' : '📊'}
                        </div>

                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:'0.82rem', fontWeight:'600', color:'#1e293b', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                            {doc.fileName}
                          </div>
                          <div style={{ fontSize:'0.72rem', color:'#64748b', marginTop:'2px' }}>
                            <span style={{ fontWeight:'600', color:'#1a3a5c' }}>{doc.schoolName}</span>
                            {' · '}{DOC_TYPE_LABELS[doc.documentType] || doc.documentType}
                          </div>
                          <div style={{ fontSize:'0.68rem', color:'#94a3b8', marginTop:'2px' }}>
                            Uploaded {new Date(doc.createdAt).toLocaleString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                            {doc.parsedData && ` · ${doc.parsedData.validRows} valid rows`}
                          </div>
                        </div>

                        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'4px', flexShrink:0 }}>
                          <span style={{ ...st, fontSize:'0.68rem', fontWeight:'700', padding:'2px 7px', borderRadius:'10px' }}>{doc.status}</span>
                          <span style={{ fontSize:'0.68rem', color:'#1a3a5c', fontWeight:'600' }}>Review →</span>
                        </div>
                      </div>
                    );
                  })}
                  {pendingDocs.length > 6 && (
                    <button onClick={() => navigate('/admin/schools')} style={{ width:'100%', padding:'0.6rem', background:'none', border:'1px dashed #e2e8f0', borderRadius:'8px', cursor:'pointer', fontSize:'0.78rem', color:'#64748b', fontFamily:'inherit' }}>
                      +{pendingDocs.length - 6} more documents — View all schools →
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Right column */}
            <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>

              {/* Pending Tasks */}
              <div style={card}>
                <Title>Pending Actions</Title>
                {pending.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'1.5rem 1rem' }}>
                    <div style={{ fontSize:'2rem', marginBottom:'0.5rem' }}>🎉</div>
                    <div style={{ fontSize:'0.82rem', color:'#64748b' }}>No pending actions!</div>
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                    {pending.map(s => (
                      <div key={s._id} onClick={() => navigate(`/admin/schools/${s._id}`)}
                        style={{ display:'flex', alignItems:'center', gap:'0.625rem', padding:'0.7rem', background:'#fff8f0', border:'1px solid #fed7aa', borderRadius:'8px', cursor:'pointer' }}>
                        <span style={{ fontSize:'1rem' }}>📄</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:'0.8rem', fontWeight:'600', color:'#1e293b', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.schoolName}</div>
                          <div style={{ fontSize:'0.7rem', color:'#9a3412' }}>Documents pending review</div>
                        </div>
                        <span style={{ fontSize:'0.7rem', color:'#9a3412' }}>→</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Status breakdown */}
                <div style={{ marginTop:'1rem', paddingTop:'1rem', borderTop:'1px solid #f1f5f9' }}>
                  <div style={{ fontSize:'0.72rem', color:'#94a3b8', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.5rem' }}>Status Breakdown</div>
                  {Object.entries(sc).filter(([,v]) => v > 0).map(([status, count]) => (
                    <div key={status} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'3px 0', fontSize:'0.78rem' }}>
                      <StatusBadge status={status} size="sm" />
                      <span style={{ fontWeight:'700', color:'#1e293b' }}>{count}</span>
                    </div>
                  ))}
                  {Object.keys(sc).length === 0 && <div style={{ color:'#94a3b8', fontSize:'0.78rem' }}>No data yet</div>}
                </div>
              </div>
            </div>
          </div>

          {/* Recent Schools Table */}
          <div style={card}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
              <Title>Recent School Updates</Title>
              <button onClick={() => navigate('/admin/schools')} style={linkBtn('#1a3a5c')}>View all →</button>
            </div>
            {schools.length === 0 ? <Empty text="No schools assigned" /> : (
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr>
                      {['School','Location','Status','Updated'].map(h => (
                        <th key={h} style={{ textAlign:'left', padding:'0.5rem 0.625rem', fontSize:'0.68rem', color:'#94a3b8', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid #f1f5f9', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {schools.map((s, i) => (
                      <tr key={s._id} onClick={() => navigate(`/admin/schools/${s._id}`)}
                        style={{ borderBottom: i < schools.length-1 ? '1px solid #f8fafc' : 'none', cursor:'pointer' }}>
                        <td style={{ padding:'0.625rem' }}>
                          <div style={{ fontSize:'0.825rem', fontWeight:'600', color:'#1e293b' }}>{s.schoolName}</div>
                          <div style={{ fontSize:'0.7rem', color:'#94a3b8' }}>{s.email}</div>
                        </td>
                        <td style={{ padding:'0.625rem', fontSize:'0.8rem', color:'#475569' }}>{s.address?.city}</td>
                        <td style={{ padding:'0.625rem' }}><StatusBadge status={s.currentStatus} size="sm" /></td>
                        <td style={{ padding:'0.625rem', fontSize:'0.72rem', color:'#94a3b8', whiteSpace:'nowrap' }}>
                          {new Date(s.updatedAt).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div style={{ ...card, marginTop:'1.25rem' }}>
            <Title>Quick Actions</Title>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:'0.75rem' }}>
              {[
                { label:'All My Schools',   icon:'🏫', path:'/admin/schools',  bg:'#dbeafe', color:'#1d4ed8' },
                { label:'LOI Pending',      icon:'📄', path:'/admin/schools',  bg:'#ffedd5', color:'#9a3412' },
                { label:'Messages',         icon:'💬', path:'/admin/messages', bg:'#d1fae5', color:'#065f46' },
                { label:'Reports',          icon:'📊', path:'/admin/reports',  bg:'#ede9fe', color:'#6d28d9' },
              ].map(a => (
                <button key={a.label} onClick={() => navigate(a.path)}
                  style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'0.5rem', padding:'1rem 0.75rem', background:a.bg, border:'none', borderRadius:'10px', cursor:'pointer', fontFamily:'inherit' }}>
                  <span style={{ fontSize:'1.4rem' }}>{a.icon}</span>
                  <span style={{ fontSize:'0.75rem', fontWeight:'600', color:a.color, textAlign:'center' }}>{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </Layout>
  );
};

const getGreeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
};

const card    = { background:'#fff', borderRadius:'12px', padding:'1.25rem', boxShadow:'0 1px 3px rgba(0,0,0,0.06)', border:'1px solid #f1f5f9' };
const linkBtn = (c) => ({ background:'none', border:'none', color:c, fontWeight:'600', fontSize:'0.78rem', cursor:'pointer', padding:0, fontFamily:'inherit' });
const Title   = ({ children }) => <h3 style={{ margin:'0 0 1rem', fontSize:'0.9rem', fontWeight:'700', color:'#1e293b' }}>{children}</h3>;
const Empty   = ({ text }) => <div style={{ textAlign:'center', padding:'2rem', color:'#94a3b8', fontSize:'0.85rem' }}>{text}</div>;
const Loader  = () => <div style={{ textAlign:'center', padding:'4rem', color:'#94a3b8' }}>Loading dashboard...</div>;

export default AdminDashboard;
