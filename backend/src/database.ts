import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, '..', 'data.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'applicant',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'Подготовка',
    owner_id INTEGER NOT NULL,
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
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (owner_id) REFERENCES users(id)
  );
`);

// Migrate: add role column if missing
try {
  db.prepare("SELECT role FROM users LIMIT 1").get();
} catch {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'applicant'");
}

// Migrate: add owner_id column if missing
try {
  db.prepare("SELECT owner_id FROM applications LIMIT 1").get();
} catch {
  db.exec("ALTER TABLE applications ADD COLUMN owner_id INTEGER NOT NULL DEFAULT 1");
}

const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, 'admin')").run('admin', hash);
} else {
  db.prepare("UPDATE users SET role = 'admin' WHERE username = 'admin'").run();
}

export default db;
