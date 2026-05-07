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
  | 'ring'
  | 'amulet';

export type UiItem = {
  id: string;
  name: string;
  kind: ItemKind;
  icon: string;
  rarity?: string;
  level?: number;
};

export type OptLine = {
  key: string;
  label: string;
  valueText: string;
  tone: 'base' | 'extra';
};

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rarityExtraCount(rarity?: string): number {
  const r = (rarity ?? 'WHITE').toUpperCase();
  // WHITE:0, BLUE:2, GREEN:3, YELLOW:4, MYTHIC:5 (cap 6 lines extra max)
  if (r === 'WHITE') return 0;
  if (r === 'BLUE') return 2;
  if (r === 'GREEN') return 3;
  if (r === 'YELLOW') return 4;
  if (r === 'MYTHIC') return 5;
  return 0;
}

function scaleBase(level: number, v1: number): number {
  // level 1 => v1, level 2 => v1*1.5, ... (round)
  const lv = Math.max(1, Math.floor(level || 1));
  return Math.round(v1 * 1.5 ** (lv - 1));
}

export function baseOptLines(kind: ItemKind, level: number): OptLine[] {
  const lv = Math.max(1, Math.floor(level || 1));
  if (kind === 'weapon') {
    const dmg = scaleBase(lv, 20);
    return [{ key: 'physicDamage', label: 'Physic damage', valueText: `+${dmg}`, tone: 'base' }];
  }
  if (kind === 'chest' || kind === 'head' || kind === 'legs' || kind === 'hands') {
    const def = scaleBase(lv, 10);
    return [{ key: 'defense', label: 'Defense', valueText: `+${def}`, tone: 'base' }];
  }
  if (kind === 'feet') {
    const def = scaleBase(lv, 10);
    return [
      { key: 'defense', label: 'Defense', valueText: `+${def}`, tone: 'base' },
      { key: 'moveSpeed', label: 'Move Speed', valueText: `+1`, tone: 'base' },
    ];
  }
  // ring/amulet: no base lines; potion/misc: none for now
  return [];
}

type ExtraKey =
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
  | 'fireResist'
  | 'coldResist'
  | 'lightningResist'
  | 'poisonResist';

const EXTRA_LABEL: Record<ExtraKey, string> = {
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
  fireResist: 'Fire resist',
  coldResist: 'Cold resist',
  lightningResist: 'Lightning resist',
  poisonResist: 'Poison resist',
};

function extraPool(kind: ItemKind): ExtraKey[] {
  if (kind === 'weapon') {
    return ['physicDamage', 'accuracy', 'attackSpeed', 'critRate', 'critDamage', 'magicDamage'];
  }
  if (kind === 'ring' || kind === 'amulet') {
    return [
      'accuracy',
      'attackSpeed',
      'moveSpeed',
      'maxHp',
      'maxMana',
      'critRate',
      'critDamage',
      'fireResist',
      'coldResist',
      'lightningResist',
      'poisonResist',
    ];
  }
  if (kind === 'feet') {
    return ['moveSpeed', 'evasion', 'defense', 'maxHp', 'critRate', 'fireResist', 'coldResist', 'lightningResist', 'poisonResist'];
  }
  // armor-ish default
  return ['defense', 'evasion', 'maxHp', 'accuracy', 'attackSpeed', 'fireResist', 'coldResist', 'lightningResist', 'poisonResist'];
}

function rollExtraValue(key: ExtraKey, level: number, rand: () => number): string {
  const lv = Math.max(1, Math.floor(level || 1));
  const r = rand();
  switch (key) {
    case 'accuracy':
      return `+${Math.round((2 + lv * 1.2) * (0.8 + r * 0.4))}`;
    case 'attackSpeed':
      return `+${Math.round((1 + lv * 0.6) * (0.8 + r * 0.4))}`;
    case 'moveSpeed':
      return `+${Math.max(1, Math.round((1 + lv * 0.2) * (0.7 + r * 0.6)))}`;
    case 'defense':
      return `+${Math.round((4 + lv * 1.4) * (0.8 + r * 0.4))}`;
    case 'evasion':
      return `+${Math.round((3 + lv * 1.2) * (0.8 + r * 0.4))}`;
    case 'maxHp':
      return `+${Math.round((12 + lv * 6) * (0.8 + r * 0.4))}`;
    case 'maxMana':
      return `+${Math.round((8 + lv * 5) * (0.8 + r * 0.4))}`;
    case 'physicDamage':
      return `+${Math.round((3 + lv * 1.6) * (0.8 + r * 0.4))}`;
    case 'magicDamage':
      return `+${Math.round((2 + lv * 1.4) * (0.8 + r * 0.4))}`;
    case 'critRate':
      return `+${Math.round((1 + lv * 0.35) * (0.8 + r * 0.4))}%`;
    case 'critDamage':
      return `+${Math.round((4 + lv * 1.2) * (0.8 + r * 0.4))}%`;
    case 'fireResist':
    case 'coldResist':
    case 'lightningResist':
    case 'poisonResist':
      return `+${Math.round((2 + lv * 0.5) * (0.8 + r * 0.4))}%`;
    default:
      return '+0';
  }
}

export function extraOptLines(item: UiItem): OptLine[] {
  const count = Math.min(6, rarityExtraCount(item.rarity));
  if (count <= 0) return [];
  const rand = mulberry32(hashString(item.id));
  const pool = extraPool(item.kind);
  const picked = new Set<ExtraKey>();
  const out: OptLine[] = [];
  for (let i = 0; i < count; i++) {
    let k: ExtraKey = pool[Math.floor(rand() * pool.length)]!;
    // avoid duplicates
    let guard = 0;
    while (picked.has(k) && guard++ < 12) k = pool[Math.floor(rand() * pool.length)]!;
    picked.add(k);
    out.push({
      key: k,
      label: EXTRA_LABEL[k],
      valueText: rollExtraValue(k, item.level ?? 1, rand),
      tone: 'extra',
    });
  }
  return out;
}

export function allOptLines(item: UiItem): OptLine[] {
  const base = baseOptLines(item.kind, item.level ?? 1);
  const extra = extraOptLines(item);
  // Cap total displayed lines to 6 extras + base. User requirement: cap extras to 6; base always shown.
  return [...base, ...extra];
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
  fireResistPct: number;
  coldResistPct: number;
  lightningResistPct: number;
  poisonResistPct: number;
}>;

function parseSignedNumber(text: string): number {
  const m = text.match(/[-+]?\d+/);
  return m ? Number(m[0]) : 0;
}

export function bonusesFromItem(item: UiItem): StatBonuses {
  const lines = allOptLines(item);
  const b: StatBonuses = {};
  for (const ln of lines) {
    const n = parseSignedNumber(ln.valueText);
    switch (ln.key) {
      case 'accuracy':
        b.accuracy = (b.accuracy ?? 0) + n;
        break;
      case 'attackSpeed':
        b.attackSpeed = (b.attackSpeed ?? 0) + n;
        break;
      case 'moveSpeed':
        b.moveSpeed = (b.moveSpeed ?? 0) + n;
        break;
      case 'defense':
        b.defense = (b.defense ?? 0) + n;
        break;
      case 'evasion':
        b.evasion = (b.evasion ?? 0) + n;
        break;
      case 'maxHp':
        b.maxHp = (b.maxHp ?? 0) + n;
        break;
      case 'maxMana':
        b.maxMana = (b.maxMana ?? 0) + n;
        break;
      case 'physicDamage':
        b.corePhysDamage = (b.corePhysDamage ?? 0) + n;
        break;
      case 'magicDamage':
        b.coreMagicDamage = (b.coreMagicDamage ?? 0) + n;
        break;
      case 'critRate':
        b.critRatePct = (b.critRatePct ?? 0) + n;
        break;
      case 'critDamage':
        b.critDamagePct = (b.critDamagePct ?? 0) + n;
        break;
      case 'fireResist':
        b.fireResistPct = (b.fireResistPct ?? 0) + n;
        break;
      case 'coldResist':
        b.coldResistPct = (b.coldResistPct ?? 0) + n;
        break;
      case 'lightningResist':
        b.lightningResistPct = (b.lightningResistPct ?? 0) + n;
        break;
      case 'poisonResist':
        b.poisonResistPct = (b.poisonResistPct ?? 0) + n;
        break;
      default:
        break;
    }
  }
  return b;
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
  return {
    id: it.id,
    name: it.definition.name,
    kind,
    icon: emojiForKind(kind),
    rarity: it.rarity,
    level: it.level,
  };
}

export function slotAccepts(slot: EquipmentSlot, item: UiItem): boolean {
  if (slot === 'weaponLeft' || slot === 'weaponRight') return item.kind === 'weapon';
  if (slot === 'ring') return item.kind === 'ring';
  if (slot === 'amulet') return item.kind === 'amulet';
  return item.kind === slot;
}

