-- 004: Agent events — the system-wide event stream
CREATE TABLE IF NOT EXISTS ops_agent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_agent_id ON ops_agent_events (agent_id);
CREATE INDEX IF NOT EXISTS idx_events_kind ON ops_agent_events (kind);
CREATE INDEX IF NOT EXISTS idx_events_tags ON ops_agent_events USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON ops_agent_events (created_at);
