import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGameStore } from "../systems/gameStore";

const PROJECTILE_Y = 1.05;
const EXPLOSION_MS = 420;

type ChaosOrbFxProps = {
  seq: number;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  startMs: number;
  travelMs: number;
  radius: number;
  explosions: { t: number; x: number; z: number }[];
};

export function ChaosOrbFx({
  seq,
  fromX,
  fromZ,
  toX,
  toZ,
  startMs,
  travelMs,
  radius,
  explosions,
}: ChaosOrbFxProps) {
  const removeChaosOrbFx = useGameStore((s) => s.removeChaosOrbFx);
  const orbRef = useRef<THREE.Group>(null);
  const coreMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const haloMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const expRefs = useRef<(THREE.Group | null)[]>([]);
  const expRingMatRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const expBallRefs = useRef<(THREE.Mesh | null)[]>([]);
  const expBallMatRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const expLightRefs = useRef<(THREE.PointLight | null)[]>([]);
  const expStartMs = useMemo(
    () => explosions.map((e) => startMs + Math.round(travelMs * e.t)),
    [explosions, startMs, travelMs],
  );

  useEffect(() => {
    const t = window.setTimeout(
      () => removeChaosOrbFx(seq),
      travelMs + EXPLOSION_MS + 600,
    );
    return () => window.clearTimeout(t);
  }, [seq, travelMs, removeChaosOrbFx]);

  useFrame(() => {
    const elapsed = Math.max(0, Date.now() - startMs);
    const p = Math.min(1, elapsed / Math.max(1, travelMs));
    const x = fromX + (toX - fromX) * p;
    const z = fromZ + (toZ - fromZ) * p;
    if (orbRef.current) orbRef.current.position.set(x, PROJECTILE_Y, z);
    const pulse = 1 + Math.sin(elapsed * 0.028) * 0.12;
    if (coreMatRef.current) coreMatRef.current.opacity = 0.92;
    if (haloMatRef.current)
      haloMatRef.current.opacity = 0.45 + 0.08 * Math.sin(elapsed * 0.02);
    if (orbRef.current) orbRef.current.scale.setScalar(pulse);

    // Explosions: expand + fade for each scheduled time.
    for (let i = 0; i < explosions.length; i++) {
      const g = expRefs.current[i];
      const mRing = expRingMatRefs.current[i];
      const ball = expBallRefs.current[i];
      const mBall = expBallMatRefs.current[i];
      const light = expLightRefs.current[i];
      if (!g || !mRing || !ball || !mBall) continue;
      const dt = Date.now() - expStartMs[i]!;
      if (dt < 0) {
        g.visible = false;
        continue;
      }
      const ep = Math.min(1, dt / EXPLOSION_MS);
      g.visible = ep < 1;
      const sRing = 0.26 + radius * 0.88 * Math.pow(ep, 0.7);
      // ring uses group's XZ scale; ball uses its own scalar
      g.scale.set(sRing, 1, sRing);
      mRing.opacity = 0.85 * (1 - ep) * (1 - ep);
      const sBall = 0.25 + (radius - 0.25) * Math.pow(ep, 0.55);
      ball.scale.setScalar(sBall);
      mBall.opacity = 0.95 * (1 - Math.pow(ep, 1.35));
      const col = new THREE.Color().setHSL(
        0.34 - 0.08 * ep,
        0.95,
        0.58 - 0.22 * ep,
      );
      mBall.color.copy(col);
      if (light) {
        light.intensity = Math.max(0, 10 * (1 - Math.pow(ep, 0.65)));
        light.distance = 4 + radius * 2;
      }
    }
  });

  return (
    <>
      <group ref={orbRef} position={[fromX, PROJECTILE_Y, fromZ]}>
        <pointLight color="#6ee7b7" intensity={3.5} distance={7} decay={2} />
        <mesh renderOrder={6}>
          <sphereGeometry args={[0.5, 16, 16]} />
          <meshBasicMaterial
            ref={haloMatRef}
            color="#22c55e"
            transparent
            opacity={0.5}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        <mesh renderOrder={7}>
          <sphereGeometry args={[0.22, 16, 16]} />
          <meshBasicMaterial
            ref={coreMatRef}
            color="#bbf7d0"
            transparent
            opacity={0.92}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>

      {explosions.map((e, i) => (
        <group
          key={`exp_${seq}_${i}`}
          ref={(el) => {
            expRefs.current[i] = el;
          }}
          position={[e.x, 0.06, e.z]}
          visible={false}
        >
          <pointLight
            ref={(el) => {
              expLightRefs.current[i] = el;
            }}
            color="#34d399"
            intensity={0}
            distance={6}
            decay={2}
          />
          {/* Shockwave ring */}
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0.02, 0]}
            renderOrder={5}
          >
            <torusGeometry args={[1, 0.12, 12, 48]} />
            <meshBasicMaterial
              ref={(el) => {
                expRingMatRefs.current[i] = el;
              }}
              color="#34d399"
              transparent
              opacity={0}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              side={THREE.DoubleSide}
            />
          </mesh>
          {/* Expanding poison blast ball */}
          <mesh
            renderOrder={6}
            position={[0, 0.55, 0]}
            scale={[0.001, 0.001, 0.001]}
            ref={(el) => {
              expBallRefs.current[i] = el;
            }}
          >
            <sphereGeometry args={[1, 18, 18]} />
            <meshBasicMaterial
              ref={(el) => {
                expBallMatRefs.current[i] = el;
              }}
              color="#bbf7d0"
              transparent
              opacity={0}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </group>
      ))}
    </>
  );
}
