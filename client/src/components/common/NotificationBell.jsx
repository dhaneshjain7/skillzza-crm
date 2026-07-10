import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import API from '../../api/axios';

const TRIGGER_ICONS = {
  'Status Updated':    '🔄',
  'New Message':       '💬',
  'Document Uploaded': '📄',
  'Admin Assigned':    '👤',
  'Password Changed':  '🔑',
  'School Created':    '🏫',
  'Document Approved': '✅',
  'Document Rejected': '❌',
  'System':            '🔔',
};

const NotificationBell = () => {
  const { socket }                        = useSocket();
  const navigate                          = useNavigate();
  const { user }                          = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unread,        setUnread]        = useState(0);
  const [open,          setOpen]          = useState(false);
  const [loading,       setLoading]       = useState(false);
  const dropdownRef                       = useRef(null);

  // ── Fetch unread count ────────────────────────────────────────────────────
  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await API.get('/notifications/unread-count');
      setUnread(res.data.count || 0);
    } catch (e) { /* silent */ }
  }, []);

  // ── Fetch full list ───────────────────────────────────────────────────────
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/notifications?limit=15');
      setNotifications(res.data.notifications || []);
      setUnread(res.data.unreadCount || 0);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  // Fetch on mount + poll every 30s as fallback
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Real-time socket ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onNew = (notification) => {
      console.log('🔔 New notification received:', notification);
      setNotifications(prev => [notification, ...prev].slice(0, 20));
      setUnread(u => u + 1);
    };

    socket.on('new_notification', onNew);
    return () => socket.off('new_notification', onNew);
  }, [socket]);

  const handleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) fetchNotifications();
  };

  const handleMarkRead = async (id) => {
    try {
      await API.put(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
      setUnread(u => Math.max(0, u - 1));
    } catch (e) { console.error(e); }
  };

  const handleMarkAllRead = async () => {
    try {
      await API.put('/notifications/mark-all-read');
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnread(0);
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    try {
      await API.delete(`/notifications/${id}`);
      setNotifications(prev => prev.filter(n => n._id !== id));
    } catch (e) { console.error(e); }
  };

  const handleClick = (notification) => {
    // Get role from token — most reliable
    let role = '';
    try {
      const token = localStorage.getItem('accessToken');
      if (token) {
        role = JSON.parse(atob(token.split('.')[1])).role;
      }
    } catch (e) {
      role = user?.role || '';
    }

    const type = notification.triggerType;

    // Mark read in background
    if (!notification.isRead) {
      API.put(`/notifications/${notification._id}/read`).then(() => {
        setNotifications(prev => prev.map(n => n._id === notification._id ? { ...n, isRead: true } : n));
        setUnread(u => Math.max(0, u - 1));
      }).catch(() => {});
    }

    // Close dropdown
    setOpen(false);

    // Navigate based on type and role
    if (type === 'New Message') {
      if (role === 'school_user') {
        navigate('/school/messages');
      } else if (notification.relatedSchool?._id) {
        navigate(`/admin/messages?schoolId=${notification.relatedSchool._id}`);
      } else {
        navigate('/admin/messages');
      }
    } else if (type === 'Document Uploaded' || type === 'Document Approved' || type === 'Document Rejected') {
      if (role === 'school_user') {
        navigate('/school/documents');
      } else if (notification.relatedSchool?._id) {
        navigate(`/admin/schools/${notification.relatedSchool._id}/documents`);
      } else {
        navigate('/admin/schools');
      }
    } else if (type === 'Status Updated') {
      if (role === 'school_user') {
        navigate('/school/dashboard');
      } else {
        navigate('/admin/dashboard');
      }
    } else if (type === 'Admin Assigned') {
      navigate('/admin/dashboard');
    } else {
      navigate('/notifications');
    }
  };

  const timeAgo = (date) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)  return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        style={{ position: 'relative', background: open ? '#f1f5f9' : 'none', border: 'none', cursor: 'pointer', padding: '6px 8px', borderRadius: '8px', fontSize: '1.2rem', lineHeight: 1, transition: 'background 0.15s' }}
      >
        🔔
        {unread > 0 && (
          <span style={{ position: 'absolute', top: '0px', right: '0px', background: '#ef4444', color: '#fff', borderRadius: '10px', padding: '1px 5px', fontSize: '0.6rem', fontWeight: '800', minWidth: '16px', textAlign: 'center', lineHeight: '14px', border: '2px solid #fff' }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: '360px', background: '#fff', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.16)', border: '1px solid #f1f5f9', zIndex: 500, overflow: 'hidden' }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.875rem 1rem', borderBottom: '1px solid #f1f5f9', background: '#fafcff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#1e293b' }}>Notifications</span>
              {unread > 0 && (
                <span style={{ background: '#1e3a5f', color: '#fff', borderRadius: '10px', padding: '1px 7px', fontSize: '0.65rem', fontWeight: '700' }}>{unread}</span>
              )}
            </div>
            {unread > 0 && (
              <button onClick={handleMarkAllRead} style={{ background: 'none', border: 'none', color: '#1e3a5f', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontSize: '0.82rem' }}>Loading...</div>
            ) : notifications.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94a3b8' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔔</div>
                <div style={{ fontSize: '0.82rem', fontWeight: '600', color: '#475569' }}>No notifications yet</div>
              </div>
            ) : (
              notifications.map(n => (
                <div key={n._id} onClick={() => handleClick(n)}
                  style={{ display: 'flex', gap: '0.625rem', padding: '0.875rem 1rem', borderBottom: '1px solid #f8fafc', cursor: 'pointer', background: n.isRead ? '#fff' : '#f0f6ff', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = n.isRead ? '#f8fafc' : '#e8f0f9'}
                  onMouseLeave={e => e.currentTarget.style.background = n.isRead ? '#fff' : '#f0f6ff'}
                >
                  <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: n.isRead ? '#f1f5f9' : '#e8f0f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>
                    {TRIGGER_ICONS[n.triggerType] || '🔔'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: n.isRead ? '500' : '700', color: '#1e293b', marginBottom: '2px' }}>{n.title}</div>
                    <div style={{ fontSize: '0.73rem', color: '#64748b', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n.message}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '4px' }}>
                      <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>{timeAgo(n.createdAt)}</span>
                      {!n.isRead && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#1e3a5f', flexShrink: 0 }} />}
                    </div>
                  </div>
                  <button onClick={(e) => handleDelete(n._id, e)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: '0.8rem', padding: '2px', flexShrink: 0, alignSelf: 'flex-start' }}
                    title="Remove">✕</button>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div style={{ padding: '0.625rem 1rem', borderTop: '1px solid #f1f5f9', textAlign: 'center', background: '#fafcff' }}>
              <button onClick={() => { setOpen(false); navigate('/notifications'); }}
                style={{ background: 'none', border: 'none', color: '#1e3a5f', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                View all notifications →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
