import { useEffect, useState, ChangeEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import keycloak from '../keycloak';
import { Application, Role } from '../types';

const statusColors: Record<string, string> = {
  'Подготовка': '#f0ad4e',
  'Подана': '#5bc0de',
  'На рассмотрении': '#0275d8',
  'Отклонена': '#d9534f',
  'Победитель': '#5cb85c',
};

type Tab = 'general' | 'project' | 'organization';

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [app, setApp] = useState<Application | null>(null);
  const [tab, setTab] = useState<Tab>('general');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const clientRoles: string[] = keycloak.tokenParsed?.resource_access?.contest?.roles || [];
  const role: Role = clientRoles.includes('admin') ? 'admin'
    : clientRoles.includes('reviewer') ? 'reviewer'
    : 'applicant';
  const userId = keycloak.tokenParsed?.sub || '';

  const load = async () => {
    try {
      const { data } = await api.get(`/api/applications/${id}`);
      setApp(data);
    } catch {
      navigate('/');
    }
  };

  useEffect(() => { load(); }, [id]);

  const handleChange = (field: keyof Application) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!app) return;
    setApp({ ...app, [field]: e.target.value });
    setSaved(false);
  };

  const handleSave = async () => {
    if (!app) return;
    setSaving(true);
    try {
      const { data } = await api.put(`/api/applications/${id}`, {
        email: app.email,
        phone: app.phone,
        project_name: app.project_name,
        project_details: app.project_details,
        project_description: app.project_description,
        project_duration: Number(app.project_duration),
        org_name: app.org_name,
        org_director: app.org_director,
        org_inn: app.org_inn,
        org_ogrn: app.org_ogrn,
        org_reg_date: app.org_reg_date,
      });
      setApp(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!app) return;
    await handleSave();
    try {
      const { data } = await api.post(`/api/applications/${id}/submit`);
      setApp(data);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Ошибка при подаче заявки');
    }
  };

  const handleStatusChange = async (status: string) => {
    try {
      const { data } = await api.post(`/api/applications/${id}/status`, { status });
      setApp(data);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Ошибка при смене статуса');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Удалить заявку?')) return;
    await api.delete(`/api/applications/${id}`);
    navigate('/');
  };

  if (!app) return <div className="loading">Загрузка...</div>;

  const isOwner = app.owner_id === userId;
  const canEdit = (role === 'admin' || (role === 'applicant' && isOwner)) && app.status === 'Подготовка';
  const canSubmit = (role === 'admin' || (role === 'applicant' && isOwner)) && app.status === 'Подготовка';
  const canChangeStatus = role === 'admin' || role === 'reviewer';
  const canDelete = role === 'admin';

  const tabs: { key: Tab; label: string }[] = [
    { key: 'general', label: 'Общее' },
    { key: 'project', label: 'О проекте' },
    { key: 'organization', label: 'Организация/ИП' },
  ];

  return (
    <div className="detail-page">
      <div className="detail-header">
        <button className="btn btn-back" onClick={() => navigate('/')}>← Назад</button>
        <span className="detail-number">Заявка #{app.number}</span>
        <span className="status-badge" style={{ backgroundColor: statusColors[app.status] || '#999' }}>
          {app.status}
        </span>
        {canEdit && <span className="editable-label">✏️ Редактирование</span>}
        {!canEdit && <span className="readonly-label">🔒 Режим чтения</span>}
      </div>

      <div className="detail-actions">
        {canEdit && (
          <>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
            <button className="btn btn-success" onClick={handleSubmit}>Подать заявку</button>
          </>
        )}
        {canChangeStatus && app.status === 'Подана' && (
          <button className="btn btn-primary" onClick={() => handleStatusChange('На рассмотрении')}>
            Взять на рассмотрение
          </button>
        )}
        {canChangeStatus && app.status === 'На рассмотрении' && (
          <>
            <button className="btn btn-success" onClick={() => handleStatusChange('Победитель')}>Победитель</button>
            <button className="btn btn-danger" onClick={() => handleStatusChange('Отклонена')}>Отклонить</button>
          </>
        )}
        {canChangeStatus && (app.status === 'На рассмотрении' || app.status === 'Отклонена') && (
          <button className="btn btn-outline" onClick={() => handleStatusChange('Подготовка')}>
            Вернуть на подготовку
          </button>
        )}
        {canDelete && <button className="btn btn-danger-outline" onClick={handleDelete}>Удалить</button>}
        {saved && <span className="save-indicator">✓ Сохранено</span>}
      </div>

      <div className="detail-body">
        <div className="tabs-sidebar">
          {tabs.map((t) => (
            <div
              key={t.key}
              className={`tab-item ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </div>
          ))}
        </div>

        <div className="tab-content">
          {tab === 'general' && (
            <div className="form-section">
              <h2>Общее</h2>
              <div className="form-grid">
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={app.email} onChange={handleChange('email')} disabled={!canEdit} />
                </div>
                <div className="form-group">
                  <label>Телефон</label>
                  <input type="tel" value={app.phone} onChange={handleChange('phone')} disabled={!canEdit} />
                </div>
                <div className="form-group">
                  <label>Организация</label>
                  <input type="text" value={app.org_name} disabled className="readonly-field" />
                </div>
                <div className="form-group">
                  <label>Название проекта</label>
                  <input type="text" value={app.project_name} disabled className="readonly-field" />
                </div>
              </div>
              <div className="form-info">
                <div><strong>Дата создания:</strong> {new Date(app.created_at).toLocaleString('ru-RU')}</div>
                <div><strong>Дата изменения:</strong> {new Date(app.updated_at).toLocaleString('ru-RU')}</div>
              </div>
            </div>
          )}

          {tab === 'project' && (
            <div className="form-section">
              <h2>О проекте</h2>
              <div className="form-grid">
                <div className="form-group full-width">
                  <label>Название проекта</label>
                  <input type="text" value={app.project_name} onChange={handleChange('project_name')} disabled={!canEdit} />
                </div>
                <div className="form-group full-width">
                  <label>Детализация проекта</label>
                  <textarea value={app.project_details} onChange={handleChange('project_details')} disabled={!canEdit} rows={4} />
                </div>
                <div className="form-group full-width">
                  <label>Описание проекта</label>
                  <textarea value={app.project_description} onChange={handleChange('project_description')} disabled={!canEdit} rows={4} />
                </div>
                <div className="form-group">
                  <label>Срок реализации проекта (мес.)</label>
                  <input type="number" value={app.project_duration} onChange={handleChange('project_duration')} disabled={!canEdit} min={0} />
                </div>
              </div>
            </div>
          )}

          {tab === 'organization' && (
            <div className="form-section">
              <h2>Организация/ИП</h2>
              <div className="form-grid">
                <div className="form-group full-width">
                  <label>Наименование организации</label>
                  <input type="text" value={app.org_name} onChange={handleChange('org_name')} disabled={!canEdit} />
                </div>
                <div className="form-group full-width">
                  <label>ФИО руководителя</label>
                  <input type="text" value={app.org_director} onChange={handleChange('org_director')} disabled={!canEdit} />
                </div>
                <div className="form-group">
                  <label>ИНН</label>
                  <input type="text" value={app.org_inn} onChange={handleChange('org_inn')} disabled={!canEdit} />
                </div>
                <div className="form-group">
                  <label>ОГРНИП</label>
                  <input type="text" value={app.org_ogrn} onChange={handleChange('org_ogrn')} disabled={!canEdit} />
                </div>
                <div className="form-group">
                  <label>Дата регистрации</label>
                  <input type="date" value={app.org_reg_date} onChange={handleChange('org_reg_date')} disabled={!canEdit} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
