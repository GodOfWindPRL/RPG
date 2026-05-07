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
  const patchCharacter = useGameStore((s) => s.patchCharacter);
  const addWorldPopup = useGameStore((s) => s.addWorldPopup);
  const setGroundLoot = useGameStore((s) => s.setGroundLoot);
  const upsertGroundLoot = useGameStore((s) => s.upsertGroundLoot);
  const removeGroundLoot = useGameStore((s) => s.removeGroundLoot);
  const setEquipmentLayout = useGameStore((s) => s.setEquipmentLayout);
  const equipmentLayout = useGameStore((s) => s.equipmentLayout);

  useEffect(() => {
    if (!token || !characterId) return;
    const socket = createRpgSocket(token);
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('player:join', { characterId });
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
      setInventory([item, ...useGameStore.getState().inventory]);

      const slotRaw = String(item?.definition?.slot ?? '').toLowerCase();
      const next = { ...equipmentLayout };
      const trySlot = (k: keyof typeof next) => {
        if (next[k]) return false;
        next[k] = item.id;
        return true;
      };
      let equipped = false;
      if (slotRaw.includes('weapon')) equipped = trySlot('weaponRight') || trySlot('weaponLeft');
      else if (slotRaw.includes('ring')) equipped = trySlot('ring');
      else if (slotRaw.includes('amulet')) equipped = trySlot('amulet');
      else if (slotRaw.includes('helmet') || slotRaw.includes('head')) equipped = trySlot('head');
      else if (slotRaw.includes('armor') || slotRaw.includes('chest')) equipped = trySlot('chest');
      else if (slotRaw.includes('legs') || slotRaw.includes('pants')) equipped = trySlot('legs');
      else if (slotRaw.includes('hands') || slotRaw.includes('glove')) equipped = trySlot('hands');
      else if (slotRaw.includes('feet') || slotRaw.includes('boot')) equipped = trySlot('feet');
      if (equipped) setEquipmentLayout(next);
    });
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
    });
    socket.on(
      'player:revived',
      (payload: { hp: number; maxHp: number; mana: number; maxMana: number; posX: number; posY: number; posZ: number }) => {
        patchCharacter(payload);
      },
    );

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
  ]);

  return socketRef;
}
