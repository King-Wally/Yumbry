-- AlterTable
ALTER TABLE "ai_settings" ALTER COLUMN "provider" DROP NOT NULL,
ALTER COLUMN "provider" DROP DEFAULT;
