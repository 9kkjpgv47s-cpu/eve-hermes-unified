#!/usr/bin/env node
import path from "node:path";
import { resolvePackageRoot } from "../config/package-root.js";
import { dispatchUnifiedMessage } from "../runtime/unified-dispatch.js";
import { buildUnifiedRuntimeFromEnv } from "../runtime/build-unified-runtime.js";

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
  const rootDir = resolvePackageRoot(import.meta.url);
  const { runtime } = await buildUnifiedRuntimeFromEnv(rootDir);
  const { text, chatId, messageId } = parseArgs(process.argv.slice(2));

  const result = await dispatchUnifiedMessage(runtime, {
    channel: "telegram",
    chatId,
    messageId,
    text,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
