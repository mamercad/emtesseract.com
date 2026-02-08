-- 016: Chat sessions and messages — async chat with background LLM processing
CREATE TABLE IF NOT EXISTS ops_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_chat_sessions_agent ON ops_chat_sessions (agent_id);
CREATE INDEX IF NOT EXISTS idx_ops_chat_sessions_created ON ops_chat_sessions (created_at DESC);

CREATE TABLE IF NOT EXISTS ops_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES ops_chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'done' CHECK (status IN ('pending', 'done', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_chat_messages_session ON ops_chat_messages (session_id);
