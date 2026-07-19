import LoginPage from '../LoginPage';
const config = {
  role: 'school_user', label: 'School User', icon: '🎓',
  subtitle: 'Sign in to view your school dashboard, upload documents and message your admin',
  emailPlaceholder: 'school@skillzza.com',
  dashboardPath: '/school/dashboard',
  accent: '#1e5f4e',
  pageBg: 'linear-gradient(135deg, #0f3329 0%, #1e5f4e 100%)',
  badgeBg: '#e8f5f1',
  allowRegister: true,
  hint: 'school@skillzza.com / School@1234',
};
const SchoolLogin = () => <LoginPage roleConfig={config} />;
export default SchoolLogin;
