import { useState } from 'react';
import { allocateStat, resetCharacter } from '../../network/api';
import { useGameStore } from '../../systems/gameStore';
import { emptyEquipmentLayout } from '../../systems/gameStore';
import { PLAYER_MAX_MOVE_SPEED } from '../../core/world';
import { PLAYER_BASE_CRIT_MULT, PLAYER_BASE_CRIT_RATE } from '../../core/combatConstants';

export function CharacterSheet() {
  const character = useGameStore((s) => s.character);
  const token = useGameStore((s) => s.token);
  const patchCharacter = useGameStore((s) => s.patchCharacter);
  const setSkills = useGameStore((s) => s.setSkills);
  const setInventory = useGameStore((s) => s.setInventory);
  const setEquipmentLayout = useGameStore((s) => s.setEquipmentLayout);
  const buffs = useGameStore((s) => s.playerBuffs);
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

  const now = Date.now();
  const hastePct = buffs && (buffs.hasteUntil ?? 0) > now ? (buffs.hastePct ?? 0) : 0;

  // All stats below are AUTHORITATIVE values computed by the backend in
  // `withComputedStats`. The client never re-derives these from items.
  const effAcc = character.accuracy;
  const effAtkSpd = Math.round(character.attackSpeed * (1 + hastePct / 100));
  const effMove =
    Math.round((PLAYER_MAX_MOVE_SPEED + (character.moveSpeedFlat ?? 0)) * (1 + hastePct / 100) * 100) /
    100;
  const effPhys = character.corePhysDamage;
  const effMag = character.coreMagicDamage;
  const effDef = character.defense;
  const effEva = character.evasion;
  const effCritRate = Math.round((PLAYER_BASE_CRIT_RATE * 100 + (character.critRatePct ?? 0)) * 10) / 10;
  const effCritDmg = Math.round(((PLAYER_BASE_CRIT_MULT - 1) * 100 + (character.critDamagePct ?? 0)) * 10) / 10;
  const effFireRes = character.fireResistPct ?? 0;
  const effColdRes = character.coldResistPct ?? 0;
  const effLightRes = character.lightningResistPct ?? 0;
  const effPoisonRes = character.poisonResistPct ?? 0;
  const effLuckPct = Math.min(100, Math.round((character.luckPct ?? 0) * 10) / 10);
  const hpRegenFlat = Math.max(0, character.hpRegen ?? 0);
  const hpRegenPctRaw = Math.max(0, character.hpRegenPct ?? 0);
  const mpRegenFlat = Math.max(0, character.manaRegen ?? 0);
  const mpRegenPctRaw = Math.max(0, character.manaRegenPct ?? 0);
  // Effective per-second value (matches backend regen tick exactly).
  const hpPerSec = Math.round((hpRegenFlat + (maxHp * hpRegenPctRaw) / 100) * 10) / 10;
  const mpPerSec = Math.round((mpRegenFlat + (maxMana * mpRegenPctRaw) / 100) * 10) / 10;
  const fireDmg = character.fireDamage ?? 0;
  const coldDmg = character.coldDamage ?? 0;
  const lightDmg = character.lightningDamage ?? 0;
  const poisonDmg = character.poisonDamage ?? 0;
  const firePct = character.fireDamagePct ?? 0;
  const coldPct = character.coldDamagePct ?? 0;
  const lightPct = character.lightningDamagePct ?? 0;
  const poisonPct = character.poisonDamagePct ?? 0;

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
          <button
            type="button"
            tabIndex={-1}
            className="char-stat-plus"
            disabled={!canAlloc}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => add('str')}
          >
            +
          </button>
        </div>
        <div className="char-stat-line">
          <span>AGI {character.agi}</span>
          <button
            type="button"
            tabIndex={-1}
            className="char-stat-plus"
            disabled={!canAlloc}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => add('agi')}
          >
            +
          </button>
        </div>
        <div className="char-stat-line">
          <span>VIT {character.vit}</span>
          <button
            type="button"
            tabIndex={-1}
            className="char-stat-plus"
            disabled={!canAlloc}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => add('vit')}
          >
            +
          </button>
        </div>
        <div className="char-stat-line">
          <span>MAG {character.mag}</span>
          <button
            type="button"
            tabIndex={-1}
            className="char-stat-plus"
            disabled={!canAlloc}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => add('mag')}
          >
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
              <div className="char-sheet-row">
                <span className="char-sheet-k">Fire dmg</span>
                <span>
                  {fireDmg}
                  {firePct ? ` (+${Math.round(firePct * 10) / 10}%)` : ''}
                </span>
              </div>
              <div className="char-sheet-row">
                <span className="char-sheet-k">Cold dmg</span>
                <span>
                  {coldDmg}
                  {coldPct ? ` (+${Math.round(coldPct * 10) / 10}%)` : ''}
                </span>
              </div>
              <div className="char-sheet-row">
                <span className="char-sheet-k">Lightning dmg</span>
                <span>
                  {lightDmg}
                  {lightPct ? ` (+${Math.round(lightPct * 10) / 10}%)` : ''}
                </span>
              </div>
              <div className="char-sheet-row">
                <span className="char-sheet-k">Poison dmg</span>
                <span>
                  {poisonDmg}
                  {poisonPct ? ` (+${Math.round(poisonPct * 10) / 10}%)` : ''}
                </span>
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
              <div className="char-sheet-row">
                <span className="char-sheet-k">HP Regen</span>
                <span>
                  {hpPerSec}/s
                  {hpRegenFlat || hpRegenPctRaw
                    ? ` (${hpRegenFlat ? `+${Math.round(hpRegenFlat)}` : ''}${
                        hpRegenFlat && hpRegenPctRaw ? ' ' : ''
                      }${hpRegenPctRaw ? `+${Math.round(hpRegenPctRaw * 10) / 10}%` : ''})`
                    : ''}
                </span>
              </div>
              <div className="char-sheet-row">
                <span className="char-sheet-k">MP Regen</span>
                <span>
                  {mpPerSec}/s
                  {mpRegenFlat || mpRegenPctRaw
                    ? ` (${mpRegenFlat ? `+${Math.round(mpRegenFlat)}` : ''}${
                        mpRegenFlat && mpRegenPctRaw ? ' ' : ''
                      }${mpRegenPctRaw ? `+${Math.round(mpRegenPctRaw * 10) / 10}%` : ''})`
                    : ''}
                </span>
              </div>
              <div className="char-sheet-row">
                <span className="char-sheet-k">Luck</span>
                <span>{effLuckPct}%</span>
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
      <button
        type="button"
        tabIndex={-1}
        className="char-sheet-reset"
        onPointerDown={(e) => e.preventDefault()}
        onClick={onResetCharacter}
      >
        Reset Character
      </button>
      {err && <div className="char-sheet-err">{err}</div>}
    </div>
  );
}
