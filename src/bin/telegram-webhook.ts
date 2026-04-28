#!/usr/bin/env node
/**
 * Telegram Bot API webhook server: verifies secret path, maps `message` to unified dispatch,
 * optionally replies via sendMessage (TELEGRAM_WEBHOOK_SEND_REPLY=1).
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { resolvePackageRoot } from "../config/package-root.js";
import { dispatchUnifiedMessage } from "../runtime/unified-dispatch.js";
import { buildUnifiedRuntimeFromEnv } from "../runtime/build-unified-runtime.js";
import { loadDotEnvFile } from "../config/env.js";
import { loadUnifiedConfigFile } from "../config/load-unified-config-file.js";
import { loadUnifiedControlPlaneEnv } from "../config/unified-control-plane-env.js";
import { telegramSendMessage } from "../telegram/bot-api.js";
import { summarizeDispatch } from "../telegram/dispatch-reply-summary.js";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = `${JSON.stringify(body)}\n`;
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(payload) });
  res.end(payload);
}

async function main() {
  const rootDir = resolvePackageRoot(import.meta.url);
  await loadDotEnvFile(rootDir);
  await loadUnifiedConfigFile(rootDir);
  const c = loadUnifiedControlPlaneEnv();
  if (!c.telegramBotToken.trim()) {
    throw new Error("TELEGRAM_BOT_TOKEN is required for telegram-webhook server.");
  }

  const { runtime } = await buildUnifiedRuntimeFromEnv(rootDir);
  const expectedPath = c.telegramWebhookPath.startsWith("/") ? c.telegramWebhookPath : `/${c.telegramWebhookPath}`;
  const secret = c.telegramWebhookSecret.trim();

  const server = createServer(async (req, res) => {
    try {
      if (req.method !== "POST") {
        sendJson(res, 405, { error: "method_not_allowed" });
        return;
      }
      const urlPath = (() => {
        try {
          return new URL(req.url ?? "/", "http://localhost").pathname;
        } catch {
          return req.url ?? "/";
        }
      })();

      if (urlPath !== expectedPath) {
        sendJson(res, 404, { error: "not_found" });
        return;
      }
      if (secret.length > 0) {
        const token = req.headers["x-telegram-bot-api-secret-token"];
        if (token !== secret) {
          sendJson(res, 401, { error: "invalid_secret" });
          return;
        }
      }

      const raw = await readBody(req);
      let update: { message?: { chat?: { id?: number }; message_id?: number; text?: string } };
      try {
        update = JSON.parse(raw) as typeof update;
      } catch {
        sendJson(res, 400, { error: "invalid_json" });
        return;
      }

      const msg = update.message;
      if (!msg?.chat?.id || msg.message_id === undefined || !msg.text?.trim()) {
        sendJson(res, 200, { ok: true, ignored: true, reason: "no_text_message" });
        return;
      }

      const result = await dispatchUnifiedMessage(runtime, {
        channel: "telegram",
        chatId: String(msg.chat.id),
        messageId: String(msg.message_id),
        text: msg.text,
      });

      let telegramReply: unknown;
      if (c.telegramWebhookSendReply) {
        telegramReply = await telegramSendMessage(c.telegramBotToken, msg.chat.id, summarizeDispatch(result), {
          replyToMessageId: msg.message_id,
        });
      }

      sendJson(res, 200, { ok: true, dispatch: result, telegramReply });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: String(error) });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(c.telegramWebhookPort, c.telegramWebhookHost, () => resolve());
    server.on("error", reject);
  });

  process.stderr.write(
    `telegram-webhook listening on http://${c.telegramWebhookHost}:${c.telegramWebhookPort}${expectedPath}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
