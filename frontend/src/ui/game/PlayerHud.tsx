import { useGameStore } from '../../systems/gameStore';

export function PlayerHud() {
  const character = useGameStore((s) => s.character);
  const floatingText = useGameStore((s) => s.floatingText);
  const playerDebuffs = useGameStore((s) => s.playerDebuffs);
  const playerBuffs = useGameStore((s) => s.playerBuffs);
  if (!character) return null;

  const now = Date.now();
  const buffIcons: { k: string; label: string; emoji: string; cdSec: number; title: string }[] = [];
  if ((playerBuffs?.hasteUntil ?? 0) > now) {
    const cdMs = (playerBuffs?.hasteUntil ?? 0) - now;
    const cdSec = Math.max(0, Math.ceil(cdMs / 1000));
    const pct = playerBuffs?.hastePct ?? 0;
    buffIcons.push({
      k: 'haste',
      label: 'Haste',
      emoji: '💨',
      cdSec,
      title: `Haste\n+${pct}% Attack Speed\n+${pct}% Move Speed\n${cdSec}s remaining`,
    });
  }

  return (
    <div className="player-hud">
      <div className="player-hud-top">
        <div className="player-avatar" aria-hidden>
          {character.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="player-hud-meta">
          <div className="player-hud-name">
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
                <span className="player-hud-debuffs">
                  {icons.map((ic) => (
                    <span
                      key={ic.k}
                      title={ic.label}
                      className="player-hud-debuff"
                      style={{ color: ic.color }}
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

      {buffIcons.length ? (
        <div className="player-hud-buffs" aria-label="Active buffs">
          {buffIcons.map((b) => (
            <div key={b.k} className="player-hud-buff-wrap" title={b.title}>
              <div className="player-hud-buff" aria-label={b.label}>
                {b.emoji}
              </div>
              <div className="player-hud-buff-cd">{b.cdSec}s</div>
            </div>
          ))}
        </div>
      ) : null}

      {floatingText && <div className="player-hud-float">{floatingText}</div>}
    </div>
  );
}
