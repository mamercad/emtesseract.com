-- 007: Agent memory — structured knowledge distilled from experience
CREATE TABLE IF NOT EXISTS ops_agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  type TEXT NOT NULL
    CHECK (type IN ('insight', 'pattern', 'strategy', 'preference', 'lesson')),
  content TEXT NOT NULL,
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.60,
  tags TEXT[] DEFAULT '{}',
  source_trace_id TEXT,
  superseded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_source_trace ON ops_agent_memory (source_trace_id)
  WHERE source_trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memory_agent_id ON ops_agent_memory (agent_id);
CREATE INDEX IF NOT EXISTS idx_memory_type ON ops_agent_memory (type);
CREATE INDEX IF NOT EXISTS idx_memory_confidence ON ops_agent_memory (confidence);
CREATE INDEX IF NOT EXISTS idx_memory_tags ON ops_agent_memory USING GIN (tags);
