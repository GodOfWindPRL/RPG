-- Extend SkillCastKind with TELEPORT and BUFF
DO $$ BEGIN
  ALTER TYPE "SkillCastKind" ADD VALUE IF NOT EXISTS 'TELEPORT';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "SkillCastKind" ADD VALUE IF NOT EXISTS 'BUFF';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

