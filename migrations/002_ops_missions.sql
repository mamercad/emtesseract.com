-- 002: Missions — approved proposals become executable missions
CREATE TABLE IF NOT EXISTS ops_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID REFERENCES ops_mission_proposals (id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved'
    CHECK (status IN ('approved', 'running', 'succeeded', 'failed')),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_missions_status ON ops_missions (status);
CREATE INDEX IF NOT EXISTS idx_missions_created_by ON ops_missions (created_by);
CREATE INDEX IF NOT EXISTS idx_missions_created_at ON ops_missions (created_at);
