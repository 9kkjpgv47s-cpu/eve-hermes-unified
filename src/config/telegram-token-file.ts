import { readFile } from "node:fs/promises";

/**
 * If `TELEGRAM_BOT_TOKEN_FILE` is set, read token from file (trimmed single line).
 * Does not override non-empty `TELEGRAM_BOT_TOKEN` env.
 */
export async function hydrateTelegramTokenFromFile(): Promise<void> {
  const filePath = process.env.TELEGRAM_BOT_TOKEN_FILE?.trim();
  if (!filePath) {
    return;
  }
  if (process.env.TELEGRAM_BOT_TOKEN?.trim()) {
    return;
  }
  const raw = await readFile(filePath, "utf8");
  const line = raw.split(/\r?\n/).find((l) => l.trim().length > 0)?.trim();
  if (line) {
    process.env.TELEGRAM_BOT_TOKEN = line;
  }
}
