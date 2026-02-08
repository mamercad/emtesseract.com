-- 006: Action runs — audit log for heartbeat and worker executions
CREATE TABLE IF NOT EXISTS ops_action_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'failed')),
  result JSONB DEFAULT '{}',
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_action_runs_action ON ops_action_runs (action);
CREATE INDEX IF NOT EXISTS idx_action_runs_created_at ON ops_action_runs (created_at);
