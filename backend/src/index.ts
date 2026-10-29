import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import db from './database.js';
import { generateToken, authMiddleware, requireRole, AuthUser } from './auth.js';

const app = express();
app.use(cors());
app.use(express.json());

function getUser(req: express.Request): AuthUser {
  return (req as any).user;
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
  if (!user || !bcrypt.compareSync(password, user.password)) {
    res.status(401).json({ error: 'Неверный логин или пароль' });
    return;
  }
  const token = generateToken({ userId: user.id, username: user.username, role: user.role });
  res.json({ token, username: user.username, role: user.role, userId: user.id });
});

app.use('/api', authMiddleware);

app.get('/api/me', (req, res) => {
  const u = getUser(req);
  res.json({ userId: u.userId, username: u.username, role: u.role });
});

// ===== USERS (admin only) =====

app.get('/api/users', requireRole('admin'), (_req, res) => {
  const rows = db.prepare('SELECT id, username, role, created_at FROM users ORDER BY id').all();
  res.json(rows);
});

app.post('/api/users', requireRole('admin'), (req, res) => {
  const { username, password, role } = req.body;
  const validRoles = ['admin', 'applicant', 'reviewer'];
  if (!username || !password) {
    res.status(400).json({ error: 'Логин и пароль обязательны' });
    return;
  }
  if (role && !validRoles.includes(role)) {
    res.status(400).json({ error: 'Недопустимая роль' });
    return;
  }
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) {
    res.status(400).json({ error: 'Пользователь с таким логином уже существует' });
    return;
  }
  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(username, hash, role || 'applicant');
  const created = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

app.put('/api/users/:id', requireRole('admin'), (req, res) => {
  const { username, password, role } = req.body;
  const validRoles = ['admin', 'applicant', 'reviewer'];
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
  if (!existing) { res.status(404).json({ error: 'Пользователь не найден' }); return; }

  if (role && !validRoles.includes(role)) {
    res.status(400).json({ error: 'Недопустимая роль' });
    return;
  }

  if (username && username !== existing.username) {
    const dup = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, req.params.id);
    if (dup) { res.status(400).json({ error: 'Логин уже занят' }); return; }
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, req.params.id);
  }
  if (password) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.params.id);
  }
  if (role) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  }

  const updated = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(req.params.id);
  res.json(updated);
});

app.delete('/api/users/:id', requireRole('admin'), (req, res) => {
  const u = getUser(req);
  if (Number(req.params.id) === u.userId) {
    res.status(400).json({ error: 'Нельзя удалить самого себя' });
    return;
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ===== APPLICATIONS =====

function generateNumber(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

app.get('/api/applications', (req, res) => {
  const u = getUser(req);

  if (u.role === 'admin') {
    const rows = db.prepare(`
      SELECT a.*, u.username as owner_name FROM applications a
      LEFT JOIN users u ON a.owner_id = u.id
      ORDER BY a.updated_at DESC
    `).all();
    res.json(rows);
    return;
  }

  if (u.role === 'applicant') {
    const rows = db.prepare(`
      SELECT a.*, u.username as owner_name FROM applications a
      LEFT JOIN users u ON a.owner_id = u.id
      WHERE a.owner_id = ?
      ORDER BY a.updated_at DESC
    `).all(u.userId);
    res.json(rows);
    return;
  }

  if (u.role === 'reviewer') {
    const rows = db.prepare(`
      SELECT a.*, u.username as owner_name FROM applications a
      LEFT JOIN users u ON a.owner_id = u.id
      WHERE a.status != 'Подготовка'
      ORDER BY a.updated_at DESC
    `).all();
    res.json(rows);
    return;
  }

  res.json([]);
});

app.post('/api/applications', requireRole('admin', 'applicant'), (req, res) => {
  const u = getUser(req);
  const number = generateNumber();
  const result = db.prepare('INSERT INTO applications (number, owner_id) VALUES (?, ?)').run(number, u.userId);
  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

app.get('/api/applications/:id', (req, res) => {
  const u = getUser(req);
  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id) as any;
  if (!row) { res.status(404).json({ error: 'Заявка не найдена' }); return; }

  if (u.role === 'applicant' && row.owner_id !== u.userId) {
    res.status(403).json({ error: 'Нет доступа' });
    return;
  }
  if (u.role === 'reviewer' && row.status === 'Подготовка') {
    res.status(403).json({ error: 'Нет доступа' });
    return;
  }

  res.json(row);
});

app.put('/api/applications/:id', (req, res) => {
  const u = getUser(req);
  const existing = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id) as any;
  if (!existing) { res.status(404).json({ error: 'Заявка не найдена' }); return; }

  if (u.role === 'applicant') {
    if (existing.owner_id !== u.userId) { res.status(403).json({ error: 'Нет доступа' }); return; }
    if (existing.status !== 'Подготовка') { res.status(400).json({ error: 'Заявку можно редактировать только в статусе "Подготовка"' }); return; }
  }
  if (u.role === 'reviewer') {
    res.status(403).json({ error: 'Проверяющий не может редактировать заявки' });
    return;
  }

  const fields = [
    'email', 'phone', 'project_name', 'project_details', 'project_description',
    'project_duration', 'org_name', 'org_director', 'org_inn', 'org_ogrn', 'org_reg_date'
  ];

  const updates: string[] = [];
  const values: any[] = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = ?`);
      values.push(req.body[f]);
    }
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(req.params.id);
    db.prepare(`UPDATE applications SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  const updated = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  res.json(updated);
});

app.post('/api/applications/:id/submit', (req, res) => {
  const u = getUser(req);
  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id) as any;
  if (!row) { res.status(404).json({ error: 'Заявка не найдена' }); return; }

  if (u.role === 'applicant' && row.owner_id !== u.userId) {
    res.status(403).json({ error: 'Нет доступа' });
    return;
  }
  if (u.role === 'reviewer') {
    res.status(403).json({ error: 'Проверяющий не может подавать заявки' });
    return;
  }
  if (row.status !== 'Подготовка') {
    res.status(400).json({ error: 'Заявку можно подать только из статуса "Подготовка"' });
    return;
  }

  db.prepare("UPDATE applications SET status = 'Подана', updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  const updated = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  res.json(updated);
});

app.post('/api/applications/:id/status', (req, res) => {
  const u = getUser(req);
  const { status } = req.body;
  const allowed = ['Подготовка', 'Подана', 'На рассмотрении', 'Отклонена', 'Победитель'];
  if (!allowed.includes(status)) {
    res.status(400).json({ error: 'Недопустимый статус' });
    return;
  }

  if (u.role === 'applicant') {
    res.status(403).json({ error: 'Заявитель не может менять статус' });
    return;
  }

  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id) as any;
  if (!row) { res.status(404).json({ error: 'Заявка не найдена' }); return; }

  db.prepare("UPDATE applications SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, req.params.id);
  const updated = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  res.json(updated);
});

app.delete('/api/applications/:id', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM applications WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
