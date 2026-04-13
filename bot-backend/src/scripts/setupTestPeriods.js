import { config } from '../config.js';
import { db } from '../db/sqlite.js';
import { getUserByTelegramId } from '../db/users.js';
import { ensurePeriodExists, getCurrentDigestPeriod, getPeriodById } from '../db/digestPeriods.js';
import { sendDigestToGroup, sendWeekStartNotification } from '../bot/groupMessaging.js';
import { Telegraf } from 'telegraf';

function nowISO() {
  return new Date().toISOString();
}

async function resetUserDataByTelegramId(telegramId) {
  const user = await getUserByTelegramId(telegramId);
  if (!user) {
    console.warn('[setup] User not found for telegram_id', telegramId);
    return null;
  }

  const s1 = await db.prepare('delete from participation where user_id = ?');
  s1.run(user.id);
  const s2 = await db.prepare('delete from lifestyle_media where user_id = ?');
  s2.run(user.id);
  const s3 = await db.prepare('delete from work_media where user_id = ?');
  s3.run(user.id);
  const s4 = await db.prepare('delete from user_states where user_id = ?');
  s4.run(user.id);

  console.log('[setup] Reset participation/media/state for user', user.id);
  return user;
}

async function pickOrCreatePeriodToPublishFast() {
  // Ensure current period exists so DB is initialized and periods are present.
  const current = await getCurrentDigestPeriod(new Date());
  if (current) {
    // Create a neighbor period (same month, different week) and mark it closed with publish_date in the past.
    const week = Number(current.week_index);
    const targetWeek = week === 1 ? 2 : 1;
    const period = await ensurePeriodExists(current.year_month, targetWeek);

    const past = new Date(Date.now() - 60 * 1000).toISOString();
    const upd = await db.prepare(
      `update digest_periods
       set status = 'closed',
           publish_date = ?,
           digest_posted_at = null
       where id = ?`
    );
    upd.run(past, period.id);
    console.log('[setup] Prepared closed period ready to publish', period.id, period.year_month, period.week_index);
    return await getPeriodById(period.id);
  }

  // If no current open period (e.g. week 4), create a deterministic one and close it.
  const d = new Date();
  const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const period = await ensurePeriodExists(ym, 1);
  const past = new Date(Date.now() - 60 * 1000).toISOString();
  const upd = await db.prepare(
    `update digest_periods
     set status = 'closed',
         publish_date = ?,
         digest_posted_at = null
     where id = ?`
  );
  upd.run(past, period.id);
  console.log('[setup] Prepared closed period ready to publish', period.id, period.year_month, period.week_index);
  return await getPeriodById(period.id);
}

function parseArgs(argv) {
  const flags = new Set();
  const positional = [];
  for (const a of argv) {
    if (String(a).startsWith('--')) flags.add(String(a));
    else positional.push(String(a));
  }
  const telegramIdRaw = positional[0] ?? null;
  const telegramId = telegramIdRaw != null ? Number(telegramIdRaw) : null;
  return {
    telegramId: telegramId && Number.isFinite(telegramId) ? telegramId : null,
    shouldSendNow: flags.has('--send-now'),
    shouldSendWeekStart: flags.has('--send-week-start')
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const telegramId = args.telegramId ?? (config.telegramAdminId ? Number(config.telegramAdminId) : null);
  const shouldReset = telegramId && Number.isFinite(telegramId);

  if (shouldReset) {
    await resetUserDataByTelegramId(telegramId);
  } else {
    console.warn('[setup] Skip user reset (no telegram_id and no TELEGRAM_ADMIN_ID)');
  }
  const periodToPublish = await pickOrCreatePeriodToPublishFast();

  const shouldSendNow = args.shouldSendNow;
  const shouldSendWeekStart = args.shouldSendWeekStart;

  if (shouldSendNow || shouldSendWeekStart) {
    if (!config.telegramToken) {
      console.error('[setup] TELEGRAM_BOT_TOKEN is not set');
      process.exit(1);
    }
    const bot = new Telegraf(config.telegramToken);
    const me = await bot.telegram.getMe();
    const botUsername = me?.username || null;
    globalThis.__botUsername = botUsername;

    if (shouldSendNow) {
      // Bypass cron to verify message formatting immediately.
      if (periodToPublish) {
        await sendDigestToGroup(bot.telegram, periodToPublish);
        console.log('[setup] Sent digest message to group for period', periodToPublish.id);
      }
    }

    if (shouldSendWeekStart) {
      const current = await getCurrentDigestPeriod(new Date());
      if (current) {
        await sendWeekStartNotification(bot.telegram, current, botUsername);
        console.log('[setup] Sent week start notification for period', current.id);
      } else {
        console.warn('[setup] No current period found for week start notification');
      }
    }
  }

  console.log('[setup] Done at', nowISO());
}

main().catch((err) => {
  console.error('[setup] Fatal error', err);
  process.exit(1);
});

