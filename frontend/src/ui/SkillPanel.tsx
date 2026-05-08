import { useMemo, useState } from 'react';
import { useGameStore } from '../systems/gameStore';
import { upgradeSkill } from '../network/api';

export function SkillPanel({ onCast }: { onCast: (skillId: string) => void }) {
  const skills = useGameStore((s) => s.skills);
  const token = useGameStore((s) => s.token);
  const character = useGameStore((s) => s.character);
  const patchCharacter = useGameStore((s) => s.patchCharacter);
  const setSkills = useGameStore((s) => s.setSkills);
  const [err, setErr] = useState<string | null>(null);

  const skillPoints = character?.skillPoints ?? 0;

  const byId = useMemo(() => new Map(skills.map((s) => [s.skill.id, s])), [skills]);
  const nodes = useMemo(() => {
    const slash = byId.get('slash');
    const fire = byId.get('firebolt');
    const blizz = byId.get('blizzard');
    return [
      {
        id: 'slash',
        icon: '⚔️',
        name: slash?.skill.name ?? 'Slash',
        level: slash?.level ?? 0,
        mana: slash?.skill.manaCost ?? 0,
        cooldownMs: slash?.skill.cooldownMs ?? 0,
      },
      {
        id: 'firebolt',
        icon: '🔥',
        name: fire?.skill.name ?? 'Firebolt',
        level: fire?.level ?? 0,
        mana: fire?.skill.manaCost ?? 0,
        cooldownMs: fire?.skill.cooldownMs ?? 0,
      },
      {
        id: 'blizzard',
        icon: '❄️',
        name: blizz?.skill.name ?? 'Blizzard',
        level: blizz?.level ?? 0,
        mana: blizz?.skill.manaCost ?? 0,
        cooldownMs: blizz?.skill.cooldownMs ?? 0,
      },
    ];
  }, [byId]);

  function slashDamagePct(level: number) {
    const lv = Math.max(1, Math.min(20, Math.floor(level || 1)));
    return 100 + (lv - 1) * 5;
  }

  async function onUpgrade(skillId: string) {
    setErr(null);
    if (!token || !character) return;
    try {
      const payload = await upgradeSkill(token, character.id, skillId);
      if (payload.character) patchCharacter(payload.character);
      setSkills(payload.skills ?? []);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  return (
    <div className="panel">
      <div className="mb-2 flex items-center justify-between">
        <h3>Skill Tree</h3>
        <div className="text-sm text-slate-200">Skill points: {skillPoints}</div>
      </div>
      {err && <div className="mb-2 text-sm text-rose-300">{err}</div>}

      <div className="rounded-xl border border-slate-700/60 bg-slate-950/40 p-3">
        <div className="grid grid-cols-2 gap-3">
          {nodes.map((n) => {
            const canUpgrade = Boolean(character && token && skillPoints > 0 && n.level < 20);
            const dmgPct = n.id === 'slash' && n.level > 0 ? slashDamagePct(n.level) : 100;
            const atkSpdPct = n.id === 'slash' ? 100 : 100;
            return (
              <div key={n.id} className="rounded-lg border border-slate-700/60 bg-slate-950/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="text-xl">{n.icon}</div>
                    <div>
                      <div className="text-sm font-bold text-slate-100">{n.name}</div>
                      <div className="text-xs text-slate-400">Lv {n.level}/20</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      tabIndex={-1}
                      className="rounded-md border border-slate-600 bg-slate-900/80 px-2 py-1 text-xs font-semibold text-slate-100 hover:bg-slate-800"
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => onCast(n.id)}
                      disabled={n.level <= 0}
                      title={n.level > 0 ? 'Cast' : 'Locked'}
                    >
                      Cast
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      className="rounded-md border border-emerald-700/70 bg-emerald-950/40 px-2 py-1 text-xs font-semibold text-emerald-200 hover:bg-emerald-900/40 disabled:opacity-40"
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => onUpgrade(n.id)}
                      disabled={!canUpgrade}
                      title={n.level >= 20 ? 'Max level' : 'Upgrade'}
                    >
                      +Lv
                    </button>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-200">
                  <div>Mana: {n.mana}</div>
                  <div>Cooldown: {Math.round((n.cooldownMs ?? 0) / 100) / 10}s</div>
                  <div>Attack speed: {atkSpdPct}%</div>
                  <div>Attack damage: {dmgPct}%</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
