import { ItemRarity, QuestType } from '@prisma/client';
import { prisma } from '../shared/prisma.js';

export async function progressKillQuest(characterId: string, enemyType: string) {
  const rows = await prisma.characterQuest.findMany({
    where: {
      characterId,
      completed: false,
      quest: { type: QuestType.KILL_ENEMIES, targetKey: enemyType },
    },
    include: { quest: true },
  });

  for (const row of rows) {
    const next = row.progressValue + 1;
    const completed = next >= row.quest.targetValue;
    await prisma.characterQuest.update({
      where: { id: row.id },
      data: { progressValue: next, completed },
    });
  }
}

export async function progressCollectQuest(characterId: string, rarity: ItemRarity) {
  const rows = await prisma.characterQuest.findMany({
    where: {
      characterId,
      completed: false,
      quest: { type: QuestType.COLLECT_ITEMS, targetKey: rarity },
    },
    include: { quest: true },
  });

  for (const row of rows) {
    const next = row.progressValue + 1;
    const completed = next >= row.quest.targetValue;
    await prisma.characterQuest.update({
      where: { id: row.id },
      data: { progressValue: next, completed },
    });
  }
}
