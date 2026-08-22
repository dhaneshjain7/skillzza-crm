import { useState, useEffect } from 'react';
import Layout from '../../components/layout/Layout';
import API from '../../api/axios';

const SchoolProfile = () => {
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
        <div style={{ textAlign:'center', padding:'4rem', color:'#94a3b8' }}>Loading your profile...</div>
      ) : !school ? (
        <div style={{ textAlign:'center', padding:'5rem', color:'#64748b' }}>
          <div style={{ fontSize:'3rem', marginBottom:'1rem' }}>🏫</div>
          <h3 style={{ color:'#1e293b' }}>No school linked to your account</h3>
          <p>Please contact your admin to link your school.</p>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:'1.25rem' }}>
          <InfoCard title="School Details" items={[
            { label:'School Name',      value: school.schoolName || '—' },
            { label:'School Phone',     value: school.phone || '—' },
            { label:'School Email',     value: school.email || '—' },
            { label:'Website',          value: school.website || 'Not provided' },
            { label:'UDISE Code',       value: school.udiseCode || 'Not provided' },
            { label:'School SPOC',      value: school.spoc || 'Not provided' },
            { label:'SPOC Phone',       value: school.spocPhone || 'Not provided' },
            { label:'SPOC Email',       value: school.spocEmail || 'Not provided' },
            { label:'CPD Training Level', value: school.cpdTrainingLevel || 'Not set' },
          ]} />

          <InfoCard title="Other Details" items={[
            { label:'Board',            value: school.board || 'Not specified' },
            { label:'School Type',      value: school.schoolType || 'Not specified' },
            { label:'Principal Name',   value: school.principal?.name || 'Not provided' },
            { label:'Principal Phone',  value: school.principal?.phone || 'Not provided' },
            { label:'Principal Email',  value: school.principal?.email || 'Not provided' },
            { label:'Total Students(6-12)', value: school.studentCount || '—' },
            { label:'Total Teachers (6-12)', value: school.staffCount || '—' },
            { label:'Address',          value: school.address?.street || '—' },
            { label:'City',             value: school.address?.city || '—' },
            { label:'State',            value: school.address?.state || '—' },
            { label:'PIN Code',         value: school.address?.pincode || '—' },
          ]} />

          <InfoCard title="Skillzza SPOC Details" items={[
            { label:'Assigned Admin',   value: school.assignedAdmin?.name || 'Not yet assigned' },
            { label:'Admin Phone',      value: school.assignedAdmin?.phone || '—' },
            { label:'Admin Email',      value: school.assignedAdmin?.email || '—' },
          ]} />
        </div>
      )}
    </Layout>
  );
};

const InfoCard = ({ title, items }) => (
  <div
    style={card}
    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 24px rgba(30,95,78,0.12)'; e.currentTarget.style.borderColor = '#1e5f4e'; }}
    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = card.boxShadow; e.currentTarget.style.borderColor = card.border.split(' ').pop(); }}
  >
    <h3 style={sTitle}>{title}</h3>
    <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
      {items.map(({ label, value }) => (
        <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'0.3rem 0', borderBottom:'1px solid #f8fafc' }}>
          <span style={{ fontSize:'0.75rem', color:'#94a3b8', fontWeight:'600' }}>{label}</span>
          <span style={{ fontSize:'0.78rem', color:'#1e293b', fontWeight:'500', textAlign:'right', maxWidth:'60%' }}>{value}</span>
        </div>
      ))}
    </div>
  </div>
);

const card  = { background:'#fff', borderRadius:'12px', padding:'1.25rem', boxShadow:'0 1px 3px rgba(0,0,0,0.06)', border:'1.5px solid #e2e8f0', transition:'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease', cursor:'default' };
const sTitle= { margin:'0 0 1rem', fontSize:'0.9rem', fontWeight:'700', color:'#1e293b', paddingBottom:'0.6rem', borderBottom:'2px solid #e8f5f1' };

export default SchoolProfile;
