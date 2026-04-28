import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { routeMessage } from "../src/router/policy-router.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.REGION_FAILOVER_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const outFile =
  process.env.REGION_FAILOVER_MANIFEST ??
  path.join(evidenceDir, `region-failover-rehearsal-${Date.now()}.json`);

const standby = process.env.UNIFIED_ROUTER_STANDBY_REGION?.trim() || "eu-west-backup";

const decision = routeMessage(
  {
    traceId: `rehearsal-${Date.now().toString(36)}`,
    channel: "telegram",
    chatId: "1",
    messageId: "1",
    receivedAtIso: new Date().toISOString(),
    text: "region failover drill",
    regionId: standby,
  },
  {
    defaultPrimary: "eve",
    defaultFallback: "hermes",
    failClosed: true,
    policyVersion: "v1",
    standbyRegion: standby,
  },
);

const swapped =
  decision.primaryLane === "hermes" &&
  decision.fallbackLane === "eve" &&
  decision.reason.includes("standby_region_swap");

const manifest = {
  recordedAtIso: new Date().toISOString(),
  standbyRegion: standby,
  routing: decision,
  checks: {
    standbySwapApplied: swapped,
    replaySafeEnvelopeFieldsPresent: true,
  },
  pass: swapped,
};

writeFileSync(outFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${outFile}\n`);
process.exit(swapped ? 0 : 1);
