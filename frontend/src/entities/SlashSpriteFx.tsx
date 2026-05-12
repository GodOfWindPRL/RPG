import { useTexture } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { SlashSpritePreset } from '../vfx/slashSpriteFrameUrls';
import { SLASH_SPRITE_FRAME_URLS } from '../vfx/slashSpriteFrameUrls';
import { useGameStore } from '../systems/gameStore';

type SlashSpriteFxProps = {
  playToken: number;
  x: number;
  z: number;
  yaw: number;
  durationSec: number;
  preset: SlashSpritePreset;
  /** Đẩy tâm hiệu ứng theo hướng nhìn (m); Savage cần xa hơn Slash. */
  forwardOffsetM?: number;
  /** Nhân thêm lên `VFX_WORLD_SCALE` (1 = mặc định; Savage dùng `SAVAGE_VFX_WORLD_SCALE_MUL`). */
  worldScaleMul?: number;
  /** Mỗi frame lấy vị trí / yaw từ nhân vật (tránh VFX đứng yên khi di chuyển). */
  anchorToPlayer?: boolean;
  onFinished?: () => void;
};

/** Nửa cạnh gốc (m) trước khi nhân scale — cùng thứ tự với `SlashArcFx` / hit range. */
const PLANE_W_BASE = 4.2;
const VFX_WORLD_SCALE = 2;
/** Đẩy tâm VFX Slash (lùi 20% so với 1.95 → 1.56). */
const DEFAULT_FORWARD_OFFSET_M = 1.56;
/** Savage: combo; lùi thêm 20% so với 1.632 (1.632 × 0.8). */
export const SAVAGE_SPRITE_FORWARD_OFFSET_M = 1.3056;
/** Savage: nhỏ Slash 30% rồi to lại 10% → 0.7 × 1.1. */
export const SAVAGE_VFX_WORLD_SCALE_MUL = 0.77;
/** Cùng độ cao nhóm vung kiếm procedural — ngang thân / tay. */
const SLASH_SPRITE_Y = 0.95;

export function SlashSpriteFx({
  playToken,
  x,
  z,
  yaw,
  durationSec,
  preset,
  forwardOffsetM = DEFAULT_FORWARD_OFFSET_M,
  worldScaleMul = 1,
  anchorToPlayer = false,
  onFinished,
}: SlashSpriteFxProps) {
  const urls = SLASH_SPRITE_FRAME_URLS[preset];
  const frameUrls = urls.length > 0 ? urls : SLASH_SPRITE_FRAME_URLS.slash2;
  const textures = useTexture(frameUrls);
  const texList = useMemo(() => (Array.isArray(textures) ? textures : [textures]), [textures]);
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const t0Ref = useRef<number | null>(null);
  const dur = useMemo(() => {
    const d = typeof durationSec === 'number' && Number.isFinite(durationSec) ? durationSec : 0.28;
    return Math.max(0.08, Math.min(1.2, d));
  }, [durationSec]);

  useLayoutEffect(() => {
    const g = groupRef.current;
    if (g) {
      if (anchorToPlayer) {
        const st = useGameStore.getState();
        const ch = st.character;
        if (ch) {
          const y = st.playerFacingYaw;
          g.position.set(ch.posX + Math.sin(y) * forwardOffsetM, SLASH_SPRITE_Y, ch.posZ + Math.cos(y) * forwardOffsetM);
          g.rotation.set(0, y, 0);
        }
      } else {
        g.position.set(x + Math.sin(yaw) * forwardOffsetM, SLASH_SPRITE_Y, z + Math.cos(yaw) * forwardOffsetM);
        g.rotation.set(0, yaw, 0);
      }
    }
    t0Ref.current = null;
    for (const t of texList) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.ClampToEdgeWrapping;
      t.wrapT = THREE.ClampToEdgeWrapping;
    }
    const m = matRef.current;
    if (m && texList[0]) {
      m.map = texList[0];
      m.needsUpdate = true;
    }
  }, [playToken, preset, texList, anchorToPlayer, x, z, yaw, forwardOffsetM]);

  useFrame((state) => {
    const mat = matRef.current;
    const g = groupRef.current;
    if (!mat || texList.length === 0) return;
    if (t0Ref.current == null) t0Ref.current = state.clock.elapsedTime;
    const elapsed = state.clock.elapsedTime - t0Ref.current;
    const p = Math.min(1, elapsed / dur);
    const fi = Math.min(texList.length - 1, Math.floor(p * texList.length));
    const map = texList[fi]!;
    if (mat.map !== map) {
      mat.map = map;
      mat.needsUpdate = true;
    }
    mat.opacity = Math.max(0, 0.95 * (1 - p * p * 0.45));

    let px = x;
    let pz = z;
    let y = yaw;
    if (anchorToPlayer) {
      const st = useGameStore.getState();
      const ch = st.character;
      if (ch) {
        px = ch.posX;
        pz = ch.posZ;
        y = st.playerFacingYaw;
      }
    }
    const cx = px + Math.sin(y) * forwardOffsetM;
    const cz = pz + Math.cos(y) * forwardOffsetM;
    if (g) {
      g.position.set(cx, SLASH_SPRITE_Y, cz);
      g.rotation.set(0, y, 0);
    }
  });

  useEffect(() => {
    const ms = Math.ceil(dur * 1000) + 40;
    const id = window.setTimeout(() => onFinished?.(), ms);
    return () => window.clearTimeout(id);
  }, [playToken, dur, onFinished]);

  const planeHBase = useMemo(() => {
    const t0 = texList[0];
    if (!t0?.image) return PLANE_W_BASE;
    const w = (t0.image as HTMLImageElement).width || 1;
    const h = (t0.image as HTMLImageElement).height || 1;
    return PLANE_W_BASE * (h / w);
  }, [texList]);

  const s = VFX_WORLD_SCALE * worldScaleMul;

  return (
    <group ref={groupRef} position={[0, 0, 0]} rotation={[0, 0, 0]}>
      {/*
        Khớp trục với SlashArcFx (mesh +PI/2 X). Thêm PI quanh Y để sprite không bị lật
        sau lưng / đảo chiều quét so với hướng gameplay.
      */}
      <mesh
        rotation={[Math.PI / 2, Math.PI, 0]}
        scale={[s, s, s]}
        renderOrder={4}
      >
        <planeGeometry args={[PLANE_W_BASE, planeHBase]} />
        <meshBasicMaterial
          ref={matRef}
          transparent
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}
