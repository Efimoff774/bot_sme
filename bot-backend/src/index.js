import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Telegraf, Markup } from 'telegraf';
import cron from 'node-cron';
import { config } from './config.js';
import { getUserState, setUserState, resetUserState } from './bot/stateMachine.js';
import { getAllTeams } from './db/teams.js';
import { getUserByTelegramId, createUser, updateUserAvatar } from './db/users.js';
import {
  getCurrentDigestPeriod,
  getNextPeriodForTeam,
  getPeriodById,
  closePeriod,
  publishPeriod,
  openNextPeriod,
  getPeriodsToClose,
  getPeriodsToPublish
} from './db/digestPeriods.js';
import periodsRouter from './routes/periods.js';
import { getOrCreateParticipation, getParticipation, updateParticipationStatus } from './db/participation.js';
import {
  getByUserAndPeriod as getLifestyleByUserAndPeriod,
  insertGeneralText as insertLifestyleGeneralText,
  countPhotosByUserAndPeriod as countLifestylePhotos,
  insertPhoto as insertLifestylePhoto
} from './db/lifestyleMedia.js';
import {
  getByUserAndPeriod as getWorkByUserAndPeriod,
  insertGeneralText as insertWorkGeneralText,
  countPhotosByUserAndPeriod as countWorkPhotos,
  insertPhoto as insertWorkPhoto
} from './db/workMedia.js';
import { downloadTelegramPhoto } from './lib/avatarUpload.js';

// --- Basic safety checks ---
if (!config.telegramToken) {
  console.error('TELEGRAM_BOT_TOKEN is not set. Bot will not start.');
  process.exit(1);
}

// --- Express HTTP API (placeholder, will be extended later) ---
const app = express();
app.use(express.json());

// Local uploads directory for media files.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '../uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

// Expose uploaded files under /uploads URL path.
app.use('/uploads', express.static(uploadsDir));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/periods', periodsRouter);

const PORT = process.env.PORT || 3000;

/** Deadline is Sunday 23:59 of the period (end_date). Returns true if now is after that. */
function isPastDeadline(endDateStr) {
  if (!endDateStr) return false;
  const deadline = new Date(endDateStr + 'T23:59:59.999');
  return new Date() > deadline;
}

/** Format YYYY-MM-DD as "Monday, 17 February 2025" for display. */
function formatStartDate(isoDate) {
  const d = new Date(isoDate + 'T12:00:00Z');
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${days[d.getUTCDay()]}, ${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// --- Telegram bot bootstrap ---
const bot = new Telegraf(config.telegramToken);

// /start: ensure user exists; if new → registration flow. If existing but no avatar → require avatar.
bot.start(async (ctx) => {
  const tgId = ctx.from.id;
  try {
    const existing = await getUserByTelegramId(tgId);
    if (existing) {
      if (existing.avatar_url == null || existing.avatar_url === '') {
        await setUserState(existing.id, 'awaiting_avatar', {});
        await ctx.reply('Please upload your profile photo. This photo will be used in the digest.');
        return;
      }
      await resetUserState(tgId);
      await resetUserState(existing.id);
      await ctx.reply('You are already registered. You can continue using the bot.');
      return;
    }

    // New user – start registration.
    await setUserState(tgId, 'registering_first_name', {});
    await ctx.reply('Welcome to SME Digest! Please enter your first name:');
  } catch (err) {
    console.error('[bot] /start error', err);
    await ctx.reply('Unexpected error. Please try again later.');
  }
});

// Text handler drives a small registration state machine.
// Use user.id for state when user is registered (participation flow), tgId during registration.
bot.on('text', async (ctx, next) => {
  const tgId = ctx.from.id;
  const text = (ctx.message.text || '').trim();

  // Let command handlers process /commands (e.g. /participate)
  if (text.startsWith('/')) {
    return next();
  }

  try {
    const user = await getUserByTelegramId(tgId);
    const stateKey = user ? user.id : tgId;
    const state = await getUserState(stateKey);

    switch (state.state) {
      case 'registering_first_name': {
        const context = { ...(state.context || {}), first_name: text.slice(0, 100) };
        await setUserState(stateKey, 'registering_last_name', context);
        await ctx.reply('Great! Now enter your last name:');
        return;
      }
      case 'registering_last_name': {
        const context = { ...(state.context || {}), last_name: text.slice(0, 100) };

        const teams = await getAllTeams();
        if (!teams.length) {
          console.error('[bot] No teams found in DB');
          await ctx.reply('No teams are configured yet. Please contact the administrator.');
          return;
        }

        await setUserState(stateKey, 'registering_team', context);

        const keyboard = Markup.inlineKeyboard(
          teams.map((team) => [Markup.button.callback(team.name, `team_${team.id}`)])
        );

        await ctx.reply('Select your team:', keyboard);
        return;
      }
      case 'lifestyle_general_text': {
        if (!user) {
          await ctx.reply('Please use /start to register first.');
          return;
        }
        await handleLifestyleGeneralText(ctx, user, text, state.context);
        return;
      }
      case 'work_general_text': {
        if (!user) {
          await ctx.reply('Please use /start to register first.');
          return;
        }
        await handleWorkGeneralText(ctx, user, text, state.context);
        return;
      }
      case 'awaiting_avatar':
        await ctx.reply('Please send a photo.');
        return;
      case 'idle':
      case 'confirm_submission':
        return;
      case 'lifestyle_photos':
      case 'work_photos':
        await ctx.reply('Send a photo or press Done.');
        return;
      case 'waiting_participation_choice':
        await ctx.reply('Please use the buttons above to choose Participate or Skip.');
        return;
      default: {
        await handleParticipationOrNextWeek(ctx, tgId);
      }
    }
  } catch (err) {
    console.error('[bot] text handler error', err);
    await ctx.reply('Unexpected error while processing your message.');
  }
});

// Shared: check current digest period; if user's team is active and open → allow participation; else inform when their week starts.
async function handleParticipationOrNextWeek(ctx, tgId) {
  const user = await getUserByTelegramId(tgId);
  if (!user) {
    await ctx.reply('Please use /start to register first.');
    return;
  }

  const period = await getCurrentDigestPeriod();
  if (period && period.team_id === user.team_id) {
    if (isPastDeadline(period.end_date)) {
      await ctx.reply('The submission deadline for this week has passed.');
      return;
    }
    const part = await getParticipation(user.id, period.id);
    if (part && part.status === 'submitted') {
      await ctx.reply('You have already participated in this period.');
      return;
    }
    if (part && part.status === 'in_progress') {
      if (isPastDeadline(period.end_date)) {
        await resetUserState(user.id);
        await ctx.reply('The submission deadline has passed. Your draft was not submitted.');
        return;
      }
      const state = await getUserState(user.id);
      if (state.state === 'lifestyle_photos') {
        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback('Done', `done_lifestyle_photos_${period.id}`)]
        ]);
        await ctx.reply('Send up to 5 lifestyle photos. When finished, press Done.', keyboard);
        return;
      }
      if (state.state === 'work_photos') {
        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback('Done', `done_work_photos_${period.id}`)]
        ]);
        await ctx.reply('Send up to 5 work photos. When finished, press Done.', keyboard);
        return;
      }
      const lifestyle = await getLifestyleByUserAndPeriod(user.id, period.id);
      const work = await getWorkByUserAndPeriod(user.id, period.id);
      if (lifestyle && work) {
        await setUserState(user.id, 'confirm_submission', {
          digest_period_id: period.id,
          lifestyle_text: lifestyle.general_text ?? '',
          work_text: work.general_text ?? ''
        });
        const summary = `Lifestyle: ${lifestyle.general_text ?? ''}\nWork: ${work.general_text ?? ''}`;
        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback('Confirm', `confirm_submit_${period.id}`)]
        ]);
        await ctx.reply(summary, keyboard);
        return;
      }
      if (lifestyle && !work) {
        await setUserState(user.id, 'work_general_text', {
          digest_period_id: period.id,
          lifestyle_text: lifestyle.general_text ?? ''
        });
        await ctx.reply('Share your work highlight (max 300 characters)');
        return;
      }
      await setUserState(user.id, 'lifestyle_general_text', { digest_period_id: period.id });
      await ctx.reply('Share your lifestyle highlight (max 300 characters)');
      return;
    }
    await setUserState(user.id, 'waiting_participation_choice', { digest_period_id: period.id });
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('Participate', `participate_yes_${period.id}`)],
      [Markup.button.callback('Skip this week', `participate_skip_${period.id}`)]
    ]);
    await ctx.reply(
      "It's your team's digest week. Would you like to participate in this week's digest?",
      keyboard
    );
    return;
  }

  const nextPeriod = await getNextPeriodForTeam(user.team_id);
  if (nextPeriod) {
    const startStr = formatStartDate(nextPeriod.start_date);
    await ctx.reply(
      `Your team's digest week is not active right now. Your next digest week starts on ${startStr}. Deadline: Sunday 23:59.`
    );
    return;
  }

  await ctx.reply('No upcoming digest week is scheduled for your team. Check back later.');
}

async function handleLifestyleGeneralText(ctx, user, text, context) {
  const digestPeriodId = context?.digest_period_id;
  if (!digestPeriodId) {
    await resetUserState(user.id);
    await ctx.reply('Session expired. Use /participate to start again.');
    return;
  }
  if (text.length > 300) {
    await ctx.reply('Please keep your lifestyle highlight to 300 characters or less.');
    return;
  }
  const inserted = await insertLifestyleGeneralText(user.id, digestPeriodId, text);
  if (!inserted) {
    await ctx.reply('You already have a lifestyle entry for this period.');
    return;
  }
  await setUserState(user.id, 'lifestyle_photos', {
    digest_period_id: digestPeriodId,
    lifestyle_text: text
  });
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('Done', `done_lifestyle_photos_${digestPeriodId}`)]
  ]);
  await ctx.reply('Send up to 5 lifestyle photos. When finished, press Done.', keyboard);
}

async function handleWorkGeneralText(ctx, user, text, context) {
  const digestPeriodId = context?.digest_period_id;
  const lifestyleText = context?.lifestyle_text ?? '';
  if (!digestPeriodId) {
    await resetUserState(user.id);
    await ctx.reply('Session expired. Use /participate to start again.');
    return;
  }
  if (text.length > 300) {
    await ctx.reply('Please keep your work highlight to 300 characters or less.');
    return;
  }
  const inserted = await insertWorkGeneralText(user.id, digestPeriodId, text);
  if (!inserted) {
    await ctx.reply('You already have a work entry for this period.');
    return;
  }
  await setUserState(user.id, 'work_photos', {
    digest_period_id: digestPeriodId,
    lifestyle_text: lifestyleText,
    work_text: text
  });
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('Done', `done_work_photos_${digestPeriodId}`)]
  ]);
  await ctx.reply('Send up to 5 work photos. When finished, press Done.', keyboard);
}

// In awaiting_avatar, reject non-photo messages (document, video, etc.).
bot.on('message', async (ctx, next) => {
  if (ctx.message.photo != null) return next();
  if (ctx.message.text != null) return next();
  const user = await getUserByTelegramId(ctx.from.id);
  if (!user) return next();
  const state = await getUserState(user.id);
  if (state.state === 'awaiting_avatar') {
    await ctx.reply('Please send a photo.');
    return;
  }
  return next();
});

// Photo handler: awaiting_avatar (registration) or lifestyle_photos/work_photos (participation).
bot.on('photo', async (ctx) => {
  const tgId = ctx.from.id;
  try {
    const user = await getUserByTelegramId(tgId);
    if (!user) {
      await ctx.reply('Please use /start to register first.');
      return;
    }
    const state = await getUserState(user.id);

    if (state.state === 'awaiting_avatar') {
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const fileId = photo.file_id;
      const relPath = `avatars/user_${user.id}.jpg`;
      const targetPath = path.join(uploadsDir, relPath);
      const avatarUrl = `/uploads/${relPath}`;
      await downloadTelegramPhoto(ctx.telegram, fileId, targetPath);
      await updateUserAvatar(user.id, avatarUrl);
      await resetUserState(user.id);
      await ctx.reply('Registration completed successfully.');
      return;
    }

    const periodId = state.context?.digest_period_id;
    if (!periodId || (state.state !== 'lifestyle_photos' && state.state !== 'work_photos')) {
      return;
    }
    const period = await getPeriodById(periodId);
    if (period && isPastDeadline(period.end_date)) {
      await ctx.reply('The submission deadline has passed.');
      return;
    }
    const isLifestyle = state.state === 'lifestyle_photos';
    const count = isLifestyle
      ? await countLifestylePhotos(user.id, periodId)
      : await countWorkPhotos(user.id, periodId);
    if (count >= 5) {
      await ctx.reply('You can upload a maximum of 5 photos.');
      return;
    }
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileId = photo.file_id;
    const n = count + 1;
    const segment = isLifestyle ? 'lifestyle' : 'work';
    const relPath = `period_${periodId}/user_${user.id}/${segment}_${n}.jpg`;
    const targetPath = path.join(uploadsDir, relPath);
    await downloadTelegramPhoto(ctx.telegram, fileId, targetPath);
    const mediaUrl = `/uploads/${relPath}`;
    if (isLifestyle) {
      await insertLifestylePhoto(user.id, periodId, mediaUrl);
    } else {
      await insertWorkPhoto(user.id, periodId, mediaUrl);
    }
    await ctx.reply(`Photo ${n}/5 saved.`);
  } catch (err) {
    console.error('[bot] photo handler error', err);
    await ctx.reply('Failed to save photo. Please try again.');
  }
});

bot.command('participate', async (ctx) => {
  const tgId = ctx.from.id;
  try {
    await handleParticipationOrNextWeek(ctx, tgId);
  } catch (err) {
    console.error('[bot] /participate error', err);
    await ctx.reply('Unexpected error. Please try again later.');
  }
});

// Handle participation choice: Participate → start flow; Skip → mark skipped and reset.
bot.action(/^participate_(yes|skip)_(\d+)$/, async (ctx) => {
  const tgId = ctx.from.id;
  const choice = ctx.match[1];
  const periodId = Number(ctx.match[2]);

  try {
    const user = await getUserByTelegramId(tgId);
    if (!user) {
      await ctx.answerCbQuery('Please register with /start first.', { show_alert: true });
      return;
    }

    if (choice === 'yes') {
      const period = await getPeriodById(periodId);
      if (period && isPastDeadline(period.end_date)) {
        await ctx.answerCbQuery('The submission deadline for this week has passed.', { show_alert: true });
        await ctx.reply('The submission deadline for this week has passed.');
        return;
      }
    }

    const part = await getOrCreateParticipation(user.id, periodId);
    if (choice === 'skip') {
      await updateParticipationStatus(user.id, periodId, 'skipped');
      await resetUserState(user.id);
      try { await ctx.editMessageReplyMarkup(); } catch { /* ignore */ }
      await ctx.answerCbQuery('Skipped');
      await ctx.reply('You skipped this week\'s digest. You can participate next time with /participate.');
      return;
    }

    if (part.status === 'submitted') {
      await ctx.answerCbQuery('You have already submitted for this period.', { show_alert: true });
      await resetUserState(user.id);
      return;
    }

    await updateParticipationStatus(user.id, periodId, 'in_progress');
    await setUserState(user.id, 'lifestyle_general_text', { digest_period_id: periodId });
    try { await ctx.editMessageReplyMarkup(); } catch { /* ignore */ }
    await ctx.answerCbQuery('Participating');
    await ctx.reply('Share your lifestyle highlight (max 300 characters)');
  } catch (err) {
    console.error('[bot] participation choice error', err);
    await ctx.answerCbQuery('Something went wrong. Please try again.', { show_alert: true });
  }
});

bot.action(/^done_lifestyle_photos_(\d+)$/, async (ctx) => {
  const tgId = ctx.from.id;
  const periodId = Number(ctx.match[1]);
  try {
    const user = await getUserByTelegramId(tgId);
    if (!user) {
      await ctx.answerCbQuery('Please register with /start first.', { show_alert: true });
      return;
    }
    const state = await getUserState(user.id);
    if (state.state !== 'lifestyle_photos' || state.context?.digest_period_id !== periodId) {
      await ctx.answerCbQuery('This action is no longer valid.', { show_alert: true });
      return;
    }
    const period = await getPeriodById(periodId);
    if (period && isPastDeadline(period.end_date)) {
      await ctx.answerCbQuery('The submission deadline has passed.', { show_alert: true });
      await ctx.reply('The submission deadline has passed.');
      await resetUserState(user.id);
      return;
    }
    await setUserState(user.id, 'work_general_text', {
      digest_period_id: periodId,
      lifestyle_text: state.context?.lifestyle_text ?? ''
    });
    try { await ctx.editMessageReplyMarkup(); } catch { /* ignore */ }
    await ctx.answerCbQuery('Done');
    await ctx.reply('Share your work highlight (max 300 characters)');
  } catch (err) {
    console.error('[bot] done_lifestyle_photos error', err);
    await ctx.answerCbQuery('Something went wrong. Please try again.', { show_alert: true });
  }
});

bot.action(/^done_work_photos_(\d+)$/, async (ctx) => {
  const tgId = ctx.from.id;
  const periodId = Number(ctx.match[1]);
  try {
    const user = await getUserByTelegramId(tgId);
    if (!user) {
      await ctx.answerCbQuery('Please register with /start first.', { show_alert: true });
      return;
    }
    const state = await getUserState(user.id);
    if (state.state !== 'work_photos' || state.context?.digest_period_id !== periodId) {
      await ctx.answerCbQuery('This action is no longer valid.', { show_alert: true });
      return;
    }
    const period = await getPeriodById(periodId);
    if (period && isPastDeadline(period.end_date)) {
      await ctx.answerCbQuery('The submission deadline has passed.', { show_alert: true });
      await ctx.reply('The submission deadline has passed.');
      await resetUserState(user.id);
      return;
    }
    const lifestyleText = state.context?.lifestyle_text ?? '';
    const workText = state.context?.work_text ?? '';
    await setUserState(user.id, 'confirm_submission', {
      digest_period_id: periodId,
      lifestyle_text: lifestyleText,
      work_text: workText
    });
    const summary = `Lifestyle: ${lifestyleText}\nWork: ${workText}`;
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('Confirm', `confirm_submit_${periodId}`)]
    ]);
    try { await ctx.editMessageReplyMarkup(); } catch { /* ignore */ }
    await ctx.answerCbQuery('Done');
    await ctx.reply(summary, keyboard);
  } catch (err) {
    console.error('[bot] done_work_photos error', err);
    await ctx.answerCbQuery('Something went wrong. Please try again.', { show_alert: true });
  }
});

bot.action(/^confirm_submit_(\d+)$/, async (ctx) => {
  const tgId = ctx.from.id;
  const periodId = Number(ctx.match[1]);

  try {
    const user = await getUserByTelegramId(tgId);
    if (!user) {
      await ctx.answerCbQuery('Please register with /start first.', { show_alert: true });
      return;
    }

    const state = await getUserState(user.id);
    if (state.state !== 'confirm_submission' || state.context?.digest_period_id !== periodId) {
      await ctx.answerCbQuery('This confirmation is no longer valid.', { show_alert: true });
      return;
    }

    const period = await getPeriodById(periodId);
    if (period && isPastDeadline(period.end_date)) {
      await resetUserState(user.id);
      try { await ctx.editMessageReplyMarkup(); } catch { /* ignore */ }
      await ctx.answerCbQuery('The submission deadline has passed.', { show_alert: true });
      await ctx.reply('The submission deadline has passed.');
      return;
    }

    const now = new Date().toISOString();
    await updateParticipationStatus(user.id, periodId, 'submitted', now);
    await resetUserState(user.id);
    try { await ctx.editMessageReplyMarkup(); } catch { /* ignore */ }
    await ctx.answerCbQuery('Submitted');
    await ctx.reply('Your submission has been saved. Thank you for participating in this week\'s digest!');
  } catch (err) {
    console.error('[bot] confirm_submit error', err);
    await ctx.answerCbQuery('Something went wrong. Please try again.', { show_alert: true });
  }
});

// Handle team selection via inline keyboard during registration.
bot.action(/^team_(\d+)$/, async (ctx) => {
  const tgId = ctx.from.id;
  const teamId = Number(ctx.match[1]);

  try {
    const state = await getUserState(tgId);
    if (state.state !== 'registering_team') {
      await ctx.answerCbQuery('This selection is no longer valid.', { show_alert: true });
      return;
    }

    const { first_name, last_name } = state.context || {};
    if (!first_name || !last_name) {
      await ctx.answerCbQuery('Missing name information. Please restart with /start.', {
        show_alert: true
      });
      await resetUserState(tgId);
      return;
    }

    const existing = await getUserByTelegramId(tgId);
    if (!existing) {
      await createUser({
        telegram_id: tgId,
        first_name,
        last_name,
        team_id: teamId
      });
    }

    const user = await getUserByTelegramId(tgId);
    await setUserState(user.id, 'awaiting_avatar', {});

    try {
      await ctx.editMessageReplyMarkup();
    } catch {
      // ignore if message cannot be edited (older, etc.)
    }

    await ctx.answerCbQuery('Team selected');
    await ctx.reply('Please upload your profile photo. This photo will be used in the digest.');
  } catch (err) {
    console.error('[bot] team selection error', err);
    await ctx.answerCbQuery('Error saving your team. Please try again later.', {
      show_alert: true
    });
  }
});

// Global error logging
bot.catch((err, ctx) => {
  console.error(`[bot] Error for update ${ctx.update.update_id}`, err);
});

// --- Digest lifecycle: close overdue, publish ready, open next ---
async function runDigestLifecycle() {
  const now = new Date();
  const nowISO = now.toISOString();

  // 1. Close: status = open AND now >= end_date 23:59:59
  const toClose = await getPeriodsToClose(now);
  for (const period of toClose) {
    await closePeriod(period.id);
    console.log('[cron] Closed digest period', period.id, period.year_month, 'week', period.week_index);
  }

  // 2. Publish: status = closed AND now >= publish_date, then open next
  const toPublish = await getPeriodsToPublish(nowISO);
  for (const period of toPublish) {
    await publishPeriod(period.id);
    console.log('[cron] Published digest period', period.id, period.year_month, 'week', period.week_index);
    const next = await openNextPeriod(period.id);
    if (next) {
      console.log('[cron] Opened next period', next.id, next.year_month, 'week', next.week_index);
    }
  }
}

// --- Cron: run lifecycle every 5 min (resilient to restarts; catches up if server was down) ---
cron.schedule('*/5 * * * *', async () => {
  try {
    await runDigestLifecycle();
  } catch (err) {
    console.error('[cron] Digest lifecycle error', err);
  }
});

// --- Startup ---
async function start() {
  // Initialize DB and create tables on startup (so digest.sqlite is ready immediately).
  await getAllTeams();

  // Run lifecycle immediately on startup (catch up if server was down or DB was edited).
  try {
    await runDigestLifecycle();
  } catch (err) {
    console.error('[startup] Digest lifecycle error', err);
  }

  app.listen(PORT, () => {
    console.log(`HTTP API listening on port ${PORT}`);
  });

  await bot.launch();
  console.log('Telegram bot started with long polling');

  // Graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

start().catch((err) => {
  console.error('Fatal startup error', err);
  process.exit(1);
});

