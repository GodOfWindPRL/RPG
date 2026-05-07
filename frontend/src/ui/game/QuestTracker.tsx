import { useGameStore } from '../../systems/gameStore';

export function QuestTracker() {
  const quests = useGameStore((s) => s.quests);
  const active = quests.filter((q) => !q.completed);
  if (active.length === 0) {
    return (
      <div className="quest-tracker">
        <div className="quest-tracker-title">Quests</div>
        <div className="quest-tracker-empty">No active quests</div>
      </div>
    );
  }

  return (
    <div className="quest-tracker">
      <div className="quest-tracker-title">Quests</div>
      {active.map((entry) => (
        <div key={entry.id} className="quest-tracker-line">
          <span className="quest-tracker-name">{entry.quest.title}</span>
          <span className="quest-tracker-prog">
            {entry.progressValue}/{entry.quest.targetValue}
          </span>
        </div>
      ))}
    </div>
  );
}
