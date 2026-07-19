import { createContext, useContext, useEffect, useReducer, useCallback } from 'react';
import API from '../api/axios';

const AuthContext = createContext(null);

const initialState = {
  user:            null,
  isLoading:       true,
  isAuthenticated: false,
  error:           null,
};

const authReducer = (state, action) => {
  switch (action.type) {
    case 'SET_LOADING':    return { ...state, isLoading: action.payload };
    case 'LOGIN_SUCCESS':  return { ...state, user: action.payload, isAuthenticated: true, isLoading: false, error: null };
    case 'LOGOUT':         return { ...state, user: null, isAuthenticated: false, isLoading: false, error: null };
    case 'SET_ERROR':      return { ...state, error: action.payload, isLoading: false };
    case 'UPDATE_USER':    return { ...state, user: { ...state.user, ...action.payload } };
    default:               return state;
  }
};

export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Verify stored token on mount
  useEffect(() => {
    const verifyToken = async () => {
      const token = localStorage.getItem('accessToken');
      if (!token) { dispatch({ type: 'SET_LOADING', payload: false }); return; }
      try {
        const { data } = await API.get('/auth/me');
        dispatch({ type: 'LOGIN_SUCCESS', payload: data.user });
      } catch {
        localStorage.removeItem('accessToken');
        dispatch({ type: 'LOGOUT' });
      }
    };
    verifyToken();
  }, []);

  const login = useCallback(async (email, password) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const { data } = await API.post('/auth/login', { email, password });
      localStorage.setItem('accessToken', data.accessToken);
      dispatch({ type: 'LOGIN_SUCCESS', payload: data.user });
      return { success: true, user: data.user };
    } catch (err) {
      const message = err.response?.data?.message || 'Login failed. Please try again.';
      dispatch({ type: 'SET_ERROR', payload: message });
      return { success: false, message };
    }
  }, []);

  // Email/password self-registration — School login page only
  const registerSchool = useCallback(async (formData) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const { data } = await API.post('/auth/register/school', formData);
      localStorage.setItem('accessToken', data.accessToken);
      dispatch({ type: 'LOGIN_SUCCESS', payload: data.user });
      return { success: true, user: data.user };
    } catch (err) {
      const message = err.response?.data?.message || 'Registration failed. Please try again.';
      dispatch({ type: 'SET_ERROR', payload: message });
      return { success: false, message };
    }
  }, []);

  // Google Sign-In — currently used by the School login page
  const loginWithGoogle = useCallback(async (credential) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const { data } = await API.post('/auth/google/school', { credential });
      localStorage.setItem('accessToken', data.accessToken);
      dispatch({ type: 'LOGIN_SUCCESS', payload: data.user });
      return { success: true, user: data.user };
    } catch (err) {
      const message = err.response?.data?.message || 'Google sign-in failed. Please try again.';
      dispatch({ type: 'SET_ERROR', payload: message });
      return { success: false, message };
    }
  }, []);

  const logout = useCallback(async () => {
    try { await API.post('/auth/logout'); } catch {}
    finally {
      localStorage.removeItem('accessToken');
      dispatch({ type: 'LOGOUT' });
    }
  }, []);

  const updateUser = useCallback((updates) => {
    dispatch({ type: 'UPDATE_USER', payload: updates });
  }, []);

  const isSuperAdmin = state.user?.role === 'superadmin';
  const isAdmin      = state.user?.role === 'admin' || isSuperAdmin;
  const isSchoolUser = state.user?.role === 'school_user';

  return (
    <AuthContext.Provider value={{ ...state, login, loginWithGoogle, registerSchool, logout, updateUser, isSuperAdmin, isAdmin, isSchoolUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
};

export default AuthContext;
