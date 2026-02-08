-- Seed default trigger rule (idempotent)
INSERT INTO ops_trigger_rules (name, trigger_event, action_config, cooldown_minutes, enabled)
SELECT
  'Proactive analyze',
  'proactive_analyze_ops',
  '{"target_agent": "observer", "steps": [{"kind": "analyze", "payload": {"topic": "ops_health"}}]}'::jsonb,
  5,
  true
WHERE NOT EXISTS (SELECT 1 FROM ops_trigger_rules WHERE name = 'Proactive analyze');
