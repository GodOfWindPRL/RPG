INSERT INTO "SkillDefinition" (
  "id",
  "name",
  "description",
  "requiredLevel",
  "requiredSkill",
  "baseDamage",
  "manaCost",
  "cooldownMs",
  "damageKind",
  "element"
)
VALUES (
  'splitarrow',
  'Split Arrow',
  'Physic (Ranged). Bắn nhiều mũi tên tỏa ra phía trước. Lv1: 5 mũi / 40°; mốc 5/10/15/20: 7/9/11/13 mũi và 45/50/55/60°.',
  1,
  NULL,
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
  "baseDamage" = EXCLUDED."baseDamage",
  "manaCost" = EXCLUDED."manaCost",
  "cooldownMs" = EXCLUDED."cooldownMs",
  "damageKind" = EXCLUDED."damageKind",
  "element" = EXCLUDED."element";

