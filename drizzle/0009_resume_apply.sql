-- Structured resume per profile, tailored resumes per application, apply timeline/proofs, auto-apply settings,
-- multiple mail connections.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS resume_data jsonb;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS resume_file bytea;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS resume_mime text;
CREATE TABLE IF NOT EXISTS tailored_resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  application_id uuid REFERENCES applications(id) ON DELETE CASCADE,
  data jsonb NOT NULL,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  keywords text[] NOT NULL DEFAULT '{}',
  match_score integer,
  engine text NOT NULL DEFAULT 'rules',
  pdf bytea,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tailored_resumes_application_idx ON tailored_resumes (application_id, created_at DESC);
ALTER TABLE applications ADD COLUMN IF NOT EXISTS events jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS answers jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS missing text[] NOT NULL DEFAULT '{}';
ALTER TABLE applications ADD COLUMN IF NOT EXISTS proof_png bytea;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS job_snapshot jsonb;
ALTER TABLE owner_settings ADD COLUMN IF NOT EXISTS auto_apply boolean NOT NULL DEFAULT false;
ALTER TABLE owner_settings ADD COLUMN IF NOT EXISTS daily_limit integer NOT NULL DEFAULT 50;
ALTER TABLE owner_settings ADD COLUMN IF NOT EXISTS batch_size integer NOT NULL DEFAULT 20;
ALTER TABLE owner_settings ADD COLUMN IF NOT EXISTS seven_days_only boolean NOT NULL DEFAULT true;
ALTER TABLE owner_settings ADD COLUMN IF NOT EXISTS skip_w2_only boolean NOT NULL DEFAULT true;
ALTER TABLE owner_settings ADD COLUMN IF NOT EXISTS notify_email boolean NOT NULL DEFAULT true;
ALTER TABLE mail_connections ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;
ALTER TABLE mail_connections ADD COLUMN IF NOT EXISTS codes_read integer NOT NULL DEFAULT 0;
ALTER TABLE mail_connections ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE IF NOT EXISTS ai_messages (
  id serial PRIMARY KEY,
  profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_messages_profile_idx ON ai_messages (profile_id, id DESC);
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'applying';
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'needs_info';
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'failed';
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'withdrawn';
-- Full job descriptions are fetched on demand (the feed stores only a 500-char excerpt) and cached here.
CREATE TABLE IF NOT EXISTS job_details (
  job_id uuid PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  description text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
-- "N new since last visit" on the Jobs page.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS feed_seen_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS feed_prev_seen_at timestamptz;
CREATE INDEX IF NOT EXISTS applications_status_idx ON applications (status, updated_at);
-- Multiple inboxes: ids become gmail:<email> / imap:<user>.
UPDATE mail_connections m SET id = 'gmail:' || lower(m.email)
  WHERE m.id = 'gmail' AND m.email IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mail_connections x WHERE x.id = 'gmail:' || lower(m.email));
UPDATE mail_connections m SET id = 'imap:' || lower(m.imap_user)
  WHERE m.id = 'imap' AND m.imap_user IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mail_connections x WHERE x.id = 'imap:' || lower(m.imap_user));
