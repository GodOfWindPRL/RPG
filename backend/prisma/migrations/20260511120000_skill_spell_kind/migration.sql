-- Rename MAGIC → SPELL (spell skills ignore accuracy/evasion; physic unchanged)
ALTER TYPE "SkillDamageKind" RENAME VALUE 'MAGIC' TO 'SPELL';
