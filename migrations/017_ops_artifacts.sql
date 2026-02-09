-- 017: Shared artifacts (markdown documents) — operator and agents collaborate
CREATE TABLE IF NOT EXISTS ops_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  mission_id UUID REFERENCES ops_missions(id),
  step_id UUID REFERENCES ops_mission_steps(id),
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_artifacts_mission ON ops_artifacts (mission_id);
CREATE INDEX IF NOT EXISTS idx_ops_artifacts_updated ON ops_artifacts (updated_at DESC);
