#!/usr/bin/env bash
# Region failover rehearsal: verify standby region swaps primary/fallback (routing-only).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"
export UNIFIED_ROUTER_STANDBY_REGION="${UNIFIED_ROUTER_STANDBY_REGION:-eu-west-backup}"
exec npx tsx ./scripts/region-failover-rehearsal-runner.ts
