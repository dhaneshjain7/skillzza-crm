import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import PrivateRoute  from './routes/PrivateRoute';
import RoleRoute     from './routes/RoleRoute';

import RoleSelect      from './pages/RoleSelect';
import SuperAdminLogin from './pages/login/SuperAdminLogin';
import AdminLogin      from './pages/login/AdminLogin';
import SchoolLogin     from './pages/login/SchoolLogin';
import Unauthorized    from './pages/Unauthorized';
import Notifications   from './pages/Notifications';

import SuperAdminDashboard   from './pages/superadmin/Dashboard';
import { SuperAdminSchools } from './pages/superadmin/Schools';
import SuperAdminReports     from './pages/superadmin/Reports';
import AuditTrail            from './pages/superadmin/AuditTrail';
import AdminsManagement      from './pages/superadmin/Admins';
import AdminActivity         from './pages/superadmin/AdminActivity';

import AdminDashboard        from './pages/admin/Dashboard';
import { AdminSchools }      from './pages/superadmin/Schools';
import AdminDocuments        from './pages/admin/Documents';
import AdminMessages         from './pages/admin/Messages';
import AdminReports          from './pages/admin/Reports';
import AdminSchoolDetail      from './pages/admin/SchoolDetail';
import AdminActivityPage     from './pages/admin/Activity';

import SchoolDashboard       from './pages/school/Dashboard';
import SchoolDocuments       from './pages/school/Documents';
import SchoolMessages        from './pages/school/Messages';
import SchoolActivity        from './pages/school/Activity';
import SchoolProfile         from './pages/school/Profile';

const RootRedirect = () => {
  const { isAuthenticated, user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/" replace />;
  const paths = { superadmin: '/superadmin/dashboard', admin: '/admin/dashboard', school_user: '/school/dashboard' };
  return <Navigate to={paths[user?.role] || '/'} replace />;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/"                 element={<RoleSelect />} />
    <Route path="/login/superadmin" element={<SuperAdminLogin />} />
    <Route path="/login/admin"      element={<AdminLogin />} />
    <Route path="/login/school"     element={<SchoolLogin />} />
    <Route path="/login"            element={<Navigate to="/" replace />} />
    <Route path="/unauthorized"     element={<Unauthorized />} />
    <Route path="/dashboard"        element={<RootRedirect />} />

    {/* SuperAdmin */}
    <Route element={<RoleRoute roles={['superadmin']} />}>
      <Route path="/superadmin/dashboard"                   element={<SuperAdminDashboard />} />
      <Route path="/superadmin/schools"                     element={<SuperAdminSchools />} />
      <Route path="/superadmin/schools/:schoolId/documents" element={<AdminDocuments />} />
      <Route path="/superadmin/schools/:schoolId"           element={<AdminSchoolDetail />} />
      <Route path="/superadmin/reports"                     element={<SuperAdminReports />} />
      <Route path="/superadmin/admins"                      element={<AdminsManagement />} />
      <Route path="/superadmin/admins/:adminId/activity"    element={<AdminActivity />} />
      <Route path="/superadmin/logs"                        element={<AuditTrail />} />
    </Route>

    {/* Admin */}
    <Route element={<RoleRoute roles={['superadmin', 'admin']} />}>
      <Route path="/admin/dashboard"                        element={<AdminDashboard />} />
      <Route path="/admin/schools"                          element={<AdminSchools />} />
      <Route path="/admin/schools/:schoolId/documents"      element={<AdminDocuments />} />
      <Route path="/admin/schools/:schoolId"                element={<AdminSchoolDetail />} />
      <Route path="/admin/messages"                         element={<AdminMessages />} />
      <Route path="/admin/activity"                         element={<AdminActivityPage />} />
      <Route path="/admin/reports"                          element={<AdminReports />} />
      <Route path="/admin/logs"                             element={<AuditTrail />} />
    </Route>

    {/* School */}
    <Route element={<RoleRoute roles={['school_user']} />}>
      <Route path="/school/dashboard"  element={<SchoolDashboard />} />
      <Route path="/school/documents"  element={<SchoolDocuments />} />
      <Route path="/school/messages"   element={<SchoolMessages />} />
      <Route path="/school/activity"   element={<SchoolActivity />} />
      <Route path="/school/profile"    element={<SchoolProfile />} />
    </Route>

    {/* Shared */}
    <Route element={<PrivateRoute />}>
      <Route path="/notifications" element={<Notifications />} />
    </Route>

    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <SocketProvider>
        <AppRoutes />
      </SocketProvider>
    </AuthProvider>
  </BrowserRouter>
);

export default App;
