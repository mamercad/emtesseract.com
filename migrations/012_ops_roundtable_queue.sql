-- 012: Roundtable queue — scheduled and pending conversations
CREATE TABLE IF NOT EXISTS ops_roundtable_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  format TEXT NOT NULL,
  topic TEXT,
  participants TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  history JSONB DEFAULT '[]',
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roundtable_status ON ops_roundtable_queue (status);
CREATE INDEX IF NOT EXISTS idx_roundtable_scheduled ON ops_roundtable_queue (scheduled_at);
