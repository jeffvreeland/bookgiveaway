CREATE TABLE IF NOT EXISTS contest_entries (
  id          SERIAL PRIMARY KEY,
  name        TEXT        NOT NULL,
  email       TEXT        NOT NULL,
  mobile      TEXT        NOT NULL,
  ip_address  TEXT,
  is_winner   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS contest_entries_email_idx
  ON contest_entries (LOWER(email));
