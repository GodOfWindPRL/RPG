import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../systems/gameStore';

const ARROW_Y = 1.08;
const FADE_MS = 220;
const TRAIL_COUNT = 7;

type ArrowSeg = { fromX: number; fromZ: number; toX: number; toZ: number; travelMs: number };

export function SplitArrowFx({
  seq,
  arrows,
  startMs,
}: {
  seq: number | string;
  arrows: ArrowSeg[];
  startMs: number;
}) {
  const removeFx = useGameStore((s) => s.removeSplitArrowFx);

  const dotRefs = useRef<(THREE.Mesh | null)[]>([]);
  const trailRefs = useRef<(THREE.Mesh | null)[][]>([]);
  const trailMatRefs = useRef<(THREE.MeshBasicMaterial | null)[][]>([]);
  const trailHist = useRef<{ x: number; z: number }[][]>([]);

  const maxTravelMs = useMemo(() => {
    const ms = Math.max(0, ...arrows.map((a) => Math.max(0, a.travelMs || 0)));
    return ms;
  }, [arrows]);

  useEffect(() => {
    const t = window.setTimeout(() => removeFx(seq), maxTravelMs + FADE_MS + 80);
    return () => window.clearTimeout(t);
  }, [seq, maxTravelMs, removeFx]);

  useFrame(() => {
    const elapsed = Math.max(0, Date.now() - startMs);
    const fadeP = Math.min(1, Math.max(0, (elapsed - maxTravelMs) / Math.max(1, FADE_MS)));

    for (let i = 0; i < arrows.length; i++) {
      const dot = dotRefs.current[i];
      const a = arrows[i];
      if (!dot || !a) continue;
      const p = Math.min(1, Math.max(0, elapsed / Math.max(1, a.travelMs)));
      const x = a.fromX + (a.toX - a.fromX) * p;
      const z = a.fromZ + (a.toZ - a.fromZ) * p;
      dot.position.set(x, ARROW_Y, z);
      dot.scale.setScalar(0.22 + 0.1 * Math.sin(elapsed * 0.02 + i));
      const m = dot.material as THREE.MeshBasicMaterial;
      m.opacity = 0.85 * (1 - fadeP);

      // Trail: keep a short history of positions per arrow.
      if (!trailHist.current[i]) trailHist.current[i] = [];
      trailHist.current[i].push({ x, z });
      if (trailHist.current[i].length > TRAIL_COUNT) trailHist.current[i].shift();

      for (let t = 0; t < TRAIL_COUNT; t++) {
        const mesh = trailRefs.current[i]?.[t] ?? null;
        const mat = trailMatRefs.current[i]?.[t] ?? null;
        if (!mesh || !mat) continue;
        const histIdx = trailHist.current[i].length - 1 - t;
        if (histIdx < 0) {
          mat.opacity = 0;
          continue;
        }
        const h = trailHist.current[i][histIdx];
        mesh.position.set(h.x, ARROW_Y - 0.02 - t * 0.01, h.z);
        const f = 1 - t / TRAIL_COUNT;
        mesh.scale.setScalar(0.35 * f + 0.05);
        mat.opacity = 0.45 * f * (1 - fadeP);
      }
    }
  });

  return (
    <group renderOrder={4}>
      {/* Trail puffs (no guiding line) */}
      {arrows.map((_, i) => (
        <group
          key={`tr-${i}`}
          ref={(node) => {
            if (!node) return;
            // Ensure arrays exist once.
            if (!trailRefs.current[i]) trailRefs.current[i] = Array.from({ length: TRAIL_COUNT }, () => null);
            if (!trailMatRefs.current[i]) trailMatRefs.current[i] = Array.from({ length: TRAIL_COUNT }, () => null);
          }}
        >
          {Array.from({ length: TRAIL_COUNT }).map((__, t) => (
            <mesh
              key={`tp-${i}-${t}`}
              ref={(n) => {
                if (!trailRefs.current[i]) trailRefs.current[i] = Array.from({ length: TRAIL_COUNT }, () => null);
                trailRefs.current[i][t] = n;
              }}
            >
              <sphereGeometry args={[0.18, 10, 10]} />
              <meshBasicMaterial
                ref={(m) => {
                  if (!trailMatRefs.current[i]) trailMatRefs.current[i] = Array.from({ length: TRAIL_COUNT }, () => null);
                  trailMatRefs.current[i][t] = m;
                }}
                color="#cbd5e1"
                transparent
                opacity={0}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
          ))}
        </group>
      ))}

      {arrows.map((_, i) => (
        <mesh key={`d-${i}`} ref={(n) => (dotRefs.current[i] = n)}>
          <sphereGeometry args={[0.22, 10, 10]} />
          <meshBasicMaterial
            color="#f8fafc"
            transparent
            opacity={0.85}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  );
}

