import { ItemRarity, type ItemDefinition } from '@prisma/client';
import { prisma } from '../shared/prisma.js';

const rarityWeight: Record<ItemRarity, number> = {
  WHITE: 55,
  BLUE: 25,
  GREEN: 12,
  YELLOW: 6,
  MYTHIC: 2,
};

function weightedRarityRoll(): ItemRarity {
  const roll = Math.random() * 100;
  let running = 0;
  for (const rarity of Object.keys(rarityWeight) as ItemRarity[]) {
    running += rarityWeight[rarity];
    if (roll <= running) return rarity;
  }
  return ItemRarity.WHITE;
}

function randomAffixes(level: number, rarity: ItemRarity) {
  const rarityMultiplier: Record<ItemRarity, number> = {
    WHITE: 1,
    BLUE: 1.15,
    GREEN: 1.3,
    YELLOW: 1.5,
    MYTHIC: 1.9,
  };
  const scaled = Math.round(level * rarityMultiplier[rarity]);
  const physicDamage = 2 + scaled;
  const rollElem = Math.random();
  const out: Record<string, number> = { physicDamage };
  if (rollElem < 0.12) out.fireDamage = Math.max(1, Math.floor(scaled * 0.4));
  else if (rollElem < 0.2) out.coldDamage = Math.max(1, Math.floor(scaled * 0.4));
  else if (rollElem < 0.26) out.lightningDamage = Math.max(1, Math.floor(scaled * 0.35));
  else if (rollElem < 0.3) out.poisonDamage = Math.max(1, Math.floor(scaled * 0.35));
  return out;
}

export type ItemRoll = {
  definition: ItemDefinition;
  level: number;
  rarity: ItemRarity;
  affixJson: string;
};

export async function rollItem(level: number): Promise<ItemRoll | null> {
  const targetRarity = weightedRarityRoll();
  const candidates = await prisma.itemDefinition.findMany({
    where: {
      minLevel: { lte: level },
      maxLevel: { gte: level },
    },
  });
  const byRarity = candidates.filter((item) => item.rarity === targetRarity);
  const pool = byRarity.length > 0 ? byRarity : candidates;
  if (pool.length === 0) return null;

  const definition = pool[Math.floor(Math.random() * pool.length)] as ItemDefinition;
  const affixes = randomAffixes(level, targetRarity);
  return {
    definition,
    level,
    rarity: targetRarity,
    affixJson: JSON.stringify(affixes),
  };
}

export async function grantRolledItem(characterId: string, roll: ItemRoll) {
  return prisma.inventoryItem.create({
    data: {
      characterId,
      definitionId: roll.definition.id,
      level: roll.level,
      rarity: roll.rarity,
      affixJson: roll.affixJson,
      quantity: 1,
    },
    include: { definition: true },
  });
}

export async function generateAndGrantItem(characterId: string, level: number) {
  const roll = await rollItem(level);
  if (!roll) return null;
  return grantRolledItem(characterId, roll);
}
