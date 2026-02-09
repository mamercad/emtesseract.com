-- Seed a bootstrap roundtable (idempotent)
-- Inserts one watercooler if queue is empty so roundtable worker has work immediately.
-- See docs/ROUNDTABLE_AND_MEMORY.md
INSERT INTO ops_roundtable_queue (format, topic, participants, status)
SELECT
  'watercooler',
  'quick sync',
  ARRAY['observer', 'writer'],
  'pending'
WHERE NOT EXISTS (SELECT 1 FROM ops_roundtable_queue WHERE status IN ('pending', 'running'));
