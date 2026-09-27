import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import StatusBadge from '../../components/common/StatusBadge';
import HealthBadge from '../../components/common/HealthBadge';
import AnalyticsQueryPanel from '../../components/common/AnalyticsQueryPanel';
import API from '../../api/axios';

const AdminsPage = () => {
  const navigate = useNavigate();
  const [admins,  setAdmins]  = useState([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [searchIn,setSearchIn]= useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState(null);   // for Manage Schools modal
  const [resetAdmin, setResetAdmin]       = useState(null);   // for Reset Password modal

  const fetchAdmins = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const res = await API.get(`/admins?${params}`);
      setAdmins(res.data.admins);
      setTotal(res.data.total);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [search]);

  useEffect(() => { fetchAdmins(); }, [fetchAdmins]);

  const handleSearch = (e) => { e.preventDefault(); setSearch(searchIn); };

  const handleToggleActive = async (admin) => {
    try {
      await API.put(`/admins/${admin._id}/toggle-active`);
      fetchAdmins();
    } catch (e) { console.error(e); }
  };

  return (
    <Layout>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem', fontWeight: '800', color: '#1e293b' }}>👥 Admin Management</h2>
          <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>{total} admin{total !== 1 ? 's' : ''} · Manage administrators and school assignments</p>
        </div>
        <button onClick={() => setShowAddModal(true)}
          style={{ background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.6rem 1.1rem', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
          + Add Admin
        </button>
      </div>

      {/* AI Analytics Q&A + BI Dashboards — read-only over the whole platform */}
      <AnalyticsQueryPanel />

      {/* Search */}
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', maxWidth: '400px' }}>
        <input type="text" placeholder="Search by name or email..." value={searchIn} onChange={e => setSearchIn(e.target.value)}
          style={{ flex: 1, padding: '0.55rem 0.875rem', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit' }} />
        <button type="submit" style={{ background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.55rem 1rem', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>Search</button>
      </form>

      {/* Admins Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8' }}>Loading admins...</div>
      ) : admins.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '4rem', color: '#94a3b8' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>👥</div>
          <div style={{ fontWeight: '600', color: '#475569' }}>No admins found</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: '1rem' }}>
          {admins.map(admin => (
            <div key={admin._id} onClick={() => navigate(`/superadmin/admins/${admin._id}/activity`)}
              title="View activity" style={{ ...card, cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#e8f0f9', color: '#1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '1.1rem', flexShrink: 0 }}>
                  {admin.name[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#1e293b' }}>{admin.name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{admin.email}</div>
                  {admin.phone && <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{admin.phone}</div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px', flexShrink: 0 }}>
                  <span style={{ fontSize: '0.68rem', fontWeight: '700', padding: '3px 8px', borderRadius: '10px', background: admin.isActive ? '#d1fae5' : '#fee2e2', color: admin.isActive ? '#065f46' : '#991b1b' }}>
                    {admin.isActive ? 'Active' : 'Inactive'}
                  </span>
                  {admin.scorecard?.score != null && <HealthBadge health={admin.scorecard} size="sm" />}
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
                <div style={{ textAlign: 'center', padding: '0.5rem', background: '#f8fafc', borderRadius: '6px' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#1e293b' }}>{admin.stats.totalSchools}</div>
                  <div style={{ fontSize: '0.62rem', color: '#94a3b8', textTransform: 'uppercase' }}>Schools</div>
                </div>
                <div style={{ textAlign: 'center', padding: '0.5rem', background: '#d1fae5', borderRadius: '6px' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#065f46' }}>{admin.stats.completed}</div>
                  <div style={{ fontSize: '0.62rem', color: '#065f46', textTransform: 'uppercase' }}>Completed</div>
                </div>
                <div style={{ textAlign: 'center', padding: '0.5rem', background: '#fef9c3', borderRadius: '6px' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#854d0e' }}>{admin.stats.pending}</div>
                  <div style={{ fontSize: '0.62rem', color: '#854d0e', textTransform: 'uppercase' }}>Pending</div>
                </div>
              </div>

              {/* Actions */}
              <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button onClick={() => setSelectedAdmin(admin)}
                  style={{ flex: 1, minWidth: '110px', padding: '0.5rem', background: '#e8f0f9', border: 'none', borderRadius: '7px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '600', color: '#1e3a5f', fontFamily: 'inherit' }}>
                  🏫 Manage Schools
                </button>
                <button onClick={() => setResetAdmin(admin)}
                  style={{ flex: 1, minWidth: '110px', padding: '0.5rem', background: '#ede9fe', border: 'none', borderRadius: '7px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '600', color: '#6d28d9', fontFamily: 'inherit' }}>
                  🔑 Reset Password
                </button>
                <button onClick={() => handleToggleActive(admin)}
                  style={{ padding: '0.5rem 0.75rem', background: admin.isActive ? '#fee2e2' : '#d1fae5', border: 'none', borderRadius: '7px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '600', color: admin.isActive ? '#991b1b' : '#065f46', fontFamily: 'inherit' }}>
                  {admin.isActive ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Admin Modal */}
      {showAddModal && (
        <AddAdminModal onClose={() => setShowAddModal(false)} onCreated={() => { setShowAddModal(false); fetchAdmins(); }} />
      )}

      {/* Manage Schools Modal */}
      {selectedAdmin && (
        <ManageSchoolsModal admin={selectedAdmin} onClose={() => setSelectedAdmin(null)} onUpdated={fetchAdmins} />
      )}

      {/* Reset Password Modal */}
      {resetAdmin && (
        <ResetPasswordModal admin={resetAdmin} onClose={() => setResetAdmin(null)} />
      )}
    </Layout>
  );
};

// ── Add Admin Modal ────────────────────────────────────────────────────────────
const AddAdminModal = ({ onClose, onCreated }) => {
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name || !form.email || !form.password) {
      setError('Name, email, and password are required.');
      return;
    }
    setSaving(true);
    try {
      await API.post('/admins', form);
      onCreated();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create admin.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={{ ...modal, maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
        <div style={modalHeader}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '800', color: '#1e293b' }}>➕ Add New Admin</h3>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>
        {error && <div style={{ margin: '1rem 1.5rem 0', padding: '0.7rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '0.82rem', color: '#dc2626' }}>⚠ {error}</div>}
        <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
          <FormField label="Full Name *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
          <FormField label="Email *" type="email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} />
          <FormField label="Phone" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} />
          <FormField label="Password *" type="password" value={form.password} onChange={v => setForm(f => ({ ...f, password: v }))} />
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
            <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
            <button type="submit" disabled={saving} style={{ ...saveBtn, opacity: saving ? 0.7 : 1 }}>{saving ? 'Creating...' : '+ Create Admin'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Reset Password Modal ───────────────────────────────────────────────────────
const ResetPasswordModal = ({ admin, onClose }) => {
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [done, setDone]     = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setSaving(true);
    try {
      await API.put(`/admins/${admin._id}/reset-password`, { newPassword });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reset password.');
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div style={overlay} onClick={onClose}>
        <div style={{ ...modal, maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
          <div style={{ padding: '2rem 1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', fontWeight: '800', color: '#1e293b' }}>Password Reset!</h3>
            <p style={{ margin: '0 0 1.5rem', fontSize: '0.85rem', color: '#64748b' }}>
              Share the new password with <strong>{admin.name}</strong>
            </p>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1rem', textAlign: 'left', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '2px' }}>New Password</div>
              <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#1e293b' }}>{newPassword}</div>
            </div>
            <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: '1.25rem' }}>
              ⚠️ This password won't be shown again once you close this window.
            </p>
            <button onClick={onClose} style={{ ...saveBtn, width: '100%' }}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={{ ...modal, maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
        <div style={modalHeader}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '800', color: '#1e293b' }}>🔑 Reset Password</h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748b' }}>{admin.name} · {admin.email}</p>
          </div>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>

        {error && <div style={{ margin: '1rem 1.5rem 0', padding: '0.7rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '0.82rem', color: '#dc2626' }}>⚠ {error}</div>}

        <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '0.3rem' }}>New Password</label>
          <div style={{ position: 'relative', marginBottom: '1.25rem' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Min. 6 characters"
              autoFocus
              style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 2.25rem 0.55rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', color: '#1e293b' }}
            />
            <button type="button" onClick={() => setShowPassword(p => !p)}
              style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem' }}>
              {showPassword ? '🙈' : '👁'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
            <button type="submit" disabled={saving || newPassword.length < 6}
              style={{ ...saveBtn, opacity: (saving || newPassword.length < 6) ? 0.6 : 1, cursor: (saving || newPassword.length < 6) ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Resetting...' : '✓ Reset Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Manage Schools Modal ───────────────────────────────────────────────────────
const ManageSchoolsModal = ({ admin, onClose, onUpdated }) => {
  const [assignedSchools, setAssignedSchools] = useState([]);
  const [allSchools, setAllSchools]           = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [assigning, setAssigning]             = useState(false);
  const [selectedSchools, setSelectedSchools] = useState([]); // array of school _ids — supports assigning many at once
  const [assignError, setAssignError]         = useState('');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [adminRes, schoolsRes] = await Promise.all([
        API.get(`/admins/${admin._id}`),
        API.get('/schools?limit=200'),
      ]);
      setAssignedSchools(adminRes.data.schools || []);
      setAllSchools(schoolsRes.data.schools || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const toggleSchoolSelection = (schoolId) => {
    setSelectedSchools(prev => prev.includes(schoolId) ? prev.filter(id => id !== schoolId) : [...prev, schoolId]);
  };

  // Assigns every selected school by calling the existing single-school
  // endpoint once per school (in parallel) — reuses its audit logging, status
  // auto-advance, and notification side effects exactly as-is for each one,
  // rather than duplicating that logic in a separate bulk endpoint.
  const handleAssign = async () => {
    if (selectedSchools.length === 0) return;
    setAssigning(true);
    setAssignError('');
    const results = await Promise.allSettled(
      selectedSchools.map(schoolId => API.put(`/schools/${schoolId}/assign-admin`, { adminId: admin._id }))
    );
    const failed = results
      .map((r, i) => ({ r, school: allSchools.find(s => s._id === selectedSchools[i]) }))
      .filter(({ r }) => r.status === 'rejected');
    if (failed.length > 0) {
      setAssignError(`Failed to assign ${failed.length} school${failed.length !== 1 ? 's' : ''}: ${failed.map(f => f.school?.schoolName || 'Unknown').join(', ')}`);
    }
    setSelectedSchools([]);
    await fetchData();
    onUpdated();
    setAssigning(false);
  };

  const unassignedSchools = allSchools.filter(s => !assignedSchools.find(a => a._id === s._id));
  const allUnassignedSelected = unassignedSchools.length > 0 && unassignedSchools.every(s => selectedSchools.includes(s._id));
  const toggleSelectAll = () => setSelectedSchools(allUnassignedSelected ? [] : unassignedSchools.map(s => s._id));

  return (
    <div style={overlay} onClick={onClose}>
      <div style={{ ...modal, maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
        <div style={modalHeader}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '800', color: '#1e293b' }}>🏫 Manage Schools</h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748b' }}>{admin.name}</p>
          </div>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>

        <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>Loading...</div>
          ) : (
            <>
              <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f8fafc', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#374151' }}>
                    Assign Schools to {admin.name} {selectedSchools.length > 0 && `(${selectedSchools.length} selected)`}
                  </label>
                  {unassignedSchools.length > 0 && (
                    <button type="button" onClick={toggleSelectAll}
                      style={{ background: 'none', border: 'none', color: '#1e3a5f', fontWeight: '600', fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                      {allUnassignedSelected ? 'Clear all' : 'Select all'}
                    </button>
                  )}
                </div>

                {unassignedSchools.length === 0 ? (
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>All schools are already assigned to this admin.</div>
                ) : (
                  <div style={{ maxHeight: '200px', overflowY: 'auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '0.75rem' }}>
                    {unassignedSchools.map(s => (
                      <label key={s._id} htmlFor={`school-${s._id}`}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.75rem', borderBottom: '1px solid #f8fafc', cursor: 'pointer', fontSize: '0.82rem', color: '#374151' }}>
                        <input id={`school-${s._id}`} type="checkbox" checked={selectedSchools.includes(s._id)} onChange={() => toggleSchoolSelection(s._id)} />
                        <span style={{ flex: 1 }}>{s.schoolName}</span>
                        <StatusBadge status={s.currentStatus} size="sm" />
                      </label>
                    ))}
                  </div>
                )}

                <button onClick={handleAssign} disabled={selectedSchools.length === 0 || assigning}
                  style={{ width: '100%', padding: '0.55rem 1.1rem', background: selectedSchools.length === 0 ? '#94a3b8' : '#1e3a5f', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: '600', fontSize: '0.82rem', cursor: selectedSchools.length === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                  {assigning ? 'Assigning...' : `+ Assign ${selectedSchools.length > 0 ? selectedSchools.length : ''} School${selectedSchools.length === 1 ? '' : 's'}`}
                </button>
                {assignError && (
                  <div style={{ marginTop: '0.6rem', padding: '0.5rem 0.7rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '0.75rem', color: '#991b1b' }}>
                    {assignError}
                  </div>
                )}
              </div>

              <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#374151', marginBottom: '0.75rem' }}>
                Currently Assigned ({assignedSchools.length})
              </div>
              {assignedSchools.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8', fontSize: '0.82rem', background: '#f8fafc', borderRadius: '8px' }}>
                  No schools assigned yet
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {assignedSchools.map(school => (
                    <div key={school._id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.7rem 0.875rem', background: '#fff', border: '1px solid #f1f5f9', borderRadius: '8px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '7px', background: '#e8f0f9', color: '#1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '0.85rem', flexShrink: 0 }}>
                        {school.schoolName[0]}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: '600', color: '#1e293b' }}>{school.schoolName}</div>
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{school.address?.city}, {school.address?.state}</div>
                      </div>
                      <StatusBadge status={school.currentStatus} size="sm" />
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: '1rem', fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic' }}>
                💡 To reassign a school to a different admin, select the school in another admin's "Assign a School" dropdown — it will update automatically.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const FormField = ({ label, value, onChange, type = 'text' }) => (
  <div style={{ marginBottom: '0.875rem' }}>
    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '0.3rem' }}>{label}</label>
    <input type={type} value={value} onChange={e => onChange(e.target.value)}
      style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', color: '#1e293b' }} />
  </div>
);

const card       = { background: '#fff', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' };
const overlay    = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' };
const modal      = { background: '#fff', borderRadius: '16px', width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' };
const modalHeader= { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9', flexShrink: 0 };
const closeBtn   = { background: '#f1f5f9', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '0.9rem', color: '#64748b', flexShrink: 0 };
const cancelBtn  = { padding: '0.6rem 1.2rem', background: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: '600', color: '#475569', fontSize: '0.85rem' };
const saveBtn    = { padding: '0.6rem 1.5rem', background: '#1e3a5f', border: 'none', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: '700', color: '#fff', fontSize: '0.85rem' };

export default AdminsPage;
