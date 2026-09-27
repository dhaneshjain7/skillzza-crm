import LoginPage from '../LoginPage';
const config = {
  role: 'superadmin', label: 'Super Admin', icon: '⚙️',
  subtitle: 'Sign in to access the full platform and manage all schools and admins',
  emailPlaceholder: 'superadmin@skillzza.com',
  dashboardPath: '/superadmin/dashboard',
  accent: '#1e3a5f',
  pageBg: 'linear-gradient(135deg, #0f2240 0%, #1e3a5f 100%)',
  badgeBg: '#e8f0f9',
};
const SuperAdminLogin = () => <LoginPage roleConfig={config} />;
export default SuperAdminLogin;
