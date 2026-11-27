-- Daily board discovery: candidate queue / reject memory, cursor state, run log.
CREATE TABLE IF NOT EXISTS board_discovery (
  source job_source NOT NULL,
  slug text NOT NULL,
  via text NOT NULL,
  status text NOT NULL DEFAULT 'candidate',
  jobs integer,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  checked_at timestamptz,
  PRIMARY KEY (source, slug)
);
CREATE INDEX IF NOT EXISTS board_discovery_status_idx ON board_discovery (status, checked_at);
CREATE TABLE IF NOT EXISTS discovery_state (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS discovery_runs (
  id serial PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  stats jsonb
);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS discovered_via text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS discovered_at timestamptz;
CREATE INDEX IF NOT EXISTS companies_source_lower_slug_idx ON companies (source, lower(slug));
-- Foreign-key lookups: without these every deleted job seq-scans jobs (duplicate_of ON DELETE SET NULL).
CREATE INDEX IF NOT EXISTS jobs_duplicate_of_idx ON jobs (duplicate_of) WHERE duplicate_of IS NOT NULL;
CREATE INDEX IF NOT EXISTS job_states_job_idx ON job_states (job_id);
CREATE INDEX IF NOT EXISTS applications_job_idx ON applications (job_id);
CREATE INDEX IF NOT EXISTS bulk_items_job_idx ON bulk_items (job_id);
