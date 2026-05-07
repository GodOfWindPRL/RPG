import { useEffect, useState } from 'react';
import { bootstrap, createCharacter, listCharacters } from '../network/api';
import { useGameStore } from '../systems/gameStore';
import type { Character } from '../core/types';

export function CharacterPanel() {
  const token = useGameStore((s) => s.token)!;
  const setCharacter = useGameStore((s) => s.setCharacter);
  const setInventory = useGameStore((s) => s.setInventory);
  const setSkills = useGameStore((s) => s.setSkills);
  const setQuests = useGameStore((s) => s.setQuests);
  const [chars, setChars] = useState<Character[]>([]);
  const [name, setName] = useState('Hero');

  async function refresh() {
    const rows = await listCharacters(token);
    setChars(rows);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function start(characterId: string) {
    const payload = await bootstrap(token, characterId);
    setCharacter(payload.character);
    setInventory(payload.character.inventoryItems);
    setSkills(payload.character.skills);
    setQuests(payload.character.quests);
  }

  return (
    <div className="char-select-screen">
      <div className="panel">
      <h2>Characters</h2>
      <div className="row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Character name" />
        <button
          onClick={async () => {
            await createCharacter(token, name, 'Warrior');
            await refresh();
          }}
        >
          Create
        </button>
      </div>
      {chars.map((char) => (
        <div className="row" key={char.id}>
          <span>{char.name} Lv.{char.level}</span>
          <button onClick={() => start(char.id)}>Play</button>
        </div>
      ))}
      </div>
    </div>
  );
}
