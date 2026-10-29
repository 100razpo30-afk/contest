import { useEffect, useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { User, Role, roleLabels } from '../types';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState({ username: '', password: '', role: 'applicant' as Role });
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const username = localStorage.getItem('username') || 'admin';
  const role = localStorage.getItem('role') as Role || 'admin';

  const loadUsers = async () => {
    const { data } = await api.get('/api/users');
    setUsers(data);
  };

  useEffect(() => { loadUsers(); }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (editingUser) {
        const payload: any = { role: form.role };
        if (form.username !== editingUser.username) payload.username = form.username;
        if (form.password) payload.password = form.password;
        await api.put(`/api/users/${editingUser.id}`, payload);
      } else {
        if (!form.password) { setError('Пароль обязателен'); return; }
        await api.post('/api/users', form);
      }
      setShowForm(false);
      setEditingUser(null);
      setForm({ username: '', password: '', role: 'applicant' });
      loadUsers();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка');
    }
  };

  const startEdit = (user: User) => {
    setEditingUser(user);
    setForm({ username: user.username, password: '', role: user.role });
    setShowForm(true);
    setError('');
  };

  const handleDelete = async (user: User) => {
    if (!confirm(`Удалить пользователя ${user.username}?`)) return;
    try {
      await api.delete(`/api/users/${user.id}`);
      loadUsers();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Ошибка');
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login');
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
          <h1>Пользователи ({users.length})</h1>
          <button className="btn btn-primary" onClick={() => {
            setEditingUser(null);
            setForm({ username: '', password: '', role: 'applicant' });
            setShowForm(true);
            setError('');
          }}>+ Новый пользователь</button>
        </div>

        {showForm && (
          <div className="user-form-card">
            <h3>{editingUser ? 'Редактирование пользователя' : 'Новый пользователь'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Логин</label>
                  <input
                    type="text"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>{editingUser ? 'Новый пароль (оставьте пустым)' : 'Пароль'}</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required={!editingUser}
                  />
                </div>
                <div className="form-group">
                  <label>Роль</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                  >
                    <option value="admin">Администратор</option>
                    <option value="applicant">Заявитель</option>
                    <option value="reviewer">Проверяющий</option>
                  </select>
                </div>
              </div>
              {error && <div className="error-msg">{error}</div>}
              <div className="form-actions">
                <button type="submit" className="btn btn-primary">
                  {editingUser ? 'Сохранить' : 'Создать'}
                </button>
                <button type="button" className="btn btn-outline" onClick={() => { setShowForm(false); setEditingUser(null); }}>
                  Отмена
                </button>
              </div>
            </form>
          </div>
        )}

        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Логин</th>
              <th>Роль</th>
              <th>Дата создания</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.id}</td>
                <td>{user.username}</td>
                <td>
                  <span className={`role-badge role-${user.role}`}>
                    {roleLabels[user.role]}
                  </span>
                </td>
                <td>{new Date(user.created_at).toLocaleString('ru-RU')}</td>
                <td>
                  <div className="table-actions">
                    <button className="btn btn-small btn-outline" onClick={() => startEdit(user)}>Изменить</button>
                    <button className="btn btn-small btn-danger-outline" onClick={() => handleDelete(user)}>Удалить</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
