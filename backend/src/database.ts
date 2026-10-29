import pg from 'pg';

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'contest',
  password: process.env.DB_PASSWORD || 'contest',
  database: process.env.DB_NAME || 'contest',
});

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS applications (
      id SERIAL PRIMARY KEY,
      number TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'Подготовка',
      owner_id TEXT NOT NULL,
      owner_name TEXT NOT NULL DEFAULT '',
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
}

export default pool;
