import type { Character } from '@prisma/client';

/** EXP để lên từ cấp `level` → `level+1`. Cấp 1: 200; mỗi bậc sau +30% so với ngưỡng cấp trước. */
export function expRequiredForCurrentLevel(level: number): number {
  let need = 200;
  for (let L = 2; L <= level; L++) {
    need = Math.round(need * 1.3);
  }
  return need;
}

/** Tăng 10% mỗi cấp so với cấp 1: base * 1.1^(level-1) */
export function compoundPerLevel(base: number, level: number): number {
  return Math.round(base * Math.pow(1.1, Math.max(0, level - 1)));
}

export type StatSource = Pick<Character, 'level' | 'str' | 'agi' | 'vit' | 'mag'>;

export function levelBasePhysDamage(level: number): number {
  return compoundPerLevel(100, level);
}

export function levelBaseMagicDamage(level: number): number {
  return compoundPerLevel(100, level);
}

/** Sau Strength: +1% base physic / điểm STR */
export function computeCorePhysDamage(c: StatSource): number {
  const b = levelBasePhysDamage(c.level);
  return Math.round(b * (1 + c.str * 0.01));
}

/** Sau Magic stat: +1% base magic / điểm MAG */
export function computeCoreMagicDamage(c: StatSource): number {
  const b = levelBaseMagicDamage(c.level);
  return Math.round(b * (1 + c.mag * 0.01));
}

export function computeMaxHp(c: StatSource): number {
  const base = compoundPerLevel(200, c.level);
  return Math.round(base + c.vit * 10);
}

export function computeMaxMana(c: StatSource): number {
  const base = compoundPerLevel(100, c.level);
  return Math.round(base + c.mag * 5);
}

export function computeDefense(c: StatSource): number {
  const base = compoundPerLevel(20, c.level);
  return Math.round(base + c.vit * 5);
}

/** +1% base evasion / AGI (nhân trên base đã scale theo cấp) */
export function computeEvasion(c: StatSource): number {
  const base = compoundPerLevel(20, c.level);
  return Math.round(base * (1 + c.agi * 0.01));
}

export function computeAccuracy(c: StatSource): number {
  const base = compoundPerLevel(20, c.level);
  return Math.round(base * (1 + c.agi * 0.01));
}

/** 100 = 1 đòn/giây; +1% / AGI */
export function computeAttackSpeed(c: StatSource): number {
  return Math.round(100 * (1 + c.agi * 0.01));
}

export interface ComputedCharacterExtras {
  maxHp: number;
  maxMana: number;
  expToNext: number;
  defense: number;
  evasion: number;
  accuracy: number;
  attackSpeed: number;
  corePhysDamage: number;
  coreMagicDamage: number;
}

export function computeCharacterExtras(c: StatSource): ComputedCharacterExtras {
  return {
    maxHp: computeMaxHp(c),
    maxMana: computeMaxMana(c),
    expToNext: expRequiredForCurrentLevel(c.level),
    defense: computeDefense(c),
    evasion: computeEvasion(c),
    accuracy: computeAccuracy(c),
    attackSpeed: computeAttackSpeed(c),
    corePhysDamage: computeCorePhysDamage(c),
    coreMagicDamage: computeCoreMagicDamage(c),
  };
}

export function withComputedStats<T extends Character>(character: T) {
  const x = computeCharacterExtras(character);
  return { ...character, ...x };
}
