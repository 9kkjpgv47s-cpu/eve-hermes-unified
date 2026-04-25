import { readFile } from "node:fs/promises";
import path from "node:path";

export async function loadDotEnvFile(rootDir: string): Promise<void> {
  const envPath = path.join(rootDir, ".env");
  try {
    const raw = await readFile(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }
      const [key, ...rest] = trimmed.split("=");
      if (!key || process.env[key] !== undefined) {
        continue;
      }
      process.env[key] = rest.join("=");
    }
  } catch {
    // .env is optional
  }
}

export function env(name: string, fallback = ""): string {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}
