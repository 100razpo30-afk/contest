import { useNavigate } from 'react-router-dom';
import keycloak from '../keycloak';
import { Role, roleLabels } from '../types';

function getRole(): Role {
  const roles: string[] = keycloak.tokenParsed?.resource_access?.contest?.roles || [];
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('reviewer')) return 'reviewer';
  return 'applicant';
}

export default function UsersPage() {
  const navigate = useNavigate();
  const username = keycloak.tokenParsed?.preferred_username || 'admin';
  const role = getRole();

  const handleLogout = () => {
    keycloak.logout({ redirectUri: window.location.origin });
  };

  const openKeycloak = () => {
    window.open('https://keycloak.local.lan/admin/kontent/console/#/kontent/users', '_blank');
  };

  return (
    <div className="page">
      <div className="sidebar">
        <div className="sidebar-user">
          <strong>{username}</strong>
          <div className="sidebar-role">{roleLabels[role]}</div>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-item" onClick={() => navigate('/')}>Все заявки</div>
          <div className="nav-item active">Пользователи</div>
        </nav>
        <button className="btn btn-outline" onClick={handleLogout}>Выйти</button>
      </div>
      <div className="main-content">
        <div className="page-header">
          <h1>Управление пользователями</h1>
        </div>
        <div className="user-form-card">
          <p>Пользователи управляются через Keycloak.</p>
          <button className="btn btn-primary" onClick={openKeycloak}>
            Открыть Keycloak Admin Console
          </button>
        </div>
      </div>
    </div>
  );
}
