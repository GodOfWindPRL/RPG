import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useFBX } from '@react-three/drei';
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useGameStore } from '../systems/gameStore';
import devilWalkUrl from '../assets/model/Devil Walk Forward.fbx?url';
import idleAnimUrl from '../assets/model/Idle.fbx?url';
import slashAnimUrl from '../assets/model/Slash.fbx?url';
import deathAnimUrl from '../assets/model/Death.fbx?url';

type PlayerMeshProps = {
  x: number;
  y?: number;
  z: number;
  isDead?: boolean;
};

const MODEL_SCALE = 0.01;
const MODEL_OFFSET_Y = 0.45;
const TURN_EPS = 0.0005;
const MOVE_EPS = 0.0008;
const TURN_LERP = 0.22;
const MODEL_YAW_OFFSET = 0;
const MIN_ATTACK_PERIOD_MS = 250;
const MAX_ATTACK_PERIOD_MS = 2000;

export function PlayerMesh({ x, y = 0, z, isDead = false }: PlayerMeshProps) {
  const rootRef = useRef<THREE.Group>(null);
  const animRootRef = useRef<THREE.Group>(null);
  const prevPosRef = useRef(new THREE.Vector2(x, z));
  const targetYawRef = useRef(0);
  const rootMotionBoneRef = useRef<THREE.Bone | null>(null);
  const rootMotionBaseRef = useRef(new THREE.Vector3());
  const movingRef = useRef(false);
  const lastMoveAtRef = useRef(0);
  const currentStateRef = useRef<'idle' | 'walk' | 'attack'>('idle');
  const attackUntilRef = useRef(0);
  const deathPlayedRef = useRef(false);
  const wasDeadRef = useRef(false);
  const skeletonRef = useRef<THREE.Skeleton | null>(null);

  const attackAnimSeq = useGameStore((s) => s.attackAnimSeq);
  const playerFacingYaw = useGameStore((s) => s.playerFacingYaw);
  const attackSpeed = useGameStore((s) => s.character?.attackSpeed ?? 100);

  const walkFbx = useFBX(devilWalkUrl);
  const idleFbx = useFBX(idleAnimUrl);
  const slashFbx = useFBX(slashAnimUrl);
  const deathFbx = useFBX(deathAnimUrl);

  const model = useMemo(() => {
    const cloned = skeletonClone(walkFbx) as THREE.Group;
    let meshCount = 0;

    cloned.traverse((obj) => {
      const isMeshLike = obj.type === 'Mesh' || obj.type === 'SkinnedMesh';
      if (!isMeshLike) return;
      meshCount += 1;
      const m = obj as THREE.Mesh;
      m.visible = true;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
    });

    let picked: THREE.Bone | null = null;
    let skeleton: THREE.Skeleton | null = null;
    cloned.traverse((obj) => {
      if (obj instanceof THREE.SkinnedMesh && obj.skeleton) skeleton = obj.skeleton;
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
    skeletonRef.current = skeleton;

    const clips: THREE.AnimationClip[] = [];
    if (idleFbx.animations?.[0]) clips.push(THREE.AnimationClip.findByName([idleFbx.animations[0]], idleFbx.animations[0].name)?.clone() ?? idleFbx.animations[0].clone());
    if (walkFbx.animations?.[0]) clips.push(THREE.AnimationClip.findByName([walkFbx.animations[0]], walkFbx.animations[0].name)?.clone() ?? walkFbx.animations[0].clone());
    if (slashFbx.animations?.[0]) clips.push(THREE.AnimationClip.findByName([slashFbx.animations[0]], slashFbx.animations[0].name)?.clone() ?? slashFbx.animations[0].clone());
    if (deathFbx.animations?.[0])
      clips.push(THREE.AnimationClip.findByName([deathFbx.animations[0]], deathFbx.animations[0].name)?.clone() ?? deathFbx.animations[0].clone());

    if (clips[0]) clips[0].name = 'Idle';
    if (clips[1]) clips[1].name = 'Walk';
    if (clips[2]) clips[2].name = 'Attack';
    if (clips[3]) clips[3].name = 'Death';

    return { scene: cloned, meshCount, clips };
  }, [walkFbx, idleFbx, slashFbx, deathFbx]);

  const { actions } = useAnimations(model.clips, animRootRef);
  const showModel = model.meshCount > 0;

  useEffect(() => {
    if (!showModel) return;
    if (isDead) {
      wasDeadRef.current = true;
      return;
    }

    const revivedFromDeath = wasDeadRef.current;
    wasDeadRef.current = false;

    if (revivedFromDeath) {
      Object.values(actions).forEach((a) => a?.stop());
      skeletonRef.current?.pose();
      if (rootMotionBoneRef.current) {
        rootMotionBoneRef.current.position.copy(rootMotionBaseRef.current);
      }
    }

    const idle = actions.Idle;
    if (idle) {
      idle.reset().fadeIn(0.2).play();
      currentStateRef.current = 'idle';
    }
    return () => {
      Object.values(actions).forEach((a) => a?.stop());
    };
  }, [actions, showModel, isDead]);

  useEffect(() => {
    if (!isDead) {
      deathPlayedRef.current = false;
      return;
    }
    if (!showModel || !actions.Death || deathPlayedRef.current) return;
    deathPlayedRef.current = true;
    Object.values(actions).forEach((a) => {
      if (a && a !== actions.Death) a.fadeOut(0.1);
    });
    const d = actions.Death;
    d.reset();
    d.setLoop(THREE.LoopOnce, 1);
    d.clampWhenFinished = true;
    d.fadeIn(0.12).play();
  }, [isDead, showModel, actions]);

  useEffect(() => {
    if (!showModel || !actions.Attack || isDead) return;
    const now = performance.now();
    const atk = actions.Attack;
    atk.reset();
    atk.setLoop(THREE.LoopOnce, 1);
    atk.clampWhenFinished = true;
    // Sync animation length to gameplay attack period:
    // attackSpeed=100 => 1 hit/sec => 1s animation.
    const periodMsRaw = Math.round((1000 * 100) / Math.max(1, attackSpeed));
    const periodMs = Math.max(MIN_ATTACK_PERIOD_MS, Math.min(MAX_ATTACK_PERIOD_MS, periodMsRaw));
    attackUntilRef.current = now + periodMs;
    const clipDur = atk.getClip()?.duration ?? 0.45;
    const desiredSec = periodMs / 1000;
    const timeScale = desiredSec > 0.001 ? clipDur / desiredSec : 1;
    atk.setEffectiveTimeScale(timeScale);
    atk.fadeIn(0.06).play();
    if (actions.Idle) actions.Idle.fadeOut(0.06);
    if (actions.Walk) actions.Walk.fadeOut(0.06);
    currentStateRef.current = 'attack';
  }, [attackAnimSeq, actions, showModel, isDead, attackSpeed]);

  useEffect(() => {
    const dx = x - prevPosRef.current.x;
    const dz = z - prevPosRef.current.y;
    const moving = Math.hypot(dx, dz) > MOVE_EPS;
    movingRef.current = moving;
    if (moving) lastMoveAtRef.current = performance.now();
    if (Math.hypot(dx, dz) > TURN_EPS) {
      targetYawRef.current = Math.atan2(dx, dz) + MODEL_YAW_OFFSET;
      prevPosRef.current.set(x, z);
    }
  }, [x, z]);

  useFrame(() => {
    const root = rootRef.current;
    if (!root) return;
    root.position.set(x, y, z);
    const from = root.rotation.y;
    const to = Number.isFinite(playerFacingYaw) ? playerFacingYaw : targetYawRef.current;
    const d = Math.atan2(Math.sin(to - from), Math.cos(to - from));
    root.rotation.y = from + d * TURN_LERP;

    const rb = rootMotionBoneRef.current;
    if (rb && !isDead) {
      rb.position.x = rootMotionBaseRef.current.x;
      rb.position.z = rootMotionBaseRef.current.z;
    }

    if (isDead) return;

    const now = performance.now();
    if (now - lastMoveAtRef.current > 120) movingRef.current = false;
    if (now < attackUntilRef.current) return;

    const want = movingRef.current ? 'walk' : 'idle';
    if (want === currentStateRef.current) return;

    if (want === 'walk' && actions.Walk) {
      actions.Walk.reset().fadeIn(0.15).play();
      actions.Idle?.fadeOut(0.12);
      actions.Attack?.fadeOut(0.08);
      currentStateRef.current = 'walk';
    } else if (want === 'idle' && actions.Idle) {
      actions.Idle.reset().fadeIn(0.15).play();
      actions.Walk?.fadeOut(0.12);
      actions.Attack?.fadeOut(0.08);
      currentStateRef.current = 'idle';
    }
  });

  return (
    <group ref={rootRef}>
      {showModel && (
        <group ref={animRootRef}>
          <primitive object={model.scene} scale={[MODEL_SCALE, MODEL_SCALE, MODEL_SCALE]} position={[0, MODEL_OFFSET_Y, 0]} />
        </group>
      )}

      {!showModel && (
        <group>
          <mesh position={[0, 0.95, 0]}>
            <capsuleGeometry args={[0.28, 0.95, 6, 12]} />
            <meshStandardMaterial color="#22c55e" emissive="#14532d" transparent opacity={0.8} />
          </mesh>
          <mesh position={[0, 1.9, 0.08]}>
            <sphereGeometry args={[0.24, 16, 16]} />
            <meshStandardMaterial color="#86efac" emissive="#166534" transparent opacity={0.9} />
          </mesh>
        </group>
      )}

      {!isDead && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.75, 0.95, 40]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.95} />
        </mesh>
      )}
    </group>
  );
}
