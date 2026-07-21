DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM recipe_tags);
