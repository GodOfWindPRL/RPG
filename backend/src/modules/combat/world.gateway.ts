import type { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verifyToken } from '../../middleware/auth.js';
import { prisma } from '../shared/prisma.js';
import {
  calculateBasicAttack,
  calculateSkillDamage,
  damageFromMobHit,
  getSkillDamageBundleForCast,
  hitChance,
  makeDungeonEnemies,
  totalDamageToTarget,
  scaleDamageBundle,
  type EnemyState,
} from './combat.service.js';
import { updateCharacterPosition } from '../player/player.service.js';
import {
  getCharacterLootLuckPercent,
  grantRolledItem,
  rollItem,
  rollPotionForMonsterLevel,
  POTION_HEAL_AMOUNT,
} from '../item/item.service.js';
import { progressCollectQuest, progressKillQuest } from '../quest/quest.service.js';
import { clampWorldXZ } from '../shared/worldBounds.js';
import { getForestObstacleCircles } from '../shared/forestObstacles.js';
import {
  ENEMY_COLLISION_RADIUS,
  PLAYER_COLLISION_RADIUS,
  xzPushOutFromCircles,
} from '../shared/xzCollision.js';
import {
  computeActiveSetBonusTotals,
  computeAttackSpeed,
  computeDefense,
  computeEvasion,
  computeMaxHp,
  computeMaxMana,
  sumEquippedAffixTotals,
} from '../player/stats.js';
import { applyExpGain, type CharacterProgressPayload } from '../player/leveling.service.js';
import { getCharacterSkillLevel } from '../skill/skill.service.js';
import { chainLightningMaxTargets } from '../content/skillScaling.js';
import { randomUUID } from 'crypto';

function splitArrowCount(level: number): number {
  const lv = Math.max(1, Math.min(20, Math.floor(level || 1)));
  if (lv >= 20) return 13;
  if (lv >= 15) return 11;
  if (lv >= 10) return 9;
  if (lv >= 5) return 7;
  return 5;
}

function splitArrowTotalAngleDeg(level: number): number {
  const lv = Math.max(1, Math.min(20, Math.floor(level || 1)));
  if (lv >= 20) return 60;
  if (lv >= 15) return 55;
  if (lv >= 10) return 50;
  if (lv >= 5) return 45;
  return 40;
}

interface PlayerSession {
  userId: string;
  characterId: string;
  x: number;
  y: number;
  z: number;
  hp: number;
  mana: number;
  level: number;
  str: number;
  agi: number;
  vit: number;
  mag: number;
  cooldowns: Record<string, number>;
  buffs?: { hasteUntil?: number; hastePct?: number };
  /** Active 3D slash sweep: one mana tick, many collision hits. */
  slashSwing?: { id: number; expiresAt: number; hitEnemyIds: Set<string> };
  nextRegenAt?: number;
  regenCarryHp?: number;
  regenCarryMp?: number;
}

function syncSessionProgress(characterId: string, p: CharacterProgressPayload) {
  for (const session of sessions.values()) {
    if (session.characterId === characterId) {
      session.hp = p.hp;
      session.mana = p.mana;
      session.level = p.level;
      session.str = p.str;
      session.agi = p.agi;
      session.vit = p.vit;
      session.mag = p.mag;
    }
  }
}

const sessions = new Map<string, PlayerSession>();
type EnemyAnim = 'idle' | 'walk' | 'attack' | 'death';
type EnemyNetState = EnemyState & { yaw?: number; anim?: EnemyAnim; animSeq?: number };

let worldEnemies: EnemyNetState[] = makeDungeonEnemies(1).map((e) => ({ ...e, yaw: 0, anim: 'idle', animSeq: 0 }));

type GroundLoot = {
  id: string;
  x: number;
  z: number;
  createdAt: number;
  roll: { definitionId: string; name: string; slot: string; level: number; rarity: string; affixJson: string };
};
let worldLoot: GroundLoot[] = [];

const AI_TICK_MS = 200;
// Keep basic behavior roughly proportional to the playable map scale (half map => half ranges).
const ENEMY_WANDER_HALF = 12.5; // 25x25 around home/spawn point
const ENEMY_AGGRO_HALF = 7.5; // 15x15 box around the enemy
const ENEMY_MELEE_RANGE = 1.9;
/** Treat as melee slightly beyond hard range to avoid chase dead-zones from tick quantization / desync. */
const ENEMY_MELEE_REACH = ENEMY_MELEE_RANGE + 0.28;
const ENEMY_WANDER_SPEED = 1.1; // units / sec (half speed)
const ENEMY_CHASE_SPEED = 2.0; // units / sec (half speed)
// Attack speed = 50 => 50/100 = 0.5 attacks/sec => 2s per attack.
const ENEMY_ATTACK_COOLDOWN_MS = 2000;
// Wind-up: delay from attack start animation to hit frame.
const ENEMY_ATTACK_HIT_DELAY_MS = 500;
const PLAYER_BASE_CRIT_RATE = 0.1;
const PLAYER_BASE_CRIT_MULT = 1.5;
const ENEMY_BASE_CRIT_RATE = 0;
const ENEMY_BASE_CRIT_MULT = 1.5;

type EnemyAi = {
  homeX: number;
  homeZ: number;
  targetX: number;
  targetZ: number;
  nextWanderPickAt: number;
  attackReadyAt: number;
  aggroCharacterId?: string;
  lastAggroSeenAt?: number;
  pendingHitAt?: number;
  pendingTargetId?: string;
};

let lastBroadcastAt = 0;
const enemyAi = new Map<string, EnemyAi>();

function applyElementalDebuffsToEnemy(
  enemy: EnemyState,
  byElement: { fire: number; cold: number; lightning: number; poison: number; physic: number },
  bundle: { elemental: { fire: number; cold: number; lightning: number; poison: number } },
  now: number,
) {
  // Only apply if attacker actually dealt some elemental component after resist.
  if (!enemy.debuffs) enemy.debuffs = {};

  if (byElement.fire > 0) {
    enemy.debuffs.burnUntil = Math.max(enemy.debuffs.burnUntil ?? 0, now + 3000);
  }
  if (byElement.cold > 0) {
    enemy.debuffs.slowUntil = Math.max(enemy.debuffs.slowUntil ?? 0, now + 2000);
  }
  if (byElement.lightning > 0) {
    enemy.debuffs.shockUntil = Math.max(enemy.debuffs.shockUntil ?? 0, now + 5000);
  }
  if (byElement.poison > 0 || bundle.elemental.poison > 0) {
    // DPS uses attacker's poison component (roughly per-hit poison after resist).
    const dps = Math.max(1, Math.round(byElement.poison > 0 ? byElement.poison : bundle.elemental.poison));
    enemy.debuffs.poisonDps = Math.max(enemy.debuffs.poisonDps ?? 0, dps);
    enemy.debuffs.poisonUntil = Math.max(enemy.debuffs.poisonUntil ?? 0, now + 5000);
    enemy.debuffs.nextPoisonTickAt = enemy.debuffs.nextPoisonTickAt ?? now + 1000;
  }
}

function clampToHome(v: number, home: number) {
  const clamped = Math.max(home - ENEMY_WANDER_HALF, Math.min(home + ENEMY_WANDER_HALF, v));
  return clampWorldXZ(clamped);
}

const CORPSE_VISIBLE_MS = 3000;
const LOOT_VISIBLE_MS = 60000;
// Spec: allow pickup within ~8×8 square around player -> radius ≈ 4.
const LOOT_PICKUP_RANGE = 4.0;
const INVENTORY_CAPACITY = 60;

function markEnemyDead(enemy: EnemyNetState, now: number) {
  if (enemy.hp > 0) return;
  enemy.diedAt = enemy.diedAt ?? now;
  enemy.anim = 'death';
  enemy.animSeq = (enemy.animSeq ?? 0) + 1;
}

function aliveSessions(): PlayerSession[] {
  return Array.from(sessions.values()).filter((s) => s.hp > 0);
}

function resolvePlayerSessionXZ(characterId: string, x: number, z: number): { x: number; z: number } {
  const forest = getForestObstacleCircles();
  const enemyCs = worldEnemies
    .filter((e) => e.hp > 0)
    .map((e) => ({ x: e.x, z: e.z, r: ENEMY_COLLISION_RADIUS }));
  const otherPlayers = Array.from(sessions.values())
    .filter((s) => s.characterId !== characterId && s.hp > 0)
    .map((s) => ({ x: s.x, z: s.z, r: PLAYER_COLLISION_RADIUS }));
  return xzPushOutFromCircles(clampWorldXZ(x), clampWorldXZ(z), PLAYER_COLLISION_RADIUS, [
    ...forest,
    ...enemyCs,
    ...otherPlayers,
  ]);
}

function resolveEnemyXZ(enemyId: string, x: number, z: number): { x: number; z: number } {
  const forest = getForestObstacleCircles();
  const playerCs = aliveSessions().map((s) => ({ x: s.x, z: s.z, r: PLAYER_COLLISION_RADIUS }));
  const otherEnemies = worldEnemies
    .filter((o) => o.id !== enemyId && o.hp > 0)
    .map((o) => ({ x: o.x, z: o.z, r: ENEMY_COLLISION_RADIUS }));
  return xzPushOutFromCircles(clampWorldXZ(x), clampWorldXZ(z), ENEMY_COLLISION_RADIUS, [
    ...forest,
    ...playerCs,
    ...otherEnemies,
  ]);
}

function ensureEnemyAi() {
  for (const e of worldEnemies) {
    if (enemyAi.has(e.id)) continue;
    enemyAi.set(e.id, {
      homeX: e.x,
      homeZ: e.z,
      targetX: e.x,
      targetZ: e.z,
      nextWanderPickAt: 0,
      attackReadyAt: 0,
      aggroCharacterId: undefined,
      lastAggroSeenAt: undefined,
      pendingHitAt: undefined,
      pendingTargetId: undefined,
    });
  }
}

async function getRegenFromEquipped(characterId: string): Promise<{ hpFlat: number; hpPct: number; mpFlat: number; mpPct: number }> {
  // Read from the same authoritative source as withComputedStats, so the value
  // shown on CharacterSheet is exactly what regen uses each tick.
  const items = await prisma.inventoryItem.findMany({
    where: { characterId, equipped: true },
    select: { affixJson: true },
  });
  const totals = sumEquippedAffixTotals(items.map((it) => ({ equipped: true, affixJson: it.affixJson })));
  return {
    hpFlat: totals.hpRegen,
    hpPct: totals.hpRegenPct,
    mpFlat: totals.manaRegen,
    mpPct: totals.manaRegenPct,
  };
}

async function aiTick(io: Server) {
  ensureEnemyAi();
  const now = Date.now();
  const dt = AI_TICK_MS / 1000;
  const AGGRO_DROP_MS = 2500;

  // Player regen tick (per 1s).
  for (const session of sessions.values()) {
    if (session.hp <= 0) continue;
    if ((session.nextRegenAt ?? 0) === 0) session.nextRegenAt = now + 1000;
    if ((session.nextRegenAt ?? 0) > now) continue;
    session.nextRegenAt = now + 1000;
    const src = { level: session.level, str: session.str, agi: session.agi, vit: session.vit, mag: session.mag };
    const maxHp = computeMaxHp(src);
    const maxMana = computeMaxMana(src);
    const r = await getRegenFromEquipped(session.characterId);
    // Base regen (spec):
    // - HP: base 5, +1 per level
    // - MP: base 2, +0.5 per level
    const lv = Math.max(1, session.level || 1);
    const baseHpRegen = 5 + (lv - 1) * 1;
    const baseMpRegen = 2 + (lv - 1) * 0.5;
    const hpGain = baseHpRegen + (r.hpFlat ?? 0) + (maxHp * (r.hpPct ?? 0)) / 100;
    const mpGain = baseMpRegen + (r.mpFlat ?? 0) + (maxMana * (r.mpPct ?? 0)) / 100;
    const carryHp = (session.regenCarryHp ?? 0) + (Number.isFinite(hpGain) ? hpGain : 0);
    const carryMp = (session.regenCarryMp ?? 0) + (Number.isFinite(mpGain) ? mpGain : 0);
    const addHp = Math.max(0, Math.floor(carryHp));
    const addMp = Math.max(0, Math.floor(carryMp));
    session.regenCarryHp = carryHp - addHp;
    session.regenCarryMp = carryMp - addMp;
    const nextHp = Math.min(maxHp, Math.max(0, session.hp + addHp));
    const nextMp = Math.min(maxMana, Math.max(0, session.mana + addMp));
    if (nextHp !== session.hp || nextMp !== session.mana) {
      session.hp = nextHp;
      session.mana = nextMp;
      await prisma.character.update({ where: { id: session.characterId }, data: { hp: nextHp, mana: nextMp } });
      io.to(session.characterId).emit('player:regen', { hp: nextHp, mana: nextMp, maxHp, maxMana });
    }
  }

  worldEnemies = worldEnemies.filter((e) => {
    if (e.hp > 0) return true;
    if (e.diedAt == null) return true;
    return now - e.diedAt < CORPSE_VISIBLE_MS;
  });
  // Despawn expired ground loot and notify clients.
  const expiredIds: string[] = [];
  worldLoot = worldLoot.filter((l) => {
    const alive = now - l.createdAt < LOOT_VISIBLE_MS;
    if (!alive) expiredIds.push(l.id);
    return alive;
  });
  for (const id of expiredIds) {
    io.emit('loot:despawned', { lootId: id });
  }

  const aliveIds = new Set(worldEnemies.map((e) => e.id));
  for (const id of enemyAi.keys()) {
    if (!aliveIds.has(id)) enemyAi.delete(id);
  }

  const livingCount = worldEnemies.filter((e) => e.hp > 0).length;
  if (livingCount === 0 && worldEnemies.length === 0) {
    worldEnemies = makeDungeonEnemies(1).map((e) => ({ ...e, yaw: 0, anim: 'idle', animSeq: 0 }));
    enemyAi.clear();
    ensureEnemyAi();
    io.emit('world:snapshot', { enemies: worldEnemies });
  }

  for (const [, ai] of enemyAi) {
    if (!ai.aggroCharacterId) continue;
    const tgt = Array.from(sessions.values()).find((s) => s.characterId === ai.aggroCharacterId);
    if (!tgt || tgt.hp <= 0) {
      ai.aggroCharacterId = undefined;
      ai.lastAggroSeenAt = undefined;
      ai.nextWanderPickAt = 0;
    }
  }

  for (const enemy of worldEnemies.filter((it) => it.hp > 0)) {
    const ai = enemyAi.get(enemy.id);
    if (!ai) continue;

    // Debuff ticking (poison) + expiry cleanup.
    if (enemy.debuffs) {
      if ((enemy.debuffs.poisonUntil ?? 0) <= now) {
        enemy.debuffs.poisonUntil = undefined;
        enemy.debuffs.poisonDps = undefined;
        enemy.debuffs.nextPoisonTickAt = undefined;
      } else if ((enemy.debuffs.nextPoisonTickAt ?? 0) <= now && (enemy.debuffs.poisonDps ?? 0) > 0) {
        const dmg = Math.max(1, Math.round(enemy.debuffs.poisonDps ?? 0));
        enemy.hp = Math.max(0, enemy.hp - dmg);
        enemy.debuffs.nextPoisonTickAt = now + 1000;
        if (enemy.hp <= 0) markEnemyDead(enemy, now);
        io.emit('combat:resolved', {
          enemyId: enemy.id,
          enemyHp: enemy.hp,
          damage: dmg,
          didCrit: false,
          skillId: 'poison',
          missed: false,
          diedAt: enemy.diedAt,
        });
      }
      if ((enemy.debuffs.burnUntil ?? 0) <= now) enemy.debuffs.burnUntil = undefined;
      if ((enemy.debuffs.slowUntil ?? 0) <= now) enemy.debuffs.slowUntil = undefined;
      if ((enemy.debuffs.shockUntil ?? 0) <= now) enemy.debuffs.shockUntil = undefined;
      // Drop object if empty to keep snapshots smaller.
      if (
        !enemy.debuffs.burnUntil &&
        !enemy.debuffs.slowUntil &&
        !enemy.debuffs.poisonUntil &&
        !enemy.debuffs.shockUntil
      ) {
        enemy.debuffs = undefined;
      }
    }

    // Resolve delayed melee hit if any.
    if (ai.pendingHitAt != null && now >= ai.pendingHitAt) {
      const targetId = ai.pendingTargetId;
      ai.pendingHitAt = undefined;
      ai.pendingTargetId = undefined;

      if (targetId) {
        const target = Array.from(sessions.values()).find((s) => s.characterId === targetId);
        if (target && target.hp > 0 && enemy.hp > 0) {
          const dx = target.x - enemy.x;
          const dz = target.z - enemy.z;
          const dist = Math.hypot(dx, dz);

          const src: Pick<PlayerSession, 'level' | 'str' | 'agi' | 'vit' | 'mag'> = {
            level: target.level,
            str: target.str,
            agi: target.agi,
            vit: target.vit,
            mag: target.mag,
          };
          const pDef = computeDefense(src);
          const pEva = computeEvasion(src);

          if (dist <= ENEMY_MELEE_REACH) {
            const landed = Math.random() <= hitChance(enemy.accuracy, pEva);
            const dealt = landed
              ? damageFromMobHit(enemy.physicAttack, pDef, {
                  critRate: ENEMY_BASE_CRIT_RATE,
                  critMult: ENEMY_BASE_CRIT_MULT,
                })
              : { damage: 0, didCrit: false };
            if (landed) target.hp = Math.max(0, target.hp - dealt.damage);
            io.to(target.characterId).emit('combat:damageTaken', {
              hp: target.hp,
              maxHp: computeMaxHp(src),
              damage: dealt.damage,
              didCrit: dealt.didCrit,
              missed: !landed,
              source: enemy.id,
            });
          } else {
            // Out of range at hit frame: treat as miss (no damage).
            io.to(target.characterId).emit('combat:damageTaken', {
              hp: target.hp,
              maxHp: computeMaxHp(src),
              damage: 0,
              didCrit: false,
              missed: true,
              source: enemy.id,
            });
          }
        }
      }
    }

    const live = aliveSessions();
    const nearest =
      ai.aggroCharacterId && live.some((s) => s.characterId === ai.aggroCharacterId)
        ? live.find((s) => s.characterId === ai.aggroCharacterId)
        : live.sort((a, b) => {
            const da = (enemy.x - a.x) ** 2 + (enemy.z - a.z) ** 2;
            const db = (enemy.x - b.x) ** 2 + (enemy.z - b.z) ** 2;
            return da - db;
          })[0];
    if (!nearest && ai.aggroCharacterId) ai.aggroCharacterId = undefined;

    let moved = false;

    if (nearest) {
      const dx = nearest.x - enemy.x;
      const dz = nearest.z - enemy.z;
      const inAggroBox = Math.abs(dx) <= ENEMY_AGGRO_HALF && Math.abs(dz) <= ENEMY_AGGRO_HALF;
      const dist = Math.hypot(dx, dz);

      if (inAggroBox) {
        ai.aggroCharacterId = nearest.characterId;
        ai.lastAggroSeenAt = now;
        // Chase + melee.
        const slowed = (enemy.debuffs?.slowUntil ?? 0) > now;
        const slowMult = slowed ? 0.5 : 1;
        if (dist > ENEMY_MELEE_REACH) {
          const len = dist || 1;
          const gap = Math.max(0, dist - ENEMY_MELEE_RANGE);
          // Ensure we always make progress when we're "almost" in range (avoids step=0 sticky states).
          const rawStep = Math.min(ENEMY_CHASE_SPEED * slowMult * dt, gap);
          const step = gap > 0 ? Math.max(rawStep, Math.min(gap, 0.06)) : 0;
          const nx = dx / len;
          const nz = dz / len;
          // While aggro'd, chase across the world map (leash only applies to wander).
          const chaseX = clampWorldXZ(enemy.x + nx * step);
          const chaseZ = clampWorldXZ(enemy.z + nz * step);
          const rp = resolveEnemyXZ(enemy.id, chaseX, chaseZ);
          enemy.x = rp.x;
          enemy.z = rp.z;
          enemy.yaw = Math.atan2(nx, nz);
          moved = step > 0.0001;
        } else {
          // In melee range: face the player. If attack is on cooldown, don't freeze the whole AI.
          const len = dist || 1;
          const nx = dx / len;
          const nz = dz / len;
          enemy.yaw = Math.atan2(nx, nz);

          // If we're already winding up a hit, don't re-trigger.
          if (ai.pendingHitAt == null && now >= ai.attackReadyAt) {
            ai.attackReadyAt = now + Math.round(ENEMY_ATTACK_COOLDOWN_MS / slowMult);
            enemy.anim = 'attack';
            enemy.animSeq = (enemy.animSeq ?? 0) + 1;
            ai.aggroCharacterId = nearest.characterId;
            ai.lastAggroSeenAt = now;
            ai.pendingTargetId = nearest.characterId;
            ai.pendingHitAt = now + ENEMY_ATTACK_HIT_DELAY_MS;
          }
        }
      } else if (ai.aggroCharacterId && ai.aggroCharacterId === nearest.characterId) {
        // Player left aggro area: drop aggro after a short grace window.
        if (now - (ai.lastAggroSeenAt ?? now) > AGGRO_DROP_MS) {
          ai.aggroCharacterId = undefined;
          ai.lastAggroSeenAt = undefined;
          ai.nextWanderPickAt = 0;
          ai.pendingHitAt = undefined;
          ai.pendingTargetId = undefined;
        }
      }
    }

    if (!moved && !ai.aggroCharacterId) {
      // Wander within 50x50.
      if (now >= ai.nextWanderPickAt || Math.hypot(enemy.x - ai.targetX, enemy.z - ai.targetZ) < 0.6) {
        ai.nextWanderPickAt = now + 1200 + Math.floor(Math.random() * 2200);
        ai.targetX = clampToHome(ai.homeX + (Math.random() * 2 - 1) * ENEMY_WANDER_HALF, ai.homeX);
        ai.targetZ = clampToHome(ai.homeZ + (Math.random() * 2 - 1) * ENEMY_WANDER_HALF, ai.homeZ);
      }
      const dx = ai.targetX - enemy.x;
      const dz = ai.targetZ - enemy.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.001) {
        const slowed = (enemy.debuffs?.slowUntil ?? 0) > now;
        const slowMult = slowed ? 0.5 : 1;
        const step = Math.min(ENEMY_WANDER_SPEED * slowMult * dt, dist);
        const nx = dx / dist;
        const nz = dz / dist;
        const wx = clampToHome(enemy.x + nx * step, ai.homeX);
        const wz = clampToHome(enemy.z + nz * step, ai.homeZ);
        const wp = resolveEnemyXZ(enemy.id, wx, wz);
        enemy.x = clampToHome(wp.x, ai.homeX);
        enemy.z = clampToHome(wp.z, ai.homeZ);
        enemy.yaw = Math.atan2(nx, nz);
        moved = step > 0.0001;
      }
    }

    // Decide animation (attack is edge-triggered by animSeq).
    if (enemy.anim !== 'attack') {
      enemy.anim = moved ? 'walk' : 'idle';
    } else if (moved) {
      // If we moved, don't lock the enemy in attack for too long.
      enemy.anim = 'walk';
    }
  }

  // Broadcast positions at a steady rate (match AI tick to reduce client stutter).
  if (now - lastBroadcastAt >= AI_TICK_MS) {
    lastBroadcastAt = now;
    io.emit('world:snapshot', { enemies: worldEnemies });
  }
}



async function applyEnemyDefeatRewards(io: Server, session: PlayerSession, enemy: EnemyState) {
  await progressKillQuest(session.characterId, enemy.type);
  const progress = await applyExpGain(session.characterId, enemy.exp);
  if (progress) {
    syncSessionProgress(session.characterId, progress);
    io.to(session.characterId).emit('character:progress', progress);
  }
  // Loot rules:
  // - Normal mob: 20% chance to drop 1 item.
  // - Boss: always drops 5-10 items.
  const isBoss = enemy.isBoss === true;
  const dropCount = isBoss ? 5 + Math.floor(Math.random() * 6) : 1;
  if (!isBoss && Math.random() > 0.2) return;

  const luckPercent = await getCharacterLootLuckPercent(session.characterId);
  for (let i = 0; i < dropCount; i++) {
    // This map: keep drops at low level (1-2) regardless of character level.
    const dropLevel = 1 + Math.floor(Math.random() * 2);
    const roll = await rollItem(dropLevel, {
      rarityBoost: 0,
      luckPercent,
    });
    if (!roll) continue;
    // Slight random offset around death position.
    const ang = Math.random() * Math.PI * 2;
    const rad = 0.4 + Math.random() * 1.0;
    const x = clampWorldXZ(enemy.x + Math.cos(ang) * rad);
    const z = clampWorldXZ(enemy.z + Math.sin(ang) * rad);
    const id = randomUUID();
    const loot: GroundLoot = {
      id,
      x,
      z,
      createdAt: Date.now(),
      roll: {
        definitionId: roll.definition.id,
        name: roll.definition.name,
        slot: roll.definition.slot,
        level: roll.level,
        rarity: roll.rarity,
        affixJson: roll.affixJson,
      },
    };
    worldLoot.push(loot);
    io.to(session.characterId).emit('loot:spawned', { loot });
  }

  // ─── Potion drop (independent of regular gear) ────────────────────────
  // Both normal mobs and bosses can drop potions. Tier scales with monster
  // level: lv1+ => tier1, lv20+ => tier2, lv40+ => tier3, lv60+ => tier4,
  // lv80+ => tier5. 50/50 split between HP and MP.
  const POTION_DROP_CHANCE_NORMAL = 0.45;
  const POTION_DROP_CHANCE_BOSS = 1.0;
  const potionDropChance = isBoss ? POTION_DROP_CHANCE_BOSS : POTION_DROP_CHANCE_NORMAL;
  const potionDrops = isBoss ? 2 + Math.floor(Math.random() * 3) : 1;
  for (let i = 0; i < potionDrops; i++) {
    if (Math.random() > potionDropChance) continue;
    const potion = await rollPotionForMonsterLevel(enemy.level || 1);
    if (!potion) continue;
    const ang = Math.random() * Math.PI * 2;
    const rad = 0.4 + Math.random() * 1.0;
    const x = clampWorldXZ(enemy.x + Math.cos(ang) * rad);
    const z = clampWorldXZ(enemy.z + Math.sin(ang) * rad);
    const id = randomUUID();
    const loot: GroundLoot = {
      id,
      x,
      z,
      createdAt: Date.now(),
      roll: {
        definitionId: potion.definition.id,
        name: potion.definition.name,
        slot: potion.definition.slot,
        level: potion.level,
        rarity: potion.definition.rarity,
        affixJson: '{}',
      },
    };
    worldLoot.push(loot);
    io.to(session.characterId).emit('loot:spawned', { loot });
  }
}

export function attachRpgSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: { origin: true },
    path: '/rpg-socket.io',
  });

  io.on('connection', async (socket: Socket) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      socket.disconnect();
      return;
    }
    const decoded = verifyToken(token);
    if (!decoded) {
      socket.disconnect();
      return;
    }

    socket.on('player:join', async ({ characterId }: { characterId: string }) => {
      const character = await prisma.character.findFirst({
        where: { id: characterId, userId: decoded.userId },
      });
      if (!character) {
        socket.emit('error:game', { message: 'character not found' });
        return;
      }
      socket.join(characterId);
      sessions.set(socket.id, {
        userId: decoded.userId,
        characterId,
        x: clampWorldXZ(character.posX),
        y: character.posY,
        z: clampWorldXZ(character.posZ),
        hp: character.hp,
        mana: character.mana,
        level: character.level,
        str: character.str,
        agi: character.agi,
        vit: character.vit,
        mag: character.mag,
        cooldowns: {},
      });
      // Ensure enemies exist as soon as the first player joins (helps after hot-reloads).
      if (!worldEnemies || worldEnemies.length === 0) {
        worldEnemies = makeDungeonEnemies(1).map((e) => ({ ...e, yaw: 0, anim: 'idle', animSeq: 0 }));
        enemyAi.clear();
        ensureEnemyAi();
      }
      socket.emit('world:snapshot', {
        you: sessions.get(socket.id),
        enemies: worldEnemies,
      });

      if (worldLoot.length > 0) {
        socket.emit('loot:snapshot', { loots: worldLoot });
      }
    });

    socket.on('loot:pickup', async ({ lootId }: { lootId: string }) => {
      const session = sessions.get(socket.id);
      if (!session || session.hp <= 0) return;
      const idx = worldLoot.findIndex((l) => l.id === lootId);
      if (idx < 0) return;
      const loot = worldLoot[idx]!;
      const dist = Math.hypot(session.x - loot.x, session.z - loot.z);
      if (dist > LOOT_PICKUP_RANGE) return;

      const invCount = await prisma.inventoryItem.count({ where: { characterId: session.characterId } });
      if (invCount >= INVENTORY_CAPACITY) {
        socket.emit('inventory:full', { message: 'Inventory full' });
        return;
      }

      const def = await prisma.itemDefinition.findUnique({ where: { id: loot.roll.definitionId } });
      const isPotion = Boolean(def?.slot?.toLowerCase().startsWith('potion_'));
      const MAX_STACK = 100;
      let created = null as any;
      if (isPotion) {
        const existing = await prisma.inventoryItem.findFirst({
          where: {
            characterId: session.characterId,
            definitionId: loot.roll.definitionId,
            equipped: false,
            quantity: { lt: MAX_STACK },
          },
          orderBy: { createdAt: 'asc' },
          include: { definition: true },
        });
        if (existing) {
          created = await prisma.inventoryItem.update({
            where: { id: existing.id },
            data: { quantity: Math.min(MAX_STACK, (existing.quantity ?? 1) + 1) },
            include: { definition: true },
          });
        } else {
          created = await prisma.inventoryItem.create({
            data: {
              characterId: session.characterId,
              definitionId: loot.roll.definitionId,
              level: loot.roll.level,
              rarity: loot.roll.rarity as any,
              affixJson: loot.roll.affixJson,
              quantity: 1,
            },
            include: { definition: true },
          });
        }
      } else {
        created = await prisma.inventoryItem.create({
          data: {
            characterId: session.characterId,
            definitionId: loot.roll.definitionId,
            level: loot.roll.level,
            rarity: loot.roll.rarity as any,
            affixJson: loot.roll.affixJson,
            quantity: 1,
          },
          include: { definition: true },
        });
      }

      await progressCollectQuest(session.characterId, created.rarity);

      worldLoot.splice(idx, 1);
      io.to(session.characterId).emit('loot:despawned', { lootId });
      socket.emit('loot:pickedUp', { item: created });
    });

    socket.on('item:delete', async ({ itemId }: { itemId: string }) => {
      const session = sessions.get(socket.id);
      if (!session) return;
      try {
        const res = await prisma.inventoryItem.deleteMany({
          where: { id: itemId, characterId: session.characterId },
        });
        if (res.count > 0) socket.emit('item:deleted', { itemId });
        else socket.emit('item:deleteFailed', { itemId });
      } catch {
        socket.emit('item:deleteFailed', { itemId });
      }
    });

    socket.on('item:use', async ({ itemId }: { itemId: string }) => {
      const session = sessions.get(socket.id);
      if (!session || session.hp <= 0) return;
      const item = await prisma.inventoryItem.findFirst({
        where: { id: itemId, characterId: session.characterId },
        include: { definition: true },
      });
      if (!item) {
        socket.emit('item:useFailed', { itemId, reason: 'not-found' });
        return;
      }
      const heal = POTION_HEAL_AMOUNT[item.definitionId];
      if (!heal) {
        socket.emit('item:useFailed', { itemId, reason: 'not-consumable' });
        return;
      }
      const src = {
        level: session.level,
        str: session.str,
        agi: session.agi,
        vit: session.vit,
        mag: session.mag,
      };
      const maxHp = computeMaxHp(src);
      const maxMana = computeMaxMana(src);
      const nextHp = Math.min(maxHp, session.hp + (heal.hp ?? 0));
      const nextMana = Math.min(maxMana, session.mana + (heal.mp ?? 0));

      try {
        await prisma.$transaction(async (tx) => {
          const cur = await tx.inventoryItem.findUnique({ where: { id: itemId } });
          if (!cur || cur.characterId !== session.characterId) throw new Error('not-found');
          const q = Math.max(0, cur.quantity ?? 1);
          if (q <= 1) {
            await tx.inventoryItem.delete({ where: { id: itemId } });
          } else {
            await tx.inventoryItem.update({ where: { id: itemId }, data: { quantity: q - 1 } });
          }
          await tx.character.update({
            where: { id: session.characterId },
            data: { hp: nextHp, mana: nextMana },
          });
        });
      } catch {
        socket.emit('item:useFailed', { itemId, reason: 'db-error' });
        return;
      }

      session.hp = nextHp;
      session.mana = nextMana;
      socket.emit('item:used', {
        itemId,
        remainingQuantity: item.quantity > 1 ? (item.quantity - 1) : 0,
        hp: nextHp,
        mana: nextMana,
        maxHp,
        maxMana,
        healedHp: Math.max(0, heal.hp ?? 0),
        healedMp: Math.max(0, heal.mp ?? 0),
      });
    });

    socket.on('player:move', async ({ x, y, z }: { x: number; y: number; z: number }) => {
      const session = sessions.get(socket.id);
      if (!session || session.hp <= 0) return;
      const p = resolvePlayerSessionXZ(session.characterId, x, z);
      session.x = p.x;
      session.y = y;
      session.z = p.z;
      await updateCharacterPosition(session.characterId, session.x, session.y, session.z);
      socket.to(session.characterId).emit('player:moved', { characterId: session.characterId, x, y, z });
    });

    socket.on('player:refreshRegen', () => {
      const session = sessions.get(socket.id);
      if (!session) return;
      session.nextRegenAt = 0;
      session.regenCarryHp = 0;
      session.regenCarryMp = 0;
    });

    socket.on('player:revive', async () => {
      const session = sessions.get(socket.id);
      if (!session) return;
      if (session.hp > 0) return;

      const src = {
        level: session.level,
        str: session.str,
        agi: session.agi,
        vit: session.vit,
        mag: session.mag,
      };
      const maxHp = computeMaxHp(src);
      const maxMana = computeMaxMana(src);
      session.hp = maxHp;
      session.mana = maxMana;
      session.x = 0;
      session.z = 0;

      await prisma.character.update({
        where: { id: session.characterId },
        data: {
          hp: maxHp,
          mana: maxMana,
          posX: 0,
          posZ: 0,
        },
      });

      socket.emit('player:revived', {
        hp: maxHp,
        maxHp,
        mana: maxMana,
        maxMana,
        posX: 0,
        posY: session.y,
        posZ: 0,
      });
    });

    socket.on('combat:attack', async ({ enemyId }: { enemyId: string }) => {
      const session = sessions.get(socket.id);
      if (!session || session.hp <= 0) return;
      const anchor = worldEnemies.find((it) => it.id === enemyId && it.hp > 0);
      if (!anchor) return;

      const faceXRaw = anchor.x - session.x;
      const faceZRaw = anchor.z - session.z;
      const faceLen = Math.hypot(faceXRaw, faceZRaw) || 1;
      const faceX = faceXRaw / faceLen;
      const faceZ = faceZRaw / faceLen;
      /** Đồng bộ `SLASH_EFFECT_RANGE` trên frontend (`frontend/src/core/combatConstants.ts`). */
      const SLASH_RANGE = 4.2;

      const targets = worldEnemies.filter((it) => {
        if (it.hp <= 0) return false;
        // Always include locked target to avoid whiff caused by tiny client/server position desync.
        if (it.id === anchor.id) return true;

        const dx = it.x - session.x;
        const dz = it.z - session.z;
        const d = Math.hypot(dx, dz);
        if (d > SLASH_RANGE || d < 0.001) return false;
        const nx = dx / d;
        const nz = dz / d;
        const dot = nx * faceX + nz * faceZ;
        return dot >= 0; // 180° cone in front.
      });

      if (targets.length === 0) return;

      const { bundle, accuracy, critRatePctBonus, critDamagePctBonus } = await calculateBasicAttack(session.characterId);
      const critRate = PLAYER_BASE_CRIT_RATE + (Number.isFinite(critRatePctBonus) ? critRatePctBonus / 100 : 0);
      const critMult = 1 + (((PLAYER_BASE_CRIT_MULT - 1) * 100 + (Number.isFinite(critDamagePctBonus) ? critDamagePctBonus : 0)) / 100);
      for (const t of targets) {
        const { damage, missed, didCrit, byElement } = totalDamageToTarget(bundle, t, accuracy, {
          critRate,
          critMult,
        });
        if (!missed && byElement) applyElementalDebuffsToEnemy(t, byElement, bundle, Date.now());
        t.hp = Math.max(0, t.hp - damage);
        if (t.hp <= 0) markEnemyDead(t, Date.now());
        io.to(session.characterId).emit('combat:resolved', {
          enemyId: t.id,
          enemyHp: t.hp,
          damage,
          didCrit: didCrit ?? false,
          missed,
          diedAt: t.diedAt,
        });

        if (t.hp <= 0) {
          await applyEnemyDefeatRewards(io, session, t);
        }
      }
    });

    socket.on('skill:slashStart', async ({ swingId }: { swingId?: number }) => {
      const session = sessions.get(socket.id);
      if (!session || session.hp <= 0) return;
      if (typeof swingId !== 'number' || !Number.isFinite(swingId)) return;
      const now = Date.now();
      const readyAt = session.cooldowns['slash'] ?? 0;
      if (now < readyAt) {
        socket.emit('skill:slashRejected', { swingId, message: 'Slash is on cooldown' });
        return;
      }
      try {
        const { manaCost, cooldownMs } = await calculateSkillDamage(session.characterId, 'slash');
        const char = await prisma.character.findUnique({ where: { id: session.characterId } });
        if (!char || char.mana < manaCost) {
          socket.emit('skill:slashRejected', { swingId, message: 'Not enough mana' });
          return;
        }
        const nextMana = char.mana - manaCost;
        await prisma.character.update({
          where: { id: session.characterId },
          data: { mana: nextMana },
        });
        session.mana = nextMana;
        session.cooldowns['slash'] = now + cooldownMs;
        session.slashSwing = { id: swingId, expiresAt: now + 4000, hitEnemyIds: new Set() };
        socket.emit('skill:slashStarted', { mana: nextMana, swingId });
      } catch {
        socket.emit('skill:slashRejected', { swingId, message: 'Cannot use Slash' });
      }
    });

    socket.on(
      'skill:slashHit',
      async (payload: { swingId?: number; enemyId?: string; yaw?: number }) => {
        const session = sessions.get(socket.id);
        if (!session || session.hp <= 0) return;
        const swingId = payload.swingId;
        const enemyId = payload.enemyId;
        const yaw =
          typeof payload.yaw === 'number' && Number.isFinite(payload.yaw) ? payload.yaw : 0;
        if (typeof swingId !== 'number' || typeof enemyId !== 'string') return;
        const sw = session.slashSwing;
        const now = Date.now();
        if (!sw || sw.id !== swingId || now > sw.expiresAt) return;
        if (sw.hitEnemyIds.has(enemyId)) return;
        const enemy = worldEnemies.find((it) => it.id === enemyId && it.hp > 0);
        if (!enemy) return;
        const SLASH_RANGE = 4.2;
        const dx = enemy.x - session.x;
        const dz = enemy.z - session.z;
        const d = Math.hypot(dx, dz);
        if (d > SLASH_RANGE + 0.95) return;
        const fx = Math.sin(yaw);
        const fz = Math.cos(yaw);
        const nx = dx / (d || 1);
        const nz = dz / (d || 1);
        if (nx * fx + nz * fz < -0.2) return;
        sw.hitEnemyIds.add(enemyId);
        try {
          const { bundle, accuracy, critRatePctBonus, critDamagePctBonus } = await getSkillDamageBundleForCast(
            session.characterId,
            'slash',
          );
          const critRate = PLAYER_BASE_CRIT_RATE + (Number.isFinite(critRatePctBonus) ? critRatePctBonus / 100 : 0);
          const critMult =
            1 + (((PLAYER_BASE_CRIT_MULT - 1) * 100 + (Number.isFinite(critDamagePctBonus) ? critDamagePctBonus : 0)) / 100);
          const { damage, missed, didCrit, byElement } = totalDamageToTarget(bundle, enemy, accuracy, {
            critRate,
            critMult,
          });
          if (!missed && byElement) applyElementalDebuffsToEnemy(enemy, byElement, bundle, Date.now());
          enemy.hp = Math.max(0, enemy.hp - damage);
          if (enemy.hp <= 0) markEnemyDead(enemy, Date.now());
          io.to(session.characterId).emit('combat:resolved', {
            enemyId: enemy.id,
            enemyHp: enemy.hp,
            damage,
            didCrit: didCrit ?? false,
            skillId: 'slash',
            mana: session.mana,
            missed,
            diedAt: enemy.diedAt,
          });
          if (enemy.hp <= 0) {
            await applyEnemyDefeatRewards(io, session, enemy);
          }
        } catch {
          sw.hitEnemyIds.delete(enemyId);
        }
      },
    );

    socket.on(
      'skill:cast',
      async ({
        enemyId,
        skillId,
        x,
        z,
      }: {
        enemyId?: string;
        skillId: string;
        x?: number;
        z?: number;
      }) => {
      const session = sessions.get(socket.id);
      if (!session || session.hp <= 0) return;
      if (skillId === 'slash') return;
      const enemy = enemyId ? worldEnemies.find((it) => it.id === enemyId && it.hp > 0) : null;
      const aimX =
        typeof x === 'number' && Number.isFinite(x) ? x : enemy ? enemy.x : undefined;
      const aimZ =
        typeof z === 'number' && Number.isFinite(z) ? z : enemy ? enemy.z : undefined;
      if (aimX == null || aimZ == null) return;

      // Free-aim safety: only enforce when there is NO enemy target (free cast by x/z).
      // Ranged projectiles: spec says "ko giới hạn phạm vi có thể tung chiêu" — click only chooses yaw;
      // we only limit their travel range inside their own skill logic.
      const NO_FREE_AIM_BOX = new Set(['firebolt', 'chaosorb', 'splitarrow', 'blink', 'haste', 'savage']);
      if (!enemy && !NO_FREE_AIM_BOX.has(skillId)) {
        const FREE_AIM_HALF = 15; // 30×30 square around player
        if (Math.abs(aimX - session.x) > FREE_AIM_HALF || Math.abs(aimZ - session.z) > FREE_AIM_HALF) return;
      }
      const now = Date.now();
      const readyAt = session.cooldowns[skillId] ?? 0;
      if (now < readyAt) return;

      /** Chain Lightning: không tốn mana nếu không có quái trong 10×10 tại điểm ngắm. */
      if (skillId === 'chainlightning') {
        const SNAP_HALF = 5; // 10×10 square around aim
        const anyInSnap = worldEnemies.some((e) => {
          if (e.hp <= 0) return false;
          return Math.abs(e.x - aimX) <= SNAP_HALF && Math.abs(e.z - aimZ) <= SNAP_HALF;
        });
        if (!anyInSnap) return;
      }

      try {
        // ─── Blink: teleport towards aim (clamped by max cast range) ─────────
        if (skillId === 'blink') {
          const learnedLv = await getCharacterSkillLevel(session.characterId, 'blink');
          if (learnedLv <= 0) return;
          const maxRange = 30 + (learnedLv - 1) * 2;
          const dx = aimX - session.x;
          const dz = aimZ - session.z;
          const dist = Math.hypot(dx, dz) || 0.0001;
          const useDist = Math.min(maxRange, dist);
          const nx = session.x + (dx / dist) * useDist;
          const nz = session.z + (dz / dist) * useDist;
          session.x = clampWorldXZ(nx);
          session.z = clampWorldXZ(nz);
          session.cooldowns[skillId] = now + 3000;
          await prisma.character.update({
            where: { id: session.characterId },
            data: { posX: session.x, posZ: session.z },
          });
          io.to(session.characterId).emit('player:blinked', { posX: session.x, posY: session.y, posZ: session.z });
          return;
        }

        // ─── Haste: player buff (attack speed + move speed) ─────────────────
        if (skillId === 'haste') {
          const learnedLv = await getCharacterSkillLevel(session.characterId, 'haste');
          if (learnedLv <= 0) return;
          const pct = 20 + (learnedLv - 1) * 5;
          const durationMs = (20 + (learnedLv - 1) * 5) * 1000;
          const until = now + durationMs;
          if (!session.buffs) session.buffs = {};
          session.buffs.hasteUntil = Math.max(session.buffs.hasteUntil ?? 0, until);
          session.buffs.hastePct = pct;
          io.to(session.characterId).emit('player:buffs', {
            haste: { until: session.buffs.hasteUntil, pct: session.buffs.hastePct },
          });
          return;
        }

        // ─── Savage: 3-hit combo sweep (5×3 rectangle in front) ─────────────
        if (skillId === 'savage') {
          const learnedLv = await getCharacterSkillLevel(session.characterId, 'savage');
          if (learnedLv <= 0) return;

          // Snapshot origin & facing at cast time so the 3 hits are consistent even if
          // the player moves slightly (desync / chase / tick jitter).
          const originX = session.x;
          const originZ = session.z;

          // Face towards aim/enemy; use the same yaw logic as other aimed skills.
          const yaw = Math.atan2(aimX - originX, aimZ - originZ);
          const fx = Math.sin(yaw);
          const fz = Math.cos(yaw);
          const rx = Math.cos(yaw);
          const rz = -Math.sin(yaw);

          // 5×3 "ngang" in front: width=5 (sideways), depth=3 (forward).
          const HALF_W = 2.5;
          const DEPTH = 3.0;
          // Treat enemies as having a small body radius (server uses foot XZ only).
          const ENEMY_BODY_R = 1.15;
          // Allow a small "grace" so targets right at your feet / tiny desync don't whiff.
          const FORWARD_GRACE_BEHIND = 0.65;
          const FORWARD_GRACE_AHEAD = 0.65;

          const { bundle, accuracy, critRatePctBonus, critDamagePctBonus } = await getSkillDamageBundleForCast(
            session.characterId,
            'savage',
          );
          const critRate = PLAYER_BASE_CRIT_RATE + (Number.isFinite(critRatePctBonus) ? critRatePctBonus / 100 : 0);
          const critMult =
            1 + (((PLAYER_BASE_CRIT_MULT - 1) * 100 + (Number.isFinite(critDamagePctBonus) ? critDamagePctBonus : 0)) / 100);

          const hitOnce = async (hitIndex: number) => {
            const nowHit = Date.now();
            const targets = worldEnemies.filter((e) => {
              if (e.hp <= 0) return false;
              const dx = e.x - originX;
              const dz = e.z - originZ;
              const forward = dx * fx + dz * fz;
              if (forward < -FORWARD_GRACE_BEHIND - ENEMY_BODY_R || forward > DEPTH + FORWARD_GRACE_AHEAD + ENEMY_BODY_R)
                return false;
              const side = dx * rx + dz * rz;
              return Math.abs(side) <= HALF_W + ENEMY_BODY_R;
            });
            for (const enemy of targets) {
              const { damage, missed, didCrit, byElement } = totalDamageToTarget(bundle, enemy, accuracy, {
                critRate,
                critMult,
              });
              if (!missed && byElement) applyElementalDebuffsToEnemy(enemy, byElement, bundle, nowHit);
              enemy.hp = Math.max(0, enemy.hp - damage);
              if (enemy.hp <= 0) markEnemyDead(enemy, nowHit);
              io.to(session.characterId).emit('combat:resolved', {
                enemyId: enemy.id,
                enemyHp: enemy.hp,
                damage,
                didCrit: didCrit ?? false,
                skillId: 'savage',
                mana: session.mana,
                missed,
                diedAt: enemy.diedAt,
              });
              if (enemy.hp <= 0) void applyEnemyDefeatRewards(io, session, enemy);
            }
          };

          // Spec: 100 attackSpeed = 1 cast/sec. Three hits at 20%, 40%, 60% of that period (not lumped at t≈0).
          const char = await prisma.character.findUnique({
            where: { id: session.characterId },
            include: { inventoryItems: true },
          });
          const inv = (char?.inventoryItems ?? []) as Array<{ equipped?: boolean; affixJson: string }>;
          const set = computeActiveSetBonusTotals(inv);
          const totals = sumEquippedAffixTotals(inv);
          const baseAtkSpd = char ? computeAttackSpeed(char) : 100;
          let atkSpd = Math.round((baseAtkSpd + (totals.attackSpeed ?? 0)) * (1 + (set.attackSpeedPct ?? 0) / 100));
          const hasteActive = (session.buffs?.hasteUntil ?? 0) > Date.now();
          const hastePct = hasteActive ? Math.max(0, session.buffs?.hastePct ?? 0) : 0;
          if (hastePct > 0) atkSpd = Math.round(atkSpd * (1 + hastePct / 100));
          atkSpd = Math.max(10, atkSpd);
          const periodMs = Math.max(120, Math.round((1000 * 100) / atkSpd));

          setTimeout(() => void hitOnce(0), Math.round(periodMs * 0.2));
          setTimeout(() => void hitOnce(1), Math.round(periodMs * 0.4));
          setTimeout(() => void hitOnce(2), Math.round(periodMs * 0.6));
          return;
        }

        const {
          bundle,
          accuracy,
          manaCost,
          cooldownMs,
          critRatePctBonus,
          critDamagePctBonus,
          spellAlwaysHits,
        } = await calculateSkillDamage(session.characterId, skillId);
        if (session.mana < manaCost) return;
        session.mana -= manaCost;
        session.cooldowns[skillId] = now + cooldownMs;

        await prisma.character.update({
          where: { id: session.characterId },
          data: { mana: session.mana },
        });

        const critRate = PLAYER_BASE_CRIT_RATE + (Number.isFinite(critRatePctBonus) ? critRatePctBonus / 100 : 0);
        const critMult =
          1 + (((PLAYER_BASE_CRIT_MULT - 1) * 100 + (Number.isFinite(critDamagePctBonus) ? critDamagePctBonus : 0)) / 100);

        const fxSeq = randomUUID();

        // ─── Chain Lightning: snap 10×10 tại aim → nối 16×16, số mục tiêu theo cấp ─
        if (skillId === 'chainlightning') {
          const SNAP_HALF = 5; // 10×10 square around aim
          const CHAIN_HALF = 8; // 16×16 square from last target
          const SEGMENT_MS = 95;
          const learnedLv = await getCharacterSkillLevel(session.characterId, 'chainlightning');
          const maxT = chainLightningMaxTargets(learnedLv);
          const inSnap = worldEnemies.filter((e) => {
            if (e.hp <= 0) return false;
            return Math.abs(e.x - aimX) <= SNAP_HALF && Math.abs(e.z - aimZ) <= SNAP_HALF;
          });
          if (inSnap.length === 0) {
            session.mana += manaCost;
            await prisma.character.update({
              where: { id: session.characterId },
              data: { mana: session.mana },
            });
            return;
          }
          const primary = inSnap.reduce((a, b) =>
            Math.hypot(a.x - aimX, a.z - aimZ) <= Math.hypot(b.x - aimX, b.z - aimZ) ? a : b,
          );
          const ordered: EnemyNetState[] = [primary];
          const used = new Set<string>([primary.id]);
          while (ordered.length < maxT) {
            const last = ordered[ordered.length - 1]!;
            const pool = worldEnemies.filter(
              (e) =>
                e.hp > 0 &&
                !used.has(e.id) &&
                Math.abs(e.x - last.x) <= CHAIN_HALF &&
                Math.abs(e.z - last.z) <= CHAIN_HALF,
            );
            if (!pool.length) break;
            pool.sort(
              (a, b) =>
                Math.hypot(a.x - last.x, a.z - last.z) - Math.hypot(b.x - last.x, b.z - last.z),
            );
            const next = pool[0]!;
            ordered.push(next);
            used.add(next.id);
          }
          const segments: { fromX: number; fromZ: number; toX: number; toZ: number }[] = [];
          let px = session.x;
          let pz = session.z;
          for (const t of ordered) {
            segments.push({ fromX: px, fromZ: pz, toX: t.x, toZ: t.z });
            px = t.x;
            pz = t.z;
          }
          io.to(session.characterId).emit('skill:fxChainLightning', {
            seq: fxSeq,
            segments,
            segmentMs: SEGMENT_MS,
            mana: session.mana,
          });
          ordered.forEach((targ, i) => {
            setTimeout(() => {
              const nowHit = Date.now();
              const eLive = worldEnemies.find((e) => e.id === targ.id && e.hp > 0);
              if (!eLive) return;
              const { damage, missed, didCrit, byElement } = totalDamageToTarget(bundle, eLive, accuracy, {
                critRate,
                critMult,
                spellAlwaysHits,
              });
              if (!missed && byElement) applyElementalDebuffsToEnemy(eLive, byElement, bundle, nowHit);
              eLive.hp = Math.max(0, eLive.hp - damage);
              if (eLive.hp <= 0) markEnemyDead(eLive, nowHit);
              io.to(session.characterId).emit('combat:resolved', {
                enemyId: eLive.id,
                enemyHp: eLive.hp,
                damage,
                didCrit: didCrit ?? false,
                skillId,
                mana: session.mana,
                missed,
                diedAt: eLive.diedAt,
              });
              if (eLive.hp <= 0) void applyEnemyDefeatRewards(io, session, eLive);
            }, i * SEGMENT_MS);
          });
          return;
        }

        // ─── Firebolt: projectile + 5×5 AOE explosion at impact ─────────────
        if (skillId === 'firebolt') {
          // Spec: explode immediately on first enemy contact.
          // Explosion size + hitbox: +50%.
          const FIREBOLT_RADIUS = 2.5 * 1.5; // was 2.5 (5×5); now 7.5×7.5-ish
          const PROJECTILE_SPEED = 14; // m/s
          // Spec: ranged projectiles always fly full range; click only chooses yaw.
          const yaw = Math.atan2(aimX - session.x, aimZ - session.z);
          const MAX_RANGE = 14;
          const dx = Math.sin(yaw) * MAX_RANGE;
          const dz = Math.cos(yaw) * MAX_RANGE;

          const dist = Math.hypot(dx, dz) || 0.0001;

          // Missile collision: find first living enemy intersected along the ray.
          const MISSILE_HIT_R = 1.7;
          let hitT = 1; // along 0..1
          let hitEnemy: EnemyNetState | null = null;
          for (const e of worldEnemies) {
            if (e.hp <= 0) continue;
            // Project enemy center onto segment
            const ex = e.x - session.x;
            const ez = e.z - session.z;
            const t = (ex * dx + ez * dz) / (dist * dist);
            if (t < 0 || t > hitT) continue;
            const px = session.x + dx * t;
            const pz = session.z + dz * t;
            const d = Math.hypot(e.x - px, e.z - pz);
            if (d <= MISSILE_HIT_R) {
              hitT = t;
              hitEnemy = e;
            }
          }

          const endX = session.x + dx;
          const endZ = session.z + dz;
          const impactX = hitEnemy ? hitEnemy.x : endX;
          const impactZ = hitEnemy ? hitEnemy.z : endZ;
          const impactDist = Math.hypot(impactX - session.x, impactZ - session.z);
          const travelMs = Math.max(90, Math.min(900, Math.round((impactDist / PROJECTILE_SPEED) * 1000)));
          io.to(session.characterId).emit('skill:fxFirebolt', {
            seq: fxSeq,
            fromX: session.x,
            fromZ: session.z,
            toX: impactX,
            toZ: impactZ,
            travelMs,
            radius: FIREBOLT_RADIUS,
            mana: session.mana,
          });
          setTimeout(() => {
            const nowImpact = Date.now();
            const targets = worldEnemies.filter(
              (e) => e.hp > 0 && Math.hypot(e.x - impactX, e.z - impactZ) <= FIREBOLT_RADIUS,
            );
            for (const target of targets) {
              const { damage, missed, didCrit, byElement } = totalDamageToTarget(bundle, target, accuracy, {
                critRate,
                critMult,
                spellAlwaysHits,
              });
              if (!missed && byElement) applyElementalDebuffsToEnemy(target, byElement, bundle, nowImpact);
              target.hp = Math.max(0, target.hp - damage);
              if (target.hp <= 0) markEnemyDead(target, nowImpact);
              io.to(session.characterId).emit('combat:resolved', {
                enemyId: target.id,
                enemyHp: target.hp,
                damage,
                didCrit: didCrit ?? false,
                skillId,
                mana: session.mana,
                missed,
                diedAt: target.diedAt,
              });
              if (target.hp <= 0) {
                void applyEnemyDefeatRewards(io, session, target);
              }
            }
          }, travelMs);
          return;
        }

        // ─── Split Arrow: fan of physical arrows (hit first enemy per arrow) ─
        if (skillId === 'splitarrow') {
          const PROJECTILE_SPEED = 18; // m/s (purely for VFX timing)
          const HIT_R = 1.25;

          const learnedLv = await getCharacterSkillLevel(session.characterId, 'splitarrow');
          const count = splitArrowCount(learnedLv);
          const totalDeg = splitArrowTotalAngleDeg(learnedLv);

          const baseDx = aimX - session.x;
          const baseDz = aimZ - session.z;
          const baseDist = Math.hypot(baseDx, baseDz) || 0.0001;
          const baseYaw = Math.atan2(baseDx, baseDz);

          // Spec: regardless of click distance, arrows always travel to max range.
          // Click position is only used to choose the facing direction (yaw).
          const range = 36;

          const segs: { fromX: number; fromZ: number; toX: number; toZ: number; travelMs: number }[] = [];

          const totalRad = (totalDeg * Math.PI) / 180;
          const step = count <= 1 ? 0 : totalRad / (count - 1);
          const start = -totalRad / 2;

          for (let i = 0; i < count; i++) {
            const yaw = baseYaw + start + step * i;
            const dx = Math.sin(yaw);
            const dz = Math.cos(yaw);
            const toX = session.x + dx * range;
            const toZ = session.z + dz * range;

            // Find first living enemy intersected along this arrow ray.
            let hitT = 1;
            let hitEnemy: EnemyNetState | null = null;
            let hitX = toX;
            let hitZ = toZ;
            for (const e of worldEnemies) {
              if (e.hp <= 0) continue;
              const ex = e.x - session.x;
              const ez = e.z - session.z;
              const dot = ex * (toX - session.x) + ez * (toZ - session.z);
              const len2 = range * range;
              const t = dot / len2;
              if (t < 0 || t > hitT) continue;
              const px = session.x + (toX - session.x) * t;
              const pz = session.z + (toZ - session.z) * t;
              const d = Math.hypot(e.x - px, e.z - pz);
              if (d <= HIT_R) {
                hitT = t;
                hitEnemy = e;
                // Important: stop the arrow at the actual intersection point along its ray,
                // not at the enemy center. This prevents multiple arrows "pinning" to the same point.
                hitX = px;
                hitZ = pz;
              }
            }

            const impactX = hitEnemy ? hitX : toX;
            const impactZ = hitEnemy ? hitZ : toZ;
            const impactDist = Math.hypot(impactX - session.x, impactZ - session.z);
          // Keep speed consistent: do not cap too low, otherwise short-distance hits look slower than max-range arrows.
          // With range=36 and speed=18 m/s => ~2000ms full travel.
          const travelMs = Math.max(70, Math.min(2300, Math.round((impactDist / PROJECTILE_SPEED) * 1000)));
            segs.push({ fromX: session.x, fromZ: session.z, toX: impactX, toZ: impactZ, travelMs });

            if (hitEnemy) {
              const hitEnemyId = hitEnemy.id;
              setTimeout(() => {
                const nowHit = Date.now();
                const eLive = worldEnemies.find((en) => en.id === hitEnemyId && en.hp > 0);
                if (!eLive) return;
                const { damage, missed, didCrit } = totalDamageToTarget(bundle, eLive, accuracy, {
                  critRate,
                  critMult,
                  spellAlwaysHits,
                });
                eLive.hp = Math.max(0, eLive.hp - damage);
                if (eLive.hp <= 0) markEnemyDead(eLive, nowHit);
                io.to(session.characterId).emit('combat:resolved', {
                  enemyId: eLive.id,
                  enemyHp: eLive.hp,
                  damage,
                  didCrit: didCrit ?? false,
                  skillId,
                  mana: session.mana,
                  missed,
                  diedAt: eLive.diedAt,
                });
                if (eLive.hp <= 0) void applyEnemyDefeatRewards(io, session, eLive);
              }, travelMs);
            }
          }

          io.to(session.characterId).emit('skill:fxSplitArrow', {
            seq: fxSeq,
            arrows: segs.map((s) => ({
              fromX: s.fromX,
              fromZ: s.fromZ,
              toX: s.toX,
              toZ: s.toZ,
              travelMs: s.travelMs,
            })),
            mana: session.mana,
          });
          return;
        }

        // ─── Chaos Orb: green poison orb, multi-explosions along path + at end ─
        if (skillId === 'chaosorb') {
          // Spec:
          // - VFX explosion smaller 30%
          // - Explosion hitbox larger 30%
          const ORB_HIT_RADIUS = 2.5 * 1.3;
          const ORB_VFX_RADIUS = 2.5 * 0.7;
          const PROJECTILE_SPEED = 14;
          // Spec: ranged projectiles always fly full range; click only chooses yaw.
          const yaw = Math.atan2(aimX - session.x, aimZ - session.z);
          const MAX_RANGE = 14;
          const dx = Math.sin(yaw) * MAX_RANGE;
          const dz = Math.cos(yaw) * MAX_RANGE;
          const dist = Math.hypot(dx, dz) || 0.0001;

          const MISSILE_HIT_R = 1.7;
          const hits: { t: number; x: number; z: number; enemyId: string }[] = [];
          for (const e of worldEnemies) {
            if (e.hp <= 0) continue;
            const ex = e.x - session.x;
            const ez = e.z - session.z;
            const t = (ex * dx + ez * dz) / (dist * dist);
            if (t < 0 || t > 1) continue;
            const px = session.x + dx * t;
            const pz = session.z + dz * t;
            const d = Math.hypot(e.x - px, e.z - pz);
            if (d <= MISSILE_HIT_R) {
              hits.push({ t, x: px, z: pz, enemyId: e.id });
            }
          }
          hits.sort((a, b) => a.t - b.t);

          const travelMs = Math.max(90, Math.min(900, Math.round((dist / PROJECTILE_SPEED) * 1000)));
          const endX = session.x + dx;
          const endZ = session.z + dz;
          io.to(session.characterId).emit('skill:fxChaosOrb', {
            seq: fxSeq,
            fromX: session.x,
            fromZ: session.z,
            toX: endX,
            toZ: endZ,
            travelMs,
            radius: ORB_VFX_RADIUS,
            mana: session.mana,
            // Hint: where explosions are expected to happen (client can mirror visually)
            explosions: [...hits.map((h) => ({ t: h.t, x: h.x, z: h.z })), { t: 1, x: endX, z: endZ }],
          });

          const explodeAt = (ex: number, ez: number) => {
            const nowImpact = Date.now();
            const targets = worldEnemies.filter((en) => en.hp > 0 && Math.hypot(en.x - ex, en.z - ez) <= ORB_HIT_RADIUS);
            for (const target of targets) {
              const { damage, missed, didCrit, byElement } = totalDamageToTarget(bundle, target, accuracy, {
                critRate,
                critMult,
                spellAlwaysHits,
              });
              if (!missed && byElement) applyElementalDebuffsToEnemy(target, byElement, bundle, nowImpact);
              target.hp = Math.max(0, target.hp - damage);
              if (target.hp <= 0) markEnemyDead(target, nowImpact);
              io.to(session.characterId).emit('combat:resolved', {
                enemyId: target.id,
                enemyHp: target.hp,
                damage,
                didCrit: didCrit ?? false,
                skillId,
                mana: session.mana,
                missed,
                diedAt: target.diedAt,
              });
              if (target.hp <= 0) void applyEnemyDefeatRewards(io, session, target);
            }
          };

          // Spec: orb-hit and explosion are two separate damage sources.
          const directHit = (enemyId: string) => {
            const nowHit = Date.now();
            const eLive = worldEnemies.find((en) => en.id === enemyId && en.hp > 0);
            if (!eLive) return;
            const { damage, missed, didCrit, byElement } = totalDamageToTarget(bundle, eLive, accuracy, {
              critRate,
              critMult,
              spellAlwaysHits,
            });
            if (!missed && byElement) applyElementalDebuffsToEnemy(eLive, byElement, bundle, nowHit);
            eLive.hp = Math.max(0, eLive.hp - damage);
            if (eLive.hp <= 0) markEnemyDead(eLive, nowHit);
            io.to(session.characterId).emit('combat:resolved', {
              enemyId: eLive.id,
              enemyHp: eLive.hp,
              damage,
              didCrit: didCrit ?? false,
              skillId,
              mana: session.mana,
              missed,
              diedAt: eLive.diedAt,
            });
            if (eLive.hp <= 0) void applyEnemyDefeatRewards(io, session, eLive);
          };

          // Explode at each collision, plus a final explosion at end range.
          for (const h of hits) {
            const atMs = Math.round(travelMs * h.t);
            setTimeout(() => {
              directHit(h.enemyId);
              explodeAt(h.x, h.z);
            }, atMs);
          }
          setTimeout(() => explodeAt(endX, endZ), travelMs);
          return;
        }

        // ─── Blizzard: 5×5 area, 1 ice shard every 200ms for 2s ─────────────
        if (skillId === 'blizzard') {
          const BLIZZARD_HALF = 2.5; // half of 5×5 area
          const SHARD_RADIUS = 2; // ~4×4 ô (bán kính ~2m)
          const TICK_MS = 200;
          const DURATION_MS = 2000;
          const TICK_COUNT = Math.floor(DURATION_MS / TICK_MS);
          // Per-tick damage: split bundle evenly across all ticks, then scale per shard as requested.
          const SHARD_DAMAGE_MULT = 1.5;
          const tickBundle = {
            physic: Math.round((bundle.physic / TICK_COUNT) * SHARD_DAMAGE_MULT),
            elemental: {
              fire: Math.round((bundle.elemental.fire / TICK_COUNT) * SHARD_DAMAGE_MULT),
              cold: Math.round((bundle.elemental.cold / TICK_COUNT) * SHARD_DAMAGE_MULT),
              lightning: Math.round((bundle.elemental.lightning / TICK_COUNT) * SHARD_DAMAGE_MULT),
              poison: Math.round((bundle.elemental.poison / TICK_COUNT) * SHARD_DAMAGE_MULT),
            },
          };
          io.to(session.characterId).emit('skill:fxBlizzard', {
            seq: fxSeq,
            centerX: aimX,
            centerZ: aimZ,
            half: BLIZZARD_HALF,
            shardRadius: SHARD_RADIUS,
            tickMs: TICK_MS,
            durationMs: DURATION_MS,
            mana: session.mana,
          });
          for (let i = 0; i < TICK_COUNT; i++) {
            setTimeout(() => {
              const nowTick = Date.now();
              const sx = aimX + (Math.random() * 2 - 1) * BLIZZARD_HALF;
              const sz = aimZ + (Math.random() * 2 - 1) * BLIZZARD_HALF;
              io.to(session.characterId).emit('skill:fxBlizzardShard', {
                seq: fxSeq,
                index: i,
                x: sx,
                z: sz,
                radius: SHARD_RADIUS,
              });
              const targets = worldEnemies.filter(
                (e) => e.hp > 0 && Math.hypot(e.x - sx, e.z - sz) <= SHARD_RADIUS,
              );
              for (const target of targets) {
                const { damage, missed, didCrit, byElement } = totalDamageToTarget(tickBundle, target, accuracy, {
                  critRate,
                  critMult,
                  spellAlwaysHits,
                });
                if (!missed && byElement) applyElementalDebuffsToEnemy(target, byElement, tickBundle, nowTick);
                target.hp = Math.max(0, target.hp - damage);
                if (target.hp <= 0) markEnemyDead(target, nowTick);
                io.to(session.characterId).emit('combat:resolved', {
                  enemyId: target.id,
                  enemyHp: target.hp,
                  damage,
                  didCrit: didCrit ?? false,
                  skillId,
                  mana: session.mana,
                  missed,
                  diedAt: target.diedAt,
                });
                if (target.hp <= 0) {
                  void applyEnemyDefeatRewards(io, session, target);
                }
              }
            }, i * TICK_MS);
          }
          return;
        }

        // ─── Meteor: thiên thạch 6×6 impact 150% bundle, vùng cháy 8×8 20% mỗi 0.5s × 6 ─
        if (skillId === 'meteor') {
          const METEOR_HALF = 3; // ~6×6 (bán kính 3m, cùng quy ước như shard 4×4 → r=2)
          const BURN_HALF = 4; // 8×8
          const FALL_MS = Math.max(320, Math.min(900, 560));
          const BURN_TICK_MS = 500;
          const BURN_TICKS = 6;
          const impactBundle = scaleDamageBundle(bundle, 1.5);
          const dotBundle = scaleDamageBundle(bundle, 0.2);
          io.to(session.characterId).emit('skill:fxMeteor', {
            seq: fxSeq,
            aimX,
            aimZ,
            fromX: session.x,
            fromZ: session.z,
            fallMs: FALL_MS,
            meteorHalf: METEOR_HALF,
            burnHalf: BURN_HALF,
            burnDurationMs: BURN_TICK_MS * BURN_TICKS,
            mana: session.mana,
          });
          setTimeout(() => {
            const nowImpact = Date.now();
            const hitImpact = worldEnemies.filter(
              (e) => e.hp > 0 && Math.hypot(e.x - aimX, e.z - aimZ) <= METEOR_HALF,
            );
            for (const target of hitImpact) {
              const { damage, missed, didCrit, byElement } = totalDamageToTarget(impactBundle, target, accuracy, {
                critRate,
                critMult,
                spellAlwaysHits,
              });
              if (!missed && byElement) applyElementalDebuffsToEnemy(target, byElement, impactBundle, nowImpact);
              target.hp = Math.max(0, target.hp - damage);
              if (target.hp <= 0) markEnemyDead(target, nowImpact);
              io.to(session.characterId).emit('combat:resolved', {
                enemyId: target.id,
                enemyHp: target.hp,
                damage,
                didCrit: didCrit ?? false,
                skillId,
                mana: session.mana,
                missed,
                diedAt: target.diedAt,
              });
              if (target.hp <= 0) void applyEnemyDefeatRewards(io, session, target);
            }
            for (let i = 0; i < BURN_TICKS; i++) {
              setTimeout(() => {
                const tBurn = Date.now();
                const inBurn = worldEnemies.filter(
                  (e) => e.hp > 0 && Math.hypot(e.x - aimX, e.z - aimZ) <= BURN_HALF,
                );
                for (const target of inBurn) {
                  const { damage, missed, didCrit, byElement } = totalDamageToTarget(dotBundle, target, accuracy, {
                    critRate,
                    critMult,
                    spellAlwaysHits,
                  });
                  if (!missed && byElement) applyElementalDebuffsToEnemy(target, byElement, dotBundle, tBurn);
                  target.hp = Math.max(0, target.hp - damage);
                  if (target.hp <= 0) markEnemyDead(target, tBurn);
                  io.to(session.characterId).emit('combat:resolved', {
                    enemyId: target.id,
                    enemyHp: target.hp,
                    damage,
                    didCrit: didCrit ?? false,
                    skillId,
                    mana: session.mana,
                    missed,
                    diedAt: target.diedAt,
                  });
                  if (target.hp <= 0) void applyEnemyDefeatRewards(io, session, target);
                }
              }, i * BURN_TICK_MS);
            }
          }, FALL_MS);
          return;
        }

        // ─── Default: single-target (legacy) ────────────────────────────────
        if (!enemy) return;
        for (const target of [enemy]) {
          const { damage, missed, didCrit, byElement } = totalDamageToTarget(bundle, target, accuracy, {
            critRate,
            critMult,
            spellAlwaysHits,
          });
          if (!missed && byElement) applyElementalDebuffsToEnemy(target, byElement, bundle, Date.now());
          target.hp = Math.max(0, target.hp - damage);
          if (target.hp <= 0) markEnemyDead(target, Date.now());
          io.to(session.characterId).emit('combat:resolved', {
            enemyId: target.id,
            enemyHp: target.hp,
            damage,
            didCrit: didCrit ?? false,
            skillId,
            mana: session.mana,
            missed,
            diedAt: target.diedAt,
          });
          if (target.hp <= 0) {
            await applyEnemyDefeatRewards(io, session, target);
          }
        }
      } catch {
        socket.emit('error:game', { message: 'invalid skill cast' });
      }
    },
    );

    socket.on('disconnect', () => {
      sessions.delete(socket.id);
    });
  });

  setInterval(() => void aiTick(io), AI_TICK_MS);
  return io;
}
