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
import { registerDefaultCapabilityExecutors } from "../runtime/default-capability-handlers.js";
import { dispatchUnifiedMessage } from "../runtime/unified-dispatch.js";
import { createCapabilityPolicy } from "../runtime/capability-policy.js";

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
  const eveAdapter = new EveAdapter(config.eveDispatchScript, config.eveDispatchResultPath);
  const hermesAdapter = new HermesAdapter(config.hermesLaunchCommand, config.hermesLaunchArgs);
  const capabilityRegistry = createDefaultUnifiedCapabilityRegistry();
  const dispatchLane = async (input: {
    lane: "eve" | "hermes";
    text: string;
    intentRoute: string;
    chatId: string;
    messageId: string;
    traceId: string;
  }) => {
    const adapter = input.lane === "eve" ? eveAdapter : hermesAdapter;
    return adapter.dispatch({
      envelope: {
        channel: "telegram",
        chatId: input.chatId,
        messageId: input.messageId,
        text: input.text,
        traceId: input.traceId,
        receivedAtIso: new Date().toISOString(),
      },
      intentRoute: input.intentRoute,
    });
  };
  registerDefaultCapabilityExecutors(capabilityRegistry, {
    dispatchLane,
    memoryStore: sharedMemoryStore,
  });
  const capabilityPolicy = createCapabilityPolicy(config.capabilityPolicy);
  const capabilityEngine = new UnifiedCapabilityEngine(capabilityRegistry, {
    memoryStore: sharedMemoryStore,
    dispatchLane,
    policy: capabilityPolicy,
  });

  const runtime = {
    eveAdapter,
    hermesAdapter,
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
