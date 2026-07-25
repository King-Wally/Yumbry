-- Up Migration

CREATE TABLE categories (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

ALTER TABLE recipes ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;
CREATE INDEX idx_recipes_category_id ON recipes(category_id);

-- Down Migration

DROP INDEX IF EXISTS idx_recipes_category_id;
ALTER TABLE recipes DROP COLUMN IF EXISTS category_id;
DROP TABLE IF EXISTS categories;
