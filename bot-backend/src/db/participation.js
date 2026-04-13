import { db } from './sqlite.js';

/**
 * Get or create participation record for user in a digest period.
 * @param {number} userId
 * @param {number} digestPeriodId
 * @param {string} [initialStatus='in_progress']
 * @returns {Promise<object>}
 */
export async function getOrCreateParticipation(userId, digestPeriodId, initialStatus = 'in_progress') {
  let stmt = await db.prepare(
    'select * from participation where user_id = ? and digest_period_id = ?'
  );
  let row = stmt.get(userId, digestPeriodId);
  if (row) return row;

  stmt = await db.prepare(
    'insert into participation (user_id, digest_period_id, status) values (?, ?, ?)'
  );
  stmt.run(userId, digestPeriodId, initialStatus);

  stmt = await db.prepare(
    'select * from participation where user_id = ? and digest_period_id = ?'
  );
  return stmt.get(userId, digestPeriodId);
}

/**
 * Get participation for user in a period.
 * @param {number} userId
 * @param {number} digestPeriodId
 * @returns {Promise<object|undefined>}
 */
export async function getParticipation(userId, digestPeriodId) {
  const stmt = await db.prepare(
    'select * from participation where user_id = ? and digest_period_id = ?'
  );
  return stmt.get(userId, digestPeriodId);
}

/**
 * Update participation status.
 * @param {number} userId
 * @param {number} digestPeriodId
 * @param {string} status
 * @param {string} [submittedAt]
 */
export async function updateParticipationStatus(userId, digestPeriodId, status, submittedAt = null) {
  const stmt = await db.prepare(
    'update participation set status = ?, submitted_at = ? where user_id = ? and digest_period_id = ?'
  );
  stmt.run(status, submittedAt, userId, digestPeriodId);
}

/**
 * Get submitted participations for a period (for public API).
 * @param {number} digestPeriodId
 * @returns {Promise<object[]>}
 */
export async function getSubmittedByPeriodId(digestPeriodId) {
  const stmt = await db.prepare(
    `select * from participation
     where digest_period_id = ? and status = 'submitted'
     order by submitted_at asc`
  );
  return stmt.all(digestPeriodId);
}

/**
 * Active participants (users) who submitted in this period.
 * Used for group mentions on digest publish.
 * @param {number} digestPeriodId
 * @returns {Promise<object[]>} user rows with telegram_id, username, first_name, last_name
 */
export async function getActiveSubmittedParticipantsByPeriodId(digestPeriodId) {
  const stmt = await db.prepare(
    `select u.telegram_id, u.username, u.first_name, u.last_name
     from participation p
     join users u on u.id = p.user_id
     where p.digest_period_id = ?
       and p.status = 'submitted'
     order by p.submitted_at asc`
  );
  return stmt.all(digestPeriodId);
}
