-- 018: Crawl policy (optional gate; disabled by default = no limit)
INSERT INTO ops_policy (key, value) VALUES
  ('crawl_policy', '{"enabled": false, "max_crawls_per_day": 20}')
ON CONFLICT (key) DO NOTHING;
