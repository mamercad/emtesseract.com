-- 003: Mission steps — concrete execution units within a mission
CREATE TABLE IF NOT EXISTS ops_mission_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES ops_missions (id),
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  payload JSONB NOT NULL DEFAULT '{}',
  result JSONB,
  reserved_by TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_steps_mission_id ON ops_mission_steps (mission_id);
CREATE INDEX IF NOT EXISTS idx_steps_status_kind ON ops_mission_steps (status, kind);
CREATE INDEX IF NOT EXISTS idx_steps_created_at ON ops_mission_steps (created_at);
