# Seed Triggers — Why They Matter

The system has two ways proposals get created:

1. **Manual** — You click "Give task" in Stage
2. **Automatic** — Trigger rules fire on the heartbeat

Without any trigger rules, the system is **passive**. It only does work when you manually give tasks. Proposals never appear on their own.

## The Bootstrap Trigger

The **Proactive analyze** (observer + `ops_health`) trigger is special: it's the **bootstrap** that makes the system self-starting.

| Field | Value |
|-------|-------|
| Target agent | `observer` |
| Step kind | `analyze` |
| Topic | `ops_health` |

When the heartbeat runs, it evaluates this rule. If the cooldown has passed and the random skip doesn't fire (~12% chance), it creates a proposal for the observer to analyze "ops health." That proposal goes through the normal gates (auto-approve, etc.) and becomes a mission. The step worker picks it up and runs it.

**Result:** The system generates work on its own, without you clicking anything.

`ops_health` is simply the topic string passed to the LLM prompt—"analyze how the ops system is doing." There's no special code for it; it's a semantic label the analyst interprets.

## Seeding

Run `npm run seed` (or `make seed`) after migrations. The seed script inserts:

- Agents (from `seed-agents.sql`)
- Trigger rules (from `seed-trigger.sql`), including the bootstrap observer trigger

All inserts are idempotent (`WHERE NOT EXISTS`). Safe to run multiple times.

**Deploy:** `make deploy` runs migrate → seed → install, so a fresh deploy gets the bootstrap trigger automatically.
