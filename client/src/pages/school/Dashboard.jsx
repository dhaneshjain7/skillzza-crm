import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import Layout from '../../components/layout/Layout';
import StatusBadge from '../../components/common/StatusBadge';
import API from '../../api/axios';

const LIFECYCLE = [
  { stage: 'School Created',      icon: '🏫', key: 'New' },
  { stage: 'Assigned to Admin',   icon: '👤', key: 'Contacted' },
  { stage: 'Contact Initiated',   icon: '📞', key: 'Contacted' },
  { stage: 'Documents Requested', icon: '📋', key: 'Documents Pending' },
  { stage: 'Documents Uploaded',  icon: '📁', key: 'Documents Received' },
  { stage: 'Verification',        icon: '🔍', key: 'Verification' },
  { stage: 'Approval / Rejection',icon: '⚖️', key: 'Approved' },
  { stage: 'Completed',           icon: '🎓', key: 'Completed' },
  { stage: 'Archived',            icon: '🗄️', key: 'Archived' },
];

const STATUS_ORDER = ['New','Contacted','Documents Pending','Documents Received','Verification','Approved','Completed','Archived'];

const SchoolDashboard = () => {
  const { user }   = useAuth();
  const [school,   setSchool]  = useState(null);
  const [history,  setHistory] = useState([]);
  const [loading,  setLoading] = useState(true);
  const [editMode, setEditMode]= useState(false);
  const [saving,   setSaving]  = useState(false);
  const [saveMsg,  setSaveMsg] = useState('');
  const [form,     setForm]    = useState({});

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const res = await API.get('/schools?limit=1');
        const s   = res.data.schools?.[0];
        if (s) {
          setSchool(s);
          initForm(s);
          const histRes = await API.get(`/schools/${s._id}/status-history`);
          setHistory(histRes.data.history || []);
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetchAll();
  }, []);

  const initForm = (s) => {
    setForm({
      registrationNumber:  s.registrationNumber  || '',
      udiseCode:           s.udiseCode            || '',
      schoolName:          s.schoolName           || '',
      email:               s.email                || '',
      phone:               s.phone                || '',
      altPhone:            s.altPhone             || '',
      website:             s.website              || '',
      board:               s.board                || '',
      schoolType:          s.schoolType           || '',
      establishedYear:     s.establishedYear      || '',
      studentCount:        s.studentCount         || '',
      staffCount:          s.staffCount           || '',
      'address.street':    s.address?.street      || '',
      'address.city':      s.address?.city        || '',
      'address.district':  s.address?.district    || '',
      'address.state':     s.address?.state       || '',
      'address.pincode':   s.address?.pincode     || '',
      'principal.name':    s.principal?.name      || '',
      'principal.email':   s.principal?.email     || '',
      'principal.phone':   s.principal?.phone     || '',
      'management.name':   s.management?.name     || '',
      'management.designation': s.management?.designation || '',
      'management.phone':  s.management?.phone    || '',
    });
  };

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveMsg('');
    try {
      const payload = {
        registrationNumber: form.registrationNumber,
        udiseCode:          form.udiseCode,
        schoolName:         form.schoolName,
        email:              form.email,
        phone:              form.phone,
        altPhone:           form.altPhone,
        website:            form.website,
        board:              form.board,
        schoolType:         form.schoolType,
        establishedYear:    form.establishedYear ? Number(form.establishedYear) : undefined,
        studentCount:       form.studentCount    ? Number(form.studentCount)    : undefined,
        staffCount:         form.staffCount      ? Number(form.staffCount)      : undefined,
        address: {
          street:   form['address.street'],
          city:     form['address.city'],
          district: form['address.district'],
          state:    form['address.state'],
          pincode:  form['address.pincode'],
        },
        principal: {
          name:  form['principal.name'],
          email: form['principal.email'],
          phone: form['principal.phone'],
        },
        management: {
          name:        form['management.name'],
          designation: form['management.designation'],
          phone:       form['management.phone'],
        },
      };

      const res = await API.put(`/schools/${school._id}`, payload);
      setSchool(res.data.school);
      initForm(res.data.school);
      setEditMode(false);
      setSaveMsg('✅ Profile updated successfully!');
      setTimeout(() => setSaveMsg(''), 4000);
    } catch (e) {
      setSaveMsg('❌ ' + (e.response?.data?.message || 'Update failed. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const calcCompletion = (s) => {
    if (!s) return 0;
    const fields = [s.schoolName, s.email, s.phone, s.address?.city, s.address?.state, s.principal?.name, s.board, s.schoolType];
    return Math.round((fields.filter(Boolean).length / fields.length) * 100);
  };

  const currentIdx = STATUS_ORDER.indexOf(school?.currentStatus);
  const completion = calcCompletion(school);

  // Donut = pipeline progress: 100% at Completed (and beyond, e.g. Archived).
  // Rejected sits at the same stage as Approved ("Approval / Rejection").
  const COMPLETED_IDX = STATUS_ORDER.indexOf('Completed');
  const progressIdx   = school?.currentStatus === 'Rejected'
    ? STATUS_ORDER.indexOf('Approved')
    : currentIdx;
  const progress = progressIdx < 0 ? 0 : Math.min(100, Math.round(((progressIdx + 1) / (COMPLETED_IDX + 1)) * 100));

  return (
    <Layout>
      {loading ? (
        <div style={{ textAlign:'center', padding:'4rem', color:'#94a3b8' }}>Loading your dashboard...</div>
      ) : !school ? (
        <div style={{ textAlign:'center', padding:'5rem', color:'#64748b' }}>
          <div style={{ fontSize:'3rem', marginBottom:'1rem' }}>🏫</div>
          <h3 style={{ color:'#1e293b' }}>No school linked to your account</h3>
          <p>Please contact your admin to link your school.</p>
        </div>
      ) : (
        <>
          {/* Save message */}
          {saveMsg && (
            <div style={{ marginBottom:'1rem', padding:'0.75rem 1rem', background: saveMsg.startsWith('✅') ? '#d1fae5' : '#fee2e2', border:`1px solid ${saveMsg.startsWith('✅') ? '#6ee7b7' : '#fca5a5'}`, borderRadius:'8px', fontSize:'0.875rem', fontWeight:'600', color: saveMsg.startsWith('✅') ? '#065f46' : '#991b1b' }}>
              {saveMsg}
            </div>
          )}

          {/* School Identity Card */}
          <div style={{ background:'linear-gradient(135deg,#1a3d30,#1e5f4e)', borderRadius:'14px', padding:'1.5rem', marginBottom:'1.5rem', color:'#fff' }}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:'1rem', flexWrap:'wrap' }}>
              <div style={{ width:'56px', height:'56px', borderRadius:'12px', background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.75rem', flexShrink:0 }}>🏫</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:'0.7rem', color:'rgba(255,255,255,0.6)', fontWeight:'600', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'0.3rem' }}>Your School</div>
                <h2 style={{ margin:'0 0 0.3rem', fontSize:'1.3rem', fontWeight:'800' }}>{school.schoolName}</h2>
                <div style={{ fontSize:'0.82rem', color:'rgba(255,255,255,0.7)' }}>
                  {[school.board, school.schoolType, school.address?.city, school.address?.state].filter(Boolean).join(' · ')}
                </div>
                <div style={{ marginTop:'0.75rem', display:'flex', gap:'1rem', flexWrap:'wrap', alignItems:'center' }}>
                  <div>
                    <div style={{ fontSize:'0.65rem', color:'rgba(255,255,255,0.5)', textTransform:'uppercase' }}>Status</div>
                    <StatusBadge status={school.currentStatus} size="lg" />
                  </div>
                  <div>
                    <div style={{ fontSize:'0.65rem', color:'rgba(255,255,255,0.5)', textTransform:'uppercase' }}>Email</div>
                    <div style={{ fontSize:'0.82rem', fontWeight:'600' }}>{school.email}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:'0.65rem', color:'rgba(255,255,255,0.5)', textTransform:'uppercase' }}>Phone</div>
                    <div style={{ fontSize:'0.82rem', fontWeight:'600' }}>{school.phone}</div>
                  </div>
                </div>
              </div>
              {/* Profile completion + Edit */}
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'0.75rem', flexShrink:0 }}>
                <svg width="72" height="72" viewBox="0 0 72 72">
                  <circle cx="36" cy="36" r="28" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="8" />
                  {progress >= 100 ? (
                    <circle cx="36" cy="36" r="28" fill="none" stroke="#fff" strokeWidth="8" />
                  ) : (
                    <circle cx="36" cy="36" r="28" fill="none" stroke="#fff" strokeWidth="8"
                      strokeDasharray={`${(progress/100)*175.9} 175.9`} strokeDashoffset="43.98" strokeLinecap="round" />
                  )}
                  <text x="36" y="40" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff">{progress}%</text>
                </svg>
                <div style={{ fontSize:'0.65rem', color:'rgba(255,255,255,0.6)' }}>Progress</div>
                <button onClick={() => { setEditMode(e => !e); initForm(school); }}
                  style={{ padding:'0.45rem 1rem', background: editMode ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.2)', border:'1px solid rgba(255,255,255,0.4)', borderRadius:'8px', color:'#fff', cursor:'pointer', fontSize:'0.78rem', fontWeight:'600', fontFamily:'inherit' }}>
                  {editMode ? '✕ Cancel' : '✏️ Edit Profile'}
                </button>
              </div>
            </div>
          </div>

          {/* ── EDIT FORM ── */}
          {editMode && (
            <div style={{ ...card, marginBottom:'1.5rem', border:'2px solid #1e5f4e' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem' }}>
                <h3 style={{ margin:0, fontSize:'1rem', fontWeight:'700', color:'#1e293b' }}>✏️ Edit School Profile</h3>
                <span style={{ fontSize:'0.75rem', color:'#64748b' }}>Fields marked * are required</span>
              </div>

              <form onSubmit={handleSave}>
                {/* Basic Details */}
                <Section title="Basic Details">
                  <Row>
                    <Field label="School Name *"         name="schoolName"         value={form.schoolName}         onChange={handleChange} required />
                    <Field label="Registration Number"   name="registrationNumber" value={form.registrationNumber} onChange={handleChange} />
                  </Row>
                  <Row>
                    <Field label="UDISE Code"            name="udiseCode"          value={form.udiseCode}          onChange={handleChange} />
                    <div />
                  </Row>
                  <Row>
                    <Field label="Email *"               name="email"              value={form.email}              onChange={handleChange} required type="email" />
                    <Field label="Phone *"               name="phone"              value={form.phone}              onChange={handleChange} required />
                  </Row>
                  <Row>
                    <Field label="Alt Phone"             name="altPhone"           value={form.altPhone}           onChange={handleChange} />
                    <Field label="Website"               name="website"            value={form.website}            onChange={handleChange} />
                  </Row>
                  <Row>
                    <SelectField label="Board"           name="board"              value={form.board}              onChange={handleChange}
                      options={['CBSE','ICSE','IB','State Board','Other']} />
                    <SelectField label="School Type"     name="schoolType"         value={form.schoolType}         onChange={handleChange}
                      options={['Primary','Secondary','Higher Secondary','College','Other']} />
                  </Row>
                  <Row>
                    <Field label="Established Year"      name="establishedYear"    value={form.establishedYear}    onChange={handleChange} type="number" />
                    <Field label="Student Count (6-12)"  name="studentCount"       value={form.studentCount}       onChange={handleChange} type="number" />
                  </Row>
                  <Row>
                    <Field label="Staff Count (6-12)"    name="staffCount"         value={form.staffCount}         onChange={handleChange} type="number" />
                    <div /> {/* empty cell */}
                  </Row>
                </Section>

                {/* Address */}
                <Section title="Address">
                  <Field label="Street Address" name="address.street"   value={form['address.street']}   onChange={handleChange} fullWidth />
                  <Row>
                    <Field label="City *"        name="address.city"    value={form['address.city']}     onChange={handleChange} required />
                    <Field label="District"      name="address.district"value={form['address.district']} onChange={handleChange} />
                  </Row>
                  <Row>
                    <Field label="State *"       name="address.state"   value={form['address.state']}    onChange={handleChange} required />
                    <Field label="Pincode"       name="address.pincode" value={form['address.pincode']}  onChange={handleChange} />
                  </Row>
                </Section>

                {/* Principal */}
                <Section title="Principal Information">
                  <Row>
                    <Field label="Principal Name"  name="principal.name"  value={form['principal.name']}  onChange={handleChange} />
                    <Field label="Principal Email" name="principal.email" value={form['principal.email']} onChange={handleChange} type="email" />
                  </Row>
                  <Field label="Principal Phone"   name="principal.phone" value={form['principal.phone']} onChange={handleChange} fullWidth />
                </Section>

                {/* Management */}
                <Section title="Management Information">
                  <Row>
                    <Field label="Management Name"  name="management.name"        value={form['management.name']}        onChange={handleChange} />
                    <Field label="Designation"      name="management.designation" value={form['management.designation']} onChange={handleChange} />
                  </Row>
                  <Field label="Management Phone"   name="management.phone"       value={form['management.phone']}       onChange={handleChange} fullWidth />
                </Section>

                {/* Submit */}
                <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', paddingTop:'1rem', borderTop:'1px solid #f1f5f9' }}>
                  <button type="button" onClick={() => { setEditMode(false); initForm(school); }}
                    style={{ padding:'0.65rem 1.5rem', background:'#f1f5f9', border:'none', borderRadius:'8px', cursor:'pointer', fontFamily:'inherit', fontWeight:'600', color:'#475569', fontSize:'0.875rem' }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={saving}
                    style={{ padding:'0.65rem 1.75rem', background: saving ? '#94a3b8' : '#1e5f4e', border:'none', borderRadius:'8px', cursor: saving ? 'not-allowed' : 'pointer', fontFamily:'inherit', fontWeight:'700', color:'#fff', fontSize:'0.875rem' }}>
                    {saving ? 'Saving...' : '✓ Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Row: Timeline + Info */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1.25rem', marginBottom:'1.25rem' }}>

            {/* Application Timeline */}
            <div style={card}>
              <h3 style={sTitle}>Application Timeline</h3>
              <div style={{ position:'relative', paddingLeft:'12px' }}>
                <div style={{ position:'absolute', left:'19px', top:'8px', bottom:'8px', width:'2px', background:'#f1f5f9', zIndex:0 }} />
                {LIFECYCLE.map((step, i) => {
                  const stepIdx   = STATUS_ORDER.indexOf(step.key);
                  const done      = stepIdx >= 0 && stepIdx < currentIdx;
                  const isCurrent = school.currentStatus === step.key;
                  return (
                    <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:'0.875rem', marginBottom:'0.875rem', position:'relative', zIndex:1 }}>
                      <div style={{ width:'22px', height:'22px', borderRadius:'50%', flexShrink:0, background: done ? '#1e5f4e' : isCurrent ? '#fff' : '#f1f5f9', border: isCurrent ? '3px solid #1e5f4e' : done ? 'none' : '2px solid #e2e8f0', display:'flex', alignItems:'center', justifyContent:'center', fontSize: done ? '0.6rem' : '0.55rem', boxShadow: isCurrent ? '0 0 0 3px rgba(30,95,78,0.15)' : 'none' }}>
                        {done ? '✓' : step.icon}
                      </div>
                      <div style={{ paddingTop:'2px', flex:1 }}>
                        <div style={{ fontSize:'0.82rem', fontWeight: isCurrent ? '700' : '500', color: done ? '#475569' : isCurrent ? '#1e5f4e' : '#94a3b8', display:'flex', alignItems:'center', gap:'0.5rem' }}>
                          {step.stage}
                          {isCurrent && <span style={{ fontSize:'0.6rem', background:'#1e5f4e', color:'#fff', padding:'1px 6px', borderRadius:'10px', fontWeight:'700' }}>CURRENT</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right column */}
            <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>
              <div style={card}>
                <h3 style={sTitle}>School Information</h3>
                <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                  {[
                    { label:'Registration No.', value: school.registrationNumber || 'Not provided' },
                    { label:'UDISE Code',       value: school.udiseCode || 'Not provided' },
                    { label:'Board',            value: school.board || 'Not specified' },
                    { label:'Type',             value: school.schoolType || 'Not specified' },
                    { label:'Est. Year',        value: school.establishedYear || '—' },
                    { label:'Students (6-12)',  value: school.studentCount || '—' },
                    { label:'Staff (6-12)',     value: school.staffCount || '—' },
                    { label:'Principal',        value: school.principal?.name || 'Not provided' },
                    { label:'Principal Email',  value: school.principal?.email || '—' },
                    { label:'City',             value: school.address?.city || '—' },
                    { label:'State',            value: school.address?.state || '—' },
                    { label:'Pincode',          value: school.address?.pincode || '—' },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'0.3rem 0', borderBottom:'1px solid #f8fafc' }}>
                      <span style={{ fontSize:'0.75rem', color:'#94a3b8', fontWeight:'600' }}>{label}</span>
                      <span style={{ fontSize:'0.78rem', color:'#1e293b', fontWeight:'500', textAlign:'right', maxWidth:'60%' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={card}>
                <h3 style={sTitle}>Pending Actions</h3>
                <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                  {school.currentStatus === 'Documents Pending' && (
                    <Action icon="📄" text="Upload required documents" color="#9a3412" bg="#fff8f0" border="#fed7aa" />
                  )}
                  {completion < 100 && (
                    <Action icon="✏️" text={`Complete your profile (${completion}% done) — click Edit Profile`} color="#1d4ed8" bg="#eff6ff" border="#bfdbfe" />
                  )}
                  {school.currentStatus === 'New' && (
                    <Action icon="⏳" text="Waiting for admin to contact you" color="#92400e" bg="#fffbeb" border="#fde68a" />
                  )}
                  {['Approved','Completed'].includes(school.currentStatus) && completion >= 100 && (
                    <div style={{ textAlign:'center', padding:'1rem', color:'#065f46', fontSize:'0.85rem', fontWeight:'600' }}>
                      🎉 No pending actions — all good!
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Status History */}
          <div style={card}>
            <h3 style={sTitle}>Status History</h3>
            {history.length === 0 ? (
              <div style={{ textAlign:'center', padding:'1.5rem', color:'#94a3b8', fontSize:'0.85rem' }}>No status changes recorded yet</div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column' }}>
                {history.map((h, i) => (
                  <div key={h._id} style={{ display:'flex', gap:'1rem', paddingBottom:'1rem', position:'relative' }}>
                    {i < history.length - 1 && <div style={{ position:'absolute', left:'7px', top:'20px', bottom:0, width:'2px', background:'#f1f5f9' }} />}
                    <div style={{ width:'16px', height:'16px', borderRadius:'50%', background:'#1e5f4e', flexShrink:0, marginTop:'3px', zIndex:1 }} />
                    <div style={{ flex:1, paddingBottom:'1rem', borderBottom: i < history.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'4px', flexWrap:'wrap' }}>
                        {h.oldStatus
                          ? <><StatusBadge status={h.oldStatus} size="sm" /><span style={{ color:'#94a3b8', fontSize:'0.8rem' }}>→</span><StatusBadge status={h.newStatus} size="sm" /></>
                          : <><span style={{ fontSize:'0.75rem', color:'#94a3b8' }}>Started as</span><StatusBadge status={h.newStatus} size="sm" /></>
                        }
                      </div>
                      {h.remarks && <div style={{ fontSize:'0.78rem', color:'#64748b', fontStyle:'italic', marginBottom:'4px' }}>"{h.remarks}"</div>}
                      <div style={{ fontSize:'0.7rem', color:'#94a3b8' }}>
                        {h.updatedBy?.name} · {new Date(h.createdAt).toLocaleString('en-IN', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
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

// ── Form Components ───────────────────────────────────────────────────────────
const Section = ({ title, children }) => (
  <div style={{ marginBottom:'1.25rem' }}>
    <div style={{ fontSize:'0.8rem', fontWeight:'700', color:'#1e3a5f', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.75rem', paddingBottom:'0.5rem', borderBottom:'2px solid #e8f5f1' }}>
      {title}
    </div>
    {children}
  </div>
);

const Row = ({ children }) => (
  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem', marginBottom:'0.75rem' }}>
    {children}
  </div>
);

const Field = ({ label, name, value, onChange, required, type = 'text', fullWidth }) => (
  <div style={{ display:'flex', flexDirection:'column', gap:'0.3rem', marginBottom: fullWidth ? '0.75rem' : 0 }}>
    <label style={{ fontSize:'0.75rem', fontWeight:'600', color:'#374151' }}>{label}</label>
    <input type={type} name={name} value={value} onChange={onChange} required={required}
      style={{ padding:'0.55rem 0.75rem', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'0.875rem', outline:'none', fontFamily:'inherit', color:'#1e293b', width:'100%', boxSizing:'border-box' }} />
  </div>
);

const SelectField = ({ label, name, value, onChange, options }) => (
  <div style={{ display:'flex', flexDirection:'column', gap:'0.3rem' }}>
    <label style={{ fontSize:'0.75rem', fontWeight:'600', color:'#374151' }}>{label}</label>
    <select name={name} value={value} onChange={onChange}
      style={{ padding:'0.55rem 0.75rem', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'0.875rem', outline:'none', fontFamily:'inherit', color:'#1e293b', background:'#fff' }}>
      <option value="">Select...</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

const Action = ({ icon, text, color, bg, border }) => (
  <div style={{ display:'flex', alignItems:'center', gap:'0.625rem', padding:'0.625rem 0.875rem', background:bg, border:`1px solid ${border}`, borderRadius:'8px' }}>
    <span style={{ fontSize:'1rem' }}>{icon}</span>
    <span style={{ fontSize:'0.8rem', fontWeight:'600', color }}>{text}</span>
  </div>
);

const card  = { background:'#fff', borderRadius:'12px', padding:'1.25rem', boxShadow:'0 1px 3px rgba(0,0,0,0.06)', border:'1px solid #f1f5f9' };
const sTitle= { margin:'0 0 1rem', fontSize:'0.9rem', fontWeight:'700', color:'#1e293b' };

export default SchoolDashboard;
