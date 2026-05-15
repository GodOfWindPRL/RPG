import { MAP_HALF_SIZE } from './world';

/** Đồng bộ với `backend/src/modules/shared/forestObstacles.ts` (seed / count / margin). */
export const FOREST_SCATTER_COUNT = 50;
export const FOREST_EDGE_MARGIN = 7;
export const FOREST_SCATTER_SEED = 738_561;
/** Bán kính va chạm gần đúng cho cây/đá (XZ). */
export const FOREST_PROP_RADIUS = 0.92;

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Vị trí scatter cây (chỉ XZ) — dùng cho VFX + physics. */
export function computeForestScatterXZ(): { x: number; z: number }[] {
  const rng = mulberry32(FOREST_SCATTER_SEED);
  const span = MAP_HALF_SIZE - FOREST_EDGE_MARGIN;
  return Array.from({ length: FOREST_SCATTER_COUNT }, () => ({
    x: (rng() * 2 - 1) * span,
    z: (rng() * 2 - 1) * span,
  }));
}

let cachedCircles: { x: number; z: number; r: number }[] | null = null;

export function getForestObstacleCircles(): { x: number; z: number; r: number }[] {
  if (!cachedCircles) {
    cachedCircles = computeForestScatterXZ().map((p) => ({
      x: p.x,
      z: p.z,
      r: FOREST_PROP_RADIUS,
    }));
  }
  return cachedCircles;
}
