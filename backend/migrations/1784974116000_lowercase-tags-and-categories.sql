-- Up Migration

-- Tags: merge case-variant duplicates (e.g. "Vegan" / "vegan") into one lowercase row.
CREATE TEMP TABLE tag_canonical AS
SELECT lower(name) AS lname, MIN(id) AS canonical_id
FROM tags
GROUP BY lower(name);

CREATE TEMP TABLE tag_dupe_map AS
SELECT t.id AS dupe_id, c.canonical_id
FROM tags t
JOIN tag_canonical c ON lower(t.name) = c.lname
WHERE t.id != c.canonical_id;

UPDATE recipe_tags rt
SET tag_id = m.canonical_id
FROM tag_dupe_map m
WHERE rt.tag_id = m.dupe_id
  AND NOT EXISTS (
    SELECT 1 FROM recipe_tags rt2
    WHERE rt2.recipe_id = rt.recipe_id AND rt2.tag_id = m.canonical_id
  );

DELETE FROM recipe_tags rt
USING tag_dupe_map m
WHERE rt.tag_id = m.dupe_id;

DELETE FROM tags t
USING tag_dupe_map m
WHERE t.id = m.dupe_id;

UPDATE tags SET name = lower(name) WHERE name <> lower(name);

ALTER TABLE tags ADD CONSTRAINT tags_name_lowercase CHECK (name = lower(name));

DROP TABLE tag_dupe_map;
DROP TABLE tag_canonical;

-- Categories: same merge, keyed off recipes.category_id instead of a join table.
CREATE TEMP TABLE category_canonical AS
SELECT lower(name) AS lname, MIN(id) AS canonical_id
FROM categories
GROUP BY lower(name);

CREATE TEMP TABLE category_dupe_map AS
SELECT c.id AS dupe_id, cc.canonical_id
FROM categories c
JOIN category_canonical cc ON lower(c.name) = cc.lname
WHERE c.id != cc.canonical_id;

UPDATE recipes r
SET category_id = m.canonical_id
FROM category_dupe_map m
WHERE r.category_id = m.dupe_id;

DELETE FROM categories c
USING category_dupe_map m
WHERE c.id = m.dupe_id;

UPDATE categories SET name = lower(name) WHERE name <> lower(name);

ALTER TABLE categories ADD CONSTRAINT categories_name_lowercase CHECK (name = lower(name));

DROP TABLE category_dupe_map;
DROP TABLE category_canonical;

-- Down Migration

-- Only the constraint additions above are reversible. The duplicate-row merge
-- is not: once case-variant tags/categories are merged into one canonical
-- (lowercase) row, the original separate rows and their ids are gone. This
-- down migration removes the constraints; it does not (and cannot) restore
-- the pre-merge duplicates.
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_name_lowercase;
ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_name_lowercase;
