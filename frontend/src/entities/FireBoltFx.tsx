import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../systems/gameStore';

const TRAIL_COUNT = 10;
const SPARK_COUNT = 14;
const PROJECTILE_Y = 1.05;
const EXPLOSION_MS = 600;

type FireBoltFxProps = {
  seq: number | string;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  startMs: number;
  travelMs: number;
  /** Damage radius (used to size the explosion). */
  radius: number;
};

export function FireBoltFx({ seq, fromX, fromZ, toX, toZ, startMs, travelMs, radius }: FireBoltFxProps) {
  const removeFireboltFx = useGameStore((s) => s.removeFireboltFx);

  // Projectile refs
  const projGroupRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const haloMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const coreMatRef = useRef<THREE.MeshBasicMaterial>(null);

  // Trail refs (each is a small sphere)
  const trailRefs = useRef<(THREE.Mesh | null)[]>(Array.from({ length: TRAIL_COUNT }, () => null));
  const trailMatRefs = useRef<(THREE.MeshBasicMaterial | null)[]>(
    Array.from({ length: TRAIL_COUNT }, () => null),
  );
  const trailHistory = useRef<{ x: number; z: number }[]>([]);

  // Explosion refs
  const expGroupRef = useRef<THREE.Group>(null);
  const expCoreRef = useRef<THREE.Mesh>(null);
  const expCoreMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const expRingRef = useRef<THREE.Mesh>(null);
  const expRingMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const expLightRef = useRef<THREE.PointLight>(null);

  // Spark particles
  const sparkGroupRef = useRef<THREE.Group>(null);
  const sparkRefs = useRef<(THREE.Mesh | null)[]>(Array.from({ length: SPARK_COUNT }, () => null));
  const sparkMatRefs = useRef<(THREE.MeshBasicMaterial | null)[]>(
    Array.from({ length: SPARK_COUNT }, () => null),
  );
  const sparkVelocities = useMemo(() => {
    const arr: { vx: number; vy: number; vz: number }[] = [];
    for (let i = 0; i < SPARK_COUNT; i++) {
      const ang = (i / SPARK_COUNT) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 3 + Math.random() * 2.5;
      arr.push({
        vx: Math.cos(ang) * speed,
        vy: 1.5 + Math.random() * 2.0,
        vz: Math.sin(ang) * speed,
      });
    }
    return arr;
  }, []);

  // Auto-cleanup after explosion fully fades.
  useEffect(() => {
    const t = window.setTimeout(() => removeFireboltFx(seq), travelMs + EXPLOSION_MS + 120);
    return () => window.clearTimeout(t);
  }, [seq, travelMs, removeFireboltFx]);

  useFrame((_, dt) => {
    const elapsed = Math.max(0, Date.now() - startMs);

    // ─── Phase 1: travel ───────────────────────────────────────────────────
    if (elapsed < travelMs) {
      const p = elapsed / travelMs;
      const x = fromX + (toX - fromX) * p;
      const z = fromZ + (toZ - fromZ) * p;
      const grp = projGroupRef.current;
      if (grp) grp.position.set(x, PROJECTILE_Y, z);
      // subtle pulsing scale on core
      const pulse = 1 + Math.sin(elapsed * 0.025) * 0.12;
      const core = coreRef.current;
      if (core) core.scale.setScalar(pulse);
      const halo = haloRef.current;
      if (halo) halo.scale.setScalar(1 + Math.sin(elapsed * 0.02) * 0.18);

      // Push trail position history
      trailHistory.current.push({ x, z });
      if (trailHistory.current.length > TRAIL_COUNT) trailHistory.current.shift();
      for (let i = 0; i < TRAIL_COUNT; i++) {
        const m = trailRefs.current[i];
        const mat = trailMatRefs.current[i];
        const histIdx = trailHistory.current.length - 1 - i;
        if (!m || !mat || histIdx < 0) {
          if (mat) mat.opacity = 0;
          continue;
        }
        const h = trailHistory.current[histIdx];
        m.position.set(h.x, PROJECTILE_Y - 0.04 - i * 0.015, h.z);
        const fade = 1 - i / TRAIL_COUNT;
        m.scale.setScalar(0.55 * fade + 0.05);
        mat.opacity = 0.7 * fade;
      }

      // Hide explosion bits during travel
      if (expGroupRef.current) expGroupRef.current.visible = false;
      return;
    }

    // ─── Phase 2: explosion ────────────────────────────────────────────────
    const expElapsed = elapsed - travelMs;
    const expP = Math.min(1, expElapsed / EXPLOSION_MS);

    // Hide projectile
    if (projGroupRef.current) projGroupRef.current.visible = false;
    for (let i = 0; i < TRAIL_COUNT; i++) {
      const mat = trailMatRefs.current[i];
      if (mat) mat.opacity = Math.max(0, mat.opacity - dt * 4);
    }

    if (expGroupRef.current) {
      expGroupRef.current.visible = true;
      expGroupRef.current.position.set(toX, 0.05, toZ);
    }

    // Expanding fire ball: r 0.3 → radius, fade out near end
    const coreScale = 0.3 + (radius - 0.3) * Math.pow(expP, 0.55);
    if (expCoreRef.current) {
      expCoreRef.current.scale.setScalar(coreScale);
      expCoreRef.current.position.y = 0.6 + expP * 0.4;
    }
    if (expCoreMatRef.current) {
      // Color shift yellow → orange → dark red as it fades
      const c = new THREE.Color()
        .setHSL(0.12 - 0.08 * expP, 1, 0.55 - 0.25 * expP);
      expCoreMatRef.current.color.copy(c);
      expCoreMatRef.current.opacity = 0.95 * (1 - Math.pow(expP, 1.4));
    }

    // Ground shockwave torus
    const ringR = 0.5 + (radius * 1.15) * Math.pow(expP, 0.7);
    if (expRingRef.current) {
      expRingRef.current.scale.set(ringR, ringR, 1);
    }
    if (expRingMatRef.current) {
      expRingMatRef.current.opacity = 0.9 * (1 - expP) * (1 - expP);
    }

    // Light flash
    if (expLightRef.current) {
      expLightRef.current.intensity = Math.max(0, 12 * (1 - Math.pow(expP, 0.6)));
      expLightRef.current.distance = 4 + radius * 2;
    }

    // Spark particles
    for (let i = 0; i < SPARK_COUNT; i++) {
      const m = sparkRefs.current[i];
      const mat = sparkMatRefs.current[i];
      if (!m || !mat) continue;
      const v = sparkVelocities[i];
      const t = expElapsed / 1000;
      const px = v.vx * t;
      const py = Math.max(0, v.vy * t - 4.5 * t * t);
      const pz = v.vz * t;
      m.position.set(px, py + 0.4, pz);
      mat.opacity = Math.max(0, 0.9 * (1 - expP * 1.3));
      m.scale.setScalar(0.18 * Math.max(0.2, 1 - expP * 0.7));
    }
  });

  return (
    <>
      {/* Projectile */}
      <group ref={projGroupRef} position={[fromX, PROJECTILE_Y, fromZ]}>
        <pointLight ref={lightRef} color="#ffb066" intensity={3} distance={6} decay={2} />
        {/* Outer halo */}
        <mesh ref={haloRef} renderOrder={5}>
          <sphereGeometry args={[0.55, 16, 16]} />
          <meshBasicMaterial
            ref={haloMatRef}
            color="#ff7a1a"
            transparent
            opacity={0.45}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        {/* Mid orange shell */}
        <mesh renderOrder={6}>
          <sphereGeometry args={[0.32, 16, 16]} />
          <meshBasicMaterial
            color="#ff9a32"
            transparent
            opacity={0.85}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        {/* Bright inner core */}
        <mesh ref={coreRef} renderOrder={7}>
          <sphereGeometry args={[0.18, 16, 16]} />
          <meshBasicMaterial
            ref={coreMatRef}
            color="#fff7c8"
            transparent
            opacity={0.95}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>

      {/* Trail */}
      {Array.from({ length: TRAIL_COUNT }).map((_, i) => (
        <mesh
          key={`tr-${i}`}
          ref={(el) => {
            trailRefs.current[i] = el;
          }}
          renderOrder={4}
        >
          <sphereGeometry args={[0.22, 10, 10]} />
          <meshBasicMaterial
            ref={(el) => {
              trailMatRefs.current[i] = el;
            }}
            color="#ff5b14"
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}

      {/* Explosion */}
      <group ref={expGroupRef} visible={false}>
        <pointLight ref={expLightRef} color="#ffb066" intensity={0} distance={6} decay={2} />
        {/* Ground shockwave (flat torus) */}
        <mesh ref={expRingRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} renderOrder={3}>
          <torusGeometry args={[1, 0.12, 12, 48]} />
          <meshBasicMaterial
            ref={expRingMatRef}
            color="#ff8a2c"
            transparent
            opacity={0.9}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        {/* Bright fireball */}
        <mesh ref={expCoreRef} position={[0, 0.6, 0]} renderOrder={6}>
          <sphereGeometry args={[1, 20, 20]} />
          <meshBasicMaterial
            ref={expCoreMatRef}
            color="#ffd66e"
            transparent
            opacity={0.95}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        {/* Sparks */}
        <group ref={sparkGroupRef}>
          {Array.from({ length: SPARK_COUNT }).map((_, i) => (
            <mesh
              key={`sp-${i}`}
              ref={(el) => {
                sparkRefs.current[i] = el;
              }}
              renderOrder={6}
            >
              <sphereGeometry args={[1, 8, 8]} />
              <meshBasicMaterial
                ref={(el) => {
                  sparkMatRefs.current[i] = el;
                }}
                color="#ffd06a"
                transparent
                opacity={0}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
          ))}
        </group>
      </group>
    </>
  );
}
