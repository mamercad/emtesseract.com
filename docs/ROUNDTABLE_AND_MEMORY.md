# Roundtable + Memory

Simple agent conversations and memory for emergent behavior.

## Roundtable

- **Queue:** `ops_roundtable_queue`
- **Worker:** `workers/roundtable-worker.mjs` (polls every 30s)
- **Formats:** watercooler (2–5 turns), standup, debate
- **Flow:** Heartbeat enqueues ~1 conversation per hour → worker runs turn-by-turn via Ollama → emits `roundtable_turn` events to feed

## Memory

- **Table:** `ops_agent_memory` (insight, pattern, strategy, preference, lesson)
- **Source:** Conversation distillation — after each roundtable, LLM extracts memories from the dialogue
- **Use:** Step worker injects agent memories into analyze/write_content prompts (last 5, confidence ≥ 0.6)

## Services

| Service | Role |
|---------|------|
| heartbeat | Enqueues roundtable, runs triggers |
| worker | Step execution (analyze) |
| content | Content drafting (write_content) |
| crawl | Web fetch + text extraction |
| roundtable | Conversation orchestration |
| api | Stage + API |

## Quick test (on Boomer)

```bash
# After make deploy, roundtable worker runs. Heartbeat enqueues ~1/hour.
# Or manually enqueue:
psql "$DATABASE_URL" -c "INSERT INTO ops_roundtable_queue (format, topic, participants, status) VALUES ('watercooler', 'quick sync', ARRAY['observer','writer'], 'pending');"

# Check events (should see roundtable_turn):
psql "$DATABASE_URL" -c "SELECT kind, agent_id, title FROM ops_agent_events ORDER BY created_at DESC LIMIT 5;"

# Check memories (after a conversation completes):
psql "$DATABASE_URL" -c "SELECT agent_id, type, content FROM ops_agent_memory ORDER BY created_at DESC LIMIT 5;"
```
