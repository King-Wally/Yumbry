-- Up Migration

CREATE TABLE IF NOT EXISTS ai_settings (
  id         SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  base_url   TEXT NOT NULL,
  model      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Single row this table will ever have. ON CONFLICT DO NOTHING so this stays
-- safe if the migration is somehow re-applied, and so it never clobbers a
-- base_url/model the user has already set via the Settings page.
INSERT INTO ai_settings (id, base_url, model)
VALUES (1, 'http://localhost:11434', NULL)
ON CONFLICT (id) DO NOTHING;

-- Down Migration

DROP TABLE IF EXISTS ai_settings;
