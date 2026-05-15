import type { Enemy } from './types';
import { MAP_HALF_SIZE } from './world';
import { getForestObstacleCircles } from './forestObstacles';

export const PLAYER_COLLISION_RADIUS = 0.48;
export const ENEMY_COLLISION_RADIUS = 0.52;

export type XZCircle = { x: number; z: number; r: number };

const SKIN = 0.02;

/** Đẩy tâm (px,pz) ra ngoài nếu chồng lên các vòng khác. */
export function xzPushOutFromCircles(
  px: number,
  pz: number,
  pr: number,
  circles: XZCircle[],
  iterations = 6,
): { x: number; z: number } {
  let x = px;
  let z = pz;
  for (let it = 0; it < iterations; it++) {
    for (const c of circles) {
      const dx = x - c.x;
      const dz = z - c.z;
      const d = Math.hypot(dx, dz);
      const need = pr + c.r + SKIN;
      if (d >= need) continue;
      if (d > 1e-7) {
        const push = (need - d) / d;
        x += dx * push;
        z += dz * push;
      } else {
        x += need;
      }
    }
  }
  return {
    x: Math.max(-MAP_HALF_SIZE, Math.min(MAP_HALF_SIZE, x)),
    z: Math.max(-MAP_HALF_SIZE, Math.min(MAP_HALF_SIZE, z)),
  };
}

function enemyCircles(enemies: Enemy[]): XZCircle[] {
  const out: XZCircle[] = [];
  for (const e of enemies) {
    if (e.hp > 0) out.push({ x: e.x, z: e.z, r: ENEMY_COLLISION_RADIUS });
  }
  return out;
}

/** Đích di chuyển nhân vật sau khi tránh cây + quái (client). */
export function resolvePlayerMoveXZ(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  enemies: Enemy[],
): { x: number; z: number } {
  const tx = Math.max(-MAP_HALF_SIZE, Math.min(MAP_HALF_SIZE, toX));
  const tz = Math.max(-MAP_HALF_SIZE, Math.min(MAP_HALF_SIZE, toZ));
  const dx = tx - fromX;
  const dz = tz - fromZ;
  const staticObs = getForestObstacleCircles();
  const dyn = enemyCircles(enemies);

  const tryPoint = (x: number, z: number) =>
    xzPushOutFromCircles(x, z, PLAYER_COLLISION_RADIUS, [...staticObs, ...dyn]);

  let best = tryPoint(tx, tz);
  if (Math.hypot(best.x - fromX, best.z - fromZ) > 1e-4) return best;

  const slideX = tryPoint(fromX + dx, fromZ);
  if (Math.hypot(slideX.x - fromX, slideX.z - fromZ) > 1e-4) return slideX;

  const slideZ = tryPoint(fromX, fromZ + dz);
  if (Math.hypot(slideZ.x - fromX, slideZ.z - fromZ) > 1e-4) return slideZ;

  for (let s = 0.5; s >= 0.125; s *= 0.5) {
    const p = tryPoint(fromX + dx * s, fromZ + dz * s);
    if (Math.hypot(p.x - fromX, p.z - fromZ) > 1e-4) return p;
  }
  return { x: fromX, z: fromZ };
}
