#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <shadow|canary|majority|full>" >&2
  exit 64
fi

stage="$1"
env_file="${UNIFIED_RUNTIME_ENV_FILE:-$HOME/.openclaw/run/gateway.env}"

if [[ ! -f "$env_file" ]]; then
  echo "Missing env file: $env_file" >&2
  exit 65
fi

set_kv() {
  local key="$1"
  local value="$2"
  python3 - <<'PY' "$env_file" "$key" "$value"
import re, sys
from pathlib import Path
p = Path(sys.argv[1])
key = sys.argv[2]
value = sys.argv[3]
text = p.read_text(errors="ignore")
pattern = rf"^{re.escape(key)}=.*$"
line = f"{key}={value}"
if re.search(pattern, text, flags=re.M):
    text = re.sub(pattern, line, text, flags=re.M)
else:
    if text and not text.endswith("\n"):
        text += "\n"
    text += line + "\n"
p.write_text(text, encoding="utf-8")
PY
}

case "$stage" in
  shadow)
    set_kv "UNIFIED_ROUTER_DEFAULT_PRIMARY" "eve"
    set_kv "UNIFIED_ROUTER_DEFAULT_FALLBACK" "hermes"
    set_kv "UNIFIED_ROUTER_FAIL_CLOSED" "1"
    ;;
  canary)
    set_kv "UNIFIED_ROUTER_DEFAULT_PRIMARY" "hermes"
    set_kv "UNIFIED_ROUTER_DEFAULT_FALLBACK" "eve"
    set_kv "UNIFIED_ROUTER_FAIL_CLOSED" "0"
    ;;
  majority)
    set_kv "UNIFIED_ROUTER_DEFAULT_PRIMARY" "hermes"
    set_kv "UNIFIED_ROUTER_DEFAULT_FALLBACK" "eve"
    set_kv "UNIFIED_ROUTER_FAIL_CLOSED" "0"
    ;;
  full)
    set_kv "UNIFIED_ROUTER_DEFAULT_PRIMARY" "hermes"
    set_kv "UNIFIED_ROUTER_DEFAULT_FALLBACK" "none"
    set_kv "UNIFIED_ROUTER_FAIL_CLOSED" "1"
    ;;
  *)
    echo "Invalid stage: $stage" >&2
    exit 66
    ;;
esac

echo "Applied stage '$stage' to $env_file"
