import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../systems/gameStore';

const SHARD_TICK_MS = 200;
const SHARD_FALL_MS = 450;
const SHARD_SPLASH_MS = 280;
const SHARD_SPAWN_Y = 7.0;
const SHARD_POOL = 16;
const FADE_TAIL_MS = 600;

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
};

export function BlizzardFx({ seq, centerX, centerZ, startMs, durationMs, half }: BlizzardFxProps) {
  const removeBlizzardFx = useGameStore((s) => s.removeBlizzardFx);

  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const ringMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const fillRef = useRef<THREE.Mesh>(null);
  const fillMatRef = useRef<THREE.MeshBasicMaterial>(null);

  // Shard pool refs
  const shardGroupRefs = useRef<(THREE.Group | null)[]>(Array.from({ length: SHARD_POOL }, () => null));
  const shardMeshRefs = useRef<(THREE.Mesh | null)[]>(Array.from({ length: SHARD_POOL }, () => null));
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

  // Pre-randomize shard rotations for variety
  const shardRotations = useMemo(() => {
    return Array.from({ length: SHARD_POOL }, () => ({
      rx: Math.random() * Math.PI,
      ry: Math.random() * Math.PI,
      rz: Math.random() * Math.PI,
    }));
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => removeBlizzardFx(seq), totalLifeMs + 80);
    return () => window.clearTimeout(t);
  }, [seq, totalLifeMs, removeBlizzardFx]);

  useFrame(() => {
    const now = Date.now();
    const elapsed = Math.max(0, now - startMs);

    // ─── Spawn shards every SHARD_TICK_MS while storm is active ─────────────
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

    // ─── Update each shard ─────────────────────────────────────────────────
    for (let i = 0; i < SHARD_POOL; i++) {
      const s = shards.current[i];
      const grp = shardGroupRefs.current[i];
      const mesh = shardMeshRefs.current[i];
      const mat = shardMatRefs.current[i];
      const splash = splashRefs.current[i];
      const splashMat = splashMatRefs.current[i];
      if (!grp || !mesh || !mat || !splash || !splashMat) continue;

      if (s.state === 'idle') {
        grp.visible = false;
        mat.opacity = 0;
        splashMat.opacity = 0;
        continue;
      }

      grp.visible = true;
      grp.position.x = s.x;
      grp.position.z = s.z;

      const dt = elapsed - s.startedAt;
      if (s.state === 'falling') {
        const p = Math.min(1, dt / SHARD_FALL_MS);
        const y = SHARD_SPAWN_Y * (1 - p);
        mesh.position.y = y + 0.3;
        mesh.rotation.x += 0.18;
        mesh.rotation.z += 0.12;
        mat.opacity = 0.85;
        splashMat.opacity = 0;
        splash.scale.setScalar(0.001);
        if (p >= 1) {
          shards.current[i] = { ...s, state: 'splash', startedAt: elapsed };
        }
        continue;
      }

      if (s.state === 'splash') {
        const sp = Math.min(1, dt / SHARD_SPLASH_MS);
        // Hide the falling shard mesh
        mat.opacity = Math.max(0, 0.85 * (1 - sp * 1.6));
        mesh.position.y = 0.3 - sp * 0.15;
        // Splash ring grows + fades
        const r = 0.2 + sp * 1.1;
        splash.scale.set(r, 1, r);
        splashMat.opacity = 0.85 * (1 - sp);
        if (sp >= 1) {
          shards.current[i] = { state: 'idle', x: 0, z: 0, startedAt: 0 };
        }
      }
    }

    // ─── Fade ground marker after storm ends ───────────────────────────────
    if (elapsed > durationMs) {
      const fade = Math.min(1, (elapsed - durationMs) / FADE_TAIL_MS);
      if (ringMatRef.current) ringMatRef.current.opacity = 0.55 * (1 - fade);
      if (fillMatRef.current) fillMatRef.current.opacity = 0.18 * (1 - fade);
    } else {
      // Subtle pulsing while active
      const pulse = 0.45 + Math.sin(elapsed * 0.012) * 0.12;
      if (ringMatRef.current) ringMatRef.current.opacity = pulse;
      if (fillMatRef.current) fillMatRef.current.opacity = 0.16;
    }
  });

  const sideLen = half * 2;

  return (
    <group ref={groupRef} position={[centerX, 0, centerZ]}>
      {/* Ground area fill (icy translucent square) */}
      <mesh ref={fillRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} renderOrder={2}>
        <planeGeometry args={[sideLen, sideLen]} />
        <meshBasicMaterial
          ref={fillMatRef}
          color="#7ed1ff"
          transparent
          opacity={0.16}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* Ground area border ring (square outline using torus rotated, but a ring is cleaner) */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} renderOrder={3}>
        <ringGeometry args={[half - 0.08, half + 0.08, 48]} />
        <meshBasicMaterial
          ref={ringMatRef}
          color="#bce8ff"
          transparent
          opacity={0.55}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Shard pool */}
      {Array.from({ length: SHARD_POOL }).map((_, i) => (
        <group
          key={`bs-${i}`}
          ref={(el) => {
            shardGroupRefs.current[i] = el;
          }}
          visible={false}
        >
          {/* Falling ice shard */}
          <mesh
            ref={(el) => {
              shardMeshRefs.current[i] = el;
            }}
            rotation={[shardRotations[i].rx, shardRotations[i].ry, shardRotations[i].rz]}
            renderOrder={5}
          >
            <octahedronGeometry args={[0.32, 0]} />
            <meshBasicMaterial
              ref={(el) => {
                shardMatRefs.current[i] = el;
              }}
              color="#bfeaff"
              transparent
              opacity={0}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
          {/* Ground splash ring */}
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
