-- 020: Bluesky posts — track posts for quota and outcome learning
CREATE TABLE IF NOT EXISTS ops_bluesky_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id UUID,
  post_uri TEXT,
  post_cid TEXT,
  agent_id TEXT NOT NULL,
  content TEXT,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bluesky_posts_agent_id ON ops_bluesky_posts (agent_id);
CREATE INDEX IF NOT EXISTS idx_bluesky_posts_posted_at ON ops_bluesky_posts (posted_at);

-- Bluesky quota policy (similar to x_daily_quota)
INSERT INTO ops_policy (key, value) VALUES
  ('bluesky_daily_quota', '{"limit": 5}')
ON CONFLICT (key) DO NOTHING;

-- Add post_bluesky to auto_approve allowed_step_kinds
UPDATE ops_policy SET value = jsonb_set(
  value,
  '{allowed_step_kinds}',
  (value->'allowed_step_kinds') || '"post_bluesky"'::jsonb
)
WHERE key = 'auto_approve'
  AND NOT ((value->'allowed_step_kinds') @> '["post_bluesky"]'::jsonb);
