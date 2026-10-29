import pg from 'pg';
import bcrypt from 'bcryptjs';

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'contest',
  password: process.env.DB_PASSWORD || 'contest',
  database: process.env.DB_NAME || 'contest',
});

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'applicant',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS applications (
      id SERIAL PRIMARY KEY,
      number TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'Подготовка',
      owner_id INTEGER NOT NULL REFERENCES users(id),
      email TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      project_name TEXT DEFAULT '',
      project_details TEXT DEFAULT '',
      project_description TEXT DEFAULT '',
      project_duration INTEGER DEFAULT 0,
      org_name TEXT DEFAULT '',
      org_director TEXT DEFAULT '',
      org_inn TEXT DEFAULT '',
      org_ogrn TEXT DEFAULT '',
      org_reg_date TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  const { rows } = await pool.query('SELECT id FROM users WHERE username = $1', ['admin']);
  if (rows.length === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    await pool.query("INSERT INTO users (username, password, role) VALUES ($1, $2, 'admin')", ['admin', hash]);
  }
}

export default pool;
