#!/usr/bin/env bash
set -euo pipefail

env_file="${UNIFIED_RUNTIME_ENV_FILE:-$HOME/.openclaw/run/gateway.env}"
if [[ ! -f "$env_file" ]]; then
  echo "Missing env file: $env_file" >&2
  exit 1
fi

python3 - <<'PY' "$env_file"
import re, sys
from pathlib import Path
p = Path(sys.argv[1])
text = p.read_text(errors="ignore")
updates = {
    "UNIFIED_ROUTER_DEFAULT_PRIMARY": "eve",
    "UNIFIED_ROUTER_DEFAULT_FALLBACK": "none",
    "UNIFIED_ROUTER_FAIL_CLOSED": "1",
    "UNIFIED_ROUTER_CUTOVER_STAGE": "shadow",
    "UNIFIED_ROUTER_STAGE": "shadow",
    "UNIFIED_ROUTER_CANARY_CHAT_IDS": "",
    "UNIFIED_ROUTER_MAJORITY_PERCENT": "0",
}
for key, value in updates.items():
    pattern = rf"^{re.escape(key)}=.*$"
    line = f"{key}={value}"
    if re.search(pattern, text, flags=re.M):
        text = re.sub(pattern, line, text, flags=re.M)
    else:
        if text and not text.endswith("\n"):
            text += "\n"
        text += line + "\n"
p.write_text(text, encoding="utf-8")
print(f"Rollback policy written to {p}")
PY
