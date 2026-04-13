import { db } from './sqlite.js';

/**
 * Get user by id (for public API).
 * @param {number} id
 * @returns {Promise<object|undefined>}
 */
export async function getUserById(id) {
  const stmt = await db.prepare(
    'select id, telegram_id, username, first_name, last_name, team_id, avatar_url from users where id = ?'
  );
  return stmt.get(id);
}

export async function getUserByTelegramId(telegramId) {
  const stmt = await db.prepare('select * from users where telegram_id = ?');
  return stmt.get(telegramId);
}

export async function createUser({ telegram_id, username = null, first_name, last_name, team_id }) {
  const stmt = await db.prepare(
    'insert into users (telegram_id, username, first_name, last_name, team_id) values (?, ?, ?, ?, ?)'
  );
  stmt.run(telegram_id, username, first_name, last_name, team_id);
}

export async function updateUserAvatar(userId, avatarUrl) {
  const stmt = await db.prepare('update users set avatar_url = ? where id = ?');
  stmt.run(avatarUrl, userId);
}

export async function updateUserUsernameByTelegramId(telegramId, username) {
  const stmt = await db.prepare('update users set username = ? where telegram_id = ?');
  stmt.run(username, telegramId);
}

export async function getUsersByTeamId(teamId) {
  const stmt = await db.prepare(
    'select telegram_id, username, first_name, last_name from users where team_id = ? order by id asc'
  );
  return stmt.all(teamId);
}


