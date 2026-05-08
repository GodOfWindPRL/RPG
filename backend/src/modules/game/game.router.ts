import { Router } from 'express';
import { authMiddleware, type AuthRequest } from '../../middleware/auth.js';
import { asyncRoute } from '../../asyncRoute.js';
import { prisma } from '../shared/prisma.js';
import { unlockSkill } from '../skill/skill.service.js';
import { dungeons } from '../content/definitions.js';
import { withComputedStats } from '../player/stats.js';

export const gameRpgRouter = Router();
gameRpgRouter.use(authMiddleware);

function itemKindFromSlot(slotRaw: string): 'weapon' | 'ring' | 'amulet' | 'head' | 'chest' | 'legs' | 'hands' | 'feet' | 'misc' {
  const slot = (slotRaw || '').toLowerCase();
  if (slot.includes('weapon')) return 'weapon';
  if (slot.includes('ring')) return 'ring';
  if (slot.includes('amulet')) return 'amulet';
  if (slot.includes('helmet') || slot.includes('head')) return 'head';
  if (slot.includes('armor') || slot.includes('chest') || slot === 'armor') return 'chest';
  if (slot.includes('legs') || slot.includes('pants')) return 'legs';
  if (slot.includes('hands') || slot.includes('glove')) return 'hands';
  if (slot.includes('feet') || slot.includes('boot')) return 'feet';
  return 'misc';
}

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
  '/items/equip',
  asyncRoute(async (req, res) => {
    const { characterId, itemId } = req.body as { characterId?: string; itemId?: string };
    if (!characterId || !itemId) {
      res.status(400).json({ error: 'characterId and itemId required' });
      return;
    }
    const owned = await prisma.character.findFirst({
      where: { id: characterId, userId: (req as AuthRequest).user!.userId },
      select: { id: true },
    });
    if (!owned) {
      res.status(404).json({ error: 'Character not found' });
      return;
    }

    const item = await prisma.inventoryItem.findFirst({
      where: { id: itemId, characterId },
      include: { definition: true },
    });
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const kind = itemKindFromSlot(item.definition.slot);
    await prisma.$transaction(async (tx) => {
      if (kind === 'weapon') {
        const equippedWeapons = await tx.inventoryItem.count({
          where: { characterId, equipped: true, definition: { slot: { contains: 'weapon' } } },
        });
        // Allow up to 2 weapons; otherwise unequip the oldest equipped weapon to make room.
        if (equippedWeapons >= 2) {
          const oldest = await tx.inventoryItem.findFirst({
            where: { characterId, equipped: true, definition: { slot: { contains: 'weapon' } } },
            orderBy: { createdAt: 'asc' },
            select: { id: true },
          });
          if (oldest) await tx.inventoryItem.update({ where: { id: oldest.id }, data: { equipped: false } });
        }
      } else if (kind !== 'misc') {
        // Only one item per non-weapon kind.
        await tx.inventoryItem.updateMany({
          where: { characterId, equipped: true, definition: { slot: item.definition.slot } },
          data: { equipped: false },
        });
      }

      await tx.inventoryItem.update({
        where: { id: itemId },
        data: { equipped: true },
      });
    });

    const characterFull = await prisma.character.findFirst({
      where: { id: characterId, userId: (req as AuthRequest).user!.userId },
      include: {
        inventoryItems: { include: { definition: true } },
        skills: { include: { skill: true } },
        quests: { include: { quest: true } },
      },
    });
    const inventoryItems = await prisma.inventoryItem.findMany({
      where: { characterId },
      include: { definition: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ inventoryItems, character: characterFull ? withComputedStats(characterFull as any) : null });
  }),
);

gameRpgRouter.post(
  '/items/unequip',
  asyncRoute(async (req, res) => {
    const { characterId, itemId } = req.body as { characterId?: string; itemId?: string };
    if (!characterId || !itemId) {
      res.status(400).json({ error: 'characterId and itemId required' });
      return;
    }
    const owned = await prisma.character.findFirst({
      where: { id: characterId, userId: (req as AuthRequest).user!.userId },
      select: { id: true },
    });
    if (!owned) {
      res.status(404).json({ error: 'Character not found' });
      return;
    }
    const updated = await prisma.inventoryItem.updateMany({
      where: { id: itemId, characterId },
      data: { equipped: false },
    });
    if (updated.count <= 0) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }
    const characterFull = await prisma.character.findFirst({
      where: { id: characterId, userId: (req as AuthRequest).user!.userId },
      include: {
        inventoryItems: { include: { definition: true } },
        skills: { include: { skill: true } },
        quests: { include: { quest: true } },
      },
    });
    const inventoryItems = await prisma.inventoryItem.findMany({
      where: { characterId },
      include: { definition: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ inventoryItems, character: characterFull ? withComputedStats(characterFull as any) : null });
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
      const fresh = await prisma.character.findFirst({
        where: { id: characterId, userId: (req as AuthRequest).user!.userId },
        include: {
          inventoryItems: { include: { definition: true } },
          skills: { include: { skill: true } },
          quests: { include: { quest: true } },
        },
      });
      const skills = await prisma.characterSkill.findMany({
        where: { characterId },
        include: { skill: true },
      });
      res.json({ character: fresh ? withComputedStats(fresh as any) : null, skills });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }),
);
