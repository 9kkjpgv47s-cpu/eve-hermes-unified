#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const o = { evidenceDir: "", out: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--evidence-dir") {
      o.evidenceDir = argv[i + 1] ?? "";
      i += 1;
    } else if (a === "--out") {
      o.out = argv[i + 1] ?? "";
      i += 1;
    }
  }
  return o;
}

async function newestFile(dir, prefix) {
  const entries = await readdir(dir, { withFileTypes: true });
  const matches = entries
    .filter((e) => e.isFile() && e.name.startsWith(prefix))
    .map((e) => path.join(dir, e.name));
  if (matches.length === 0) {
    return null;
  }
  matches.sort();
  return matches[matches.length - 1];
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  if (!opt.evidenceDir.trim()) {
    throw new Error("Missing --evidence-dir");
  }
  const evidenceDir = path.resolve(opt.evidenceDir);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
  const outPath = opt.out.trim()
    ? path.resolve(opt.out)
    : path.join(evidenceDir, `emergency-rollback-bundle-${stamp}.json`);

  const validationSummary = await newestFile(evidenceDir, "validation-summary-");
  const soak = await newestFile(evidenceDir, "soak-");
  const failureInjection = await newestFile(evidenceDir, "failure-injection-");
  const cutover = await newestFile(evidenceDir, "cutover-readiness-");
  const regression = await newestFile(evidenceDir, "regression-eve-primary-");

  const payload = {
    schemaVersion: "v1",
    generatedAtIso: new Date().toISOString(),
    horizon: "H3",
    summary: "Operator replay bundle: core validation artifacts for emergency rollback rehearsal.",
    pass: true,
    files: {
      validationSummary,
      soak,
      failureInjection,
      cutoverReadiness: cutover,
      regressionEvePrimary: regression,
    },
    steps: [
      {
        id: "validate-all",
        title: "Full validation gate",
        command: "npm run validate:all",
        evidencePaths: validationSummary ? [validationSummary] : [],
      },
      {
        id: "soak-slo",
        title: "Soak SLO drift check (optional; run validate-soak-slo after soak)",
        command: "node scripts/validate-soak-slo.mjs --file <soak.jsonl>",
        evidencePaths: soak ? [soak] : [],
      },
      {
        id: "cutover-readiness",
        title: "Cutover readiness",
        command: "npm run validate:cutover-readiness",
        evidencePaths: cutover ? [cutover] : [],
      },
    ],
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`${outPath}\n`);
}

main().catch((e) => {
  process.stderr.write(`${String(e)}\n`);
  process.exitCode = 2;
});
