import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import StatusBadge, { ADMIN_LABELS } from '../../components/common/StatusBadge';
import API from '../../api/axios';
import AddSchoolModal from '../../components/school/AddSchoolModal';

const STATUSES = ['','New','Contacted','LOI Pending','LOI Received','Verification','Data Requested','Data Received','Completed'];

const ACTIVITY_FIELDS = [
  { value: 'loiReceived',           label: 'LOI Received' },
  { value: 'dcaisConfirmation',     label: 'DCAIS Participated' },
  { value: 'studentDataReceived',   label: 'Student Data Received' },
  { value: 'teachersDataReceived',  label: 'Teachers Data Received' },
  { value: 'hackathonRegistered',   label: 'Hackathon Participated' },
  { value: 'poeSubmitted',          label: 'POE Recived' },
  { value: 'cpdTrainingDone',       label: 'CPD Training Done' },
];

const SchoolsPage = ({ role = 'superadmin' }) => {
  const navigate        = useNavigate();
  const [schools, setSchools]     = useState([]);
  const [total,   setTotal]       = useState(0);
  const [loading, setLoading]     = useState(true);
  const [page,    setPage]        = useState(1);
  const [search,  setSearch]      = useState('');
  const [searchIn,setSearchIn]    = useState('');
  const [status,  setStatus]      = useState('');
  const [activityChecks, setActivityChecks] = useState({}); // { fieldName: ['Yes'] | ['No'] | ['Yes','No'] }
  const [activityOpen, setActivityOpen] = useState(false);
  const activityRef = useRef(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const limit = 10;
  const accent = role === 'superadmin' ? '#1e3a5f' : '#1a3a5c';

  // AI natural-language query
  const [aiQueryIn, setAiQueryIn] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState(''); // set once a query has been applied/answered
  const [aiUnderstood, setAiUnderstood] = useState(true);

  const activityCount = Object.values(activityChecks).reduce((n, arr) => n + arr.length, 0);

  const toggleActivityCheck = (field, value) => {
    setActivityChecks(prev => {
      const current = new Set(prev[field] || []);
      if (current.has(value)) current.delete(value); else current.add(value);
      const next = { ...prev };
      if (current.size === 0) delete next[field]; else next[field] = Array.from(current);
      return next;
    });
    setPage(1);
  };

  const handleAiQuery = async (e) => {
    e.preventDefault();
    if (!aiQueryIn.trim()) return;
    setAiLoading(true);
    setAiSummary('');
    try {
      const { data } = await API.post('/ai/query-schools', { query: aiQueryIn });
      setAiUnderstood(data.understood);
      setAiSummary(data.summary || '');
      if (data.understood) {
        setStatus(data.appliedFilter?.status || '');
        const nextActivity = {};
        (data.appliedFilter?.activity || []).forEach(pair => {
          const [field, value] = pair.split(':');
          nextActivity[field] = [value];
        });
        setActivityChecks(nextActivity);
        const textFilter = data.appliedFilter?.search || data.appliedFilter?.city || data.appliedFilter?.state || '';
        setSearch(textFilter);
        setSearchIn(textFilter);
        setPage(1);
      }
    } catch (err) {
      setAiUnderstood(false);
      setAiSummary(err.response?.data?.message || 'Could not process that query. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  const clearAiQuery = () => {
    setAiQueryIn('');
    setAiSummary('');
    setStatus('');
    setActivityChecks({});
    setSearch('');
    setSearchIn('');
    setPage(1);
  };

  // Close activity dropdown on outside click
  useEffect(() => {
    const onClick = (e) => {
      if (activityRef.current && !activityRef.current.contains(e.target)) setActivityOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const fetchSchools = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page, limit, sortBy:'createdAt', order:'desc' });
      if (search) p.set('search', search);
      if (status) p.set('status', status);
      const activityParam = Object.entries(activityChecks)
        .flatMap(([field, values]) => values.map(v => `${field}:${v}`))
        .join(',');
      if (activityParam) p.set('activity', activityParam);
      const res = await API.get(`/schools?${p}`);
      setSchools(res.data.schools);
      setTotal(res.data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, search, status, activityChecks]);

  useEffect(() => { fetchSchools(); }, [fetchSchools]);

  const handleSearch = e => { e.preventDefault(); setSearch(searchIn); setPage(1); };
  const totalPages   = Math.ceil(total / limit);
  const basePath     = `/${role === 'superadmin' ? 'superadmin' : 'admin'}`;

  return (
    <Layout>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'1.25rem', flexWrap:'wrap', gap:'0.75rem' }}>
        <div>
          <h2 style={{ margin:'0 0 0.2rem', fontSize:'1.1rem', fontWeight:'800', color:'#1e293b' }}>
            {role === 'superadmin' ? 'All Schools' : 'My Assigned Schools'}
          </h2>
          <p style={{ margin:0, fontSize:'0.8rem', color:'#64748b' }}>{total} school{total !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowAddModal(true)}
          style={{ background: accent, color:'#fff', border:'none', borderRadius:'8px', padding:'0.6rem 1.1rem', fontSize:'0.875rem', fontWeight:'600', cursor:'pointer', fontFamily:'inherit' }}>
          + Add School
        </button>
      </div>

      {/* AI natural-language query */}
      <form onSubmit={handleAiQuery} style={{ display:'flex', gap:'0.5rem', marginBottom:'0.6rem' }}>
        <input type="text" placeholder='Ask in plain English, e.g. "Schools where LOI is received and CPD Training done"'
          value={aiQueryIn} onChange={e => setAiQueryIn(e.target.value)}
          style={{ flex:1, padding:'0.55rem 0.875rem', border:'1.5px solid #c7d2fe', borderRadius:'8px', fontSize:'0.875rem', outline:'none', fontFamily:'inherit', background:'#f5f7ff' }} />
        <button type="submit" disabled={aiLoading || !aiQueryIn.trim()}
          style={{ background:'#4338ca', color:'#fff', border:'none', borderRadius:'8px', padding:'0.55rem 1.1rem', fontSize:'0.875rem', fontWeight:'600', cursor: aiLoading ? 'default' : 'pointer', fontFamily:'inherit', opacity: aiLoading || !aiQueryIn.trim() ? 0.6 : 1 }}>
          {aiLoading ? 'Thinking...' : '✨ Ask'}
        </button>
        {aiSummary && (
          <button type="button" onClick={clearAiQuery}
            style={{ background:'#f1f5f9', color:'#64748b', border:'none', borderRadius:'8px', padding:'0.55rem 0.75rem', fontSize:'0.875rem', cursor:'pointer', fontFamily:'inherit' }}>✕</button>
        )}
      </form>
      {aiSummary && (
        <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.6rem 0.9rem', marginBottom:'1rem', borderRadius:'8px', fontSize:'0.8rem', fontFamily:'inherit', background: aiUnderstood ? '#eef2ff' : '#fef2f2', color: aiUnderstood ? '#3730a3' : '#991b1b', border: `1px solid ${aiUnderstood ? '#c7d2fe' : '#fecaca'}` }}>
          <span>{aiUnderstood ? '✨' : '⚠️'}</span>
          <span>{aiSummary}</span>
        </div>
      )}

      {/* Filters */}
      <div style={{ display:'flex', gap:'0.75rem', marginBottom:'1rem', flexWrap:'wrap' }}>
        <form onSubmit={handleSearch} style={{ display:'flex', gap:'0.5rem', flex:1, minWidth:'260px' }}>
          <input type="text" placeholder="Search name, email, UDISE code, city, district..."
            value={searchIn} onChange={e => setSearchIn(e.target.value)}
            style={{ flex:1, padding:'0.55rem 0.875rem', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'0.875rem', outline:'none', fontFamily:'inherit' }} />
          <button type="submit" style={{ background: accent, color:'#fff', border:'none', borderRadius:'8px', padding:'0.55rem 1rem', fontSize:'0.875rem', fontWeight:'600', cursor:'pointer', fontFamily:'inherit' }}>Search</button>
          {search && <button type="button" onClick={() => { setSearch(''); setSearchIn(''); setPage(1); }} style={{ background:'#f1f5f9', color:'#64748b', border:'none', borderRadius:'8px', padding:'0.55rem 0.75rem', fontSize:'0.875rem', cursor:'pointer', fontFamily:'inherit' }}>✕</button>}
        </form>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
          style={{ padding:'0.55rem 0.875rem', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'0.875rem', outline:'none', background:'#fff', fontFamily:'inherit', minWidth:'160px' }}>
          {STATUSES.map(s => <option key={s} value={s}>{s ? (ADMIN_LABELS[s] || s) : 'All Statuses'}</option>)}
        </select>
        <div ref={activityRef} style={{ position:'relative' }}>
          <button type="button" onClick={() => setActivityOpen(o => !o)}
            style={{ padding:'0.55rem 0.875rem', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'0.875rem', outline:'none', background:'#fff', fontFamily:'inherit', minWidth:'170px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'8px', color: activityCount ? '#1e293b' : '#64748b' }}>
            <span>Activity{activityCount > 0 ? ` (${activityCount})` : '...'}</span>
            <span style={{ fontSize:'0.6rem' }}>▼</span>
          </button>
          {activityOpen && (
            <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, background:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', boxShadow:'0 8px 24px rgba(0,0,0,0.12)', zIndex:50, minWidth:'270px', padding:'0.6rem', maxHeight:'340px', overflowY:'auto' }}>
              {ACTIVITY_FIELDS.map(f => {
                const checked = activityChecks[f.value] || [];
                return (
                  <div key={f.value} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.4rem 0.3rem', borderBottom:'1px solid #f8fafc' }}>
                    <span style={{ fontSize:'0.8rem', color:'#374151', fontWeight:'500' }}>{f.label}</span>
                    <div style={{ display:'flex', gap:'12px' }}>
                      <label style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'0.75rem', color:'#475569', cursor:'pointer' }}>
                        <input type="checkbox" checked={checked.includes('Yes')} onChange={() => toggleActivityCheck(f.value, 'Yes')} /> Yes
                      </label>
                      <label style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'0.75rem', color:'#475569', cursor:'pointer' }}>
                        <input type="checkbox" checked={checked.includes('No')} onChange={() => toggleActivityCheck(f.value, 'No')} /> No
                      </label>
                    </div>
                  </div>
                );
              })}
              {activityCount > 0 && (
                <button type="button" onClick={() => { setActivityChecks({}); setPage(1); }}
                  style={{ marginTop:'0.5rem', width:'100%', padding:'0.4rem', background:'#f1f5f9', border:'none', borderRadius:'6px', fontSize:'0.75rem', color:'#64748b', cursor:'pointer', fontFamily:'inherit', fontWeight:'600' }}>
                  Clear all
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{ background:'#fff', borderRadius:'12px', boxShadow:'0 1px 3px rgba(0,0,0,0.06)', border:'1px solid #f1f5f9', overflow:'hidden' }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:'3rem', color:'#94a3b8' }}>Loading schools...</div>
        ) : schools.length === 0 ? (
          <div style={{ textAlign:'center', padding:'4rem', color:'#94a3b8', display:'flex', flexDirection:'column', alignItems:'center', gap:'0.75rem' }}>
            <span style={{ fontSize:'2.5rem' }}>🏫</span>
            <div style={{ fontWeight:'600', color:'#475569' }}>No schools found</div>
            <div style={{ fontSize:'0.82rem' }}>{search ? `No results for "${search}"` : 'Try adjusting your filters'}</div>
          </div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'#f8fafc' }}>
                  {['School','Contact','Location','Board','Assigned Admin','Status','Added',''].map(h => (
                    <th key={h} style={{ textAlign:'left', padding:'0.75rem 1rem', fontSize:'0.68rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid #f1f5f9', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schools.map((school, i) => (
                  <tr key={school._id}
                    style={{ borderBottom: i < schools.length-1 ? '1px solid #f8fafc' : 'none', cursor:'pointer', transition:'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background='#fafcff'}
                    onMouseLeave={e => e.currentTarget.style.background='transparent'}
                    onClick={() => navigate(`${basePath}/schools/${school._id}`)}
                  >
                    <td style={{ padding:'0.875rem 1rem' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'0.625rem' }}>
                        <div style={{ width:'32px', height:'32px', borderRadius:'7px', background:'#e8f0f9', color: accent, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'800', fontSize:'0.9rem', flexShrink:0 }}>
                          {school.schoolName[0]}
                        </div>
                        <div>
                          <div style={{ fontSize:'0.85rem', fontWeight:'600', color:'#1e293b' }}>{school.schoolName}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding:'0.875rem 1rem' }}>
                      <div style={{ fontSize:'0.8rem', color:'#374151' }}>{school.email}</div>
                      <div style={{ fontSize:'0.72rem', color:'#94a3b8' }}>{school.phone}</div>
                    </td>
                    <td style={{ padding:'0.875rem 1rem', fontSize:'0.8rem', color:'#374151' }}>
                      <div>{school.address?.city}</div>
                      <div style={{ fontSize:'0.72rem', color:'#94a3b8' }}>{school.address?.district}, {school.address?.state}</div>
                    </td>
                    <td style={{ padding:'0.875rem 1rem' }}>
                      <div style={{ fontSize:'0.8rem', color:'#374151' }}>{school.board || '—'}</div>
                      <div style={{ fontSize:'0.72rem', color:'#94a3b8' }}>{school.schoolType || ''}</div>
                    </td>
                    <td style={{ padding:'0.875rem 1rem', fontSize:'0.8rem', color: school.assignedAdmin ? '#374151' : '#94a3b8', fontStyle: school.assignedAdmin ? 'normal' : 'italic' }}>
                      {school.assignedAdmin?.name || 'Unassigned'}
                    </td>
                    <td style={{ padding:'0.875rem 1rem' }}><StatusBadge status={school.currentStatus} size="sm" /></td>
                    <td style={{ padding:'0.875rem 1rem', fontSize:'0.75rem', color:'#94a3b8', whiteSpace:'nowrap' }}>
                      {new Date(school.createdAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}
                    </td>
                    <td style={{ padding:'0.875rem 1rem' }}>
                      <button onClick={e => { e.stopPropagation(); navigate(`${basePath}/schools/${school._id}`); }}
                        style={{ background:'#f1f5f9', border:'none', borderRadius:'6px', padding:'0.3rem 0.75rem', fontSize:'0.78rem', color: accent, fontWeight:'600', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                        Open →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0.875rem 1rem', borderTop:'1px solid #f1f5f9', background:'#fafcff' }}>
            <span style={{ fontSize:'0.78rem', color:'#94a3b8' }}>Showing {(page-1)*limit+1}–{Math.min(page*limit,total)} of {total}</span>
            <div style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
              <button disabled={page===1} onClick={() => setPage(p=>p-1)}
                style={{ padding:'0.35rem 0.75rem', border:'1px solid #e2e8f0', borderRadius:'6px', background: page===1?'#f8fafc':'#fff', color: page===1?'#94a3b8':'#374151', cursor: page===1?'not-allowed':'pointer', fontSize:'0.82rem', fontFamily:'inherit' }}>
                ← Prev
              </button>
              {Array.from({length:Math.min(totalPages,5)},(_,i)=>i+1).map(p=>(
                <button key={p} onClick={() => setPage(p)}
                  style={{ padding:'0.35rem 0.625rem', border:'1px solid #e2e8f0', borderRadius:'6px', background: page===p ? accent : '#fff', color: page===p?'#fff':'#374151', cursor:'pointer', fontSize:'0.82rem', fontFamily:'inherit', fontWeight: page===p?'700':'400', minWidth:'30px' }}>
                  {p}
                </button>
              ))}
              <button disabled={page===totalPages} onClick={() => setPage(p=>p+1)}
                style={{ padding:'0.35rem 0.75rem', border:'1px solid #e2e8f0', borderRadius:'6px', background: page===totalPages?'#f8fafc':'#fff', color: page===totalPages?'#94a3b8':'#374151', cursor: page===totalPages?'not-allowed':'pointer', fontSize:'0.82rem', fontFamily:'inherit' }}>
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add School Modal */}
      {showAddModal && (
        <AddSchoolModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => { setShowAddModal(false); fetchSchools(); }}
        />
      )}
    </Layout>
  );
};

export const SuperAdminSchools = () => <SchoolsPage role="superadmin" />;
export const AdminSchools      = () => <SchoolsPage role="admin" />;

export default SchoolsPage;
