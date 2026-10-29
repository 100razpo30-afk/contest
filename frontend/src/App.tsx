import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ApplicationsPage from './pages/ApplicationsPage';
import ApplicationDetailPage from './pages/ApplicationDetailPage';
import UsersPage from './pages/UsersPage';
import keycloak from './keycloak';

function AdminRoute({ children }: { children: React.ReactNode }) {
  const roles: string[] = keycloak.tokenParsed?.resource_access?.contest?.roles || [];
  if (!roles.includes('admin')) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ApplicationsPage />} />
        <Route path="/applications/:id" element={<ApplicationDetailPage />} />
        <Route path="/users" element={<AdminRoute><UsersPage /></AdminRoute>} />
      </Routes>
    </BrowserRouter>
  );
}
