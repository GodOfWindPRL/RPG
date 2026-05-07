import { useState } from 'react';
import { allocateStat, resetCharacter } from '../../network/api';
import { useGameStore } from '../../systems/gameStore';
import { emptyEquipmentLayout } from '../../systems/gameStore';
import { PLAYER_MAX_MOVE_SPEED } from '../../core/world';
import { PLAYER_BASE_CRIT_MULT, PLAYER_BASE_CRIT_RATE } from '../../core/combatConstants';
import { mapBackendItemToUi, sumBonuses } from '../../core/items';

export function CharacterSheet() {
  const character = useGameStore((s) => s.character);
  const token = useGameStore((s) => s.token);
  const equipmentLayout = useGameStore((s) => s.equipmentLayout);
  const inventory = useGameStore((s) => s.inventory);
  const patchCharacter = useGameStore((s) => s.patchCharacter);
  const setSkills = useGameStore((s) => s.setSkills);
  const setInventory = useGameStore((s) => s.setInventory);
  const setEquipmentLayout = useGameStore((s) => s.setEquipmentLayout);
  const [err, setErr] = useState<string | null>(null);

  if (!character || !token) return null;

  async function add(stat: 'str' | 'agi' | 'vit' | 'mag') {
    setErr(null);
    try {
      const { character: next } = await allocateStat(token, character.id, stat);
      patchCharacter(next);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const canAlloc = character.statPoints > 0;

  async function onResetCharacter() {
    setErr(null);
    const ok = window.confirm('Reset character về level 1, stat/skill point và chỉ giữ skill Slash?');
    if (!ok) return;
    try {
      const payload = await resetCharacter(token, character.id);
      patchCharacter(payload.character);
      setSkills(payload.skills);
      setInventory(payload.inventoryItems ?? []);
      setEquipmentLayout(emptyEquipmentLayout());
      try {
        localStorage.removeItem(`rpg_inv_layout_${character.id}`);
      } catch {
        /* ignore */
      }
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const maxHp = Math.max(1, character.maxHp);
  const maxMana = Math.max(1, character.maxMana);
  const hpPct = Math.min(100, (character.hp / maxHp) * 100);
  const manaPct = Math.min(100, (character.mana / maxMana) * 100);

  const equippedUiItems = Object.values(equipmentLayout)
    .map((id) => (id ? inventory.find((it) => it.id === id) ?? null : null))
    .filter(Boolean)
    .map((it) => mapBackendItemToUi(it!));
  const bonus = sumBonuses(equippedUiItems);
  const effAcc = character.accuracy + (bonus.accuracy ?? 0);
  const effAtkSpd = character.attackSpeed + (bonus.attackSpeed ?? 0);
  const effMove = PLAYER_MAX_MOVE_SPEED + (bonus.moveSpeed ?? 0);
  const effPhys = character.corePhysDamage + (bonus.corePhysDamage ?? 0);
  const effMag = character.coreMagicDamage + (bonus.coreMagicDamage ?? 0);
  const effDef = character.defense + (bonus.defense ?? 0);
  const effEva = character.evasion + (bonus.evasion ?? 0);
  const effCritRate = Math.round((PLAYER_BASE_CRIT_RATE * 100 + (bonus.critRatePct ?? 0)) * 10) / 10;
  const effCritDmg = Math.round(((PLAYER_BASE_CRIT_MULT - 1) * 100 + (bonus.critDamagePct ?? 0)) * 10) / 10;
  const effFireRes = bonus.fireResistPct ?? 0;
  const effColdRes = bonus.coldResistPct ?? 0;
  const effLightRes = bonus.lightningResistPct ?? 0;
  const effPoisonRes = bonus.poisonResistPct ?? 0;

  return (
    <div className="char-sheet">
      <div className="char-hero-hud">
        <div className="player-hud-top">
          <div className="player-avatar-col">
            <div className="player-avatar" aria-hidden>
              {character.name.slice(0, 1).toUpperCase()}
            </div>
          </div>
          <div className="player-hud-meta">
            <div className="player-hud-name">{character.name}</div>
            <div className="player-hud-sub">
              Lv.{character.level} · {character.className}
            </div>
          </div>
        </div>
        <div className="player-hud-wide-bars">
          <div className="wide-bar-row">
            <span className="wide-bar-label">HP</span>
            <div className="wide-bar-track wide-bar-hp">
              <div className="wide-bar-fill wide-bar-fill-hp" style={{ width: `${hpPct}%` }} />
              <span className="wide-bar-text">
                {character.hp}/{maxHp}
              </span>
            </div>
          </div>
          <div className="wide-bar-row">
            <span className="wide-bar-label">MP</span>
            <div className="wide-bar-track wide-bar-mana">
              <div className="wide-bar-fill wide-bar-fill-mana" style={{ width: `${manaPct}%` }} />
              <span className="wide-bar-text">
                {character.mana}/{maxMana}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="char-sheet-stats char-sheet-stats-grid">
        <div className="char-stat-line">
          <span>STR {character.str}</span>
          <button type="button" className="char-stat-plus" disabled={!canAlloc} onClick={() => add('str')}>
            +
          </button>
        </div>
        <div className="char-stat-line">
          <span>AGI {character.agi}</span>
          <button type="button" className="char-stat-plus" disabled={!canAlloc} onClick={() => add('agi')}>
            +
          </button>
        </div>
        <div className="char-stat-line">
          <span>VIT {character.vit}</span>
          <button type="button" className="char-stat-plus" disabled={!canAlloc} onClick={() => add('vit')}>
            +
          </button>
        </div>
        <div className="char-stat-line">
          <span>MAG {character.mag}</span>
          <button type="button" className="char-stat-plus" disabled={!canAlloc} onClick={() => add('mag')}>
            +
          </button>
        </div>
      </div>

      <div className="char-sheet-section">
        <div className="char-combat-grid">
          <div className="char-combat-col">
            <div className="char-combat-subtitle">Offensive</div>
            <div className="char-sheet-list">
              <div className="char-sheet-row">
                <span className="char-sheet-k">Accuracy</span>
                <span>{effAcc}</span>
              </div>
              <div className="char-sheet-row">
                <span className="char-sheet-k">Attack Speed</span>
                <span>{effAtkSpd}</span>
              </div>
              <div className="char-sheet-row">
                <span className="char-sheet-k">Move Speed</span>
                <span>{effMove}</span>
              </div>
              <div className="char-sheet-row">
                <span className="char-sheet-k">Physic dmg</span>
                <span>{effPhys}</span>
              </div>
              <div className="char-sheet-row">
                <span className="char-sheet-k">Magic dmg</span>
                <span>{effMag}</span>
              </div>
              <div className="char-sheet-row">
                <span className="char-sheet-k">Crit damage</span>
                <span>+{effCritDmg}%</span>
              </div>
              <div className="char-sheet-row">
                <span className="char-sheet-k">Crit Rate</span>
                <span>{effCritRate}%</span>
              </div>
            </div>
          </div>

          <div className="char-combat-col">
            <div className="char-combat-subtitle">Defensive</div>
            <div className="char-sheet-list">
              <div className="char-sheet-row">
                <span className="char-sheet-k">Defense</span>
                <span>{effDef}</span>
              </div>
              <div className="char-sheet-row">
                <span className="char-sheet-k">Evasion</span>
                <span>{effEva}</span>
              </div>
              <div className="char-sheet-row">
                <span className="char-sheet-k">Fire resist</span>
                <span>{effFireRes}%</span>
              </div>
              <div className="char-sheet-row">
                <span className="char-sheet-k">Cold resist</span>
                <span>{effColdRes}%</span>
              </div>
              <div className="char-sheet-row">
                <span className="char-sheet-k">Lightning resist</span>
                <span>{effLightRes}%</span>
              </div>
              <div className="char-sheet-row">
                <span className="char-sheet-k">Poison resist</span>
                <span>{effPoisonRes}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="char-sheet-row">
        <span className="char-sheet-k">EXP</span>
        <span>
          {character.exp} / {character.expToNext}
        </span>
      </div>

      <div className="char-sheet-footer char-sheet-footer-grid">
        <div className="char-sheet-footer-row">
          <span className="char-sheet-k">Stat points</span>
          <span>{character.statPoints}</span>
        </div>
        <div className="char-sheet-footer-row">
          <span className="char-sheet-k">Skill points</span>
          <span>{character.skillPoints}</span>
        </div>
      </div>
      <button type="button" className="char-sheet-reset" onClick={onResetCharacter}>
        Reset Character
      </button>
      {err && <div className="char-sheet-err">{err}</div>}
    </div>
  );
}
