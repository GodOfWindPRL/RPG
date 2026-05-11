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

/** Sau Strength: +1% base physic / điểm STR */
export function computeCorePhysDamage(c: StatSource): number {
  const b = levelBasePhysDamage(c.level);
  return Math.round(b * (1 + c.str * 0.01));
}

/**
 * Base magic damage: 10 flat (không tăng theo cấp).
 * Mỗi điểm MAG: +0.5 flat và +1% trên phần flat (10 + MAG*0.5).
 * Ví dụ 100 MAG → (10+50) * 1.6 = 96.
 */
export function computeCoreMagicDamage(c: StatSource): number {
  const flat = 10 + c.mag * 0.5;
  return Math.round(flat * (1 + c.mag * 0.01));
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
  // Spec: base player Accuracy should feel reliable even vs high-evasion mobs.
  const base = compoundPerLevel(100, c.level);
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

export type SetBonusTotals = {
  accuracyPct: number;
  evasionPct: number;
  defensePct: number;
  attackSpeedPct: number;
  moveSpeedPct: number;
  corePhysDamagePct: number;
  coreMagicDamagePct: number;
  critRatePct: number;
  critDamagePct: number;
  maxHpFlat: number;
  maxManaFlat: number;
  elemPct: { fire: number; cold: number; lightning: number; poison: number };
};

function emptySetBonusTotals(): SetBonusTotals {
  return {
    accuracyPct: 0,
    evasionPct: 0,
    defensePct: 0,
    attackSpeedPct: 0,
    moveSpeedPct: 0,
    corePhysDamagePct: 0,
    coreMagicDamagePct: 0,
    critRatePct: 0,
    critDamagePct: 0,
    maxHpFlat: 0,
    maxManaFlat: 0,
    elemPct: { fire: 0, cold: 0, lightning: 0, poison: 0 },
  };
}

function parseSetBonusLine(line: string, out: SetBonusTotals) {
  const s = String(line || '').trim();
  let m: RegExpMatchArray | null = null;

  // +18% Lightning damage
  m = s.match(/^\+(\d+(?:\.\d+)?)%\s*(fire|cold|lightning|poison)\s*damage$/i);
  if (m) {
    const v = Number(m[1]);
    const el = m[2]!.toLowerCase();
    if (Number.isFinite(v)) (out.elemPct as any)[el] = ((out.elemPct as any)[el] ?? 0) + v;
    return;
  }
  // +25% Physic damage
  m = s.match(/^\+(\d+(?:\.\d+)?)%\s*physic\s*damage$/i);
  if (m) {
    const v = Number(m[1]);
    if (Number.isFinite(v)) out.corePhysDamagePct += v;
    return;
  }
  // +22% Magic damage
  m = s.match(/^\+(\d+(?:\.\d+)?)%\s*magic\s*damage$/i);
  if (m) {
    const v = Number(m[1]);
    if (Number.isFinite(v)) out.coreMagicDamagePct += v;
    return;
  }
  // +12% Attack speed
  m = s.match(/^\+(\d+(?:\.\d+)?)%\s*attack\s*speed$/i);
  if (m) {
    const v = Number(m[1]);
    if (Number.isFinite(v)) out.attackSpeedPct += v;
    return;
  }
  // +15% Move speed
  m = s.match(/^\+(\d+(?:\.\d+)?)%\s*move\s*speed$/i);
  if (m) {
    const v = Number(m[1]);
    if (Number.isFinite(v)) out.moveSpeedPct += v;
    return;
  }
  // +20% Defense / Accuracy / Evasion
  m = s.match(/^\+(\d+(?:\.\d+)?)%\s*(defense|accuracy|evasion)$/i);
  if (m) {
    const v = Number(m[1]);
    const k = m[2]!.toLowerCase();
    if (!Number.isFinite(v)) return;
    if (k === 'defense') out.defensePct += v;
    else if (k === 'accuracy') out.accuracyPct += v;
    else if (k === 'evasion') out.evasionPct += v;
    return;
  }
  // +10% Crit rate / +40% Crit damage
  m = s.match(/^\+(\d+(?:\.\d+)?)%\s*crit\s*(rate|damage)$/i);
  if (m) {
    const v = Number(m[1]);
    const k = m[2]!.toLowerCase();
    if (!Number.isFinite(v)) return;
    if (k === 'rate') out.critRatePct += v;
    else out.critDamagePct += v;
    return;
  }
  // +160 Max HP / +140 Max Mana
  m = s.match(/^\+(\d+)\s*max\s*(hp|mana)$/i);
  if (m) {
    const v = Number(m[1]);
    const k = m[2]!.toLowerCase();
    if (!Number.isFinite(v)) return;
    if (k === 'hp') out.maxHpFlat += v;
    else out.maxManaFlat += v;
    return;
  }
}

function readSetMetaFromAffixJson(affixJson: string): null | { key: string; bonuses: string[] } {
  try {
    const o = JSON.parse(affixJson) as Record<string, unknown>;
    const key = o.setKey;
    const bonuses = o.setBonuses;
    if (typeof key !== 'string') return null;
    if (!Array.isArray(bonuses)) return null;
    const b = bonuses.filter((x) => typeof x === 'string') as string[];
    if (b.length === 0) return null;
    return { key, bonuses: b };
  } catch {
    return null;
  }
}

/**
 * Compute active set bonuses from equipped items.
 * Rule: wearing 2 pieces unlocks 1 line; N pieces unlocks (N-1) lines.
 */
export function computeActiveSetBonusTotals(
  inventoryItems: Array<{ equipped?: boolean; affixJson: string }>,
): SetBonusTotals {
  const equipped = inventoryItems.filter((it) => it?.equipped);
  const byKey = new Map<string, { count: number; bonuses: string[] }>();
  for (const it of equipped) {
    const meta = readSetMetaFromAffixJson(it.affixJson);
    if (!meta) continue;
    const cur = byKey.get(meta.key);
    if (!cur) byKey.set(meta.key, { count: 1, bonuses: meta.bonuses });
    else cur.count += 1;
  }
  const out = emptySetBonusTotals();
  for (const { count, bonuses } of byKey.values()) {
    const active = Math.max(0, Math.min(bonuses.length, count - 1));
    for (let i = 0; i < active; i++) parseSetBonusLine(bonuses[i]!, out);
  }
  return out;
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

export type ItemAffixTotals = {
  // Flat, summed across equipped items.
  accuracy: number;
  attackSpeed: number;
  moveSpeed: number;
  defense: number;
  evasion: number;
  maxHp: number;
  maxMana: number;
  physicDamage: number;
  magicDamage: number;
  hpRegen: number;
  hpRegenPct: number;
  manaRegen: number;
  manaRegenPct: number;
  fireResist: number;
  coldResist: number;
  lightningResist: number;
  poisonResist: number;
  critRatePct: number;
  critDamagePct: number;
  fireDamageFlat: number;
  coldDamageFlat: number;
  lightningDamageFlat: number;
  poisonDamageFlat: number;
  fireDamagePct: number;
  coldDamagePct: number;
  lightningDamagePct: number;
  poisonDamagePct: number;
  luckPct: number;
};

function emptyAffixTotals(): ItemAffixTotals {
  return {
    accuracy: 0,
    attackSpeed: 0,
    moveSpeed: 0,
    defense: 0,
    evasion: 0,
    maxHp: 0,
    maxMana: 0,
    physicDamage: 0,
    magicDamage: 0,
    hpRegen: 0,
    hpRegenPct: 0,
    manaRegen: 0,
    manaRegenPct: 0,
    fireResist: 0,
    coldResist: 0,
    lightningResist: 0,
    poisonResist: 0,
    critRatePct: 0,
    critDamagePct: 0,
    fireDamageFlat: 0,
    coldDamageFlat: 0,
    lightningDamageFlat: 0,
    poisonDamageFlat: 0,
    fireDamagePct: 0,
    coldDamagePct: 0,
    lightningDamagePct: 0,
    poisonDamagePct: 0,
    luckPct: 0,
  };
}

const NUMERIC_AFFIX_KEYS: Array<{ from: string; to: keyof ItemAffixTotals }> = [
  { from: 'accuracy', to: 'accuracy' },
  { from: 'attackSpeed', to: 'attackSpeed' },
  { from: 'moveSpeed', to: 'moveSpeed' },
  { from: 'defense', to: 'defense' },
  { from: 'evasion', to: 'evasion' },
  { from: 'maxHp', to: 'maxHp' },
  { from: 'maxMana', to: 'maxMana' },
  { from: 'physicDamage', to: 'physicDamage' },
  { from: 'magicDamage', to: 'magicDamage' },
  { from: 'hpRegen', to: 'hpRegen' },
  { from: 'hpRegenPct', to: 'hpRegenPct' },
  { from: 'manaRegen', to: 'manaRegen' },
  { from: 'manaRegenPct', to: 'manaRegenPct' },
  { from: 'fireResist', to: 'fireResist' },
  { from: 'coldResist', to: 'coldResist' },
  { from: 'lightningResist', to: 'lightningResist' },
  { from: 'poisonResist', to: 'poisonResist' },
  { from: 'critRate', to: 'critRatePct' },
  { from: 'critDamage', to: 'critDamagePct' },
  { from: 'fireDamage', to: 'fireDamageFlat' },
  { from: 'coldDamage', to: 'coldDamageFlat' },
  { from: 'lightningDamage', to: 'lightningDamageFlat' },
  { from: 'poisonDamage', to: 'poisonDamageFlat' },
  { from: 'fireDamagePct', to: 'fireDamagePct' },
  { from: 'coldDamagePct', to: 'coldDamagePct' },
  { from: 'lightningDamagePct', to: 'lightningDamagePct' },
  { from: 'poisonDamagePct', to: 'poisonDamagePct' },
  { from: 'luckPercent', to: 'luckPct' },
];

export function sumEquippedAffixTotals(
  inventoryItems: Array<{ equipped?: boolean; affixJson: string }>,
): ItemAffixTotals {
  const out = emptyAffixTotals();
  for (const it of inventoryItems.filter((x) => x?.equipped)) {
    try {
      const o = JSON.parse(it.affixJson) as Record<string, unknown>;
      for (const map of NUMERIC_AFFIX_KEYS) {
        const v = o[map.from];
        if (typeof v === 'number' && Number.isFinite(v)) {
          (out as any)[map.to] = ((out as any)[map.to] ?? 0) + v;
        }
      }
    } catch {
      /* ignore */
    }
  }
  return out;
}

/** Core magic trên nhân vật + flat magic trang bị + % magic từ set. */
export function computeEquippedCoreMagicDamage(
  c: StatSource,
  inventoryItems: Array<{ equipped?: boolean; affixJson: string }>,
): number {
  const totals = sumEquippedAffixTotals(inventoryItems);
  const set = computeActiveSetBonusTotals(inventoryItems);
  const base = computeCoreMagicDamage(c);
  return Math.round((base + totals.magicDamage) * (1 + set.coreMagicDamagePct / 100));
}

export function withComputedStats<T extends Character>(character: T) {
  const base = computeCharacterExtras(character);
  const inv = (character as any).inventoryItems as Array<{ equipped?: boolean; affixJson: string }> | undefined;
  const totals = Array.isArray(inv) && inv.length > 0 ? sumEquippedAffixTotals(inv) : emptyAffixTotals();
  const set = Array.isArray(inv) && inv.length > 0 ? computeActiveSetBonusTotals(inv) : emptySetBonusTotals();

  // Elemental: flat from items + (item% + set%).
  const fireDamagePct = totals.fireDamagePct + set.elemPct.fire;
  const coldDamagePct = totals.coldDamagePct + set.elemPct.cold;
  const lightningDamagePct = totals.lightningDamagePct + set.elemPct.lightning;
  const poisonDamagePct = totals.poisonDamagePct + set.elemPct.poison;
  const fireDamage = Math.round(totals.fireDamageFlat * (1 + fireDamagePct / 100));
  const coldDamage = Math.round(totals.coldDamageFlat * (1 + coldDamagePct / 100));
  const lightningDamage = Math.round(totals.lightningDamageFlat * (1 + lightningDamagePct / 100));
  const poisonDamage = Math.round(totals.poisonDamageFlat * (1 + poisonDamagePct / 100));

  const maxHp = base.maxHp + Math.round(set.maxHpFlat) + Math.round(totals.maxHp);
  const maxMana = base.maxMana + Math.round(set.maxManaFlat) + Math.round(totals.maxMana);
  const accuracy = Math.round((base.accuracy + totals.accuracy) * (1 + set.accuracyPct / 100));
  const evasion = Math.round((base.evasion + totals.evasion) * (1 + set.evasionPct / 100));
  const defense = Math.round((base.defense + totals.defense) * (1 + set.defensePct / 100));
  const attackSpeed = Math.round((base.attackSpeed + totals.attackSpeed) * (1 + set.attackSpeedPct / 100));
  const corePhysDamage = Math.round((base.corePhysDamage + totals.physicDamage) * (1 + set.corePhysDamagePct / 100));
  const coreMagicDamage = Math.round((base.coreMagicDamage + totals.magicDamage) * (1 + set.coreMagicDamagePct / 100));

  return {
    ...character,
    ...base,
    maxHp,
    maxMana,
    accuracy,
    evasion,
    defense,
    attackSpeed,
    corePhysDamage,
    coreMagicDamage,
    fireDamage,
    coldDamage,
    lightningDamage,
    poisonDamage,
    fireDamagePct,
    coldDamagePct,
    lightningDamagePct,
    poisonDamagePct,
    moveSpeedFlat: totals.moveSpeed,
    moveSpeedPct: set.moveSpeedPct,
    hpRegen: totals.hpRegen,
    hpRegenPct: totals.hpRegenPct,
    manaRegen: totals.manaRegen,
    manaRegenPct: totals.manaRegenPct,
    fireResistPct: totals.fireResist,
    coldResistPct: totals.coldResist,
    lightningResistPct: totals.lightningResist,
    poisonResistPct: totals.poisonResist,
    critRatePct: totals.critRatePct,
    critDamagePct: totals.critDamagePct + set.critDamagePct,
    luckPct: Math.min(100, Math.round(totals.luckPct * 10) / 10),
  };
}
