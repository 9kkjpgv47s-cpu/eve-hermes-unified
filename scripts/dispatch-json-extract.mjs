/**
 * Extract pretty-printed or concatenated unified dispatch JSON objects from raw soak logs.
 */

export function isDispatchRecord(value) {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    value.response &&
    typeof value.response === "object" &&
    value.envelope
  );
}

export function extractDispatchJsonRecords(raw) {
  const records = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let startIndex = -1;

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];

    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }

    if (ch === "{") {
      if (depth === 0) {
        startIndex = i;
      }
      depth += 1;
      continue;
    }

    if (ch === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && startIndex >= 0) {
        const candidate = raw.slice(startIndex, i + 1);
        try {
          const parsed = JSON.parse(candidate);
          if (isDispatchRecord(parsed)) {
            records.push(parsed);
          }
        } catch {
          // Ignore non-dispatch JSON snippets.
        }
        startIndex = -1;
      }
    }
  }

  return records;
}
