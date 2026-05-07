import { create } from 'zustand';
import type { Character, CharacterQuest, CharacterSkill, Enemy, InventoryItem } from '../core/types';
import { MAP_HALF_SIZE } from '../core/world';
import type { EquipmentSlot } from '../core/items';

/** Giới hạn nhẹ để tránh DOM/Html chồng quá dày; không ép DPR hay giảm mượt camera. */
const MAX_WORLD_POPUPS = 24;
const EQUIP_SLOTS: EquipmentSlot[] = ['head', 'chest', 'legs', 'hands', 'feet', 'weaponLeft', 'weaponRight', 'ring', 'amulet'];

export type EquipmentLayout = Record<EquipmentSlot, string | null>;

export function emptyEquipmentLayout(): EquipmentLayout {
  return EQUIP_SLOTS.reduce((acc, k) => {
    acc[k] = null;
    return acc;
  }, {} as EquipmentLayout);
}

interface GameState {
  token: string | null;
  character: Character | null;
  enemies: Enemy[];
  selectedEnemyId: string | null;
  inventory: InventoryItem[];
  equipmentLayout: EquipmentLayout;
  skills: CharacterSkill[];
  quests: CharacterQuest[];
  floatingText: string | null;
  worldPopups: {
    id: string;
    x: number;
    z: number;
    y?: number;
    text: string;
    color: string;
    fontSize?: number;
    fontWeight?: 'normal' | 'bold';
    variant?: 'crit';
  }[];
  groundLoot: {
    id: string;
    x: number;
    z: number;
    name: string;
    slot: string;
    level: number;
    rarity: string;
  }[];
  attackAnimSeq: number;
  playerFacingYaw: number;
  /** VFX Slash: snapshot vị trí / hướng lúc vung (không bám theo player). */
  slashFx: { seq: number; x: number; z: number; yaw: number } | null;
  setToken: (token: string | null) => void;
  setCharacter: (character: Character | null) => void;
  setEnemies: (enemies: Enemy[]) => void;
  setSelectedEnemyId: (enemyId: string | null) => void;
  updateEnemy: (enemyId: string, hp: number, diedAt?: number) => void;
  setInventory: (inventory: InventoryItem[]) => void;
  setEquipmentLayout: (layout: EquipmentLayout) => void;
  setSkills: (skills: CharacterSkill[]) => void;
  setQuests: (quests: CharacterQuest[]) => void;
  setFloatingText: (value: string | null) => void;
  setGroundLoot: (loots: GameState['groundLoot']) => void;
  upsertGroundLoot: (loot: GameState['groundLoot'][number]) => void;
  removeGroundLoot: (lootId: string) => void;
  addWorldPopup: (popup: {
    x: number;
    z: number;
    y?: number;
    text: string;
    color: string;
    fontSize?: number;
    fontWeight?: 'normal' | 'bold';
    variant?: 'crit';
  }) => void;
  removeWorldPopup: (id: string) => void;
  triggerAttackAnim: () => void;
  triggerSlashFx: (x: number, z: number, yaw: number) => void;
  clearSlashFx: () => void;
  setPlayerFacingYaw: (yaw: number) => void;
  moveBy: (dx: number, dz: number) => void;
  setManaHp: (hp: number, mana: number, maxHp?: number, maxMana?: number) => void;
  patchCharacter: (patch: Partial<Character>) => void;
}

export const useGameStore = create<GameState>((set) => ({
  token: null,
  character: null,
  enemies: [],
  selectedEnemyId: null,
  inventory: [],
  equipmentLayout: emptyEquipmentLayout(),
  skills: [],
  quests: [],
  floatingText: null,
  worldPopups: [],
  groundLoot: [],
  attackAnimSeq: 0,
  playerFacingYaw: 0,
  slashFx: null,
  setToken: (token) => set({ token }),
  setCharacter: (character) => set({ character }),
  setEnemies: (enemies) =>
    set((state) => ({
      enemies,
      selectedEnemyId:
        state.selectedEnemyId &&
        enemies.some((enemy) => enemy.id === state.selectedEnemyId && enemy.hp > 0)
          ? state.selectedEnemyId
          : null,
    })),
  setSelectedEnemyId: (selectedEnemyId) => set({ selectedEnemyId }),
  updateEnemy: (enemyId, hp, diedAt) =>
    set((state) => ({
      enemies: state.enemies.map((it) =>
        it.id === enemyId ? { ...it, hp, ...(typeof diedAt === 'number' ? { diedAt } : {}) } : it,
      ),
      selectedEnemyId:
        state.selectedEnemyId === enemyId && hp <= 0 ? null : state.selectedEnemyId,
    })),
  setInventory: (inventory) => set({ inventory }),
  setEquipmentLayout: (equipmentLayout) => set({ equipmentLayout }),
  setSkills: (skills) => set({ skills }),
  setQuests: (quests) => set({ quests }),
  setFloatingText: (floatingText) => set({ floatingText }),
  setGroundLoot: (groundLoot) => set({ groundLoot }),
  upsertGroundLoot: (loot) =>
    set((state) => ({
      groundLoot: state.groundLoot.some((l) => l.id === loot.id)
        ? state.groundLoot.map((l) => (l.id === loot.id ? loot : l))
        : [...state.groundLoot, loot],
    })),
  removeGroundLoot: (lootId) => set((state) => ({ groundLoot: state.groundLoot.filter((l) => l.id !== lootId) })),
  addWorldPopup: (popup) =>
    set((state) => {
      const id = `wp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      let next = [...state.worldPopups, { ...popup, id }];
      if (next.length > MAX_WORLD_POPUPS) next = next.slice(-MAX_WORLD_POPUPS);
      return { worldPopups: next };
    }),
  removeWorldPopup: (id) => set((state) => ({ worldPopups: state.worldPopups.filter((p) => p.id !== id) })),
  triggerAttackAnim: () => set((state) => ({ attackAnimSeq: state.attackAnimSeq + 1 })),
  triggerSlashFx: (x, z, yaw) =>
    set((state) => ({
      slashFx: { seq: (state.slashFx?.seq ?? 0) + 1, x, z, yaw },
    })),
  clearSlashFx: () => set({ slashFx: null }),
  setPlayerFacingYaw: (playerFacingYaw) => set({ playerFacingYaw }),
  moveBy: (dx, dz) =>
    set((state) => {
      if (!state.character) return state;
      return {
        character: {
          ...state.character,
          posX: Math.max(-MAP_HALF_SIZE, Math.min(MAP_HALF_SIZE, state.character.posX + dx)),
          posZ: Math.max(-MAP_HALF_SIZE, Math.min(MAP_HALF_SIZE, state.character.posZ + dz)),
        },
      };
    }),
  setManaHp: (hp, mana, maxHp, maxMana) =>
    set((state) => {
      if (!state.character) return state;
      return {
        character: {
          ...state.character,
          hp,
          mana,
          ...(typeof maxHp === 'number' ? { maxHp } : {}),
          ...(typeof maxMana === 'number' ? { maxMana } : {}),
        },
      };
    }),
  patchCharacter: (patch) => set((state) => (state.character ? { character: { ...state.character, ...patch } } : state)),
}));
