import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';

const ChangePasswordModal = ({ onClose }) => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew,     setShowNew]     = useState(false);
  const [error,   setError]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const [done,    setDone]    = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('All fields are required.');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setSaving(true);
    try {
      await API.put('/auth/change-password', { currentPassword, newPassword });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to change password.');
    } finally {
      setSaving(false);
    }
  };

  const handleDoneClose = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div style={overlay} onClick={done ? undefined : onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={header}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#1e293b' }}>🔒 Change Password</h3>
          {!done && <button onClick={onClose} style={closeBtn}>✕</button>}
        </div>

        {done ? (
          <div style={{ padding: '2rem 1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>✅</div>
            <h4 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: '700', color: '#1e293b' }}>Password changed successfully</h4>
            <p style={{ margin: '0 0 1.5rem', fontSize: '0.85rem', color: '#64748b' }}>
              For security, please log in again with your new password.
            </p>
            <button onClick={handleDoneClose} style={{ ...saveBtn, width: '100%' }}>
              Log in again
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
            {error && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '0.85rem', color: '#dc2626' }}>
                ⚠ {error}
              </div>
            )}

            <Field
              label="Current Password"
              value={currentPassword}
              onChange={setCurrentPassword}
              show={showCurrent}
              onToggleShow={() => setShowCurrent(s => !s)}
            />
            <Field
              label="New Password"
              value={newPassword}
              onChange={setNewPassword}
              show={showNew}
              onToggleShow={() => setShowNew(s => !s)}
              placeholder="Min. 6 characters"
            />
            <Field
              label="Confirm New Password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              show={showNew}
            />

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid #f1f5f9', marginTop: '0.5rem' }}>
              <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
              <button type="submit" disabled={saving} style={{ ...saveBtn, opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Changing...' : 'Change Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

const Field = ({ label, value, onChange, show, onToggleShow, placeholder }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.875rem' }}>
    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#374151' }}>{label} *</label>
    <div style={{ position: 'relative' }}>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ padding: onToggleShow ? '0.55rem 2.25rem 0.55rem 0.75rem' : '0.55rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', color: '#1e293b', width: '100%', boxSizing: 'border-box' }}
      />
      {onToggleShow && (
        <button type="button" onClick={onToggleShow}
          style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem' }}>
          {show ? '🙈' : '👁'}
        </button>
      )}
    </div>
  </div>
);

const overlay  = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' };
const modal    = { background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '420px', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' };
const header   = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9' };
const closeBtn = { background: '#f1f5f9', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '0.9rem', color: '#64748b' };
const cancelBtn= { padding: '0.65rem 1.25rem', background: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: '600', color: '#475569', fontSize: '0.875rem' };
const saveBtn  = { padding: '0.65rem 1.75rem', background: '#1e3a5f', border: 'none', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: '700', color: '#fff', fontSize: '0.875rem' };

export default ChangePasswordModal;
