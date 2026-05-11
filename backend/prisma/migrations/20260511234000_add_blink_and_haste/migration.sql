-- Blink
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
  'blink',
  'Blink',
  'Teleport đến vị trí chỉ định. Tầm cast cơ bản 30, mỗi cấp +2 (ngoài tầm thì teleport đến điểm xa nhất theo hướng).',
  1,
  NULL,
  'TELEPORT',
  0,
  0,
  3000,
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

-- Haste
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
  'haste',
  'Haste',
  'Buff tốc đánh + tốc chạy. Cấp 1: +20% atk/move trong 20s; mỗi cấp +5% speed và +5s duration.',
  1,
  NULL,
  'BUFF',
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

