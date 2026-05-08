import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SLASH_EFFECT_RANGE } from '../core/combatConstants';
import { useGameStore } from '../systems/gameStore';

const INNER = 0.12;
const BLADE_ARC = 0.38;
const RING_SEGMENTS = 48;
/** World XZ hit test: enemy center vs arc samples (meters). */
const ENEMY_HIT_R = 0.85;
const ARC_ANGLE_SAMPLES = 14;
const ARC_RADII_FRAC = [0.2, 0.45, 0.72, 1.0];

function sweepEase01(p: number): number {
  const slowWindow = 0.25;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  if (p < slowWindow) {
    const t = p / slowWindow;
    return slowWindow * t * t * t;
  }
  const t = (p - slowWindow) / (1 - slowWindow);
  const fast = 1 - (1 - t) * (1 - t);
  return slowWindow + (1 - slowWindow) * fast;
}

function arcWindow(centerTheta: number): { thetaStart: number; thetaLength: number } | null {
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
  return { thetaStart, thetaLength };
}

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
  /** How long the swing VFX lasts (seconds). */
  durationSec?: number;
};

export function SlashArcFx({ seq, x, z, yaw, durationSec }: SlashArcFxProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const t0Ref = useRef<number | null>(null);
  const hitSentRef = useRef<Set<string>>(new Set());
  const mCombRef = useRef(new THREE.Matrix4());
  const mRxRef = useRef(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  const vSampleRef = useRef(new THREE.Vector3());
  const dur = useMemo(() => {
    const d = typeof durationSec === 'number' && Number.isFinite(durationSec) ? durationSec : 1.0;
    return Math.max(0.2, Math.min(2.5, d));
  }, [durationSec]);
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (mesh.geometry) mesh.geometry.dispose();
    const g = buildSweepRing(Math.PI * 0.9);
    if (g) mesh.geometry = g;
    t0Ref.current = null;
    const m = matRef.current;
    if (m) m.opacity = 0.88;
    hitSentRef.current = new Set();
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
    }, Math.ceil(dur * 1000) + 120);
    return () => window.clearTimeout(t);
  }, [seq, dur]);

  useFrame((state) => {
    if (t0Ref.current == null) t0Ref.current = state.clock.elapsedTime;
    const mat = matRef.current;
    const mesh = meshRef.current;
    if (!mat || !mesh) return;

    const elapsed = state.clock.elapsedTime - t0Ref.current;
    const p = Math.min(1, elapsed / dur);
    // Sweep timing: very slow start (first 25%), then accelerates.
    // p=0..0.25 uses cubic ease-in; remainder uses quadratic ease-out.
    const ease = sweepEase01(p);
    mat.opacity = 0.88 * (1 - p * p);

    // Trái (0.9π) → phải (0.1π)
    const center = Math.PI * (0.9 - 0.8 * ease);
    const next = buildSweepRing(center);
    if (!next) return;
    if (mesh.geometry) mesh.geometry.dispose();
    mesh.geometry = next;

    const win = arcWindow(center);
    if (!win) return;
    const mComb = mCombRef.current;
    mComb.makeRotationY(yaw).multiply(mRxRef.current);
    const enemies = useGameStore.getState().enemies;
    const px = x;
    const pz = z;
    const v = vSampleRef.current;
    const sent = hitSentRef.current;
    outer: for (const e of enemies) {
      if (e.hp <= 0 || sent.has(e.id)) continue;
      let best = Infinity;
      for (const rf of ARC_RADII_FRAC) {
        const radius = INNER + rf * (SLASH_EFFECT_RANGE - INNER);
        for (let i = 0; i < ARC_ANGLE_SAMPLES; i++) {
          const u = ARC_ANGLE_SAMPLES <= 1 ? 0.5 : i / (ARC_ANGLE_SAMPLES - 1);
          const theta = win.thetaStart + u * win.thetaLength;
          v.set(Math.cos(theta) * radius, Math.sin(theta) * radius, 0).applyMatrix4(mComb);
          const dx = e.x - (px + v.x);
          const dz = e.z - (pz + v.z);
          const d = Math.hypot(dx, dz);
          if (d < best) best = d;
          if (best <= ENEMY_HIT_R) {
            sent.add(e.id);
            window.dispatchEvent(
              new CustomEvent('rpg:slashHit', {
                detail: { enemyId: e.id, swingId: seq, yaw },
              }),
            );
            continue outer;
          }
        }
      }
    }
  });

  return (
    // Raise to roughly player hand/torso height (feel like a weapon swing, not ground swipe).
    <group position={[x, 0.95, z]} rotation={[0, yaw, 0]}>
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
