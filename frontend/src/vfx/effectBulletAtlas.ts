import * as THREE from 'three';

/** Sprite sheet `* Effect and Bullet 16x16.png` (576×208, ô 16×16). */
export const EFFECT_BULLET_SHEET_W = 576;
export const EFFECT_BULLET_SHEET_H = 208;
export const EFFECT_BULLET_CELL_PX = 16;
export const EFFECT_BULLET_COLS = EFFECT_BULLET_SHEET_W / EFFECT_BULLET_CELL_PX;
export const EFFECT_BULLET_ROWS = EFFECT_BULLET_SHEET_H / EFFECT_BULLET_CELL_PX;

/** `Red Effect Bullet Impact Explosion 32x32.png` — đã đo 640×512, ô 32×32 → 20×16. */
export const RED_IMPACT_32_SHEET_W = 640;
export const RED_IMPACT_32_SHEET_H = 512;
export const RED_IMPACT_32_CELL_PX = 32;
export const RED_IMPACT_32_COLS = RED_IMPACT_32_SHEET_W / RED_IMPACT_32_CELL_PX;
export const RED_IMPACT_32_ROWS = RED_IMPACT_32_SHEET_H / RED_IMPACT_32_CELL_PX;

/** UV cho một ô (col, row) — row 0 = hàng trên cùng của ảnh. */
export function applyEffectBulletCellUV(tex: THREE.Texture, col: number, row: number): void {
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(1 / EFFECT_BULLET_COLS, 1 / EFFECT_BULLET_ROWS);
  tex.offset.set(col / EFFECT_BULLET_COLS, (EFFECT_BULLET_ROWS - 1 - row) / EFFECT_BULLET_ROWS);
  tex.needsUpdate = true;
}

/** Atlas lưới đều (ví dụ Impact Explosion 32×32). col/row: 0 = trái / trên. */
export function applyGridCellUV(
  tex: THREE.Texture,
  sheetW: number,
  sheetH: number,
  cellPx: number,
  col: number,
  row: number,
): void {
  const cols = sheetW / cellPx;
  const rows = sheetH / cellPx;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(1 / cols, 1 / rows);
  tex.offset.set(col / cols, (rows - 1 - row) / rows);
  tex.needsUpdate = true;
}
