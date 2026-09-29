-- CreateTable
CREATE TABLE "recipe_versions" (
    "id" SERIAL NOT NULL,
    "recipe_id" INTEGER NOT NULL,
    "saved_at" TIMESTAMPTZ NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_recipe_versions_recipe_id_saved_at" ON "recipe_versions"("recipe_id", "saved_at");

-- AddForeignKey
ALTER TABLE "recipe_versions" ADD CONSTRAINT "recipe_versions_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
