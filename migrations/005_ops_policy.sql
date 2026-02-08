-- 005: Policy table — runtime config as key-value JSON
CREATE TABLE IF NOT EXISTS ops_policy (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed core policies
INSERT INTO ops_policy (key, value) VALUES
  ('auto_approve',              '{"enabled": true, "allowed_step_kinds": ["draft_tweet", "crawl", "analyze", "write_content"]}'),
  ('x_daily_quota',             '{"limit": 5}'),
  ('content_policy',            '{"enabled": true, "max_drafts_per_day": 8}'),
  ('roundtable_policy',         '{"enabled": true, "max_daily_conversations": 5}'),
  ('memory_influence_policy',   '{"enabled": true, "probability": 0.3}'),
  ('relationship_drift_policy', '{"enabled": true, "max_drift": 0.03}'),
  ('initiative_policy',         '{"enabled": false}')
ON CONFLICT (key) DO NOTHING;
