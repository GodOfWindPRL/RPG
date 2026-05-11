import { useMemo, useState } from 'react';
import { useGameStore } from '../systems/gameStore';
import { upgradeSkill } from '../network/api';
import { displaySkillManaCost } from '../core/skillScaling';
import {
  SKILL_DESCRIPTION_VI,
  SKILL_DISPLAY_NAME,
  SKILL_SYNERGY_GRANTS_OTHERS,
  skillTypeLabel,
  spellOptsLabel,
} from './skillPanelMeta';

const SKILL_ORDER = ['slash', 'firebolt', 'meteor', 'blizzard', 'chaosorb'] as const;

const SKILL_ICONS: Record<string, string> = {
  slash: '⚔️',
  firebolt: '🔥',
  meteor: '☄️',
  blizzard: '❄️',
  chaosorb: '☣️',
};

function slashDamagePct(level: number) {
  const lv = Math.max(1, Math.min(20, Math.floor(level || 1)));
  return 100 + (lv - 1) * 5;
}

type StatRow = { k: string; v: string };

function effectiveDamageKind(skillId: string, dk: string | undefined): string | undefined {
  if (dk === 'SPELL' || dk === 'MAGIC' || dk === 'PHYSIC') return dk;
  if (skillId === 'firebolt' || skillId === 'meteor' || skillId === 'blizzard' || skillId === 'chaosorb') return 'SPELL';
  return 'PHYSIC';
}

function defaultManaDb(skillId: string): number {
  const m: Record<string, number> = { firebolt: 12, blizzard: 30, chaosorb: 14, meteor: 46, slash: 0 };
  return m[skillId] ?? 0;
}

/** Thống kê (không gồm loại — loại hiển thị dưới tên). */
function buildStatRows(
  skillId: string,
  level: number,
  dk: string | undefined,
  manaDb: number,
  cdMs: number,
): StatRow[] {
  const effDk = effectiveDamageKind(skillId, dk);
  const cdStr = level > 0 ? `${Math.round(cdMs / 100) / 10}s` : '—';
  const mana =
    level > 0 ? String(displaySkillManaCost(skillId, level, effDk, manaDb)) : '—';
  const isSlash = skillId === 'slash';
  const dmgPct =
    isSlash && level > 0 ? `${slashDamagePct(level)}%` : level > 0 ? '100%' : '—';
  const atkSpd = level > 0 ? '100%' : '—';
  return [
    { k: 'Mana', v: mana },
    { k: 'Cooldown', v: cdStr },
    { k: 'Tốc đánh', v: atkSpd },
    { k: 'Sát thương đòn', v: dmgPct },
  ];
}

function SynergyGrantsSection({ skillId }: { skillId: string }) {
  const lines = SKILL_SYNERGY_GRANTS_OTHERS[skillId];
  if (!lines?.length) return null;
  return (
    <section className="border-t border-stone-700/60 pt-2">
      <div className="skill-hover-synergy-head mb-1.5">Bonus cho các kỹ năng khác</div>
      <ul className="list-none space-y-2 pl-0">
        {lines.map((parts, i) => (
          <li key={i} className="skill-hover-stat text-stone-200">
            {parts.map((p, j) =>
              p.highlight ? (
                <span key={j} className="font-semibold text-emerald-300">
                  {p.text}
                </span>
              ) : (
                <span key={j}>{p.text}</span>
              ),
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SkillPanel() {
  const skills = useGameStore((s) => s.skills);
  const token = useGameStore((s) => s.token);
  const character = useGameStore((s) => s.character);
  const patchCharacter = useGameStore((s) => s.patchCharacter);
  const setSkills = useGameStore((s) => s.setSkills);
  const [err, setErr] = useState<string | null>(null);
  const [activeSkillId, setActiveSkillId] = useState<string | null>(null);

  const skillPoints = character?.skillPoints ?? 0;
  const byId = useMemo(() => new Map(skills.map((s) => [s.skill.id, s])), [skills]);

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

  const row = activeSkillId ? byId.get(activeSkillId) : undefined;
  const level = row?.level ?? 0;
  const dk = row?.skill.damageKind;
  const manaDb = row?.skill.manaCost ?? (activeSkillId ? defaultManaDb(activeSkillId) : 0);
  const cd = row?.skill.cooldownMs ?? 0;
  const name =
    row?.skill.name ?? (activeSkillId ? (SKILL_DISPLAY_NAME[activeSkillId] ?? activeSkillId) : '') ?? '';
  const effKind = activeSkillId ? effectiveDamageKind(activeSkillId, dk) : undefined;
  const typeLine = activeSkillId ? skillTypeLabel(activeSkillId, effKind) : '';
  const longDesc = activeSkillId ? (SKILL_DESCRIPTION_VI[activeSkillId] ?? '') : '';

  const currentRows =
    activeSkillId && level > 0 ? buildStatRows(activeSkillId, level, dk, manaDb, cd) : null;
  const nextRows =
    activeSkillId && level > 0 && level < 20
      ? buildStatRows(activeSkillId, level + 1, dk, manaDb, cd)
      : null;

  const isSpell =
    activeSkillId &&
    (['firebolt', 'meteor', 'blizzard', 'chaosorb'].includes(activeSkillId) ||
      dk === 'SPELL' ||
      dk === 'MAGIC');
  const ownSpellOpts = isSpell && level > 0 && activeSkillId ? spellOptsLabel(activeSkillId, level) : null;

  return (
    <div className="space-y-3" onMouseLeave={() => setActiveSkillId(null)}>
      {err && <div className="text-sm text-rose-300">{err}</div>}
      <div className="flex justify-end text-xs text-slate-400">Điểm skill: {skillPoints}</div>

      <div className="flex flex-wrap gap-2">
        {SKILL_ORDER.map((skillId) => {
          const srow = byId.get(skillId);
          const lv = srow?.level ?? 0;
          const canUpgrade = Boolean(character && token && skillPoints > 0 && lv < 20);
          const isActive = activeSkillId === skillId;

          return (
            <div
              key={skillId}
              className="relative h-14 w-14 shrink-0"
              onMouseEnter={() => setActiveSkillId(skillId)}
              onFocus={() => setActiveSkillId(skillId)}
            >
              <div
                className={`flex h-full w-full items-center justify-center rounded-md border text-2xl leading-none outline-none transition ring-offset-2 ring-offset-slate-950 ${
                  isActive ? 'ring-2 ring-emerald-500/70' : ''
                } ${
                  lv > 0
                    ? 'border-stone-600 bg-linear-to-b from-stone-900/95 to-stone-950/95 text-stone-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                    : 'border-stone-800/80 bg-stone-950/70 text-stone-600'
                }`}
                tabIndex={0}
              >
                {SKILL_ICONS[skillId] ?? '❔'}
              </div>
              {lv > 0 && (
                <span className="pointer-events-none absolute bottom-0.5 right-1 text-[10px] font-semibold text-stone-300 drop-shadow">
                  {lv}
                </span>
              )}
              <button
                type="button"
                tabIndex={-1}
                className="absolute right-0 top-0 z-10 rounded-bl rounded-tr border border-emerald-900/70 bg-emerald-950/95 px-[4px] py-px text-[9px] font-bold leading-none text-emerald-300 hover:bg-emerald-900/90 disabled:cursor-not-allowed disabled:opacity-25"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  void onUpgrade(skillId);
                }}
                disabled={!canUpgrade}
                title={lv >= 20 ? 'Tối đa' : 'Tăng cấp'}
              >
                +
              </button>
            </div>
          );
        })}
      </div>

      <div
        className={`skill-hover-panel min-h-56 rounded-sm px-4 py-3 transition-opacity ${
          activeSkillId ? 'opacity-100' : 'opacity-45'
        }`}
        aria-live="polite"
      >
        {activeSkillId ? (
          <div className="flex flex-col gap-3">
            <header>
              <h3 className="skill-hover-title text-base font-bold">{name}</h3>
              <p className="mt-1 text-[11px] uppercase tracking-[0.1em] text-stone-300">
                Loại: <span className="text-stone-100">{typeLine}</span>
              </p>
            </header>

            {level <= 0 ? (
              <p className="skill-hover-stat text-amber-200/90">Chưa học — dùng nút + trên ô để đầu tư điểm skill.</p>
            ) : null}

            {level > 0 && currentRows ? (
              <section>
                <div className="skill-hover-section mb-1.5">Cấp kỹ năng hiện tại: {level}</div>
                <div className="space-y-0.5 border-l-2 border-stone-600/80 pl-2.5">
                  {currentRows.map(({ k, v }) => (
                    <div key={k} className="skill-hover-stat uppercase">
                      <span className="text-stone-500">{k}: </span>
                      {v}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {activeSkillId && level === 0 ? (
              <section>
                <div className="skill-hover-section mb-1.5">Khi học cấp 1</div>
                <div className="space-y-0.5 border-l-2 border-stone-600/80 pl-2.5">
                  {buildStatRows(activeSkillId, 1, dk, manaDb, cd).map(({ k, v }) => (
                    <div key={`p-${k}`} className="skill-hover-stat uppercase">
                      <span className="text-stone-500">{k}: </span>
                      {v}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {level > 0 && level < 20 && nextRows ? (
              <section>
                <div className="skill-hover-section mb-1.5">Cấp tiếp theo: {level + 1}</div>
                <div className="space-y-0.5 border-l-2 border-emerald-900/40 pl-2.5">
                  {nextRows.map(({ k, v }) => (
                    <div key={`n-${k}`} className="skill-hover-stat uppercase">
                      <span className="text-stone-500">{k}: </span>
                      {v}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {level >= 20 ? (
              <p className="skill-hover-stat text-stone-500 uppercase tracking-wide">Đã đạt cấp tối đa (20)</p>
            ) : null}

            {longDesc ? (
              <section className="border-t border-stone-700/60 pt-2">
                <div className="skill-hover-section mb-1">Mô tả</div>
                <p className="text-[11px] leading-relaxed text-stone-300">{longDesc}</p>
              </section>
            ) : null}

            {ownSpellOpts ? (
              <div className="border-t border-stone-700/60 pt-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-400">
                {ownSpellOpts}
              </div>
            ) : null}

            {activeSkillId ? <SynergyGrantsSection skillId={activeSkillId} /> : null}
          </div>
        ) : (
          <div className="flex min-h-56 items-center justify-center px-2 text-center text-sm text-stone-500">
            Di chuột lên ô skill để xem thông số.
          </div>
        )}
      </div>
    </div>
  );
}
