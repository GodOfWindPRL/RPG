import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../systems/gameStore';

const ROCK_Y0 = 18;

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
  const rockRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.MeshBasicMaterial>(null);
  const burnRef = useRef<THREE.Mesh>(null);
  const burnMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const totalLife = fallMs + burnDurationMs + 800;

  useEffect(() => {
    const t = window.setTimeout(() => removeMeteorFx(seq), totalLife);
    return () => window.clearTimeout(t);
  }, [seq, totalLife, removeMeteorFx]);

  useFrame(() => {
    const elapsed = Math.max(0, Date.now() - startMs);
    const p = Math.min(1, elapsed / Math.max(1, fallMs));
    const x = fromX + (aimX - fromX) * p;
    const z = fromZ + (aimZ - fromZ) * p;
    const y = ROCK_Y0 * (1 - p) + 0.4;
    if (rockRef.current) {
      rockRef.current.position.set(x, y, z);
      rockRef.current.visible = elapsed < fallMs + 350;
    }
    if (glowRef.current) glowRef.current.opacity = 0.5 + 0.2 * Math.sin(elapsed * 0.04);

    const afterImpact = elapsed - fallMs;
    if (burnRef.current && burnMatRef.current) {
      burnRef.current.position.set(aimX, 0.04, aimZ);
      if (afterImpact < 0) {
        burnRef.current.visible = false;
        return;
      }
      burnRef.current.visible = true;
      const bp = Math.min(1, afterImpact / Math.max(1, burnDurationMs));
      burnMatRef.current.opacity = 0.48 * (1 - bp);
    }
  });

  return (
    <group>
      <group ref={rockRef} position={[fromX, ROCK_Y0, fromZ]}>
        <mesh castShadow>
          <dodecahedronGeometry args={[0.55, 0]} />
          <meshStandardMaterial color="#7c2d12" emissive="#ea580c" emissiveIntensity={0.35} roughness={0.45} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.9, 12, 12]} />
          <meshBasicMaterial
            ref={glowRef}
            color="#f97316"
            transparent
            opacity={0.5}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>
      <mesh ref={burnRef} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={3}>
        <circleGeometry args={[burnHalf, 48]} />
        <meshBasicMaterial
          ref={burnMatRef}
          color="#f97316"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}
