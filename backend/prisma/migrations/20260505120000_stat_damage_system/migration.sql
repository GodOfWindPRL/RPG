-- CreateEnum
CREATE TYPE "SkillDamageKind" AS ENUM ('PHYSIC', 'MAGIC');

-- CreateEnum
CREATE TYPE "SkillElement" AS ENUM ('NONE', 'FIRE', 'COLD', 'LIGHTNING', 'POISON');

-- AlterTable Character: int -> mag, add vit, statPoints, adjust defaults
ALTER TABLE "Character" RENAME COLUMN "int" TO "mag";
ALTER TABLE "Character" ADD COLUMN "vit" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Character" ADD COLUMN "statPoints" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Character" ALTER COLUMN "skillPoints" SET DEFAULT 0;
ALTER TABLE "Character" ALTER COLUMN "hp" SET DEFAULT 200;
ALTER TABLE "Character" ALTER COLUMN "mana" SET DEFAULT 100;
ALTER TABLE "Character" ALTER COLUMN "str" SET DEFAULT 0;
ALTER TABLE "Character" ALTER COLUMN "agi" SET DEFAULT 0;
ALTER TABLE "Character" ALTER COLUMN "mag" SET DEFAULT 0;

-- AlterTable SkillDefinition
ALTER TABLE "SkillDefinition" ADD COLUMN "damageKind" "SkillDamageKind" NOT NULL DEFAULT 'PHYSIC';
ALTER TABLE "SkillDefinition" ADD COLUMN "element" "SkillElement" NOT NULL DEFAULT 'NONE';

UPDATE "SkillDefinition" SET "damageKind" = 'MAGIC', "element" = 'FIRE' WHERE "id" = 'firebolt';
