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

const SKILL_RANGE = 6;
const CHASE_INTERVAL_MS = 80;
const SWING_HIT_AT_PCT = 0.5;

function resolveSelectedTarget() {
  const s = useGameStore.getState();
  const id = s.selectedEnemyId;
  if (!id) return null;
  return s.enemies.find((e) => e.id === id && e.hp > 0) ?? null;
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
  const setSlashAcceptedSwingId = useGameStore((s) => s.setSlashAcceptedSwingId);
  const setPlayerFacingYaw = useGameStore((s) => s.setPlayerFacingYaw);
  const socketRef = useSocketSync();
  const [modal, setModal] = useState<GameModal>(null);
  const [showDeathScreen, setShowDeathScreen] = useState(false);
  const chaseTimerRef = useRef<number | null>(null);
  const wasdKeysRef = useRef({ w: false, a: false, s: false, d: false });
  const moveLoopRafRef = useRef(0);
  const lastMoveLoopTickRef = useRef(0);
  const nextActionAtRef = useRef(0);
  const skillReadyAtRef = useRef<Record<string, number>>({});

  const attackPeriodMs = useCallback(() => {
    const ch = useGameStore.getState().character;
    const atkSpeed = Math.max(1, ch?.attackSpeed ?? 100); // 100 = 1 hit/sec
    const ms = Math.round((1000 * 100) / atkSpeed);
    // Spec: no cooldown & attackSpeed=100% ⇒ period exactly follows attackSpeed (100 => 1s, 200 => 0.5s).
    return Math.max(60, ms);
  }, []);

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
    const onRefresh = () => {
      const sock = socketRef.current;
      if (!sock) return;
      sock.emit('player:refreshRegen');
    };
    window.addEventListener('rpg:refreshRegen', onRefresh as EventListener);
    return () => window.removeEventListener('rpg:refreshRegen', onRefresh as EventListener);
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

  useEffect(() => {
    const onRefreshRegen = () => {
      const sock = socketRef.current;
      if (!sock) return;
      sock.emit('player:refreshRegen');
    };
    window.addEventListener('rpg:refreshRegen', onRefreshRegen as EventListener);
    return () => window.removeEventListener('rpg:refreshRegen', onRefreshRegen as EventListener);
  }, [socketRef]);

  useEffect(() => {
    const onSlashHit = (ev: Event) => {
      const sock = socketRef.current;
      if (!sock) return;
      const d = (ev as CustomEvent).detail as { enemyId?: string; swingId?: number; yaw?: number };
      if (d.enemyId == null || d.swingId == null) return;
      const accepted = useGameStore.getState().slashAcceptedSwingId;
      if (accepted !== d.swingId) return;
      sock.emit('skill:slashHit', {
        enemyId: d.enemyId,
        swingId: d.swingId,
        yaw: typeof d.yaw === 'number' && Number.isFinite(d.yaw) ? d.yaw : useGameStore.getState().playerFacingYaw,
      });
    };
    window.addEventListener('rpg:slashHit', onSlashHit as EventListener);
    return () => window.removeEventListener('rpg:slashHit', onSlashHit as EventListener);
  }, [socketRef]);

  const tryCastSkillIndex = useCallback(
    (skillIndex: number) => {
      const now = Date.now();
      if (now < nextActionAtRef.current) return;
      const skill = useGameStore.getState().skills[skillIndex];
      if (!skill) return;
      const skillId = skill.skill.id;
      const readyAt = skillReadyAtRef.current[skillId] ?? 0;
      if (now < readyAt) return;
      stopChase();
      const cur = useGameStore.getState().character;
      if (!cur || cur.hp <= 0) return;
      if (cur.mana < (skill.skill.manaCost ?? 0)) {
        useGameStore.getState().setFloatingText('Not enough mana');
        window.setTimeout(() => useGameStore.getState().setFloatingText(null), 600);
        return;
      }
      const target = resolveSelectedTarget();
      const sock = socketRef.current;
      // Allow swinging even without a target or socket (local-only animation/VFX).

      // Always start the swing immediately.
      const period = attackPeriodMs();
      const cdMs = Math.max(0, Math.round(skill.skill.cooldownMs ?? 0));
      const gateMs = Math.max(period, cdMs);
      nextActionAtRef.current = Date.now() + gateMs;
      skillReadyAtRef.current[skillId] = Date.now() + gateMs;
      if (skillId === 'slash') {
        const yaw = useGameStore.getState().playerFacingYaw;
        triggerSlashFx(cur.posX, cur.posZ, yaw, period);
        if (sock) {
          const st = useGameStore.getState().slashFx;
          if (st) {
            setSlashAcceptedSwingId(null);
            sock.emit('skill:slashStart', { swingId: st.seq });
          }
        }
      }
      triggerAttackAnim();

      if (!sock) return;

      // Non-slash skills still need a clicked target (no free-aim).
      if (skillId !== 'slash' && !target) return;
      // Slash without a selected target: free-aim only (arc collision).
      if (skillId === 'slash' && !target) return;

      const enemyId = target!.id;

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
          if (skillId !== 'slash') {
            const delayedEnemyId = t.id;
            window.setTimeout(() => {
              const alive = useGameStore.getState().enemies.some((e) => e.id === delayedEnemyId && e.hp > 0);
              if (!alive) return;
              sock.emit('skill:cast', { skillId, enemyId: delayedEnemyId });
            }, Math.round(period * SWING_HIT_AT_PCT));
          }
          return true;
        }
        return false;
      };

      // Only auto-approach if user has explicitly clicked a target.
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
    [socketRef, moveBy, stopChase, triggerAttackAnim, triggerSlashFx, setPlayerFacingYaw, attackPeriodMs],
  );

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

      if (e.key === 'Escape') {
        e.preventDefault();
        stopChase();
        setSelectedEnemyId(null);
        return;
      }

      setWasdFromEvent(e, true);

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
  }, [characterId, modal, moveBy, socketRef, setSelectedEnemyId, stopChase, tryCastSkillIndex, setPlayerFacingYaw]);

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
