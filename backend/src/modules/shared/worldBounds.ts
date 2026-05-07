/**
 * World playable half-extent on X/Z (square: [-N, N]).
 * Keep in sync with `frontend/src/core/world.ts` → `MAP_HALF_SIZE`.
 */
export const WORLD_MAP_HALF_SIZE = 250;

export function clampWorldXZ(value: number): number {
  return Math.max(-WORLD_MAP_HALF_SIZE, Math.min(WORLD_MAP_HALF_SIZE, value));
}
