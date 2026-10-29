import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import pool, { initDb } from './database.js';
import { generateToken, authMiddleware, requireRole, AuthUser } from './auth.js';

const app = express();
app.use(cors());
app.use(express.json());

function getUser(req: express.Request): AuthUser {
  return (req as any).user;
}

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'db unavailable' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  const user = rows[0];
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

app.get('/api/users', requireRole('admin'), async (_req, res) => {
  const { rows } = await pool.query('SELECT id, username, role, created_at FROM users ORDER BY id');
  res.json(rows);
});

app.post('/api/users', requireRole('admin'), async (req, res) => {
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
  const { rows: existing } = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
  if (existing.length > 0) {
    res.status(400).json({ error: 'Пользователь с таким логином уже существует' });
    return;
  }
  const hash = bcrypt.hashSync(password, 10);
  const { rows } = await pool.query(
    'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username, role, created_at',
    [username, hash, role || 'applicant']
  );
  res.status(201).json(rows[0]);
});

app.put('/api/users/:id', requireRole('admin'), async (req, res) => {
  const { username, password, role } = req.body;
  const validRoles = ['admin', 'applicant', 'reviewer'];
  const { rows: existingRows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
  const existing = existingRows[0];
  if (!existing) { res.status(404).json({ error: 'Пользователь не найден' }); return; }

  if (role && !validRoles.includes(role)) {
    res.status(400).json({ error: 'Недопустимая роль' });
    return;
  }

  if (username && username !== existing.username) {
    const { rows: dup } = await pool.query('SELECT id FROM users WHERE username = $1 AND id != $2', [username, req.params.id]);
    if (dup.length > 0) { res.status(400).json({ error: 'Логин уже занят' }); return; }
    await pool.query('UPDATE users SET username = $1 WHERE id = $2', [username, req.params.id]);
  }
  if (password) {
    const hash = bcrypt.hashSync(password, 10);
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hash, req.params.id]);
  }
  if (role) {
    await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, req.params.id]);
  }

  const { rows } = await pool.query('SELECT id, username, role, created_at FROM users WHERE id = $1', [req.params.id]);
  res.json(rows[0]);
});

app.delete('/api/users/:id', requireRole('admin'), async (req, res) => {
  const u = getUser(req);
  if (Number(req.params.id) === u.userId) {
    res.status(400).json({ error: 'Нельзя удалить самого себя' });
    return;
  }
  await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// ===== APPLICATIONS =====

function generateNumber(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

app.get('/api/applications', async (req, res) => {
  const u = getUser(req);

  if (u.role === 'admin') {
    const { rows } = await pool.query(`
      SELECT a.*, u.username as owner_name FROM applications a
      LEFT JOIN users u ON a.owner_id = u.id
      ORDER BY a.updated_at DESC
    `);
    res.json(rows);
    return;
  }

  if (u.role === 'applicant') {
    const { rows } = await pool.query(`
      SELECT a.*, u.username as owner_name FROM applications a
      LEFT JOIN users u ON a.owner_id = u.id
      WHERE a.owner_id = $1
      ORDER BY a.updated_at DESC
    `, [u.userId]);
    res.json(rows);
    return;
  }

  if (u.role === 'reviewer') {
    const { rows } = await pool.query(`
      SELECT a.*, u.username as owner_name FROM applications a
      LEFT JOIN users u ON a.owner_id = u.id
      WHERE a.status != 'Подготовка'
      ORDER BY a.updated_at DESC
    `);
    res.json(rows);
    return;
  }

  res.json([]);
});

app.post('/api/applications', requireRole('admin', 'applicant'), async (req, res) => {
  const u = getUser(req);
  const number = generateNumber();
  const { rows } = await pool.query(
    'INSERT INTO applications (number, owner_id) VALUES ($1, $2) RETURNING *',
    [number, u.userId]
  );
  res.status(201).json(rows[0]);
});

app.get('/api/applications/:id', async (req, res) => {
  const u = getUser(req);
  const { rows } = await pool.query('SELECT * FROM applications WHERE id = $1', [req.params.id]);
  const row = rows[0];
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

app.put('/api/applications/:id', async (req, res) => {
  const u = getUser(req);
  const { rows: existingRows } = await pool.query('SELECT * FROM applications WHERE id = $1', [req.params.id]);
  const existing = existingRows[0];
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
  let paramIndex = 1;
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = $${paramIndex++}`);
      values.push(req.body[f]);
    }
  }

  if (updates.length > 0) {
    updates.push('updated_at = NOW()');
    values.push(req.params.id);
    await pool.query(`UPDATE applications SET ${updates.join(', ')} WHERE id = $${paramIndex}`, values);
  }

  const { rows } = await pool.query('SELECT * FROM applications WHERE id = $1', [req.params.id]);
  res.json(rows[0]);
});

app.post('/api/applications/:id/submit', async (req, res) => {
  const u = getUser(req);
  const { rows } = await pool.query('SELECT * FROM applications WHERE id = $1', [req.params.id]);
  const row = rows[0];
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

  await pool.query("UPDATE applications SET status = 'Подана', updated_at = NOW() WHERE id = $1", [req.params.id]);
  const { rows: updated } = await pool.query('SELECT * FROM applications WHERE id = $1', [req.params.id]);
  res.json(updated[0]);
});

app.post('/api/applications/:id/status', async (req, res) => {
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

  const { rows } = await pool.query('SELECT * FROM applications WHERE id = $1', [req.params.id]);
  if (rows.length === 0) { res.status(404).json({ error: 'Заявка не найдена' }); return; }

  await pool.query('UPDATE applications SET status = $1, updated_at = NOW() WHERE id = $2', [status, req.params.id]);
  const { rows: updated } = await pool.query('SELECT * FROM applications WHERE id = $1', [req.params.id]);
  res.json(updated[0]);
});

app.delete('/api/applications/:id', requireRole('admin'), async (req, res) => {
  await pool.query('DELETE FROM applications WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

const PORT = 3000;

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
  });
});
