/** Default patterns for subprocess capture redaction (tokens, cookies, common secret shapes). */
export const DEFAULT_LANE_IO_SECRET_PATTERNS: readonly RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._\-+/=]+\b/gi,
  /\b(eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)\b/g, // JWT-shaped
  /\b(api[_-]?key|token|password|secret)\s*[:=]\s*[^\s&"'<>]{4,}/gi,
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id shape
  /\b(sk-[A-Za-z0-9]{20,})\b/gi, // OpenAI-style key prefix
];

function compileCustomPatterns(raw: string): RegExp[] {
  const out: RegExp[] = [];
  for (const part of raw.split(/[|,]/).map((s) => s.trim()).filter(Boolean)) {
    try {
      out.push(new RegExp(part, "gi"));
    } catch {
      // skip invalid user regex
    }
  }
  return out;
}

/**
 * Redact likely secrets from lane stdout/stderr before persistence.
 * When `enabled` is false, returns input unchanged.
 */
export function redactLaneIo(text: string, enabled: boolean, extraRegexSource?: string): string {
  if (!enabled || text.length === 0) {
    return text;
  }
  let out = text;
  const patterns = [...DEFAULT_LANE_IO_SECRET_PATTERNS, ...compileCustomPatterns(extraRegexSource ?? "")];
  for (const re of patterns) {
    out = out.replace(re, "[REDACTED]");
  }
  return out;
}
