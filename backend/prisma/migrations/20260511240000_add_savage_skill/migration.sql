INSERT INTO "SkillDefinition" (
  "id",
  "name",
  "description",
  "requiredLevel",
  "requiredSkill",
  "castKind",
  "baseDamage",
  "manaCost",
  "cooldownMs",
  "damageKind",
  "element"
)
VALUES (
  'savage',
  'Savage',
  'Liên hoàn chém. Chém liền 3 nhát; mỗi nhát quét vùng 5×3 phía trước.',
  1,
  NULL,
  'MELEE',
  0,
  0,
  0,
  'PHYSIC',
  'NONE'
)
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "requiredLevel" = EXCLUDED."requiredLevel",
  "requiredSkill" = EXCLUDED."requiredSkill",
  "castKind" = EXCLUDED."castKind",
  "baseDamage" = EXCLUDED."baseDamage",
  "manaCost" = EXCLUDED."manaCost",
  "cooldownMs" = EXCLUDED."cooldownMs",
  "damageKind" = EXCLUDED."damageKind",
  "element" = EXCLUDED."element";

