ALTER TABLE profiles ADD COLUMN IF NOT EXISTS application_email text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_application_email_idx ON profiles (application_email) WHERE application_email IS NOT NULL;

CREATE TABLE IF NOT EXISTS inbox_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  application_id uuid REFERENCES applications(id) ON DELETE SET NULL,
  recipient text NOT NULL,
  sender text NOT NULL,
  subject text NOT NULL DEFAULT '',
  text_body text NOT NULL DEFAULT '',
  message_id text,
  ats text NOT NULL DEFAULT 'unknown',
  kind text NOT NULL DEFAULT 'other',
  employer text,
  verification_code text,
  verify_url text,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS inbox_messages_message_id_idx ON inbox_messages (message_id);
CREATE INDEX IF NOT EXISTS inbox_messages_profile_idx ON inbox_messages (profile_id, received_at);
