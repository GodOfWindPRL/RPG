import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '../systems/gameStore';
import meteoriteGltfUrl from '../assets/model/meteorite.glb?url';
import redImpactExplosionUrl from '../assets/vfx/Effect Bullet Impact Explosion 32x32 V1/Red Effect Bullet Impact Explosion 32x32.png';
import {
  applyGridCellUV,
  RED_IMPACT_32_CELL_PX,
  RED_IMPACT_32_SHEET_H,
  RED_IMPACT_32_SHEET_W,
} from '../vfx/effectBulletAtlas';

const ROCK_Y0 = 18;
/** Tỉ lệ mesh glb so với scene (chỉnh nếu model quá to/nhỏ). */
const METEORITE_MODEL_SCALE = 0.45;

/**
 * Strip decal lava: **dòng 9, cột 11→14** nếu đếm từ 1 (4 frame liên tiếp trên atlas Red 32×32).
 * Trong code: `row = 8`, `col` chạy `10..13`. Đổi strip: sửa 3 hằng dưới (+ FPS nếu cần).
 */
const METEOR_BURN_ANIM_ROW = 8;
const METEOR_BURN_ANIM_COL_FIRST = 11;
const METEOR_BURN_ANIM_FRAME_COUNT = 4;
const METEOR_BURN_ANIM_FPS = 5;
/** Crossfade giữa hai ô liên tiếp: 1 = mượt tối đa (smoothstep). */
const METEOR_BURN_CROSSFADE_SMOOTH = true;
/** Độ rộng vùng đốt so với `burnHalf` (XZ). */
const METEOR_BURN_SIZE_MULT = 2.55;
/** Decal mặt đất: nhạt, blend bình thường, có depth test (không đè lên nhân vật/quái). */
const METEOR_BURN_COLOR = '#ffd8c4';
const METEOR_BURN_OPACITY_PEAK = 0.68;
/** Cao hơn mặt ground (y≈−0.01) một khoảng rõ để tránh z-fighting khi nhìn xa. */
const METEOR_BURN_GROUND_Y = 0.04;

useGLTF.preload(meteoriteGltfUrl);
useTexture.preload(redImpactExplosionUrl);

function cloneBurnMapFromSheet(sheet: THREE.Texture, frameIndex: number): THREE.Texture {
  const t = sheet.clone();
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  const col = METEOR_BURN_ANIM_COL_FIRST + (frameIndex % METEOR_BURN_ANIM_FRAME_COUNT);
  applyGridCellUV(
    t,
    RED_IMPACT_32_SHEET_W,
    RED_IMPACT_32_SHEET_H,
    RED_IMPACT_32_CELL_PX,
    col,
    METEOR_BURN_ANIM_ROW,
  );
  return t;
}

type MeteorFxProps = {
  seq: number | string;
  aimX: number;
  aimZ: number;
  fromX: number;
  fromZ: number;
  startMs: number;
  fallMs: number;
  burnHalf: number;
  burnDurationMs: number;
};

export function MeteorFx({
  seq,
  aimX,
  aimZ,
  fromX,
  fromZ,
  startMs,
  fallMs,
  burnHalf,
  burnDurationMs,
}: MeteorFxProps) {
  const removeMeteorFx = useGameStore((s) => s.removeMeteorFx);
  const { scene } = useGLTF(meteoriteGltfUrl);
  const meteorRoot = useMemo(() => scene.clone(true), [scene]);

  const impactSheet = useTexture(redImpactExplosionUrl);
  /** Hai clone để crossfade ô kế tiếp (UV cập nhật khi `i0` đổi). */
  const burnMapA = useMemo(() => cloneBurnMapFromSheet(impactSheet, 0), [impactSheet]);
  const burnMapB = useMemo(() => cloneBurnMapFromSheet(impactSheet, 1), [impactSheet]);

  useEffect(() => {
    return () => {
      burnMapA.dispose();
      burnMapB.dispose();
    };
  }, [burnMapA, burnMapB]);

  useLayoutEffect(() => {
    meteorRoot.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [meteorRoot]);

  useLayoutEffect(() => {
    if (burnRef.current) burnRef.current.visible = false;
  }, []);

  const rockRef = useRef<THREE.Group>(null);
  const burnRef = useRef<THREE.Group>(null);
  const burnMatARef = useRef<THREE.MeshBasicMaterial>(null);
  const burnMatBRef = useRef<THREE.MeshBasicMaterial>(null);
  /** `floor(phase)` lần trước — đổi thì gán lại UV cho A/B. */
  const burnCrossfadeI0Ref = useRef<number | null>(null);

  const burnPlaneW = burnHalf * METEOR_BURN_SIZE_MULT;
  const burnPlaneH = burnHalf * METEOR_BURN_SIZE_MULT;

  const totalLife = fallMs + burnDurationMs + 800;

  useEffect(() => {
    const t = window.setTimeout(() => removeMeteorFx(seq), totalLife);
    return () => window.clearTimeout(t);
  }, [seq, totalLife, removeMeteorFx]);

  useFrame((_, delta) => {
    const elapsed = Math.max(0, Date.now() - startMs);
    const p = Math.min(1, elapsed / Math.max(1, fallMs));
    const x = fromX + (aimX - fromX) * p;
    const z = fromZ + (aimZ - fromZ) * p;
    const y = ROCK_Y0 * (1 - p) + 0.4;
    if (rockRef.current) {
      rockRef.current.position.set(x, y, z);
      rockRef.current.visible = elapsed < fallMs + 350;
      rockRef.current.rotation.y += delta * 2.8;
      rockRef.current.rotation.x += delta * 1.6;
    }
    const afterImpact = elapsed - fallMs;
    const matA = burnMatARef.current;
    const matB = burnMatBRef.current;
    if (burnRef.current && matA && matB) {
      burnRef.current.position.set(aimX, METEOR_BURN_GROUND_Y, aimZ);
      if (afterImpact < 0) {
        burnRef.current.visible = false;
        burnCrossfadeI0Ref.current = null;
        return;
      }
      burnRef.current.visible = true;
      burnRef.current.rotation.y += delta * 1.2;
      const bp = Math.min(1, afterImpact / Math.max(1, burnDurationMs));
      const baseOp = METEOR_BURN_OPACITY_PEAK * (1 - bp);

      const phase = (afterImpact / 1000) * METEOR_BURN_ANIM_FPS;
      const i0 = Math.floor(phase) % METEOR_BURN_ANIM_FRAME_COUNT;
      let frac = phase - Math.floor(phase);
      if (METEOR_BURN_CROSSFADE_SMOOTH) {
        frac = frac * frac * (3 - 2 * frac);
      }
      if (burnCrossfadeI0Ref.current !== i0) {
        burnCrossfadeI0Ref.current = i0;
        const i1 = (i0 + 1) % METEOR_BURN_ANIM_FRAME_COUNT;
        const col0 = METEOR_BURN_ANIM_COL_FIRST + i0;
        const col1 = METEOR_BURN_ANIM_COL_FIRST + i1;
        applyGridCellUV(
          burnMapA,
          RED_IMPACT_32_SHEET_W,
          RED_IMPACT_32_SHEET_H,
          RED_IMPACT_32_CELL_PX,
          col0,
          METEOR_BURN_ANIM_ROW,
        );
        applyGridCellUV(
          burnMapB,
          RED_IMPACT_32_SHEET_W,
          RED_IMPACT_32_SHEET_H,
          RED_IMPACT_32_CELL_PX,
          col1,
          METEOR_BURN_ANIM_ROW,
        );
      }
      matA.opacity = baseOp * (1 - frac);
      matB.opacity = baseOp * frac;
    }
  });

  return (
    <group>
      <group ref={rockRef} position={[fromX, ROCK_Y0, fromZ]}>
        <primitive object={meteorRoot} scale={METEORITE_MODEL_SCALE} />
      </group>
      <group ref={burnRef}>
        <mesh key={`meteor-burn-a-${String(seq)}`} rotation={[-Math.PI / 2, 0, 0]} renderOrder={0}>
          <planeGeometry args={[burnPlaneW, burnPlaneH]} />
          <meshBasicMaterial
            ref={burnMatARef}
            map={burnMapA}
            color={METEOR_BURN_COLOR}
            transparent
            opacity={0}
            depthWrite={false}
            depthTest={true}
            toneMapped={false}
            side={THREE.DoubleSide}
            blending={THREE.NormalBlending}
          />
        </mesh>
        <mesh key={`meteor-burn-b-${String(seq)}`} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
          <planeGeometry args={[burnPlaneW, burnPlaneH]} />
          <meshBasicMaterial
            ref={burnMatBRef}
            map={burnMapB}
            color={METEOR_BURN_COLOR}
            transparent
            opacity={0}
            depthWrite={false}
            depthTest={true}
            toneMapped={false}
            side={THREE.DoubleSide}
            blending={THREE.NormalBlending}
          />
        </mesh>
      </group>
    </group>
  );
}
