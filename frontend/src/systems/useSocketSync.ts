import { useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { createRpgSocket } from '../network/socket';
import { useGameStore } from './gameStore';
import type { Character } from '../core/types';

type CharacterProgressPatch = Partial<Character> & {
  expGained?: number;
};

export function useSocketSync() {
  const socketRef = useRef<Socket | null>(null);
  const token = useGameStore((s) => s.token);
  const characterId = useGameStore((s) => s.character?.id);
  const setEnemies = useGameStore((s) => s.setEnemies);
  const updateEnemy = useGameStore((s) => s.updateEnemy);
  const setFloatingText = useGameStore((s) => s.setFloatingText);
  const setInventory = useGameStore((s) => s.setInventory);
  const setManaHp = useGameStore((s) => s.setManaHp);
  const setSlashAcceptedSwingId = useGameStore((s) => s.setSlashAcceptedSwingId);
  const patchCharacter = useGameStore((s) => s.patchCharacter);
  const addWorldPopup = useGameStore((s) => s.addWorldPopup);
  const setGroundLoot = useGameStore((s) => s.setGroundLoot);
  const upsertGroundLoot = useGameStore((s) => s.upsertGroundLoot);
  const removeGroundLoot = useGameStore((s) => s.removeGroundLoot);
  const setEquipmentLayout = useGameStore((s) => s.setEquipmentLayout);
  const equipmentLayout = useGameStore((s) => s.equipmentLayout);
  const setPlayerBuffs = useGameStore((s) => s.setPlayerBuffs);

  useEffect(() => {
    if (!token || !characterId) return;
    const socket = createRpgSocket(token);
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('player:join', { characterId });
    });
    socket.on('skill:slashStarted', (payload: { mana?: number; swingId?: number }) => {
      if (typeof payload.mana !== 'number') return;
      if (typeof payload.swingId === 'number' && Number.isFinite(payload.swingId)) {
        setSlashAcceptedSwingId(payload.swingId);
      }
      const ch = useGameStore.getState().character;
      if (ch) setManaHp(ch.hp, payload.mana);
    });
    socket.on('skill:slashRejected', (payload: { message?: string; swingId?: number }) => {
      const msg = typeof payload.message === 'string' && payload.message ? payload.message : 'Cannot use Slash';
      const ch = useGameStore.getState().character;
      if (!ch) return;
      addWorldPopup({ x: ch.posX, z: ch.posZ, y: 2.25, text: msg, color: '#fca5a5', fontSize: 1.1, fontWeight: 'bold' });
      setFloatingText(msg);
      setTimeout(() => setFloatingText(null), 600);
      // If this rejection corresponds to the current swing, ensure we don't accept hits.
      if (typeof payload.swingId === 'number' && Number.isFinite(payload.swingId)) {
        const cur = useGameStore.getState().slashAcceptedSwingId;
        if (cur === payload.swingId) setSlashAcceptedSwingId(null);
      }
    });
    socket.on('world:snapshot', (payload: { enemies: any[] }) => {
      // Server sometimes sends { you, enemies } on join, and { enemies } on later ticks.
      setEnemies(payload.enemies ?? []);
    });
    socket.on(
      'combat:resolved',
      (payload: {
        enemyId: string;
        enemyHp: number;
        damage: number;
        mana?: number;
        missed?: boolean;
        didCrit?: boolean;
        diedAt?: number;
      }) => {
        const enemy = useGameStore.getState().enemies.find((e) => e.id === payload.enemyId);
        updateEnemy(payload.enemyId, payload.enemyHp, payload.diedAt);
        setFloatingText(payload.missed ? 'Miss' : `-${payload.damage}`);
        const ch = useGameStore.getState().character;
        addWorldPopup({
          x: enemy?.x ?? ch?.posX ?? 0,
          z: enemy?.z ?? ch?.posZ ?? 0,
          y: enemy ? 2.1 : 2.2,
          text: payload.missed ? 'Miss' : `-${payload.damage}`,
          color: payload.missed ? '#cbd5e1' : payload.didCrit ? '#fde047' : '#ef4444',
          fontSize: payload.didCrit ? 1.45 : 1.2,
          fontWeight: payload.didCrit ? 'bold' : 'normal',
          ...(payload.didCrit ? { variant: 'crit' as const } : {}),
        });
        if (typeof payload.mana === 'number') {
          if (ch) setManaHp(ch.hp, payload.mana);
        }
        setTimeout(() => setFloatingText(null), 600);
      },
    );
    socket.on('combat:damageTaken', (payload: { hp: number; maxHp?: number; damage?: number; didCrit?: boolean; missed?: boolean }) => {
      const ch = useGameStore.getState().character;
      if (!ch) return;
      setManaHp(payload.hp, ch.mana, payload.maxHp);
      if (payload.missed) {
        addWorldPopup({
          x: ch.posX,
          z: ch.posZ,
          y: 2.2,
          text: 'Miss',
          color: '#cbd5e1',
          fontSize: 1.2,
          fontWeight: 'normal',
        });
      } else if (typeof payload.damage === 'number') {
        addWorldPopup({
          x: ch.posX,
          z: ch.posZ,
          y: 2.2,
          text: `-${payload.damage}`,
          color: payload.didCrit ? '#fde047' : '#ef4444',
          fontSize: payload.didCrit ? 1.45 : 1.2,
          fontWeight: payload.didCrit ? 'bold' : 'normal',
          ...(payload.didCrit ? { variant: 'crit' as const } : {}),
        });
      }
    });
    socket.on('character:progress', (p: CharacterProgressPatch) => {
      const ch = useGameStore.getState().character;
      if (ch && (p.expGained ?? 0) > 0) {
        addWorldPopup({
          x: ch.posX,
          z: ch.posZ,
          y: 2.4,
          text: `+${p.expGained} exp`,
          color: '#facc15',
        });
      }
      patchCharacter(p);
    });
    socket.on('loot:snapshot', (payload: { loots: any[] }) => {
      setGroundLoot(
        (payload.loots ?? []).map((l) => ({
          id: l.id,
          x: l.x,
          z: l.z,
          name: l.roll?.name ?? 'Loot',
          slot: l.roll?.slot ?? '',
          level: l.roll?.level ?? 1,
          rarity: String(l.roll?.rarity ?? 'WHITE'),
        })),
      );
    });
    socket.on('loot:spawned', (payload: { loot: any }) => {
      const l = payload.loot;
      upsertGroundLoot({
        id: l.id,
        x: l.x,
        z: l.z,
        name: l.roll?.name ?? 'Loot',
        slot: l.roll?.slot ?? '',
        level: l.roll?.level ?? 1,
        rarity: String(l.roll?.rarity ?? 'WHITE'),
      });
    });
    socket.on('loot:despawned', (payload: { lootId: string }) => {
      removeGroundLoot(payload.lootId);
    });
    socket.on('loot:pickedUp', (payload: { item: any }) => {
      const item = payload.item;
      // Defensive dedupe: avoid accidental duplicates from reconnects / repeated events.
      setInventory([item, ...useGameStore.getState().inventory.filter((it) => it.id !== item.id)]);
    });

    socket.on(
      'skill:fxChaosOrb',
      (p: {
        seq: string;
        fromX: number;
        fromZ: number;
        toX: number;
        toZ: number;
        travelMs: number;
        radius: number;
        explosions?: { t: number; x: number; z: number }[];
      }) => {
        const explosions = Array.isArray(p.explosions) ? p.explosions : [{ t: 1, x: p.toX, z: p.toZ }];
        useGameStore.getState().spawnChaosOrbFx({
          fromX: p.fromX,
          fromZ: p.fromZ,
          toX: p.toX,
          toZ: p.toZ,
          travelMs: p.travelMs,
          radius: p.radius,
          explosions,
        });
      },
    );
    socket.on(
      'skill:fxFirebolt',
      (p: {
        seq: string;
        fromX: number;
        fromZ: number;
        toX: number;
        toZ: number;
        travelMs: number;
        radius: number;
        mana?: number;
      }) => {
        if (typeof p.mana === 'number') {
          const ch = useGameStore.getState().character;
          if (ch) setManaHp(ch.hp, p.mana);
        }
        useGameStore.getState().spawnFireboltFx({
          seq: p.seq,
          fromX: p.fromX,
          fromZ: p.fromZ,
          toX: p.toX,
          toZ: p.toZ,
          travelMs: p.travelMs,
          radius: p.radius,
        });
      },
    );
    socket.on(
      'skill:fxMeteor',
      (p: {
        seq: string;
        aimX: number;
        aimZ: number;
        fromX: number;
        fromZ: number;
        fallMs: number;
        burnHalf: number;
        burnDurationMs: number;
        mana?: number;
      }) => {
        if (typeof p.mana === 'number') {
          const ch = useGameStore.getState().character;
          if (ch) setManaHp(ch.hp, p.mana);
        }
        useGameStore.getState().spawnMeteorFx({
          seq: p.seq,
          aimX: p.aimX,
          aimZ: p.aimZ,
          fromX: p.fromX,
          fromZ: p.fromZ,
          fallMs: p.fallMs,
          burnHalf: p.burnHalf,
          burnDurationMs: p.burnDurationMs,
        });
      },
    );
    socket.on(
      'skill:fxChainLightning',
      (p: {
        seq: string;
        segments: { fromX: number; fromZ: number; toX: number; toZ: number }[];
        segmentMs: number;
        mana?: number;
      }) => {
        if (typeof p.mana === 'number') {
          const ch = useGameStore.getState().character;
          if (ch) setManaHp(ch.hp, p.mana);
        }
        useGameStore.getState().spawnChainLightningFx({
          seq: p.seq,
          segments: Array.isArray(p.segments) ? p.segments : [],
          segmentMs: typeof p.segmentMs === 'number' ? p.segmentMs : 95,
        });
      },
    );
    socket.on(
      'skill:fxSplitArrow',
      (p: {
        seq: string;
        arrows: { fromX: number; fromZ: number; toX: number; toZ: number; travelMs: number }[];
        mana?: number;
      }) => {
        if (typeof p.mana === 'number') {
          const ch = useGameStore.getState().character;
          if (ch) setManaHp(ch.hp, p.mana);
        }
        useGameStore.getState().spawnSplitArrowFx({
          seq: p.seq,
          arrows: Array.isArray(p.arrows) ? p.arrows : [],
        });
      },
    );
    socket.on('inventory:full', () => {
      const ch = useGameStore.getState().character;
      if (!ch) return;
      addWorldPopup({
        x: ch.posX,
        z: ch.posZ,
        y: 2.25,
        text: 'Inventory full',
        color: '#e2e8f0',
        fontSize: 1.2,
        fontWeight: 'bold',
      });
    });
    socket.on('item:deleted', (payload: { itemId: string }) => {
      const itemId = payload.itemId;
      setInventory(useGameStore.getState().inventory.filter((it) => it.id !== itemId));
      const next = { ...useGameStore.getState().equipmentLayout };
      let changed = false;
      for (const k of Object.keys(next)) {
        const kk = k as keyof typeof next;
        if (next[kk] === itemId) {
          next[kk] = null;
          changed = true;
        }
      }
      if (changed) setEquipmentLayout(next);
      // Drop F1-F4 hotbar reference too.
      const itemBar = useGameStore.getState().itemBar;
      itemBar.forEach((id, i) => {
        if (id === itemId) useGameStore.getState().setItemBarSlot(i, null);
      });
    });
    socket.on(
      'item:used',
      (payload: {
        itemId: string;
        remainingQuantity?: number;
        hp: number;
        mana: number;
        maxHp: number;
        maxMana: number;
        healedHp?: number;
        healedMp?: number;
      }) => {
        const { itemId } = payload;
        // If potion stacks, decrement quantity; otherwise remove.
        if (typeof payload.remainingQuantity === 'number' && payload.remainingQuantity > 0) {
          setInventory(
            useGameStore.getState().inventory.map((it: any) =>
              it.id === itemId ? { ...it, quantity: payload.remainingQuantity } : it,
            ),
          );
        } else {
          setInventory(useGameStore.getState().inventory.filter((it) => it.id !== itemId));
          const itemBar = useGameStore.getState().itemBar;
          itemBar.forEach((id, i) => {
            if (id === itemId) useGameStore.getState().setItemBarSlot(i, null);
          });
        }
        // Apply HP / MP heal.
        setManaHp(payload.hp, payload.mana, payload.maxHp, payload.maxMana);
        const ch = useGameStore.getState().character;
        if (ch) {
          if ((payload.healedHp ?? 0) > 0) {
            addWorldPopup({
              x: ch.posX,
              z: ch.posZ,
              y: 2.4,
              text: `+${payload.healedHp} HP`,
              color: '#34d399',
              fontSize: 1.2,
              fontWeight: 'bold',
            });
          }
          if ((payload.healedMp ?? 0) > 0) {
            addWorldPopup({
              x: ch.posX,
              z: ch.posZ,
              y: 2.4,
              text: `+${payload.healedMp} MP`,
              color: '#60a5fa',
              fontSize: 1.2,
              fontWeight: 'bold',
            });
          }
        }
      },
    );
    socket.on('item:useFailed', (_payload: { itemId: string; reason?: string }) => {
      const ch = useGameStore.getState().character;
      if (!ch) return;
      addWorldPopup({
        x: ch.posX,
        z: ch.posZ,
        y: 2.25,
        text: 'Cannot use item',
        color: '#fca5a5',
        fontSize: 1.1,
        fontWeight: 'bold',
      });
    });
    socket.on(
      'player:revived',
      (payload: { hp: number; maxHp: number; mana: number; maxMana: number; posX: number; posY: number; posZ: number }) => {
        patchCharacter(payload);
      },
    );
    socket.on('player:regen', (payload: { hp: number; mana: number; maxHp: number; maxMana: number }) => {
      const ch = useGameStore.getState().character;
      if (!ch) return;
      setManaHp(payload.hp, payload.mana, payload.maxHp, payload.maxMana);
    });

    socket.on('player:blinked', (payload: { posX: number; posY: number; posZ: number }) => {
      patchCharacter(payload);
      // Teleport must cancel prior click-to-move / auto-walk / held cast (handled in App.tsx).
      window.dispatchEvent(new CustomEvent('rpg:cancelMoveIntent'));
    });

    socket.on('player:buffs', (payload: { haste?: { until: number; pct: number } }) => {
      const haste = payload?.haste;
      if (!haste) return;
      setPlayerBuffs({ hasteUntil: haste.until, hastePct: haste.pct });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [
    token,
    characterId,
    setEnemies,
    updateEnemy,
    setFloatingText,
    setInventory,
    setManaHp,
    patchCharacter,
    addWorldPopup,
    setGroundLoot,
    upsertGroundLoot,
    removeGroundLoot,
    equipmentLayout,
    setEquipmentLayout,
    setPlayerBuffs,
  ]);

  return socketRef;
}
