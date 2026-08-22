import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import NotificationBell from '../common/NotificationBell';
import ChangePasswordModal from '../common/ChangePasswordModal';
import { useAuth } from '../../context/AuthContext';

const TITLES = {
  '/superadmin/dashboard': 'Dashboard',
  '/superadmin/schools':   'All Schools',
  '/superadmin/admins':    'Admin Management',
  '/superadmin/reports':   'Reports',
  '/superadmin/logs':      'Activity Logs',
  '/superadmin/settings':  'Settings',
  '/admin/dashboard':      'Dashboard',
  '/admin/schools':        'My Schools',
  '/admin/messages':       'Messages',
  '/admin/reports':        'Reports',
  '/admin/logs':           'Activity Logs',
  '/school/dashboard':     'My Dashboard',
  '/school/documents':     'Documents',
  '/school/messages':      'Messages',
  '/school/activity':      'Activity',
  '/school/profile':       'School Profile',
};

const ROLE_LABEL = {
  superadmin:  'SuperAdmin',
  admin:       'Admin',
  school_user: 'School',
};

const ROLE_ACCENT = {
  superadmin:  '#1e3a5f',
  admin:       '#1a3a5c',
  school_user: '#1a3d30',
};

const Layout = ({ children }) => {
  const [collapsed, setCollapsed] = useState(window.innerWidth < 768);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const location = useLocation();
  const { user } = useAuth();
  const title    = TITLES[location.pathname] || 'Skillzza CRM';
  const sideW    = collapsed ? 64 : 240;
  const accent   = ROLE_ACCENT[user?.role] || '#1e3a5f';

  useEffect(() => {
    const onResize = () => { if (window.innerWidth < 900) setCollapsed(true); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'#f1f5f9', fontFamily:"'Segoe UI',system-ui,sans-serif" }}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(p => !p)} />

      <div style={{ marginLeft:`${sideW}px`, flex:1, display:'flex', flexDirection:'column', minHeight:'100vh', transition:'margin-left 0.25s cubic-bezier(0.4,0,0.2,1)', minWidth:0 }}>

        {/* Topbar */}
        <header style={{ background:'#fff', borderBottom:'1px solid #e2e8f0', padding:'0 1.5rem', height:'64px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:100, flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
            <h1 style={{ margin:0, fontSize:'1.1rem', fontWeight:'700', color:'#1e293b' }}>{title}</h1>
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
            <span style={{ fontSize:'0.75rem', color:'#94a3b8' }}>
              {new Date().toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short', year:'numeric' })}
            </span>

            {/* Notification Bell */}
            <NotificationBell />

            {/* Avatar — click to change password */}
            {ROLE_LABEL[user?.role] ? (
              <button onClick={() => setShowChangePassword(true)} title="Change password"
                style={{ height:'32px', padding:'0 0.9rem', borderRadius:'16px', background: accent, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'700', fontSize:'0.8rem', cursor:'pointer', whiteSpace:'nowrap', border:'none', fontFamily:'inherit' }}>
                {ROLE_LABEL[user?.role]}
              </button>
            ) : (
              <button onClick={() => setShowChangePassword(true)} title="Change password"
                style={{ width:'32px', height:'32px', borderRadius:'50%', background: accent, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'700', fontSize:'0.875rem', cursor:'pointer', border:'none', fontFamily:'inherit' }}>
                {user?.name?.[0]?.toUpperCase()}
              </button>
            )}
          </div>
        </header>

        {/* Content */}
        <main style={{ padding:'1.5rem', flex:1, maxWidth:'1400px', width:'100%', boxSizing:'border-box' }}>
          {children}
        </main>
      </div>

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </div>
  );
};

export default Layout;
