#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="$ROOT_DIR/sources"
EVE_DIR="$SOURCE_DIR/eve"
HERMES_DIR="$SOURCE_DIR/hermes"

mkdir -p "$SOURCE_DIR"

load_env() {
  local env_file="$ROOT_DIR/.env"
  if [[ -f "$env_file" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
      [[ "$line" != *"="* ]] && continue
      export "$line"
    done <"$env_file"
  fi
}

checkout_source() {
  local remote="$1"
  local ref="$2"
  local commit="$3"
  local target="$4"
  local name="$5"

  if [[ -d "$target/.git" ]]; then
    echo "Updating $name source at $target"
    git -C "$target" fetch --all --tags --prune
  else
    echo "Cloning $name source into $target"
    git clone "$remote" "$target"
  fi

  if [[ -n "$commit" ]]; then
    git -C "$target" checkout "$commit"
  else
    git -C "$target" checkout "$ref"
    git -C "$target" pull --ff-only origin "$ref" || true
  fi

  local head_sha
  head_sha="$(git -C "$target" rev-parse HEAD)"
  echo "$name pinned at $head_sha"
}

load_env

EVE_SOURCE_REMOTE="${EVE_SOURCE_REMOTE:-/Users/dominiceasterling/openclaw}"
EVE_SOURCE_REF="${EVE_SOURCE_REF:-main}"
EVE_SOURCE_COMMIT="${EVE_SOURCE_COMMIT:-}"
HERMES_SOURCE_REMOTE="${HERMES_SOURCE_REMOTE:-https://github.com/NousResearch/hermes-agent.git}"
HERMES_SOURCE_REF="${HERMES_SOURCE_REF:-main}"
HERMES_SOURCE_COMMIT="${HERMES_SOURCE_COMMIT:-}"

checkout_source "$EVE_SOURCE_REMOTE" "$EVE_SOURCE_REF" "$EVE_SOURCE_COMMIT" "$EVE_DIR" "Eve"
checkout_source "$HERMES_SOURCE_REMOTE" "$HERMES_SOURCE_REF" "$HERMES_SOURCE_COMMIT" "$HERMES_DIR" "Hermes"
