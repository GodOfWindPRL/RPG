import { prisma } from '../shared/prisma.js';
import { expRequiredForCurrentLevel, withComputedStats } from './stats.js';

export interface CharacterProgressPayload {
  hp: number;
  mana: number;
  level: number;
  exp: number;
  maxHp: number;
  maxMana: number;
  expToNext: number;
  skillPoints: number;
  statPoints: number;
  str: number;
  agi: number;
  vit: number;
  mag: number;
  defense: number;
  evasion: number;
  accuracy: number;
  attackSpeed: number;
  corePhysDamage: number;
  coreMagicDamage: number;
  expGained: number;
}

function toProgressPayload(v: ReturnType<typeof withComputedStats>, expGained: number): CharacterProgressPayload {
  return {
    hp: v.hp,
    mana: v.mana,
    level: v.level,
    exp: v.exp,
    maxHp: v.maxHp,
    maxMana: v.maxMana,
    expToNext: v.expToNext,
    skillPoints: v.skillPoints,
    statPoints: v.statPoints,
    str: v.str,
    agi: v.agi,
    vit: v.vit,
    mag: v.mag,
    defense: v.defense,
    evasion: v.evasion,
    accuracy: v.accuracy,
    attackSpeed: v.attackSpeed,
    corePhysDamage: v.corePhysDamage,
    coreMagicDamage: v.coreMagicDamage,
    expGained,
  };
}

export async function applyExpGain(characterId: string, expReward: number): Promise<CharacterProgressPayload | null> {
  const row = await prisma.character.findUnique({ where: { id: characterId } });
  if (!row) return null;

  let exp = row.exp + expReward;
  let level = row.level;
  let levelsGained = 0;

  while (exp >= expRequiredForCurrentLevel(level)) {
    exp -= expRequiredForCurrentLevel(level);
    level += 1;
    levelsGained += 1;
  }

  const freshStats = withComputedStats({ ...row, level });
  const maxHp = freshStats.maxHp;
  const maxMana = freshStats.maxMana;

  if (levelsGained > 0) {
    await prisma.character.update({
      where: { id: characterId },
      data: {
        exp,
        level,
        hp: maxHp,
        mana: maxMana,
        skillPoints: { increment: levelsGained },
        statPoints: { increment: levelsGained * 5 },
      },
    });
  } else {
    await prisma.character.update({
      where: { id: characterId },
      data: { exp },
    });
  }

  const fresh = await prisma.character.findUnique({ where: { id: characterId } });
  if (!fresh) return null;
  return toProgressPayload(withComputedStats(fresh), expReward);
}
