/**
 * Playable world half-extent on X/Z (square: [-N, N]).
 * Keep in sync with `backend/src/modules/shared/worldBounds.ts` → `WORLD_MAP_HALF_SIZE`.
 * (Previously 12 → 24 total; raised to match a much larger field.)
 */
export const MAP_HALF_SIZE = 250;
export const MAP_SIZE = MAP_HALF_SIZE * 2;

/** Max planar speed for WASD + auto-chase (world units per second). */
export const PLAYER_MAX_MOVE_SPEED = 5;
