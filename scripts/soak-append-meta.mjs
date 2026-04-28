#!/usr/bin/env node
import { readFile } from "node:fs/promises";

function parseArgs(argv) {
  const o = { iteration: "", exitCode: "", stderrFile: "", dispatchFile: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--iteration") {
      o.iteration = argv[i + 1] ?? "";
      i += 1;
    } else if (a === "--exit-code") {
      o.exitCode = argv[i + 1] ?? "";
      i += 1;
    } else if (a === "--stderr-file") {
      o.stderrFile = argv[i + 1] ?? "";
      i += 1;
    } else if (a === "--dispatch-file") {
      o.dispatchFile = argv[i + 1] ?? "";
      i += 1;
    }
  }
  return o;
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const stderrRaw = await readFile(opt.stderrFile, "utf8").catch(() => "");
  const stderr = stderrRaw.length > 8000 ? `${stderrRaw.slice(0, 8000)}…[truncated]` : stderrRaw;
  const dispatchRaw = await readFile(opt.dispatchFile, "utf8");
  let traceId = "";
  let responseFailureClass = "";
  let chatId = "";
  let messageId = "";
  try {
    const d = JSON.parse(dispatchRaw);
    traceId = String(d?.envelope?.traceId ?? "").trim();
    chatId = String(d?.envelope?.chatId ?? "").trim();
    messageId = String(d?.envelope?.messageId ?? "").trim();
    responseFailureClass = String(d?.response?.failureClass ?? "").trim();
  } catch {
    // leave fields empty
  }
  const line = {
    soakMeta: true,
    schemaVersion: 1,
    iteration: Number(opt.iteration),
    exitCode: Number(opt.exitCode),
    stderr,
    traceId,
    chatId,
    messageId,
    responseFailureClass,
  };
  process.stdout.write(`${JSON.stringify(line)}\n`);
}

main().catch((e) => {
  process.stderr.write(`${String(e)}\n`);
  process.exitCode = 2;
});
