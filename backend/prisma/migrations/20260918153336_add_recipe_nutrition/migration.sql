-- AlterTable
ALTER TABLE "recipes" ADD COLUMN     "calories" DECIMAL(8,2),
ADD COLUMN     "carbohydrate_content" DECIMAL(8,2),
ADD COLUMN     "fat_content" DECIMAL(8,2),
ADD COLUMN     "protein_content" DECIMAL(8,2);
