import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../systems/gameStore';
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
  ring: UiItem | null;
  amulet: UiItem | null;
};

type DragPayload =
  | { from: 'inv'; r: number; c: number; itemId: string }
  | { from: 'eq'; slot: EquipmentSlot; itemId: string };

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
  ring: null,
  amulet: null,
};

function makeMockItems(): UiItem[] {
  return [
    { id: 'm_weapon_1', name: 'Rusty Blade', kind: 'weapon', icon: '⚔️', rarity: 'WHITE', level: 1 },
    { id: 'm_weapon_2', name: 'Iron Dagger', kind: 'weapon', icon: '⚔️', rarity: 'WHITE', level: 1 },
    { id: 'm_head_1', name: 'Cloth Cap', kind: 'head', icon: '🧢', rarity: 'WHITE', level: 1 },
    { id: 'm_chest_1', name: 'Traveler Vest', kind: 'chest', icon: '🦺', rarity: 'GREEN', level: 2 },
    { id: 'm_legs_1', name: 'Worn Pants', kind: 'legs', icon: '👖', rarity: 'WHITE', level: 1 },
    { id: 'm_hands_1', name: 'Leather Gloves', kind: 'hands', icon: '🧤', rarity: 'WHITE', level: 1 },
    { id: 'm_feet_1', name: 'Old Boots', kind: 'feet', icon: '🧦', rarity: 'WHITE', level: 1 },
    { id: 'm_ring_1', name: 'Copper Ring', kind: 'ring', icon: '💍', rarity: 'BLUE', level: 3 },
    { id: 'm_amulet_1', name: 'Bone Amulet', kind: 'amulet', icon: '📿', rarity: 'BLUE', level: 3 },
    { id: 'm_potion_1', name: 'Health Potion', kind: 'potion', icon: '🧪', rarity: 'WHITE', level: 1 },
  ];
}

function buildEmptyGrid(): (UiItem | null)[][] {
  return Array.from({ length: INV_ROWS }, () => Array.from({ length: INV_COLS }, () => null));
}

function placeItemsRowMajor(items: UiItem[]): (UiItem | null)[][] {
  const grid = buildEmptyGrid();
  let k = 0;
  for (let r = 0; r < INV_ROWS; r++) {
    for (let c = 0; c < INV_COLS; c++) {
      grid[r][c] = items[k] ?? null;
      k += 1;
    }
  }
  return grid;
}

/** Giữ chỗ ô khi đồng bộ từ server; đồ mới chưa có chỗ → ô trống đầu tiên. */
function mergeGridPreservingLayout(prev: (UiItem | null)[][], unequipped: UiItem[]): (UiItem | null)[][] {
  const byId = new Map(unequipped.map((it) => [it.id, it]));
  const next = prev.map((row) => row.slice());
  for (let r = 0; r < INV_ROWS; r++) {
    for (let c = 0; c < INV_COLS; c++) {
      const cell = next[r][c];
      if (!cell) continue;
      const updated = byId.get(cell.id);
      if (!updated) next[r][c] = null;
      else next[r][c] = updated;
    }
  }
  const placed = new Set<string>();
  for (let r = 0; r < INV_ROWS; r++) {
    for (let c = 0; c < INV_COLS; c++) {
      if (next[r][c]) placed.add(next[r][c]!.id);
    }
  }
  for (const it of unequipped) {
    if (placed.has(it.id)) continue;
    let done = false;
    for (let r = 0; r < INV_ROWS && !done; r++) {
      for (let c = 0; c < INV_COLS && !done; c++) {
        if (!next[r][c]) {
          next[r][c] = it;
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
  // Opt extra follow rank color; base lines stay white-ish.
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

function Slot({
  label,
  item,
  selected,
  onClick,
  onDragStart,
  onDrop,
  onDragOver,
  actionLabel,
  onActionEquip,
  onActionDelete,
}: {
  label?: string;
  item: UiItem | null;
  selected: boolean;
  onClick: () => void;
  onDragStart?: (ev: React.DragEvent) => void;
  onDrop: (ev: React.DragEvent) => void;
  onDragOver: (ev: React.DragEvent) => void;
  actionLabel?: string;
  onActionEquip?: () => void;
  onActionDelete?: () => void;
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
  return (
    <div
      tabIndex={-1}
      className={`group rpg-slot relative h-12 w-12 select-none rounded-md border ${
        item ? rarityBorder(item.rarity) : 'border-slate-700/70'
      } ${selected ? 'rpg-slot-selected' : ''}`}
      onClick={onClick}
      draggable={Boolean(item)}
      onDragStart={onDragStart}
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      <div className="rpg-slot-frame absolute inset-[3px] rounded-[6px]" aria-hidden />
      <div className="relative flex h-full w-full items-center justify-center text-xl drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]">
        {item?.icon ?? ''}
      </div>
      {!item && label && (
        <div className="pointer-events-none absolute bottom-1 right-1 text-[10px] font-bold text-slate-500/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
          {label}
        </div>
      )}
      {item && (
        <div className="absolute left-1/2 top-full z-50 hidden w-max -translate-x-1/2 rounded-md border border-slate-700 bg-slate-950/95 px-2 py-1 text-xs text-slate-100 shadow-lg group-hover:block">
          <div className={`font-semibold ${rarityText(item.rarity)}`}>{item.name}</div>
          <div className="text-[11px] text-slate-300">
            {item.kind}
            {typeof item.level === 'number' ? ` · lv${item.level}` : ''}
          </div>
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
            <div className="mt-2 flex items-center justify-end gap-6 border-t border-slate-800/70 pt-2 text-[11px]">
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
  const setEquipmentLayout = useGameStore((s) => s.setEquipmentLayout);
  const setInventory = useGameStore((s) => s.setInventory);
  const patchCharacter = useGameStore((s) => s.patchCharacter);
  const backendItems = useGameStore((s) => s.inventory);
  const inventoryGridByCharacterId = useGameStore((s) => s.inventoryGridByCharacterId);
  const setInventoryGridLayout = useGameStore((s) => s.setInventoryGridLayout);

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

  // Source of truth = backend inventory items.
  // Any item with equipped=true is shown in equipment; unequipped items are shown in the inventory grid.
  // Layout trong hòm giữ nguyên khi sync; đổi nhân vật hoặc bấm "Xếp đồ" mới xếp lại hàng loạt.
  useEffect(() => {
    if (backendItems.length === 0) {
      setEquip({ ...EMPTY_EQUIP });
      setGrid(placeItemsRowMajor([]));
      lastCharacterIdRef.current = characterId;
      setEquipmentLayout(
        (Object.keys(EMPTY_EQUIP) as EquipmentSlot[]).reduce((acc, k) => {
          acc[k] = null;
          return acc;
        }, {} as Record<EquipmentSlot, string | null>),
      );
      return;
    }
    const equipped = backendItems.filter((it: any) => it?.equipped);
    const unequipped = backendItems.filter((it: any) => !it?.equipped);
    const eqUi = equipped.map(mapBackendItemToUi);
    const invUi = unequipped.map(mapBackendItemToUi);

    const nextEq = { ...EMPTY_EQUIP } as EquipmentState;
    for (const it of eqUi) {
      if (it.kind === 'weapon') {
        if (!nextEq.weaponRight) nextEq.weaponRight = it;
        else if (!nextEq.weaponLeft) nextEq.weaponLeft = it;
      } else if (it.kind === 'ring') {
        nextEq.ring = it;
      } else if (it.kind === 'amulet') {
        nextEq.amulet = it;
      } else if (it.kind === 'head') nextEq.head = it;
      else if (it.kind === 'chest') nextEq.chest = it;
      else if (it.kind === 'legs') nextEq.legs = it;
      else if (it.kind === 'hands') nextEq.hands = it;
      else if (it.kind === 'feet') nextEq.feet = it;
    }
    setEquip(nextEq);
    const charSwitched = characterId !== lastCharacterIdRef.current;
    lastCharacterIdRef.current = characterId;
    setGrid((prev) => {
      if (charSwitched && characterId) {
        const layout = inventoryGridByCharacterId[characterId];
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
    const equipIds = {
      head: nextEq.head?.id ?? null,
      chest: nextEq.chest?.id ?? null,
      legs: nextEq.legs?.id ?? null,
      hands: nextEq.hands?.id ?? null,
      feet: nextEq.feet?.id ?? null,
      weaponLeft: nextEq.weaponLeft?.id ?? null,
      weaponRight: nextEq.weaponRight?.id ?? null,
      ring: nextEq.ring?.id ?? null,
      amulet: nextEq.amulet?.id ?? null,
    } as Record<EquipmentSlot, string | null>;
    setEquipmentLayout(equipIds);
  }, [backendItems, characterId, setEquipmentLayout]);

  const onDragOver = (ev: React.DragEvent) => ev.preventDefault();

  const firstEmptyCell = (g: (UiItem | null)[][]): { r: number; c: number } | null => {
    for (let r = 0; r < INV_ROWS; r++) {
      for (let c = 0; c < INV_COLS; c++) {
        if (!g[r]![c]) return { r, c };
      }
    }
    return null;
  };

  const bestEquipSlot = (item: UiItem): EquipmentSlot | null => {
    if (item.kind === 'weapon') return 'weaponRight';
    if (item.kind === 'ring') return 'ring';
    if (item.kind === 'amulet') return 'amulet';
    if (item.kind === 'head') return 'head';
    if (item.kind === 'chest') return 'chest';
    if (item.kind === 'legs') return 'legs';
    if (item.kind === 'hands') return 'hands';
    if (item.kind === 'feet') return 'feet';
    return null;
  };

  const equipFromInvCell = (srcR: number, srcC: number) => {
    const item = grid[srcR]?.[srcC];
    if (!item) return;
    const targetSlot = bestEquipSlot(item);
    if (!targetSlot) return;
    if (!slotAccepts(targetSlot, item)) return;
    if (!token || !characterId) return;
    void equipItem(token, characterId, item.id).then((payload) => {
      setInventory(payload.inventoryItems ?? []);
      if (payload.character) patchCharacter(payload.character);
      window.dispatchEvent(new CustomEvent('rpg:refreshRegen'));
    });
  };

  const unequipToInventory = (slot: EquipmentSlot) => {
    const item = equip[slot];
    if (!item) return;
    if (!token || !characterId) return;
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
      const a = next[srcR][srcC];
      const b = next[dstR][dstC];
      next[dstR][dstC] = a;
      next[srcR][srcC] = b;
      return next;
    });
  };

  const moveFromInvToEq = (srcR: number, srcC: number, slot: EquipmentSlot) => {
    const item = grid[srcR]?.[srcC];
    if (!item) return;
    if (!slotAccepts(slot, item)) return;
    if (!token || !characterId) return;
    void equipItem(token, characterId, item.id).then((payload) => {
      setInventory(payload.inventoryItems ?? []);
      if (payload.character) patchCharacter(payload.character);
      window.dispatchEvent(new CustomEvent('rpg:refreshRegen'));
    });
  };

  const moveFromEqToInv = (slot: EquipmentSlot, dstR: number, dstC: number) => {
    const item = equip[slot];
    if (!item) return;
    if (!token || !characterId) return;
    void unequipItem(token, characterId, item.id).then((payload) => {
      setInventory(payload.inventoryItems ?? []);
      if (payload.character) patchCharacter(payload.character);
      window.dispatchEvent(new CustomEvent('rpg:refreshRegen'));
    });
  };

  const moveFromEqToEq = (src: EquipmentSlot, dst: EquipmentSlot) => {
    setEquip((prevEq) => {
      const a = prevEq[src];
      const b = prevEq[dst];
      if (a && !slotAccepts(dst, a)) return prevEq;
      if (b && !slotAccepts(src, b)) return prevEq;
      return { ...prevEq, [src]: b ?? null, [dst]: a ?? null };
    });
  };

  const handleDropOnInv = (dstR: number, dstC: number) => (ev: React.DragEvent) => {
    ev.preventDefault();
    const p = tryParseDrag(ev);
    if (!p) return;
    if (p.from === 'inv') moveFromInvToInv(p.r, p.c, dstR, dstC);
    else moveFromEqToInv(p.slot, dstR, dstC);
  };

  const handleDropOnEq = (slot: EquipmentSlot) => (ev: React.DragEvent) => {
    ev.preventDefault();
    const p = tryParseDrag(ev);
    if (!p) return;
    if (p.from === 'inv') moveFromInvToEq(p.r, p.c, slot);
    else moveFromEqToEq(p.slot, slot);
  };

  const dragStartInv = (r: number, c: number, item: UiItem) => (ev: React.DragEvent) => {
    const payload: DragPayload = { from: 'inv', r, c, itemId: item.id };
    ev.dataTransfer.setData('application/x-rpg-item', JSON.stringify(payload));
    ev.dataTransfer.effectAllowed = 'move';
  };

  const dragStartEq = (slot: EquipmentSlot, item: UiItem) => (ev: React.DragEvent) => {
    const payload: DragPayload = { from: 'eq', slot, itemId: item.id };
    ev.dataTransfer.setData('application/x-rpg-item', JSON.stringify(payload));
    ev.dataTransfer.effectAllowed = 'move';
  };

  const packInventoryRowMajor = () => {
    const invUi = backendItems.filter((it: any) => !it?.equipped).map(mapBackendItemToUi);
    setGrid(placeItemsRowMajor(invUi));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-slate-700/60 bg-slate-950/40 p-3 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-bold tracking-wide text-slate-200">Equipment</div>
          <div className="text-xs text-slate-400">Drag items to equip slots</div>
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="grid grid-cols-3 gap-2">
            <Slot
              label="Head"
              item={equip.head}
              selected={selected?.kind === 'eq' && selected.slot === 'head'}
              onClick={() => setSelected({ kind: 'eq', slot: 'head' })}
              onDragStart={equip.head ? dragStartEq('head', equip.head) : undefined}
              onDrop={handleDropOnEq('head')}
              onDragOver={onDragOver}
              actionLabel="Unequip"
              onActionEquip={equip.head ? () => unequipToInventory('head') : undefined}
              onActionDelete={equip.head ? () => deleteEquipSlot('head') : undefined}
            />
            <Slot
              label="Chest"
              item={equip.chest}
              selected={selected?.kind === 'eq' && selected.slot === 'chest'}
              onClick={() => setSelected({ kind: 'eq', slot: 'chest' })}
              onDragStart={equip.chest ? dragStartEq('chest', equip.chest) : undefined}
              onDrop={handleDropOnEq('chest')}
              onDragOver={onDragOver}
              actionLabel="Unequip"
              onActionEquip={equip.chest ? () => unequipToInventory('chest') : undefined}
              onActionDelete={equip.chest ? () => deleteEquipSlot('chest') : undefined}
            />
            <Slot
              label="Hands"
              item={equip.hands}
              selected={selected?.kind === 'eq' && selected.slot === 'hands'}
              onClick={() => setSelected({ kind: 'eq', slot: 'hands' })}
              onDragStart={equip.hands ? dragStartEq('hands', equip.hands) : undefined}
              onDrop={handleDropOnEq('hands')}
              onDragOver={onDragOver}
              actionLabel="Unequip"
              onActionEquip={equip.hands ? () => unequipToInventory('hands') : undefined}
              onActionDelete={equip.hands ? () => deleteEquipSlot('hands') : undefined}
            />
            <Slot
              label="Weapon L"
              item={equip.weaponLeft}
              selected={selected?.kind === 'eq' && selected.slot === 'weaponLeft'}
              onClick={() => setSelected({ kind: 'eq', slot: 'weaponLeft' })}
              onDragStart={equip.weaponLeft ? dragStartEq('weaponLeft', equip.weaponLeft) : undefined}
              onDrop={handleDropOnEq('weaponLeft')}
              onDragOver={onDragOver}
              actionLabel="Unequip"
              onActionEquip={equip.weaponLeft ? () => unequipToInventory('weaponLeft') : undefined}
              onActionDelete={equip.weaponLeft ? () => deleteEquipSlot('weaponLeft') : undefined}
            />
            <Slot
              label="Weapon R"
              item={equip.weaponRight}
              selected={selected?.kind === 'eq' && selected.slot === 'weaponRight'}
              onClick={() => setSelected({ kind: 'eq', slot: 'weaponRight' })}
              onDragStart={equip.weaponRight ? dragStartEq('weaponRight', equip.weaponRight) : undefined}
              onDrop={handleDropOnEq('weaponRight')}
              onDragOver={onDragOver}
              actionLabel="Unequip"
              onActionEquip={equip.weaponRight ? () => unequipToInventory('weaponRight') : undefined}
              onActionDelete={equip.weaponRight ? () => deleteEquipSlot('weaponRight') : undefined}
            />
            <Slot
              label="Ring"
              item={equip.ring}
              selected={selected?.kind === 'eq' && selected.slot === 'ring'}
              onClick={() => setSelected({ kind: 'eq', slot: 'ring' })}
              onDragStart={equip.ring ? dragStartEq('ring', equip.ring) : undefined}
              onDrop={handleDropOnEq('ring')}
              onDragOver={onDragOver}
              actionLabel="Unequip"
              onActionEquip={equip.ring ? () => unequipToInventory('ring') : undefined}
              onActionDelete={equip.ring ? () => deleteEquipSlot('ring') : undefined}
            />
            <Slot
              label="Legs"
              item={equip.legs}
              selected={selected?.kind === 'eq' && selected.slot === 'legs'}
              onClick={() => setSelected({ kind: 'eq', slot: 'legs' })}
              onDragStart={equip.legs ? dragStartEq('legs', equip.legs) : undefined}
              onDrop={handleDropOnEq('legs')}
              onDragOver={onDragOver}
              actionLabel="Unequip"
              onActionEquip={equip.legs ? () => unequipToInventory('legs') : undefined}
              onActionDelete={equip.legs ? () => deleteEquipSlot('legs') : undefined}
            />
            <Slot
              label="Feet"
              item={equip.feet}
              selected={selected?.kind === 'eq' && selected.slot === 'feet'}
              onClick={() => setSelected({ kind: 'eq', slot: 'feet' })}
              onDragStart={equip.feet ? dragStartEq('feet', equip.feet) : undefined}
              onDrop={handleDropOnEq('feet')}
              onDragOver={onDragOver}
              actionLabel="Unequip"
              onActionEquip={equip.feet ? () => unequipToInventory('feet') : undefined}
              onActionDelete={equip.feet ? () => deleteEquipSlot('feet') : undefined}
            />
            <Slot
              label="Amulet"
              item={equip.amulet}
              selected={selected?.kind === 'eq' && selected.slot === 'amulet'}
              onClick={() => setSelected({ kind: 'eq', slot: 'amulet' })}
              onDragStart={equip.amulet ? dragStartEq('amulet', equip.amulet) : undefined}
              onDrop={handleDropOnEq('amulet')}
              onDragOver={onDragOver}
              actionLabel="Unequip"
              onActionEquip={equip.amulet ? () => unequipToInventory('amulet') : undefined}
              onActionDelete={equip.amulet ? () => deleteEquipSlot('amulet') : undefined}
            />
          </div>

          <div className="flex-1">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-bold tracking-wide text-slate-200">Inventory</div>
              <button
                type="button"
                tabIndex={-1}
                className="rounded-md border border-slate-600 bg-slate-900/80 px-2 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800"
                onPointerDown={(e) => e.preventDefault()}
                onClick={packInventoryRowMajor}
              >
                Xếp đồ
              </button>
            </div>
            <div
              className="grid gap-1"
              style={{
                gridTemplateColumns: `repeat(${INV_COLS}, 3rem)`,
              }}
            >
              {grid.map((row, r) =>
                row.map((cell, c) => (
                  <Slot
                    key={`${r}_${c}`}
                    item={cell}
                    selected={selected?.kind === 'inv' && selected.r === r && selected.c === c}
                    onClick={() => setSelected({ kind: 'inv', r, c })}
                    onDragStart={cell ? dragStartInv(r, c, cell) : undefined}
                    onDrop={handleDropOnInv(r, c)}
                    onDragOver={onDragOver}
                    onActionEquip={cell ? () => equipFromInvCell(r, c) : undefined}
                    onActionDelete={cell ? () => deleteInvCell(r, c) : undefined}
                  />
                )),
              )}
            </div>
            <div className="mt-2 text-xs text-slate-500">Rules: 1 item/slot · no stacking · no rotation</div>
          </div>
        </div>
      </div>
    </div>
  );
}
