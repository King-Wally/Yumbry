-- Up Migration

DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM recipe_tags);

-- Down Migration

-- Deliberately irreversible: this is a one-time data cleanup with no schema
-- change, and the deleted orphaned tag rows (and their ids) cannot be
-- reconstructed. Nothing to undo.
