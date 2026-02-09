-- 021: Bluesky scan (read) — fetch feed/mentions, store in ops_artifacts
INSERT INTO ops_policy (key, value) VALUES
  ('scan_bluesky_policy', '{"enabled": true, "max_scans_per_day": 10}')
ON CONFLICT (key) DO NOTHING;

-- Add scan_bluesky to auto_approve
UPDATE ops_policy SET value = jsonb_set(
  value,
  '{allowed_step_kinds}',
  (value->'allowed_step_kinds') || '"scan_bluesky"'::jsonb
)
WHERE key = 'auto_approve'
  AND NOT ((value->'allowed_step_kinds') @> '["scan_bluesky"]'::jsonb);
