import { config } from '../config.js';
import { getTeamById } from '../db/teams.js';
import { getUsersByTeamId } from '../db/users.js';
import { getActiveSubmittedParticipantsByPeriodId } from '../db/participation.js';

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatPeriodTitle(period) {
  const start = period?.start_date ? String(period.start_date) : '';
  const end = period?.end_date ? String(period.end_date) : '';
  if (start && end) return `${start} — ${end}`;
  return `${period?.year_month ?? ''} week ${period?.week_index ?? ''}`.trim();
}

function buildDigestLink(periodId) {
  const base = (config.landingBaseUrl || '').replace(/\/$/, '');
  if (!base) return null;
  if (!periodId) return base;
  return `${base}/period/${encodeURIComponent(String(periodId))}`;
}

function mentionUserHtml(u) {
  const username = u?.username ? String(u.username).trim() : '';
  if (username) {
    const handle = username.startsWith('@') ? username : `@${username}`;
    return escapeHtml(handle);
  }

  const userId = Number(u?.telegram_id);
  const name = `${u?.first_name ?? ''} ${u?.last_name ?? ''}`.trim() || 'Participant';
  if (!Number.isFinite(userId)) return escapeHtml(name);
  return `<a href="tg://user?id=${userId}">${escapeHtml(name)}</a>`;
}

export async function sendDigestToGroup(telegram, period) {
  const channelId = config.telegramChannelId;
  if (!channelId) {
    console.warn('[groupMessaging] TELEGRAM_CHANNEL_ID is not set, skip digest post');
    return;
  }

  const team = period?.team_id ? await getTeamById(period.team_id) : null;
  const submittedParticipants = period?.id
    ? await getActiveSubmittedParticipantsByPeriodId(period.id)
    : [];

  const periodTitle = formatPeriodTitle(period);
  const link = buildDigestLink(period?.id);
  const mentionsAll = submittedParticipants.map(mentionUserHtml).filter(Boolean);
  const mentions = mentionsAll.slice(0, 10);
  const mentionsLine = mentions.length ? mentions.join(', ') : null;
  const restCount = Math.max(0, mentionsAll.length - mentions.length);

  const lines = [
    '<b>Weekly digest is ready</b>',
    '',
    `<b>Period:</b> ${escapeHtml(periodTitle)}`,
    team?.name ? `<b>Team:</b> ${escapeHtml(team.name)}` : null,
    '',
    link ? `<b>View digest:</b>\n${escapeHtml(link)}` : null,
    mentionsLine ? `\n<b>Participants:</b>\n${mentionsLine}` : null,
    restCount > 0 ? `<i>and ${restCount} more</i>` : null
  ].filter((l) => l != null);

  await telegram.sendMessage(channelId, lines.join('\n'), {
    parse_mode: 'HTML',
    disable_web_page_preview: true
  });
}

export async function sendWeekStartNotification(telegram, period, botUsername) {
  const channelId = config.telegramChannelId;
  if (!channelId) {
    console.warn('[groupMessaging] TELEGRAM_CHANNEL_ID is not set, skip week start post');
    return;
  }

  const team = period?.team_id ? await getTeamById(period.team_id) : null;
  const teamUsers = period?.team_id ? await getUsersByTeamId(period.team_id) : [];

  const deadline = period?.end_date ? String(period.end_date) : 'Sunday';
  const periodTitle = formatPeriodTitle(period);
  const deepLink = botUsername ? `https://t.me/${botUsername}` : null;

  const mentionsAll = teamUsers.map(mentionUserHtml).filter(Boolean);
  const mentions = mentionsAll.slice(0, 10);
  const mentionsLine = mentions.length ? mentions.join(', ') : null;
  const restCount = Math.max(0, mentionsAll.length - mentions.length);

  const lines = [
    '<b>New digest week started</b>',
    '',
    `<b>Period:</b> ${escapeHtml(periodTitle)}`,
    team?.name ? `<b>Team:</b> ${escapeHtml(team.name)}` : null,
    `<b>Submit your updates before:</b> ${escapeHtml(deadline)}`,
    mentionsLine ? `\n<b>Participants:</b>\n${mentionsLine}` : null,
    restCount > 0 ? `<i>and ${restCount} more</i>` : null,
    '',
    deepLink ? `<b>Open bot:</b>\n${escapeHtml(deepLink)}` : null
  ].filter((l) => l != null);

  await telegram.sendMessage(channelId, lines.join('\n'), {
    parse_mode: 'HTML',
    disable_web_page_preview: true
  });
}

