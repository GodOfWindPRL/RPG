import type { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verifyToken } from '../../middleware/auth.js';
import { prisma } from '../shared/prisma.js';
import {
  calculateBasicAttack,
  calculateSkillDamage,
  damageFromMobHit,
  hitChance,
  makeDungeonEnemies,
  totalDamageToTarget,
  type EnemyState,
} from './combat.service.js';
import { updateCharacterPosition } from '../player/player.service.js';
import { grantRolledItem, rollItem } from '../item/item.service.js';
import { progressCollectQuest, progressKillQuest } from '../quest/quest.service.js';
import { clampWorldXZ } from '../shared/worldBounds.js';
import { computeDefense, computeEvasion, computeMaxHp, computeMaxMana } from '../player/stats.js';
import { applyExpGain, type CharacterProgressPayload } from '../player/leveling.service.js';
import { randomUUID } from 'crypto';

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

function clampToHome(v: number, home: number) {
  const clamped = Math.max(home - ENEMY_WANDER_HALF, Math.min(home + ENEMY_WANDER_HALF, v));
  return clampWorldXZ(clamped);
}

const CORPSE_VISIBLE_MS = 3000;
const LOOT_VISIBLE_MS = 60000;
const LOOT_PICKUP_RANGE = 2.4;
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

function aiTick(io: Server) {
  ensureEnemyAi();
  const now = Date.now();
  const dt = AI_TICK_MS / 1000;
  const AGGRO_DROP_MS = 2500;

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
        if (dist > ENEMY_MELEE_REACH) {
          const len = dist || 1;
          const gap = Math.max(0, dist - ENEMY_MELEE_RANGE);
          // Ensure we always make progress when we're "almost" in range (avoids step=0 sticky states).
          const rawStep = Math.min(ENEMY_CHASE_SPEED * dt, gap);
          const step = gap > 0 ? Math.max(rawStep, Math.min(gap, 0.06)) : 0;
          const nx = dx / len;
          const nz = dz / len;
          // While aggro'd, chase across the world map (leash only applies to wander).
          enemy.x = clampWorldXZ(enemy.x + nx * step);
          enemy.z = clampWorldXZ(enemy.z + nz * step);
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
            ai.attackReadyAt = now + ENEMY_ATTACK_COOLDOWN_MS;
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
        const step = Math.min(ENEMY_WANDER_SPEED * dt, dist);
        const nx = dx / dist;
        const nz = dz / dist;
        enemy.x = clampToHome(enemy.x + nx * step, ai.homeX);
        enemy.z = clampToHome(enemy.z + nz * step, ai.homeZ);
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
  // Roll loot and drop it on ground near the dead enemy. Player must click to pick up.
  const roll = await rollItem(Math.min(10, session.level));
  if (!roll) return;
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

      const created = await prisma.inventoryItem.create({
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

    socket.on('player:move', async ({ x, y, z }: { x: number; y: number; z: number }) => {
      const session = sessions.get(socket.id);
      if (!session || session.hp <= 0) return;
      session.x = clampWorldXZ(x);
      session.y = y;
      session.z = clampWorldXZ(z);
      await updateCharacterPosition(session.characterId, session.x, session.y, session.z);
      socket.to(session.characterId).emit('player:moved', { characterId: session.characterId, x, y, z });
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

      const { bundle, accuracy } = await calculateBasicAttack(session.characterId);
      for (const t of targets) {
        const { damage, missed, didCrit } = totalDamageToTarget(bundle, t, accuracy, {
          critRate: PLAYER_BASE_CRIT_RATE,
          critMult: PLAYER_BASE_CRIT_MULT,
        });
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

    socket.on('skill:cast', async ({ enemyId, skillId }: { enemyId: string; skillId: string }) => {
      const session = sessions.get(socket.id);
      if (!session || session.hp <= 0) return;
      const enemy = worldEnemies.find((it) => it.id === enemyId && it.hp > 0);
      if (!enemy) return;
      const now = Date.now();
      const readyAt = session.cooldowns[skillId] ?? 0;
      if (now < readyAt) return;

      try {
        const { bundle, accuracy, manaCost, cooldownMs } = await calculateSkillDamage(session.characterId, skillId);
        if (session.mana < manaCost) return;
        session.mana -= manaCost;
        session.cooldowns[skillId] = now + cooldownMs;

        const isSlash = skillId === 'slash';
        const slashTargets = isSlash
          ? worldEnemies.filter((it) => {
              if (it.hp <= 0) return false;
              if (it.id === enemy.id) return true;
              const faceXRaw = enemy.x - session.x;
              const faceZRaw = enemy.z - session.z;
              const faceLen = Math.hypot(faceXRaw, faceZRaw) || 1;
              const faceX = faceXRaw / faceLen;
              const faceZ = faceZRaw / faceLen;
              /** Đồng bộ `SLASH_EFFECT_RANGE` trên frontend. */
              const SLASH_RANGE = 4.2;
              const dx = it.x - session.x;
              const dz = it.z - session.z;
              const d = Math.hypot(dx, dz);
              if (d > SLASH_RANGE || d < 0.001) return false;
              const nx = dx / d;
              const nz = dz / d;
              const dot = nx * faceX + nz * faceZ;
              return dot >= 0;
            })
          : [enemy];

        await prisma.character.update({
          where: { id: session.characterId },
          data: { mana: session.mana },
        });

        for (const target of slashTargets) {
          const { damage, missed, didCrit } = totalDamageToTarget(bundle, target, accuracy, {
            critRate: PLAYER_BASE_CRIT_RATE,
            critMult: PLAYER_BASE_CRIT_MULT,
          });
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
    });

    socket.on('disconnect', () => {
      sessions.delete(socket.id);
    });
  });

  setInterval(() => aiTick(io), AI_TICK_MS);
  return io;
}
