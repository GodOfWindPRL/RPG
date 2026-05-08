import type { InventoryItem } from './types';

// Canonical item kinds used by UI + equip rules.
export type ItemKind = 'head' | 'chest' | 'legs' | 'hands' | 'feet' | 'weapon' | 'ring' | 'amulet' | 'potion' | 'misc';

export type EquipmentSlot =
  | 'head'
  | 'chest'
  | 'legs'
  | 'hands'
  | 'feet'
  | 'weaponLeft'
  | 'weaponRight'
  | 'ring1'
  | 'ring2'
  | 'amulet';

/** Potion sub-kind (HP heal vs MP restore), parsed from backend slot. */
export type PotionKind = 'hp' | 'mp' | null;

export type UiItem = {
  id: string;
  name: string;
  kind: ItemKind;
  icon: string;
  rarity?: string;
  level?: number;
  /** Chỉ dùng để hiển thị / cộng Luck % từ server (drop); opt base + extra vẫn theo UI. */
  affixJson?: string;
  /** Potion-only metadata (kind + heal/restore amount). */
  potion?: { kind: 'hp' | 'mp'; amount: number };
};

/** Heal amount per potion level (must mirror backend POTION_HEAL_AMOUNT). */
const HP_POTION_AMOUNTS = [40, 100, 250, 600, 2000];
const MP_POTION_AMOUNTS = [20, 50, 125, 300, 1000];

export function potionMetaFromSlot(slot: string, level: number): UiItem['potion'] {
  const sl = (slot ?? '').toLowerCase();
  const lv = Math.max(1, Math.min(5, Math.floor(level || 1)));
  if (sl === 'potion_hp') return { kind: 'hp', amount: HP_POTION_AMOUNTS[lv - 1] ?? 0 };
  if (sl === 'potion_mp') return { kind: 'mp', amount: MP_POTION_AMOUNTS[lv - 1] ?? 0 };
  return undefined;
}

export type OptLine = {
  key: string;
  label: string;
  valueText: string;
  tone: 'base' | 'extra';
};

/**
 * Affix keys we render. The server `affixJson` is the single source of truth
 * — the client never invents extras anymore.
 */
const AFFIX_KEYS_FLAT = new Set([
  'physicDamage',
  'magicDamage',
  'accuracy',
  'attackSpeed',
  'moveSpeed',
  'defense',
  'evasion',
  'maxHp',
  'maxMana',
  'hpRegen',
  'manaRegen',
  'fireDamage',
  'coldDamage',
  'lightningDamage',
  'poisonDamage',
]);
const AFFIX_KEYS_PCT = new Set([
  'fireDamagePct',
  'coldDamagePct',
  'lightningDamagePct',
  'poisonDamagePct',
  'hpRegenPct',
  'manaRegenPct',
  'fireResist',
  'coldResist',
  'lightningResist',
  'poisonResist',
  'critRate',
  'critDamage',
  'luckPercent',
]);

const AFFIX_LABEL: Record<string, string> = {
  accuracy: 'Accuracy',
  attackSpeed: 'Attack Speed',
  moveSpeed: 'Move Speed',
  defense: 'Defense',
  evasion: 'Evasion',
  maxHp: 'Max HP',
  maxMana: 'Max Mana',
  physicDamage: 'Physic damage',
  magicDamage: 'Magic damage',
  critRate: 'Crit Rate',
  critDamage: 'Crit damage',
  fireDamagePct: 'Fire Damage',
  coldDamagePct: 'Cold Damage',
  lightningDamagePct: 'Lightning Damage',
  poisonDamagePct: 'Poison Damage',
  fireDamage: 'Fire Damage',
  coldDamage: 'Cold Damage',
  lightningDamage: 'Lightning Damage',
  poisonDamage: 'Poison Damage',
  hpRegen: 'HP Regeneration',
  hpRegenPct: 'HP Regeneration',
  manaRegen: 'MP Regeneration',
  manaRegenPct: 'MP Regeneration',
  fireResist: 'Fire resist',
  coldResist: 'Cold resist',
  lightningResist: 'Lightning resist',
  poisonResist: 'Poison resist',
  luckPercent: 'Luck',
};

/** Stable order so tooltips look consistent. */
const AFFIX_ORDER = [
  'physicDamage',
  'magicDamage',
  'defense',
  'evasion',
  'accuracy',
  'attackSpeed',
  'moveSpeed',
  'maxHp',
  'maxMana',
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
  'hpRegen',
  'hpRegenPct',
  'manaRegen',
  'manaRegenPct',
  'fireResist',
  'coldResist',
  'lightningResist',
  'poisonResist',
  'luckPercent',
];

/** Which keys are considered "base" (white-line) for a given slot. */
function baseKeysForKind(kind: ItemKind): Set<string> {
  if (kind === 'weapon') return new Set(['physicDamage']);
  if (kind === 'feet') return new Set(['defense', 'moveSpeed']);
  if (kind === 'chest' || kind === 'head' || kind === 'legs' || kind === 'hands') return new Set(['defense']);
  return new Set();
}

function formatAffixValue(key: string, raw: number): string {
  if (AFFIX_KEYS_PCT.has(key)) {
    const v = Math.round(raw * 10) / 10;
    return `+${v}%`;
  }
  if (AFFIX_KEYS_FLAT.has(key)) {
    return `+${Math.round(raw)}`;
  }
  // Unknown key — just show as flat.
  return `+${Math.round(raw * 10) / 10}`;
}

/**
 * Build option lines straight from the item's `affixJson`. This is the only
 * source of truth — no client-side roll, no fake extras.
 */
export function allOptLines(item: UiItem): OptLine[] {
  if (!item.affixJson) return [];
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(item.affixJson) as Record<string, unknown>;
  } catch {
    return [];
  }
  const baseKeys = baseKeysForKind(item.kind);
  const out: OptLine[] = [];
  for (const key of AFFIX_ORDER) {
    const raw = o[key];
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw === 0) continue;
    const label = AFFIX_LABEL[key] ?? key;
    out.push({
      key,
      label,
      valueText: formatAffixValue(key, raw),
      tone: baseKeys.has(key) ? 'base' : 'extra',
    });
  }
  return out;
}

/** Backwards-compat: callers used to render base lines separately. */
export function baseOptLines(_kind: ItemKind, _level: number): OptLine[] {
  return [];
}

export type StatBonuses = Partial<{
  accuracy: number;
  attackSpeed: number;
  moveSpeed: number;
  defense: number;
  evasion: number;
  maxHp: number;
  maxMana: number;
  corePhysDamage: number;
  coreMagicDamage: number;
  critRatePct: number;
  critDamagePct: number;
  hpRegen: number;
  hpRegenPct: number;
  manaRegen: number;
  manaRegenPct: number;
  fireResistPct: number;
  coldResistPct: number;
  lightningResistPct: number;
  poisonResistPct: number;
  /** Tổng Luck % từ trang bị (tối đa hiệu dụng 100 khi tính drop). */
  luckPct: number;
}>;

const AFFIX_TO_BONUS_KEY: Record<string, keyof StatBonuses> = {
  accuracy: 'accuracy',
  attackSpeed: 'attackSpeed',
  moveSpeed: 'moveSpeed',
  defense: 'defense',
  evasion: 'evasion',
  maxHp: 'maxHp',
  maxMana: 'maxMana',
  physicDamage: 'corePhysDamage',
  magicDamage: 'coreMagicDamage',
  critRate: 'critRatePct',
  critDamage: 'critDamagePct',
  hpRegen: 'hpRegen',
  hpRegenPct: 'hpRegenPct',
  manaRegen: 'manaRegen',
  manaRegenPct: 'manaRegenPct',
  fireResist: 'fireResistPct',
  coldResist: 'coldResistPct',
  lightningResist: 'lightningResistPct',
  poisonResist: 'poisonResistPct',
  luckPercent: 'luckPct',
};

export function bonusesFromItem(item: UiItem): StatBonuses {
  const out: StatBonuses = {};
  if (!item.affixJson) return out;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(item.affixJson) as Record<string, unknown>;
  } catch {
    return out;
  }
  for (const [key, target] of Object.entries(AFFIX_TO_BONUS_KEY)) {
    const v = o[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    out[target] = ((out[target] as number | undefined) ?? 0) + v;
  }
  return out;
}

export function sumBonuses(items: UiItem[]): StatBonuses {
  const out: StatBonuses = {};
  for (const it of items) {
    const b = bonusesFromItem(it);
    for (const [k, v] of Object.entries(b)) {
      const key = k as keyof StatBonuses;
      out[key] = (out[key] as number | undefined ?? 0) + (v as number);
    }
  }
  return out;
}

export function emojiForKind(kind: ItemKind): string {
  switch (kind) {
    case 'chest':
      return '🦺';
    case 'legs':
      return '👖';
    case 'head':
      return '🧢';
    case 'hands':
      return '🧤';
    case 'feet':
      return '🧦';
    case 'weapon':
      return '⚔️';
    case 'potion':
      return '🧪';
    case 'ring':
      return '💍';
    case 'amulet':
      return '📿';
    default:
      return '🩲';
  }
}

export function itemKindFromBackendSlot(slotRaw: string): ItemKind {
  const slot = (slotRaw || '').toLowerCase();
  if (slot.includes('weapon')) return 'weapon';
  if (slot.includes('armor') || slot.includes('chest') || slot === 'armor') return 'chest';
  if (slot.includes('helmet') || slot.includes('head')) return 'head';
  if (slot.includes('legs') || slot.includes('pants')) return 'legs';
  if (slot.includes('hands') || slot.includes('glove')) return 'hands';
  if (slot.includes('feet') || slot.includes('boot')) return 'feet';
  if (slot.includes('ring')) return 'ring';
  if (slot.includes('amulet')) return 'amulet';
  if (slot.includes('potion')) return 'potion';
  return 'misc';
}

export function mapBackendItemToUi(it: InventoryItem): UiItem {
  const kind = itemKindFromBackendSlot(it.definition.slot);
  const potion = kind === 'potion' ? potionMetaFromSlot(it.definition.slot, it.level) : undefined;
  const icon = potion?.kind === 'hp' ? '🧪' : potion?.kind === 'mp' ? '💧' : emojiForKind(kind);
  return {
    id: it.id,
    name: it.definition.name,
    kind,
    icon,
    rarity: it.rarity,
    level: it.level,
    affixJson: it.affixJson,
    ...(potion ? { potion } : {}),
  };
}

export function slotAccepts(slot: EquipmentSlot, item: UiItem): boolean {
  if (slot === 'weaponLeft' || slot === 'weaponRight') return item.kind === 'weapon';
  if (slot === 'ring1' || slot === 'ring2') return item.kind === 'ring';
  if (slot === 'amulet') return item.kind === 'amulet';
  return item.kind === slot;
}

