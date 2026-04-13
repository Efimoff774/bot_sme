import { Telegraf } from 'telegraf';
import { config } from '../config.js';
import { db } from '../db/sqlite.js';
import { getPeriodById, markDigestPosted, publishPeriod } from '../db/digestPeriods.js';
import { sendDigestToGroup, sendWeekStartNotification } from '../bot/groupMessaging.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getLatestTeamPeriod(teamId) {
  const stmt = await db.prepare(
    'select * from digest_periods where team_id = ? order by id desc limit 1'
  );
  return stmt.get(teamId);
}

async function prepareOpenWindow(periodId, minutes) {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const today = `${yyyy}-${mm}-${dd}`;
  const publishAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();

  const stmt = await db.prepare(
    `update digest_periods
     set status = 'open',
         start_date = ?,
         end_date = ?,
         publish_date = ?,
         digest_posted_at = null
     where id = ?`
  );
  stmt.run(today, today, publishAt, periodId);
}

async function resetTeamProgressForPeriod(teamId, periodId) {
  const delLm = await db.prepare(
    'delete from lifestyle_media where digest_period_id = ? and user_id in (select id from users where team_id = ?)'
  );
  delLm.run(periodId, teamId);

  const delWm = await db.prepare(
    'delete from work_media where digest_period_id = ? and user_id in (select id from users where team_id = ?)'
  );
  delWm.run(periodId, teamId);

  const upPart = await db.prepare(
    `update participation
     set status = 'in_progress',
         submitted_at = null
     where digest_period_id = ? and user_id in (select id from users where team_id = ?)`
  );
  upPart.run(periodId, teamId);

  const delState = await db.prepare(
    'delete from user_states where user_id in (select id from users where team_id = ?)'
  );
  delState.run(teamId);
}

async function closeAndPublishNow(periodId, telegram) {
  const closeStmt = await db.prepare(
    "update digest_periods set status = 'closed' where id = ? and status = 'open'"
  );
  closeStmt.run(periodId);

  await publishPeriod(periodId);
  const nowISO = new Date().toISOString();
  const posted = await markDigestPosted(periodId, nowISO);
  if (posted) {
    const period = await getPeriodById(periodId);
    await sendDigestToGroup(telegram, period);
  }
}

async function main() {
  const minutes = Number(process.argv[2] || 5);
  const teamId = Number(process.argv[3] || 1);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    console.error('[simulate] minutes should be positive number');
    process.exit(1);
  }
  if (!Number.isFinite(teamId) || teamId <= 0) {
    console.error('[simulate] teamId should be positive number');
    process.exit(1);
  }
  if (!config.telegramToken) {
    console.error('[simulate] TELEGRAM_BOT_TOKEN is not set');
    process.exit(1);
  }

  const period = await getLatestTeamPeriod(teamId);
  if (!period) {
    console.error('[simulate] No period found for team', teamId);
    process.exit(1);
  }

  await resetTeamProgressForPeriod(teamId, period.id);
  await prepareOpenWindow(period.id, minutes);

  const bot = new Telegraf(config.telegramToken);
  const me = await bot.telegram.getMe();
  await sendWeekStartNotification(bot.telegram, await getPeriodById(period.id), me?.username || null);
  console.log(`[simulate] Week-start message sent for period ${period.id}.`);
  console.log(`[simulate] Waiting ${minutes} minute(s) for participants to submit...`);

  await sleep(minutes * 60 * 1000);

  await closeAndPublishNow(period.id, bot.telegram);
  console.log(`[simulate] Period ${period.id} closed and published.`);
}

main().catch((err) => {
  console.error('[simulate] Fatal error', err);
  process.exit(1);
});

