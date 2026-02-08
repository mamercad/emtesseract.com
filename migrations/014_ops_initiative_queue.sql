-- 014: Initiative queue — agent-proposed work items
CREATE TABLE IF NOT EXISTS ops_initiative_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  proposed_steps JSONB DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'submitted', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_initiative_agent ON ops_initiative_queue (agent_id);
CREATE INDEX IF NOT EXISTS idx_initiative_status ON ops_initiative_queue (status);
