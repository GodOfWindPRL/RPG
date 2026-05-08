import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore, ITEM_BAR_SIZE } from '../systems/gameStore';
import type { EquipmentLayout } from '../systems/gameStore';
import type { EquipmentSlot, OptLine, UiItem } from '../core/items';
import { allOptLines, mapBackendItemToUi, slotAccepts } from '../core/items';
import { equipItem, unequipItem } from '../network/api';

type EquipmentState = {
  head: UiItem | null;
  chest: UiItem | null;
  legs: UiItem | null;
  hands: UiItem | null;
  feet: UiItem | null;
  weaponLeft: UiItem | null;
  weaponRight: UiItem | null;
  ring1: UiItem | null;
  ring2: UiItem | null;
  amulet: UiItem | null;
};

type DragPayload =
  | { from: 'inv'; r: number; c: number; itemId: string }
  | { from: 'eq'; slot: EquipmentSlot; itemId: string }
  | { from: 'pot'; slot: number; itemId: string };

const INV_COLS = 10;
const INV_ROWS = 6;

const EMPTY_EQUIP: EquipmentState = {
  head: null,
  chest: null,
  legs: null,
  hands: null,
  feet: null,
  weaponLeft: null,
  weaponRight: null,
  ring1: null,
  ring2: null,
  amulet: null,
};

const ALL_EQUIP_SLOTS: EquipmentSlot[] = [
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

function eqLayoutKey(characterId: string) {
  return `rpg.equipLayout.${characterId}`;
}

function loadStoredEqLayout(characterId: string): EquipmentLayout | null {
  if (!characterId) return null;
  try {
    const raw = localStorage.getItem(eqLayoutKey(characterId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out = ALL_EQUIP_SLOTS.reduce((acc, k) => {
      acc[k] = typeof parsed[k] === 'string' ? (parsed[k] as string) : null;
      return acc;
    }, {} as EquipmentLayout);
    return out;
  } catch {
    return null;
  }
}

function persistEqLayout(characterId: string, layout: EquipmentLayout) {
  if (!characterId) return;
  try {
    localStorage.setItem(eqLayoutKey(characterId), JSON.stringify(layout));
  } catch {
    /* quota — ignore */
  }
}

/** First empty slot that accepts the given kind (used when user has no
 *  preference, e.g. click-equip from the tooltip). */
function firstEmptySlotFor(item: UiItem, eq: EquipmentState): EquipmentSlot | null {
  if (item.kind === 'weapon') {
    if (!eq.weaponLeft) return 'weaponLeft';
    if (!eq.weaponRight) return 'weaponRight';
    return null;
  }
  if (item.kind === 'ring') {
    if (!eq.ring1) return 'ring1';
    if (!eq.ring2) return 'ring2';
    return null;
  }
  if (item.kind === 'amulet') return eq.amulet ? null : 'amulet';
  if (item.kind === 'head') return eq.head ? null : 'head';
  if (item.kind === 'chest') return eq.chest ? null : 'chest';
  if (item.kind === 'legs') return eq.legs ? null : 'legs';
  if (item.kind === 'hands') return eq.hands ? null : 'hands';
  if (item.kind === 'feet') return eq.feet ? null : 'feet';
  return null;
}

function buildEmptyGrid(): (UiItem | null)[][] {
  return Array.from({ length: INV_ROWS }, () => Array.from({ length: INV_COLS }, () => null));
}

function placeItemsRowMajor(items: UiItem[]): (UiItem | null)[][] {
  const grid = buildEmptyGrid();
  let k = 0;
  for (let r = 0; r < INV_ROWS; r++) {
    for (let c = 0; c < INV_COLS; c++) {
      grid[r]![c] = items[k] ?? null;
      k += 1;
    }
  }
  return grid;
}

function mergeGridPreservingLayout(prev: (UiItem | null)[][], unequipped: UiItem[]): (UiItem | null)[][] {
  const byId = new Map(unequipped.map((it) => [it.id, it]));
  const next = prev.map((row) => row.slice());
  for (let r = 0; r < INV_ROWS; r++) {
    for (let c = 0; c < INV_COLS; c++) {
      const cell = next[r]![c];
      if (!cell) continue;
      const updated = byId.get(cell.id);
      if (!updated) next[r]![c] = null;
      else next[r]![c] = updated;
    }
  }
  const placed = new Set<string>();
  for (let r = 0; r < INV_ROWS; r++) {
    for (let c = 0; c < INV_COLS; c++) {
      if (next[r]![c]) placed.add(next[r]![c]!.id);
    }
  }
  for (const it of unequipped) {
    if (placed.has(it.id)) continue;
    let done = false;
    for (let r = 0; r < INV_ROWS && !done; r++) {
      for (let c = 0; c < INV_COLS && !done; c++) {
        if (!next[r]![c]) {
          next[r]![c] = it;
          placed.add(it.id);
          done = true;
        }
      }
    }
  }
  return next;
}

function tryParseDrag(ev: React.DragEvent): DragPayload | null {
  try {
    const raw = ev.dataTransfer.getData('application/x-rpg-item');
    if (!raw) return null;
    return JSON.parse(raw) as DragPayload;
  } catch {
    return null;
  }
}

function rarityBorder(rarity?: string): string {
  switch ((rarity ?? '').toUpperCase()) {
    case 'GREEN':
      return 'border-emerald-500/60';
    case 'BLUE':
      return 'border-sky-500/60';
    case 'YELLOW':
      return 'border-amber-400/70';
    case 'MYTHIC':
      return 'border-fuchsia-500/70';
    default:
      return 'border-slate-600/70';
  }
}

function rarityText(rarity?: string): string {
  switch ((rarity ?? '').toUpperCase()) {
    case 'GREEN':
      return 'text-emerald-300';
    case 'BLUE':
      return 'text-sky-300';
    case 'YELLOW':
      return 'text-amber-300';
    case 'MYTHIC':
      return 'text-fuchsia-300';
    default:
      return 'text-slate-100';
  }
}

function rarityExtraText(rarity?: string): string {
  switch ((rarity ?? '').toUpperCase()) {
    case 'GREEN':
      return 'text-emerald-300';
    case 'BLUE':
      return 'text-sky-300';
    case 'YELLOW':
      return 'text-amber-300';
    case 'MYTHIC':
      return 'text-fuchsia-300';
    default:
      return 'text-slate-100';
  }
}

function parseSetMeta(affixJson?: string): null | { key: string; name: string; piecesTotal: number; bonuses: string[] } {
  if (!affixJson) return null;
  try {
    const o = JSON.parse(affixJson) as Record<string, unknown>;
    const key = o.setKey;
    const name = o.setName;
    const piecesTotal = o.setPiecesTotal;
    const bonuses = o.setBonuses;
    if (typeof key !== 'string' || typeof name !== 'string') return null;
    const total = typeof piecesTotal === 'number' && Number.isFinite(piecesTotal) ? Math.max(1, Math.round(piecesTotal)) : 0;
    const list = Array.isArray(bonuses) ? bonuses.filter((x) => typeof x === 'string') : [];
    if (!total || list.length === 0) return null;
    return { key, name, piecesTotal: total, bonuses: list };
  } catch {
    return null;
  }
}

/**
 * Custom drag image: a small floating icon under the cursor instead of the
 * full slot rectangle. Eliminates the broken "ghosted slot" visual.
 */
function setIconDragImage(ev: React.DragEvent, item: UiItem) {
  try {
    const ghost = document.createElement('div');
    ghost.textContent = item.icon ?? '';
    ghost.style.position = 'fixed';
    ghost.style.top = '-1000px';
    ghost.style.left = '-1000px';
    ghost.style.width = '40px';
    ghost.style.height = '40px';
    ghost.style.display = 'flex';
    ghost.style.alignItems = 'center';
    ghost.style.justifyContent = 'center';
    ghost.style.fontSize = '24px';
    ghost.style.pointerEvents = 'none';
    ghost.style.background = 'rgba(8,12,20,0.85)';
    ghost.style.border = '1px solid rgba(148,163,184,0.6)';
    ghost.style.borderRadius = '6px';
    ghost.style.boxShadow = '0 4px 14px rgba(0,0,0,0.5)';
    ghost.style.zIndex = '9999';
    document.body.appendChild(ghost);
    ev.dataTransfer.setDragImage(ghost, 20, 20);
    setTimeout(() => {
      try {
        document.body.removeChild(ghost);
      } catch {
        /* already gone */
      }
    }, 0);
  } catch {
    /* setDragImage unsupported */
  }
}

type SlotSize = 'sm' | 'md' | 'lg';

function Slot({
  label,
  item,
  selected,
  size = 'sm',
  isDragging,
  onClick,
  onDragStart,
  onDragEnd,
  onDrop,
  onDragOver,
  actionLabel,
  onActionEquip,
  onActionDelete,
  className = '',
}: {
  label?: string;
  item: UiItem | null;
  selected: boolean;
  size?: SlotSize;
  isDragging: boolean;
  onClick: () => void;
  onDragStart?: (ev: React.DragEvent) => void;
  onDragEnd?: (ev: React.DragEvent) => void;
  onDrop: (ev: React.DragEvent) => void;
  onDragOver: (ev: React.DragEvent) => void;
  actionLabel?: string;
  onActionEquip?: () => void;
  onActionDelete?: () => void;
  className?: string;
}) {
  const opts: OptLine[] = item ? allOptLines(item) : [];
  const backendItems = useGameStore((s) => s.inventory);
  const setMeta = parseSetMeta(item?.affixJson);
  const equippedSetCount = useMemo(() => {
    if (!setMeta) return 0;
    let n = 0;
    for (const it of backendItems) {
      if (!it?.equipped) continue;
      const meta = parseSetMeta(it.affixJson);
      if (meta?.key === setMeta.key) n += 1;
    }
    return n;
  }, [backendItems, setMeta?.key]);
  const activeSetLines = setMeta ? Math.max(0, Math.min(setMeta.bonuses.length, equippedSetCount - 1)) : 0;

  const sizeClass = size === 'lg' ? 'inv-cell-lg' : size === 'md' ? 'inv-cell-md' : 'inv-cell-sm';
  const iconSize = size === 'lg' ? 'text-4xl' : size === 'md' ? 'text-2xl' : 'text-xl';

  return (
    <div
      tabIndex={-1}
      className={`group rpg-slot ${sizeClass} relative select-none rounded-md border ${
        item ? rarityBorder(item.rarity) : 'border-slate-700/70'
      } ${selected ? 'rpg-slot-selected' : ''} ${className}`}
      onClick={onClick}
      draggable={Boolean(item)}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      <div className="rpg-slot-frame absolute inset-[3px] rounded-[6px]" aria-hidden />
      <div className={`relative flex h-full w-full items-center justify-center ${iconSize} drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]`}>
        {item?.icon ?? ''}
      </div>
      {!item && label && (
        <div className="pointer-events-none absolute bottom-1 right-1 text-[10px] font-bold uppercase tracking-wide text-slate-500/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
          {label}
        </div>
      )}
      {item && !isDragging && (
        <div className="pointer-events-none absolute left-1/2 top-full z-50 hidden w-max -translate-x-1/2 rounded-md border border-slate-700 bg-slate-950/95 px-2 py-1 text-xs text-slate-100 shadow-lg group-hover:block">
          <div className={`font-semibold ${rarityText(item.rarity)}`}>{item.name}</div>
          <div className="text-[11px] text-slate-300">
            {item.kind}
            {typeof item.level === 'number' ? ` · lv${item.level}` : ''}
          </div>
          {item.potion && (
            <div className="mt-1 text-[11px]">
              <span className={item.potion.kind === 'hp' ? 'font-semibold text-rose-300' : 'font-semibold text-sky-300'}>
                {item.potion.kind === 'hp' ? `Restore +${item.potion.amount} HP` : `Restore +${item.potion.amount} MP`}
              </span>
            </div>
          )}
          {opts.length > 0 && (
            <div className="mt-1 flex flex-col gap-0.5 text-[11px]">
              {opts.map((ln, i) => (
                <div
                  key={`${ln.key}_${i}`}
                  className={ln.tone === 'base' ? 'text-slate-100' : rarityExtraText(item.rarity)}
                >
                  {ln.label}: <span className="font-semibold">{ln.valueText}</span>
                </div>
              ))}
            </div>
          )}
          {setMeta && (
            <div className="mt-2 border-t border-slate-800/70 pt-2 text-[11px]">
              <div className="font-semibold text-fuchsia-300">
                Set: {setMeta.name} <span className="text-slate-400">({equippedSetCount}/{setMeta.piecesTotal})</span>
              </div>
              <div className="mt-1 flex flex-col gap-0.5">
                {setMeta.bonuses.map((txt, i) => (
                  <div
                    key={`${setMeta.key}_${i}`}
                    className={i < activeSetLines ? 'text-fuchsia-200' : 'text-fuchsia-200/45'}
                  >
                    {i + 2} pieces: <span className="font-semibold">{txt}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(onActionEquip || onActionDelete) && (
            <div className="pointer-events-auto mt-2 flex items-center justify-end gap-6 border-t border-slate-800/70 pt-2 text-[11px]">
              {onActionEquip && (
                <button
                  type="button"
                  tabIndex={-1}
                  className="cursor-pointer font-bold text-sky-200 hover:text-sky-100"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onActionEquip();
                  }}
                >
                  {actionLabel ?? 'Equip'}
                </button>
              )}
              {onActionDelete && (
                <button
                  type="button"
                  tabIndex={-1}
                  className="cursor-pointer font-bold text-rose-200 hover:text-rose-100"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onActionDelete();
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function InventoryPanel() {
  const characterId = useGameStore((s) => s.character?.id);
  const token = useGameStore((s) => s.token);
  const equipmentLayout = useGameStore((s) => s.equipmentLayout);
  const setEquipmentLayout = useGameStore((s) => s.setEquipmentLayout);
  const setInventory = useGameStore((s) => s.setInventory);
  const patchCharacter = useGameStore((s) => s.patchCharacter);
  const backendItems = useGameStore((s) => s.inventory);
  const inventoryGridByCharacterId = useGameStore((s) => s.inventoryGridByCharacterId);
  const setInventoryGridLayout = useGameStore((s) => s.setInventoryGridLayout);
  const itemBar = useGameStore((s) => s.itemBar);
  const setItemBarSlot = useGameStore((s) => s.setItemBarSlot);

  const [grid, setGrid] = useState<(UiItem | null)[][]>(() => {
    if (!characterId) return placeItemsRowMajor([]);
    const layout = inventoryGridByCharacterId[characterId];
    if (!Array.isArray(layout) || layout.length === 0) return placeItemsRowMajor([]);
    const byId = new Map(backendItems.map(mapBackendItemToUi).map((it) => [it.id, it]));
    const next = buildEmptyGrid();
    for (let i = 0; i < Math.min(layout.length, INV_ROWS * INV_COLS); i++) {
      const id = layout[i];
      const r = Math.floor(i / INV_COLS);
      const c = i % INV_COLS;
      next[r]![c] = id ? byId.get(id) ?? null : null;
    }
    return next;
  });
  const [equip, setEquip] = useState<EquipmentState>(() => ({ ...EMPTY_EQUIP }));
  const [selected, setSelected] = useState<{ kind: 'inv'; r: number; c: number } | { kind: 'eq'; slot: EquipmentSlot } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const lastCharacterIdRef = useRef<string | undefined>(undefined);

  // Persist grid layout (ids) so reopening modal does not auto-pack.
  useEffect(() => {
    if (!characterId) return;
    const ids: (string | null)[] = [];
    for (let r = 0; r < INV_ROWS; r++) {
      for (let c = 0; c < INV_COLS; c++) ids.push(grid[r]?.[c]?.id ?? null);
    }
    setInventoryGridLayout(characterId, ids);
  }, [grid, characterId, setInventoryGridLayout]);

  // Load persisted L/R equipment layout on character change.
  useEffect(() => {
    if (!characterId) return;
    const stored = loadStoredEqLayout(characterId);
    if (stored) setEquipmentLayout(stored);
  }, [characterId, setEquipmentLayout]);

  // Two passes — split to avoid update loops:
  //   (A) `backendItems` changed (real server reply) → full reconciliation:
  //       rebuild equip, clear stale layout refs, auto-fill new equipped
  //       items, AND rebuild the bag grid.
  //   (B) `equipmentLayout` changed (user optimistic update) → cheap pass:
  //       only rebuild the equip slot mapping. Don't touch the grid (otherwise
  //       the persist effect ↔ inventoryGridByCharacterId dep would loop).
  const lastBackendItemsRef = useRef<typeof backendItems>([]);

  // Pass A — only on backendItems / characterId change.
  useEffect(() => {
    if (backendItems.length === 0) {
      setEquip({ ...EMPTY_EQUIP });
      setGrid(placeItemsRowMajor([]));
      lastCharacterIdRef.current = characterId;
      lastBackendItemsRef.current = backendItems;
      return;
    }
    lastBackendItemsRef.current = backendItems;

    const equipped = backendItems.filter((it: any) => it?.equipped);
    const unequipped = backendItems.filter((it: any) => !it?.equipped);
    const eqUi = equipped.map(mapBackendItemToUi);
    const invUi = unequipped.map(mapBackendItemToUi);
    const equippedById = new Map(eqUi.map((it) => [it.id, it]));

    // Reconcile the persisted layout against current backend reality.
    const currentLayout = useGameStore.getState().equipmentLayout;
    const placed = new Set<string>();
    const cleanedLayout = { ...currentLayout } as EquipmentLayout;
    const tempEq = { ...EMPTY_EQUIP } as EquipmentState;
    for (const slot of ALL_EQUIP_SLOTS) {
      const id = cleanedLayout[slot];
      if (!id) continue;
      const item = equippedById.get(id);
      if (item && slotAccepts(slot, item)) {
        tempEq[slot] = item;
        placed.add(id);
      } else {
        cleanedLayout[slot] = null;
      }
    }
    // Auto-fill any equipped items not yet in the layout.
    for (const item of eqUi) {
      if (placed.has(item.id)) continue;
      const slot = firstEmptySlotFor(item, tempEq);
      if (!slot) continue;
      tempEq[slot] = item;
      cleanedLayout[slot] = item.id;
      placed.add(item.id);
    }

    let layoutChanged = false;
    for (const k of ALL_EQUIP_SLOTS) {
      if (cleanedLayout[k] !== currentLayout[k]) {
        layoutChanged = true;
        break;
      }
    }
    if (layoutChanged) setEquipmentLayout(cleanedLayout);
    // Note: Pass B (below) handles the actual setEquip mapping. We don't
    // setEquip here to avoid a duplicate render on backend syncs.

    const charSwitched = characterId !== lastCharacterIdRef.current;
    lastCharacterIdRef.current = characterId;
    const gridLayoutMap = useGameStore.getState().inventoryGridByCharacterId;
    setGrid((prev) => {
      if (charSwitched && characterId) {
        const layout = gridLayoutMap[characterId];
        if (Array.isArray(layout) && layout.length > 0) {
          const byId = new Map(invUi.map((it) => [it.id, it]));
          const next = buildEmptyGrid();
          for (let i = 0; i < Math.min(layout.length, INV_ROWS * INV_COLS); i++) {
            const id = layout[i];
            const r = Math.floor(i / INV_COLS);
            const c = i % INV_COLS;
            next[r]![c] = id ? byId.get(id) ?? null : null;
          }
          return mergeGridPreservingLayout(next, invUi);
        }
        return placeItemsRowMajor(invUi);
      }
      return mergeGridPreservingLayout(prev, invUi);
    });
  }, [backendItems, characterId, setEquipmentLayout]);

  // Pass B — re-bind equip slots when the user-driven layout changes (drag,
  // swap, optimistic equip). Cheap: just maps current layout id → UiItem.
  useEffect(() => {
    if (backendItems.length === 0) return;
    const equippedById = new Map(
      backendItems
        .filter((it: any) => it?.equipped)
        .map((it: any) => {
          const ui = mapBackendItemToUi(it);
          return [ui.id, ui] as const;
        }),
    );
    const next = { ...EMPTY_EQUIP } as EquipmentState;
    for (const slot of ALL_EQUIP_SLOTS) {
      const id = equipmentLayout[slot];
      if (!id) continue;
      const item = equippedById.get(id);
      if (item && slotAccepts(slot, item)) next[slot] = item;
    }
    setEquip(next);
  }, [equipmentLayout, backendItems]);

  // Persist equipment layout on every change.
  useEffect(() => {
    if (!characterId) return;
    persistEqLayout(characterId, equipmentLayout);
  }, [characterId, equipmentLayout]);

  const onDragOver = (ev: React.DragEvent) => ev.preventDefault();

  /**
   * Equip `item` into a specific UI slot.
   *
   * Critical UX rule (fixes the "swap-oldest" bug): if the slot is occupied,
   * we explicitly unequip what's there *before* equipping the new item, so
   * the backend never falls back to its swap-oldest heuristic and the user's
   * choice of L/R is honoured.
   */
  const equipIntoSlot = async (item: UiItem, slot: EquipmentSlot) => {
    if (!slotAccepts(slot, item) || !token || !characterId) return;
    const currentInSlot = equip[slot];
    if (currentInSlot && currentInSlot.id === item.id) return; // no-op

    // Optimistic L/R update so the panel reflects intent immediately.
    const optimistic = { ...equipmentLayout, [slot]: item.id } as EquipmentLayout;
    // Also clear any *other* slot that previously held this item or the one
    // we're about to drop back into the bag — otherwise the layout will hold
    // a duplicate / stale id for one render.
    for (const k of ALL_EQUIP_SLOTS) {
      if (k !== slot && optimistic[k] === item.id) optimistic[k] = null;
      if (currentInSlot && optimistic[k] === currentInSlot.id && k !== slot) {
        optimistic[k] = null;
      }
    }
    setEquipmentLayout(optimistic);

    try {
      if (currentInSlot) {
        await unequipItem(token, characterId, currentInSlot.id);
      }
      const r = await equipItem(token, characterId, item.id);
      setInventory(r.inventoryItems ?? []);
      if (r.character) patchCharacter(r.character);
      window.dispatchEvent(new CustomEvent('rpg:refreshRegen'));
    } catch {
      /* server rejected — next sync will reconcile */
    }
  };

  const equipFromInvCell = (srcR: number, srcC: number) => {
    const item = grid[srcR]?.[srcC];
    if (!item) return;
    if (item.kind === 'potion') {
      // Click-to-equip on a potion: assign to first empty F1–F4 slot.
      const slot = itemBar.findIndex((id) => id === null);
      if (slot >= 0) setItemBarSlot(slot, item.id);
      return;
    }
    // Prefer first empty appropriate slot. If none, replace the off-hand
    // (weaponRight) for weapons or ring2 for rings — main slot is preserved
    // by default. Other kinds simply replace their single slot.
    const empty = firstEmptySlotFor(item, equip);
    let slot: EquipmentSlot | null = empty;
    if (!slot) {
      if (item.kind === 'weapon') slot = 'weaponRight';
      else if (item.kind === 'ring') slot = 'ring2';
      else if (item.kind === 'amulet') slot = 'amulet';
      else if (item.kind === 'head') slot = 'head';
      else if (item.kind === 'chest') slot = 'chest';
      else if (item.kind === 'legs') slot = 'legs';
      else if (item.kind === 'hands') slot = 'hands';
      else if (item.kind === 'feet') slot = 'feet';
    }
    if (!slot) return;
    void equipIntoSlot(item, slot);
  };

  const unequipToInventory = (slot: EquipmentSlot) => {
    const item = equip[slot];
    if (!item) return;
    if (!token || !characterId) return;
    setEquipmentLayout({ ...equipmentLayout, [slot]: null });
    void unequipItem(token, characterId, item.id).then((payload) => {
      setInventory(payload.inventoryItems ?? []);
      if (payload.character) patchCharacter(payload.character);
      window.dispatchEvent(new CustomEvent('rpg:refreshRegen'));
    });
  };

  const deleteInvCell = (r: number, c: number) => {
    setGrid((prev) => {
      const next = prev.map((row) => row.slice());
      const it = next[r]![c];
      if (it?.id) window.dispatchEvent(new CustomEvent('rpg:itemDelete', { detail: { itemId: it.id } }));
      next[r]![c] = null;
      return next;
    });
  };

  const deleteEquipSlot = (slot: EquipmentSlot) => {
    setEquip((prev) => {
      const it = prev[slot];
      if (it?.id) window.dispatchEvent(new CustomEvent('rpg:itemDelete', { detail: { itemId: it.id } }));
      return { ...prev, [slot]: null };
    });
  };

  const moveFromInvToInv = (srcR: number, srcC: number, dstR: number, dstC: number) => {
    setGrid((prev) => {
      const next = prev.map((row) => row.slice());
      const a = next[srcR]![srcC];
      const b = next[dstR]![dstC];
      next[dstR]![dstC] = a;
      next[srcR]![srcC] = b;
      return next;
    });
  };

  const moveFromInvToEq = (srcR: number, srcC: number, slot: EquipmentSlot) => {
    const item = grid[srcR]?.[srcC];
    if (!item) return;
    void equipIntoSlot(item, slot);
  };

  const moveFromEqToInv = (slot: EquipmentSlot, _dstR: number, _dstC: number) => {
    unequipToInventory(slot);
  };

  /**
   * Local-only swap when both items are already equipped. We shuffle ids in
   * the layout — no API call needed because both items remain `equipped` on
   * the backend.
   */
  const moveFromEqToEq = (src: EquipmentSlot, dst: EquipmentSlot) => {
    if (src === dst) return;
    const a = equip[src];
    const b = equip[dst];
    if (a && !slotAccepts(dst, a)) return;
    if (b && !slotAccepts(src, b)) return;
    setEquipmentLayout({
      ...equipmentLayout,
      [src]: b?.id ?? null,
      [dst]: a?.id ?? null,
    });
  };

  // ─── Potion quick-use slots (shared with F1-F4 itemBar) ─────────────────
  const moveFromInvToPotion = (srcR: number, srcC: number, potSlot: number) => {
    const item = grid[srcR]?.[srcC];
    if (!item || item.kind !== 'potion') return;
    setItemBarSlot(potSlot, item.id);
  };

  const moveFromPotionToPotion = (src: number, dst: number) => {
    if (src === dst) return;
    const a = itemBar[src] ?? null;
    const b = itemBar[dst] ?? null;
    setItemBarSlot(dst, a);
    setItemBarSlot(src, b);
  };

  const clearPotionSlot = (potSlot: number) => setItemBarSlot(potSlot, null);

  const handleDropOnInv = (dstR: number, dstC: number) => (ev: React.DragEvent) => {
    ev.preventDefault();
    setIsDragging(false);
    const p = tryParseDrag(ev);
    if (!p) return;
    if (p.from === 'inv') moveFromInvToInv(p.r, p.c, dstR, dstC);
    else if (p.from === 'eq') moveFromEqToInv(p.slot, dstR, dstC);
    else if (p.from === 'pot') clearPotionSlot(p.slot); // dropped potion back into bag = unassign
  };

  const handleDropOnEq = (slot: EquipmentSlot) => (ev: React.DragEvent) => {
    ev.preventDefault();
    setIsDragging(false);
    const p = tryParseDrag(ev);
    if (!p) return;
    if (p.from === 'inv') moveFromInvToEq(p.r, p.c, slot);
    else if (p.from === 'eq') moveFromEqToEq(p.slot, slot);
  };

  const handleDropOnPotion = (potSlot: number) => (ev: React.DragEvent) => {
    ev.preventDefault();
    setIsDragging(false);
    const p = tryParseDrag(ev);
    if (!p) return;
    if (p.from === 'inv') moveFromInvToPotion(p.r, p.c, potSlot);
    else if (p.from === 'pot') moveFromPotionToPotion(p.slot, potSlot);
  };

  const dragStartInv = (r: number, c: number, item: UiItem) => (ev: React.DragEvent) => {
    setIsDragging(true);
    setIconDragImage(ev, item);
    const payload: DragPayload = { from: 'inv', r, c, itemId: item.id };
    ev.dataTransfer.setData('application/x-rpg-item', JSON.stringify(payload));
    ev.dataTransfer.effectAllowed = 'move';
  };

  const dragStartEq = (slot: EquipmentSlot, item: UiItem) => (ev: React.DragEvent) => {
    setIsDragging(true);
    setIconDragImage(ev, item);
    const payload: DragPayload = { from: 'eq', slot, itemId: item.id };
    ev.dataTransfer.setData('application/x-rpg-item', JSON.stringify(payload));
    ev.dataTransfer.effectAllowed = 'move';
  };

  const dragStartPot = (slot: number, item: UiItem) => (ev: React.DragEvent) => {
    setIsDragging(true);
    setIconDragImage(ev, item);
    const payload: DragPayload = { from: 'pot', slot, itemId: item.id };
    ev.dataTransfer.setData('application/x-rpg-item', JSON.stringify(payload));
    ev.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => setIsDragging(false);

  const packInventoryRowMajor = () => {
    const invUi = backendItems.filter((it: any) => !it?.equipped).map(mapBackendItemToUi);
    setGrid(placeItemsRowMajor(invUi));
  };

  // ─── Equipment slot helper ───────────────────────────────────────────
  const renderEqSlot = (
    slot: EquipmentSlot,
    label: string,
    size: SlotSize,
    actionLabel?: string,
  ) => {
    const item = equip[slot];
    return (
      <Slot
        key={slot}
        label={label}
        item={item}
        size={size}
        isDragging={isDragging}
        selected={selected?.kind === 'eq' && selected.slot === slot}
        onClick={() => setSelected({ kind: 'eq', slot })}
        onDragStart={item ? dragStartEq(slot, item) : undefined}
        onDragEnd={handleDragEnd}
        onDrop={handleDropOnEq(slot)}
        onDragOver={onDragOver}
        actionLabel={actionLabel ?? 'Unequip'}
        onActionEquip={item ? () => unequipToInventory(slot) : undefined}
        onActionDelete={item ? () => deleteEquipSlot(slot) : undefined}
      />
    );
  };

  // Build potion lookup by id for the F1-F4 strip.
  const invById = useMemo(() => {
    const m = new Map<string, UiItem>();
    for (const it of backendItems) m.set(it.id, mapBackendItemToUi(it));
    return m;
  }, [backendItems]);

  return (
    <div className="inv-panel-root">
      {/* Equipment area — image-style stacked rows, larger center slots */}
      <div className="inv-eq-wrap">
        <div className="inv-eq-row inv-eq-row-top">
          <div className="inv-eq-slot-spacer" />
          {renderEqSlot('head', 'Head', 'md')}
          {renderEqSlot('amulet', 'Amulet', 'md')}
          <div className="inv-eq-slot-spacer" />
        </div>
        <div className="inv-eq-row inv-eq-row-mid">
          {renderEqSlot('weaponLeft', 'Weapon', 'lg')}
          {renderEqSlot('chest', 'Chest', 'lg')}
          {renderEqSlot('weaponRight', 'Off-hand', 'lg')}
        </div>
        <div className="inv-eq-row inv-eq-row-bot">
          {renderEqSlot('ring1', 'Ring', 'md')}
          {renderEqSlot('hands', 'Hands', 'md')}
          {renderEqSlot('legs', 'Legs', 'md')}
          {renderEqSlot('feet', 'Feet', 'md')}
          {renderEqSlot('ring2', 'Ring', 'md')}
        </div>
        <div className="inv-eq-potions">
          <div className="inv-eq-potions-label">Quick use (F1 – F4)</div>
          <div className="inv-eq-row inv-eq-row-pot">
            {Array.from({ length: ITEM_BAR_SIZE }).map((_, i) => {
              const id = itemBar[i] ?? null;
              const item = id ? invById.get(id) ?? null : null;
              return (
                <Slot
                  key={`pot_${i}`}
                  label={`F${i + 1}`}
                  item={item}
                  size="md"
                  isDragging={isDragging}
                  selected={false}
                  onClick={() => {
                    if (item) clearPotionSlot(i);
                  }}
                  onDragStart={item ? dragStartPot(i, item) : undefined}
                  onDragEnd={handleDragEnd}
                  onDrop={handleDropOnPotion(i)}
                  onDragOver={onDragOver}
                  actionLabel="Clear"
                  onActionEquip={item ? () => clearPotionSlot(i) : undefined}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Inventory bag */}
      <div className="inv-bag-section">
        <div className="inv-bag-header">
          <div className="inv-bag-title">Inventory</div>
          <button
            type="button"
            tabIndex={-1}
            className="inv-bag-pack-btn"
            onPointerDown={(e) => e.preventDefault()}
            onClick={packInventoryRowMajor}
          >
            Xếp đồ
          </button>
        </div>
        <div
          className="inv-bag-grid"
          style={{
            gridTemplateColumns: `repeat(${INV_COLS}, var(--inv-cell-sm))`,
          }}
        >
          {grid.map((row, r) =>
            row.map((cell, c) => (
              <Slot
                key={`${r}_${c}`}
                item={cell}
                size="sm"
                isDragging={isDragging}
                selected={selected?.kind === 'inv' && selected.r === r && selected.c === c}
                onClick={() => setSelected({ kind: 'inv', r, c })}
                onDragStart={cell ? dragStartInv(r, c, cell) : undefined}
                onDragEnd={handleDragEnd}
                onDrop={handleDropOnInv(r, c)}
                onDragOver={onDragOver}
                onActionEquip={cell ? () => equipFromInvCell(r, c) : undefined}
                onActionDelete={cell ? () => deleteInvCell(r, c) : undefined}
              />
            )),
          )}
        </div>
        <div className="inv-bag-hint">Drag potions onto F1–F4 quick slots to use ingame</div>
      </div>
    </div>
  );
}
