-- Add cast kind (MELEE / RANGED / AREA) to skills
DO $$ BEGIN
  CREATE TYPE "SkillCastKind" AS ENUM ('MELEE', 'RANGED', 'AREA');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "SkillDefinition"
ADD COLUMN IF NOT EXISTS "castKind" "SkillCastKind" NOT NULL DEFAULT 'MELEE';

UPDATE "SkillDefinition" SET "castKind" = 'MELEE' WHERE "id" = 'slash';
UPDATE "SkillDefinition" SET "castKind" = 'RANGED' WHERE "id" IN ('firebolt', 'chaosorb', 'chainlightning', 'splitarrow');
UPDATE "SkillDefinition" SET "castKind" = 'AREA' WHERE "id" IN ('blizzard', 'meteor');

