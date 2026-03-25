import { db } from './sqlite.js';

/**
 * Get work_media row with general_text for user and period (for duplicate check and summary).
 * @param {number} userId
 * @param {number} digestPeriodId
 * @returns {Promise<object|undefined>}
 */
export async function getByUserAndPeriod(userId, digestPeriodId) {
  const stmt = await db.prepare(
    'select * from work_media where user_id = ? and digest_period_id = ? and general_text is not null limit 1'
  );
  return stmt.get(userId, digestPeriodId);
}

/**
 * Count photo rows (media_url not null) for user and period.
 * @param {number} userId
 * @param {number} digestPeriodId
 * @returns {Promise<number>}
 */
export async function countPhotosByUserAndPeriod(userId, digestPeriodId) {
  const stmt = await db.prepare(
    'select count(*) as c from work_media where user_id = ? and digest_period_id = ? and media_url is not null'
  );
  const row = stmt.get(userId, digestPeriodId);
  return row ? Number(row.c) : 0;
}

/**
 * Insert one work photo row (media_url only).
 * @param {number} userId
 * @param {number} digestPeriodId
 * @param {string} mediaUrl
 */
export async function insertPhoto(userId, digestPeriodId, mediaUrl) {
  const stmt = await db.prepare(
    'insert into work_media (user_id, digest_period_id, media_url) values (?, ?, ?)'
  );
  stmt.run(userId, digestPeriodId, mediaUrl);
}

/**
 * Insert work general_text. No-op if row already exists (no duplicate).
 * @param {number} userId
 * @param {number} digestPeriodId
 * @param {string} generalText
 * @returns {Promise<boolean>} true if inserted, false if already existed
 */
export async function insertGeneralText(userId, digestPeriodId, generalText) {
  const existing = await getByUserAndPeriod(userId, digestPeriodId);
  if (existing) return false;

  const stmt = await db.prepare(
    'insert into work_media (user_id, digest_period_id, general_text) values (?, ?, ?)'
  );
  stmt.run(userId, digestPeriodId, generalText);
  return true;
}

/**
 * Get work photo rows (media_url not null) for user and period (for public API).
 * @param {number} userId
 * @param {number} digestPeriodId
 * @returns {Promise<object[]>} rows with media_url
 */
export async function getPhotosByUserAndPeriod(userId, digestPeriodId) {
  const stmt = await db.prepare(
    'select media_url from work_media where user_id = ? and digest_period_id = ? and media_url is not null'
  );
  return stmt.all(userId, digestPeriodId);
}
