/**
 * Centralized date calculation for weekly digest periods.
 * Week: Monday 00:00:00.000 — Sunday 23:59:59.999 (UTC).
 * Month has up to 4 weeks; week_index 1–3 are digest weeks, 4 is no digest.
 *
 * Week 1 = first Monday of the month (calendar date 1–7) through Sunday.
 * Days before that Monday (e.g. 1st–2nd if Monday is 3rd) are not in any week of this month.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday).
 * @param {Date} d
 * @returns {number}
 */
function getDayOfWeek(d) {
  return d.getUTCDay();
}

/**
 * First Monday of the calendar month: the first day with date 1–7 that is a Monday.
 * Examples: 1st Mon → 1st; 1st Wed → 6th; 1st Sun → 2nd.
 * @param {number} year
 * @param {number} month 1–12
 * @returns {Date} UTC date at 00:00:00.000
 */
export function getFirstMondayOfMonth(year, month) {
  const first = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const dow = getDayOfWeek(first); // 0=Sun, 1=Mon, ..., 6=Sat
  // Days to add to 1st to get next Monday: Mon=0, Tue=6, Wed=5, Thu=4, Fri=3, Sat=2, Sun=1
  const daysToMonday = dow === 0 ? 1 : (8 - dow) % 7;
  const monday = new Date(first);
  monday.setUTCDate(first.getUTCDate() + daysToMonday);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

/**
 * Start and end of week N (1–4) for the given month.
 * @param {number} year
 * @param {number} month 1–12
 * @param {number} weekIndex 1–4
 * @returns {{ start: Date, end: Date }} start Monday 00:00:00.000, end Sunday 23:59:59.999
 */
export function getWeekBoundsForMonthWeek(year, month, weekIndex) {
  const firstMonday = getFirstMondayOfMonth(year, month);
  const start = new Date(firstMonday);
  start.setUTCDate(firstMonday.getUTCDate() + (weekIndex - 1) * 7);

  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);

  return { start, end };
}

/**
 * Publish date for a week: Monday 13:00:00 UTC of the day after the week ends.
 * @param {number} year
 * @param {number} month 1–12
 * @param {number} weekIndex 1–4
 * @returns {Date}
 */
export function getPublishDateForWeek(year, month, weekIndex) {
  const { end } = getWeekBoundsForMonthWeek(year, month, weekIndex);
  const publish = new Date(end);
  publish.setUTCDate(publish.getUTCDate() + 1); // Monday
  publish.setUTCHours(13, 0, 0, 0);
  return publish;
}

/**
 * Which week index (1–4) the given date falls in, for the given month.
 * Week 1 = first Monday of month through Sunday; dates before that Monday return null.
 * @param {Date} date
 * @param {number} year
 * @param {number} month 1–12
 * @returns {number|null} 1–4 or null if date is before week 1 or after week 4
 */
export function getWeekIndexForDate(date, year, month) {
  const firstMonday = getFirstMondayOfMonth(year, month);
  const mondayTime = firstMonday.getTime();
  const dateTime = date.getTime();

  if (dateTime < mondayTime) return null;

  const daysSinceFirstMonday = Math.floor((dateTime - mondayTime) / MS_PER_DAY);
  const weekIndex = Math.floor(daysSinceFirstMonday / 7) + 1;

  if (weekIndex >= 1 && weekIndex <= 4) return weekIndex;
  return null;
}

/**
 * Year and month (1–12) for a date.
 * @param {Date} d
 * @returns {{ year: number, month: number }}
 */
export function getYearMonth(d) {
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1
  };
}

/**
 * YYYY-MM string for a date.
 * @param {Date} d
 * @returns {string}
 */
export function toYearMonthString(d) {
  const { year, month } = getYearMonth(d);
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * ISO date string (YYYY-MM-DD) for DB storage.
 * @param {Date} d
 * @returns {string}
 */
export function toISODateString(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * ISO datetime string for DB storage.
 * @param {Date} d
 * @returns {string}
 */
export function toISODateTimeString(d) {
  return d.toISOString();
}
