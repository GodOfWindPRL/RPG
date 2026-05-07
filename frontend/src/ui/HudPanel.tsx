import { useGameStore } from '../systems/gameStore';

export function HudPanel() {
  const character = useGameStore((s) => s.character);
  const aliveEnemies = useGameStore((s) => s.enemies.filter((enemy) => enemy.hp > 0).length);
  const floatingText = useGameStore((s) => s.floatingText);
  if (!character) return null;
  return (
    <div className="hud">
      <div>HP: {character.hp}</div>
      <div>Mana: {character.mana}</div>
      <div>Enemies: {aliveEnemies}</div>
      {floatingText && <div className="damage">{floatingText}</div>}
    </div>
  );
}
