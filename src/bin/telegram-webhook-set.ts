#!/usr/bin/env node
/**
 * Calls Telegram setWebhook using TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_PUBLIC_URL + TELEGRAM_WEBHOOK_PATH.
 */
import path from "node:path";
import { resolvePackageRoot } from "../config/package-root.js";
import { loadDotEnvFile } from "../config/env.js";
import { loadUnifiedConfigFile } from "../config/load-unified-config-file.js";
import { hydrateTelegramTokenFromFile } from "../config/telegram-token-file.js";
import { loadUnifiedControlPlaneEnv } from "../config/unified-control-plane-env.js";
import { telegramSetWebhook } from "../telegram/bot-api.js";

function parseUrlFlag(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--url" && argv[i + 1]) {
      return argv[i + 1];
    }
  }
  return undefined;
}

async function main() {
  const rootDir = resolvePackageRoot(import.meta.url);
  await loadDotEnvFile(rootDir);
  await loadUnifiedConfigFile(rootDir);
  await hydrateTelegramTokenFromFile();
  const c = loadUnifiedControlPlaneEnv();
  if (!c.telegramBotToken.trim()) {
    throw new Error("TELEGRAM_BOT_TOKEN is required.");
  }
  const flagUrl = parseUrlFlag(process.argv.slice(2))?.replace(/\/+$/, "");
  const base = (flagUrl || c.telegramWebhookPublicUrl || "").replace(/\/+$/, "");
  if (!base.startsWith("https://")) {
    throw new Error("Webhook URL must be https:// (use --url or TELEGRAM_WEBHOOK_PUBLIC_URL).");
  }
  const pathPart = c.telegramWebhookPath.startsWith("/") ? c.telegramWebhookPath : `/${c.telegramWebhookPath}`;
  const webhookUrl = `${base}${pathPart}`;

  const drop = process.argv.includes("--drop-pending");
  const result = await telegramSetWebhook(c.telegramBotToken, webhookUrl, {
    secretToken: c.telegramWebhookSecret,
    dropPendingUpdates: drop,
  });
  process.stdout.write(`${JSON.stringify({ webhookUrl, result }, null, 2)}\n`);
  if (!result.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
