import { prisma } from '../shared/prisma.js';

export async function unlockSkill(characterId: string, skillId: string) {
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  const definition = await prisma.skillDefinition.findUnique({ where: { id: skillId } });
  if (!character || !definition) throw new Error('Invalid character or skill');

  if (character.level < definition.requiredLevel) throw new Error('Required level not met');
  if (definition.requiredSkill) {
    const hasRequired = await prisma.characterSkill.findUnique({
      where: { characterId_skillId: { characterId, skillId: definition.requiredSkill } },
    });
    if (!hasRequired) throw new Error('Required parent skill missing');
  }
  if (character.skillPoints <= 0) throw new Error('No skill points');

  const cur = await prisma.characterSkill.findUnique({
    where: { characterId_skillId: { characterId, skillId } },
  });
  const nextLevel = (cur?.level ?? 0) + 1;
  if (nextLevel > 20) throw new Error('Skill is already max level');
  await prisma.characterSkill.upsert({
    where: { characterId_skillId: { characterId, skillId } },
    update: { level: nextLevel },
    create: { characterId, skillId, level: 1 },
  });
  await prisma.character.update({
    where: { id: characterId },
    data: { skillPoints: { decrement: 1 } },
  });
}

export async function getCharacterSkillLevel(characterId: string, skillId: string): Promise<number> {
  const skill = await prisma.characterSkill.findUnique({
    where: { characterId_skillId: { characterId, skillId } },
  });
  return skill?.level ?? 0;
}
