CREATE TABLE recipes (
  id                 INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title              TEXT NOT NULL,
  description        TEXT,
  image_path         TEXT,
  prep_time_minutes  INTEGER,
  cook_time_minutes  INTEGER,
  total_time_minutes INTEGER,
  servings           NUMERIC NOT NULL DEFAULT 1,
  source_url         TEXT,
  author             TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ingredients (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recipe_id   INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  raw_text    TEXT NOT NULL,
  amount      NUMERIC,
  unit        TEXT,
  name        TEXT NOT NULL,
  is_scalable BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL
);
CREATE INDEX idx_ingredients_recipe_id ON ingredients(recipe_id);

CREATE TABLE instructions (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recipe_id   INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  text        TEXT NOT NULL,
  image_path  TEXT
);
CREATE INDEX idx_instructions_recipe_id ON instructions(recipe_id);

CREATE TABLE tags (
  id   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE recipe_tags (
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  tag_id    INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (recipe_id, tag_id)
);
CREATE INDEX idx_recipe_tags_tag_id ON recipe_tags(tag_id);
