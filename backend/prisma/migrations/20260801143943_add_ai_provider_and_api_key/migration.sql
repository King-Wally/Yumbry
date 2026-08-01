-- AlterTable
ALTER TABLE "ai_settings" ADD COLUMN     "api_key_encrypted" TEXT,
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'ollama',
ALTER COLUMN "base_url" DROP NOT NULL;
