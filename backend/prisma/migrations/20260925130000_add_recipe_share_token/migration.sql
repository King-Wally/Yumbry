-- AlterTable
ALTER TABLE "recipes" ADD COLUMN     "share_token" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "recipes_share_token_key" ON "recipes"("share_token");
