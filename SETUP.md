# emTesseract Ops — Setup Guide

Step-by-step to get the multi-agent system running.

---

## Local hosting on Boomer (recommended)

Run everything on Boomer—no Supabase, no cloud. See **[docs/LOCAL_POSTGRES.md](docs/LOCAL_POSTGRES.md)** for full instructions.

Quick start:

```bash
# 1. Install Postgres, create DB
npm run setup-postgres

# 2. .env
DATABASE_URL=postgresql://emtesseract@localhost:5432/emtesseract_ops
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3-coder-next-32k

# 3. Migrate, seed, run
npm run migrate
npm run seed
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
| Seed | `npm run seed` (agents + trigger rules; see [docs/SEED_TRIGGERS.md](docs/SEED_TRIGGERS.md)) |
| Ollama | On Boomer: `ollama serve`, `ollama pull <model>` |
| Heartbeat | `cd workers && npm run heartbeat` |
| Step worker | `cd workers && npm run worker` (analyze) |
| Content worker | `cd workers && npm run content` (write_content) |
| Crawl worker | `cd workers && npm run crawl` |
| Roundtable worker | `cd workers && npm run roundtable` (on Boomer) |
| Stage API | `npm run api` → http://localhost:8788/stage/ |

---

## Deploy (Boomer)

`make deploy` runs: deps → migrate → **seed** → install. The seed step ensures the bootstrap observer trigger exists so the system can self-start. See [docs/SEED_TRIGGERS.md](docs/SEED_TRIGGERS.md).

## Troubleshooting

- **Heartbeat fails:** Check `.env` is loaded (workers read from project root).
- **No proposals:** Run `npm run seed` to ensure `ops_trigger_rules` has the bootstrap observer trigger.
- **Stage empty:** Ensure API server is running; set `apiUrl` in `stage/config.js`. See [docs/STAGE_UI.md](docs/STAGE_UI.md).
- **Chat 404:** Chat requires the API server (same as Stage). See [docs/CHAT.md](docs/CHAT.md).
- **Steps never run:** Step worker must be running; Ollama must be reachable at `OLLAMA_BASE_URL`.
- **Ollama connection refused:** Ensure `ollama serve` on Boomer; if worker is remote, use `http://boomer:11434` or Boomer's IP.
- **Network unreachable (Supabase):** Supabase direct connection uses IPv6. Pivot to local Postgres—see docs/LOCAL_POSTGRES.md.
