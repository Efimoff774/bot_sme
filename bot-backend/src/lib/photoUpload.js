import fs from 'fs';
import path from 'path';

/**
 * Downloads a photo from Telegram by file_id and saves it to targetPath.
 * Uses Telegram Bot API getFile + fetch. Caller must ensure parent directory exists.
 * @param {object} telegram - Telegraf telegram instance (ctx.telegram)
 * @param {string} fileId - Telegram file_id (e.g. from ctx.message.photo[].file_id)
 * @param {string} targetPath - Absolute or relative path where to save the file (e.g. .jpg)
 * @returns {Promise<void>}
 */
export async function downloadTelegramPhoto(telegram, fileId, targetPath) {
  const link = await telegram.getFileLink(fileId);
  const response = await fetch(link.href);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`);
  }
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(targetPath, buffer);
}
