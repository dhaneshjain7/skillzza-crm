import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Layout from '../../components/layout/Layout';
import StatusBadge from '../../components/common/StatusBadge';
import API from '../../api/axios';

const STATUSES = ['New','Contacted','Documents Pending','Documents Received','Verification','Approved','Rejected','Completed','Archived'];

const TABS = [
  { key: 'overview',  label: '📋 Overview' },
  { key: 'edit',      label: '✏️ Edit Profile' },
  { key: 'status',    label: '🔄 Status' },
  { key: 'notes',     label: '📝 Notes' },
  { key: 'history',   label: '📜 History' },
  { key: 'audit',     label: '🔍 Audit Trail' },
];

const SchoolDetail = () => {
  const { schoolId } = useParams();
  const navigate     = useNavigate();
  const { user }     = useAuth();
  const [school,  setSchool]  = useState(null);
  const [history, setHistory] = useState([]);
  const [audit,   setAudit]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState('overview');
  const [admins,  setAdmins]  = useState([]);
  const [reassigning, setReassigning] = useState(false);
  const [selectedAdminId, setSelectedAdminId] = useState('');

  // Portal access state
  const [showCreateLogin, setShowCreateLogin] = useState(false);
  const [newLoginEmail, setNewLoginEmail]     = useState('');
  const [newLoginPassword, setNewLoginPassword] = useState('');
  const [creatingLogin, setCreatingLogin]     = useState(false);

  const [showResetPw, setShowResetPw]         = useState(false);
  const [resetPassword, setResetPassword]     = useState('');
  const [resetting, setResetting]             = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState('');

  // Edit form state
  const [form, setForm] = useState({});

  // Status update state
  const [statusForm, setStatusForm] = useState({ newStatus: '', remarks: '', reason: '' });

  // Note state
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    fetchAll();
  }, [schoolId]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [schoolRes, histRes, auditRes] = await Promise.all([
        API.get(`/schools/${schoolId}`),
        API.get(`/schools/${schoolId}/status-history`),
        API.get(`/schools/${schoolId}/audit-trail?limit=20`),
      ]);
      setSchool(schoolRes.data.school);
      initForm(schoolRes.data.school);
      setHistory(histRes.data.history || []);
      setAudit(auditRes.data.logs || []);

      // SuperAdmin can reassign — fetch admin list
      if (user?.role === 'superadmin') {
        try {
          const adminsRes = await API.get('/admins?limit=100');
          setAdmins(adminsRes.data.admins || []);
        } catch (e) { /* silent */ }
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleReassignAdmin = async () => {
    if (!selectedAdminId) return;
    setReassigning(true);
    try {
      await API.put(`/schools/${schoolId}/assign-admin`, { adminId: selectedAdminId });
      await fetchAll();
      setSelectedAdminId('');
      showMsg('✅ Admin assigned successfully!');
    } catch (e) {
      showMsg('❌ ' + (e.response?.data?.message || 'Failed to assign admin'));
    } finally {
      setReassigning(false);
    }
  };

  const handleCreateLogin = async (e) => {
    e.preventDefault();
    if (!newLoginEmail || !newLoginPassword) return;
    setCreatingLogin(true);
    try {
      await API.post(`/schools/${schoolId}/create-login`, { loginEmail: newLoginEmail, loginPassword: newLoginPassword });
      await fetchAll();
      setShowCreateLogin(false);
      showMsg(`✅ Portal login created: ${newLoginEmail}`);
      setNewLoginEmail('');
      setNewLoginPassword('');
    } catch (e) {
      showMsg('❌ ' + (e.response?.data?.message || 'Failed to create login'));
    } finally {
      setCreatingLogin(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!resetPassword || resetPassword.length < 6) {
      showMsg('❌ Password must be at least 6 characters');
      return;
    }
    setResetting(true);
    try {
      await API.put(`/schools/${schoolId}/reset-login-password`, { newPassword: resetPassword });
      showMsg('✅ Password reset successfully!');
      setShowResetPw(false);
      setResetPassword('');
    } catch (e) {
      showMsg('❌ ' + (e.response?.data?.message || 'Failed to reset password'));
    } finally {
      setResetting(false);
    }
  };

  const initForm = (s) => {
    setForm({
      schoolName:         s.schoolName         || '',
      registrationNumber: s.registrationNumber || '',
      udiseCode:          s.udiseCode          || '',
      email:              s.email              || '',
      phone:              s.phone              || '',
      altPhone:           s.altPhone           || '',
      website:            s.website            || '',
      board:              s.board              || '',
      schoolType:         s.schoolType         || '',
      establishedYear:    s.establishedYear    || '',
      studentCount:       s.studentCount       || '',
      staffCount:         s.staffCount         || '',
      'address.street':   s.address?.street    || '',
      'address.city':     s.address?.city      || '',
      'address.district': s.address?.district  || '',
      'address.state':    s.address?.state     || '',
      'address.pincode':  s.address?.pincode   || '',
      'principal.name':   s.principal?.name    || '',
      'principal.email':  s.principal?.email   || '',
      'principal.phone':  s.principal?.phone   || '',
      'management.name':  s.management?.name   || '',
      'management.designation': s.management?.designation || '',
      'management.phone': s.management?.phone  || '',
      poeSubmitted:        s.poeSubmitted       || 'No',
      cptTrainingLevel:    s.cptTrainingLevel   || '',
    });
  };

  const showMsg = (text) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 3500);
  };

  // ── Save profile ──────────────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        schoolName:         form.schoolName,
        registrationNumber: form.registrationNumber,
        udiseCode:          form.udiseCode,
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
        poeSubmitted: form.poeSubmitted,
        cptTrainingLevel: form.cptTrainingLevel,
      };
      const res = await API.put(`/schools/${schoolId}`, payload);
      setSchool(res.data.school);
      initForm(res.data.school);
      showMsg('✅ School profile updated successfully!');
      setTab('overview');
    } catch (e) {
      showMsg('❌ ' + (e.response?.data?.message || 'Update failed'));
    } finally {
      setSaving(false);
    }
  };

  // ── Update status ─────────────────────────────────────────────────────────
  const handleStatusUpdate = async (e) => {
    e.preventDefault();
    if (!statusForm.newStatus) return;
    setSaving(true);
    try {
      await API.put(`/schools/${schoolId}/status`, statusForm);
      await fetchAll();
      setStatusForm({ newStatus: '', remarks: '', reason: '' });
      showMsg('✅ Status updated successfully!');
      setTab('history');
    } catch (e) {
      showMsg('❌ ' + (e.response?.data?.message || 'Status update failed'));
    } finally {
      setSaving(false);
    }
  };

  // ── Add note ──────────────────────────────────────────────────────────────
  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    setSaving(true);
    try {
      await API.post(`/schools/${schoolId}/notes`, { note: noteText });
      await fetchAll();
      setNoteText('');
      showMsg('✅ Note added successfully!');
    } catch (e) {
      showMsg('❌ ' + (e.response?.data?.message || 'Failed to add note'));
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  if (loading) return <Layout><div style={{ textAlign:'center', padding:'4rem', color:'#94a3b8' }}>Loading school details...</div></Layout>;
  if (!school) return <Layout><div style={{ textAlign:'center', padding:'4rem', color:'#94a3b8' }}>School not found.</div></Layout>;

  return (
    <Layout>
      {/* Back */}
      <button onClick={() => navigate(-1)} style={{ background:'none', border:'none', color:'#64748b', cursor:'pointer', fontSize:'0.82rem', marginBottom:'1rem', fontFamily:'inherit', display:'flex', alignItems:'center', gap:'4px', padding:0 }}>
        ← Back to schools
      </button>

      {/* Message */}
      {msg && (
        <div style={{ marginBottom:'1rem', padding:'0.75rem 1rem', background: msg.startsWith('✅') ? '#d1fae5' : '#fee2e2', border:`1px solid ${msg.startsWith('✅') ? '#6ee7b7' : '#fca5a5'}`, borderRadius:'8px', fontSize:'0.875rem', fontWeight:'600', color: msg.startsWith('✅') ? '#065f46' : '#991b1b' }}>
          {msg}
        </div>
      )}

      {/* School header card */}
      <div style={{ background:'linear-gradient(135deg,#1a3a5c,#2d5986)', borderRadius:'14px', padding:'1.5rem', marginBottom:'1.5rem', color:'#fff' }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:'1rem', flexWrap:'wrap' }}>
          <div style={{ width:'52px', height:'52px', borderRadius:'12px', background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.5rem', flexShrink:0 }}>🏫</div>
          <div style={{ flex:1, minWidth:0 }}>
            <h2 style={{ margin:'0 0 0.25rem', fontSize:'1.3rem', fontWeight:'800' }}>{school.schoolName}</h2>
            <div style={{ fontSize:'0.82rem', color:'rgba(255,255,255,0.7)', marginBottom:'0.5rem' }}>
              {[school.registrationNumber && `Reg: ${school.registrationNumber}`, school.board, school.schoolType, school.address?.city, school.address?.state].filter(Boolean).join(' · ')}
            </div>
            <div style={{ display:'flex', gap:'0.75rem', flexWrap:'wrap', alignItems:'center' }}>
              <StatusBadge status={school.currentStatus} size="lg" />
              <span style={{ fontSize:'0.78rem', color:'rgba(255,255,255,0.7)' }}>📧 {school.email}</span>
              <span style={{ fontSize:'0.78rem', color:'rgba(255,255,255,0.7)' }}>📞 {school.phone}</span>
            </div>
          </div>
          <div style={{ display:'flex', gap:'0.5rem', flexShrink:0, flexWrap:'wrap' }}>
            <button onClick={() => navigate(`/admin/schools/${schoolId}/documents`)}
              style={{ padding:'0.5rem 1rem', background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:'8px', color:'#fff', cursor:'pointer', fontSize:'0.8rem', fontWeight:'600', fontFamily:'inherit' }}>
              📄 Documents
            </button>
            <button onClick={() => setTab('edit')}
              style={{ padding:'0.5rem 1rem', background:'rgba(255,255,255,0.9)', border:'none', borderRadius:'8px', color:'#1a3a5c', cursor:'pointer', fontSize:'0.8rem', fontWeight:'700', fontFamily:'inherit' }}>
              ✏️ Edit
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:'4px', marginBottom:'1.25rem', background:'#f1f5f9', padding:'4px', borderRadius:'10px', overflowX:'auto' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding:'0.5rem 1rem', border:'none', borderRadius:'7px', cursor:'pointer', fontFamily:'inherit', fontSize:'0.82rem', fontWeight: tab === t.key ? '700' : '500', background: tab === t.key ? '#fff' : 'transparent', color: tab === t.key ? '#1a3a5c' : '#64748b', boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', whiteSpace:'nowrap', transition:'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Overview ── */}
      {tab === 'overview' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1.25rem' }}>
          <InfoCard title="Basic Details" items={[
            { label:'School Name',      value: school.schoolName },
            { label:'Registration No.', value: school.registrationNumber || 'Not provided' },
            { label:'UDISE Code',       value: school.udiseCode || 'Not provided' },
            { label:'Board',            value: school.board || '—' },
            { label:'Type',             value: school.schoolType || '—' },
            { label:'Est. Year',        value: school.establishedYear || '—' },
            { label:'Website',          value: school.website || '—' },
            { label:'Students (6-12)',  value: school.studentCount || '—' },
            { label:'Staff (6-12)',     value: school.staffCount || '—' },
            { label:'POE Submitted',    value: school.poeSubmitted || 'No' },
            { label:'CPT Training Level', value: school.cptTrainingLevel || 'Not set' },
          ]} />
          <InfoCard title="Contact Details" items={[
            { label:'Email',     value: school.email },
            { label:'Phone',     value: school.phone },
            { label:'Alt Phone', value: school.altPhone || '—' },
            { label:'Street',    value: school.address?.street || '—' },
            { label:'City',      value: school.address?.city || '—' },
            { label:'District',  value: school.address?.district || '—' },
            { label:'State',     value: school.address?.state || '—' },
            { label:'Pincode',   value: school.address?.pincode || '—' },
          ]} />
          <InfoCard title="Principal" items={[
            { label:'Name',  value: school.principal?.name  || '—' },
            { label:'Email', value: school.principal?.email || '—' },
            { label:'Phone', value: school.principal?.phone || '—' },
          ]} />
          <InfoCard title="Management" items={[
            { label:'Name',        value: school.management?.name        || '—' },
            { label:'Designation', value: school.management?.designation || '—' },
            { label:'Phone',       value: school.management?.phone       || '—' },
          ]} />

          {/* Assigned Admin */}
          <div style={card}>
            <h3 style={{ margin:'0 0 1rem', fontSize:'0.9rem', fontWeight:'700', color:'#1e293b' }}>👤 Assigned Admin</h3>
            {school.assignedAdmin ? (
              <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginBottom: user?.role === 'superadmin' ? '1rem' : 0 }}>
                <div style={{ width:'40px', height:'40px', borderRadius:'10px', background:'#e8f0f9', color:'#1e3a5f', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'800', fontSize:'1rem', flexShrink:0 }}>
                  {school.assignedAdmin.name?.[0]?.toUpperCase() || '?'}
                </div>
                <div>
                  <div style={{ fontSize:'0.875rem', fontWeight:'700', color:'#1e293b' }}>{school.assignedAdmin.name}</div>
                  <div style={{ fontSize:'0.75rem', color:'#94a3b8' }}>{school.assignedAdmin.email}</div>
                  {school.assignedAdmin.phone && <div style={{ fontSize:'0.72rem', color:'#94a3b8' }}>{school.assignedAdmin.phone}</div>}
                </div>
              </div>
            ) : (
              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom: user?.role === 'superadmin' ? '1rem' : 0, padding:'0.75rem', background:'#fff8f0', border:'1px solid #fed7aa', borderRadius:'8px' }}>
                <span style={{ fontSize:'1rem' }}>⚠️</span>
                <span style={{ fontSize:'0.82rem', color:'#9a3412', fontWeight:'600' }}>No admin assigned yet</span>
              </div>
            )}

            {/* SuperAdmin can reassign */}
            {user?.role === 'superadmin' && (
              <div style={{ paddingTop: school.assignedAdmin || true ? '0' : '0' }}>
                <label style={{ fontSize:'0.72rem', fontWeight:'600', color:'#374151', display:'block', marginBottom:'0.4rem' }}>
                  {school.assignedAdmin ? 'Reassign to a different admin' : 'Assign an admin'}
                </label>
                <div style={{ display:'flex', gap:'0.5rem' }}>
                  <select value={selectedAdminId} onChange={e => setSelectedAdminId(e.target.value)}
                    style={{ flex:1, padding:'0.5rem 0.7rem', border:'1.5px solid #e2e8f0', borderRadius:'7px', fontSize:'0.8rem', outline:'none', fontFamily:'inherit', background:'#fff' }}>
                    <option value="">Select admin...</option>
                    {admins.filter(a => a._id !== school.assignedAdmin?._id).map(a => (
                      <option key={a._id} value={a._id}>{a.name} ({a.stats?.totalSchools || 0} schools)</option>
                    ))}
                  </select>
                  <button onClick={handleReassignAdmin} disabled={!selectedAdminId || reassigning}
                    style={{ padding:'0.5rem 1rem', background: !selectedAdminId ? '#94a3b8' : '#1e3a5f', border:'none', borderRadius:'7px', color:'#fff', fontWeight:'600', fontSize:'0.78rem', cursor: !selectedAdminId ? 'not-allowed' : 'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                    {reassigning ? 'Assigning...' : 'Assign'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Portal Access */}
          <div style={card}>
            <h3 style={{ margin:'0 0 1rem', fontSize:'0.9rem', fontWeight:'700', color:'#1e293b' }}>🔐 School Portal Access</h3>

            {school.schoolUser ? (
              <>
                <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginBottom:'1rem' }}>
                  <div style={{ width:'40px', height:'40px', borderRadius:'10px', background:'#e8f5f1', color:'#1e5f4e', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'800', fontSize:'1rem', flexShrink:0 }}>
                    {school.schoolUser.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <div style={{ fontSize:'0.875rem', fontWeight:'700', color:'#1e293b' }}>{school.schoolUser.email}</div>
                    <div style={{ fontSize:'0.75rem', color:'#065f46', background:'#d1fae5', display:'inline-block', padding:'1px 8px', borderRadius:'10px', fontWeight:'600', marginTop:'2px' }}>Portal Active</div>
                  </div>
                </div>

                {!showResetPw ? (
                  <button onClick={() => setShowResetPw(true)}
                    style={{ padding:'0.5rem 1rem', background:'#f1f5f9', border:'none', borderRadius:'7px', cursor:'pointer', fontSize:'0.78rem', fontWeight:'600', color:'#475569', fontFamily:'inherit' }}>
                    🔑 Reset Password
                  </button>
                ) : (
                  <form onSubmit={handleResetPassword}>
                    <label style={{ fontSize:'0.72rem', fontWeight:'600', color:'#374151', display:'block', marginBottom:'0.4rem' }}>New Password</label>
                    <div style={{ display:'flex', gap:'0.5rem' }}>
                      <input type="text" value={resetPassword} onChange={e => setResetPassword(e.target.value)}
                        placeholder="Min. 6 characters" autoFocus
                        style={{ flex:1, padding:'0.5rem 0.7rem', border:'1.5px solid #e2e8f0', borderRadius:'7px', fontSize:'0.8rem', outline:'none', fontFamily:'inherit' }} />
                      <button type="submit" disabled={resetting || resetPassword.length < 6}
                        style={{ padding:'0.5rem 1rem', background: resetPassword.length < 6 ? '#94a3b8' : '#1e3a5f', border:'none', borderRadius:'7px', color:'#fff', fontWeight:'600', fontSize:'0.78rem', cursor: resetPassword.length < 6 ? 'not-allowed' : 'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                        {resetting ? 'Saving...' : 'Save'}
                      </button>
                      <button type="button" onClick={() => { setShowResetPw(false); setResetPassword(''); }}
                        style={{ padding:'0.5rem 0.75rem', background:'#f1f5f9', border:'none', borderRadius:'7px', color:'#64748b', fontSize:'0.78rem', cursor:'pointer', fontFamily:'inherit' }}>
                        ✕
                      </button>
                    </div>
                  </form>
                )}
              </>
            ) : (
              <>
                <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'1rem', padding:'0.75rem', background:'#fff8f0', border:'1px solid #fed7aa', borderRadius:'8px' }}>
                  <span style={{ fontSize:'1rem' }}>⚠️</span>
                  <span style={{ fontSize:'0.82rem', color:'#9a3412', fontWeight:'600' }}>No portal login created yet</span>
                </div>

                {!showCreateLogin ? (
                  <button onClick={() => { setShowCreateLogin(true); setNewLoginEmail(school.email || ''); }}
                    style={{ padding:'0.5rem 1rem', background:'#1e3a5f', border:'none', borderRadius:'7px', cursor:'pointer', fontSize:'0.78rem', fontWeight:'600', color:'#fff', fontFamily:'inherit' }}>
                    + Create Portal Login
                  </button>
                ) : (
                  <form onSubmit={handleCreateLogin}>
                    <div style={{ marginBottom:'0.625rem' }}>
                      <label style={{ fontSize:'0.72rem', fontWeight:'600', color:'#374151', display:'block', marginBottom:'0.3rem' }}>Login Email</label>
                      <input type="email" value={newLoginEmail} onChange={e => setNewLoginEmail(e.target.value)}
                        style={{ width:'100%', boxSizing:'border-box', padding:'0.5rem 0.7rem', border:'1.5px solid #e2e8f0', borderRadius:'7px', fontSize:'0.8rem', outline:'none', fontFamily:'inherit' }} />
                    </div>
                    <div style={{ marginBottom:'0.75rem' }}>
                      <label style={{ fontSize:'0.72rem', fontWeight:'600', color:'#374151', display:'block', marginBottom:'0.3rem' }}>Password</label>
                      <input type="text" value={newLoginPassword} onChange={e => setNewLoginPassword(e.target.value)}
                        placeholder="Min. 6 characters"
                        style={{ width:'100%', boxSizing:'border-box', padding:'0.5rem 0.7rem', border:'1.5px solid #e2e8f0', borderRadius:'7px', fontSize:'0.8rem', outline:'none', fontFamily:'inherit' }} />
                    </div>
                    <div style={{ display:'flex', gap:'0.5rem' }}>
                      <button type="submit" disabled={creatingLogin || !newLoginEmail || newLoginPassword.length < 6}
                        style={{ padding:'0.5rem 1rem', background: (!newLoginEmail || newLoginPassword.length < 6) ? '#94a3b8' : '#1e3a5f', border:'none', borderRadius:'7px', color:'#fff', fontWeight:'600', fontSize:'0.78rem', cursor: (!newLoginEmail || newLoginPassword.length < 6) ? 'not-allowed' : 'pointer', fontFamily:'inherit' }}>
                        {creatingLogin ? 'Creating...' : 'Create Login'}
                      </button>
                      <button type="button" onClick={() => setShowCreateLogin(false)}
                        style={{ padding:'0.5rem 0.75rem', background:'#f1f5f9', border:'none', borderRadius:'7px', color:'#64748b', fontSize:'0.78rem', cursor:'pointer', fontFamily:'inherit' }}>
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: Edit Profile ── */}
      {tab === 'edit' && (
        <div style={card}>
          <h3 style={{ margin:'0 0 1.25rem', fontSize:'1rem', fontWeight:'700', color:'#1e293b' }}>✏️ Edit School Profile</h3>
          <form onSubmit={handleSave}>
            <Section title="Basic Details">
              <Row><Field label="School Name *"        name="schoolName"         value={form.schoolName}         onChange={handleChange} required /><Field label="Registration Number" name="registrationNumber" value={form.registrationNumber} onChange={handleChange} /></Row>
              <Row><Field label="Email *"              name="email"              value={form.email}              onChange={handleChange} required type="email" /><Field label="Phone *" name="phone" value={form.phone} onChange={handleChange} required /></Row>
              <Row><Field label="UDISE Code *"         name="udiseCode"          value={form.udiseCode}          onChange={handleChange} required placeholder="11-digit UDISE code" /><Field label="Alt Phone" name="altPhone" value={form.altPhone} onChange={handleChange} /></Row>
              <Row><Field label="Website"              name="website"            value={form.website}            onChange={handleChange} /><div /></Row>
              <Row>
                <SelectField label="Board" name="board" value={form.board} onChange={handleChange} options={['CBSE','ICSE','IB','State Board','Other']} />
                <SelectField label="School Type" name="schoolType" value={form.schoolType} onChange={handleChange} options={['Primary','Secondary','Higher Secondary','College','Other']} />
              </Row>
              <Row><Field label="Established Year" name="establishedYear" value={form.establishedYear} onChange={handleChange} type="number" /><Field label="Student Count (6-12)" name="studentCount" value={form.studentCount} onChange={handleChange} type="number" /></Row>
              <Row><Field label="Staff Count (6-12)" name="staffCount" value={form.staffCount} onChange={handleChange} type="number" /><div /></Row>
            </Section>
            <Section title="Address">
              <Field label="Street Address" name="address.street" value={form['address.street']} onChange={handleChange} fullWidth />
              <Row><Field label="City *" name="address.city" value={form['address.city']} onChange={handleChange} required /><Field label="District" name="address.district" value={form['address.district']} onChange={handleChange} /></Row>
              <Row><Field label="State *" name="address.state" value={form['address.state']} onChange={handleChange} required /><Field label="Pincode" name="address.pincode" value={form['address.pincode']} onChange={handleChange} /></Row>
            </Section>
            <Section title="Principal Information">
              <Row><Field label="Principal Name" name="principal.name" value={form['principal.name']} onChange={handleChange} /><Field label="Principal Email" name="principal.email" value={form['principal.email']} onChange={handleChange} type="email" /></Row>
              <Field label="Principal Phone" name="principal.phone" value={form['principal.phone']} onChange={handleChange} fullWidth />
            </Section>
            <Section title="Management Information">
              <Row><Field label="Management Name" name="management.name" value={form['management.name']} onChange={handleChange} /><Field label="Designation" name="management.designation" value={form['management.designation']} onChange={handleChange} /></Row>
              <Field label="Management Phone" name="management.phone" value={form['management.phone']} onChange={handleChange} fullWidth />
              <Row>
                <SelectField label="POE Submitted" name="poeSubmitted" value={form.poeSubmitted} onChange={handleChange} options={['Yes','No']} />
                <div />
              </Row>
            </Section>
            <Section title="CPT Training Level">
              <Row>
                <SelectField label="CPT Training Level" name="cptTrainingLevel" value={form.cptTrainingLevel} onChange={handleChange} options={['CPT1','CPT2','CPT3','CPT4','CPT5']} />
                <div />
              </Row>
            </Section>
            <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', paddingTop:'1rem', borderTop:'1px solid #f1f5f9' }}>
              <button type="button" onClick={() => { setTab('overview'); initForm(school); }} style={cancelBtn}>Cancel</button>
              <button type="submit" disabled={saving} style={{ ...saveBtn, opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving...' : '✓ Save Changes'}</button>
            </div>
          </form>
        </div>
      )}

      {/* ── TAB: Status ── */}
      {tab === 'status' && (
        <div style={card}>
          <h3 style={{ margin:'0 0 1.25rem', fontSize:'1rem', fontWeight:'700', color:'#1e293b' }}>🔄 Update School Status</h3>
          <div style={{ marginBottom:'1.25rem', padding:'0.875rem 1rem', background:'#f8fafc', borderRadius:'8px', display:'flex', alignItems:'center', gap:'0.75rem' }}>
            <span style={{ fontSize:'0.82rem', color:'#64748b' }}>Current Status:</span>
            <StatusBadge status={school.currentStatus} size="lg" />
          </div>
          <form onSubmit={handleStatusUpdate}>
            <div style={{ marginBottom:'1rem' }}>
              <label style={labelStyle}>New Status *</label>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:'0.5rem', marginTop:'0.5rem' }}>
                {STATUSES.filter(s => s !== school.currentStatus).map(s => (
                  <button key={s} type="button" onClick={() => setStatusForm(f => ({ ...f, newStatus: s }))}
                    style={{ padding:'0.625rem 0.875rem', border:`2px solid ${statusForm.newStatus === s ? '#1a3a5c' : '#e2e8f0'}`, borderRadius:'8px', background: statusForm.newStatus === s ? '#e8f0f9' : '#fff', cursor:'pointer', fontFamily:'inherit', fontSize:'0.82rem', fontWeight: statusForm.newStatus === s ? '700' : '400', color: statusForm.newStatus === s ? '#1a3a5c' : '#374151', textAlign:'left', transition:'all 0.15s' }}>
                    <StatusBadge status={s} size="sm" />
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom:'1rem' }}>
              <label style={labelStyle}>Remarks</label>
              <input type="text" value={statusForm.remarks} onChange={e => setStatusForm(f => ({ ...f, remarks: e.target.value }))}
                placeholder="Reason for status change..."
                style={{ ...inputStyle, width:'100%', boxSizing:'border-box', marginTop:'0.375rem' }} />
            </div>
            <div style={{ marginBottom:'1.25rem' }}>
              <label style={labelStyle}>Additional Notes</label>
              <textarea value={statusForm.reason} onChange={e => setStatusForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Additional details (optional)..."
                rows={3} style={{ ...inputStyle, width:'100%', boxSizing:'border-box', resize:'vertical', marginTop:'0.375rem' }} />
            </div>
            <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end' }}>
              <button type="button" onClick={() => setStatusForm({ newStatus:'', remarks:'', reason:'' })} style={cancelBtn}>Clear</button>
              <button type="submit" disabled={saving || !statusForm.newStatus} style={{ ...saveBtn, opacity: (!statusForm.newStatus || saving) ? 0.6 : 1, cursor: !statusForm.newStatus ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Updating...' : '✓ Update Status'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── TAB: Notes ── */}
      {tab === 'notes' && (
        <div style={card}>
          <h3 style={{ margin:'0 0 1.25rem', fontSize:'1rem', fontWeight:'700', color:'#1e293b' }}>📝 Internal Notes</h3>
          <p style={{ fontSize:'0.8rem', color:'#64748b', margin:'0 0 1rem' }}>Notes are internal and not visible to the school user.</p>

          {/* Add note form */}
          <form onSubmit={handleAddNote} style={{ marginBottom:'1.5rem', padding:'1rem', background:'#f8fafc', borderRadius:'10px', border:'1px solid #f1f5f9' }}>
            <label style={labelStyle}>Add New Note</label>
            <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
              placeholder="Type your note here..."
              rows={3} style={{ ...inputStyle, width:'100%', boxSizing:'border-box', resize:'vertical', margin:'0.375rem 0 0.75rem' }} />
            <button type="submit" disabled={saving || !noteText.trim()} style={{ ...saveBtn, opacity: !noteText.trim() ? 0.6 : 1 }}>
              {saving ? 'Adding...' : '+ Add Note'}
            </button>
          </form>

          {/* Notes list */}
          {school.internalNotes?.length === 0 ? (
            <div style={{ textAlign:'center', padding:'2rem', color:'#94a3b8', fontSize:'0.85rem' }}>No notes yet</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
              {school.internalNotes?.map((note, i) => (
                <div key={i} style={{ padding:'0.875rem 1rem', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:'8px', borderLeft:'4px solid #f59e0b' }}>
                  <div style={{ fontSize:'0.875rem', color:'#1e293b', lineHeight:1.5, marginBottom:'0.5rem' }}>{note.note}</div>
                  <div style={{ fontSize:'0.72rem', color:'#92400e' }}>
                    Added by {note.addedBy?.name || 'Admin'} · {new Date(note.addedAt).toLocaleString('en-IN', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Status History ── */}
      {tab === 'history' && (
        <div style={card}>
          <h3 style={{ margin:'0 0 1.25rem', fontSize:'1rem', fontWeight:'700', color:'#1e293b' }}>📜 Status History</h3>
          {history.length === 0 ? (
            <div style={{ textAlign:'center', padding:'2rem', color:'#94a3b8', fontSize:'0.85rem' }}>No status changes yet</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column' }}>
              {history.map((h, i) => (
                <div key={h._id} style={{ display:'flex', gap:'1rem', paddingBottom:'1rem', position:'relative' }}>
                  {i < history.length - 1 && <div style={{ position:'absolute', left:'7px', top:'20px', bottom:0, width:'2px', background:'#f1f5f9' }} />}
                  <div style={{ width:'16px', height:'16px', borderRadius:'50%', background:'#1a3a5c', flexShrink:0, marginTop:'3px', zIndex:1 }} />
                  <div style={{ flex:1, paddingBottom:'1rem', borderBottom: i < history.length-1 ? '1px solid #f8fafc' : 'none' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap', marginBottom:'4px' }}>
                      {h.oldStatus ? <><StatusBadge status={h.oldStatus} size="sm" /><span style={{ color:'#94a3b8' }}>→</span><StatusBadge status={h.newStatus} size="sm" /></> : <><span style={{ fontSize:'0.75rem', color:'#94a3b8' }}>Created as</span><StatusBadge status={h.newStatus} size="sm" /></>}
                    </div>
                    {h.remarks && <div style={{ fontSize:'0.78rem', color:'#64748b', fontStyle:'italic', marginBottom:'4px' }}>"{h.remarks}"</div>}
                    <div style={{ fontSize:'0.7rem', color:'#94a3b8' }}>
                      {h.updatedBy?.name} ({h.updatedByRole}) · {new Date(h.createdAt).toLocaleString('en-IN', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Audit Trail ── */}
      {tab === 'audit' && (
        <div style={card}>
          <h3 style={{ margin:'0 0 1.25rem', fontSize:'1rem', fontWeight:'700', color:'#1e293b' }}>🔍 Audit Trail</h3>
          {audit.length === 0 ? (
            <div style={{ textAlign:'center', padding:'2rem', color:'#94a3b8', fontSize:'0.85rem' }}>No audit records yet</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'0' }}>
              {audit.map((log, i) => (
                <div key={log._id} style={{ display:'flex', gap:'0.875rem', padding:'0.875rem 0', borderBottom: i < audit.length-1 ? '1px solid #f8fafc' : 'none' }}>
                  <div style={{ width:'36px', height:'36px', borderRadius:'8px', background:'#e8f0f9', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem', flexShrink:0 }}>
                    {log.eventType === 'Status Changed' ? '🔄' : log.eventType === 'Document Uploaded' ? '📄' : log.eventType === 'School Created' ? '🏫' : log.eventType === 'Message Sent' ? '💬' : '📋'}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'3px', flexWrap:'wrap' }}>
                      <span style={{ fontSize:'0.82rem', fontWeight:'700', color:'#1e293b' }}>{log.eventType}</span>
                      {log.previousValue && log.newValue && (
                        <><span style={{ fontSize:'0.7rem', background:'#fee2e2', color:'#991b1b', padding:'1px 6px', borderRadius:'6px' }}>{String(log.previousValue)}</span>
                        <span style={{ color:'#94a3b8', fontSize:'0.7rem' }}>→</span>
                        <span style={{ fontSize:'0.7rem', background:'#d1fae5', color:'#065f46', padding:'1px 6px', borderRadius:'6px' }}>{String(log.newValue)}</span></>
                      )}
                    </div>
                    {log.description && <div style={{ fontSize:'0.78rem', color:'#475569', marginBottom:'3px' }}>{log.description}</div>}
                    <div style={{ fontSize:'0.7rem', color:'#94a3b8' }}>
                      {log.performedBy?.name} ({log.performedByRole}) · {new Date(log.createdAt).toLocaleString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Layout>
  );
};

// ── Shared Components ─────────────────────────────────────────────────────────
const InfoCard = ({ title, items }) => (
  <div style={card}>
    <h3 style={{ margin:'0 0 1rem', fontSize:'0.9rem', fontWeight:'700', color:'#1e293b' }}>{title}</h3>
    <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
      {items.map(({ label, value }) => (
        <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'0.35rem 0', borderBottom:'1px solid #f8fafc' }}>
          <span style={{ fontSize:'0.75rem', color:'#94a3b8', fontWeight:'600' }}>{label}</span>
          <span style={{ fontSize:'0.8rem', color:'#1e293b', fontWeight:'500', textAlign:'right', maxWidth:'65%', wordBreak:'break-word' }}>{value}</span>
        </div>
      ))}
    </div>
  </div>
);

const Section = ({ title, children }) => (
  <div style={{ marginBottom:'1.25rem' }}>
    <div style={{ fontSize:'0.78rem', fontWeight:'700', color:'#1a3a5c', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.75rem', paddingBottom:'0.5rem', borderBottom:'2px solid #dbeafe' }}>{title}</div>
    {children}
  </div>
);

const Row = ({ children }) => (
  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem', marginBottom:'0.75rem' }}>{children}</div>
);

const Field = ({ label, name, value, onChange, required, type='text', fullWidth, placeholder }) => (
  <div style={{ display:'flex', flexDirection:'column', gap:'0.3rem', marginBottom: fullWidth ? '0.75rem' : 0 }}>
    <label style={labelStyle}>{label}</label>
    <input type={type} name={name} value={value} onChange={onChange} required={required} placeholder={placeholder}
      style={{ ...inputStyle, width:'100%', boxSizing:'border-box' }} />
  </div>
);

const SelectField = ({ label, name, value, onChange, options }) => (
  <div style={{ display:'flex', flexDirection:'column', gap:'0.3rem' }}>
    <label style={labelStyle}>{label}</label>
    <select name={name} value={value} onChange={onChange} style={{ ...inputStyle, background:'#fff' }}>
      <option value="">Select...</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

const card      = { background:'#fff', borderRadius:'12px', padding:'1.25rem', boxShadow:'0 1px 3px rgba(0,0,0,0.06)', border:'1px solid #f1f5f9' };
const labelStyle= { fontSize:'0.75rem', fontWeight:'600', color:'#374151' };
const inputStyle= { padding:'0.55rem 0.75rem', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'0.875rem', outline:'none', fontFamily:'inherit', color:'#1e293b' };
const cancelBtn = { padding:'0.65rem 1.25rem', background:'#f1f5f9', border:'none', borderRadius:'8px', cursor:'pointer', fontFamily:'inherit', fontWeight:'600', color:'#475569', fontSize:'0.875rem' };
const saveBtn   = { padding:'0.65rem 1.5rem', background:'#1a3a5c', border:'none', borderRadius:'8px', cursor:'pointer', fontFamily:'inherit', fontWeight:'700', color:'#fff', fontSize:'0.875rem' };

export default SchoolDetail;
