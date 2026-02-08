-- 001: Mission proposals — agent requests for work
CREATE TABLE IF NOT EXISTS ops_mission_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected')),
  proposed_steps JSONB NOT NULL DEFAULT '[]',
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposals_agent_id ON ops_mission_proposals (agent_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON ops_mission_proposals (status);
CREATE INDEX IF NOT EXISTS idx_proposals_created_at ON ops_mission_proposals (created_at);
