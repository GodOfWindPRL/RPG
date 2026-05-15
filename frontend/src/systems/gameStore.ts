import { create } from 'zustand';
import type { Character, CharacterQuest, CharacterSkill, Enemy, InventoryItem } from '../core/types';
import { resolvePlayerMoveXZ } from '../core/worldCollision';
import type { EquipmentSlot } from '../core/items';

/** Giới hạn nhẹ để tránh DOM/Html chồng quá dày; không ép DPR hay giảm mượt camera. */
const MAX_WORLD_POPUPS = 24;
const EQUIP_SLOTS: EquipmentSlot[] = [
  'head',
  'chest',
  'legs',
  'hands',
  'feet',
  'weaponLeft',
  'weaponRight',
  'ring1',
  'ring2',
  'amulet',
];

/** Số ô bar dưới đáy: 6 skill (phím 1-6) + 4 item (F1-F4). */
export const SKILL_BAR_SIZE = 6;
export const ITEM_BAR_SIZE = 4;
export const MOUSE_SKILL_BAR_SIZE = 3; // left / right / middle

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
  /** Persisted inventory cell layout per character (flattened row-major ids, 10x6). */
  inventoryGridByCharacterId: Record<string, (string | null)[]>;
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
  /** Skill id that triggered the latest attack animation (used to select clip). */
  attackAnimSkillId: string | null;
  /** When the latest attack animation was triggered (Date.now()). */
  attackAnimStartedAt: number;
  playerFacingYaw: number;
  /** VFX Slash: snapshot vị trí / hướng lúc vung (không bám theo player). */
  slashFx: { seq: number; x: number; z: number; yaw: number; durationMs?: number } | null;
  /** Savage: snapshot cast để sprite 3 nhát (trùng timing server 20/40/60% period). */
  savageSpriteBurst: { id: number; x: number; z: number; yaw: number; periodMs: number } | null;
  /** Server ack for slashStart; used to gate slashHit when spam clicking. */
  slashAcceptedSwingId: number | null;
  /** Fireball projectiles in flight; cleared by FireBoltFx after explosion fades. */
  fireboltFx: {
    seq: number | string;
    fromX: number;
    fromZ: number;
    toX: number;
    toZ: number;
    /** Time the projectile was launched (Date.now()). */
    startMs: number;
    /** Time it takes to reach impact, in ms. */
    travelMs: number;
    /** Explosion radius in meters. */
    radius: number;
  }[];
  /** Blizzard storms currently active; cleared after duration + fade. */
  blizzardFx: {
    seq: number;
    centerX: number;
    centerZ: number;
    /** When the storm started (Date.now()). */
    startMs: number;
    /** Storm duration (shards stop spawning after this). */
    durationMs: number;
    /** Half-width of the 5×5 area. */
    half: number;
    /** Hit radius of each falling shard (~4×4 ô). */
    shardRadius?: number;
  }[];
  /** Chaos Orb: green poison orb with multiple explosions along path. */
  chaosOrbFx: {
    seq: number;
    fromX: number;
    fromZ: number;
    toX: number;
    toZ: number;
    startMs: number;
    travelMs: number;
    radius: number;
    explosions: { t: number; x: number; z: number }[];
  }[];
  meteorFx: {
    seq: number | string;
    aimX: number;
    aimZ: number;
    fromX: number;
    fromZ: number;
    startMs: number;
    fallMs: number;
    burnHalf: number;
    burnDurationMs: number;
  }[];
  chainLightningFx: {
    seq: number | string;
    segments: { fromX: number; fromZ: number; toX: number; toZ: number }[];
    segmentMs: number;
    startMs: number;
  }[];
  splitArrowFx: {
    seq: number | string;
    arrows: { fromX: number; fromZ: number; toX: number; toZ: number; travelMs: number }[];
    startMs: number;
  }[];
  /** Latest mouse cursor XZ position on ground (for free-aim skills). */
  cursorWorldXZ: { x: number; z: number } | null;
  /** Debuffs currently affecting the player (for HUD icons). */
  playerDebuffs: { burnUntil?: number; slowUntil?: number; poisonUntil?: number; shockUntil?: number } | null;
  playerBuffs: { hasteUntil?: number; hastePct?: number } | null;
  /** Hotbar gắn skill cho phím 1-6 (lưu skill.id). null = ô trống. */
  skillBar: (string | null)[];
  /** Mouse skill bar: 0=Left, 1=Right, 2=Middle. Stores skill.id. */
  mouseSkillBar: (string | null)[];
  /** Hotbar gắn item cho phím F1-F4 (lưu inventoryItem.id). null = ô trống. */
  itemBar: (string | null)[];
  /** Khi đang mở picker chọn skill/item, các phím tắt 1-6/F1-F4 nên bị tắt. */
  hotbarPickerOpen: boolean;
  /** Client-side cooldown gate per skillId (ms epoch). */
  skillCooldownReadyAt: Record<string, number>;
  setSkillBar: (bar: (string | null)[]) => void;
  setMouseSkillBar: (bar: (string | null)[]) => void;
  setItemBar: (bar: (string | null)[]) => void;
  setSkillBarSlot: (slot: number, skillId: string | null) => void;
  setMouseSkillBarSlot: (slot: number, skillId: string | null) => void;
  setItemBarSlot: (slot: number, itemId: string | null) => void;
  setHotbarPickerOpen: (open: boolean) => void;
  setSkillCooldownReadyAt: (skillId: string, readyAt: number) => void;
  setToken: (token: string | null) => void;
  setCharacter: (character: Character | null) => void;
  setEnemies: (enemies: Enemy[]) => void;
  setSelectedEnemyId: (enemyId: string | null) => void;
  updateEnemy: (enemyId: string, hp: number, diedAt?: number) => void;
  setInventory: (inventory: InventoryItem[]) => void;
  setEquipmentLayout: (layout: EquipmentLayout) => void;
  setInventoryGridLayout: (characterId: string, layout: (string | null)[]) => void;
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
  setAttackAnimSkillId: (skillId: string | null) => void;
  triggerSlashFx: (x: number, z: number, yaw: number, durationMs?: number) => void;
  clearSlashFx: () => void;
  triggerSavageSpriteBurst: (x: number, z: number, yaw: number, periodMs: number) => void;
  clearSavageSpriteBurst: () => void;
  setSlashAcceptedSwingId: (swingId: number | null) => void;
  spawnFireboltFx: (fx: {
    seq?: number | string;
    fromX: number;
    fromZ: number;
    toX: number;
    toZ: number;
    travelMs: number;
    radius: number;
  }) => void;
  removeFireboltFx: (seq: number | string) => void;
  spawnBlizzardFx: (fx: {
    centerX: number;
    centerZ: number;
    durationMs: number;
    half: number;
    shardRadius?: number;
  }) => void;
  removeBlizzardFx: (seq: number) => void;
  spawnChaosOrbFx: (fx: {
    fromX: number;
    fromZ: number;
    toX: number;
    toZ: number;
    travelMs: number;
    radius: number;
    explosions: { t: number; x: number; z: number }[];
  }) => void;
  removeChaosOrbFx: (seq: number) => void;
  spawnMeteorFx: (fx: {
    seq?: number | string;
    aimX: number;
    aimZ: number;
    fromX: number;
    fromZ: number;
    fallMs: number;
    burnHalf: number;
    burnDurationMs: number;
  }) => void;
  removeMeteorFx: (seq: number | string) => void;
  spawnChainLightningFx: (fx: {
    seq?: number | string;
    segments: { fromX: number; fromZ: number; toX: number; toZ: number }[];
    segmentMs: number;
  }) => void;
  removeChainLightningFx: (seq: number | string) => void;
  spawnSplitArrowFx: (fx: {
    seq?: number | string;
    arrows: { fromX: number; fromZ: number; toX: number; toZ: number; travelMs: number }[];
  }) => void;
  removeSplitArrowFx: (seq: number | string) => void;
  setCursorWorldXZ: (pos: { x: number; z: number } | null) => void;
  setPlayerDebuffs: (debuffs: GameState['playerDebuffs']) => void;
  setPlayerBuffs: (buffs: GameState['playerBuffs']) => void;
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
  inventoryGridByCharacterId: {},
  skills: [],
  quests: [],
  floatingText: null,
  worldPopups: [],
  groundLoot: [],
  attackAnimSeq: 0,
  attackAnimSkillId: null,
  attackAnimStartedAt: 0,
  playerFacingYaw: 0,
  slashFx: null,
  savageSpriteBurst: null,
  slashAcceptedSwingId: null,
  fireboltFx: [],
  blizzardFx: [],
  chaosOrbFx: [],
  meteorFx: [],
  chainLightningFx: [],
  splitArrowFx: [],
  cursorWorldXZ: null,
  playerDebuffs: null,
  playerBuffs: null,
  skillBar: Array.from({ length: SKILL_BAR_SIZE }, () => null),
  mouseSkillBar: Array.from({ length: MOUSE_SKILL_BAR_SIZE }, () => null),
  itemBar: Array.from({ length: ITEM_BAR_SIZE }, () => null),
  hotbarPickerOpen: false,
  skillCooldownReadyAt: {},
  setSkillBar: (bar) =>
    set(() => ({
      skillBar: Array.from({ length: SKILL_BAR_SIZE }, (_, i) => (typeof bar[i] === 'string' ? bar[i] : null)),
    })),
  setMouseSkillBar: (bar) =>
    set(() => ({
      mouseSkillBar: Array.from(
        { length: MOUSE_SKILL_BAR_SIZE },
        (_, i) => (typeof bar[i] === 'string' ? bar[i] : null),
      ),
    })),
  setItemBar: (bar) =>
    set(() => ({
      itemBar: Array.from({ length: ITEM_BAR_SIZE }, (_, i) => (typeof bar[i] === 'string' ? bar[i] : null)),
    })),
  setSkillBarSlot: (slot, skillId) =>
    set((state) => ({
      skillBar: state.skillBar.map((v, i) => (i === slot ? skillId : v)),
    })),
  setMouseSkillBarSlot: (slot, skillId) =>
    set((state) => ({
      mouseSkillBar: state.mouseSkillBar.map((v, i) => (i === slot ? skillId : v)),
    })),
  setItemBarSlot: (slot, itemId) =>
    set((state) => ({
      itemBar: state.itemBar.map((v, i) => (i === slot ? itemId : v)),
    })),
  setHotbarPickerOpen: (hotbarPickerOpen) => set({ hotbarPickerOpen }),
  setSkillCooldownReadyAt: (skillId, readyAt) =>
    set((state) => ({ skillCooldownReadyAt: { ...state.skillCooldownReadyAt, [skillId]: readyAt } })),
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
  setInventory: (inventory) =>
    set({
      inventory: (() => {
        // Always dedupe by item ID to prevent UI desync.
        const byId = new Map<string, InventoryItem>();
        for (const it of inventory ?? []) {
          if (!it?.id) continue;
          byId.set(it.id, it);
        }
        return Array.from(byId.values());
      })(),
    }),
  setEquipmentLayout: (equipmentLayout) => set({ equipmentLayout }),
  setInventoryGridLayout: (characterId, layout) =>
    set((state) => ({
      inventoryGridByCharacterId: {
        ...state.inventoryGridByCharacterId,
        [characterId]: Array.isArray(layout) ? layout.slice(0, 60) : [],
      },
    })),
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
  triggerAttackAnim: () => set((state) => ({ attackAnimSeq: state.attackAnimSeq + 1, attackAnimStartedAt: Date.now() })),
  setAttackAnimSkillId: (attackAnimSkillId) => set({ attackAnimSkillId }),
  triggerSlashFx: (x, z, yaw, durationMs) =>
    set((state) => ({
      slashFx: { seq: (state.slashFx?.seq ?? 0) + 1, x, z, yaw, ...(typeof durationMs === 'number' ? { durationMs } : {}) },
    })),
  clearSlashFx: () => set({ slashFx: null }),
  triggerSavageSpriteBurst: (x, z, yaw, periodMs) =>
    set({
      savageSpriteBurst: {
        id: Date.now() + Math.floor(Math.random() * 1000),
        x,
        z,
        yaw,
        periodMs: Math.max(120, Math.round(periodMs)),
      },
    }),
  clearSavageSpriteBurst: () => set({ savageSpriteBurst: null }),
  setSlashAcceptedSwingId: (slashAcceptedSwingId) => set({ slashAcceptedSwingId }),
  spawnFireboltFx: (fx) =>
    set((state) => {
      const seq = fx.seq ?? Date.now() + Math.floor(Math.random() * 1000);
      const { seq: _s, ...rest } = fx;
      return {
        fireboltFx: [...state.fireboltFx, { seq, startMs: Date.now(), ...rest }],
      };
    }),
  removeFireboltFx: (seq) =>
    set((state) => ({ fireboltFx: state.fireboltFx.filter((it) => it.seq !== seq) })),
  spawnBlizzardFx: (fx) =>
    set((state) => ({
      blizzardFx: [
        ...state.blizzardFx,
        { seq: Date.now() + Math.floor(Math.random() * 1000), startMs: Date.now(), ...fx },
      ],
    })),
  removeBlizzardFx: (seq) =>
    set((state) => ({ blizzardFx: state.blizzardFx.filter((it) => it.seq !== seq) })),
  spawnChaosOrbFx: (fx) =>
    set((state) => ({
      chaosOrbFx: [
        ...state.chaosOrbFx,
        { seq: Date.now() + Math.floor(Math.random() * 1000), startMs: Date.now(), ...fx },
      ],
    })),
  removeChaosOrbFx: (seq) =>
    set((state) => ({ chaosOrbFx: state.chaosOrbFx.filter((it) => it.seq !== seq) })),
  spawnMeteorFx: (fx) =>
    set((state) => {
      const seq = fx.seq ?? Date.now() + Math.floor(Math.random() * 1000);
      const { seq: _s, ...rest } = fx;
      return {
        meteorFx: [...state.meteorFx, { seq, startMs: Date.now(), ...rest }],
      };
    }),
  removeMeteorFx: (seq) =>
    set((state) => ({ meteorFx: state.meteorFx.filter((it) => it.seq !== seq) })),
  spawnChainLightningFx: (fx) =>
    set((state) => {
      const seq = fx.seq ?? Date.now() + Math.floor(Math.random() * 1000);
      const { seq: _s, ...rest } = fx;
      return {
        chainLightningFx: [...state.chainLightningFx, { seq, startMs: Date.now(), ...rest }],
      };
    }),
  removeChainLightningFx: (seq) =>
    set((state) => ({ chainLightningFx: state.chainLightningFx.filter((it) => it.seq !== seq) })),
  spawnSplitArrowFx: (fx) =>
    set((state) => {
      const seq = fx.seq ?? Date.now() + Math.floor(Math.random() * 1000);
      const { seq: _s, ...rest } = fx;
      return {
        splitArrowFx: [...state.splitArrowFx, { seq, startMs: Date.now(), ...rest }],
      };
    }),
  removeSplitArrowFx: (seq) =>
    set((state) => ({ splitArrowFx: state.splitArrowFx.filter((it) => it.seq !== seq) })),
  setCursorWorldXZ: (cursorWorldXZ) => set({ cursorWorldXZ }),
  setPlayerDebuffs: (playerDebuffs) => set({ playerDebuffs }),
  setPlayerBuffs: (playerBuffs) => set({ playerBuffs }),
  setPlayerFacingYaw: (playerFacingYaw) => set({ playerFacingYaw }),
  moveBy: (dx, dz) =>
    set((state) => {
      if (!state.character) return state;
      const fromX = state.character.posX;
      const fromZ = state.character.posZ;
      const { x, z } = resolvePlayerMoveXZ(fromX, fromZ, fromX + dx, fromZ + dz, state.enemies);
      return {
        character: {
          ...state.character,
          posX: x,
          posZ: z,
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
