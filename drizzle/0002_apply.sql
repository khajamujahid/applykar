CREATE TABLE IF NOT EXISTS bulk_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  requested integer NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS bulk_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES bulk_runs(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  title text NOT NULL,
  apply_url text NOT NULL,
  source text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  detail text,
  proof_note text,
  missing_questions text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mail_connections (
  id text PRIMARY KEY,
  provider text NOT NULL,
  email text,
  refresh_token text,
  access_token text,
  expires_at timestamptz,
  imap_host text,
  imap_port integer,
  imap_user text,
  imap_password text,
  imap_tls boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
