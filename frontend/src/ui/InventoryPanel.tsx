import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../systems/gameStore';
import type { EquipmentSlot, OptLine, UiItem } from '../core/items';
import { allOptLines, mapBackendItemToUi, slotAccepts } from '../core/items';

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
  return (
    <div
      className={`group rpg-slot relative h-12 w-12 select-none rounded-md border transition ${
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
          <div className="font-semibold">{item.name}</div>
          <div className="text-[11px] text-slate-300">
            {item.kind}
            {typeof item.level === 'number' ? ` · lv${item.level}` : ''}
            {item.rarity ? ` · ${item.rarity}` : ''}
          </div>
          {opts.length > 0 && (
            <div className="mt-1 flex flex-col gap-0.5 text-[11px]">
              {opts.map((ln) => (
                <div key={ln.key} className={ln.tone === 'base' ? 'text-slate-100' : 'text-emerald-300'}>
                  {ln.label}: <span className="font-semibold">{ln.valueText}</span>
                </div>
              ))}
            </div>
          )}
          {(onActionEquip || onActionDelete) && (
            <div className="mt-2 flex items-center justify-end gap-6 border-t border-slate-800/70 pt-2 text-[11px]">
              {onActionEquip && (
                <button
                  type="button"
                  className="cursor-pointer font-bold text-sky-200 hover:text-sky-100"
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
                  className="cursor-pointer font-bold text-rose-200 hover:text-rose-100"
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
  const setEquipmentLayout = useGameStore((s) => s.setEquipmentLayout);
  const setInventory = useGameStore((s) => s.setInventory);
  const backendItems = useGameStore((s) => s.inventory);
  const uiItems = useMemo(() => backendItems.map(mapBackendItemToUi), [backendItems]);

  const seedItems = useMemo(() => (uiItems.length > 0 ? uiItems : makeMockItems()), [uiItems]);
  const [grid, setGrid] = useState<(UiItem | null)[][]>(() => placeItemsRowMajor(seedItems));
  const [equip, setEquip] = useState<EquipmentState>(() => ({ ...EMPTY_EQUIP }));
  const [selected, setSelected] = useState<{ kind: 'inv'; r: number; c: number } | { kind: 'eq'; slot: EquipmentSlot } | null>(null);

  useEffect(() => {
    if (!characterId) return;
    const key = `rpg_inv_layout_${characterId}`;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        equip?: Partial<Record<EquipmentSlot, string | null>>;
        grid?: (string | null)[][];
      };
      const byId = new Map(seedItems.map((it) => [it.id, it]));
      if (parsed.equip) {
        const nextEq = { ...EMPTY_EQUIP } as EquipmentState;
        (Object.keys(EMPTY_EQUIP) as EquipmentSlot[]).forEach((slot) => {
          const id = parsed.equip?.[slot] ?? null;
          nextEq[slot] = id ? byId.get(id) ?? null : null;
        });
        setEquip(nextEq);
      }
      if (parsed.grid) {
        const nextGrid = buildEmptyGrid();
        for (let r = 0; r < Math.min(INV_ROWS, parsed.grid.length); r++) {
          for (let c = 0; c < Math.min(INV_COLS, parsed.grid[r]!.length); c++) {
            const id = parsed.grid[r]![c];
            nextGrid[r]![c] = id ? byId.get(id) ?? null : null;
          }
        }
        setGrid(nextGrid);
      }
    } catch {
      /* ignore */
    }
  }, [characterId]);

  useEffect(() => {
    if (!characterId) return;
    const key = `rpg_inv_layout_${characterId}`;
    const equipIds = Object.fromEntries(
      (Object.keys(EMPTY_EQUIP) as EquipmentSlot[]).map((k) => [k, equip[k]?.id ?? null]),
    ) as Record<EquipmentSlot, string | null>;
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          equip: equipIds,
          grid: grid.map((row) => row.map((cell) => cell?.id ?? null)),
        }),
      );
    } catch {
      /* ignore */
    }
    setEquipmentLayout(equipIds);
  }, [characterId, equip, grid, setEquipmentLayout]);

  // If backend inventory changes (loot), re-seed into empty slots (non-destructive).
  useEffect(() => {
    if (uiItems.length === 0) return;
    setGrid((prev) => {
      const next = prev.map((row) => row.slice());
      const present = new Set<string>();
      for (const row of next) for (const cell of row) if (cell) present.add(cell.id);
      for (const it of Object.values(equip)) if (it) present.add(it.id);
      for (const it of uiItems) {
        if (present.has(it.id)) continue;
        let placed = false;
        for (let r = 0; r < INV_ROWS && !placed; r++) {
          for (let c = 0; c < INV_COLS && !placed; c++) {
            if (!next[r][c]) {
              next[r][c] = it;
              placed = true;
            }
          }
        }
      }
      return next;
    });
  }, [uiItems, equip]);

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
    // Swap inventory cell with whatever is equipped in that slot.
    setEquip((prevEq) => {
      const prevItem = prevEq[targetSlot];
      setGrid((prevGrid) => {
        const next = prevGrid.map((row) => row.slice());
        next[srcR]![srcC] = prevItem ?? null;
        return next;
      });
      return { ...prevEq, [targetSlot]: item };
    });
  };

  const unequipToInventory = (slot: EquipmentSlot) => {
    const item = equip[slot];
    if (!item) return;
    setGrid((prevGrid) => {
      const spot = firstEmptyCell(prevGrid);
      if (!spot) {
        // Inventory full: can't unequip.
        return prevGrid;
      }
      const next = prevGrid.map((row) => row.slice());
      next[spot.r]![spot.c] = item;
      setEquip((prevEq) => ({ ...prevEq, [slot]: null }));
      return next;
    });
  };

  const deleteInvCell = (r: number, c: number) => {
    setGrid((prev) => {
      const next = prev.map((row) => row.slice());
      const it = next[r]![c];
      if (it?.id) window.dispatchEvent(new CustomEvent('rpg:itemDelete', { detail: { itemId: it.id } }));
      if (it?.id) setInventory(useGameStore.getState().inventory.filter((x) => x.id !== it.id));
      next[r]![c] = null;
      return next;
    });
  };

  const deleteEquipSlot = (slot: EquipmentSlot) => {
    setEquip((prev) => {
      const it = prev[slot];
      if (it?.id) window.dispatchEvent(new CustomEvent('rpg:itemDelete', { detail: { itemId: it.id } }));
      if (it?.id) setInventory(useGameStore.getState().inventory.filter((x) => x.id !== it.id));
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
    setEquip((prevEq) => {
      const out = prevEq[slot];
      setGrid((prevGrid) => {
        const cell = prevGrid[srcR]?.[srcC];
        if (!cell || cell.id !== item.id) return prevGrid;
        const next = prevGrid.map((row) => row.slice());
        next[srcR]![srcC] = out ?? null;
        return next;
      });
      return { ...prevEq, [slot]: item };
    });
  };

  const moveFromEqToInv = (slot: EquipmentSlot, dstR: number, dstC: number) => {
    setEquip((prevEq) => {
      const item = prevEq[slot];
      if (!item) return prevEq;
      setGrid((prevGrid) => {
        const next = prevGrid.map((row) => row.slice());
        const existing = next[dstR][dstC];
        next[dstR][dstC] = item;
        // if slot had an item and we swapped, put it back into equip slot if it fits, else drop back to same inv slot is disallowed; simplest: allow swap only if existing can occupy that equip slot.
        if (existing) {
          if (!slotAccepts(slot, existing)) {
            // revert
            next[dstR][dstC] = existing;
            return prevGrid;
          }
          // swap into equip
          setEquip((eq2) => ({ ...eq2, [slot]: existing }));
          return next;
        }
        return next;
      });
      return { ...prevEq, [slot]: null };
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
            <div className="mb-2 text-sm font-bold tracking-wide text-slate-200">Inventory</div>
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
