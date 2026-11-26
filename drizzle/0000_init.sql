CREATE EXTENSION IF NOT EXISTS vector;

DO $$ BEGIN
  CREATE TYPE job_source AS ENUM ('greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workable', 'adzuna', 'usajobs', 'jsearch');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE workplace AS ENUM ('remote', 'hybrid', 'onsite', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE seniority AS ENUM ('intern', 'junior', 'mid', 'senior', 'staff', 'principal', 'director', 'vp', 'cxo', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE us_scope AS ENUM ('us', 'non_us', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE salary_interval AS ENUM ('year', 'hour');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE application_status AS ENUM ('queued', 'ready_for_review', 'applied', 'interview', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  source job_source NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  careers_url text,
  api_url text,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS companies_source_slug_idx ON companies (source, slug);

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source job_source NOT NULL,
  external_id text NOT NULL,
  title text NOT NULL,
  company_name text NOT NULL,
  description_text text NOT NULL DEFAULT '',
  location_raw text,
  city text,
  region text,
  country text,
  workplace workplace NOT NULL DEFAULT 'unknown',
  seniority seniority NOT NULL DEFAULT 'unknown',
  us_scope us_scope NOT NULL DEFAULT 'unknown',
  yoe_min integer,
  salary_min integer,
  salary_max integer,
  salary_currency text,
  salary_interval salary_interval,
  w2_only boolean NOT NULL DEFAULT false,
  c2c_friendly boolean NOT NULL DEFAULT false,
  no_sponsorship boolean NOT NULL DEFAULT false,
  skill_tags text[] NOT NULL DEFAULT '{}',
  apply_url text NOT NULL,
  source_url text,
  posted_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  stale_at timestamptz,
  content_hash text NOT NULL,
  dedupe_key text NOT NULL,
  duplicate_of uuid REFERENCES jobs(id) ON DELETE SET NULL,
  embedding vector(1536),
  raw jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS jobs_source_external_idx ON jobs (source, external_id);
CREATE INDEX IF NOT EXISTS jobs_dedupe_idx ON jobs (dedupe_key);
CREATE INDEX IF NOT EXISTS jobs_feed_idx ON jobs (stale_at, posted_at);
CREATE INDEX IF NOT EXISTS jobs_company_idx ON jobs (company_id);
CREATE INDEX IF NOT EXISTS jobs_embedding_idx ON jobs USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  headline text,
  skills text[] NOT NULL DEFAULT '{}',
  target_titles text[] NOT NULL DEFAULT '{}',
  locations text[] NOT NULL DEFAULT '{}',
  interests text[] NOT NULL DEFAULT '{}',
  seniority_filters text[] NOT NULL DEFAULT '{}',
  years_experience integer,
  yoe_max integer,
  visa_status text NOT NULL,
  needs_sponsorship boolean NOT NULL DEFAULT false,
  open_to_relocate boolean NOT NULL DEFAULT true,
  salary_min integer NOT NULL DEFAULT 95000,
  salary_max integer NOT NULL DEFAULT 120000,
  c2c_min_hourly integer NOT NULL DEFAULT 65,
  available_immediately boolean NOT NULL DEFAULT true,
  usa_only boolean NOT NULL DEFAULT true,
  prefers_c2c boolean NOT NULL DEFAULT true,
  skip_w2_only boolean NOT NULL DEFAULT true,
  include_leadership boolean NOT NULL DEFAULT false,
  resume_filename text,
  resume_text text NOT NULL DEFAULT '',
  onboarding_complete boolean NOT NULL DEFAULT false,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS owner_settings (
  id text PRIMARY KEY DEFAULT 'owner',
  email text,
  active_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS standard_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  key text NOT NULL,
  question text NOT NULL,
  answer text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS standard_answers_profile_key_idx ON standard_answers (profile_id, key);

CREATE TABLE IF NOT EXISTS job_states (
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  saved boolean NOT NULL DEFAULT false,
  hidden boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, job_id)
);

CREATE TABLE IF NOT EXISTS applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status application_status NOT NULL DEFAULT 'queued',
  proof_note text,
  proof_url text,
  answer_packet text,
  why_this_role text,
  notes text,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS applications_profile_job_idx ON applications (profile_id, job_id);

CREATE TABLE IF NOT EXISTS ingest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text,
  company_id uuid,
  status text NOT NULL,
  added integer NOT NULL DEFAULT 0,
  updated integer NOT NULL DEFAULT 0,
  staled integer NOT NULL DEFAULT 0,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
