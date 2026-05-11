INSERT INTO "SkillDefinition" ("id", "name", "description", "requiredLevel", "requiredSkill", "baseDamage", "manaCost", "cooldownMs", "damageKind", "element")
VALUES (
  'chainlightning',
  'Chain Lightning',
  'Spell (Lightning). CD 0. Chỉ tung khi có quái trong 5×5 tại điểm ngắm; tia nối các mục tiêu trong 8×8 (số nối theo cấp).',
  5,
  'firebolt',
  0,
  18,
  0,
  'SPELL',
  'LIGHTNING'
)
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "requiredLevel" = EXCLUDED."requiredLevel",
  "requiredSkill" = EXCLUDED."requiredSkill",
  "baseDamage" = EXCLUDED."baseDamage",
  "manaCost" = EXCLUDED."manaCost",
  "cooldownMs" = EXCLUDED."cooldownMs",
  "damageKind" = EXCLUDED."damageKind",
  "element" = EXCLUDED."element";
