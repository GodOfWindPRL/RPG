import { useMemo, useState } from 'react';
import { useGameStore } from '../systems/gameStore';
import { upgradeSkill } from '../network/api';
import { displaySkillManaCost, isSpellDamageKind, spellSkillFlatElementBonus } from '../core/skillScaling';

export function SkillPanel({ onCast }: { onCast: (skillId: string) => void }) {
  const skills = useGameStore((s) => s.skills);
  const token = useGameStore((s) => s.token);
  const character = useGameStore((s) => s.character);
  const patchCharacter = useGameStore((s) => s.patchCharacter);
  const setSkills = useGameStore((s) => s.setSkills);
  const [err, setErr] = useState<string | null>(null);

  const skillPoints = character?.skillPoints ?? 0;

  const byId = useMemo(() => new Map(skills.map((s) => [s.skill.id, s])), [skills]);

  const physicNodes = useMemo(() => {
    const slash = byId.get('slash');
    return [
      {
        id: 'slash',
        kind: 'physic' as const,
        icon: '⚔️',
        name: slash?.skill.name ?? 'Slash',
        level: slash?.level ?? 0,
        mana: slash?.skill.manaCost ?? 0,
        cooldownMs: slash?.skill.cooldownMs ?? 0,
        damageKind: slash?.skill.damageKind ?? 'PHYSIC',
      },
    ];
  }, [byId]);

  const spellGroups = useMemo(
    () => [
      {
        label: 'Fire Spell',
        skills: [
          {
            id: 'firebolt',
            icon: '🔥',
            name: byId.get('firebolt')?.skill.name ?? 'Firebolt',
            level: byId.get('firebolt')?.level ?? 0,
            mana: byId.get('firebolt')?.skill.manaCost ?? 0,
            cooldownMs: byId.get('firebolt')?.skill.cooldownMs ?? 0,
            damageKind: byId.get('firebolt')?.skill.damageKind,
          },
        ],
      },
      {
        label: 'Cold Spell',
        skills: [
          {
            id: 'blizzard',
            icon: '❄️',
            name: byId.get('blizzard')?.skill.name ?? 'Blizzard',
            level: byId.get('blizzard')?.level ?? 0,
            mana: byId.get('blizzard')?.skill.manaCost ?? 0,
            cooldownMs: byId.get('blizzard')?.skill.cooldownMs ?? 0,
            damageKind: byId.get('blizzard')?.skill.damageKind,
          },
        ],
      },
      {
        label: 'Lightning Spell',
        skills: [] as {
          id: string;
          icon: string;
          name: string;
          level: number;
          mana: number;
          cooldownMs: number;
          damageKind?: string;
        }[],
      },
      {
        label: 'Poison Spell',
        skills: [
          {
            id: 'chaosorb',
            icon: '☣️',
            name: byId.get('chaosorb')?.skill.name ?? 'Chaos Orb',
            level: byId.get('chaosorb')?.level ?? 0,
            mana: byId.get('chaosorb')?.skill.manaCost ?? 0,
            cooldownMs: byId.get('chaosorb')?.skill.cooldownMs ?? 0,
            damageKind: byId.get('chaosorb')?.skill.damageKind,
          },
        ],
      },
    ],
    [byId],
  );

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

  function renderSkillCard(n: {
    id: string;
    icon: string;
    name: string;
    level: number;
    mana: number;
    cooldownMs: number;
    damageKind?: string;
    kind?: 'physic';
  }) {
    const canUpgrade = Boolean(character && token && skillPoints > 0 && n.level < 20);
    const isSlash = n.id === 'slash';
    const dmgPct = isSlash && n.level > 0 ? slashDamagePct(n.level) : 100;
    const atkSpdPct = isSlash ? 100 : 100;
    const showMana =
      n.level > 0
        ? displaySkillManaCost(n.id, n.level, n.damageKind, n.mana)
        : n.mana;
    const spellExtra =
      n.level > 0 && isSpellDamageKind(n.damageKind)
        ? ` · +${spellSkillFlatElementBonus(n.id, n.level)} ${n.id === 'firebolt' ? 'fire' : n.id === 'blizzard' ? 'cold' : 'poison'}`
        : '';

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
          <div>Mana: {showMana}</div>
          <div>Cooldown: {Math.round((n.cooldownMs ?? 0) / 100) / 10}s</div>
          <div>Attack speed: {atkSpdPct}%</div>
          <div>Attack damage: {dmgPct}%</div>
          {isSpellDamageKind(n.damageKind) && n.level > 0 && (
            <div className="col-span-2 text-[11px] leading-snug text-slate-400">
              Spell: magic + matching element only; always hits (no evasion). MP scales per level.
              {spellExtra}
            </div>
          )}
          {n.kind === 'physic' && (
            <div className="col-span-2 text-[11px] leading-snug text-slate-400">
              Physic: uses weapon physical + all elemental damage; accuracy vs evasion applies.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="mb-2 flex items-center justify-between">
        <h3>Skill Tree</h3>
        <div className="text-sm text-slate-200">Skill points: {skillPoints}</div>
      </div>
      {err && <div className="mb-2 text-sm text-rose-300">{err}</div>}

      <div className="rounded-xl border border-slate-700/60 bg-slate-950/40 p-3 space-y-4">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-200/90">Physic</div>
          <div className="grid grid-cols-2 gap-3">{physicNodes.map((n) => renderSkillCard({ ...n, kind: 'physic' }))}</div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-sky-200/90">Spell</div>
          <div className="space-y-3">
            {spellGroups.map((g) => (
              <div key={g.label}>
                <div className="mb-1.5 text-[11px] font-medium text-slate-400">{g.label}</div>
                {g.skills.length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-700/80 bg-slate-950/30 px-2 py-2 text-xs text-slate-500">
                    (Trống — sẽ bổ sung skill)
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">{g.skills.map((s) => renderSkillCard(s))}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
