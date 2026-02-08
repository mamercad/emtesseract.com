-- 013: Agent relationships — dynamic affinity between agent pairs
CREATE TABLE IF NOT EXISTS ops_agent_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_a TEXT NOT NULL,
  agent_b TEXT NOT NULL,
  affinity NUMERIC(3,2) NOT NULL DEFAULT 0.50,
  total_interactions INTEGER DEFAULT 0,
  positive_interactions INTEGER DEFAULT 0,
  negative_interactions INTEGER DEFAULT 0,
  drift_log JSONB DEFAULT '[]',
  UNIQUE (agent_a, agent_b),
  CHECK (agent_a < agent_b)
);

-- Seed initial relationships for the 3-agent setup
INSERT INTO ops_agent_relationships (agent_a, agent_b, affinity) VALUES
  ('coordinator', 'executor', 0.65),
  ('coordinator', 'observer', 0.70),
  ('executor',    'observer', 0.55)
ON CONFLICT (agent_a, agent_b) DO NOTHING;
