import { prisma } from '../shared/prisma.js';

export async function startDungeonRun(characterId: string, dungeonKey: string, zone: string, difficulty: number) {
  return prisma.dungeonRun.create({
    data: { characterId, dungeonKey, zone, difficulty },
  });
}

export async function completeDungeonBoss(runId: string) {
  return prisma.dungeonRun.update({
    where: { id: runId },
    data: { bossDefeated: true, endedAt: new Date() },
  });
}
