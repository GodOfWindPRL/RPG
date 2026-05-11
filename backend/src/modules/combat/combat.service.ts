import type { InventoryItem, SkillDefinition } from '@prisma/client';
import { SkillDamageKind, SkillElement } from '@prisma/client';
import { prisma } from '../shared/prisma.js';
import { WORLD_MAP_HALF_SIZE } from '../shared/worldBounds.js';
import { getCharacterSkillLevel } from '../skill/skill.service.js';
import {
  computeAccuracy,
  computeCorePhysDamage,
  computeDefense,
  computeEvasion,
  computeActiveSetBonusTotals,
  computeEquippedCoreMagicDamage,
  type StatSource,
} from '../player/stats.js';
import { spellSkillFlatElementBonus, effectiveSpellManaCost } from '../content/skillScaling.js';

export interface ElementalTotals {
  fire: number;
  cold: number;
  lightning: number;
  poison: number;
}

export interface ElementalPctTotals {
  firePct: number;
  coldPct: number;
  lightningPct: number;
  poisonPct: number;
}

export interface DamageBundle {
  physic: number;
  elemental: ElementalTotals;
}

export interface EnemyState {
  id: string;
  type: string;
  name: string;
  hp: number;
  maxHp: number;
  physicAttack: number;
  exp: number;
  level: number;
  x: number;
  z: number;
  defense: number;
  evasion: number;
  accuracy: number;
  fireResist: number;
  coldResist: number;
  lightningResist: number;
  poisonResist: number;
  isBoss?: boolean;
  /** Server timestamp (ms) when hp first reached 0; used for corpse lifetime. */
  diedAt?: number;
  debuffs?: {
    burnUntil?: number;
    slowUntil?: number;
    poisonUntil?: number;
    shockUntil?: number;
    poisonDps?: number;
    nextPoisonTickAt?: number;
  };
}

const MOB_COUNT = 150;

/** Quái thường (base): boss scale riêng. */
const MOB_BASE = {
  maxHp: 200,
  defense: 10,
  evasion: 150,
  accuracy: 60,
  physicAttack: 100,
  fireResist: 0,
  coldResist: 0,
  lightningResist: 0,
  poisonResist: 0,
};

const DAMAGE_VARIANCE_PCT = 0.1; // +-10%
const DEFAULT_CRIT_RATE = 0.1; // player base
const DEFAULT_CRIT_MULT = 1.5; // 150%
const ENEMY_CRIT_RATE = 0; // mobs base

function rollVarianceMultiplier(): number {
  // Uniform 0.9..1.1
  return 1 + (Math.random() * 2 - 1) * DAMAGE_VARIANCE_PCT;
}

function rollCrit(critRate: number): boolean {
  if (!Number.isFinite(critRate) || critRate <= 0) return false;
  return Math.random() < Math.min(1, Math.max(0, critRate));
}

function applyVarianceAndCrit(total: number, critRate: number, critMult: number): { damage: number; didCrit: boolean } {
  const base = Math.max(0, total);
  const varied = Math.max(0, Math.round(base * rollVarianceMultiplier()));
  const didCrit = rollCrit(critRate);
  const mult = didCrit ? (Number.isFinite(critMult) && critMult > 1 ? critMult : DEFAULT_CRIT_MULT) : 1;
  const out = Math.max(0, Math.round(varied * mult));
  return { damage: out, didCrit };
}

function randomMobPosition(H: number): { x: number; z: number } {
  for (let attempt = 0; attempt < 40; attempt++) {
    const x = (Math.random() * 2 - 1) * H * 0.92;
    const z = (Math.random() * 2 - 1) * H * 0.92;
    if (Math.hypot(x, z) > 40) return { x, z };
  }
  return { x: H * 0.45, z: H * 0.12 };
}

export function makeDungeonEnemies(dungeonLevel: number): EnemyState[] {
  const H = WORLD_MAP_HALF_SIZE;
  const enemies: EnemyState[] = [];
  for (let i = 0; i < MOB_COUNT; i++) {
    const { x, z } = randomMobPosition(H);
    const isBoss = Math.random() < 0.1;
    const tier = 1 + dungeonLevel * 0.04 + (i % 5) * 0.02;
    const baseHp = Math.round(MOB_BASE.maxHp * tier);
    const hp = isBoss ? baseHp * 10 : baseHp;
    const baseAtk = Math.round(MOB_BASE.physicAttack * tier);
    const atk = isBoss ? Math.round(baseAtk * 2) : baseAtk;
    enemies.push({
      id: isBoss ? `boss_${i + 1}` : `mob_${i + 1}`,
      type: 'zombie',
      name: 'Zombie',
      hp,
      maxHp: hp,
      physicAttack: atk,
      exp: isBoss ? 250 : 25,
      level: dungeonLevel,
      defense: Math.round(MOB_BASE.defense * tier),
      evasion: Math.round(MOB_BASE.evasion * tier),
      accuracy: Math.round(MOB_BASE.accuracy * tier),
      fireResist: MOB_BASE.fireResist,
      coldResist: MOB_BASE.coldResist,
      lightningResist: MOB_BASE.lightningResist,
      poisonResist: MOB_BASE.poisonResist,
      x,
      z,
      isBoss: isBoss ? true : undefined,
    });
  }
  return enemies;
}

function emptyElemental(): ElementalTotals {
  return { fire: 0, cold: 0, lightning: 0, poison: 0 };
}

function addElement(target: ElementalTotals, el: SkillElement, amount: number) {
  if (amount <= 0) return;
  switch (el) {
    case SkillElement.FIRE:
      target.fire += amount;
      break;
    case SkillElement.COLD:
      target.cold += amount;
      break;
    case SkillElement.LIGHTNING:
      target.lightning += amount;
      break;
    case SkillElement.POISON:
      target.poison += amount;
      break;
    default:
      break;
  }
}

export function parseWeaponAffixes(
  items: InventoryItem[],
): { physic: number; elemental: ElementalTotals; elementalPct: ElementalPctTotals } {
  let physic = 0;
  const elemental = emptyElemental();
  const elementalPct: ElementalPctTotals = { firePct: 0, coldPct: 0, lightningPct: 0, poisonPct: 0 };
  for (const item of items.filter((it) => it.equipped)) {
    try {
      const o = JSON.parse(item.affixJson) as Record<string, number>;
      physic += o.physicDamage ?? o.power ?? 0;
      elemental.fire += o.fireDamage ?? 0;
      elemental.cold += o.coldDamage ?? 0;
      elemental.lightning += o.lightningDamage ?? 0;
      elemental.poison += o.poisonDamage ?? 0;
      elementalPct.firePct += o.fireDamagePct ?? 0;
      elementalPct.coldPct += o.coldDamagePct ?? 0;
      elementalPct.lightningPct += o.lightningDamagePct ?? 0;
      elementalPct.poisonPct += o.poisonDamagePct ?? 0;
    } catch {
      /* skip */
    }
  }
  return { physic, elemental, elementalPct };
}

/** Hit chance = min(1, Acc / Evasion). Evasion 0 → luôn trúng. */
export function hitChance(attackerAccuracy: number, defenderEvasion: number): number {
  if (defenderEvasion <= 0) return 1;
  return Math.min(1, attackerAccuracy / defenderEvasion);
}

/** Physic sau def: dmg * (1 - def/dmg), tối thiểu 0. */
export function physicDamageMitigated(grossPhysic: number, defense: number): number {
  if (grossPhysic <= 0) return 0;
  const factor = Math.max(0, 1 - defense / grossPhysic);
  return Math.max(0, Math.floor(grossPhysic * factor));
}

export function elementalAfterResist(amount: number, resistPercent: number): number {
  if (amount <= 0) return 0;
  return Math.max(0, Math.floor(amount * (1 - resistPercent / 100)));
}

export function totalDamageToTarget(
  bundle: DamageBundle,
  enemy: EnemyState,
  attackerAccuracy: number,
  opts?: { critRate?: number; critMult?: number; spellAlwaysHits?: boolean },
): {
  damage: number;
  missed: boolean;
  didCrit?: boolean;
  byElement?: { fire: number; cold: number; lightning: number; poison: number; physic: number };
} {
  const grossPhys = Number.isFinite(bundle.physic) ? Math.max(0, bundle.physic) : 0;
  const grossElemFire = Number.isFinite(bundle.elemental.fire) ? Math.max(0, bundle.elemental.fire) : 0;
  const grossElemCold = Number.isFinite(bundle.elemental.cold) ? Math.max(0, bundle.elemental.cold) : 0;
  const grossElemLightning = Number.isFinite(bundle.elemental.lightning) ? Math.max(0, bundle.elemental.lightning) : 0;
  const grossElemPoison = Number.isFinite(bundle.elemental.poison) ? Math.max(0, bundle.elemental.poison) : 0;
  const grossElem = grossElemFire + grossElemCold + grossElemLightning + grossElemPoison;
  if (grossPhys <= 0 && grossElem <= 0) return { damage: 0, missed: false };

  if (!opts?.spellAlwaysHits && Math.random() > hitChance(attackerAccuracy, enemy.evasion)) {
    return { damage: 0, missed: true };
  }

  const burnActive = (enemy.debuffs?.burnUntil ?? 0) > Date.now();
  const effFireRes = burnActive ? enemy.fireResist - 10 : enemy.fireResist;
  const phys = physicDamageMitigated(grossPhys, enemy.defense);
  const fire = elementalAfterResist(grossElemFire, effFireRes);
  const cold = elementalAfterResist(grossElemCold, enemy.coldResist);
  const lightning = elementalAfterResist(grossElemLightning, enemy.lightningResist);
  const poison = elementalAfterResist(grossElemPoison, enemy.poisonResist);
  let total = 0;
  total += phys;
  total += fire;
  total += cold;
  total += lightning;
  total += poison;
  // Defensive fallback: if hit connects and there is gross damage, at least chip 1 HP.
  if (total <= 0) total = 1;

  const { damage, didCrit } = applyVarianceAndCrit(total, opts?.critRate ?? DEFAULT_CRIT_RATE, opts?.critMult ?? DEFAULT_CRIT_MULT);
  // For debuffs we only need approximate per-element amounts (pre-variance/crit).
  return { damage: Math.max(1, damage), missed: false, didCrit, byElement: { fire, cold, lightning, poison, physic: phys } };
}

function buildBasicAttackBundle(c: StatSource, weaponPhys: number, weaponElem: ElementalTotals): DamageBundle {
  const core = computeCorePhysDamage(c);
  return {
    physic: core + weaponPhys,
    elemental: { ...weaponElem },
  };
}

function matchingWeaponElementAmount(el: SkillElement, weaponElem: ElementalTotals): number {
  switch (el) {
    case SkillElement.FIRE:
      return weaponElem.fire;
    case SkillElement.COLD:
      return weaponElem.cold;
    case SkillElement.LIGHTNING:
      return weaponElem.lightning;
    case SkillElement.POISON:
      return weaponElem.poison;
    default:
      return 0;
  }
}

function buildSkillBundle(
  c: StatSource,
  skill: SkillDefinition,
  weaponPhys: number,
  weaponElem: ElementalTotals,
  ctx: { inventoryItems: InventoryItem[]; skillLevel: number },
): DamageBundle {
  if (skill.damageKind === SkillDamageKind.PHYSIC) {
    const elem = { ...weaponElem };
    const core = computeCorePhysDamage(c);
    return {
      physic: core + weaponPhys + skill.baseDamage,
      elemental: elem,
    };
  }
  if (skill.damageKind === SkillDamageKind.SPELL) {
    const coreMagic = computeEquippedCoreMagicDamage(c, ctx.inventoryItems);
    const flat = spellSkillFlatElementBonus(skill.id, ctx.skillLevel);
    const fromWeapon = matchingWeaponElementAmount(skill.element, weaponElem);
    const pre = coreMagic + fromWeapon + flat;
    const outEl = emptyElemental();
    addElement(outEl, skill.element, pre);
    return { physic: 0, elemental: outEl };
  }
  return { physic: 0, elemental: emptyElemental() };
}

function skillAttackDamageMultiplier(skillId: string, learnedLevel: number): number {
  const lv = Math.max(1, Math.min(20, Math.floor(learnedLevel || 1)));
  if (skillId === 'slash') {
    // Slash: attack damage 100% at lv1; +5% per level.
    return 1 + (lv - 1) * 0.05;
  }
  return 1;
}

export async function calculateBasicAttack(characterId: string) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { inventoryItems: true },
  });
  if (!character) throw new Error('Character not found');
  const set = computeActiveSetBonusTotals(character.inventoryItems as any);
  const { physic, elemental, elementalPct } = parseWeaponAffixes(character.inventoryItems);
  const elemScaled = {
    fire: Math.round(elemental.fire * (1 + (elementalPct.firePct + set.elemPct.fire) / 100)),
    cold: Math.round(elemental.cold * (1 + (elementalPct.coldPct + set.elemPct.cold) / 100)),
    lightning: Math.round(elemental.lightning * (1 + (elementalPct.lightningPct + set.elemPct.lightning) / 100)),
    poison: Math.round(elemental.poison * (1 + (elementalPct.poisonPct + set.elemPct.poison) / 100)),
  };
  const bundle0 = buildBasicAttackBundle(character, physic, elemScaled);
  const bundle = {
    physic: Math.round(bundle0.physic * (1 + set.corePhysDamagePct / 100)),
    elemental: { ...bundle0.elemental },
  };
  const acc = Math.round(computeAccuracy(character) * (1 + set.accuracyPct / 100));
  return { bundle, accuracy: acc, critRatePctBonus: set.critRatePct, critDamagePctBonus: set.critDamagePct };
}

export async function calculateSkillDamage(characterId: string, skillId: string) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { inventoryItems: true },
  });
  const skill = await prisma.skillDefinition.findUnique({ where: { id: skillId } });
  if (!character || !skill) throw new Error('Invalid combat entities');
  const learnedLevel = await getCharacterSkillLevel(characterId, skillId);
  if (learnedLevel <= 0) throw new Error('Skill not learned');
  const spellMana =
    skill.damageKind === SkillDamageKind.SPELL ? effectiveSpellManaCost(skillId, learnedLevel) : 0;
  const manaCost =
    skill.damageKind === SkillDamageKind.SPELL ? Math.max(skill.manaCost, spellMana) : skill.manaCost;
  if (character.mana < manaCost) throw new Error('Not enough mana');

  const set = computeActiveSetBonusTotals(character.inventoryItems as any);
  const { physic, elemental, elementalPct } = parseWeaponAffixes(character.inventoryItems);
  const elemScaled = {
    fire: Math.round(elemental.fire * (1 + (elementalPct.firePct + set.elemPct.fire) / 100)),
    cold: Math.round(elemental.cold * (1 + (elementalPct.coldPct + set.elemPct.cold) / 100)),
    lightning: Math.round(elemental.lightning * (1 + (elementalPct.lightningPct + set.elemPct.lightning) / 100)),
    poison: Math.round(elemental.poison * (1 + (elementalPct.poisonPct + set.elemPct.poison) / 100)),
  };
  const bundle0 = buildSkillBundle(character, skill, physic, elemScaled, {
    inventoryItems: character.inventoryItems,
    skillLevel: learnedLevel,
  });
  const mul = skillAttackDamageMultiplier(skillId, learnedLevel);
  const bundle = {
    physic: Math.round(bundle0.physic * mul * (1 + set.corePhysDamagePct / 100)),
    elemental: {
      fire: Math.round(bundle0.elemental.fire * mul * (1 + set.elemPct.fire / 100)),
      cold: Math.round(bundle0.elemental.cold * mul * (1 + set.elemPct.cold / 100)),
      lightning: Math.round(bundle0.elemental.lightning * mul * (1 + set.elemPct.lightning / 100)),
      poison: Math.round(bundle0.elemental.poison * mul * (1 + set.elemPct.poison / 100)),
    },
  };
  const acc = Math.round(computeAccuracy(character) * (1 + set.accuracyPct / 100));
  const spellAlwaysHits = skill.damageKind === SkillDamageKind.SPELL;
  return {
    bundle,
    accuracy: acc,
    manaCost,
    cooldownMs: skill.cooldownMs,
    skill,
    critRatePctBonus: set.critRatePct,
    critDamagePctBonus: set.critDamagePct,
    spellAlwaysHits,
  };
}

/** Damage bundle only (no mana check). Used for slash sweep hits after mana was paid on slash start. */
export async function getSkillDamageBundleForCast(characterId: string, skillId: string) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { inventoryItems: true },
  });
  const skill = await prisma.skillDefinition.findUnique({ where: { id: skillId } });
  if (!character || !skill) throw new Error('Invalid combat entities');
  const learnedLevel = await getCharacterSkillLevel(characterId, skillId);
  if (learnedLevel <= 0) throw new Error('Skill not learned');

  const set = computeActiveSetBonusTotals(character.inventoryItems as any);
  const { physic, elemental, elementalPct } = parseWeaponAffixes(character.inventoryItems);
  const elemScaled = {
    fire: Math.round(elemental.fire * (1 + (elementalPct.firePct + set.elemPct.fire) / 100)),
    cold: Math.round(elemental.cold * (1 + (elementalPct.coldPct + set.elemPct.cold) / 100)),
    lightning: Math.round(elemental.lightning * (1 + (elementalPct.lightningPct + set.elemPct.lightning) / 100)),
    poison: Math.round(elemental.poison * (1 + (elementalPct.poisonPct + set.elemPct.poison) / 100)),
  };
  const bundle0 = buildSkillBundle(character, skill, physic, elemScaled, {
    inventoryItems: character.inventoryItems,
    skillLevel: learnedLevel,
  });
  const mul = skillAttackDamageMultiplier(skillId, learnedLevel);
  const bundle = {
    physic: Math.round(bundle0.physic * mul * (1 + set.corePhysDamagePct / 100)),
    elemental: {
      fire: Math.round(bundle0.elemental.fire * mul * (1 + set.elemPct.fire / 100)),
      cold: Math.round(bundle0.elemental.cold * mul * (1 + set.elemPct.cold / 100)),
      lightning: Math.round(bundle0.elemental.lightning * mul * (1 + set.elemPct.lightning / 100)),
      poison: Math.round(bundle0.elemental.poison * mul * (1 + set.elemPct.poison / 100)),
    },
  };
  const acc = Math.round(computeAccuracy(character) * (1 + set.accuracyPct / 100));
  const spellAlwaysHits = skill.damageKind === SkillDamageKind.SPELL;
  return { bundle, accuracy: acc, critRatePctBonus: set.critRatePct, critDamagePctBonus: set.critDamagePct, spellAlwaysHits };
}

/** Damage quái đánh nhân vật (chỉ physic từ quái). */
export function damageFromMobHit(
  mobPhysic: number,
  playerDefense: number,
  opts?: { critRate?: number; critMult?: number },
): { damage: number; didCrit: boolean } {
  const base = physicDamageMitigated(mobPhysic, playerDefense);
  const { damage, didCrit } = applyVarianceAndCrit(base, opts?.critRate ?? ENEMY_CRIT_RATE, opts?.critMult ?? DEFAULT_CRIT_MULT);
  return { damage: Math.max(1, damage), didCrit };
}
