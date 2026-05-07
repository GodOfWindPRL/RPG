import { useGameStore } from '../systems/gameStore';

export function QuestPanel() {
  const quests = useGameStore((s) => s.quests);
  return (
    <div className="panel">
      <h3>Quests</h3>
      {quests.map((entry) => (
        <div key={entry.id}>
          {entry.quest.title}: {entry.progressValue}/{entry.quest.targetValue} {entry.completed ? '(done)' : ''}
        </div>
      ))}
    </div>
  );
}
