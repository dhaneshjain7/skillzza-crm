import { useState } from 'react';
import API from '../../api/axios';

const ForgotPasswordModal = ({ initialEmail, accent, onClose }) => {
  const [step, setStep] = useState('email'); // 'email' | 'reset' | 'done'
  const [email, setEmail] = useState(initialEmail || '');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [info, setInfo]   = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendCode = async (e) => {
    e.preventDefault();
    setError('');
    if (!email) { setError('Enter your account email.'); return; }

    setLoading(true);
    try {
      const { data } = await API.post('/auth/forgot-password', { email });
      setInfo(data.message);
      setStep('reset');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not send reset code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError('');

    if (!code || !newPassword || !confirmPassword) { setError('All fields are required.'); return; }
    if (newPassword.length < 6) { setError('New password must be at least 6 characters.'); return; }
    if (newPassword !== confirmPassword) { setError('New password and confirmation do not match.'); return; }

    setLoading(true);
    try {
      await API.post('/auth/reset-password', { email, code, newPassword });
      setStep('done');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={header}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#1e293b' }}>🔑 Forgot Password</h3>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>

        {step === 'done' ? (
          <div style={{ padding: '2rem 1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>✅</div>
            <h4 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: '700', color: '#1e293b' }}>Password reset successfully</h4>
            <p style={{ margin: '0 0 1.5rem', fontSize: '0.85rem', color: '#64748b' }}>
              You can now sign in with your new password.
            </p>
            <button onClick={onClose} style={{ ...saveBtn, background: accent, width: '100%' }}>
              Back to sign in
            </button>
          </div>
        ) : (
          <div style={{ padding: '1.5rem' }}>
            {error && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '0.85rem', color: '#dc2626' }}>
                ⚠ {error}
              </div>
            )}
            {info && step === 'reset' && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', fontSize: '0.82rem', color: '#166534' }}>
                ✅ {info}
              </div>
            )}

            {step === 'email' ? (
              <form onSubmit={handleSendCode}>
                <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 0 }}>
                  Enter the email your account is registered with — we'll send a 6-digit code to reset your password.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '1.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#374151' }}>Email address</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com" autoFocus
                    style={inputStyle} />
                </div>
                <button type="submit" disabled={loading} style={{ ...saveBtn, background: accent, width: '100%', opacity: loading ? 0.7 : 1 }}>
                  {loading ? 'Sending...' : 'Send Reset Code'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleReset}>
                <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 0 }}>
                  Sent to <strong>{email}</strong> — <button type="button" onClick={() => { setStep('email'); setError(''); }} style={linkBtn}>use a different email</button>
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.875rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#374151' }}>6-Digit Code</label>
                  <input type="text" inputMode="numeric" maxLength={6} value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456" autoFocus
                    style={{ ...inputStyle, letterSpacing: '0.3em', fontWeight: '700', textAlign: 'center' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.875rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#374151' }}>New Password</label>
                  <div style={{ position: 'relative' }}>
                    <input type={showPass ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                      placeholder="Min. 6 characters"
                      style={{ ...inputStyle, paddingRight: '2.25rem' }} />
                    <button type="button" onClick={() => setShowPass(s => !s)}
                      style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem' }}>
                      {showPass ? '🙈' : '👁'}
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '1.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#374151' }}>Confirm New Password</label>
                  <input type={showPass ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                    style={inputStyle} />
                </div>
                <button type="submit" disabled={loading} style={{ ...saveBtn, background: accent, width: '100%', opacity: loading ? 0.7 : 1 }}>
                  {loading ? 'Resetting...' : 'Reset Password'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const overlay  = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' };
const modal    = { background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '400px', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' };
const header   = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9' };
const closeBtn = { background: '#f1f5f9', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '0.9rem', color: '#64748b' };
const saveBtn  = { padding: '0.65rem 1.75rem', border: 'none', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: '700', color: '#fff', fontSize: '0.875rem' };
const inputStyle = { padding: '0.55rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', color: '#1e293b', width: '100%', boxSizing: 'border-box' };
const linkBtn  = { background: 'none', border: 'none', padding: 0, fontSize: '0.75rem', fontWeight: '600', color: '#1e3a5f', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' };

export default ForgotPasswordModal;
