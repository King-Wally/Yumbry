-- Up Migration

-- This migration must stay IF NOT EXISTS-idempotent forever: it's the migration
-- that reconciles pre-existing production volumes (which already have these
-- tables from the old schema.sql bind-mount, but no pgmigrations bookkeeping)
-- as well as brand-new empty volumes. Later migrations don't need this guard.

CREATE TABLE IF NOT EXISTS recipes (
  id                 INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title              TEXT NOT NULL,
  description        TEXT,
  image_path         TEXT,
  prep_time_minutes  INTEGER,
  cook_time_minutes  INTEGER,
  total_time_minutes INTEGER,
  servings           NUMERIC NOT NULL DEFAULT 1,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingredients (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recipe_id   INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  raw_text    TEXT NOT NULL,
  amount      NUMERIC,
  unit        TEXT,
  name        TEXT NOT NULL,
  is_scalable BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ingredients_recipe_id ON ingredients(recipe_id);

CREATE TABLE IF NOT EXISTS instructions (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recipe_id   INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  text        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_instructions_recipe_id ON instructions(recipe_id);

CREATE TABLE IF NOT EXISTS tags (
  id   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS recipe_tags (
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  tag_id    INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (recipe_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_recipe_tags_tag_id ON recipe_tags(tag_id);

-- Down Migration

DROP TABLE IF EXISTS recipe_tags, tags, instructions, ingredients, recipes CASCADE;
