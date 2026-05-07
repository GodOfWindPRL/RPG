import { Router } from 'express';
import { authMiddleware, type AuthRequest } from '../../middleware/auth.js';
import { asyncRoute } from '../../asyncRoute.js';
import { prisma } from '../shared/prisma.js';
import { unlockSkill } from '../skill/skill.service.js';
import { dungeons } from '../content/definitions.js';
import { withComputedStats } from '../player/stats.js';

export const gameRpgRouter = Router();
gameRpgRouter.use(authMiddleware);

gameRpgRouter.get(
  '/bootstrap/:characterId',
  asyncRoute(async (req, res) => {
    const characterId = req.params.characterId;
    const character = await prisma.character.findFirst({
      where: { id: characterId, userId: (req as AuthRequest).user!.userId },
      include: {
        inventoryItems: { include: { definition: true } },
        skills: { include: { skill: true } },
        quests: { include: { quest: true } },
      },
    });
    if (!character) {
      res.status(404).json({ error: 'Character not found' });
      return;
    }
    res.json({ character: withComputedStats(character), dungeons });
  }),
);

gameRpgRouter.post(
  '/stats/allocate',
  asyncRoute(async (req, res) => {
    const { characterId, stat } = req.body as { characterId?: string; stat?: string };
    const s = stat as 'str' | 'agi' | 'vit' | 'mag' | undefined;
    if (!characterId || !s || !['str', 'agi', 'vit', 'mag'].includes(s)) {
      res.status(400).json({ error: 'characterId and stat (str|agi|vit|mag) required' });
      return;
    }
    const row = await prisma.character.findFirst({
      where: { id: characterId, userId: (req as AuthRequest).user!.userId },
    });
    if (!row || row.statPoints < 1) {
      res.status(400).json({ error: 'No stat points' });
      return;
    }
    const bumped = await prisma.character.update({
      where: { id: characterId },
      data: {
        statPoints: { decrement: 1 },
        [s]: { increment: 1 },
      },
    });
    const stats = withComputedStats(bumped);
    const hp =
      s === 'vit' ? Math.min(stats.maxHp, bumped.hp + 10) : Math.min(bumped.hp, stats.maxHp);
    const final = await prisma.character.update({
      where: { id: characterId },
      data: { hp },
    });
    res.json({ character: withComputedStats(final) });
  }),
);


gameRpgRouter.post(
  '/character/reset',
  asyncRoute(async (req, res) => {
    const { characterId } = req.body as { characterId?: string };
    if (!characterId) {
      res.status(400).json({ error: 'characterId required' });
      return;
    }

    const owned = await prisma.character.findFirst({
      where: { id: characterId, userId: (req as AuthRequest).user!.userId },
    });
    if (!owned) {
      res.status(404).json({ error: 'Character not found' });
      return;
    }

    await prisma.$transaction([
      prisma.characterSkill.deleteMany({ where: { characterId } }),
      prisma.characterSkill.create({
        data: { characterId, skillId: 'slash', level: 1 },
      }),
      prisma.inventoryItem.deleteMany({ where: { characterId } }),
      prisma.character.update({
        where: { id: characterId },
        data: {
          level: 1,
          exp: 0,
          skillPoints: 0,
          statPoints: 0,
          str: 0,
          agi: 0,
          vit: 0,
          mag: 0,
          hp: 200,
          mana: 100,
        },
      }),
    ]);

    const fresh = await prisma.character.findUnique({ where: { id: characterId } });
    if (!fresh) {
      res.status(404).json({ error: 'Character not found after reset' });
      return;
    }

    const skills = await prisma.characterSkill.findMany({
      where: { characterId },
      include: { skill: true },
    });

    res.json({ character: withComputedStats(fresh), skills, inventoryItems: [] });
  }),
);

gameRpgRouter.post(
  '/skills/unlock',
  asyncRoute(async (req, res) => {
    const { characterId, skillId } = req.body as { characterId?: string; skillId?: string };
    if (!characterId || !skillId) {
      res.status(400).json({ error: 'characterId and skillId required' });
      return;
    }
    const character = await prisma.character.findFirst({
      where: { id: characterId, userId: (req as AuthRequest).user!.userId },
    });
    if (!character) {
      res.status(404).json({ error: 'Character not found' });
      return;
    }
    try {
      await unlockSkill(characterId, skillId);
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }),
);
