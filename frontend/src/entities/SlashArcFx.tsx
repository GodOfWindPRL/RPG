import { useEffect, useLayoutEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SLASH_EFFECT_RANGE } from '../core/combatConstants';
import { useGameStore } from '../systems/gameStore';

const INNER = 0.12;
const DELAY = 0.5;
const DURATION = 0.36;
const BLADE_ARC = 0.38;
const RING_SEGMENTS = 48;

/**
 * Nửa vòng trước mặt: θ=0 phải (+X), θ=π trái (-X). Quét trái → phải.
 */
function buildSweepRing(centerTheta: number): THREE.RingGeometry | null {
  const half = BLADE_ARC / 2;
  let thetaStart = centerTheta - half;
  let thetaLength = BLADE_ARC;
  if (thetaStart < 0) {
    thetaLength += thetaStart;
    thetaStart = 0;
  }
  if (thetaStart + thetaLength > Math.PI) {
    thetaLength = Math.PI - thetaStart;
  }
  if (thetaLength < 0.04) return null;

  const geo = new THREE.RingGeometry(INNER, SLASH_EFFECT_RANGE, RING_SEGMENTS, 1, thetaStart, thetaLength);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const n = pos.count;
  const colorArr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const ang = Math.atan2(py, px);
    const t = THREE.MathUtils.clamp((ang - thetaStart) / thetaLength, 0, 1);
    // t=0 trái, t=1 phải — đầu kiếm (phải) sáng hơn khi quét trái→phải
    const head = Math.pow(t, 0.55);
    const trail = Math.pow(1 - t, 1.15);
    colorArr[i * 3] = 1;
    colorArr[i * 3 + 1] = 0.32 + 0.58 * head + 0.1 * trail;
    colorArr[i * 3 + 2] = 0.02 + 0.38 * head;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colorArr, 3));
  return geo;
}

type SlashArcFxProps = {
  seq: number;
  x: number;
  z: number;
  yaw: number;
};

export function SlashArcFx({ seq, x, z, yaw }: SlashArcFxProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const t0Ref = useRef<number | null>(null);
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (mesh.geometry) mesh.geometry.dispose();
    const g = buildSweepRing(Math.PI * 0.9);
    if (g) mesh.geometry = g;
    t0Ref.current = null;
    const m = matRef.current;
    if (m) m.opacity = 0.88;
  }, [seq]);

  useEffect(
    () => () => {
      meshRef.current?.geometry?.dispose();
    },
    [seq],
  );

  useEffect(() => {
    const mySeq = seq;
    const t = window.setTimeout(() => {
      const s = useGameStore.getState();
      if (s.slashFx?.seq === mySeq) s.clearSlashFx();
    }, Math.ceil((DELAY + DURATION) * 1000) + 80);
    return () => window.clearTimeout(t);
  }, [seq]);

  useFrame((state) => {
    if (t0Ref.current == null) t0Ref.current = state.clock.elapsedTime;
    const mat = matRef.current;
    const mesh = meshRef.current;
    if (!mat || !mesh) return;

    const elapsed = state.clock.elapsedTime - t0Ref.current;
    if (elapsed < DELAY) {
      mat.opacity = 0;
      return;
    }
    const tAnim = elapsed - DELAY;
    const p = Math.min(1, tAnim / DURATION);
    const ease = 1 - (1 - p) ** 2;
    mat.opacity = 0.88 * (1 - p * p);

    // Trái (0.9π) → phải (0.1π)
    const center = Math.PI * (0.9 - 0.8 * ease);
    const next = buildSweepRing(center);
    if (!next) return;
    if (mesh.geometry) mesh.geometry.dispose();
    mesh.geometry = next;
  });

  return (
    <group position={[x, 0.06, z]} rotation={[0, yaw, 0]}>
      <mesh ref={meshRef} rotation={[Math.PI / 2, 0, 0]} renderOrder={3}>
        <meshBasicMaterial
          ref={matRef}
          color="#ffffff"
          vertexColors
          transparent
          opacity={0.88}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}
