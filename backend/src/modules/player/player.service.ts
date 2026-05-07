import { ItemRarity } from '@prisma/client';
import { prisma } from '../shared/prisma.js';
import { clampWorldXZ } from '../shared/worldBounds.js';
import { withComputedStats } from './stats.js';

export async function createCharacter(userId: string, name: string, className: string) {
  const character = await prisma.character.create({
    data: {
      userId,
      name,
      className,
      skills: { create: [{ skillId: 'slash', level: 1 }] },
      quests: {
        create: [
          { questId: 'q_kill_wolves', progressValue: 0, completed: false },
          { questId: 'q_collect_blue', progressValue: 0, completed: false },
        ],
      },
    },
    include: {
      skills: { include: { skill: true } },
      inventoryItems: { include: { definition: true } },
      quests: { include: { quest: true } },
    },
  });

  await prisma.inventoryItem.create({
    data: {
      characterId: character.id,
      definitionId: 'rusty_sword',
      level: 1,
      rarity: ItemRarity.WHITE,
      affixJson: JSON.stringify({ physicDamage: 15 }),
      equipped: true,
    },
  });

  const row = await getCharacterById(character.id, userId);
  if (!row) throw new Error('Character create failed');
  return withComputedStats(row);
}

export async function getCharacterById(characterId: string, userId: string) {
  return prisma.character.findFirst({
    where: { id: characterId, userId },
    include: {
      skills: { include: { skill: true } },
      inventoryItems: { include: { definition: true } },
      quests: { include: { quest: true } },
    },
  });
}

export async function listCharacters(userId: string) {
  const rows = await prisma.character.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((c) => withComputedStats(c));
}

export async function updateCharacterPosition(characterId: string, x: number, y: number, z: number) {
  return prisma.character.update({
    where: { id: characterId },
    data: { posX: clampWorldXZ(x), posY: y, posZ: clampWorldXZ(z) },
    select: { id: true, posX: true, posY: true, posZ: true },
  });
}
