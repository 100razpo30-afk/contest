import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { Application, Role, roleLabels } from '../types';

const statusColors: Record<string, string> = {
  'Подготовка': '#f0ad4e',
  'Подана': '#5bc0de',
  'На рассмотрении': '#0275d8',
  'Отклонена': '#d9534f',
  'Победитель': '#5cb85c',
};

export default function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const username = localStorage.getItem('username') || '';
  const role = (localStorage.getItem('role') || 'applicant') as Role;

  const loadApps = async () => {
    try {
      const { data } = await api.get('/api/applications');
      setApps(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadApps(); }, []);

  const createApp = async () => {
    const { data } = await api.post('/api/applications');
    navigate(`/applications/${data.id}`);
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login');
  };

  const formatDate = (d: string) => {
    if (!d) return '';
    return new Date(d).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const canCreate = role === 'admin' || role === 'applicant';

  if (loading) return <div className="loading">Загрузка...</div>;

  return (
    <div className="page">
      <div className="sidebar">
        <div className="sidebar-user">
          <strong>{username}</strong>
          <div className="sidebar-role">{roleLabels[role]}</div>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-item active">Все заявки</div>
          {role === 'admin' && (
            <div className="nav-item" onClick={() => navigate('/users')}>Пользователи</div>
          )}
        </nav>
        <button className="btn btn-outline" onClick={handleLogout}>Выйти</button>
      </div>
      <div className="main-content">
        <div className="page-header">
          <h1>
            {role === 'applicant' ? 'Мои заявки' : 'Все заявки'} ({apps.length})
          </h1>
          {canCreate && (
            <button className="btn btn-primary" onClick={createApp}>+ Новая заявка</button>
          )}
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Номер заявки</th>
              <th>Статус</th>
              {role !== 'applicant' && <th>Заявитель</th>}
              <th>Дата подачи</th>
              <th>Дата изменения</th>
            </tr>
          </thead>
          <tbody>
            {apps.map((app) => (
              <tr key={app.id} onClick={() => navigate(`/applications/${app.id}`)} className="clickable-row">
                <td>{app.id}</td>
                <td>{app.number}</td>
                <td>
                  <span className="status-badge" style={{ backgroundColor: statusColors[app.status] || '#999' }}>
                    {app.status}
                  </span>
                </td>
                {role !== 'applicant' && <td>{app.owner_name || '—'}</td>}
                <td>{formatDate(app.created_at)}</td>
                <td>{formatDate(app.updated_at)}</td>
              </tr>
            ))}
            {apps.length === 0 && (
              <tr><td colSpan={role !== 'applicant' ? 6 : 5} className="empty-row">Заявок пока нет</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
