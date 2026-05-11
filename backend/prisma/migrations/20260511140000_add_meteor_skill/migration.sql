INSERT INTO "SkillDefinition" ("id", "name", "description", "requiredLevel", "requiredSkill", "baseDamage", "manaCost", "cooldownMs", "damageKind", "element")
VALUES (
  'meteor',
  'Meteor',
  'Spell (Fire). Luôn trúng. Thiên thạch 4×4 rơi xuống điểm ngắm; va chạm tạo vùng cháy 8×8 tick mỗi 0,5s trong 3s.',
  6,
  'firebolt',
  0,
  46,
  5500,
  'SPELL',
  'FIRE'
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
