#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EveAdapter } from "../adapters/eve-adapter.js";
import { HermesAdapter } from "../adapters/hermes-adapter.js";
import { env, loadDotEnvFile } from "../config/env.js";
import { dispatchUnifiedMessage } from "../runtime/unified-dispatch.js";
import type { LaneId } from "../contracts/types.js";

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

function parseLane(value: string, fallback: LaneId): LaneId {
  return value === "hermes" ? "hermes" : value === "eve" ? "eve" : fallback;
}

function parseFallbackLane(value: string): LaneId | "none" {
  if (value === "none") {
    return "none";
  }
  return parseLane(value, "hermes");
}

async function main() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  await loadDotEnvFile(rootDir);
  const { text, chatId, messageId } = parseArgs(process.argv.slice(2));

  const launchArgs = env("HERMES_LAUNCH_ARGS", "-m hermes gateway")
    .split(/\s+/)
    .filter(Boolean);

  const runtime = {
    eveAdapter: new EveAdapter(
      env("EVE_TASK_DISPATCH_SCRIPT", "/Users/dominiceasterling/openclaw/scripts/eve-task-dispatch.sh"),
      env("EVE_DISPATCH_RESULT_PATH", "/Users/dominiceasterling/.openclaw/state/eve-task-dispatch-last.json"),
    ),
    hermesAdapter: new HermesAdapter(
      env("HERMES_LAUNCH_COMMAND", "python3"),
      launchArgs,
    ),
    routerConfig: {
      defaultPrimary: parseLane(env("UNIFIED_ROUTER_DEFAULT_PRIMARY", "eve"), "eve"),
      defaultFallback: parseFallbackLane(env("UNIFIED_ROUTER_DEFAULT_FALLBACK", "hermes")),
      failClosed: env("UNIFIED_ROUTER_FAIL_CLOSED", "1") === "1",
      policyVersion: "v1",
    },
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
