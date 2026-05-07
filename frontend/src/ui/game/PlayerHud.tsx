import { useGameStore } from '../../systems/gameStore';

export function PlayerHud() {
  const character = useGameStore((s) => s.character);
  const floatingText = useGameStore((s) => s.floatingText);
  if (!character) return null;

  const maxHp = Math.max(1, character.maxHp);
  const maxMana = Math.max(1, character.maxMana);
  const expCap = Math.max(1, character.expToNext);
  const hpPct = Math.min(100, (character.hp / maxHp) * 100);
  const manaPct = Math.min(100, (character.mana / maxMana) * 100);
  const expPct = Math.min(100, (character.exp / expCap) * 100);

  return (
    <div className="player-hud">
      <div className="player-hud-top">
        <div className="player-avatar-col">
          <div className="player-avatar" aria-hidden>
            {character.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="player-exp-wrap">
            <div className="player-exp-track" title="Experience">
              <div className="player-exp-fill" style={{ width: `${expPct}%` }} />
            </div>
            <div className="player-exp-num">
              {character.exp} / {character.expToNext}
            </div>
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

      {floatingText && <div className="player-hud-float">{floatingText}</div>}
    </div>
  );
}
