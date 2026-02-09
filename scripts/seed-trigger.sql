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

INSERT INTO ops_trigger_rules (name, trigger_event, action_config, cooldown_minutes, enabled)
SELECT
  'Proactive crawl',
  'proactive_crawl',
  '{"target_agent": "observer", "steps": [{"kind": "crawl", "payload": {"url": "https://www.gamedeveloper.com/", "topic": "game dev news"}}]}'::jsonb,
  60,
  true
WHERE NOT EXISTS (SELECT 1 FROM ops_trigger_rules WHERE name = 'Proactive crawl');

-- Proactive Bluesky post (disabled by default; enable when BLUESKY_HANDLE + BLUESKY_APP_PASSWORD set)
INSERT INTO ops_trigger_rules (name, trigger_event, action_config, cooldown_minutes, enabled)
SELECT
  'Proactive Bluesky post',
  'proactive_post_bluesky',
  '{"target_agent": "writer", "steps": [{"kind": "post_bluesky", "payload": {"text": "emTesseract — family game dev. Building cool stuff. 🎮"}}]}'::jsonb,
  120,
  false
WHERE NOT EXISTS (SELECT 1 FROM ops_trigger_rules WHERE name = 'Proactive Bluesky post');

-- Proactive Bluesky scan (read feed + mentions; disabled by default)
INSERT INTO ops_trigger_rules (name, trigger_event, action_config, cooldown_minutes, enabled)
SELECT
  'Proactive Bluesky scan',
  'proactive_scan_bluesky',
  '{"target_agent": "observer", "steps": [{"kind": "scan_bluesky", "payload": {"mode": "both"}}]}'::jsonb,
  60,
  false
WHERE NOT EXISTS (SELECT 1 FROM ops_trigger_rules WHERE name = 'Proactive Bluesky scan');
