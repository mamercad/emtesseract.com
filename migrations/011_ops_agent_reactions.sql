-- 011: Agent reactions — queue for agent-to-agent responses
CREATE TABLE IF NOT EXISTS ops_agent_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_agent TEXT NOT NULL,
  target_agent TEXT NOT NULL,
  reaction_type TEXT NOT NULL,
  source_event_id UUID REFERENCES ops_agent_events (id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reactions_status ON ops_agent_reactions (status);
CREATE INDEX IF NOT EXISTS idx_reactions_target ON ops_agent_reactions (target_agent);
CREATE INDEX IF NOT EXISTS idx_reactions_created_at ON ops_agent_reactions (created_at);
