// Generic login page — receives role config as props
// Used by SuperAdminLogin, AdminLogin, SchoolLogin

import { useState, useCallback } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import GoogleSignInButton from '../components/auth/GoogleSignInButton';
import ForgotPasswordModal from '../components/auth/ForgotPasswordModal';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

const LoginPage = ({ roleConfig }) => {
  const { login, loginWithGoogle, registerSchool, logout } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  const [mode, setMode]         = useState('signin'); // 'signin' | 'register'
  const [form, setForm]         = useState({ name: '', schoolName: '', udiseCode: '', phone: '', spoc: '', spocPhone: '', spocEmail: '', email: '', password: '', confirmPassword: '' });
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const isRegister = roleConfig.allowRegister && mode === 'register';

  const from = location.state?.from?.pathname || roleConfig.dashboardPath;

  const goToDashboard = (role) => {
    const paths = {
      superadmin:  '/superadmin/dashboard',
      admin:       '/admin/dashboard',
      school_user: '/school/dashboard',
    };
    navigate(paths[role] || '/', { replace: true });
  };

  const handleChange = (e) => {
    setError('');
    setForm(p => ({ ...p, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isRegister) {
      const { name, schoolName, udiseCode, phone, spoc, spocPhone, spocEmail, email, password, confirmPassword } = form;
      if (!name || !schoolName || !udiseCode || !phone || !spoc || !spocPhone || !spocEmail || !email || !password) {
        setError('All fields are required.'); return;
      }
      if (!/^\d{10}$/.test(spocPhone.trim())) { setError('SPOC Phone must be exactly 10 digits.'); return; }
      if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
      if (password !== confirmPassword) { setError('Passwords do not match.'); return; }

      setLoading(true);
      const result = await registerSchool({ name, schoolName, udiseCode, phone, spoc, spocPhone, spocEmail, email, password, confirmPassword });
      setLoading(false);

      if (!result.success) { setError(result.message); return; }
      goToDashboard(result.user.role);
      return;
    }

    if (!form.email || !form.password) { setError('Email and password are required.'); return; }

    setLoading(true);
    const result = await login(form.email, form.password);
    setLoading(false);

    if (!result.success) { setError(result.message); return; }

    // Enforce role — can't use superadmin login for school_user account.
    // login() above already authenticated and stored the session for
    // whatever role this account actually is — if it doesn't match this
    // page's role, that session must be torn back down, not just hidden
    // behind an error message, otherwise the user stays silently logged in
    // as the wrong role (e.g. navigating back to "/" would auto-redirect
    // straight into that account's dashboard).
    if (result.user.role !== roleConfig.role && roleConfig.role !== 'any') {
      await logout();
      setError(`This login is for ${roleConfig.label} accounts only.`);
      return;
    }

    goToDashboard(result.user.role);
  };

  // ── Google Sign-In (School only) ──────────────────────────────────────────
  const handleGoogleSuccess = useCallback(async (credential) => {
    setError('');
    setGoogleLoading(true);
    const result = await loginWithGoogle(credential);
    setGoogleLoading(false);

    if (!result.success) { setError(result.message); return; }
    goToDashboard(result.user.role);
  }, [loginWithGoogle]);

  const handleGoogleError = useCallback((msg) => {
    setError(msg || 'Google sign-in failed. Please try again.');
  }, []);

  const showGoogle = roleConfig.role === 'school_user' && GOOGLE_CLIENT_ID;

  return (
    <div style={{ ...s.page, background: roleConfig.pageBg }}>
      <div style={s.card}>

        {/* Back to role select */}
        <Link to="/" style={s.back}>← Back to role selection</Link>

        {/* Brand */}
        <div style={s.brand}>
          <div style={{ ...s.logoBox, background: roleConfig.accent }}>S</div>
          <div>
            <div style={s.brandName}>SKILLZZA</div>
            <div style={s.brandSub}>Customer Relationship Management</div>
          </div>
        </div>

        {/* Role badge */}
        <div style={{ ...s.roleBadge, background: roleConfig.badgeBg, color: roleConfig.accent }}>
          {roleConfig.icon}  {roleConfig.label} Login
        </div>

        <h2 style={s.title}>{isRegister ? 'Register your school' : 'Welcome back'}</h2>
        <p style={s.subtitle}>
          {isRegister
            ? 'Create your school account — you can complete your school profile after signing in'
            : roleConfig.subtitle}
        </p>

        {error && (
          <div style={s.errorBox}>⚠ {error}</div>
        )}

        {/* Google Sign-In — school only */}
        {showGoogle && (
          <>
            <div style={{ marginBottom: '1rem', opacity: googleLoading ? 0.6 : 1, pointerEvents: googleLoading ? 'none' : 'auto' }}>
              <GoogleSignInButton
                clientId={GOOGLE_CLIENT_ID}
                onSuccess={handleGoogleSuccess}
                onError={handleGoogleError}
              />
            </div>
            <div style={s.divider}>
              <div style={s.dividerLine} />
              <span style={s.dividerText}>{isRegister ? 'or register with email' : 'or sign in with email'}</span>
              <div style={s.dividerLine} />
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} style={s.form}>
          {isRegister && (
            <>
              <div style={s.field}>
                <label style={s.label}>Your name</label>
                <input
                  type="text" name="name" value={form.name}
                  onChange={handleChange} placeholder="e.g. Rahul Sharma"
                  style={s.input} autoComplete="name"
                />
              </div>
              <div style={s.field}>
                <label style={s.label}>School name</label>
                <input
                  type="text" name="schoolName" value={form.schoolName}
                  onChange={handleChange} placeholder="e.g. Sunrise Public School"
                  style={s.input} autoComplete="organization"
                />
              </div>
              <div style={s.field}>
                <label style={s.label}>UDISE code</label>
                <input
                  type="text" name="udiseCode" value={form.udiseCode}
                  onChange={handleChange} placeholder="11-digit UDISE code"
                  style={s.input}
                />
              </div>
              <div style={s.field}>
                <label style={s.label}>Phone number</label>
                <input
                  type="tel" name="phone" value={form.phone}
                  onChange={handleChange} placeholder="e.g. 9876543210"
                  style={s.input} autoComplete="tel"
                />
              </div>
              <div style={s.field}>
                <label style={s.label}>School SPOC</label>
                <input
                  type="text" name="spoc" value={form.spoc}
                  onChange={handleChange} placeholder="e.g. Rahul Sharma"
                  style={s.input}
                />
              </div>
              <div style={s.field}>
                <label style={s.label}>SPOC Phone</label>
                <input
                  type="tel" name="spocPhone" value={form.spocPhone}
                  onChange={handleChange} placeholder="10-digit phone number"
                  style={s.input} maxLength={10}
                />
              </div>
              <div style={s.field}>
                <label style={s.label}>SPOC Email</label>
                <input
                  type="email" name="spocEmail" value={form.spocEmail}
                  onChange={handleChange} placeholder="e.g. spoc@school.edu"
                  style={s.input}
                />
              </div>
            </>
          )}

          <div style={s.field}>
            <label style={s.label}>Email address</label>
            <input
              type="email" name="email" value={form.email}
              onChange={handleChange} placeholder={roleConfig.emailPlaceholder}
              style={s.input} autoComplete="email" autoFocus
            />
          </div>

          <div style={s.field}>
            <label style={s.label}>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPass ? 'text' : 'password'} name="password"
                value={form.password} onChange={handleChange}
                placeholder="••••••••"
                style={{ ...s.input, paddingRight: '44px' }}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
              />
              <button type="button" onClick={() => setShowPass(p => !p)}
                style={s.eyeBtn} tabIndex={-1}>
                {showPass ? '🙈' : '👁'}
              </button>
            </div>
            {!isRegister && (
              <button type="button" onClick={() => setShowForgotPassword(true)}
                style={s.forgotBtn}>
                Forgot password?
              </button>
            )}
          </div>

          {isRegister && (
            <div style={s.field}>
              <label style={s.label}>Confirm password</label>
              <input
                type={showPass ? 'text' : 'password'} name="confirmPassword"
                value={form.confirmPassword} onChange={handleChange}
                placeholder="••••••••" style={s.input}
                autoComplete="new-password"
              />
            </div>
          )}

          <button type="submit" disabled={loading}
            style={{ ...s.submitBtn, background: roleConfig.accent, opacity: loading ? 0.7 : 1 }}>
            {loading
              ? (isRegister ? 'Creating account...' : 'Signing in...')
              : (isRegister ? 'Register School' : `Sign in as ${roleConfig.label}`)}
          </button>
        </form>

        {roleConfig.allowRegister && (
          <p style={s.switchMode}>
            {isRegister ? 'Already have an account?' : 'New school on Skillzza?'}{' '}
            <button
              type="button"
              onClick={() => { setError(''); setMode(m => (m === 'signin' ? 'register' : 'signin')); }}
              style={{ ...s.switchBtn, color: roleConfig.accent }}
            >
              {isRegister ? 'Sign in' : 'Register here'}
            </button>
          </p>
        )}

        {showGoogle && (
          <p style={s.googleNote}>
            New here? Just tap "Continue with Google" above — we'll set up your school automatically.
          </p>
        )}

        <p style={s.footer}>Skillzza CRM &copy; {new Date().getFullYear()} · Confidential</p>
      </div>

      {showForgotPassword && (
        <ForgotPasswordModal
          initialEmail={form.email}
          accent={roleConfig.accent}
          onClose={() => setShowForgotPassword(false)}
        />
      )}
    </div>
  );
};

const s = {
  page:      { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Segoe UI', system-ui, sans-serif", padding: '1rem' },
  card:      { background: '#fff', borderRadius: '16px', padding: '2.25rem', width: '100%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  back:      { display: 'inline-block', fontSize: '0.8rem', color: '#64748b', marginBottom: '1.25rem', textDecoration: 'none' },
  brand:     { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.25rem' },
  logoBox:   { width: '40px', height: '40px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1.25rem', fontWeight: '800', flexShrink: 0 },
  brandName: { fontWeight: '700', fontSize: '1rem', letterSpacing: '2px', color: '#1e293b' },
  brandSub:  { fontSize: '0.68rem', color: '#94a3b8' },
  roleBadge: { display: 'inline-block', fontSize: '0.75rem', fontWeight: '600', padding: '0.3rem 0.75rem', borderRadius: '20px', marginBottom: '1rem', letterSpacing: '0.02em' },
  title:     { fontSize: '1.4rem', fontWeight: '700', color: '#1e293b', margin: '0 0 0.25rem' },
  subtitle:  { fontSize: '0.85rem', color: '#64748b', margin: '0 0 1.25rem' },
  errorBox:  { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: '8px', padding: '0.7rem 1rem', fontSize: '0.85rem', marginBottom: '1rem' },
  form:      { display: 'flex', flexDirection: 'column', gap: '1.1rem' },
  field:     { display: 'flex', flexDirection: 'column', gap: '0.35rem' },
  label:     { fontSize: '0.85rem', fontWeight: '500', color: '#374151' },
  input:     { padding: '0.6rem 0.85rem', border: '1.5px solid #d1d5db', borderRadius: '8px', fontSize: '0.9375rem', outline: 'none', width: '100%', boxSizing: 'border-box', color: '#1e293b' },
  eyeBtn:    { position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: 0 },
  forgotBtn: { alignSelf: 'flex-end', background: 'none', border: 'none', padding: 0, marginTop: '0.4rem', fontSize: '0.78rem', fontWeight: '600', color: '#64748b', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' },
  submitBtn: { color: '#fff', border: 'none', borderRadius: '8px', padding: '0.75rem', fontSize: '1rem', fontWeight: '600', cursor: 'pointer', marginTop: '0.25rem', width: '100%', transition: 'opacity 0.2s' },
  footer:    { marginTop: '1.5rem', textAlign: 'center', fontSize: '0.72rem', color: '#94a3b8' },
  divider:   { display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1.25rem 0' },
  dividerLine: { flex: 1, height: '1px', background: '#e2e8f0' },
  dividerText: { fontSize: '0.72rem', color: '#94a3b8', whiteSpace: 'nowrap' },
  googleNote: { fontSize: '0.72rem', color: '#94a3b8', textAlign: 'center', marginTop: '0.875rem' },
  switchMode: { fontSize: '0.82rem', color: '#64748b', textAlign: 'center', marginTop: '1rem', marginBottom: 0 },
  switchBtn:  { background: 'none', border: 'none', padding: 0, fontSize: '0.82rem', fontWeight: '600', cursor: 'pointer', textDecoration: 'underline' },
};

export default LoginPage;
