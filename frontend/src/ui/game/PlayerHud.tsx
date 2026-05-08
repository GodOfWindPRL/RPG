import { useGameStore } from '../../systems/gameStore';

export function PlayerHud() {
  const character = useGameStore((s) => s.character);
  const floatingText = useGameStore((s) => s.floatingText);
  const playerDebuffs = useGameStore((s) => s.playerDebuffs);
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
          <div className="player-hud-name" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{character.name}</span>
            {(() => {
              const d = playerDebuffs;
              if (!d) return null;
              const now = Date.now();
              const icons: { k: string; label: string; color: string }[] = [];
              if ((d.burnUntil ?? 0) > now) icons.push({ k: 'burn', label: 'Burn', color: '#ef4444' });
              if ((d.slowUntil ?? 0) > now) icons.push({ k: 'slow', label: 'Slow', color: '#60a5fa' });
              if ((d.poisonUntil ?? 0) > now) icons.push({ k: 'poison', label: 'Poison', color: '#34d399' });
              if ((d.shockUntil ?? 0) > now) icons.push({ k: 'shock', label: 'Shock', color: '#facc15' });
              if (icons.length === 0) return null;
              return (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {icons.map((ic) => (
                    <span
                      key={ic.k}
                      title={ic.label}
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 4,
                        border: '1px solid rgba(248,113,113,0.9)', // debuff = red border
                        background: 'rgba(2,6,23,0.35)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 0 10px rgba(0,0,0,0.6)',
                        color: ic.color,
                        fontSize: 11,
                        lineHeight: 1,
                      }}
                    >
                      {ic.k === 'burn' ? '🔥' : ic.k === 'slow' ? '❄️' : ic.k === 'poison' ? '☠️' : '⚡'}
                    </span>
                  ))}
                </span>
              );
            })()}
          </div>
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
