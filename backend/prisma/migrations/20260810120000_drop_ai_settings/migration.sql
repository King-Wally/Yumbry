-- DropForeignKey
ALTER TABLE "ai_settings" DROP CONSTRAINT IF EXISTS "ai_settings_user_id_fkey";

-- DropTable
DROP TABLE "ai_settings";
