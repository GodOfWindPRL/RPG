import { useGameStore } from '../systems/gameStore';

export function SkillPanel({ onCast }: { onCast: (skillId: string) => void }) {
  const skills = useGameStore((s) => s.skills);
  return (
    <div className="panel">
      <h3>Skills</h3>
      {skills.map((entry, index) => (
        <div className="row" key={entry.id}>
          <span>
            [{index + 1}] {entry.skill.name} (lv{entry.level})
            {entry.skill.damageKind ? ` · ${entry.skill.damageKind}` : ''}
            {entry.skill.element && entry.skill.element !== 'NONE' ? ` / ${entry.skill.element}` : ''}
          </span>
          <button onClick={() => onCast(entry.skill.id)}>Cast</button>
        </div>
      ))}
    </div>
  );
}
