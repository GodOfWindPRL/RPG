import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ITEM_BAR_SIZE,
  MOUSE_SKILL_BAR_SIZE,
  SKILL_BAR_SIZE,
  useGameStore,
} from '../../systems/gameStore';
import { mapBackendItemToUi, type UiItem } from '../../core/items';
import type { CharacterSkill } from '../../core/types';
import { displaySkillManaCost } from '../../core/skillScaling';

export type DockPanel = 'quests' | 'inventory' | 'character' | 'skills';

const NAV_BUTTONS: { panel: DockPanel; hotkey: string; emoji: string; title: string }[] = [
  { panel: 'quests', hotkey: 'F5', emoji: '📜', title: 'Quests (F5)' },
  { panel: 'character', hotkey: 'F6', emoji: '👤', title: 'Hero (F6)' },
  { panel: 'inventory', hotkey: 'F7', emoji: '🎒', title: 'Inventory (F7)' },
  { panel: 'skills', hotkey: 'F8', emoji: '⚔', title: 'Skills (F8)' },
];

function lsKey(characterId: string, name: string) {
  return `rpg.hotbar.${name}.${characterId}`;
}

function loadStoredBar(characterId: string, name: string, size: number): (string | null)[] {
  if (!characterId) return Array.from({ length: size }, () => null);
  try {
    const raw = localStorage.getItem(lsKey(characterId, name));
    if (!raw) return Array.from({ length: size }, () => null);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return Array.from({ length: size }, () => null);
    return Array.from({ length: size }, (_, i) => (typeof parsed[i] === 'string' ? parsed[i] : null));
  } catch {
    return Array.from({ length: size }, () => null);
  }
}

function persistBar(characterId: string, name: string, bar: (string | null)[]) {
  if (!characterId) return;
  try {
    localStorage.setItem(lsKey(characterId, name), JSON.stringify(bar));
  } catch {
    /* ignore quota errors */
  }
}

function skillEmoji(id: string): string {
  if (id === 'slash') return '⚔️';
  if (id === 'firebolt') return '🔥';
  if (id === 'blizzard') return '❄️';
  if (id === 'chaosorb') return '☣️';
  if (id === 'iceshard') return '❄️';
  if (id === 'lightning') return '⚡';
  return '✨';
}

type PickerState = { kind: 'skill' | 'item'; slot: number };
const MOUSE_SKILL_SLOT_BASE = 1000;

export function BottomHUD({
  onOpenModal,
  onCastSkillId,
  onUseItem,
}: {
  onOpenModal: (panel: DockPanel) => void;
  onCastSkillId: (skillId: string) => void;
  onUseItem: (itemId: string) => void;
}) {
  const character = useGameStore((s) => s.character);
  const skills = useGameStore((s) => s.skills);
  const inventory = useGameStore((s) => s.inventory);
  const skillBar = useGameStore((s) => s.skillBar);
  const mouseSkillBar = useGameStore((s) => s.mouseSkillBar);
  const itemBar = useGameStore((s) => s.itemBar);
  const setSkillBar = useGameStore((s) => s.setSkillBar);
  const setMouseSkillBar = useGameStore((s) => s.setMouseSkillBar);
  const setItemBar = useGameStore((s) => s.setItemBar);
  const setSkillBarSlot = useGameStore((s) => s.setSkillBarSlot);
  const setMouseSkillBarSlot = useGameStore((s) => s.setMouseSkillBarSlot);
  const setItemBarSlot = useGameStore((s) => s.setItemBarSlot);
  const setHotbarPickerOpen = useGameStore((s) => s.setHotbarPickerOpen);

  const [picker, setPicker] = useState<PickerState | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const characterId = character?.id ?? '';

  // Load persisted bars when character changes.
  useEffect(() => {
    if (!characterId) return;
    setSkillBar(loadStoredBar(characterId, 'skill', SKILL_BAR_SIZE));
    setMouseSkillBar(loadStoredBar(characterId, 'mouseSkill', MOUSE_SKILL_BAR_SIZE));
    setItemBar(loadStoredBar(characterId, 'item', ITEM_BAR_SIZE));
  }, [characterId, setSkillBar, setMouseSkillBar, setItemBar]);

  // Persist on change.
  useEffect(() => {
    if (!characterId) return;
    persistBar(characterId, 'skill', skillBar);
  }, [characterId, skillBar]);
  useEffect(() => {
    if (!characterId) return;
    persistBar(characterId, 'mouseSkill', mouseSkillBar);
  }, [characterId, mouseSkillBar]);
  useEffect(() => {
    if (!characterId) return;
    persistBar(characterId, 'item', itemBar);
  }, [characterId, itemBar]);

  // Auto-clear stale references when skills / inventory actually change. Guarded
  // so that we don't wipe localStorage-loaded data while the socket sync is still
  // in flight (skills/inventory briefly empty on first frame).
  useEffect(() => {
    if (skills.length === 0) return;
    const valid = new Set(skills.map((s) => s.skill.id));
    const current = useGameStore.getState().skillBar;
    const cleaned = current.map((id) => (id && valid.has(id) ? id : null));
    if (cleaned.some((v, i) => v !== current[i])) setSkillBar(cleaned);
  }, [skills, setSkillBar]);
  useEffect(() => {
    if (skills.length === 0) return;
    const valid = new Set(skills.map((s) => s.skill.id));
    const current = useGameStore.getState().mouseSkillBar;
    const cleaned = current.map((id) => (id && valid.has(id) ? id : null));
    if (cleaned.some((v, i) => v !== current[i])) setMouseSkillBar(cleaned);
  }, [skills, setMouseSkillBar]);

  useEffect(() => {
    if (inventory.length === 0) return;
    const valid = new Set(inventory.map((it) => it.id));
    const current = useGameStore.getState().itemBar;
    const cleaned = current.map((id) => (id && valid.has(id) ? id : null));
    if (cleaned.some((v, i) => v !== current[i])) setItemBar(cleaned);
  }, [inventory, setItemBar]);

  // Tell App key handler when picker is open so 1-6 / F1-F4 don't fire.
  useEffect(() => {
    setHotbarPickerOpen(Boolean(picker));
    return () => setHotbarPickerOpen(false);
  }, [picker, setHotbarPickerOpen]);

  // Close on Escape.
  useEffect(() => {
    if (!picker) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPicker(null);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [picker]);

  // Close on outside click (but not when clicking the trigger slot).
  useEffect(() => {
    if (!picker) return;
    function onDown(ev: MouseEvent) {
      const t = ev.target as Element | null;
      if (!t) return;
      if (popupRef.current?.contains(t)) return;
      if (t.closest(`[data-trigger="${picker!.kind}-${picker!.slot}"]`)) return;
      setPicker(null);
    }
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [picker]);

  const skillsById = useMemo(() => new Map(skills.map((s) => [s.skill.id, s])), [skills]);
  const itemsById = useMemo(() => new Map(inventory.map((it) => [it.id, it])), [inventory]);

  // Items eligible for the F1–F4 bar. Today only `potion` is consumable in the
  // taxonomy; expand here when more consumable kinds appear.
  const usableItems: UiItem[] = useMemo(
    () => inventory.map(mapBackendItemToUi).filter((it) => it.kind === 'potion'),
    [inventory],
  );

  // Show all skills the character owns (level >= 0). Casting still respects
  // mana / cooldown / level checks downstream.
  const assignableSkills: CharacterSkill[] = skills;

  if (!character) return null;

  const maxHp = Math.max(1, character.maxHp);
  const maxMana = Math.max(1, character.maxMana);
  const expCap = Math.max(1, character.expToNext);
  const hpPct = Math.max(0, Math.min(100, (character.hp / maxHp) * 100));
  const manaPct = Math.max(0, Math.min(100, (character.mana / maxMana) * 100));
  const expPct = Math.max(0, Math.min(100, (character.exp / expCap) * 100));

  function togglePicker(kind: PickerState['kind'], slot: number) {
    setPicker((cur) => (cur && cur.kind === kind && cur.slot === slot ? null : { kind, slot }));
  }

  function handleSkillSlotClick(i: number, sk: CharacterSkill | null) {
    if (sk) onCastSkillId(sk.skill.id);
    else togglePicker('skill', i);
  }

  function handleMouseSkillSlotClick(i: number, sk: CharacterSkill | null) {
    if (sk) onCastSkillId(sk.skill.id);
    else togglePicker('skill', MOUSE_SKILL_SLOT_BASE + i);
  }

  function handleItemSlotClick(i: number, ui: UiItem | null) {
    if (ui) onUseItem(ui.id);
    else togglePicker('item', i);
  }

  return (
    <div className="bottom-hud">
      <div className="bottom-hud-frame">
        <div className="bottom-hud-side bottom-hud-left">
          <div className="orb orb-hp" title={`HP ${character.hp}/${maxHp}`}>
            <div className="orb-fill orb-fill-hp" style={{ height: `${hpPct}%` }} />
            <div className="orb-shine" aria-hidden />
            <div className="orb-text">
              <span className="orb-text-main">{character.hp}</span>
              <span className="orb-text-sub">/ {maxHp}</span>
            </div>
          </div>

          <div className="hotbar-wrap">
            {picker?.kind === 'item' && (
              <div ref={popupRef} className="hot-popup hot-popup-left" role="dialog">
                {usableItems.length === 0 ? (
                  <div className="hot-popup-empty">
                    Túi đồ chưa có item dùng được.
                  </div>
                ) : (
                  usableItems.map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      tabIndex={-1}
                      className="hot-popup-item"
                      onClick={(e) => {
                        e.stopPropagation();
                        setItemBarSlot(picker.slot, it.id);
                        setPicker(null);
                      }}
                      title={`${it.name}${typeof it.level === 'number' ? ` · Lv${it.level}` : ''}`}
                    >
                      <span className="hot-popup-icon">{it.icon}</span>
                    </button>
                  ))
                )}
                <button
                  type="button"
                  tabIndex={-1}
                  className="hot-popup-item hot-popup-clear"
                  onClick={(e) => {
                    e.stopPropagation();
                    setItemBarSlot(picker.slot, null);
                    setPicker(null);
                  }}
                  title="Bỏ gắn"
                >
                  <span className="hot-popup-icon">✕</span>
                </button>
              </div>
            )}
            <div className="hotbar hotbar-items" aria-label="Item hotbar">
              {Array.from({ length: ITEM_BAR_SIZE }, (_, i) => {
                const id = itemBar[i];
                const it = id ? itemsById.get(id) : null;
                const ui = it ? mapBackendItemToUi(it) : null;
                return (
                  <button
                    key={i}
                    type="button"
                    tabIndex={-1}
                    data-trigger={`item-${i}`}
                    className={`hot-slot hot-slot-item ${ui ? '' : 'hot-slot-empty'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleItemSlotClick(i, ui);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      togglePicker('item', i);
                    }}
                    title={
                      ui
                        ? `${ui.name} · F${i + 1} · right-click để đổi`
                        : `Trống · F${i + 1} · click để gắn`
                    }
                  >
                    <span className="hot-key">F{i + 1}</span>
                    {ui ? <span className="hot-icon">{ui.icon}</span> : <span className="hot-empty">+</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="bottom-hud-center">
          <div className="bottom-nav" aria-label="Menu">
            {NAV_BUTTONS.map((b) => (
              <button
                key={b.panel}
                type="button"
                tabIndex={-1}
                className="nav-btn"
                onClick={() => onOpenModal(b.panel)}
                title={b.title}
              >
                <span className="nav-icon">{b.emoji}</span>
                <span className="nav-key">{b.hotkey}</span>
              </button>
            ))}
          </div>
          <div className="exp-bar" title={`Lv.${character.level} · ${character.exp}/${expCap}`}>
            <div className="exp-bar-fill" style={{ width: `${expPct}%` }} />
            <div className="exp-bar-text">
              Lv.{character.level} · {character.exp} / {expCap}
            </div>
          </div>
        </div>

        <div className="bottom-hud-side bottom-hud-right">
          <div className="hotbar-wrap">
            {picker?.kind === 'skill' && (
              <div ref={popupRef} className="hot-popup hot-popup-right" role="dialog">
                {assignableSkills.length === 0 ? (
                  <div className="hot-popup-empty">
                    Chưa có skill. Mở Skills (F8) để học.
                  </div>
                ) : (
                  assignableSkills.map((s) => {
                    const mp = displaySkillManaCost(s.skill.id, s.level, s.skill.damageKind, s.skill.manaCost ?? 0);
                    return (
                    <button
                      key={s.id}
                      type="button"
                      tabIndex={-1}
                      className="hot-popup-item"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (picker.slot >= MOUSE_SKILL_SLOT_BASE) {
                          setMouseSkillBarSlot(picker.slot - MOUSE_SKILL_SLOT_BASE, s.skill.id);
                        } else {
                          setSkillBarSlot(picker.slot, s.skill.id);
                        }
                        setPicker(null);
                      }}
                      title={`${s.skill.name} · Lv${s.level}${mp > 0 ? ` · ${mp} MP` : ''}`}
                    >
                      <span className="hot-popup-icon">{skillEmoji(s.skill.id)}</span>
                    </button>
                  );
                  })
                )}
                <button
                  type="button"
                  tabIndex={-1}
                  className="hot-popup-item hot-popup-clear"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (picker.slot >= MOUSE_SKILL_SLOT_BASE) {
                      setMouseSkillBarSlot(picker.slot - MOUSE_SKILL_SLOT_BASE, null);
                    } else {
                      setSkillBarSlot(picker.slot, null);
                    }
                    setPicker(null);
                  }}
                  title="Bỏ gắn"
                >
                  <span className="hot-popup-icon">✕</span>
                </button>
              </div>
            )}
            <div className="hotbar hotbar-mouse-skills" aria-label="Mouse skills">
              {[0, 2, 1].map((i) => {
                const id = mouseSkillBar[i];
                const sk = id ? skillsById.get(id) ?? null : null;
                const label = i === 0 ? 'LMB' : i === 1 ? 'RMB' : 'MMB';
                return (
                  <button
                    key={`ms-${i}`}
                    type="button"
                    tabIndex={-1}
                    data-trigger={`skill-${MOUSE_SKILL_SLOT_BASE + i}`}
                    className={`hot-slot hot-slot-skill ${sk ? '' : 'hot-slot-empty'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMouseSkillSlotClick(i, sk);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      togglePicker('skill', MOUSE_SKILL_SLOT_BASE + i);
                    }}
                    title={sk ? `${label}: ${sk.skill.name} · click để dùng` : `${label}: click để gắn`}
                  >
                    <span className="hot-key">{label}</span>
                    {sk ? (
                      <>
                        <span className="hot-icon">{skillEmoji(sk.skill.id)}</span>
                        <span className="hot-meta">Lv{sk.level}</span>
                      </>
                    ) : (
                      <span className="hot-empty">+</span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="hotbar hotbar-skills" aria-label="Skill hotbar">
              {Array.from({ length: SKILL_BAR_SIZE }, (_, i) => {
                const id = skillBar[i];
                const sk = id ? skillsById.get(id) ?? null : null;
                return (
                  <button
                    key={i}
                    type="button"
                    tabIndex={-1}
                    data-trigger={`skill-${i}`}
                    className={`hot-slot hot-slot-skill ${sk ? '' : 'hot-slot-empty'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSkillSlotClick(i, sk);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      togglePicker('skill', i);
                    }}
                    title={
                      sk
                        ? `${sk.skill.name} · ${i + 1} · right-click để đổi`
                        : `Trống · ${i + 1} · click để gắn`
                    }
                  >
                    <span className="hot-key">{i + 1}</span>
                    {sk ? (
                      <>
                        <span className="hot-icon">{skillEmoji(sk.skill.id)}</span>
                        <span className="hot-meta">Lv{sk.level}</span>
                      </>
                    ) : (
                      <span className="hot-empty">+</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="orb orb-mp" title={`MP ${character.mana}/${maxMana}`}>
            <div className="orb-fill orb-fill-mp" style={{ height: `${manaPct}%` }} />
            <div className="orb-shine" aria-hidden />
            <div className="orb-text">
              <span className="orb-text-main">{character.mana}</span>
              <span className="orb-text-sub">/ {maxMana}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
