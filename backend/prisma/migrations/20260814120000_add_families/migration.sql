-- Families: recipes, tags and categories move from per-user to per-family scoping.
-- Every existing user gets a personal family of one, so this is a pure 1:1 backfill
-- and no tag/category name merging can be needed here (that only happens at join time).

CREATE TABLE "families" (
    "id" SERIAL NOT NULL,
    "invite_token" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "families_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "families_invite_token_key" ON "families"("invite_token");

-- One family per existing user. INSERT ... RETURNING gives no join key back, so a
-- throwaway correlation column is the only reliable way to map new family ids to users.
-- gen_random_uuid() is built in on PG13+, so no pgcrypto extension is required; two
-- dash-stripped UUIDs give the same 64 hex chars the application generates at runtime.
ALTER TABLE "families" ADD COLUMN "seed_user_id" INTEGER;

INSERT INTO "families" ("seed_user_id", "invite_token")
SELECT "id",
       replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
  FROM "users";

-- users.family_id
ALTER TABLE "users" ADD COLUMN "family_id" INTEGER;

UPDATE "users" u
   SET "family_id" = f."id"
  FROM "families" f
 WHERE f."seed_user_id" = u."id";

ALTER TABLE "families" DROP COLUMN "seed_user_id";

ALTER TABLE "users" ALTER COLUMN "family_id" SET NOT NULL;
CREATE INDEX "idx_users_family_id" ON "users"("family_id");
ALTER TABLE "users" ADD CONSTRAINT "users_family_id_fkey"
    FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- recipes: gain family_id as the scope, and user_id is demoted to a nullable author.
ALTER TABLE "recipes" ADD COLUMN "family_id" INTEGER;

UPDATE "recipes" r
   SET "family_id" = u."family_id"
  FROM "users" u
 WHERE u."id" = r."user_id";

ALTER TABLE "recipes" ALTER COLUMN "family_id" SET NOT NULL;
CREATE INDEX "idx_recipes_family_id" ON "recipes"("family_id");
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_family_id_fkey"
    FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recipes" RENAME COLUMN "user_id" TO "author_id";
ALTER TABLE "recipes" ALTER COLUMN "author_id" DROP NOT NULL;
ALTER TABLE "recipes" DROP CONSTRAINT "recipes_user_id_fkey";
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER INDEX "idx_recipes_user_id" RENAME TO "idx_recipes_author_id";

-- tags: user_id -> family_id. DROP COLUMN implicitly drops the dependent FK,
-- idx_tags_user_id and the tags_user_id_name_key unique index.
ALTER TABLE "tags" ADD COLUMN "family_id" INTEGER;

UPDATE "tags" t
   SET "family_id" = u."family_id"
  FROM "users" u
 WHERE u."id" = t."user_id";

ALTER TABLE "tags" ALTER COLUMN "family_id" SET NOT NULL;
ALTER TABLE "tags" DROP COLUMN "user_id";
CREATE UNIQUE INDEX "tags_family_id_name_key" ON "tags"("family_id", "name");
CREATE INDEX "idx_tags_family_id" ON "tags"("family_id");
ALTER TABLE "tags" ADD CONSTRAINT "tags_family_id_fkey"
    FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- categories: identical treatment.
ALTER TABLE "categories" ADD COLUMN "family_id" INTEGER;

UPDATE "categories" c
   SET "family_id" = u."family_id"
  FROM "users" u
 WHERE u."id" = c."user_id";

ALTER TABLE "categories" ALTER COLUMN "family_id" SET NOT NULL;
ALTER TABLE "categories" DROP COLUMN "user_id";
CREATE UNIQUE INDEX "categories_family_id_name_key" ON "categories"("family_id", "name");
CREATE INDEX "idx_categories_family_id" ON "categories"("family_id");
ALTER TABLE "categories" ADD CONSTRAINT "categories_family_id_fkey"
    FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;
