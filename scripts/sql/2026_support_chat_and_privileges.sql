-- QuidMotion: support staff privileges + live support chat
-- Run on Supabase/Postgres when DB_PROVIDER=supabase

CREATE TABLE IF NOT EXISTS support_privileges (
  user_id    TEXT PRIMARY KEY REFERENCES users(id),
  privileges TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS support_conversations (
  id               TEXT PRIMARY KEY,
  user_id          TEXT REFERENCES users(id),
  guest_name       TEXT,
  guest_email      TEXT,
  guest_token_hash TEXT,
  status           TEXT NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'pending', 'closed')),
  assigned_to      TEXT REFERENCES users(id),
  last_message_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_conv_status_last_idx
  ON support_conversations(status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS support_conv_user_idx
  ON support_conversations(user_id);
CREATE INDEX IF NOT EXISTS support_conv_guest_token_idx
  ON support_conversations(guest_token_hash);

CREATE TABLE IF NOT EXISTS support_messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES support_conversations(id),
  sender_id       TEXT REFERENCES users(id),
  sender_role     TEXT NOT NULL
                    CHECK (sender_role IN ('user', 'guest', 'support', 'admin', 'system')),
  body            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS support_msg_conv_created_idx
  ON support_messages(conversation_id, created_at);
