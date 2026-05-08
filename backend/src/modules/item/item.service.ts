import { ItemRarity, type ItemDefinition } from '@prisma/client';
import { prisma } from '../shared/prisma.js';
import { setByItemId } from '../content/sets.js';

/** Base drop rarity (%), sum = 100. Green = xanh lá, Blue = xanh dương. */
const BASE_RARITY_PCT: Record<ItemRarity, number> = {
  [ItemRarity.WHITE]: 85,
  [ItemRarity.GREEN]: 10,
  [ItemRarity.BLUE]: 3,
  [ItemRarity.YELLOW]: 1.5,
  [ItemRarity.MYTHIC]: 0.5,
};

const NON_WHITE: ItemRarity[] = [
  ItemRarity.GREEN,
  ItemRarity.BLUE,
  ItemRarity.YELLOW,
  ItemRarity.MYTHIC,
];

const NON_WHITE_SUM = NON_WHITE.reduce((s, r) => s + BASE_RARITY_PCT[r], 0);

/** Tier order for rarity boost (+1 boss intent, etc.): trắng → lá → dương → vàng → mythic. */
const RARITY_ORDER: ItemRarity[] = [
  ItemRarity.WHITE,
  ItemRarity.GREEN,
  ItemRarity.BLUE,
  ItemRarity.YELLOW,
  ItemRarity.MYTHIC,
];

/** Luck 0–100: lấy (luck/100)×%trắng khỏi trắng, chia cho các màu còn lại theo tỉ lệ 10:3:1.5:0.5. */
export function rarityPercentTableWithLuck(luckPercent: number): Record<ItemRarity, number> {
  const luck = Math.max(0, Math.min(100, luckPercent));
  const removed = (luck / 100) * BASE_RARITY_PCT[ItemRarity.WHITE];
  const newWhite = Math.max(0, BASE_RARITY_PCT[ItemRarity.WHITE] - removed);
  const out: Record<ItemRarity, number> = {
    [ItemRarity.WHITE]: newWhite,
    [ItemRarity.GREEN]: BASE_RARITY_PCT[ItemRarity.GREEN],
    [ItemRarity.BLUE]: BASE_RARITY_PCT[ItemRarity.BLUE],
    [ItemRarity.YELLOW]: BASE_RARITY_PCT[ItemRarity.YELLOW],
    [ItemRarity.MYTHIC]: BASE_RARITY_PCT[ItemRarity.MYTHIC],
  };
  for (const r of NON_WHITE) {
    const w = BASE_RARITY_PCT[r];
    out[r] = w + removed * (w / NON_WHITE_SUM);
  }
  return out;
}

function weightedRarityRoll(luckPercent: number): ItemRarity {
  const table = rarityPercentTableWithLuck(luckPercent);
  const total = RARITY_ORDER.reduce((s, r) => s + table[r], 0);
  const roll = Math.random() * (total > 0 ? total : 100);
  let running = 0;
  for (const rarity of RARITY_ORDER) {
    running += table[rarity];
    if (roll <= running) return rarity;
  }
  return RARITY_ORDER[RARITY_ORDER.length - 1] ?? ItemRarity.WHITE;
}

function clampRarityBoost(rarity: ItemRarity, boost: number): ItemRarity {
  const idx = RARITY_ORDER.indexOf(rarity);
  if (idx < 0) return rarity;
  const next = Math.max(0, Math.min(RARITY_ORDER.length - 1, idx + (Number.isFinite(boost) ? Math.trunc(boost) : 0)));
  return RARITY_ORDER[next] ?? rarity;
}

function rollLuckPercentForJewelry(level: number): number {
  // Spec:
  // - lv1: 1..3%
  // - lv10: 1..30%
  // - cap grows by +3% per level (max = level*3)
  const lv = Math.max(1, Math.min(10, Math.floor(level || 1)));
  const hi = lv * 3;
  const lo = 1;
  const v = lo + Math.random() * (hi - lo);
  // keep 0.1 precision for nicer UI
  return Math.round(v * 10) / 10;
}

/**
 * Number of EXTRA affix lines per rarity. Source of truth for stats.
 * White:0, Green:2-3, Blue:4, Yellow:5, Mythic:6.
 */
function extraAffixCount(rarity: ItemRarity): number {
  if (rarity === ItemRarity.WHITE) return 0;
  if (rarity === ItemRarity.GREEN) return Math.random() < 0.5 ? 2 : 3;
  if (rarity === ItemRarity.BLUE) return 4;
  if (rarity === ItemRarity.YELLOW) return 5;
  if (rarity === ItemRarity.MYTHIC) return 6;
  return 0;
}

type AffixKey =
  | 'accuracy'
  | 'attackSpeed'
  | 'moveSpeed'
  | 'defense'
  | 'evasion'
  | 'maxHp'
  | 'maxMana'
  | 'physicDamage'
  | 'magicDamage'
  | 'critRate'
  | 'critDamage'
  | 'fireDamage'
  | 'coldDamage'
  | 'lightningDamage'
  | 'poisonDamage'
  | 'fireDamagePct'
  | 'coldDamagePct'
  | 'lightningDamagePct'
  | 'poisonDamagePct'
  | 'hpRegen'
  | 'hpRegenPct'
  | 'manaRegen'
  | 'manaRegenPct'
  | 'fireResist'
  | 'coldResist'
  | 'lightningResist'
  | 'poisonResist';

function affixPool(slot: string): AffixKey[] {
  const sl = slot.toLowerCase();
  if (sl.includes('weapon')) {
    return [
      'physicDamage',
      'magicDamage',
      'accuracy',
      'attackSpeed',
      'critRate',
      'critDamage',
      'fireDamage',
      'coldDamage',
      'lightningDamage',
      'poisonDamage',
      'fireDamagePct',
      'coldDamagePct',
      'lightningDamagePct',
      'poisonDamagePct',
    ];
  }
  if (sl.includes('ring') || sl.includes('amulet')) {
    return [
      'accuracy',
      'attackSpeed',
      'moveSpeed',
      'maxHp',
      'maxMana',
      'hpRegen',
      'hpRegenPct',
      'manaRegen',
      'manaRegenPct',
      'critRate',
      'critDamage',
      'fireDamage',
      'coldDamage',
      'lightningDamage',
      'poisonDamage',
      'fireDamagePct',
      'coldDamagePct',
      'lightningDamagePct',
      'poisonDamagePct',
      'fireResist',
      'coldResist',
      'lightningResist',
      'poisonResist',
    ];
  }
  if (sl.includes('feet') || sl.includes('boot')) {
    return [
      'moveSpeed',
      'evasion',
      'defense',
      'maxHp',
      'critRate',
      'hpRegen',
      'manaRegen',
      'fireResist',
      'coldResist',
      'lightningResist',
      'poisonResist',
    ];
  }
  // chest/head/legs/hands
  return [
    'defense',
    'evasion',
    'maxHp',
    'maxMana',
    'accuracy',
    'attackSpeed',
    'hpRegen',
    'hpRegenPct',
    'manaRegen',
    'manaRegenPct',
    'fireResist',
    'coldResist',
    'lightningResist',
    'poisonResist',
  ];
}

/** Always-positive number rolled for a given affix at a given level. */
function rollAffixValue(key: AffixKey, level: number): number {
  const lv = Math.max(1, Math.floor(level || 1));
  const r = Math.random();
  const j = (base: number) => Math.max(1, Math.round(base * (0.8 + r * 0.4)));
  switch (key) {
    case 'accuracy':
      return j(2 + lv * 1.2);
    case 'attackSpeed':
      return j(1 + lv * 0.6);
    case 'moveSpeed':
      return j(1 + lv * 0.2);
    case 'defense':
      return j(4 + lv * 1.4);
    case 'evasion':
      return j(3 + lv * 1.2);
    case 'maxHp':
      return j(12 + lv * 6);
    case 'maxMana':
      return j(8 + lv * 5);
    case 'physicDamage':
      return j(3 + lv * 1.6);
    case 'magicDamage':
      return j(2 + lv * 1.4);
    case 'critRate':
      return Math.round((1 + lv * 0.35) * (0.8 + r * 0.4) * 10) / 10;
    case 'critDamage':
      return Math.round((4 + lv * 1.2) * (0.8 + r * 0.4));
    case 'fireDamage':
    case 'coldDamage':
    case 'lightningDamage':
    case 'poisonDamage':
      return j(2 + lv * 1.1);
    case 'fireDamagePct':
    case 'coldDamagePct':
    case 'lightningDamagePct':
    case 'poisonDamagePct':
      return Math.round((1 + lv * 0.45) * (0.8 + r * 0.4) * 10) / 10;
    case 'hpRegen':
    case 'manaRegen':
      return j(1 + lv * 0.55);
    case 'hpRegenPct':
    case 'manaRegenPct':
      return Math.round((0.4 + lv * 0.25) * (0.8 + r * 0.4) * 10) / 10;
    case 'fireResist':
    case 'coldResist':
    case 'lightningResist':
    case 'poisonResist':
      return Math.round((2 + lv * 0.5) * (0.8 + r * 0.4));
    default:
      return 0;
  }
}

/** Base stat that ships on every item by slot (level-scaled). */
function baseAffixesForSlot(slot: string, level: number): Record<string, number> {
  const lv = Math.max(1, Math.floor(level || 1));
  const v = (v1: number) => Math.round(v1 * Math.pow(1.5, lv - 1));
  const sl = slot.toLowerCase();
  if (sl.includes('weapon')) return { physicDamage: v(20) };
  if (sl.includes('feet') || sl.includes('boot')) return { defense: v(10), moveSpeed: 1 };
  if (
    sl.includes('chest') ||
    sl.includes('armor') ||
    sl.includes('helmet') ||
    sl.includes('head') ||
    sl.includes('legs') ||
    sl.includes('pants') ||
    sl.includes('hands') ||
    sl.includes('glove')
  ) {
    return { defense: v(10) };
  }
  return {};
}

/**
 * Roll the full affix object for an item. This is THE source of truth — the
 * frontend never invents extra affixes; it only renders what's in here.
 */
export function randomAffixes(level: number, rarity: ItemRarity, slot: string) {
  const sl = slot.toLowerCase();
  // Stamp base stats first so FE/BE agree.
  const out: Record<string, number> = { ...baseAffixesForSlot(slot, level) };
  const baseKeys = new Set(Object.keys(out));
  const count = extraAffixCount(rarity);
  if (count > 0) {
    const pool = affixPool(slot).filter((k) => !baseKeys.has(k));
    const picked = new Set<AffixKey>();
    let guard = 0;
    while (picked.size < count && guard++ < 200) {
      const k = pool[Math.floor(Math.random() * pool.length)]!;
      if (picked.has(k)) continue;
      picked.add(k);
      const v = rollAffixValue(k, level);
      if (Number.isFinite(v) && v !== 0) out[k] = v;
    }
  }
  // Luck on jewelry replaces one extra slot (and only on non-WHITE).
  if ((sl.includes('ring') || sl.includes('amulet')) && rarity !== ItemRarity.WHITE) {
    if (Math.random() < 0.42) {
      out.luckPercent = rollLuckPercentForJewelry(level);
    }
  }
  return out;
}

export type ItemRoll = {
  definition: ItemDefinition;
  level: number;
  rarity: ItemRarity;
  affixJson: string;
};

export async function getCharacterLootLuckPercent(characterId: string): Promise<number> {
  const items = await prisma.inventoryItem.findMany({
    where: { characterId, equipped: true },
    include: { definition: true },
  });
  let sum = 0;
  for (const it of items) {
    const defSlot = (it.definition.slot ?? '').toLowerCase();
    if (!defSlot.includes('ring') && !defSlot.includes('amulet')) continue;
    if ((it.rarity ?? '').toUpperCase() === 'WHITE') continue;
    try {
      const o = JSON.parse(it.affixJson) as Record<string, unknown>;
      const v = o.luckPercent;
      if (typeof v === 'number' && Number.isFinite(v)) sum += v;
    } catch {
      /* ignore */
    }
  }
  return Math.max(0, Math.min(100, sum));
}

export async function rollItem(
  level: number,
  opts?: { rarityBoost?: number; luckPercent?: number },
): Promise<ItemRoll | null> {
  const luck = Math.max(0, Math.min(100, opts?.luckPercent ?? 0));
  const targetRarity = clampRarityBoost(weightedRarityRoll(luck), opts?.rarityBoost ?? 0);
  const candidates = await prisma.itemDefinition.findMany({
    where: {
      minLevel: { lte: level },
      maxLevel: { gte: level },
      // Potions are dropped on a separate pipeline (rollPotionForMonsterLevel),
      // not via the regular gear roll.
      NOT: { slot: { startsWith: 'potion_' } },
    },
  });
  if (candidates.length === 0) return null;

  // Balance item types: pick slot uniformly, then pick definition within that slot.
  const slots = Array.from(new Set(candidates.map((c) => c.slot))).filter(Boolean);
  const pickedSlot = slots.length > 0 ? slots[Math.floor(Math.random() * slots.length)]! : candidates[0]!.slot;
  const slotPool = candidates.filter((c) => c.slot === pickedSlot);
  const byRarity = slotPool.filter((item) => item.rarity === targetRarity);
  // IMPORTANT: keep rolled rarity if possible (Luck affects rarity, not slot availability).
  // If chosen slot has no items of the rolled rarity, fall back to *any slot* that has the rolled rarity.
  const globalByRarity = candidates.filter((item) => item.rarity === targetRarity);
  const pool = byRarity.length > 0 ? byRarity : globalByRarity.length > 0 ? globalByRarity : slotPool;

  const definition = pool[Math.floor(Math.random() * pool.length)] as ItemDefinition;
  const affixes = randomAffixes(level, definition.rarity, definition.slot);
  const setMeta = setByItemId.get(definition.id);
  if (setMeta && definition.rarity === ItemRarity.MYTHIC) {
    (affixes as any).setKey = setMeta.key;
    (affixes as any).setName = setMeta.name;
    (affixes as any).setPiecesTotal = setMeta.piecesTotal;
    (affixes as any).setBonuses = setMeta.bonuses;
  }
  return {
    definition,
    level,
    rarity: definition.rarity,
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

// ─── Potion drop & use ─────────────────────────────────────────────────────
//
// Potion definitions live in `definitions.ts`. The id encodes both the kind
// (hp/mp) and the level (1..5). Heal amount is the canonical source of truth.

export const POTION_HEAL_AMOUNT: Record<string, { hp?: number; mp?: number }> = {
  hp_potion_1: { hp: 40 },
  hp_potion_2: { hp: 100 },
  hp_potion_3: { hp: 250 },
  hp_potion_4: { hp: 600 },
  hp_potion_5: { hp: 2000 },
  mp_potion_1: { mp: 20 },
  mp_potion_2: { mp: 50 },
  mp_potion_3: { mp: 125 },
  mp_potion_4: { mp: 300 },
  mp_potion_5: { mp: 1000 },
};

/** Tier table — monster level → highest droppable potion tier. */
export function potionLevelForMonsterLevel(monsterLevel: number): number {
  if (monsterLevel >= 80) return 5;
  if (monsterLevel >= 60) return 4;
  if (monsterLevel >= 40) return 3;
  if (monsterLevel >= 20) return 2;
  return 1;
}

export type PotionRoll = {
  definition: ItemDefinition;
  level: number;
};

/**
 * Roll a HP/MP potion drop appropriate for a monster of the given level.
 * 50/50 between HP and MP.
 */
export async function rollPotionForMonsterLevel(monsterLevel: number): Promise<PotionRoll | null> {
  const lv = potionLevelForMonsterLevel(monsterLevel);
  const isHp = Math.random() < 0.5;
  const id = `${isHp ? 'hp' : 'mp'}_potion_${lv}`;
  const def = await prisma.itemDefinition.findUnique({ where: { id } });
  if (!def) return null;
  return { definition: def, level: lv };
}
