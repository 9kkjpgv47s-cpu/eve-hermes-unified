#!/usr/bin/env bash
# Bounded remediation dry-run for cloud agents (see scripts/agent-remediation-playbook.mjs).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "${ROOT}/scripts/agent-remediation-playbook.mjs"
