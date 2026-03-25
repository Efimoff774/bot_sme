import { db } from './sqlite.js';

/**
 * Get user by id (for public API).
 * @param {number} id
 * @returns {Promise<object|undefined>}
 */
export async function getUserById(id) {
  const stmt = await db.prepare('select id, first_name, last_name, team_id, avatar_url from users where id = ?');
  return stmt.get(id);
}

export async function getUserByTelegramId(telegramId) {
  const stmt = await db.prepare('select * from users where telegram_id = ?');
  return stmt.get(telegramId);
}

export async function createUser({ telegram_id, first_name, last_name, team_id }) {
  const stmt = await db.prepare(
    'insert into users (telegram_id, first_name, last_name, team_id) values (?, ?, ?, ?)'
  );
  stmt.run(telegram_id, first_name, last_name, team_id);
}

export async function updateUserAvatar(userId, avatarUrl) {
  const stmt = await db.prepare('update users set avatar_url = ? where id = ?');
  stmt.run(avatarUrl, userId);
}

