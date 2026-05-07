import { useCallback, useEffect, useRef, useState } from 'react';
import { Scene3D } from './core/Scene3D';
import { useGameStore } from './systems/gameStore';
import { useSocketSync } from './systems/useSocketSync';
import { AuthPanel } from './ui/AuthPanel';
import { CharacterPanel } from './ui/CharacterPanel';
import { InventoryPanel } from './ui/InventoryPanel';
import { QuestPanel } from './ui/QuestPanel';
import { SkillPanel } from './ui/SkillPanel';
import { CameraSettingsPanel } from './ui/CameraSettingsPanel';
import { CAMERA_BASE_OFFSET } from './systems/cameraSettingsStore';
import { PLAYER_MAX_MOVE_SPEED } from './core/world';
import { ModalShell } from './ui/game/ModalShell';
import { PlayerHud } from './ui/game/PlayerHud';
import { QuestTracker } from './ui/game/QuestTracker';
import { MiniMap } from './ui/game/MiniMap';
import { SkillCrossbar } from './ui/game/SkillCrossbar';
import { RpgDock, type DockPanel } from './ui/game/RpgDock';
import { SettingsIconButton } from './ui/game/SettingsIconButton';
import { CharacterSheet } from './ui/game/CharacterSheet';
import { DeathOverlay } from './ui/game/DeathOverlay';

type GameModal = 'settings' | DockPanel | null;

/** Half-width of the auto-target box on X/Z (world units): 2×15 → 30×30 around player. */
const NEAR_ENEMY_HALF = 15;
const SKILL_RANGE = 6;
const MELEE_RANGE = 3;
const CHASE_INTERVAL_MS = 80;
const SKILL_HIT_DELAY_MS = 500;

/** Quái gần nhất trong ô (2×NEAR_ENEMY_HALF)² quanh player; không fallback ra toàn map. */
function findCombatTarget(
  player: { posX: number; posZ: number },
  enemies: { id: string; hp: number; x: number; z: number }[],
) {
  const alive = enemies.filter((e) => e.hp > 0);
  if (alive.length === 0) return null;
  const inBox = alive.filter(
    (e) => Math.abs(e.x - player.posX) <= NEAR_ENEMY_HALF && Math.abs(e.z - player.posZ) <= NEAR_ENEMY_HALF,
  );
  if (inBox.length === 0) return null;
  let best = inBox[0];
  let bestD = Math.hypot(best.x - player.posX, best.z - player.posZ);
  for (let i = 1; i < inBox.length; i++) {
    const e = inBox[i];
    const d = Math.hypot(e.x - player.posX, e.z - player.posZ);
    if (d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

/** Phím 1–5 ↔ chỉ số mảng `skills` (ô crossbar cùng thứ tự). */
const KEY_TO_SKILL_INDEX: Record<string, number> = {
  '1': 0,
  '2': 1,
  '3': 2,
  '4': 3,
  '5': 4,
};

export default function App() {
  const token = useGameStore((s) => s.token);
  const character = useGameStore((s) => s.character);
  const setSelectedEnemyId = useGameStore((s) => s.setSelectedEnemyId);
  const moveBy = useGameStore((s) => s.moveBy);
  const triggerAttackAnim = useGameStore((s) => s.triggerAttackAnim);
  const triggerSlashFx = useGameStore((s) => s.triggerSlashFx);
  const setPlayerFacingYaw = useGameStore((s) => s.setPlayerFacingYaw);
  const socketRef = useSocketSync();
  const [modal, setModal] = useState<GameModal>(null);
  const [showDeathScreen, setShowDeathScreen] = useState(false);
  const chaseTimerRef = useRef<number | null>(null);
  const wasdKeysRef = useRef({ w: false, a: false, s: false, d: false });
  const moveLoopRafRef = useRef(0);
  const lastMoveLoopTickRef = useRef(0);

  const stopChase = useCallback(() => {
    if (chaseTimerRef.current != null) {
      window.clearInterval(chaseTimerRef.current);
      chaseTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => stopChase(), [stopChase]);
  useEffect(() => {
    if (modal) stopChase();
  }, [modal, stopChase]);

  useEffect(() => {
    if (!character) {
      setShowDeathScreen(false);
      return;
    }
    if (character.hp > 0) {
      setShowDeathScreen(false);
      return;
    }
    const t = window.setTimeout(() => setShowDeathScreen(true), 2000);
    return () => window.clearTimeout(t);
  }, [character?.hp, character?.id]);

  useEffect(() => {
    const onPickup = (ev: Event) => {
      const sock = socketRef.current;
      if (!sock) return;
      const detail = (ev as CustomEvent).detail as { lootId?: string };
      if (detail?.lootId) sock.emit('loot:pickup', { lootId: detail.lootId });
    };
    window.addEventListener('rpg:lootPickup', onPickup as EventListener);
    return () => window.removeEventListener('rpg:lootPickup', onPickup as EventListener);
  }, [socketRef]);

  useEffect(() => {
    const onDelete = (ev: Event) => {
      const sock = socketRef.current;
      if (!sock) return;
      const detail = (ev as CustomEvent).detail as { itemId?: string };
      if (detail?.itemId) sock.emit('item:delete', { itemId: detail.itemId });
    };
    window.addEventListener('rpg:itemDelete', onDelete as EventListener);
    return () => window.removeEventListener('rpg:itemDelete', onDelete as EventListener);
  }, [socketRef]);

  const tryCastSkillIndex = useCallback(
    (skillIndex: number) => {
      const skill = useGameStore.getState().skills[skillIndex];
      if (!skill) return;
      stopChase();
      const cur = useGameStore.getState().character;
      if (!cur || cur.hp <= 0) return;
      const target = findCombatTarget(cur, useGameStore.getState().enemies);
      if (!target) {
        // Không có mục tiêu trong phạm vi auto-approach: vẫn vung skill tại chỗ.
        if (skill.skill.id === 'slash') {
          const yaw = useGameStore.getState().playerFacingYaw;
          triggerSlashFx(cur.posX, cur.posZ, yaw);
        }
        triggerAttackAnim();
        return;
      }
      const sock = socketRef.current;
      if (!sock) {
        if (skill.skill.id === 'slash') {
          const yaw = useGameStore.getState().playerFacingYaw;
          triggerSlashFx(cur.posX, cur.posZ, yaw);
        }
        triggerAttackAnim();
        return;
      }

      setSelectedEnemyId(target.id);
      const enemyId = target.id;
      const skillId = skill.skill.id;

      const fireIfInRange = () => {
        const c = useGameStore.getState().character;
        const t = useGameStore.getState().enemies.find((e) => e.id === enemyId && e.hp > 0);
        if (!c || !t) {
          stopChase();
          return true;
        }
        const dist = Math.hypot(c.posX - t.x, c.posZ - t.z);
        if (dist <= SKILL_RANGE) {
          const yaw = Math.atan2(t.x - c.posX, t.z - c.posZ);
          setPlayerFacingYaw(yaw);
          if (skillId === 'slash') triggerSlashFx(c.posX, c.posZ, yaw);
          triggerAttackAnim();
          const delayedEnemyId = t.id;
          window.setTimeout(() => {
            const alive = useGameStore.getState().enemies.some((e) => e.id === delayedEnemyId && e.hp > 0);
            if (!alive) return;
            sock.emit('skill:cast', { skillId, enemyId: delayedEnemyId });
          }, SKILL_HIT_DELAY_MS);
          return true;
        }
        return false;
      };

      if (fireIfInRange()) return;

      chaseTimerRef.current = window.setInterval(() => {
        if (fireIfInRange()) {
          stopChase();
          return;
        }
        const c = useGameStore.getState().character;
        const t = useGameStore.getState().enemies.find((e) => e.id === enemyId && e.hp > 0);
        if (!c || !t) {
          stopChase();
          return;
        }
        const dx = t.x - c.posX;
        const dz = t.z - c.posZ;
        const len = Math.hypot(dx, dz);
        if (len < 0.001) return;
        const chaseStep = PLAYER_MAX_MOVE_SPEED * (CHASE_INTERVAL_MS / 1000);
        const step = Math.min(chaseStep, Math.max(0, len - SKILL_RANGE + 0.35));
        moveBy((dx / len) * step, (dz / len) * step);
        const next = useGameStore.getState().character;
        if (next) sock.emit('player:move', { x: next.posX, y: next.posY, z: next.posZ });
      }, CHASE_INTERVAL_MS);
    },
    [socketRef, moveBy, setSelectedEnemyId, stopChase, triggerAttackAnim, triggerSlashFx, setPlayerFacingYaw],
  );

  const tryBasicAttack = useCallback(() => {
    stopChase();
    const cur = useGameStore.getState().character;
    if (!cur || cur.hp <= 0) return;
    const target = findCombatTarget(cur, useGameStore.getState().enemies);
    if (!target) return;
    const sock = socketRef.current;
    if (!sock) return;

    setSelectedEnemyId(target.id);
    const enemyId = target.id;

    const fireIfInRange = () => {
      const c = useGameStore.getState().character;
      const t = useGameStore.getState().enemies.find((e) => e.id === enemyId && e.hp > 0);
      if (!c || !t) {
        stopChase();
        return true;
      }
      const dist = Math.hypot(c.posX - t.x, c.posZ - t.z);
      if (dist <= MELEE_RANGE) {
        setPlayerFacingYaw(Math.atan2(t.x - c.posX, t.z - c.posZ));
        triggerAttackAnim();
        sock.emit('combat:attack', { enemyId: t.id });
        return true;
      }
      return false;
    };

    if (fireIfInRange()) return;

    chaseTimerRef.current = window.setInterval(() => {
      if (fireIfInRange()) {
        stopChase();
        return;
      }
      const c = useGameStore.getState().character;
      const t = useGameStore.getState().enemies.find((e) => e.id === enemyId && e.hp > 0);
      if (!c || !t) {
        stopChase();
        return;
      }
      const dx = t.x - c.posX;
      const dz = t.z - c.posZ;
      const len = Math.hypot(dx, dz);
      if (len < 0.001) return;
      const chaseStep = PLAYER_MAX_MOVE_SPEED * (CHASE_INTERVAL_MS / 1000);
      const step = Math.min(chaseStep, Math.max(0, len - MELEE_RANGE + 0.25));
      moveBy((dx / len) * step, (dz / len) * step);
      const next = useGameStore.getState().character;
      if (next) sock.emit('player:move', { x: next.posX, y: next.posY, z: next.posZ });
    }, CHASE_INTERVAL_MS);
  }, [socketRef, moveBy, setSelectedEnemyId, stopChase]);

  const characterId = character?.id;

  useEffect(() => {
    if (!characterId) return;

    function scheduleMoveLoop() {
      if (moveLoopRafRef.current) return;
      lastMoveLoopTickRef.current = 0;
      moveLoopRafRef.current = requestAnimationFrame(moveLoopTick);
    }

    function moveLoopTick(t: number) {
      const ch0 = useGameStore.getState().character;
      if (!ch0) {
        moveLoopRafRef.current = 0;
        return;
      }
      if (ch0.hp <= 0) {
        moveLoopRafRef.current = 0;
        return;
      }
      if (modal) {
        moveLoopRafRef.current = 0;
        return;
      }

      if (lastMoveLoopTickRef.current === 0) {
        lastMoveLoopTickRef.current = t;
        moveLoopRafRef.current = requestAnimationFrame(moveLoopTick);
        return;
      }

      const dt = Math.min((t - lastMoveLoopTickRef.current) / 1000, 0.08);
      lastMoveLoopTickRef.current = t;

      const keys = wasdKeysRef.current;
      const inForward = (keys.w ? 1 : 0) + (keys.s ? -1 : 0);
      const inRight = (keys.d ? 1 : 0) + (keys.a ? -1 : 0);

      // Camera-relative movement on XZ plane (W goes toward camera look direction).
      const camFwdX = -CAMERA_BASE_OFFSET.x;
      const camFwdZ = -CAMERA_BASE_OFFSET.z;
      const fLen = Math.hypot(camFwdX, camFwdZ) || 1;
      const fx = camFwdX / fLen;
      const fz = camFwdZ / fLen;
      const rx = -fz;
      const rz = fx;

      let dx = fx * inForward + rx * inRight;
      let dz = fz * inForward + rz * inRight;
      const len = Math.hypot(dx, dz);
      if (len > 0.001) {
        dx /= len;
        dz /= len;
        const cap = PLAYER_MAX_MOVE_SPEED * dt;
        setPlayerFacingYaw(Math.atan2(dx, dz));
        moveBy(dx * cap, dz * cap);
        const next = useGameStore.getState().character;
        if (next) socketRef.current?.emit('player:move', { x: next.posX, y: next.posY, z: next.posZ });
      }

      const anyKey = keys.w || keys.a || keys.s || keys.d;
      if (anyKey) {
        moveLoopRafRef.current = requestAnimationFrame(moveLoopTick);
      } else {
        moveLoopRafRef.current = 0;
        lastMoveLoopTickRef.current = 0;
      }
    }

    function setWasdFromEvent(e: KeyboardEvent, down: boolean) {
      const raw = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const k = raw;
      if (k !== 'w' && k !== 'a' && k !== 's' && k !== 'd') return;
      wasdKeysRef.current = {
        ...wasdKeysRef.current,
        [k]: down,
      };
      if (down) scheduleMoveLoop();
    }

    function onKeydown(e: KeyboardEvent) {
      if (modal) {
        if (e.key === 'Escape') setModal(null);
        return;
      }
      const ch = useGameStore.getState().character;
      if (!ch) return;
      if (ch.hp <= 0 && e.key !== 'Escape') return;

      setWasdFromEvent(e, true);

      if (e.key === ' ') {
        tryBasicAttack();
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const aliveEnemies = useGameStore.getState().enemies.filter((enemy) => enemy.hp > 0);
        if (aliveEnemies.length === 0) return;
        const currentIndex = aliveEnemies.findIndex((enemy) => enemy.id === useGameStore.getState().selectedEnemyId);
        const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % aliveEnemies.length;
        setSelectedEnemyId(aliveEnemies[nextIndex].id);
      }
      const ski = KEY_TO_SKILL_INDEX[e.key];
      if (ski !== undefined) tryCastSkillIndex(ski);
    }

    function onKeyup(e: KeyboardEvent) {
      if (modal) return;
      setWasdFromEvent(e, false);
    }

    function onBlur() {
      wasdKeysRef.current = { w: false, a: false, s: false, d: false };
      if (moveLoopRafRef.current) {
        cancelAnimationFrame(moveLoopRafRef.current);
        moveLoopRafRef.current = 0;
      }
      lastMoveLoopTickRef.current = 0;
    }

    window.addEventListener('keydown', onKeydown);
    window.addEventListener('keyup', onKeyup);
    window.addEventListener('blur', onBlur);
    return () => {
      wasdKeysRef.current = { w: false, a: false, s: false, d: false };
      if (moveLoopRafRef.current) cancelAnimationFrame(moveLoopRafRef.current);
      moveLoopRafRef.current = 0;
      lastMoveLoopTickRef.current = 0;
      window.removeEventListener('keydown', onKeydown);
      window.removeEventListener('keyup', onKeyup);
      window.removeEventListener('blur', onBlur);
    };
  }, [characterId, modal, moveBy, socketRef, setSelectedEnemyId, tryCastSkillIndex, tryBasicAttack, setPlayerFacingYaw]);

  if (!token) return <AuthPanel />;
  if (!character) return <CharacterPanel />;

  return (
    <div className="game-root">
      <div className="scene-wrap">
        <Scene3D />
      </div>

      <div className="left-stack">
        <PlayerHud />
        <QuestTracker />
      </div>

      <div className="right-stack">
        <SettingsIconButton onClick={() => setModal('settings')} />
        <MiniMap />
      </div>

      <RpgDock onOpen={(panel) => setModal(panel)} />
      <SkillCrossbar onCastSkillIndex={tryCastSkillIndex} />

      <DeathOverlay
        visible={Boolean(character && character.hp <= 0 && showDeathScreen)}
        onRevive={() => socketRef.current?.emit('player:revive')}
      />

      {modal === 'settings' && (
        <ModalShell title="Settings" onClose={() => setModal(null)}>
          <CameraSettingsPanel />
        </ModalShell>
      )}
      {modal === 'quests' && (
        <ModalShell title="Quests" onClose={() => setModal(null)}>
          <QuestPanel />
        </ModalShell>
      )}
      {modal === 'inventory' && (
        <ModalShell onClose={() => setModal(null)} panelClassName="modal-panel-wide">
          <InventoryPanel />
        </ModalShell>
      )}
      {modal === 'character' && (
        <ModalShell onClose={() => setModal(null)}>
          <CharacterSheet />
        </ModalShell>
      )}
      {modal === 'skills' && (
        <ModalShell title="Skills" onClose={() => setModal(null)}>
          <SkillPanel
            onCast={(skillId) => {
              const idx = useGameStore.getState().skills.findIndex((s) => s.skill.id === skillId);
              if (idx >= 0) tryCastSkillIndex(idx);
            }}
          />
        </ModalShell>
      )}
    </div>
  );
}
