import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Html, useAnimations } from '@react-three/drei';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import monsterIdleUrl from '../assets/model/Monster Idle.fbx?url';
import monsterWalkUrl from '../assets/model/Walk Forward.fbx?url';
import monsterAttackUrl from '../assets/model/Attack.fbx?url';
import deathAnimUrl from '../assets/model/Death.fbx?url';

const MODEL_SCALE = 0.008;
const MODEL_OFFSET_Y = 0.35;

export function EnemyMesh({
  id,
  name,
  isBoss,
  x,
  z,
  yaw,
  anim,
  animSeq,
  hp,
  maxHp,
  diedAt,
  selected,
  onSelect,
  debuffs,
}: {
  id: string;
  name: string;
  isBoss: boolean;
  x: number;
  z: number;
  yaw: number;
  anim: 'idle' | 'walk' | 'attack' | 'death';
  animSeq: number;
  hp: number;
  maxHp: number;
  diedAt?: number;
  selected: boolean;
  onSelect: () => void;
  debuffs?: { burnUntil?: number; slowUntil?: number; poisonUntil?: number; shockUntil?: number };
}) {
  const rootRef = useRef<THREE.Group>(null);
  const animRootRef = useRef<THREE.Group>(null);
  const rootMotionBoneRef = useRef<THREE.Bone | null>(null);
  const rootMotionBaseRef = useRef(new THREE.Vector3());
  const deathPlayedRef = useRef(false);

  const idleFbx = useLoader(FBXLoader, monsterIdleUrl) as THREE.Group;
  const walkFbx = useLoader(FBXLoader, monsterWalkUrl) as THREE.Group;
  const attackFbx = useLoader(FBXLoader, monsterAttackUrl) as THREE.Group;
  const deathFbx = useLoader(FBXLoader, deathAnimUrl) as THREE.Group;

  const model = useMemo(() => {
    const cloned = skeletonClone(idleFbx) as THREE.Group;
    let meshCount = 0;
    cloned.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (!m.isMesh) return;
      meshCount += 1;
      m.visible = true;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      // Remember original color for debuff tints.
      const mat = m.material as any;
      if (mat && mat.color && !m.userData.__baseColor) {
        m.userData.__baseColor = (mat.color as THREE.Color).clone();
      }
    });
    const clips: THREE.AnimationClip[] = [];
    if (idleFbx.animations?.[0]) clips.push(idleFbx.animations[0].clone());
    if (walkFbx.animations?.[0]) clips.push(walkFbx.animations[0].clone());
    if (attackFbx.animations?.[0]) clips.push(attackFbx.animations[0].clone());
    if (deathFbx.animations?.[0]) clips.push(deathFbx.animations[0].clone());

    if (clips[0]) clips[0].name = 'Idle';
    if (clips[1]) clips[1].name = 'Walk';
    if (clips[2]) clips[2].name = 'Attack';
    if (clips[3]) clips[3].name = 'Death';

    let picked: THREE.Bone | null = null;
    cloned.traverse((obj) => {
      if (obj.type !== 'Bone') return;
      const b = obj as THREE.Bone;
      if (!picked) picked = b;
      const n = b.name.toLowerCase();
      if (n.includes('hips') || n.includes('root') || n.includes('pelvis')) picked = b;
    });
    if (picked) {
      rootMotionBoneRef.current = picked;
      rootMotionBaseRef.current.copy(picked.position);
    }

    return { scene: cloned, clips, meshCount };
  }, [idleFbx, walkFbx, attackFbx, deathFbx]);

  const { actions } = useAnimations(model.clips, animRootRef);

  useEffect(() => {
    if (model.meshCount <= 0 || hp <= 0) return;
    const base = actions.Idle ?? actions.Walk ?? Object.values(actions)[0];
    if (base) base.reset().fadeIn(0.15).play();
    return () => {
      Object.values(actions).forEach((a) => a?.stop());
    };
  }, [actions, model.meshCount, hp]);

  useEffect(() => {
    if (hp > 0) {
      deathPlayedRef.current = false;
      return;
    }
    if (deathPlayedRef.current || model.meshCount <= 0 || !actions.Death) return;
    deathPlayedRef.current = true;
    Object.values(actions).forEach((a) => {
      if (a && a !== actions.Death) a.fadeOut(0.1);
    });
    const d = actions.Death;
    d.reset();
    d.setLoop(THREE.LoopOnce, 1);
    d.clampWhenFinished = true;
    d.fadeIn(0.12).play();
  }, [hp, diedAt, actions, model.meshCount]);

  useEffect(() => {
    if (model.meshCount <= 0 || hp <= 0) return;
    if (anim === 'walk' && actions.Walk) {
      actions.Walk.reset().fadeIn(0.15).play();
      actions.Idle?.fadeOut(0.12);
    } else if (anim === 'idle' && actions.Idle) {
      actions.Idle.reset().fadeIn(0.15).play();
      actions.Walk?.fadeOut(0.12);
    } else if (anim === 'walk' && !actions.Walk) {
      const a = actions.Idle ?? Object.values(actions)[0];
      a?.reset().fadeIn(0.15).play();
    }
  }, [actions, anim, model.meshCount, hp]);

  useFrame(() => {
    const now = Date.now();
    const burn = (debuffs?.burnUntil ?? 0) > now;
    const slow = (debuffs?.slowUntil ?? 0) > now;
    const poison = (debuffs?.poisonUntil ?? 0) > now;
    const shock = (debuffs?.shockUntil ?? 0) > now;
    if (!burn && !slow && !poison && !shock) {
      // Restore base color.
      model.scene.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (!m.isMesh) return;
        const base = m.userData.__baseColor as THREE.Color | undefined;
        const mat = m.material as any;
        if (base && mat?.color) (mat.color as THREE.Color).copy(base);
        if (m.userData.__baseEmissive && mat?.emissive) (mat.emissive as THREE.Color).copy(m.userData.__baseEmissive);
      });
      return;
    }
    const tint = new THREE.Color(
      burn ? 1 : poison ? 0.25 : shock ? 1 : 0.35,
      burn ? 0.18 : poison ? 1 : shock ? 0.85 : 0.65,
      burn ? 0.18 : poison ? 0.25 : shock ? 0.25 : 1,
    );
    model.scene.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (!m.isMesh) return;
      const base = m.userData.__baseColor as THREE.Color | undefined;
      const mat = m.material as any;
      if (!base || !mat?.color) return;
      const c = mat.color as THREE.Color;
      c.copy(base).lerp(tint, 0.55);
      if (mat.emissive) {
        if (!m.userData.__baseEmissive) m.userData.__baseEmissive = (mat.emissive as THREE.Color).clone();
        (mat.emissive as THREE.Color).copy(m.userData.__baseEmissive).lerp(tint, 0.35);
        mat.emissiveIntensity = 0.75;
      }
    });
  });

  const lastAttackSeqRef = useRef<number>(0);
  useEffect(() => {
    if (model.meshCount <= 0 || hp <= 0) return;
    if (!actions.Attack) return;
    if (animSeq === lastAttackSeqRef.current) return;
    lastAttackSeqRef.current = animSeq;

    const a = actions.Attack;
    a.reset();
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.fadeIn(0.08).play();
    actions.Walk?.fadeOut(0.08);
    actions.Idle?.fadeOut(0.08);

    const timeout = window.setTimeout(() => {
      a.fadeOut(0.12);
      if (anim === 'walk') actions.Walk?.reset().fadeIn(0.12).play();
      else actions.Idle?.reset().fadeIn(0.12).play();
    }, 420);

    return () => window.clearTimeout(timeout);
  }, [actions, anim, animSeq, model.meshCount, hp]);

  useFrame((_, dt) => {
    const root = rootRef.current;
    if (root) {
      const pos = root.position;
      const kPos = 16;
      const aPos = 1 - Math.exp(-kPos * Math.min(dt, 0.05));
      pos.x += (x - pos.x) * aPos;
      pos.z += (z - pos.z) * aPos;

      const cur = root.rotation.y;
      const d = Math.atan2(Math.sin(yaw - cur), Math.cos(yaw - cur));
      const kYaw = 14;
      const aYaw = 1 - Math.exp(-kYaw * Math.min(dt, 0.05));
      root.rotation.y = cur + d * aYaw;
    }

    const rb = rootMotionBoneRef.current;
    if (rb && hp > 0) {
      rb.position.x = rootMotionBaseRef.current.x;
      rb.position.z = rootMotionBaseRef.current.z;
    }
  });

  const color = hp > 0 ? '#f43f5e' : '#64748b';

  // Important: don't bind <group position={[x,0,z]}> to live props.
  // Server snapshots update x/z abruptly; React will "snap" position before our smoothing runs.
  // We only set initial position on mount, then lerp in useFrame.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.position.x = x;
    root.position.z = z;
  }, []);

  return (
    <group
      ref={rootRef}
      onPointerDown={
        hp > 0
          ? (e) => {
              e.stopPropagation();
              const btn =
                typeof (e as any).nativeEvent?.button === 'number'
                  ? (e as any).nativeEvent.button
                  : typeof (e as any).button === 'number'
                    ? (e as any).button
                    : 0;
              window.dispatchEvent(
                new CustomEvent('rpg:enemyPointerDown', {
                  detail: { enemyId: id, button: btn, x, z },
                }),
              );
              onSelect();
            }
          : undefined
      }
    >
      {isBoss && hp > 0 && (
        <group position={[0, 0.03, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.85, 1.35, 64]} />
            <meshBasicMaterial color="#1d4ed8" transparent opacity={0.8} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.6, 0.8, 64]} />
            <meshBasicMaterial color="#1e40af" transparent opacity={0.7} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          <BossAuraSpin />
        </group>
      )}
      {model.meshCount > 0 ? (
        <group ref={animRootRef}>
          <primitive object={model.scene} scale={[MODEL_SCALE, MODEL_SCALE, MODEL_SCALE]} position={[0, MODEL_OFFSET_Y, 0]} />
        </group>
      ) : (
        <mesh position={[0, 0.8, 0]}>
          <sphereGeometry args={[0.8, 18, 18]} />
          <meshStandardMaterial color={color} />
        </mesh>
      )}
      {selected && hp > 0 && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.95, 1.15, 32]} />
          <meshBasicMaterial color="#facc15" />
        </mesh>
      )}
      {hp > 0 && (
        <>
          <Billboard follow lockX={false} lockY={false} lockZ={false} position={[0, 2.4, 0]}>
            <group>
              <group position={[0, 0.18, 0]}>
                <Html center distanceFactor={18} style={{ pointerEvents: 'none', userSelect: 'none' }} zIndexRange={[15, 0]}>
                  <div
                    style={{
                      fontSize: isBoss ? 13 : 12,
                      fontWeight: 900,
                      color: isBoss ? '#0962f0' : '#ffffff',
                      textShadow: isBoss
                        ? '0 0 10px rgba(9,98,240,0.7), 0 1px 3px #000'
                        : '0 0 8px rgba(0,0,0,0.9), 0 1px 2px #000',
                      whiteSpace: 'nowrap',
                      fontFamily: 'system-ui, Segoe UI, sans-serif',
                      letterSpacing: 0.2,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span>{name || 'Zombie'}</span>
                    {(() => {
                      const now = Date.now();
                      const icons: { k: string; label: string; color: string; border: string }[] = [];
                      if ((debuffs?.burnUntil ?? 0) > now) icons.push({ k: 'burn', label: 'Burn', color: '#b91c1c', border: 'rgba(185,28,28,0.9)' });
                      if ((debuffs?.slowUntil ?? 0) > now) icons.push({ k: 'slow', label: 'Slow', color: '#1d4ed8', border: 'rgba(29,78,216,0.9)' });
                      if ((debuffs?.poisonUntil ?? 0) > now) icons.push({ k: 'poison', label: 'Poison', color: '#15803d', border: 'rgba(21,128,61,0.9)' });
                      if ((debuffs?.shockUntil ?? 0) > now) icons.push({ k: 'shock', label: 'Shock', color: '#a16207', border: 'rgba(161,98,7,0.9)' });
                      if (icons.length === 0) return null;
                      return (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {icons.map((ic) => (
                            <span
                              key={ic.k}
                              title={ic.label}
                              style={{
                                width: 14,
                                height: 14,
                                borderRadius: 4,
                                border: `1px solid ${ic.border}`,
                                background: 'rgba(2,6,23,0.5)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: `0 0 8px ${ic.border}, 0 0 4px rgba(0,0,0,0.8)`,
                                color: ic.color,
                                fontSize: 11,
                                lineHeight: 1,
                              }}
                            >
                              {ic.k === 'burn' ? '🔥' : ic.k === 'slow' ? '❄️' : ic.k === 'poison' ? '☠️' : '⚡'}
                            </span>
                          ))}
                        </span>
                      );
                    })()}
                  </div>
                </Html>
              </group>
              <mesh>
                <boxGeometry args={[Math.max(0.1, hp / maxHp) * 1.5, 0.12, 0.1]} />
                <meshStandardMaterial color="#22c55e" />
              </mesh>
            </group>
          </Billboard>
        </>
      )}
    </group>
  );
}

function BossAuraSpin() {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.rotation.y += dt * 1.6;
  });
  return (
    <group ref={ref}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.95, 1.55, 64]} />
        <meshBasicMaterial color="#1e3a8a" transparent opacity={0.65} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, Math.PI / 3, 0]}>
        <ringGeometry args={[0.75, 0.95, 64]} />
        <meshBasicMaterial color="#172554" transparent opacity={0.6} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}
