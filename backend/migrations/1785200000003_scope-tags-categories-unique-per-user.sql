-- Up Migration
ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_name_key;
ALTER TABLE tags ADD CONSTRAINT tags_user_id_name_key UNIQUE (user_id, name);

ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_name_key;
ALTER TABLE categories ADD CONSTRAINT categories_user_id_name_key UNIQUE (user_id, name);

-- Down Migration

ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_user_id_name_key;
ALTER TABLE categories ADD CONSTRAINT categories_name_key UNIQUE (name);

ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_user_id_name_key;
ALTER TABLE tags ADD CONSTRAINT tags_name_key UNIQUE (name);
