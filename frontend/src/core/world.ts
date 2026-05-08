/**
 * Playable world half-extent on X/Z (square: [-N, N]).
 * Keep in sync with `backend/src/modules/shared/worldBounds.ts` → `WORLD_MAP_HALF_SIZE`.
 */
export const MAP_HALF_SIZE = 75;
export const MAP_SIZE = MAP_HALF_SIZE * 2;

/** Max planar speed for WASD + auto-chase (world units per second). */
export const PLAYER_MAX_MOVE_SPEED = 5;

