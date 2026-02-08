-- 015: RLS policies for Stage dashboard (anon read)
-- Run after tables exist. Allows browser client with anon key to SELECT.

ALTER TABLE ops_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_agent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_mission_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Stage: anon read agents" ON ops_agents;
CREATE POLICY "Stage: anon read agents" ON ops_agents FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Stage: anon read events" ON ops_agent_events;
CREATE POLICY "Stage: anon read events" ON ops_agent_events FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Stage: anon read missions" ON ops_missions;
CREATE POLICY "Stage: anon read missions" ON ops_missions FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Stage: anon read steps" ON ops_mission_steps;
CREATE POLICY "Stage: anon read steps" ON ops_mission_steps FOR SELECT TO anon USING (true);
