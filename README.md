## SME Digest Bot & Landing

This project contains:
- Telegram bot for monthly team digest collection
- Node.js backend API with local SQLite database and filesystem uploads
- React (Next.js) public landing for monthly digests

### Structure

- `bot-backend/` – Telegraf bot, REST API, cron jobs, SQLite DB
- `web-landing/` – Next.js landing that consumes the backend API
- `bot-backend/src/db/sqlite.js` – SQLite schema and bootstrap

See subfolder READMEs for detailed setup and environment variables.

