-- Starter branch spells: only player lv 1 for rank 1; no parent skill.
-- Meteor: rank 1 at player lv 5, requires Firebolt learned.
UPDATE "SkillDefinition"
SET
  "requiredLevel" = 1,
  "requiredSkill" = NULL
WHERE
  "id" IN ('firebolt', 'chainlightning', 'blizzard', 'chaosorb');

UPDATE "SkillDefinition"
SET
  "requiredLevel" = 5,
  "requiredSkill" = 'firebolt'
WHERE
  "id" = 'meteor';
