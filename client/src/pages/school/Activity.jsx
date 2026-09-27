import { useState, useEffect } from 'react';
import Layout from '../../components/layout/Layout';
import API from '../../api/axios';

const ACTIVITY_FIELDS = [
  { name: 'loiReceived',          label: 'LOI Received' },
  { name: 'dcaisConfirmation',    label: 'DCAIS Participated' },
  { name: 'studentDataReceived',  label: 'Student Data Received' },
  { name: 'teachersDataReceived', label: 'Teachers Data Received' },
  { name: 'hackathonRegistered',  label: 'Hackathon Participated' },
  { name: 'poeSubmitted',         label: 'POE Recived' },
  { name: 'aiPlaygroundDone',     label: 'AI Playground' },
  { name: 'skillsStudioDone',     label: 'Skills Studio' },
];

const QUARTERS = ['q1', 'q2', 'q3', 'q4'];
const QUARTER_LABELS = { q1: 'Q1', q2: 'Q2', q3: 'Q3', q4: 'Q4' };
const MONTHS = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']; // fiscal year order (Apr-Mar)
const MONTH_LABELS = { jan:'Jan',feb:'Feb',mar:'Mar',apr:'Apr',may:'May',jun:'Jun',jul:'Jul',aug:'Aug',sep:'Sep',oct:'Oct',nov:'Nov',dec:'Dec' };

const YesNoBadge = ({ value }) => {
  const isYes = value === 'Yes';
  return (
    <span style={{
      display:'inline-block', padding:'3px 10px', borderRadius:'20px', fontSize:'0.75rem', fontWeight:'700',
      background: isYes ? '#d1fae5' : '#f1f5f9', color: isYes ? '#065f46' : '#64748b',
    }}>
      {value || 'No'}
    </span>
  );
};

const Check = ({ on }) => (
  <span style={{ color: on ? '#15803d' : '#cbd5e1', fontSize:'0.95rem', fontWeight:'700' }}>{on ? '✓' : '—'}</span>
);

const SchoolActivity = () => {
  const [school,  setSchool]  = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSchool = async () => {
      setLoading(true);
      try {
        const res = await API.get('/schools?limit=1');
        setSchool(res.data.schools?.[0] || null);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetchSchool();
  }, []);

  return (
    <Layout>
      {loading ? (
        <div style={{ textAlign:'center', padding:'4rem', color:'#94a3b8' }}>Loading activity...</div>
      ) : !school ? (
        <div style={{ textAlign:'center', padding:'5rem', color:'#64748b' }}>
          <div style={{ fontSize:'3rem', marginBottom:'1rem' }}>🏫</div>
          <h3 style={{ color:'#1e293b' }}>No school linked to your account</h3>
          <p>Please contact your admin to link your school.</p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>

          {/* Activity */}
          <div style={card}>
            <h3 style={sTitle}>📌 Activity</h3>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:'0.75rem' }}>
              {ACTIVITY_FIELDS.map(f => (
                <div key={f.name} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0.65rem 0.875rem', background:'#f8fafc', borderRadius:'8px', border:'1px solid #f1f5f9' }}>
                  <span style={{ fontSize:'0.8rem', color:'#475569', fontWeight:'600' }}>{f.label}</span>
                  <YesNoBadge value={school[f.name]} />
                </div>
              ))}
            </div>
          </div>

          {/* Students Activity */}
          <div style={card}>
            <h3 style={sTitle}>🎓 Students Activity</h3>
            {(school.studentsActivity || []).length === 0 ? (
              <div style={emptyStyle}>No student activity records yet</div>
            ) : (
              <div style={{ overflowX:'auto' }}>
                <table style={{ borderCollapse:'collapse', width:'100%', minWidth:'1400px' }}>
                  <thead>
                    <tr>
                      <th rowSpan={2} style={th}>Student Name</th>
                      <th rowSpan={2} style={th}>Class</th>
                      <th rowSpan={2} style={th}>Section</th>
                      <th rowSpan={2} style={th}>Fiscal Year</th>
                      <th colSpan={4} style={th}>Quaterly Activity (MAU)</th>
                      <th colSpan={12} style={th}>Monthly Activity (DCAIS)</th>
                      <th rowSpan={2} style={th}>Annual Hackathon Participated</th>
                      <th rowSpan={2} style={th}>AI Playground</th>
                      <th rowSpan={2} style={th}>Skills Studio</th>
                      <th rowSpan={2} style={th}>Adobe ID Created</th>
                      <th rowSpan={2} style={th}>Adobe ID Activated</th>
                      <th rowSpan={2} style={th}>Certificate Received</th>
                      <th rowSpan={2} style={th}>Certificate Link</th>
                      <th rowSpan={2} style={th}>Remarks</th>
                    </tr>
                    <tr>
                      {QUARTERS.map(q => <th key={q} style={thSub}>{QUARTER_LABELS[q]}</th>)}
                      {MONTHS.map(m => <th key={m} style={thSub}>{MONTH_LABELS[m]}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {school.studentsActivity.map((s, i) => (
                      <tr key={s._id || i}>
                        <td style={td}>{s.name || '—'}</td>
                        <td style={td}>{s.class || '—'}</td>
                        <td style={td}>{s.section || '—'}</td>
                        <td style={td}>{s.fiscalYear || '—'}</td>
                        {QUARTERS.map(q => <td key={q} style={{ ...td, textAlign:'center' }}><Check on={!!s.mauQuarterly?.[q]} /></td>)}
                        {MONTHS.map(m => <td key={m} style={{ ...td, textAlign:'center' }}><Check on={!!s.dcaisMonthly?.[m]} /></td>)}
                        <td style={{ ...td, textAlign:'center' }}><Check on={!!s.hackathonParticipated} /></td>
                        <td style={{ ...td, textAlign:'center' }}><Check on={!!s.aiPlaygroundParticipated} /></td>
                        <td style={{ ...td, textAlign:'center' }}><Check on={!!s.skillsStudioParticipated} /></td>
                        <td style={{ ...td, textAlign:'center' }}><Check on={!!s.adobeIdCreated} /></td>
                        <td style={{ ...td, textAlign:'center' }}><Check on={!!s.adobeIdActivated} /></td>
                        <td style={{ ...td, textAlign:'center' }}><Check on={!!s.certificateReceived} /></td>
                        <td style={td}>
                          {s.certificateLink
                            ? <a href={s.certificateLink} target="_blank" rel="noreferrer" style={{ color:'#1e5f4e', fontWeight:'600' }}>View</a>
                            : '—'}
                        </td>
                        <td style={td}>{s.remarks || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Teachers Activity */}
          <div style={card}>
            <h3 style={sTitle}>👩‍🏫 Teachers Activity</h3>
            {(school.teachersActivity || []).length === 0 ? (
              <div style={emptyStyle}>No teacher activity records yet</div>
            ) : (
              <div style={{ overflowX:'auto' }}>
                <table style={{ borderCollapse:'collapse', width:'100%', minWidth:'1200px' }}>
                  <thead>
                    <tr>
                      <th rowSpan={2} style={th}>Teacher Name</th>
                      <th rowSpan={2} style={th}>Fiscal Year</th>
                      <th colSpan={4} style={th}>CPD Training Quarterly</th>
                      <th colSpan={12} style={th}>Monthly Activity (DCAIS)</th>
                      <th rowSpan={2} style={th}>Adobe ID Created</th>
                      <th rowSpan={2} style={th}>Adobe ID Activated</th>
                      <th rowSpan={2} style={th}>Certificate Received</th>
                      <th rowSpan={2} style={th}>Certificate Link</th>
                      <th rowSpan={2} style={th}>Remarks</th>
                    </tr>
                    <tr>
                      {QUARTERS.map(q => <th key={q} style={thSub}>{QUARTER_LABELS[q]}</th>)}
                      {MONTHS.map(m => <th key={m} style={thSub}>{MONTH_LABELS[m]}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {school.teachersActivity.map((t, i) => (
                      <tr key={t._id || i}>
                        <td style={td}>{t.name || '—'}</td>
                        <td style={td}>{t.fiscalYear || '—'}</td>
                        {QUARTERS.map(q => <td key={q} style={{ ...td, textAlign:'center' }}><Check on={!!t.cpdQuarterly?.[q]} /></td>)}
                        {MONTHS.map(m => <td key={m} style={{ ...td, textAlign:'center' }}><Check on={!!t.dcaisMonthly?.[m]} /></td>)}
                        <td style={{ ...td, textAlign:'center' }}><Check on={!!t.adobeIdCreated} /></td>
                        <td style={{ ...td, textAlign:'center' }}><Check on={!!t.adobeIdActivated} /></td>
                        <td style={{ ...td, textAlign:'center' }}><Check on={!!t.certificateReceived} /></td>
                        <td style={td}>
                          {t.certificateLink
                            ? <a href={t.certificateLink} target="_blank" rel="noreferrer" style={{ color:'#1e5f4e', fontWeight:'600' }}>View</a>
                            : '—'}
                        </td>
                        <td style={td}>{t.remarks || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
};

const card       = { background:'#fff', borderRadius:'12px', padding:'1.25rem', boxShadow:'0 1px 3px rgba(0,0,0,0.06)', border:'1px solid #f1f5f9' };
const sTitle      = { margin:'0 0 1rem', fontSize:'0.95rem', fontWeight:'700', color:'#1e293b' };
const emptyStyle  = { textAlign:'center', padding:'2rem', color:'#94a3b8', fontSize:'0.85rem' };
const th    = { padding:'0.55rem 0.7rem', background:'#f8fafc', color:'#475569', fontSize:'0.7rem', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.03em', border:'1px solid #f1f5f9', whiteSpace:'nowrap' };
const thSub = { padding:'0.4rem 0.5rem', background:'#f8fafc', color:'#94a3b8', fontSize:'0.68rem', fontWeight:'700', border:'1px solid #f1f5f9', whiteSpace:'nowrap' };
const td    = { padding:'0.55rem 0.7rem', border:'1px solid #f1f5f9', fontSize:'0.8rem', color:'#374151', whiteSpace:'nowrap' };

export default SchoolActivity;
