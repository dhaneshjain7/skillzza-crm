import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// Forces logout after N minutes of no real user interaction — independent of
// the JWT/refresh-token lifetime, which only tracks API activity (any request,
// including background polling) and would otherwise keep a session alive
// indefinitely. Timeout is configurable via VITE_IDLE_TIMEOUT_MINUTES.
const TIMEOUT_MS = (Number(import.meta.env.VITE_IDLE_TIMEOUT_MINUTES) || 30) * 60 * 1000;
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel'];

const IdleLogout = () => {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const timerRef = useRef(null);

  const handleTimeout = useCallback(async () => {
    await logout();
    navigate('/', { replace: true });
  }, [logout, navigate]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const resetTimer = () => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(handleTimeout, TIMEOUT_MS);
    };

    resetTimer();
    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, resetTimer));

    return () => {
      clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, resetTimer));
    };
  }, [isAuthenticated, handleTimeout]);

  return null;
};

export default IdleLogout;
