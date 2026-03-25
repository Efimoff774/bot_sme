import { db } from './sqlite.js';
import {
  getYearMonth,
  toYearMonthString,
  getWeekIndexForDate,
  getWeekBoundsForMonthWeek,
  getPublishDateForWeek,
  toISODateString,
  toISODateTimeString
} from '../lib/digestDates.js';

/**
 * Returns the active digest period for the given date: the period whose week
 * contains the date, has status 'open', and is not week 4 (no digest).
 * Uses centralized week boundaries (Monday–Sunday).
 * Lazily creates the period row for current week 1–3 if missing (so first run works).
 * @param {Date} [atDate=new Date()]
 * @returns {Promise<object|undefined>} digest_period row or undefined
 */
export async function getCurrentDigestPeriod(atDate = new Date()) {
  const { year, month } = getYearMonth(atDate);
  const yearMonth = toYearMonthString(atDate);
  const weekIndex = getWeekIndexForDate(atDate, year, month);

  if (!weekIndex || weekIndex === 4) return undefined;

  let stmt = await db.prepare(
    `select * from digest_periods where year_month = ? and week_index = ?`
  );
  let row = stmt.get(yearMonth, weekIndex);
  if (!row) {
    row = await ensurePeriodExists(yearMonth, weekIndex);
  }
  return row && row.status === 'open' ? row : undefined;

}

/**
 * Ensures a digest_period row exists for (year_month, week_index) and returns it.
 * Does not change status if row already exists.
 * @param {string} yearMonth YYYY-MM
 * @param {number} weekIndex 1–4
 * @returns {Promise<object>}
 */
export async function ensurePeriodExists(yearMonth, weekIndex) {
  const [y, m] = yearMonth.split('-').map(Number);
  const { start, end } = getWeekBoundsForMonthWeek(y, m, weekIndex);
  const publishDate = getPublishDateForWeek(y, m, weekIndex);
  const teamId = weekIndex <= 3 ? weekIndex : 1;

  let stmt = await db.prepare(
    `select * from digest_periods where year_month = ? and week_index = ?`
  );
  let row = stmt.get(yearMonth, weekIndex);
  if (row) return row;

  stmt = await db.prepare(
    `insert into digest_periods (year_month, week_index, team_id, start_date, end_date, publish_date, status)
     values (?, ?, ?, ?, ?, ?, 'open')`
  );
  stmt.run(
    yearMonth,
    weekIndex,
    teamId,
    toISODateString(start),
    toISODateString(end),
    toISODateTimeString(publishDate)
  );

  stmt = await db.prepare(
    `select * from digest_periods where year_month = ? and week_index = ?`
  );
  return stmt.get(yearMonth, weekIndex);
}

/**
 * Closes the current period (status = 'closed'). Idempotent.
 * @param {number} periodId
 */
export async function closePeriod(periodId) {
  const stmt = await db.prepare(
    `update digest_periods set status = 'closed' where id = ? and status = 'open'`
  );
  stmt.run(periodId);
}

/**
 * Marks period as published (status = 'published'). Idempotent.
 * @param {number} periodId
 */
export async function publishPeriod(periodId) {
  const stmt = await db.prepare(
    `update digest_periods set status = 'published' where id = ?`
  );
  stmt.run(periodId);
}

/**
 * Opens the next period: if current is (year_month, week N), opens (year_month, week N+1)
 * or first week of next month if N was 3. Never opens week 4. Creates the row if needed.
 * Sets status = 'open' if period exists but is not already open/published.
 * @param {number} publishedPeriodId id of the period that was just published
 * @returns {Promise<object|undefined>} the newly opened period or undefined
 */
export async function openNextPeriod(publishedPeriodId) {
  const stmt = await db.prepare('select * from digest_periods where id = ?');
  const published = stmt.get(publishedPeriodId);
  if (!published) return undefined;

  const [y, m] = published.year_month.split('-').map(Number);
  let nextYear = y;
  let nextMonth = m;
  let nextWeekIndex;

  if (published.week_index < 3) {
    nextWeekIndex = published.week_index + 1;
  } else if (published.week_index === 3) {
    nextWeekIndex = 1;
    nextMonth += 1;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
  } else {
    return undefined;
  }

  const yearMonth = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
  const nextPeriod = await ensurePeriodExists(yearMonth, nextWeekIndex);
  if (!nextPeriod) return undefined;

  if (nextPeriod.status !== 'open' && nextPeriod.status !== 'published') {
    const updateStmt = await db.prepare(
      `update digest_periods set status = 'open' where id = ? and status not in ('open', 'published')`
    );
    updateStmt.run(nextPeriod.id);
    const refreshedStmt = await db.prepare('select * from digest_periods where id = ?');
    return refreshedStmt.get(nextPeriod.id);
  }
  return nextPeriod;
}

/**
 * Next period for a team (open or future) so we can tell the user when their week starts.
 * @param {number} teamId
 * @param {Date} [afterDate=new Date()]
 * @returns {Promise<object|undefined>}
 */
export async function getNextPeriodForTeam(teamId, afterDate = new Date()) {
  const after = afterDate.toISOString().slice(0, 10);
  const stmt = await db.prepare(
    `select * from digest_periods
     where team_id = ? and (status = 'open' or start_date >= ?)
     order by start_date asc limit 1`
  );
  return stmt.get(teamId, after);
}

/**
 * Get period by id.
 */
export async function getPeriodById(id) {
  const stmt = await db.prepare('select * from digest_periods where id = ?');
  return stmt.get(id);
}

/**
 * All periods that should be closed now: status = 'open' and now >= end_date 23:59:59.
 * Uses server local time for deadline. Idempotent; safe to run multiple times.
 * @param {Date} [now=new Date()]
 * @returns {Promise<object[]>}
 */
export async function getPeriodsToClose(now = new Date()) {
  const stmt = await db.prepare(
    `select * from digest_periods where status = 'open'`
  );
  const rows = stmt.all();
  return rows.filter((p) => {
    const deadline = new Date(p.end_date + 'T23:59:59.999');
    return now >= deadline;
  });
}

/**
 * All periods that should be published now: status = 'closed' and publish_date <= now.
 * Ordered by publish_date asc so we process in chronological order (important when catching up).
 * @param {string} nowISO ISO datetime (e.g. new Date().toISOString())
 * @returns {Promise<object[]>}
 */
export async function getPeriodsToPublish(nowISO) {
  const stmt = await db.prepare(
    `select * from digest_periods where status = 'closed' and publish_date <= ? order by publish_date asc`
  );
  return stmt.all(nowISO);
}

/**
 * List published periods for landing (e.g. /api/periods).
 * @returns {Promise<object[]>}
 */
export async function getPublishedPeriods() {
  const stmt = await db.prepare(
    `select * from digest_periods where status = 'published' order by publish_date desc`
  );
  return stmt.all();
}
