import { useState, useEffect, useRef } from 'react';
import Layout from '../../components/layout/Layout';
import StatusBadge from '../../components/common/StatusBadge';
import HealthBadge from '../../components/common/HealthBadge';
import AnalyticsQueryPanel from '../../components/common/AnalyticsQueryPanel';
import API from '../../api/axios';
import { exportPDF, exportExcel, exportWord, exportCSV } from '../../utils/exportReport';

const ADMIN_SCORE_LABELS = {
  mauAchievement:   'MAU Achievement',
  schoolHealth:     'School Health',
  teacherCpd:       'Teacher CPD',
  adobeActivation:  'Adobe Activation',
  poeCompliance:    'POE Compliance',
  onTimeActivities: 'On-time Activities',
  crmHygiene:       'CRM Hygiene',
};

// Mirrors the DCAIS Health Score card on the School Detail page, one level up —
// this admin's own Performance Score, weighted across their portfolio.
const AdminScoreCard = ({ scorecard }) => {
  if (!scorecard || scorecard.score == null) {
    return (
      <div style={{ fontSize:'0.82rem', color:'#94a3b8', fontStyle:'italic' }}>
        {scorecard?.note || 'No score available yet.'}
      </div>
    );
  }
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem', flexWrap:'wrap', gap:'0.75rem' }}>
        <h3 style={{ margin:0, fontSize:'0.9rem', fontWeight:'700', color:'#1e293b' }}>📈 My Performance Score</h3>
        <HealthBadge health={scorecard} size="lg" />
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:'0.6rem' }}>
        {Object.entries(scorecard.components).map(([key, c]) => (
          <div key={key} style={{ padding:'0.6rem 0.75rem', background:'#f8fafc', borderRadius:'8px', border:'1px solid #f1f5f9', opacity: c.percent == null ? 0.55 : 1 }}>
            <div style={{ fontSize:'0.72rem', fontWeight:'600', color:'#475569', marginBottom:'0.3rem' }}>{ADMIN_SCORE_LABELS[key] || key} <span style={{ color:'#94a3b8' }}>({c.weight}%)</span></div>
            {c.percent != null ? (
              <>
                <div style={{ height:'6px', background:'#e2e8f0', borderRadius:'3px', overflow:'hidden', marginBottom:'0.3rem' }}>
                  <div style={{ height:'100%', width:`${c.percent}%`, background: c.percent >= 80 ? '#16a34a' : c.percent >= 60 ? '#ca8a04' : '#dc2626', borderRadius:'3px' }} />
                </div>
                <div style={{ fontSize:'0.72rem', color:'#1e293b', fontWeight:'700' }}>{c.percent}%</div>
              </>
            ) : (
              <>
                <div style={{ height:'6px', background:'#e2e8f0', borderRadius:'3px', overflow:'hidden', marginBottom:'0.3rem' }}>
                  <div style={{ height:'100%', width:'0%', background:'#dc2626', borderRadius:'3px' }} />
                </div>
                <div style={{ fontSize:'0.72rem', color:'#1e293b', fontWeight:'700' }}>0%</div>
                <div style={{ fontSize:'0.65rem', color:'#94a3b8', fontStyle:'italic', marginTop:'2px' }}>Not applicable — no records to score</div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const EXPORT_FORMATS = [
  { key: 'pdf',   label: 'PDF',   icon: '📄' },
  { key: 'excel', label: 'Excel', icon: '📊' },
  { key: 'word',  label: 'Word',  icon: '📝' },
  { key: 'csv',   label: 'CSV',   icon: '📃' },
];

const ACTIVITY_FIELDS = [
  { name: 'loiReceived',          label: 'LOI Received' },
  { name: 'dcaisConfirmation',    label: 'DCAIS Participated' },
  { name: 'studentDataReceived',  label: 'Student Data Received' },
  { name: 'teachersDataReceived', label: 'Teachers Data Received' },
  { name: 'hackathonRegistered',  label: 'Hackathon Participated' },
  { name: 'poeSubmitted',         label: 'POE Recived' },
  { name: 'cpdTrainingDone',      label: 'CPD Training Done' },
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
      display:'inline-block', padding:'3px 10px', borderRadius:'20px', fontSize:'0.72rem', fontWeight:'700',
      background: isYes ? '#d1fae5' : '#f1f5f9', color: isYes ? '#065f46' : '#64748b',
    }}>
      {value || 'No'}
    </span>
  );
};

const Check = ({ on }) => (
  <span style={{ color: on ? '#15803d' : '#cbd5e1', fontSize:'0.95rem', fontWeight:'700' }}>{on ? '✓' : '—'}</span>
);

// ── Export row builders ─────────────────────────────────────────────────────
const buildSchoolActivityRows = (schoolActivity) => schoolActivity.map(s => {
  const row = { School: s.schoolName, Status: s.currentStatus };
  ACTIVITY_FIELDS.forEach(f => { row[f.label] = s[f.name] || 'No'; });
  return row;
});

const buildStudentsExportRows = (studentsActivity) => studentsActivity.map(s => {
  const row = { School: s.schoolName, 'Student Name': s.name || '—', Class: s.class || '—', Section: s.section || '—', 'Fiscal Year': s.fiscalYear || '—' };
  QUARTERS.forEach(q => { row[`MAU ${QUARTER_LABELS[q]}`] = s.mauQuarterly?.[q] ? 'Yes' : 'No'; });
  MONTHS.forEach(m => { row[`DCAIS ${MONTH_LABELS[m]}`] = s.dcaisMonthly?.[m] ? 'Yes' : 'No'; });
  row['Annual Hackathon Participated'] = s.hackathonParticipated ? 'Yes' : 'No';
  row['AI Playground'] = s.aiPlaygroundParticipated ? 'Yes' : 'No';
  row['Skills Studio'] = s.skillsStudioParticipated ? 'Yes' : 'No';
  row['Adobe ID Created'] = s.adobeIdCreated ? 'Yes' : 'No';
  row['Adobe ID Activated'] = s.adobeIdActivated ? 'Yes' : 'No';
  row['Certificate Received'] = s.certificateReceived ? 'Yes' : 'No';
  row['Certificate Link'] = s.certificateLink || '—';
  row['Remarks'] = s.remarks || '—';
  return row;
});

const buildTeachersExportRows = (teachersActivity) => teachersActivity.map(t => {
  const row = { School: t.schoolName, 'Teacher Name': t.name || '—', 'Fiscal Year': t.fiscalYear || '—' };
  QUARTERS.forEach(q => { row[`CPD ${QUARTER_LABELS[q]}`] = t.cpdQuarterly?.[q] ? 'Yes' : 'No'; });
  MONTHS.forEach(m => { row[`DCAIS ${MONTH_LABELS[m]}`] = t.dcaisMonthly?.[m] ? 'Yes' : 'No'; });
  row['Certificate Received'] = t.certificateReceived ? 'Yes' : 'No';
  row['Certificate Link'] = t.certificateLink || '—';
  row['Remarks'] = t.remarks || '—';
  return row;
});

// ── Reusable "Download" dropdown ────────────────────────────────────────────
const DownloadMenu = ({ rows, label, reportKey }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const handleExport = (fmt) => {
    setOpen(false);
    if (rows.length === 0) return;
    if (fmt === 'pdf')   exportPDF(rows, label, reportKey);
    if (fmt === 'excel') exportExcel(rows, label, reportKey);
    if (fmt === 'word')  exportWord(rows, label, reportKey);
    if (fmt === 'csv')   exportCSV(rows, label, reportKey);
  };

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <button type="button" disabled={rows.length === 0} onClick={() => setOpen(o => !o)}
        style={{ padding:'0.45rem 0.9rem', background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:'8px', cursor: rows.length === 0 ? 'not-allowed' : 'pointer', fontSize:'0.78rem', fontWeight:'600', color:'#475569', fontFamily:'inherit', display:'flex', alignItems:'center', gap:'6px', opacity: rows.length === 0 ? 0.5 : 1 }}>
        ⬇ Download <span style={{ fontSize:'0.55rem' }}>▼</span>
      </button>
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 4px)', right:0, background:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', boxShadow:'0 8px 24px rgba(0,0,0,0.12)', zIndex:50, minWidth:'150px', padding:'4px', overflow:'hidden' }}>
          {EXPORT_FORMATS.map(f => (
            <button key={f.key} type="button" onClick={() => handleExport(f.key)}
              style={{ display:'flex', alignItems:'center', gap:'8px', width:'100%', padding:'0.55rem 0.75rem', border:'none', borderRadius:'7px', cursor:'pointer', fontFamily:'inherit', textAlign:'left', background:'transparent', color:'#374151', fontSize:'0.8rem', fontWeight:'600' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span>{f.icon}</span> {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const AdminMyActivity = () => {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    const fetchActivity = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await API.get('/admins/me/activity');
        setData(res.data);
      } catch (e) {
        setError(e.response?.data?.message || 'Failed to load your activity.');
      } finally {
        setLoading(false);
      }
    };
    fetchActivity();
  }, []);

  return (
    <Layout>
      <div style={{ marginBottom:'1.25rem' }}>
        <h2 style={{ margin:'0 0 0.2rem', fontSize:'1.1rem', fontWeight:'800', color:'#1e293b' }}>📊 My Activity</h2>
        <p style={{ margin:0, fontSize:'0.8rem', color:'#64748b' }}>
          {data?.schoolActivity ? `${data.schoolActivity.length} assigned school${data.schoolActivity.length !== 1 ? 's' : ''}` : 'Combined activity across all your assigned schools'}
        </p>
      </div>

      {/* AI Analytics Q&A + BI Dashboards — automatically scoped server-side to
          only this admin's assigned schools, never the whole platform. */}
      <AnalyticsQueryPanel />

      {loading ? (
        <div style={{ textAlign:'center', padding:'4rem', color:'#94a3b8' }}>Loading activity...</div>
      ) : error ? (
        <div style={{ textAlign:'center', padding:'3rem', color:'#991b1b', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:'12px' }}>{error}</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>

          {/* My Performance Score */}
          <div style={card}>
            <AdminScoreCard scorecard={data.scorecard} />
          </div>

          {/* School Activity Overview */}
          <div style={card}>
            <div style={sectionHeader}>
              <h3 style={sTitle}>🏫 School Activity Overview</h3>
              <DownloadMenu rows={buildSchoolActivityRows(data.schoolActivity)} label="My Activity — School Activity" reportKey="school_activity" />
            </div>
            {data.schoolActivity.length === 0 ? (
              <div style={emptyStyle}>No schools assigned to you yet</div>
            ) : (
              <div style={{ overflowX:'auto' }}>
                <table style={{ borderCollapse:'collapse', width:'100%', minWidth:'900px' }}>
                  <thead>
                    <tr>
                      <th style={th}>School</th>
                      <th style={th}>Status</th>
                      {ACTIVITY_FIELDS.map(f => <th key={f.name} style={th}>{f.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {data.schoolActivity.map(s => (
                      <tr key={s._id}>
                        <td style={{ ...td, fontWeight:'600', color:'#1e293b' }}>{s.schoolName}</td>
                        <td style={td}><StatusBadge status={s.currentStatus} size="sm" /></td>
                        {ACTIVITY_FIELDS.map(f => (
                          <td key={f.name} style={{ ...td, textAlign:'center' }}><YesNoBadge value={s[f.name]} /></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Students Activity — combined */}
          <div style={card}>
            <div style={sectionHeader}>
              <h3 style={sTitle}>🎓 Students Activity (All My Schools)</h3>
              <DownloadMenu rows={buildStudentsExportRows(data.studentsActivity)} label="My Activity — Students Activity" reportKey="students_activity" />
            </div>
            {data.studentsActivity.length === 0 ? (
              <div style={emptyStyle}>No student activity records yet</div>
            ) : (
              <div style={{ overflowX:'auto' }}>
                <table style={{ borderCollapse:'collapse', width:'100%', minWidth:'1550px' }}>
                  <thead>
                    <tr>
                      <th rowSpan={2} style={th}>School</th>
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
                    {data.studentsActivity.map((s, i) => (
                      <tr key={s._id || i}>
                        <td style={{ ...td, fontWeight:'600', color:'#1e293b' }}>{s.schoolName}</td>
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
                            ? <a href={s.certificateLink} target="_blank" rel="noreferrer" style={{ color:'#1a3a5c', fontWeight:'600' }}>View</a>
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

          {/* Teachers Activity — combined */}
          <div style={card}>
            <div style={sectionHeader}>
              <h3 style={sTitle}>👩‍🏫 Teachers Activity (All My Schools)</h3>
              <DownloadMenu rows={buildTeachersExportRows(data.teachersActivity)} label="My Activity — Teachers Activity" reportKey="teachers_activity" />
            </div>
            {data.teachersActivity.length === 0 ? (
              <div style={emptyStyle}>No teacher activity records yet</div>
            ) : (
              <div style={{ overflowX:'auto' }}>
                <table style={{ borderCollapse:'collapse', width:'100%', minWidth:'1350px' }}>
                  <thead>
                    <tr>
                      <th rowSpan={2} style={th}>School</th>
                      <th rowSpan={2} style={th}>Teacher Name</th>
                      <th rowSpan={2} style={th}>Fiscal Year</th>
                      <th colSpan={4} style={th}>CPD Training Quarterly</th>
                      <th colSpan={12} style={th}>Monthly Activity (DCAIS)</th>
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
                    {data.teachersActivity.map((t, i) => (
                      <tr key={t._id || i}>
                        <td style={{ ...td, fontWeight:'600', color:'#1e293b' }}>{t.schoolName}</td>
                        <td style={td}>{t.name || '—'}</td>
                        <td style={td}>{t.fiscalYear || '—'}</td>
                        {QUARTERS.map(q => <td key={q} style={{ ...td, textAlign:'center' }}><Check on={!!t.cpdQuarterly?.[q]} /></td>)}
                        {MONTHS.map(m => <td key={m} style={{ ...td, textAlign:'center' }}><Check on={!!t.dcaisMonthly?.[m]} /></td>)}
                        <td style={{ ...td, textAlign:'center' }}><Check on={!!t.certificateReceived} /></td>
                        <td style={td}>
                          {t.certificateLink
                            ? <a href={t.certificateLink} target="_blank" rel="noreferrer" style={{ color:'#1a3a5c', fontWeight:'600' }}>View</a>
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
const sTitle     = { margin:0, fontSize:'0.95rem', fontWeight:'700', color:'#1e293b' };
const sectionHeader = { display:'flex', justifyContent:'space-between', alignItems:'center', gap:'0.75rem', flexWrap:'wrap', marginBottom:'1rem' };
const emptyStyle = { textAlign:'center', padding:'2rem', color:'#94a3b8', fontSize:'0.85rem' };
const th    = { padding:'0.55rem 0.7rem', background:'#f8fafc', color:'#475569', fontSize:'0.7rem', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.03em', border:'1px solid #f1f5f9', whiteSpace:'nowrap' };
const thSub = { padding:'0.4rem 0.5rem', background:'#f8fafc', color:'#94a3b8', fontSize:'0.68rem', fontWeight:'700', border:'1px solid #f1f5f9', whiteSpace:'nowrap' };
const td    = { padding:'0.55rem 0.7rem', border:'1px solid #f1f5f9', fontSize:'0.8rem', color:'#374151', whiteSpace:'nowrap' };

export default AdminMyActivity;
