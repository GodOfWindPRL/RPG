import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';
import { useGameStore } from '../systems/gameStore';
import waterEffectBulletUrl from '../assets/vfx/EffectBullet/Water Effect and Bullet 16x16.png';
import { applyEffectBulletCellUV, EFFECT_BULLET_COLS } from '../vfx/effectBulletAtlas';

/** Tần suất rơi: ngắn hơn 200ms ~30% → nhiều mảnh hơn. */
const SHARD_TICK_MS = Math.round(200 / 1.3);
const SHARD_FALL_MS = 450;
const SHARD_SPLASH_MS = 280;
const SHARD_SPAWN_Y = 7.0;
const SHARD_POOL = 16;
const FADE_TAIL_MS = 600;
const SHARD_SPIN_RAD_S = 5.2;

/** Cột cuối sheet, dòng 8 (1-based từ trên → index 7). */
const BLIZZARD_SHARD_FRAME_COL = EFFECT_BULLET_COLS - 1;
const BLIZZARD_SHARD_FRAME_ROW = 7;

/** Vòng phạm vi: xanh băng nhạt. */
const BLIZZARD_RING_COLOR = '#d4f1ff';

useTexture.preload(waterEffectBulletUrl);

type ShardState = 'idle' | 'falling' | 'splash';

type FxShard = {
  state: ShardState;
  x: number;
  z: number;
  /** When the shard started falling (ms since storm start). */
  startedAt: number;
};

type BlizzardFxProps = {
  seq: number;
  centerX: number;
  centerZ: number;
  startMs: number;
  durationMs: number;
  /** Half-width of the 5×5 area (≈2.5). */
  half: number;
  /** Server hit radius per shard (≈2 for 4×4 ô). */
  shardRadius?: number;
};

export function BlizzardFx({
  seq,
  centerX,
  centerZ,
  startMs,
  durationMs,
  half,
  shardRadius = 2,
}: BlizzardFxProps) {
  const removeBlizzardFx = useGameStore((s) => s.removeBlizzardFx);

  const waterSheet = useTexture(waterEffectBulletUrl);
  const shardMap = useMemo(() => {
    const t = waterSheet.clone();
    t.needsUpdate = true;
    return t;
  }, [waterSheet]);

  useLayoutEffect(() => {
    const tex = shardMap;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    applyEffectBulletCellUV(tex, BLIZZARD_SHARD_FRAME_COL, BLIZZARD_SHARD_FRAME_ROW);
    return () => {
      tex.dispose();
    };
  }, [shardMap]);

  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const ringMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const shardGroupRefs = useRef<(THREE.Group | null)[]>(Array.from({ length: SHARD_POOL }, () => null));
  const shardFlyRefs = useRef<(THREE.Group | null)[]>(Array.from({ length: SHARD_POOL }, () => null));
  const shardSpinRefs = useRef<(THREE.Group | null)[]>(Array.from({ length: SHARD_POOL }, () => null));
  const shardMatRefs = useRef<(THREE.MeshBasicMaterial | null)[]>(
    Array.from({ length: SHARD_POOL }, () => null),
  );
  const splashRefs = useRef<(THREE.Mesh | null)[]>(Array.from({ length: SHARD_POOL }, () => null));
  const splashMatRefs = useRef<(THREE.MeshBasicMaterial | null)[]>(
    Array.from({ length: SHARD_POOL }, () => null),
  );
  const shards = useRef<FxShard[]>(
    Array.from({ length: SHARD_POOL }, () => ({ state: 'idle', x: 0, z: 0, startedAt: 0 })),
  );
  const lastSpawnRef = useRef<number>(-1);

  const totalLifeMs = durationMs + FADE_TAIL_MS + SHARD_FALL_MS + SHARD_SPLASH_MS;

  useEffect(() => {
    const t = window.setTimeout(() => removeBlizzardFx(seq), totalLifeMs + 80);
    return () => window.clearTimeout(t);
  }, [seq, totalLifeMs, removeBlizzardFx]);

  useFrame((_, delta) => {
    const now = Date.now();
    const elapsed = Math.max(0, now - startMs);

    if (elapsed < durationMs) {
      const tickIdx = Math.floor(elapsed / SHARD_TICK_MS);
      if (tickIdx > lastSpawnRef.current) {
        lastSpawnRef.current = tickIdx;
        const slot = shards.current.findIndex((s) => s.state === 'idle');
        if (slot >= 0) {
          shards.current[slot] = {
            state: 'falling',
            x: (Math.random() * 2 - 1) * half,
            z: (Math.random() * 2 - 1) * half,
            startedAt: elapsed,
          };
        }
      }
    }

    for (let i = 0; i < SHARD_POOL; i++) {
      const s = shards.current[i];
      const grp = shardGroupRefs.current[i];
      const fly = shardFlyRefs.current[i];
      const spin = shardSpinRefs.current[i];
      const mat = shardMatRefs.current[i];
      const splash = splashRefs.current[i];
      const splashMat = splashMatRefs.current[i];
      if (!grp || !fly || !spin || !mat || !splash || !splashMat) continue;

      if (s.state === 'idle') {
        grp.visible = false;
        mat.opacity = 0;
        splashMat.opacity = 0;
        fly.position.y = 0;
        spin.rotation.y = 0;
        continue;
      }

      grp.visible = true;
      grp.position.x = s.x;
      grp.position.z = s.z;
      grp.position.y = 0;

      const dt = elapsed - s.startedAt;
      if (s.state === 'falling') {
        const p = Math.min(1, dt / SHARD_FALL_MS);
        const y = SHARD_SPAWN_Y * (1 - p);
        fly.position.y = y + 0.3;
        spin.rotation.y += delta * SHARD_SPIN_RAD_S;
        mat.opacity = 0.88;
        splashMat.opacity = 0;
        splash.scale.setScalar(0.001);
        if (p >= 1) {
          shards.current[i] = { ...s, state: 'splash', startedAt: elapsed };
        }
        continue;
      }

      if (s.state === 'splash') {
        const sp = Math.min(1, dt / SHARD_SPLASH_MS);
        spin.rotation.y += delta * SHARD_SPIN_RAD_S * 0.35;
        mat.opacity = Math.max(0, 0.88 * (1 - sp * 1.6));
        fly.position.y = 0.3 - sp * 0.15;
        const r = 0.15 + sp * Math.max(0.6, shardRadius * 0.92);
        splash.scale.set(r, 1, r);
        splashMat.opacity = 0.85 * (1 - sp);
        if (sp >= 1) {
          shards.current[i] = { state: 'idle', x: 0, z: 0, startedAt: 0 };
        }
      }
    }

    if (elapsed > durationMs) {
      const fade = Math.min(1, (elapsed - durationMs) / FADE_TAIL_MS);
      if (ringMatRef.current) ringMatRef.current.opacity = 0.55 * (1 - fade);
    } else {
      const pulse = 0.45 + Math.sin(elapsed * 0.012) * 0.12;
      if (ringMatRef.current) ringMatRef.current.opacity = pulse;
    }
  });

  return (
    <group ref={groupRef} position={[centerX, 0, centerZ]}>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} renderOrder={3}>
        <ringGeometry args={[half - 0.08, half + 0.08, 48]} />
        <meshBasicMaterial
          ref={ringMatRef}
          color={BLIZZARD_RING_COLOR}
          transparent
          opacity={0.55}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>

      {Array.from({ length: SHARD_POOL }).map((_, i) => (
        <group
          key={`bs-${i}`}
          ref={(el) => {
            shardGroupRefs.current[i] = el;
          }}
          visible={false}
        >
          <group
            ref={(el) => {
              shardFlyRefs.current[i] = el;
            }}
          >
            <group
              ref={(el) => {
                shardSpinRefs.current[i] = el;
              }}
            >
              <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={5}>
                <planeGeometry args={[0.52, 0.52]} />
                <meshBasicMaterial
                  ref={(el) => {
                    shardMatRefs.current[i] = el;
                  }}
                  map={shardMap}
                  color="#ffffff"
                  transparent
                  opacity={0}
                  depthWrite={false}
                  toneMapped={false}
                  side={THREE.DoubleSide}
                  blending={THREE.AdditiveBlending}
                />
              </mesh>
            </group>
          </group>
          <mesh
            ref={(el) => {
              splashRefs.current[i] = el;
            }}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0.06, 0]}
            renderOrder={4}
          >
            <ringGeometry args={[0.08, 0.18, 24]} />
            <meshBasicMaterial
              ref={(el) => {
                splashMatRefs.current[i] = el;
              }}
              color="#dff5ff"
              transparent
              opacity={0}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
