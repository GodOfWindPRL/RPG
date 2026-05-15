/**
 * Đồng bộ số với `frontend/src/core/worldCollision.ts`.
 */
import { clampWorldXZ } from './worldBounds.js';

export const PLAYER_COLLISION_RADIUS = 0.48;
export const ENEMY_COLLISION_RADIUS = 0.52;

export type XZCircle = { x: number; z: number; r: number };

const SKIN = 0.02;

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
  return { x: clampWorldXZ(x), z: clampWorldXZ(z) };
}
