import dotenv from 'dotenv';

// Load .env from the bot-backend directory.
// Make sure you have bot-backend/.env with TELEGRAM_BOT_TOKEN defined.
dotenv.config();

// Centralised config, all sensitive values come from env vars.
export const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramAdminId: process.env.TELEGRAM_ADMIN_ID,
  telegramChannelId: process.env.TELEGRAM_CHANNEL_ID,
  // Timezone used for month closing calculations, e.g. 'Europe/Moscow'
  timezone: process.env.APP_TIMEZONE || 'UTC',
  // Base URL of the public landing (for links sent to channel)
  landingBaseUrl: process.env.LANDING_BASE_URL || 'https://example.com'
};

if (!config.telegramToken) {
  console.warn('[config] TELEGRAM_BOT_TOKEN is not set.');
}

