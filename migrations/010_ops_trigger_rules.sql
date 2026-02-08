-- 010: Trigger rules — conditions that create proposals automatically
CREATE TABLE IF NOT EXISTS ops_trigger_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  conditions JSONB NOT NULL DEFAULT '{}',
  action_config JSONB NOT NULL DEFAULT '{}',
  cooldown_minutes INTEGER NOT NULL DEFAULT 60,
  enabled BOOLEAN NOT NULL DEFAULT true,
  fire_count INTEGER NOT NULL DEFAULT 0,
  last_fired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trigger_rules_event ON ops_trigger_rules (trigger_event);
CREATE INDEX IF NOT EXISTS idx_trigger_rules_enabled ON ops_trigger_rules (enabled);
