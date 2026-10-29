import express from 'express';
import cors from 'cors';
import pool, { initDb } from './database.js';
import { authMiddleware, requireRole, AuthUser } from './auth.js';

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

app.use('/api', authMiddleware);

app.get('/api/me', (req, res) => {
  const u = getUser(req);
  res.json({ userId: u.userId, username: u.username, role: u.role });
});

// ===== APPLICATIONS =====

function generateNumber(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

app.get('/api/applications', async (req, res) => {
  const u = getUser(req);

  if (u.role === 'admin') {
    const { rows } = await pool.query(`
      SELECT * FROM applications ORDER BY updated_at DESC
    `);
    res.json(rows);
    return;
  }

  if (u.role === 'applicant') {
    const { rows } = await pool.query(`
      SELECT * FROM applications WHERE owner_id = $1 ORDER BY updated_at DESC
    `, [u.userId]);
    res.json(rows);
    return;
  }

  if (u.role === 'reviewer') {
    const { rows } = await pool.query(`
      SELECT * FROM applications WHERE status != 'Подготовка' ORDER BY updated_at DESC
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
    'INSERT INTO applications (number, owner_id, owner_name) VALUES ($1, $2, $3) RETURNING *',
    [number, u.userId, u.username]
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
