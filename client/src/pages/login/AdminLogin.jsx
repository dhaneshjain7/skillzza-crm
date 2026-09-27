import LoginPage from '../LoginPage';
const config = {
  role: 'admin', label: 'Admin', icon: '🏫',
  subtitle: 'Sign in to manage your assigned schools and communicate with school users',
  emailPlaceholder: 'admin@skillzza.com',
  dashboardPath: '/admin/dashboard',
  accent: '#2d5986',
  pageBg: 'linear-gradient(135deg, #1a3a5c 0%, #2d5986 100%)',
  badgeBg: '#eef4fb',
};
const AdminLogin = () => <LoginPage roleConfig={config} />;
export default AdminLogin;
