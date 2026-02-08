#!/usr/bin/env bash
# Seed default data (trigger rules, etc.). Idempotent.
# Usage: ./scripts/seed.sh
# Requires: DATABASE_URL (and PGPASSWORD if auth needed)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load .env
if [[ -f "$PROJECT_ROOT/.env" ]]; then
  set +H
  set -a
  while IFS= read -r line; do
    line="${line%%[[:space:]]*}"
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      val="${BASH_REMATCH[2]}"
      val="${val#\'}"; val="${val%\'}"
      val="${val#\"}"; val="${val%\"}"
      export "${BASH_REMATCH[1]}=$val"
    fi
  done < <(grep -v '^#' "$PROJECT_ROOT/.env" | grep -v '^$')
  set +a
  set -H 2>/dev/null || true
fi

if [[ -z "${DATABASE_URL:-}" ]] || [[ ! "$DATABASE_URL" =~ ^postgres ]]; then
  echo "ERROR: Set DATABASE_URL in .env" >&2
  exit 1
fi

if ! command -v psql &>/dev/null; then
  echo "ERROR: psql not installed (sudo apt install postgresql-client)" >&2
  exit 1
fi

echo "Seeding..."
psql -d "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SCRIPT_DIR/seed-trigger.sql"
echo "✓ Done."
