#!/usr/bin/env bash
# Run all SQL migrations against Supabase in order.
# Usage: ./migrations/migrate.sh
#
# Requires:
#   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env (or exported)
#   - curl
#
# Each migration is sent to the Supabase REST SQL endpoint.
# Migrations are idempotent (CREATE IF NOT EXISTS / ON CONFLICT DO NOTHING).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load .env if it exists
if [[ -f "$PROJECT_ROOT/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$PROJECT_ROOT/.env"
  set +a
fi

# Validate required vars
if [[ -z "${SUPABASE_URL:-}" ]]; then
  echo "ERROR: SUPABASE_URL is not set" >&2
  exit 1
fi
if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "ERROR: SUPABASE_SERVICE_ROLE_KEY is not set" >&2
  exit 1
fi

# Strip trailing slash from URL
SUPABASE_URL="${SUPABASE_URL%/}"

echo "Running migrations against: $SUPABASE_URL"
echo "──────────────────────────────────────────"

FAILED=0
SUCCEEDED=0

for migration in "$SCRIPT_DIR"/[0-9]*.sql; do
  name="$(basename "$migration")"
  printf "  %-45s" "$name"

  sql="$(cat "$migration")"

  response=$(curl -s -w "\n%{http_code}" \
    -X POST "${SUPABASE_URL}/rest/v1/rpc/exec_sql" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg sql "$sql" '{query: $sql}')" 2>&1) || true

  http_code=$(echo "$response" | tail -1)
  body=$(echo "$response" | sed '$d')

  # Fallback: use the raw SQL endpoint if rpc/exec_sql isn't available
  if [[ "$http_code" != "200" ]]; then
    response=$(curl -s -w "\n%{http_code}" \
      -X POST "${SUPABASE_URL}/pg" \
      -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --arg sql "$sql" '{query: $sql}')" 2>&1) || true

    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | sed '$d')
  fi

  if [[ "$http_code" == "200" ]]; then
    echo "OK"
    SUCCEEDED=$((SUCCEEDED + 1))
  else
    echo "FAILED (HTTP $http_code)"
    echo "    $body" | head -3
    FAILED=$((FAILED + 1))
  fi
done

echo "──────────────────────────────────────────"
echo "Done: $SUCCEEDED succeeded, $FAILED failed"

if [[ $FAILED -gt 0 ]]; then
  echo ""
  echo "TIP: If the REST endpoints aren't available, run migrations"
  echo "     directly in the Supabase Dashboard → SQL Editor, or use:"
  echo "     psql \"\$DATABASE_URL\" -f migrations/001_ops_mission_proposals.sql"
  exit 1
fi
