import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations } from '@react-three/drei';
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
}: {
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
    <group ref={rootRef} onClick={hp > 0 ? onSelect : undefined}>
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
        <mesh position={[0, 2.3, 0]}>
          <boxGeometry args={[Math.max(0.1, hp / maxHp) * 1.5, 0.12, 0.1]} />
          <meshStandardMaterial color="#22c55e" />
        </mesh>
      )}
    </group>
  );
}
