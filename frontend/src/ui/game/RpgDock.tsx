export type DockPanel = 'quests' | 'inventory' | 'character' | 'skills';

export function RpgDock({ onOpen }: { onOpen: (panel: DockPanel) => void }) {
  return (
    <nav className="rpg-dock" aria-label="Menu">
      <button
        type="button"
        tabIndex={-1}
        className="rpg-dock-btn"
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => onOpen('quests')}
        title="Quests"
      >
        <span className="rpg-dock-icon">📜</span>
        <span className="rpg-dock-label">Quest</span>
      </button>
      <button
        type="button"
        tabIndex={-1}
        className="rpg-dock-btn"
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => onOpen('character')}
        title="Character"
      >
        <span className="rpg-dock-icon">👤</span>
        <span className="rpg-dock-label">Hero</span>
      </button>
      <button
        type="button"
        tabIndex={-1}
        className="rpg-dock-btn"
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => onOpen('inventory')}
        title="Inventory"
      >
        <span className="rpg-dock-icon">🎒</span>
        <span className="rpg-dock-label">Bag</span>
      </button>
      <button
        type="button"
        tabIndex={-1}
        className="rpg-dock-btn"
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => onOpen('skills')}
        title="Skills"
      >
        <span className="rpg-dock-icon">⚔</span>
        <span className="rpg-dock-label">Skills</span>
      </button>
    </nav>
  );
}
