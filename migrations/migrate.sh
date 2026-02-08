#!/usr/bin/env bash
# Run all SQL migrations against Supabase in order.
# Usage: ./migrations/migrate.sh
#
# Requires one of:
#   A) DATABASE_URL (PostgreSQL connection URI) — uses psql (recommended)
#   B) SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY — uses REST (often 404)
#
# Get DATABASE_URL: Supabase Dashboard → Project Settings → Database → Connection string (URI)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load .env if it exists (set +H disables history expansion for passwords with !)
if [[ -f "$PROJECT_ROOT/.env" ]]; then
  set +H
  set -a
  while IFS= read -r line; do
    line="${line%%[[:space:]]*}"
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      export "${BASH_REMATCH[1]}=${BASH_REMATCH[2]}"
    fi
  done < <(grep -v '^#' "$PROJECT_ROOT/.env" | grep -v '^$')
  set +a
  set -H 2>/dev/null || true
fi

# ── psql path (preferred) ────────────────────────────────────
if [[ -n "${DATABASE_URL:-}" ]]; then
  if [[ ! "$DATABASE_URL" =~ ^postgres(ql)?:// ]]; then
    echo "ERROR: DATABASE_URL must be a postgresql:// URI" >&2
    exit 1
  fi
  if ! command -v psql &>/dev/null; then
    echo "ERROR: DATABASE_URL set but psql not installed" >&2
    echo "Install: sudo apt install postgresql-client" >&2
    exit 1
  fi

  echo "Running migrations via psql (.env from $PROJECT_ROOT)"
  echo "──────────────────────────────────────────"

  FAILED=0
  SUCCEEDED=0

  for migration in "$SCRIPT_DIR"/[0-9]*.sql; do
    name="$(basename "$migration")"
    printf "  %-45s" "$name"
    set +e
    err=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration" 2>&1)
    rc=$?
    set -e
    if [[ $rc -eq 0 ]]; then
      echo "OK"
      SUCCEEDED=$((SUCCEEDED + 1))
    else
      echo "FAILED"
      echo "$err" | head -5 | sed 's/^/    /'
      if [[ "$err" == *"socket"* ]]; then
        echo "    Hint: DATABASE_URL may be empty or invalid. Check .env and connection string format."
      fi
      FAILED=$((FAILED + 1))
    fi
  done

  echo "──────────────────────────────────────────"
  echo "Done: $SUCCEEDED succeeded, $FAILED failed"
  exit $((FAILED > 0 ? 1 : 0))
fi

# ── REST fallback (often 404 on Supabase) ────────────────────
if [[ -z "${SUPABASE_URL:-}" ]] || [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "ERROR: Set DATABASE_URL (recommended) or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY" >&2
  echo "" >&2
  echo "Get DATABASE_URL: Supabase Dashboard → Settings → Database → Connection string (URI)" >&2
  exit 1
fi

SUPABASE_URL="${SUPABASE_URL%/}"
echo "Running migrations against: $SUPABASE_URL (REST)"
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
  echo "TIP: Use psql instead. Add to .env:"
  echo "     DATABASE_URL=postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres"
  echo "     Get from: Supabase Dashboard → Settings → Database → Connection string (URI)"
  exit 1
fi
