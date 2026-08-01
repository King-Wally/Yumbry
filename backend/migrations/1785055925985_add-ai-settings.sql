-- Up Migration

CREATE TABLE IF NOT EXISTS ai_settings (
  id         SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  base_url   TEXT NOT NULL,
  model      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Down Migration

DROP TABLE IF EXISTS ai_settings;
