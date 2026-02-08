-- 008: Tweet metrics — performance data for outcome learning
CREATE TABLE IF NOT EXISTS ops_tweet_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id TEXT,
  tweet_id TEXT,
  agent_id TEXT NOT NULL,
  engagement_rate NUMERIC(5,4) DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  retweets INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,
  content TEXT,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tweet_metrics_agent_id ON ops_tweet_metrics (agent_id);
CREATE INDEX IF NOT EXISTS idx_tweet_metrics_posted_at ON ops_tweet_metrics (posted_at);
CREATE INDEX IF NOT EXISTS idx_tweet_metrics_engagement ON ops_tweet_metrics (engagement_rate);
