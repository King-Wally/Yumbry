-- CreateTable
CREATE TABLE "recipe_import_attempts" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error_kind" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_import_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_recipe_import_attempts_hostname" ON "recipe_import_attempts"("hostname");

-- CreateIndex
CREATE INDEX "idx_recipe_import_attempts_success" ON "recipe_import_attempts"("success");

-- CreateIndex
CREATE INDEX "idx_recipe_import_attempts_error_kind" ON "recipe_import_attempts"("error_kind");

-- CreateIndex
CREATE INDEX "idx_recipe_import_attempts_created_at" ON "recipe_import_attempts"("created_at");
