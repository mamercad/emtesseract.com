# emTesseract Ops — Setup Guide

Step-by-step to get the multi-agent system running.

---

## Local hosting on Boomer (recommended)

Run everything on Boomer—no Supabase, no cloud. See **[docs/LOCAL_POSTGRES.md](docs/LOCAL_POSTGRES.md)** for full instructions.

Quick start:

```bash
# 1. Install Postgres, create DB
sudo apt install postgresql postgresql-client
sudo -u postgres createuser -s emtesseract
sudo -u postgres createdb -O emtesseract emtesseract_ops

# 2. .env
DATABASE_URL=postgresql://emtesseract@localhost:5432/emtesseract_ops
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3-coder-next-32k

# 3. Migrate, seed, run
npm run migrate
psql "$DATABASE_URL" -c "INSERT INTO ops_trigger_rules (name, trigger_event, action_config, cooldown_minutes, enabled) VALUES ('Proactive analyze', 'proactive_analyze_ops', '{\"target_agent\": \"observer\", \"steps\": [{\"kind\": \"analyze\", \"payload\": {\"topic\": \"ops_health\"}}]}'::jsonb, 5, true);"
cd workers && npm install && npm run heartbeat &
cd workers && npm run worker &
npm run api
# Stage at http://localhost:8788/stage/
```

---

## Supabase (cloud) — alternative

If you prefer cloud Postgres:

### 1. Environment variables (`.env`)

```bash
cp .env.example .env
```

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DATABASE_URL=postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres

# Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
```

**Note:** Supabase direct connection uses IPv6 and may fail on some networks. Prefer the pooler URI. If password has `@` or `!`, URL-encode: `@` → `%40`, `!` → `%21`.

### 2. Run migrations

```bash
./migrations/migrate.sh
```

### 3. Seed trigger rules

```sql
INSERT INTO ops_trigger_rules (name, trigger_event, action_config, cooldown_minutes, enabled)
VALUES (
  'Proactive analyze',
  'proactive_analyze_ops',
  '{"target_agent": "observer", "steps": [{"kind": "analyze", "payload": {"topic": "ops_health"}}]}'::jsonb,
  5,
  true
);
```

Run in Supabase SQL Editor or `psql "$DATABASE_URL" -c "..."`.

### 4. Stage (Supabase mode)

With Supabase, Stage uses the Supabase client. You would need to restore the Supabase-specific Stage code and config. **Local hosting uses the API server instead**—see docs/LOCAL_POSTGRES.md.

---

## Quick checklist (local)

| Step | Command / action |
|------|------------------|
| .env | DATABASE_URL, OLLAMA_BASE_URL, OLLAMA_MODEL |
| Migrations | `npm run migrate` |
| Seed | Insert trigger rule via psql |
| Ollama | On Boomer: `ollama serve`, `ollama pull <model>` |
| Heartbeat | `cd workers && npm run heartbeat` |
| Step worker | `cd workers && npm run worker` (on Boomer) |
| Stage API | `npm run api` → http://localhost:8788/stage/ |

---

## Troubleshooting

- **Heartbeat fails:** Check `.env` is loaded (workers read from project root).
- **No proposals:** Ensure `ops_trigger_rules` has at least one row with `enabled = true`.
- **Stage empty:** Ensure API server is running; set `apiUrl` in `stage/config.js`.
- **Steps never run:** Step worker must be running; Ollama must be reachable at `OLLAMA_BASE_URL`.
- **Ollama connection refused:** Ensure `ollama serve` on Boomer; if worker is remote, use `http://boomer:11434` or Boomer's IP.
- **Network unreachable (Supabase):** Supabase direct connection uses IPv6. Pivot to local Postgres—see docs/LOCAL_POSTGRES.md.
