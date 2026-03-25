import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';

// Resolve path relative to this file so DB stays inside project.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '../../data');
const dbPath = path.join(dataDir, 'digest.sqlite');

fs.mkdirSync(dataDir, { recursive: true });

let dbInstance = null;

async function initDb() {
  if (dbInstance) return dbInstance;

  const SQL = await initSqlJs({
    locateFile: (file) => path.join(__dirname, '../../node_modules/sql.js/dist', file)
  });

  const fileExists = fs.existsSync(dbPath);
  const filebuffer = fileExists ? fs.readFileSync(dbPath) : null;
  // Empty or invalid file: create fresh DB so schema and tables are created.
  if (filebuffer && filebuffer.length > 0) {
    try {
      dbInstance = new SQL.Database(filebuffer);
    } catch (_) {
      dbInstance = new SQL.Database();
    }
  } else {
    dbInstance = new SQL.Database();
  }

  // Initialise schema if not exists.
  dbInstance.exec(`
    create table if not exists teams (
      id integer primary key autoincrement,
      name text not null unique
    );

    create table if not exists users (
      id integer primary key autoincrement,
      telegram_id integer not null unique,
      first_name text not null,
      last_name text not null,
      team_id integer not null references teams(id),
      avatar_url text
    );

    create table if not exists user_states (
      user_id integer primary key,
      state text not null,
      context text not null default '{}'
    );
  `);

  dbInstance.exec(`
    create table if not exists digest_periods (
      id integer primary key autoincrement,
      year_month text not null,
      week_index integer not null,
      team_id integer not null references teams(id),
      start_date text not null,
      end_date text not null,
      publish_date text not null,
      status text not null check (status in ('open', 'closed', 'published')),
      unique (year_month, week_index)
    );

    create table if not exists participation (
      id integer primary key autoincrement,
      user_id integer not null references users(id),
      digest_period_id integer not null references digest_periods(id),
      status text not null check (status in ('participated', 'skipped', 'in_progress', 'submitted')),
      submitted_at text,
      unique (user_id, digest_period_id)
    );

    create table if not exists lifestyle_media (
      id integer primary key autoincrement,
      user_id integer not null references users(id),
      digest_period_id integer not null references digest_periods(id),
      media_url text,
      caption text,
      general_text text,
      created_at text default (datetime('now'))
    );

    create table if not exists work_media (
      id integer primary key autoincrement,
      user_id integer not null references users(id),
      digest_period_id integer not null references digest_periods(id),
      media_url text,
      caption text,
      general_text text,
      created_at text default (datetime('now'))
    );

    create table if not exists csat (
      id integer primary key autoincrement,
      user_id integer references users(id),
      digest_period_id integer not null references digest_periods(id),
      rating integer not null check (rating between 1 and 10),
      feedback_text text,
      created_at text default (datetime('now'))
    );
  `);

  // Safe migration: add avatar_url to users if column does not exist.
  const pragmaStmt = dbInstance.prepare('PRAGMA table_info(users)');
  let hasAvatarUrl = false;
  while (pragmaStmt.step()) {
    const row = pragmaStmt.getAsObject();
    if (row.name === 'avatar_url') hasAvatarUrl = true;
  }
  pragmaStmt.free();
  if (!hasAvatarUrl) {
    dbInstance.run('ALTER TABLE users ADD COLUMN avatar_url TEXT');
  }

  // Seed initial teams if empty.
  const result = dbInstance.exec('select count(*) as c from teams');
  const count =
    result && result[0] && result[0].values && result[0].values[0]
      ? Number(result[0].values[0][0])
      : 0;
  if (count === 0) {
    ['Team A', 'Team B', 'Team C'].forEach((name) => {
      dbInstance.run('insert into teams (name) values (?)', [name]);
    });
  }

  persistDb();
  return dbInstance;
}

function persistDb() {
  if (!dbInstance) return;
  const data = dbInstance.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

// Minimal wrapper to emulate better-sqlite3's prepare().get/all/run API used in the project.
export const db = {
  async prepare(sql) {
    const db = await initDb();
    return {
      get: (...params) => {
        const stmt = db.prepare(sql);
        try {
          if (params.length) stmt.bind(params);
          if (stmt.step()) {
            return stmt.getAsObject();
          }
          return undefined;
        } finally {
          stmt.free();
        }
      },
      all: (...params) => {
        const stmt = db.prepare(sql);
        const rows = [];
        try {
          if (params.length) stmt.bind(params);
          while (stmt.step()) {
            rows.push(stmt.getAsObject());
          }
        } finally {
          stmt.free();
        }
        return rows;
      },
      run: (...params) => {
        const stmt = db.prepare(sql);
        try {
          if (params.length) stmt.bind(params);
          while (stmt.step()) {
            // consume all rows
          }
        } finally {
          stmt.free();
        }
        persistDb();
        return {};
      }
    };
  }
};

