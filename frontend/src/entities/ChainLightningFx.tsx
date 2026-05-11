import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../systems/gameStore';

const BOLT_Y = 1.12;

type Seg = { fromX: number; fromZ: number; toX: number; toZ: number };

type ChainLightningFxProps = {
  seq: number | string;
  segments: Seg[];
  segmentMs: number;
  startMs: number;
};

export function ChainLightningFx({ seq, segments, segmentMs, startMs }: ChainLightningFxProps) {
  const removeFx = useGameStore((s) => s.removeChainLightningFx);
  const groupRef = useRef<THREE.Group>(null);
  const coreMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const totalMs = useMemo(() => {
    const n = Math.max(1, segments.length);
    return n * segmentMs + 280;
  }, [segments.length, segmentMs]);

  useEffect(() => {
    const t = window.setTimeout(() => removeFx(seq), totalMs);
    return () => window.clearTimeout(t);
  }, [seq, totalMs, removeFx]);

  useFrame(() => {
    const elapsed = Math.max(0, Date.now() - startMs);
    const idx = Math.min(segments.length - 1, Math.floor(elapsed / Math.max(1, segmentMs)));
    const seg = segments[idx];
    if (!seg || !groupRef.current) return;
    const localT = (elapsed - idx * segmentMs) / Math.max(1, segmentMs);
    const p = Math.min(1, Math.max(0, localT));
    const mx = seg.fromX + (seg.toX - seg.fromX) * p;
    const mz = seg.fromZ + (seg.toZ - seg.fromZ) * p;
    groupRef.current.position.set(mx, BOLT_Y, mz);
    if (coreMatRef.current) {
      coreMatRef.current.opacity = 0.55 + 0.35 * Math.sin(elapsed * 0.12);
    }
  });

  return (
    <group ref={groupRef} renderOrder={4}>
      <pointLight color="#7dd3fc" intensity={2.2} distance={9} decay={2} />
      <mesh>
        <sphereGeometry args={[0.28, 12, 12]} />
        <meshBasicMaterial
          ref={coreMatRef}
          color="#e0f2fe"
          transparent
          opacity={0.75}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh scale={[1.6, 0.35, 1.6]}>
        <sphereGeometry args={[0.32, 10, 10]} />
        <meshBasicMaterial
          color="#38bdf8"
          transparent
          opacity={0.22}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}
