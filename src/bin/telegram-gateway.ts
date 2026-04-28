#!/usr/bin/env node
/**
 * Telegram ingress gateway: single entry that builds the envelope and calls `dispatchUnifiedMessage`.
 * When `UNIFIED_TELEGRAM_GATEWAY_MODE=legacy`, exits without dispatch (parity with cutover runbook).
 */
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dispatchUnifiedMessage } from "../runtime/unified-dispatch.js";
import { buildUnifiedRuntimeFromEnv, defaultEvidenceDir } from "../runtime/build-unified-runtime.js";
import { env } from "../config/env.js";

function parseArgs(argv: string[]): { text: string; chatId: string; messageId: string } {
  let text = "";
  let chatId = "0";
  let messageId = "0";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--text") {
      text = argv[i + 1] ?? "";
      i += 1;
    } else if (arg === "--chat-id") {
      chatId = argv[i + 1] ?? "0";
      i += 1;
    } else if (arg === "--message-id") {
      messageId = argv[i + 1] ?? "0";
      i += 1;
    }
  }
  if (!text.trim()) {
    throw new Error("Missing required --text argument.");
  }
  return { text, chatId, messageId };
}

async function main() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const { runtime, gatewayMode } = await buildUnifiedRuntimeFromEnv(rootDir);

  if (gatewayMode === "legacy") {
    const payload = {
      gatewayMode: "legacy" as const,
      skipped: true,
      reason: "UNIFIED_TELEGRAM_GATEWAY_MODE=legacy; unified dispatch not invoked.",
    };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  const { text, chatId, messageId } = parseArgs(process.argv.slice(2));
  const result = await dispatchUnifiedMessage(runtime, {
    channel: "telegram",
    chatId,
    messageId,
    text,
  });

  const outDir = env("UNIFIED_EVIDENCE_DIR", defaultEvidenceDir(rootDir));
  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const transcriptPath = path.join(outDir, `telegram-gateway-${stamp}.json`);
  await writeFile(transcriptPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  process.stdout.write(`${JSON.stringify({ ...result, transcriptPath }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
