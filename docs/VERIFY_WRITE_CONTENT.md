# Verifying write_content and Proactive Content Draft

## Prerequisites

1. **Seed data** — writer agent and trigger must exist:
   ```bash
   npm run seed
   ```

2. **Ollama running** — on Boomer, step worker needs Ollama for LLM calls:
   ```bash
   systemctl status ollama   # or: ollama serve
   ```

3. **Services running** — heartbeat, worker, API:
   ```bash
   make status
   ```

---

## Flow

1. **Heartbeat** (every ~15s) evaluates triggers. Proactive triggers have ~12% random skip.
2. **Proactive content draft** trigger fires (10-min cooldown) → creates proposal with `write_content` step for writer, topic "weekly game dev update".
3. **Proposal service** auto-approves (write_content is in `auto_approve.allowed_step_kinds`) → creates mission + step.
4. **Step worker** picks up pending `write_content` step → calls Ollama → emits event.

---

## Verification Steps

### 1. Confirm writer and trigger exist

```bash
psql "$DATABASE_URL" -c "
  SELECT id, display_name FROM ops_agents WHERE id = 'writer';
  SELECT name, trigger_event, cooldown_minutes, fire_count, last_fired_at
    FROM ops_trigger_rules WHERE trigger_event = 'proactive_draft_content';
"
```

### 2. Wait for trigger to fire (or speed it up)

- Proactive triggers have ~12% random skip and 10-min cooldown.
- Watch heartbeat logs: `journalctl -u emtesseract-heartbeat -f` — look for `"fired": 1` in the triggers output.
- Or reset cooldown to force sooner:
  ```bash
  psql "$DATABASE_URL" -c "
    UPDATE ops_trigger_rules
    SET last_fired_at = NULL
    WHERE trigger_event = 'proactive_draft_content';
  "
  ```

### 3. Check for proposals and missions

```bash
psql "$DATABASE_URL" -c "
  SELECT id, agent_id, title, status, proposed_steps
    FROM ops_mission_proposals
   WHERE title LIKE '%Proactive content%' OR title LIKE '%trigger%'
   ORDER BY created_at DESC LIMIT 5;
"
```

```bash
psql "$DATABASE_URL" -c "
  SELECT m.id, m.title, m.status, s.kind, s.status AS step_status
    FROM ops_missions m
    JOIN ops_mission_steps s ON s.mission_id = m.id
   WHERE s.kind = 'write_content'
   ORDER BY m.created_at DESC LIMIT 5;
"
```

### 4. Check step worker logs

```bash
journalctl -u emtesseract-worker -n 50 --no-pager
```

Look for `write_content` steps being picked up and completed.

### 5. Check agent events

```bash
psql "$DATABASE_URL" -c "
  SELECT id, agent_id, kind, title, LEFT(summary, 80) AS summary
    FROM ops_agent_events
   WHERE kind = 'write_content_complete'
   ORDER BY created_at DESC LIMIT 5;
"
```

### 6. Quick manual test (bypass trigger)

Create a mission with a write_content step directly:

```bash
psql "$DATABASE_URL" -c "
  INSERT INTO ops_missions (title, status, created_by)
  VALUES ('[manual test] write_content', 'approved', 'writer')
  RETURNING id;
"
# Use the returned id, e.g. 123:
psql "$DATABASE_URL" -c "
  INSERT INTO ops_mission_steps (mission_id, kind, payload)
  VALUES (123, 'write_content', '{\"topic\": \"quick verification test\"}');
"
```

Then watch step worker logs: `journalctl -u emtesseract-worker -f`. Within ~15s it should pick up the step, call Ollama, and complete it.
