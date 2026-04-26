#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EveAdapter } from "../adapters/eve-adapter.js";
import { HermesAdapter } from "../adapters/hermes-adapter.js";
import { loadDotEnvFile } from "../config/env.js";
import { loadUnifiedRuntimeEnvConfig } from "../config/unified-runtime-config.js";
import { createUnifiedMemoryStoreFromEnv } from "../memory/unified-memory-store.js";
import { createDefaultUnifiedCapabilityRegistry } from "../skills/capability-registry.js";
import { UnifiedCapabilityEngine } from "../runtime/capability-engine.js";
import { dispatchUnifiedMessage } from "../runtime/unified-dispatch.js";

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
  await loadDotEnvFile(rootDir);
  const { text, chatId, messageId } = parseArgs(process.argv.slice(2));
  const config = loadUnifiedRuntimeEnvConfig();
  const sharedMemoryStore = createUnifiedMemoryStoreFromEnv(
    config.unifiedMemoryStoreKind,
    config.unifiedMemoryFilePath,
  );
  const capabilityRegistry = createDefaultUnifiedCapabilityRegistry();
  const capabilityEngine = new UnifiedCapabilityEngine(capabilityRegistry, sharedMemoryStore);

  const runtime = {
    eveAdapter: new EveAdapter(config.eveDispatchScript, config.eveDispatchResultPath),
    hermesAdapter: new HermesAdapter(config.hermesLaunchCommand, config.hermesLaunchArgs),
    routerConfig: config.routerConfig,
    capabilityEngine,
  };

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
