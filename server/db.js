import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import fs from 'node:fs';
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : __dirname;
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'data.sqlite'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  owner_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS campaign_members (
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  PRIMARY KEY (campaign_id, user_id)
);
CREATE TABLE IF NOT EXISTS invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  accepted_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  type TEXT NOT NULL,            -- text | single | multi | number | boolean | scale
  options TEXT DEFAULT '[]',     -- JSON array (single/multi) or {min,max} for scale
  required INTEGER DEFAULT 1,
  position INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS stages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS papers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  bib_key TEXT,
  title TEXT NOT NULL,
  authors TEXT DEFAULT '',
  year TEXT DEFAULT '',
  venue TEXT DEFAULT '',
  doi TEXT DEFAULT '',
  abstract TEXT DEFAULT '',
  pdf_path TEXT,
  pdf_name TEXT,
  stage_id INTEGER REFERENCES stages(id) ON DELETE SET NULL,
  position INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS paper_assignments (
  paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (paper_id, user_id)
);
CREATE TABLE IF NOT EXISTS annotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  values_json TEXT DEFAULT '{}',
  status TEXT DEFAULT 'draft',   -- draft | submitted
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE (paper_id, user_id)
);
`);

db.exec(`CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
)`);

// Lightweight migrations for columns added after the first release.
const cols = t => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
if (!cols('fields').includes('group_name')) db.exec("ALTER TABLE fields ADD COLUMN group_name TEXT DEFAULT ''");
if (!cols('fields').includes('option_help')) db.exec("ALTER TABLE fields ADD COLUMN option_help TEXT DEFAULT '{}'");
if (!cols('invites').includes('expires_at')) db.exec("ALTER TABLE invites ADD COLUMN expires_at INTEGER");
if (!cols('invites').includes('sent_at')) db.exec("ALTER TABLE invites ADD COLUMN sent_at TEXT");
if (!cols('invites').includes('invited_by')) db.exec("ALTER TABLE invites ADD COLUMN invited_by INTEGER REFERENCES users(id)");
if (!cols('users').includes('password_changed_at')) db.exec("ALTER TABLE users ADD COLUMN password_changed_at INTEGER DEFAULT 0");

export const q = {
  get: (sql, ...p) => db.prepare(sql).get(...p),
  all: (sql, ...p) => db.prepare(sql).all(...p),
  run: (sql, ...p) => db.prepare(sql).run(...p),
};
