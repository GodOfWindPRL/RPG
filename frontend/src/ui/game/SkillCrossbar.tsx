import { useGameStore } from '../../systems/gameStore';

/** Visual slot order (left, top, right, bottom, center) → index trong `skills[]`. Phím 1–5 = skill 0–4. */
const SLOT_TO_SKILL_INDEX = [0, 1, 2, 3, 4] as const;

const SLOT_CLASS = ['slot-left', 'slot-top', 'slot-right', 'slot-bottom', 'slot-center'] as const;

export function SkillCrossbar({ onCastSkillIndex }: { onCastSkillIndex: (skillIndex: number) => void }) {
  const skills = useGameStore((s) => s.skills);

  return (
    <div className="skill-cross" aria-label="Skills">
      {SLOT_TO_SKILL_INDEX.map((skillIndex, slot) => {
        const entry = skills[skillIndex];
        const label = String(slot < 4 ? slot + 1 : 5);
        return (
          <button
            key={slot}
            type="button"
            className={`skill-slot ${SLOT_CLASS[slot]} ${entry ? '' : 'skill-slot-empty'}`}
            onPointerDown={(ev) => ev.stopPropagation()}
            onClick={(ev) => {
              ev.stopPropagation();
              if (entry) onCastSkillIndex(skillIndex);
            }}
            disabled={!entry}
            title={entry ? `${entry.skill.name} (${label})` : `Empty (${label})`}
          >
            <span className="skill-slot-key">{label}</span>
            {entry ? (
              <>
                <span className="skill-slot-name">{entry.skill.name}</span>
                <span className="skill-slot-meta">Lv{entry.level}</span>
              </>
            ) : (
              <span className="skill-slot-lock">—</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
