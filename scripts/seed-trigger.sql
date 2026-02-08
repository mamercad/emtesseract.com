-- Seed default trigger rules (idempotent)
-- The "Proactive analyze" rule is the bootstrap: without it, the system only works when you manually give tasks.
-- See docs/SEED_TRIGGERS.md
INSERT INTO ops_trigger_rules (name, trigger_event, action_config, cooldown_minutes, enabled)
SELECT
  'Proactive analyze',
  'proactive_analyze_ops',
  '{"target_agent": "observer", "steps": [{"kind": "analyze", "payload": {"topic": "ops_health"}}]}'::jsonb,
  5,
  true
WHERE NOT EXISTS (SELECT 1 FROM ops_trigger_rules WHERE name = 'Proactive analyze');

INSERT INTO ops_trigger_rules (name, trigger_event, action_config, cooldown_minutes, enabled)
SELECT
  'Proactive content draft',
  'proactive_draft_content',
  '{"target_agent": "writer", "steps": [{"kind": "write_content", "payload": {"topic": "weekly game dev update"}}]}'::jsonb,
  10,
  true
WHERE NOT EXISTS (SELECT 1 FROM ops_trigger_rules WHERE name = 'Proactive content draft');
