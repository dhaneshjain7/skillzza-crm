import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useState } from 'react';
import logo from '../../assets/skillzza-logo.png';

const NAV = {
  superadmin: [
    { label: 'Dashboard',     path: '/superadmin/dashboard', icon: '▦' },
    { label: 'Schools',       path: '/superadmin/schools',   icon: '⊞' },
    { label: 'Admins',        path: '/superadmin/admins',    icon: '◈' },
    { label: 'Reports',       path: '/superadmin/reports',   icon: '◫' },
    { label: 'Activity Logs', path: '/superadmin/logs',      icon: '≡' },
    { label: 'Settings',      path: '/superadmin/settings',  icon: '◎' },
  ],
  admin: [
    { label: 'Dashboard',     path: '/admin/dashboard',  icon: '▦' },
    { label: 'My Schools',    path: '/admin/schools',    icon: '⊞' },
    { label: 'Messages',      path: '/admin/messages',   icon: '◉' },
    { label: 'Reports',       path: '/admin/reports',    icon: '◫' },
    { label: 'Activity Logs', path: '/admin/logs',       icon: '≡' },
  ],
  school_user: [
    { label: 'Dashboard',     path: '/school/dashboard',     icon: '▦' },
    { label: 'Documents',     path: '/school/documents',     icon: '◫' },
    { label: 'Messages',      path: '/school/messages',      icon: '◉' },
    { label: 'Activity',      path: '/school/activity',      icon: '📌' },
    { label: 'Profile',       path: '/school/profile',       icon: '◈' },
  ],
};

const THEME = {
  superadmin:  { accent: '#1e3a5f', hover: '#162d4a', active: '#0f1f35' },
  admin:       { accent: '#1a3a5c', hover: '#132d48', active: '#0d2035' },
  school_user: { accent: '#1a3d30', hover: '#12302a', active: '#0a2018' },
};

const Sidebar = ({ collapsed, onToggle }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const role   = user?.role || 'admin';
  const items  = NAV[role] || [];
  const theme  = THEME[role];

  return (
    <aside style={{
      width: collapsed ? '64px' : '240px',
      height: '100vh',
      background: theme.accent,
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      left: 0, top: 0,
      zIndex: 200,
      transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)',
      overflow: 'hidden',
      boxShadow: '2px 0 12px rgba(0,0,0,0.15)',
    }}>
      {/* Logo */}
      <div style={{
        display:'flex', alignItems:'center',
        flexDirection: collapsed ? 'column' : 'row',
        justifyContent: collapsed ? 'center' : 'space-between',
        padding: collapsed ? '10px 0' : '0 14px',
        gap: collapsed ? '8px' : 0,
        height: collapsed ? 'auto' : '64px',
        borderBottom:`1px solid rgba(255,255,255,0.08)`, flexShrink:0,
      }}>
        {collapsed ? (
          <div style={{ width:'48px', height:'48px', background:'#fff', borderRadius:'10px', overflow:'hidden', flexShrink:0 }}>
            <img src={logo} alt="Skillzza" style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'left center' }} />
          </div>
        ) : (
          <div style={{ overflow:'hidden', display:'flex', flexDirection:'column', justifyContent:'center', gap:'3px' }}>
            <div style={{ background:'#fff', borderRadius:'8px', padding:'4px 10px', display:'inline-flex', alignItems:'center', width:'fit-content' }}>
              <img src={logo} alt="Skillzza" style={{ height:'32px', width:'auto', maxWidth:'160px', objectFit:'contain', display:'block' }} />
            </div>
            <div style={{ color:'rgba(255,255,255,0.4)', fontSize:'0.58rem', letterSpacing:'0.08em', textTransform:'uppercase', whiteSpace:'nowrap' }}>{role.replace('_',' ')}</div>
          </div>
        )}
        <button
          onClick={onToggle}
          style={{ background:'rgba(255,255,255,0.08)', border:'none', color:'rgba(255,255,255,0.6)', cursor:'pointer', width:'24px', height:'24px', borderRadius:'4px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.7rem', flexShrink:0, fontFamily:'monospace' }}
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex:1, padding:'0.5rem 0', overflowY:'auto', overflowX:'hidden' }}>
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            title={collapsed ? item.label : ''}
            style={({ isActive }) => ({
              display:'flex', alignItems:'center', gap:'10px',
              padding: collapsed ? '0.7rem' : '0.7rem 1rem',
              justifyContent: collapsed ? 'center' : 'flex-start',
              color: isActive ? '#fff' : 'rgba(255,255,255,0.65)',
              textDecoration:'none',
              background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
              borderLeft: isActive ? '3px solid rgba(255,255,255,0.8)' : '3px solid transparent',
              fontSize:'0.875rem',
              fontWeight: isActive ? '600' : '400',
              transition:'all 0.15s',
              whiteSpace:'nowrap',
              margin:'1px 0',
            })}
          >
            <span style={{ fontSize:'1rem', width:'20px', textAlign:'center', flexShrink:0 }}>{item.icon}</span>
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* User + Logout */}
      <div style={{ padding:'0.75rem', borderTop:'1px solid rgba(255,255,255,0.08)', flexShrink:0 }}>
        {!collapsed && (
          <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'0.5rem 0.25rem', marginBottom:'0.5rem' }}>
            <div style={{ width:'30px', height:'30px', borderRadius:'50%', background:'rgba(255,255,255,0.15)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'700', fontSize:'0.8rem', flexShrink:0 }}>
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <div style={{ overflow:'hidden', flex:1 }}>
              <div style={{ color:'#fff', fontSize:'0.78rem', fontWeight:'600', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{user?.name}</div>
              <div style={{ color:'rgba(255,255,255,0.4)', fontSize:'0.68rem', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{user?.email}</div>
            </div>
          </div>
        )}
        <button
          onClick={async () => { await logout(); navigate('/'); }}
          title="Logout"
          style={{ display:'flex', alignItems:'center', justifyContent: collapsed ? 'center' : 'flex-start', gap:'8px', width:'100%', padding:'0.55rem 0.75rem', background:'rgba(255,255,255,0.08)', border:'none', borderRadius:'6px', color:'rgba(255,255,255,0.7)', cursor:'pointer', fontSize:'0.82rem', fontFamily:'inherit', transition:'background 0.15s' }}
        >
          <span>↩</span>
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
