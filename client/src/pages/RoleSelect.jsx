import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEffect } from 'react';
import logo from '../assets/skillzza-logo.png';

const roles = [
  {
    key:         'superadmin',
    label:       'Super Admin',
    description: 'Full platform access — manage admins, schools, and system settings',
    path:        '/login/superadmin',
    accent:      '#1e3a5f',
    light:       '#e8f0f9',
    icon:        '⚙️',
    badge:       'Highest Privilege',
    badgeColor:  '#1e3a5f',
  },
  {
    key:         'admin',
    label:       'Admin',
    description: 'Manage assigned schools, update status, communicate with school users',
    path:        '/login/admin',
    accent:      '#2d5986',
    light:       '#eef4fb',
    icon:        '🏫',
    badge:       'School Administrator',
    badgeColor:  '#2d5986',
  },
  {
    key:         'school_user',
    label:       'School User',
    description: 'View your school dashboard, upload documents, and communicate with admin',
    path:        '/login/school',
    accent:      '#1e5f4e',
    light:       '#e8f5f1',
    icon:        '🎓',
    badge:       'School Access',
    badgeColor:  '#1e5f4e',
  },
];

const RoleSelect = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();

  // If already logged in redirect to their dashboard
  useEffect(() => {
    if (isAuthenticated && user) {
      const paths = {
        superadmin:  '/superadmin/dashboard',
        admin:       '/admin/dashboard',
        school_user: '/school/dashboard',
      };
      navigate(paths[user.role] || '/', { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.logoWrap}>
          <div style={s.logoImgBox}>
            <img src={logo} alt="Skillzza" style={{ height:'28px', width:'auto', maxWidth:'170px', objectFit:'contain', display:'block' }} />
          </div>
          <div style={s.logoSub}>Customer Relationship Management</div>
        </div>
      </div>

      {/* Hero */}
      <div style={s.hero}>
        <h1 style={s.heroTitle}>Who are you logging in as?</h1>
        <p style={s.heroSub}>Select your role to continue to the right dashboard</p>
      </div>

      {/* Role Cards */}
      <div style={s.grid}>
        {roles.map((role) => (
          <RoleCard key={role.key} role={role} onClick={() => navigate(role.path)} />
        ))}
      </div>

      <p style={s.footer}>Skillzza CRM &copy; {new Date().getFullYear()} · Confidential</p>
    </div>
  );
};

const RoleCard = ({ role, onClick }) => {
  return (
    <button onClick={onClick} style={{ ...s.card, '--accent': role.accent, '--light': role.light }}>
      {/* Top accent bar */}
      <div style={{ ...s.cardBar, background: role.accent }} />

      {/* Icon */}
      <div style={{ ...s.iconWrap, background: role.light }}>
        <span style={s.icon}>{role.icon}</span>
      </div>

      {/* Badge */}
      <div style={{ ...s.badge, background: role.light, color: role.badgeColor }}>
        {role.badge}
      </div>

      {/* Title */}
      <h2 style={{ ...s.cardTitle, color: role.accent }}>{role.label}</h2>

      {/* Description */}
      <p style={s.cardDesc}>{role.description}</p>

      {/* CTA */}
      <div style={{ ...s.cta, background: role.accent }}>
        Login as {role.label} →
      </div>
    </button>
  );
};

const s = {
  page: {
    minHeight:      '100vh',
    background:     'linear-gradient(160deg, #0f2240 0%, #1a3a6e 50%, #1e3a5f 100%)',
    fontFamily:     "'Segoe UI', system-ui, sans-serif",
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    padding:        '0 1rem 3rem',
  },
  header: {
    width:          '100%',
    maxWidth:       '1000px',
    padding:        '1.5rem 0',
    borderBottom:   '1px solid rgba(255,255,255,0.1)',
    marginBottom:   '0',
  },
  logoWrap: {
    display:        'flex',
    alignItems:     'center',
    gap:            '12px',
  },
  logoImgBox: {
    background:     '#fff',
    borderRadius:   '8px',
    padding:        '5px 10px',
    display:        'flex',
    alignItems:     'center',
    flexShrink:     0,
  },
  logoSub: {
    color:          'rgba(255,255,255,0.55)',
    fontSize:       '0.7rem',
  },
  hero: {
    textAlign:      'center',
    padding:        '3rem 1rem 2rem',
  },
  heroTitle: {
    color:          '#fff',
    fontSize:       'clamp(1.6rem, 4vw, 2.4rem)',
    fontWeight:     '700',
    margin:         '0 0 0.75rem',
    letterSpacing:  '-0.02em',
  },
  heroSub: {
    color:          'rgba(255,255,255,0.6)',
    fontSize:       '1rem',
    margin:         0,
  },
  grid: {
    display:        'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap:            '1.5rem',
    width:          '100%',
    maxWidth:       '1000px',
    marginTop:      '1rem',
  },
  card: {
    background:     '#fff',
    border:         'none',
    borderRadius:   '16px',
    padding:        '0',
    cursor:         'pointer',
    textAlign:      'left',
    overflow:       'hidden',
    display:        'flex',
    flexDirection:  'column',
    boxShadow:      '0 4px 24px rgba(0,0,0,0.25)',
    transition:     'transform 0.2s, box-shadow 0.2s',
    outline:        'none',
  },
  cardBar: {
    height:         '5px',
    width:          '100%',
    flexShrink:     0,
  },
  iconWrap: {
    width:          '56px',
    height:         '56px',
    borderRadius:   '12px',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    margin:         '1.5rem 1.5rem 0.75rem',
    flexShrink:     0,
  },
  icon: {
    fontSize:       '1.75rem',
    lineHeight:     1,
  },
  badge: {
    display:        'inline-block',
    fontSize:       '0.7rem',
    fontWeight:     '600',
    letterSpacing:  '0.05em',
    textTransform:  'uppercase',
    padding:        '0.25rem 0.625rem',
    borderRadius:   '20px',
    margin:         '0 1.5rem 0.75rem',
    width:          'fit-content',
  },
  cardTitle: {
    fontSize:       '1.35rem',
    fontWeight:     '700',
    margin:         '0 1.5rem 0.625rem',
  },
  cardDesc: {
    fontSize:       '0.875rem',
    color:          '#64748b',
    margin:         '0 1.5rem',
    lineHeight:     1.6,
    flexGrow:       1,
  },
  cta: {
    color:          '#fff',
    fontWeight:     '600',
    fontSize:       '0.9rem',
    padding:        '0.875rem 1.5rem',
    marginTop:      '1.5rem',
    textAlign:      'center',
    letterSpacing:  '0.01em',
  },
  footer: {
    marginTop:      '3rem',
    color:          'rgba(255,255,255,0.3)',
    fontSize:       '0.75rem',
    textAlign:      'center',
  },
};

export default RoleSelect;
