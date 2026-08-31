import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Layout from '../../components/layout/Layout';
import StatusBadge from '../../components/common/StatusBadge';
import API from '../../api/axios';
import { exportPDF, exportExcel, exportWord, exportCSV } from '../../utils/exportReport';
import { downloadStudentsActivityTemplate, downloadTeachersActivityTemplate } from '../../utils/downloadFile';

const STATUSES = ['New','Contacted','LOI Pending','LOI Received','Verification','Data Requested','Data Received','Completed'];

const TABS = [
  { key: 'overview',  label: '📋 Overview' },
  { key: 'edit',      label: '✏️ Edit Profile' },
  { key: 'activity',  label: '📌 Activity' },
  { key: 'teachers',  label: '👩‍🏫 Teachers Activity' },
  { key: 'students',  label: '🎓 Students Activity' },
  { key: 'status',    label: '🔄 Status' },
  { key: 'notes',     label: '📝 Notes' },
  { key: 'history',   label: '📜 History' },
  { key: 'audit',     label: '🔍 Audit Trail' },
];

const ACTIVITY_FIELDS = [
  { name: 'loiReceived',          label: 'LOI Received' },
  { name: 'dcaisConfirmation',    label: 'DCAIS Participated' },
  { name: 'studentDataReceived',  label: 'Student Data Received' },
  { name: 'teachersDataReceived', label: 'Teachers Data Received' },
  { name: 'hackathonRegistered',  label: 'Hackathon Participated' },
  { name: 'poeSubmitted',         label: 'POE Recived' },
  { name: 'cpdTrainingDone',      label: 'CPD Training Done' },
];

const QUARTERS = ['q1', 'q2', 'q3', 'q4'];
const QUARTER_LABELS = { q1: 'Q1', q2: 'Q2', q3: 'Q3', q4: 'Q4' };
const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const MONTH_LABELS = { jan:'Jan',feb:'Feb',mar:'Mar',apr:'Apr',may:'May',jun:'Jun',jul:'Jul',aug:'Aug',sep:'Sep',oct:'Oct',nov:'Nov',dec:'Dec' };

const EXPORT_FORMATS = [
  { key: 'pdf',   label: 'PDF',   icon: '📄' },
  { key: 'excel', label: 'Excel', icon: '📊' },
  { key: 'word',  label: 'Word',  icon: '📝' },
  { key: 'csv',   label: 'CSV',   icon: '📃' },
];

const blankTeacher = () => ({
  name: '',
  fiscalYear: '',
  cpdQuarterly: { q1: false, q2: false, q3: false, q4: false },
  dcaisMonthly: { jan:false,feb:false,mar:false,apr:false,may:false,jun:false,jul:false,aug:false,sep:false,oct:false,nov:false,dec:false },
  certificateReceived: false,
  certificateLink: '',
});

const blankStudent = () => ({
  name: '',
  class: '',
  section: '',
  fiscalYear: '',
  mauQuarterly: { q1: false, q2: false, q3: false, q4: false },
  dcaisMonthly: { jan:false,feb:false,mar:false,apr:false,may:false,jun:false,jul:false,aug:false,sep:false,oct:false,nov:false,dec:false },
  hackathonParticipated: false,
  certificateReceived: false,
  certificateLink: '',
});

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

  // Activity tab state
  const [activityForm, setActivityForm] = useState({});
  const [savingActivity, setSavingActivity] = useState(false);

  // Teachers Activity tab state
  const [teachers, setTeachers] = useState([]);
  const [savingTeachers, setSavingTeachers] = useState(false);
  const [teacherExportOpen, setTeacherExportOpen] = useState(false);
  const teacherExportRef = useRef(null);
  const [importingTeachers, setImportingTeachers] = useState(false);
  const teacherImportRef = useRef(null);

  // Close teacher export dropdown on outside click
  useEffect(() => {
    const onClick = (e) => {
      if (teacherExportRef.current && !teacherExportRef.current.contains(e.target)) setTeacherExportOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Students Activity tab state
  const [students, setStudents] = useState([]);
  const [savingStudents, setSavingStudents] = useState(false);
  const [studentExportOpen, setStudentExportOpen] = useState(false);
  const studentExportRef = useRef(null);
  const [importingStudents, setImportingStudents] = useState(false);
  const studentImportRef = useRef(null);

  // Close student export dropdown on outside click
  useEffect(() => {
    const onClick = (e) => {
      if (studentExportRef.current && !studentExportRef.current.contains(e.target)) setStudentExportOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

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
      initActivityForm(schoolRes.data.school);
      initTeachersForm(schoolRes.data.school);
      initStudentsForm(schoolRes.data.school);
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
      udiseCode:          s.udiseCode          || '',
      email:              s.email              || '',
      phone:              s.phone              || '',
      altPhone:           s.altPhone           || '',
      website:            s.website            || '',
      board:              s.board              || '',
      schoolType:         s.schoolType         || '',
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
      cpdTrainingLevel:    s.cpdTrainingLevel   || '',
    });
  };

  const initActivityForm = (s) => {
    setActivityForm({
      loiReceived:          s.loiReceived          || 'No',
      dcaisConfirmation:    s.dcaisConfirmation    || 'No',
      studentDataReceived:  s.studentDataReceived  || 'No',
      teachersDataReceived: s.teachersDataReceived || 'No',
      hackathonRegistered:  s.hackathonRegistered  || 'No',
      poeSubmitted:         s.poeSubmitted         || 'No',
      cpdTrainingDone:      s.cpdTrainingDone      || 'No',
    });
  };

  const initTeachersForm = (s) => {
    setTeachers((s.teachersActivity || []).map(t => ({
      _id: t._id,
      name: t.name || '',
      fiscalYear: t.fiscalYear || '',
      cpdQuarterly: { ...blankTeacher().cpdQuarterly, ...t.cpdQuarterly },
      dcaisMonthly: { ...blankTeacher().dcaisMonthly, ...t.dcaisMonthly },
      certificateReceived: !!t.certificateReceived,
      certificateLink: t.certificateLink || '',
    })));
  };

  const addTeacherRow    = () => setTeachers(prev => [...prev, blankTeacher()]);
  const removeTeacherRow = (idx) => {
    if (!window.confirm('Remove this teacher\'s record?')) return;
    if (!window.confirm('Are you sure? This cannot be undone once you save.')) return;
    setTeachers(prev => prev.filter((_, i) => i !== idx));
  };

  const updateTeacherField = (idx, path, value) => {
    setTeachers(prev => prev.map((t, i) => {
      if (i !== idx) return t;
      if (path.includes('.')) {
        const [parent, child] = path.split('.');
        return { ...t, [parent]: { ...t[parent], [child]: value } };
      }
      return { ...t, [path]: value };
    }));
  };

  const initStudentsForm = (s) => {
    setStudents((s.studentsActivity || []).map(t => ({
      _id: t._id,
      name: t.name || '',
      class: t.class || '',
      section: t.section || '',
      fiscalYear: t.fiscalYear || '',
      mauQuarterly: { ...blankStudent().mauQuarterly, ...t.mauQuarterly },
      dcaisMonthly: { ...blankStudent().dcaisMonthly, ...t.dcaisMonthly },
      hackathonParticipated: !!t.hackathonParticipated,
      certificateReceived: !!t.certificateReceived,
      certificateLink: t.certificateLink || '',
    })));
  };

  const addStudentRow    = () => setStudents(prev => [...prev, blankStudent()]);
  const removeStudentRow = (idx) => {
    if (!window.confirm('Remove this student\'s record?')) return;
    if (!window.confirm('Are you sure? This cannot be undone once you save.')) return;
    setStudents(prev => prev.filter((_, i) => i !== idx));
  };

  const updateStudentField = (idx, path, value) => {
    setStudents(prev => prev.map((t, i) => {
      if (i !== idx) return t;
      if (path.includes('.')) {
        const [parent, child] = path.split('.');
        return { ...t, [parent]: { ...t[parent], [child]: value } };
      }
      return { ...t, [path]: value };
    }));
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
        udiseCode:          form.udiseCode,
        email:              form.email,
        phone:              form.phone,
        altPhone:           form.altPhone,
        website:            form.website,
        board:              form.board,
        schoolType:         form.schoolType,
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
        cpdTrainingLevel: form.cpdTrainingLevel,
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

  // ── Save activity flags ───────────────────────────────────────────────────
  const handleActivitySave = async (e) => {
    e.preventDefault();
    setSavingActivity(true);
    try {
      const res = await API.put(`/schools/${schoolId}`, activityForm);
      setSchool(res.data.school);
      initActivityForm(res.data.school);
      showMsg('✅ Activity updated successfully!');
    } catch (e) {
      showMsg('❌ ' + (e.response?.data?.message || 'Update failed'));
    } finally {
      setSavingActivity(false);
    }
  };

  // ── Save teachers activity ────────────────────────────────────────────────
  const handleTeachersSave = async (e) => {
    e.preventDefault();
    setSavingTeachers(true);
    try {
      const res = await API.put(`/schools/${schoolId}`, { teachersActivity: teachers });
      setSchool(res.data.school);
      initTeachersForm(res.data.school);
      showMsg('✅ Teachers activity updated successfully!');
    } catch (e) {
      showMsg('❌ ' + (e.response?.data?.message || 'Update failed'));
    } finally {
      setSavingTeachers(false);
    }
  };

  // ── Bulk import teachers activity from Excel/CSV ───────────────────────────
  const handleTeachersBulkImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const form = new FormData();
    form.append('file', file);

    setImportingTeachers(true);
    try {
      const res = await API.post(`/schools/${schoolId}/teachers-activity/import`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSchool(res.data.school);
      initTeachersForm(res.data.school);
      const skippedMsg = res.data.skipped > 0 ? ` (${res.data.skipped} row(s) skipped — see console)` : '';
      if (res.data.skipped > 0) console.warn('Import errors:', res.data.errors);
      showMsg(`✅ Imported ${res.data.added} teacher(s)${skippedMsg}`);
    } catch (e) {
      showMsg('❌ ' + (e.response?.data?.message || 'Import failed'));
    } finally {
      setImportingTeachers(false);
    }
  };

  // ── Export teachers activity ──────────────────────────────────────────────
  const buildTeacherExportRows = () => teachers.map(t => {
    const row = { 'Teacher Name': t.name || '—', 'Fiscal Year': t.fiscalYear || '—' };
    QUARTERS.forEach(q => { row[`CPD ${QUARTER_LABELS[q]}`] = t.cpdQuarterly[q] ? 'Yes' : 'No'; });
    MONTHS.forEach(m => { row[`DCAIS ${MONTH_LABELS[m]}`] = t.dcaisMonthly[m] ? 'Yes' : 'No'; });
    row['Certificate Received'] = t.certificateReceived ? 'Yes' : 'No';
    row['Certificate Link'] = t.certificateLink || '—';
    return row;
  });

  const handleExportTeachers = (fmt) => {
    setTeacherExportOpen(false);
    const rows = buildTeacherExportRows();
    if (rows.length === 0) { showMsg('❌ No teachers to export.'); return; }

    const label = `${school.schoolName} — Teachers Activity`;
    if (fmt === 'pdf')   exportPDF(rows, label, 'teachers_activity');
    if (fmt === 'excel') exportExcel(rows, label, 'teachers_activity');
    if (fmt === 'word')  exportWord(rows, label, 'teachers_activity');
    if (fmt === 'csv')   exportCSV(rows, label, 'teachers_activity');
  };

  // ── Save students activity ────────────────────────────────────────────────
  const handleStudentsSave = async (e) => {
    e.preventDefault();
    setSavingStudents(true);
    try {
      const res = await API.put(`/schools/${schoolId}`, { studentsActivity: students });
      setSchool(res.data.school);
      initStudentsForm(res.data.school);
      showMsg('✅ Students activity updated successfully!');
    } catch (e) {
      showMsg('❌ ' + (e.response?.data?.message || 'Update failed'));
    } finally {
      setSavingStudents(false);
    }
  };

  // ── Bulk import students activity from Excel/CSV ──────────────────────────
  const handleStudentsBulkImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const form = new FormData();
    form.append('file', file);

    setImportingStudents(true);
    try {
      const res = await API.post(`/schools/${schoolId}/students-activity/import`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSchool(res.data.school);
      initStudentsForm(res.data.school);
      const skippedMsg = res.data.skipped > 0 ? ` (${res.data.skipped} row(s) skipped — see console)` : '';
      if (res.data.skipped > 0) console.warn('Import errors:', res.data.errors);
      showMsg(`✅ Imported ${res.data.added} student(s)${skippedMsg}`);
    } catch (e) {
      showMsg('❌ ' + (e.response?.data?.message || 'Import failed'));
    } finally {
      setImportingStudents(false);
    }
  };

  // ── Export students activity ──────────────────────────────────────────────
  const buildStudentExportRows = () => students.map(t => {
    const row = { 'Student Name': t.name || '—', 'Class': t.class || '—', 'Section': t.section || '—', 'Fiscal Year': t.fiscalYear || '—' };
    QUARTERS.forEach(q => { row[`MAU ${QUARTER_LABELS[q]}`] = t.mauQuarterly[q] ? 'Yes' : 'No'; });
    MONTHS.forEach(m => { row[`DCAIS ${MONTH_LABELS[m]}`] = t.dcaisMonthly[m] ? 'Yes' : 'No'; });
    row['Annual Hackathon Participated'] = t.hackathonParticipated ? 'Yes' : 'No';
    row['Certificate Received'] = t.certificateReceived ? 'Yes' : 'No';
    row['Certificate Link'] = t.certificateLink || '—';
    return row;
  });

  const handleExportStudents = (fmt) => {
    setStudentExportOpen(false);
    const rows = buildStudentExportRows();
    if (rows.length === 0) { showMsg('❌ No students to export.'); return; }

    const label = `${school.schoolName} — Students Activity`;
    if (fmt === 'pdf')   exportPDF(rows, label, 'students_activity');
    if (fmt === 'excel') exportExcel(rows, label, 'students_activity');
    if (fmt === 'word')  exportWord(rows, label, 'students_activity');
    if (fmt === 'csv')   exportCSV(rows, label, 'students_activity');
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
              {[school.board, school.schoolType, school.address?.city, school.address?.state].filter(Boolean).join(' · ')}
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
            { label:'UDISE Code',       value: school.udiseCode || 'Not provided' },
            { label:'Board',            value: school.board || '—' },
            { label:'Type',             value: school.schoolType || '—' },
            { label:'Website',          value: school.website || '—' },
            { label:'Total Students(6-12)', value: school.studentCount || '—' },
            { label:'Total Teachers (6-12)', value: school.staffCount || '—' },
            { label:'POE Recived',      value: school.poeSubmitted || 'No' },
            { label:'CPD Training Level', value: school.cpdTrainingLevel || 'Not set' },
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
              <Row><Field label="School Name *"        name="schoolName"         value={form.schoolName}         onChange={handleChange} required /><Field label="UDISE Code *" name="udiseCode" value={form.udiseCode} onChange={handleChange} required placeholder="11-digit UDISE code" /></Row>
              <Row><Field label="Email *"              name="email"              value={form.email}              onChange={handleChange} required type="email" /><Field label="Phone *" name="phone" value={form.phone} onChange={handleChange} required /></Row>
              <Row><Field label="UDISE Code *"         name="udiseCode"          value={form.udiseCode}          onChange={handleChange} required placeholder="11-digit UDISE code" /><Field label="Alt Phone" name="altPhone" value={form.altPhone} onChange={handleChange} /></Row>
              <Row><Field label="Website"              name="website"            value={form.website}            onChange={handleChange} /><div /></Row>
              <Row>
                <SelectField label="Board" name="board" value={form.board} onChange={handleChange} options={['CBSE','ICSE','IB','State Board','Other']} />
                <SelectField label="School Type" name="schoolType" value={form.schoolType} onChange={handleChange} options={['Primary','Secondary','Higher Secondary','College','Other']} />
              </Row>
              <Row><Field label="Student Count (6-12)" name="studentCount" value={form.studentCount} onChange={handleChange} type="number" /><Field label="Staff Count (6-12)" name="staffCount" value={form.staffCount} onChange={handleChange} type="number" /></Row>
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
            </Section>
            <Section title="CPD Training Level">
              <Row>
                <SelectField label="CPD Training Level" name="cpdTrainingLevel" value={form.cpdTrainingLevel} onChange={handleChange} options={['CPD1','CPD2','CPD3','CPD4']} />
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

      {/* ── TAB: Activity ── */}
      {tab === 'activity' && (
        <div style={card}>
          <h3 style={{ margin:'0 0 1.25rem', fontSize:'1rem', fontWeight:'700', color:'#1e293b' }}>📌 Activity</h3>
          <form onSubmit={handleActivitySave}>
            <Row>
              {ACTIVITY_FIELDS.slice(0, 2).map(f => (
                <SelectField key={f.name} label={f.label} name={f.name} value={activityForm[f.name]}
                  onChange={e => setActivityForm(a => ({ ...a, [f.name]: e.target.value }))}
                  options={['Yes', 'No']} />
              ))}
            </Row>
            <Row>
              {ACTIVITY_FIELDS.slice(2, 4).map(f => (
                <SelectField key={f.name} label={f.label} name={f.name} value={activityForm[f.name]}
                  onChange={e => setActivityForm(a => ({ ...a, [f.name]: e.target.value }))}
                  options={['Yes', 'No']} />
              ))}
            </Row>
            <Row>
              {ACTIVITY_FIELDS.slice(4, 6).map(f => (
                <SelectField key={f.name} label={f.label} name={f.name} value={activityForm[f.name]}
                  onChange={e => setActivityForm(a => ({ ...a, [f.name]: e.target.value }))}
                  options={['Yes', 'No']} />
              ))}
            </Row>
            <Row>
              <SelectField label={ACTIVITY_FIELDS[6].label} name={ACTIVITY_FIELDS[6].name} value={activityForm[ACTIVITY_FIELDS[6].name]}
                onChange={e => setActivityForm(a => ({ ...a, [ACTIVITY_FIELDS[6].name]: e.target.value }))}
                options={['Yes', 'No']} />
              <div />
            </Row>
            <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', paddingTop:'1rem', borderTop:'1px solid #f1f5f9' }}>
              <button type="submit" disabled={savingActivity} style={{ ...saveBtn, opacity: savingActivity ? 0.7 : 1 }}>
                {savingActivity ? 'Saving...' : '✓ Save Activity'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── TAB: Teachers Activity ── */}
      {tab === 'teachers' && (
        <div style={card}>
          <h3 style={{ margin:'0 0 1.25rem', fontSize:'1rem', fontWeight:'700', color:'#1e293b' }}>👩‍🏫 Teachers Activity</h3>
          <form onSubmit={handleTeachersSave}>
            <div style={{ overflowX:'auto', marginBottom:'1rem' }}>
              <table style={{ borderCollapse:'collapse', width:'100%', minWidth:'1300px' }}>
                <thead>
                  <tr>
                    <th rowSpan={2} style={th}>Teacher Name</th>
                    <th rowSpan={2} style={th}>Fiscal Year</th>
                    <th colSpan={4} style={th}>CPD Training Quarterly</th>
                    <th colSpan={12} style={th}>Monthly Activity (DCAIS)</th>
                    <th rowSpan={2} style={th}>Certificate Received</th>
                    <th rowSpan={2} style={th}>Certificate Link</th>
                    <th rowSpan={2} style={{ ...th, width:'40px' }}></th>
                  </tr>
                  <tr>
                    {QUARTERS.map(q => <th key={q} style={thSub}>{QUARTER_LABELS[q]}</th>)}
                    {MONTHS.map(m => <th key={m} style={thSub}>{MONTH_LABELS[m]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {teachers.length === 0 ? (
                    <tr><td colSpan={21} style={{ ...td, textAlign:'center', color:'#94a3b8', padding:'1.5rem' }}>No teachers added yet</td></tr>
                  ) : teachers.map((t, i) => (
                    <tr key={t._id || i}>
                      <td style={td}>
                        <input type="text" value={t.name} placeholder="Teacher name"
                          onChange={e => updateTeacherField(i, 'name', e.target.value)}
                          style={{ ...inputStyle, width:'160px', boxSizing:'border-box' }} />
                      </td>
                      <td style={td}>
                        <input type="text" value={t.fiscalYear} placeholder="e.g. 2025-26"
                          onChange={e => updateTeacherField(i, 'fiscalYear', e.target.value)}
                          style={{ ...inputStyle, width:'100px', boxSizing:'border-box' }} />
                      </td>
                      {QUARTERS.map(q => (
                        <td key={q} style={{ ...td, textAlign:'center' }}>
                          <input type="checkbox" checked={!!t.cpdQuarterly[q]}
                            onChange={e => updateTeacherField(i, `cpdQuarterly.${q}`, e.target.checked)} />
                        </td>
                      ))}
                      {MONTHS.map(m => (
                        <td key={m} style={{ ...td, textAlign:'center' }}>
                          <input type="checkbox" checked={!!t.dcaisMonthly[m]}
                            onChange={e => updateTeacherField(i, `dcaisMonthly.${m}`, e.target.checked)} />
                        </td>
                      ))}
                      <td style={{ ...td, textAlign:'center' }}>
                        <input type="checkbox" checked={!!t.certificateReceived}
                          onChange={e => updateTeacherField(i, 'certificateReceived', e.target.checked)} />
                      </td>
                      <td style={td}>
                        <input type="text" value={t.certificateLink} placeholder="https://..."
                          onChange={e => updateTeacherField(i, 'certificateLink', e.target.value)}
                          style={{ ...inputStyle, width:'160px', boxSizing:'border-box' }} />
                      </td>
                      <td style={{ ...td, textAlign:'center' }}>
                        <button type="button" onClick={() => removeTeacherRow(i)}
                          style={{ background:'none', border:'none', color:'#991b1b', cursor:'pointer', fontSize:'0.9rem', fontFamily:'inherit' }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display:'flex', gap:'0.75rem', flexWrap:'wrap', marginBottom:'1rem' }}>
              <button type="button" onClick={addTeacherRow}
                style={{ padding:'0.5rem 1rem', background:'#f1f5f9', border:'none', borderRadius:'7px', cursor:'pointer', fontSize:'0.8rem', fontWeight:'600', color:'#475569', fontFamily:'inherit' }}>
                + Add Teacher
              </button>
              <button type="button" onClick={() => downloadTeachersActivityTemplate()}
                style={{ padding:'0.5rem 1rem', background:'#f1f5f9', border:'none', borderRadius:'7px', cursor:'pointer', fontSize:'0.8rem', fontWeight:'600', color:'#475569', fontFamily:'inherit' }}>
                ⬇ Sample Template
              </button>
              <button type="button" disabled={importingTeachers} onClick={() => teacherImportRef.current?.click()}
                style={{ padding:'0.5rem 1rem', background:'#e8f0f9', border:'none', borderRadius:'7px', cursor: importingTeachers ? 'default' : 'pointer', fontSize:'0.8rem', fontWeight:'600', color:'#1e3a5f', fontFamily:'inherit', opacity: importingTeachers ? 0.7 : 1 }}>
                {importingTeachers ? 'Importing...' : '⬆ Bulk Import (Excel/CSV)'}
              </button>
              <input ref={teacherImportRef} type="file" accept=".csv,.xls,.xlsx" onChange={handleTeachersBulkImport} style={{ display:'none' }} />
            </div>
            <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', alignItems:'center', paddingTop:'1rem', borderTop:'1px solid #f1f5f9' }}>
              <div ref={teacherExportRef} style={{ position:'relative' }}>
                <button type="button" onClick={() => setTeacherExportOpen(o => !o)}
                  style={{ padding:'0.65rem 1.25rem', background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:'8px', cursor:'pointer', fontSize:'0.875rem', fontWeight:'600', color:'#475569', fontFamily:'inherit', display:'flex', alignItems:'center', gap:'6px' }}>
                  ⬇ Download <span style={{ fontSize:'0.6rem' }}>▼</span>
                </button>
                {teacherExportOpen && (
                  <div style={{ position:'absolute', bottom:'calc(100% + 4px)', right:0, background:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', boxShadow:'0 8px 24px rgba(0,0,0,0.12)', zIndex:50, minWidth:'150px', padding:'4px', overflow:'hidden' }}>
                    {EXPORT_FORMATS.map(f => (
                      <button key={f.key} type="button" onClick={() => handleExportTeachers(f.key)}
                        style={{ display:'flex', alignItems:'center', gap:'8px', width:'100%', padding:'0.55rem 0.75rem', border:'none', borderRadius:'7px', cursor:'pointer', fontFamily:'inherit', textAlign:'left', background:'transparent', color:'#374151', fontSize:'0.8rem', fontWeight:'600' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <span>{f.icon}</span> {f.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button type="submit" disabled={savingTeachers} style={{ ...saveBtn, opacity: savingTeachers ? 0.7 : 1 }}>
                {savingTeachers ? 'Saving...' : '✓ Save Teachers Activity'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── TAB: Students Activity ── */}
      {tab === 'students' && (
        <div style={card}>
          <h3 style={{ margin:'0 0 1.25rem', fontSize:'1rem', fontWeight:'700', color:'#1e293b' }}>🎓 Students Activity</h3>
          <form onSubmit={handleStudentsSave}>
            <div style={{ overflowX:'auto', marginBottom:'1rem' }}>
              <table style={{ borderCollapse:'collapse', width:'100%', minWidth:'1500px' }}>
                <thead>
                  <tr>
                    <th rowSpan={2} style={th}>Student Name</th>
                    <th rowSpan={2} style={th}>Class</th>
                    <th rowSpan={2} style={th}>Section</th>
                    <th rowSpan={2} style={th}>Fiscal Year</th>
                    <th colSpan={4} style={th}>Quaterly Activity (MAU)</th>
                    <th colSpan={12} style={th}>Monthly Activity (DCAIS)</th>
                    <th rowSpan={2} style={th}>Annual Hackathon Participated</th>
                    <th rowSpan={2} style={th}>Certificate Received</th>
                    <th rowSpan={2} style={th}>Certificate Link</th>
                    <th rowSpan={2} style={{ ...th, width:'40px' }}></th>
                  </tr>
                  <tr>
                    {QUARTERS.map(q => <th key={q} style={thSub}>{QUARTER_LABELS[q]}</th>)}
                    {MONTHS.map(m => <th key={m} style={thSub}>{MONTH_LABELS[m]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {students.length === 0 ? (
                    <tr><td colSpan={24} style={{ ...td, textAlign:'center', color:'#94a3b8', padding:'1.5rem' }}>No students added yet</td></tr>
                  ) : students.map((t, i) => (
                    <tr key={t._id || i}>
                      <td style={td}>
                        <input type="text" value={t.name} placeholder="Student name"
                          onChange={e => updateStudentField(i, 'name', e.target.value)}
                          style={{ ...inputStyle, width:'160px', boxSizing:'border-box' }} />
                      </td>
                      <td style={td}>
                        <input type="text" value={t.class} placeholder="Class"
                          onChange={e => updateStudentField(i, 'class', e.target.value)}
                          style={{ ...inputStyle, width:'80px', boxSizing:'border-box' }} />
                      </td>
                      <td style={td}>
                        <input type="text" value={t.section} placeholder="Section"
                          onChange={e => updateStudentField(i, 'section', e.target.value)}
                          style={{ ...inputStyle, width:'80px', boxSizing:'border-box' }} />
                      </td>
                      <td style={td}>
                        <input type="text" value={t.fiscalYear} placeholder="e.g. 2025-26"
                          onChange={e => updateStudentField(i, 'fiscalYear', e.target.value)}
                          style={{ ...inputStyle, width:'100px', boxSizing:'border-box' }} />
                      </td>
                      {QUARTERS.map(q => (
                        <td key={q} style={{ ...td, textAlign:'center' }}>
                          <input type="checkbox" checked={!!t.mauQuarterly[q]}
                            onChange={e => updateStudentField(i, `mauQuarterly.${q}`, e.target.checked)} />
                        </td>
                      ))}
                      {MONTHS.map(m => (
                        <td key={m} style={{ ...td, textAlign:'center' }}>
                          <input type="checkbox" checked={!!t.dcaisMonthly[m]}
                            onChange={e => updateStudentField(i, `dcaisMonthly.${m}`, e.target.checked)} />
                        </td>
                      ))}
                      <td style={{ ...td, textAlign:'center' }}>
                        <input type="checkbox" checked={!!t.hackathonParticipated}
                          onChange={e => updateStudentField(i, 'hackathonParticipated', e.target.checked)} />
                      </td>
                      <td style={{ ...td, textAlign:'center' }}>
                        <input type="checkbox" checked={!!t.certificateReceived}
                          onChange={e => updateStudentField(i, 'certificateReceived', e.target.checked)} />
                      </td>
                      <td style={td}>
                        <input type="text" value={t.certificateLink} placeholder="https://..."
                          onChange={e => updateStudentField(i, 'certificateLink', e.target.value)}
                          style={{ ...inputStyle, width:'160px', boxSizing:'border-box' }} />
                      </td>
                      <td style={{ ...td, textAlign:'center' }}>
                        <button type="button" onClick={() => removeStudentRow(i)}
                          style={{ background:'none', border:'none', color:'#991b1b', cursor:'pointer', fontSize:'0.9rem', fontFamily:'inherit' }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display:'flex', gap:'0.75rem', flexWrap:'wrap', marginBottom:'1rem' }}>
              <button type="button" onClick={addStudentRow}
                style={{ padding:'0.5rem 1rem', background:'#f1f5f9', border:'none', borderRadius:'7px', cursor:'pointer', fontSize:'0.8rem', fontWeight:'600', color:'#475569', fontFamily:'inherit' }}>
                + Add Student
              </button>
              <button type="button" onClick={() => downloadStudentsActivityTemplate()}
                style={{ padding:'0.5rem 1rem', background:'#f1f5f9', border:'none', borderRadius:'7px', cursor:'pointer', fontSize:'0.8rem', fontWeight:'600', color:'#475569', fontFamily:'inherit' }}>
                ⬇ Sample Template
              </button>
              <button type="button" disabled={importingStudents} onClick={() => studentImportRef.current?.click()}
                style={{ padding:'0.5rem 1rem', background:'#e8f0f9', border:'none', borderRadius:'7px', cursor: importingStudents ? 'default' : 'pointer', fontSize:'0.8rem', fontWeight:'600', color:'#1e3a5f', fontFamily:'inherit', opacity: importingStudents ? 0.7 : 1 }}>
                {importingStudents ? 'Importing...' : '⬆ Bulk Import (Excel/CSV)'}
              </button>
              <input ref={studentImportRef} type="file" accept=".csv,.xls,.xlsx" onChange={handleStudentsBulkImport} style={{ display:'none' }} />
            </div>
            <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', alignItems:'center', paddingTop:'1rem', borderTop:'1px solid #f1f5f9' }}>
              <div ref={studentExportRef} style={{ position:'relative' }}>
                <button type="button" onClick={() => setStudentExportOpen(o => !o)}
                  style={{ padding:'0.65rem 1.25rem', background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:'8px', cursor:'pointer', fontSize:'0.875rem', fontWeight:'600', color:'#475569', fontFamily:'inherit', display:'flex', alignItems:'center', gap:'6px' }}>
                  ⬇ Download <span style={{ fontSize:'0.6rem' }}>▼</span>
                </button>
                {studentExportOpen && (
                  <div style={{ position:'absolute', bottom:'calc(100% + 4px)', right:0, background:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', boxShadow:'0 8px 24px rgba(0,0,0,0.12)', zIndex:50, minWidth:'150px', padding:'4px', overflow:'hidden' }}>
                    {EXPORT_FORMATS.map(f => (
                      <button key={f.key} type="button" onClick={() => handleExportStudents(f.key)}
                        style={{ display:'flex', alignItems:'center', gap:'8px', width:'100%', padding:'0.55rem 0.75rem', border:'none', borderRadius:'7px', cursor:'pointer', fontFamily:'inherit', textAlign:'left', background:'transparent', color:'#374151', fontSize:'0.8rem', fontWeight:'600' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <span>{f.icon}</span> {f.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button type="submit" disabled={savingStudents} style={{ ...saveBtn, opacity: savingStudents ? 0.7 : 1 }}>
                {savingStudents ? 'Saving...' : '✓ Save Students Activity'}
              </button>
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
const th        = { padding:'0.5rem 0.6rem', background:'#f8fafc', border:'1px solid #f1f5f9', fontSize:'0.72rem', fontWeight:'700', color:'#374151', whiteSpace:'nowrap' };
const thSub     = { ...th, fontSize:'0.68rem', color:'#64748b' };
const td        = { padding:'0.4rem 0.6rem', border:'1px solid #f1f5f9', fontSize:'0.8rem', color:'#1e293b' };

export default SchoolDetail;
