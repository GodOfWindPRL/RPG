import { useEffect, useLayoutEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { PlayerMesh } from '../entities/PlayerMesh';
import { EnemyMesh } from '../entities/EnemyMesh';
import { SlashArcFx } from '../entities/SlashArcFx';
import { useGameStore } from '../systems/gameStore';
import { CAMERA_BASE_OFFSET, useCameraSettingsStore } from '../systems/cameraSettingsStore';
import { MAP_SIZE } from './world';
import { GroundMesh } from './GroundMesh';

/** Một lần cho cả session — tránh `new BoxGeometry` mỗi lần re-render (rò GPU/RAM khi chơi lâu). */
const BOUNDARY_EDGES_GEOM = new THREE.EdgesGeometry(new THREE.BoxGeometry(MAP_SIZE, 0.05, MAP_SIZE));

function CameraFovSync() {
  const fov = useCameraSettingsStore((s) => s.fov);
  const { camera } = useThree();
  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (cam.isPerspectiveCamera) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }, [camera, fov]);
  return null;
}



function FloatingPopup({
  id,
  x,
  y,
  z,
  text,
  color,
  fontSize,
  fontWeight,
  variant,
}: {
  id: string;
  x: number;
  y: number;
  z: number;
  text: string;
  color: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  variant?: 'crit';
}) {
  const ref = useRef<THREE.Group>(null);
  const removeWorldPopup = useGameStore((s) => s.removeWorldPopup);
  useEffect(() => {
    const t = window.setTimeout(() => removeWorldPopup(id), 700);
    return () => window.clearTimeout(t);
  }, [id, removeWorldPopup]);

  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.position.y += dt * 1.5;
  });

  // Html scales with `distanceFactor` (drei); match ~previous Troika world fontSize 1.2–1.45.
  const px = 22 + (fontSize ?? 1.2) * 14;
  return (
    <group ref={ref} position={[x, y ?? 2, z]}>
      <Html center distanceFactor={18} style={{ pointerEvents: 'none', userSelect: 'none' }} zIndexRange={[200, 0]}>
        <div
          className={variant === 'crit' ? 'world-popup-crit' : undefined}
          style={{
            color,
            fontSize: px,
            fontWeight: fontWeight ?? 'normal',
            lineHeight: 1,
            whiteSpace: 'nowrap',
            fontFamily: 'system-ui, Segoe UI, sans-serif',
            textShadow: '0 0 6px rgba(0,0,0,0.85), 0 1px 2px #000',
          }}
        >
          {text}
        </div>
      </Html>
    </group>
  );
}

function FollowCamera({ x, z }: { x: number; z: number }) {
  const { camera } = useThree();
  useFrame(() => {
    const scale = useCameraSettingsStore.getState().distanceScale;
    const o = CAMERA_BASE_OFFSET;
    camera.position.set(x + o.x * scale, o.y * scale, z + o.z * scale);
    camera.lookAt(x, 0.8, z);
  });
  return null;
}

export function Scene3D() {
  const character = useGameStore((s) => s.character);
  const enemies = useGameStore((s) => s.enemies);
  const selectedEnemyId = useGameStore((s) => s.selectedEnemyId);
  const setSelectedEnemyId = useGameStore((s) => s.setSelectedEnemyId);
  const worldPopups = useGameStore((s) => s.worldPopups);
  const groundLoot = useGameStore((s) => s.groundLoot);
  const slashFx = useGameStore((s) => s.slashFx);
  const cameraFov = useCameraSettingsStore((s) => s.fov);
  const distanceScale = useCameraSettingsStore((s) => s.distanceScale);
  const o = CAMERA_BASE_OFFSET;
  const camPos: [number, number, number] = [o.x * distanceScale, o.y * distanceScale, o.z * distanceScale];

  if (!character) return null;

  return (
    <Canvas style={{ width: '100%', height: '100%' }} shadows camera={{ position: camPos, fov: cameraFov }}>
      <CameraFovSync />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#cbd5e1', '#0f172a', 0.45]} />
      <directionalLight intensity={1.1} position={[6, 14, 4]} castShadow />
      <FollowCamera x={character.posX} z={character.posZ} />
      <GroundMesh />
      <lineSegments position={[0, 0.02, 0]} geometry={BOUNDARY_EDGES_GEOM}>
        <lineBasicMaterial color="#38bdf8" />
      </lineSegments>
      <PlayerMesh x={character.posX} y={0} z={character.posZ} isDead={character.hp <= 0} />
      {slashFx && <SlashArcFx key={slashFx.seq} seq={slashFx.seq} x={slashFx.x} z={slashFx.z} yaw={slashFx.yaw} />}
      {groundLoot.map((l) => (
        <group key={l.id} position={[l.x, 0.05, l.z]}>
          <Html center distanceFactor={18} style={{ pointerEvents: 'auto' }} zIndexRange={[220, 0]}>
            <button
              type="button"
              onClick={(ev) => {
                ev.stopPropagation();
                // emit via global socketRef (stored in window by createRpgSocket) is not available here;
                // Scene clicks are handled in App; so we dispatch a CustomEvent.
                window.dispatchEvent(new CustomEvent('rpg:lootPickup', { detail: { lootId: l.id } }));
              }}
              style={{ all: 'unset', cursor: 'pointer' }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                  padding: '2px 4px',
                  borderRadius: 8,
                  background: 'rgba(2,6,23,0.35)',
                  border: '1px solid rgba(51,65,85,0.6)',
                }}
              >
                <div style={{ fontSize: 18, lineHeight: 1 }}>✨</div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color:
                      l.rarity === 'MYTHIC'
                        ? '#e879f9'
                        : l.rarity === 'YELLOW'
                          ? '#fbbf24'
                          : l.rarity === 'GREEN'
                            ? '#34d399'
                            : l.rarity === 'BLUE'
                              ? '#60a5fa'
                              : '#e2e8f0',
                    textShadow: '0 0 6px rgba(0,0,0,0.9), 0 1px 2px #000',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {l.name}
                </div>
              </div>
            </button>
          </Html>
        </group>
      ))}
      {enemies
        .filter((enemy) => enemy.hp > 0 || enemy.diedAt != null)
        .map((enemy) => (
          <EnemyMesh
            key={enemy.id}
            x={enemy.x}
            z={enemy.z}
            hp={enemy.hp}
            maxHp={enemy.maxHp}
            yaw={enemy.yaw ?? 0}
            anim={enemy.anim ?? 'idle'}
            animSeq={enemy.animSeq ?? 0}
            diedAt={enemy.diedAt}
            selected={selectedEnemyId === enemy.id}
            onSelect={() => setSelectedEnemyId(enemy.id)}
          />
        ))}
      {worldPopups.map((p) => (
        <FloatingPopup
          key={p.id}
          id={p.id}
          x={p.x}
          y={p.y ?? 2}
          z={p.z}
          text={p.text}
          color={p.color}
          fontSize={p.fontSize}
          fontWeight={p.fontWeight}
          variant={p.variant}
        />
      ))}
    </Canvas>
  );
}
