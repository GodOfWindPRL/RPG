import type { InventoryItem, SkillDefinition } from '@prisma/client';
import { SkillDamageKind, SkillElement } from '@prisma/client';
import { prisma } from '../shared/prisma.js';
import { WORLD_MAP_HALF_SIZE } from '../shared/worldBounds.js';
import { getCharacterSkillLevel } from '../skill/skill.service.js';
import {
  computeAccuracy,
  computeCoreMagicDamage,
  computeCorePhysDamage,
  computeDefense,
  computeEvasion,
  type StatSource,
} from '../player/stats.js';

export interface ElementalTotals {
  fire: number;
  cold: number;
  lightning: number;
  poison: number;
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
}

const MOB_COUNT = 150;

/** Quái thường: 200 HP, 10 def/evasion/accuracy, 30 physic damage (boss scale riêng). */
const MOB_BASE = {
  maxHp: 200,
  defense: 10,
  evasion: 10,
  accuracy: 200,
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
    const isBoss = i === MOB_COUNT - 1;
    const tier = isBoss ? 1.8 : 1 + dungeonLevel * 0.04 + (i % 5) * 0.02;
    const hp = Math.round(MOB_BASE.maxHp * tier);
    enemies.push({
      id: isBoss ? 'boss_ember' : `mob_${i + 1}`,
      type: isBoss ? 'ember_lord' : 'wolf',
      name: isBoss ? 'Ember Lord' : `Ash Wolf ${i + 1}`,
      hp,
      maxHp: hp,
      physicAttack: Math.round(MOB_BASE.physicAttack * tier),
      exp: isBoss ? 400 : 25,
      level: isBoss ? dungeonLevel + 1 : dungeonLevel,
      defense: Math.round(MOB_BASE.defense * tier),
      evasion: Math.round(MOB_BASE.evasion * tier),
      accuracy: Math.round(MOB_BASE.accuracy * tier),
      fireResist: isBoss ? 35 : MOB_BASE.fireResist,
      coldResist: isBoss ? 15 : MOB_BASE.coldResist,
      lightningResist: isBoss ? 15 : MOB_BASE.lightningResist,
      poisonResist: isBoss ? 20 : MOB_BASE.poisonResist,
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

export function parseWeaponAffixes(items: InventoryItem[]): { physic: number; elemental: ElementalTotals } {
  let physic = 0;
  const elemental = emptyElemental();
  for (const item of items.filter((it) => it.equipped)) {
    try {
      const o = JSON.parse(item.affixJson) as Record<string, number>;
      physic += o.physicDamage ?? o.power ?? 0;
      elemental.fire += o.fireDamage ?? 0;
      elemental.cold += o.coldDamage ?? 0;
      elemental.lightning += o.lightningDamage ?? 0;
      elemental.poison += o.poisonDamage ?? 0;
    } catch {
      /* skip */
    }
  }
  return { physic, elemental };
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
  opts?: { critRate?: number; critMult?: number },
): {
  damage: number;
  missed: boolean;
  didCrit?: boolean;
} {
  const grossPhys = Number.isFinite(bundle.physic) ? Math.max(0, bundle.physic) : 0;
  const grossElemFire = Number.isFinite(bundle.elemental.fire) ? Math.max(0, bundle.elemental.fire) : 0;
  const grossElemCold = Number.isFinite(bundle.elemental.cold) ? Math.max(0, bundle.elemental.cold) : 0;
  const grossElemLightning = Number.isFinite(bundle.elemental.lightning) ? Math.max(0, bundle.elemental.lightning) : 0;
  const grossElemPoison = Number.isFinite(bundle.elemental.poison) ? Math.max(0, bundle.elemental.poison) : 0;
  const grossElem = grossElemFire + grossElemCold + grossElemLightning + grossElemPoison;
  if (grossPhys <= 0 && grossElem <= 0) return { damage: 0, missed: false };

  if (Math.random() > hitChance(attackerAccuracy, enemy.evasion)) {
    return { damage: 0, missed: true };
  }

  let total = 0;
  total += physicDamageMitigated(grossPhys, enemy.defense);
  total += elementalAfterResist(grossElemFire, enemy.fireResist);
  total += elementalAfterResist(grossElemCold, enemy.coldResist);
  total += elementalAfterResist(grossElemLightning, enemy.lightningResist);
  total += elementalAfterResist(grossElemPoison, enemy.poisonResist);
  // Defensive fallback: if hit connects and there is gross damage, at least chip 1 HP.
  if (total <= 0) total = 1;

  const { damage, didCrit } = applyVarianceAndCrit(total, opts?.critRate ?? DEFAULT_CRIT_RATE, opts?.critMult ?? DEFAULT_CRIT_MULT);
  return { damage: Math.max(1, damage), missed: false, didCrit };
}

function buildBasicAttackBundle(c: StatSource, weaponPhys: number, weaponElem: ElementalTotals): DamageBundle {
  const core = computeCorePhysDamage(c);
  return {
    physic: core + weaponPhys,
    elemental: { ...weaponElem },
  };
}

function buildSkillBundle(
  c: StatSource,
  skill: SkillDefinition,
  weaponPhys: number,
  weaponElem: ElementalTotals,
): DamageBundle {
  const elem = { ...weaponElem };
  if (skill.damageKind === SkillDamageKind.PHYSIC) {
    const core = computeCorePhysDamage(c);
    return {
      physic: core + weaponPhys + skill.baseDamage,
      elemental: elem,
    };
  }
  const coreM = computeCoreMagicDamage(c);
  const magTotal = coreM + skill.baseDamage;
  if (skill.element === SkillElement.NONE) {
    return { physic: weaponPhys + magTotal, elemental: elem };
  }
  addElement(elem, skill.element, magTotal);
  return { physic: weaponPhys, elemental: elem };
}

export async function calculateBasicAttack(characterId: string) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { inventoryItems: true },
  });
  if (!character) throw new Error('Character not found');
  const { physic, elemental } = parseWeaponAffixes(character.inventoryItems);
  const bundle = buildBasicAttackBundle(character, physic, elemental);
  const acc = computeAccuracy(character);
  return { bundle, accuracy: acc };
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
  if (character.mana < skill.manaCost) throw new Error('Not enough mana');

  const { physic, elemental } = parseWeaponAffixes(character.inventoryItems);
  const bundle = buildSkillBundle(character, skill, physic, elemental);
  const acc = computeAccuracy(character);
  return { bundle, accuracy: acc, manaCost: skill.manaCost, cooldownMs: skill.cooldownMs, skill };
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
