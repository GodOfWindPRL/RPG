export interface AuthUser {
  id: string;
  email: string;
}

export interface Character {
  id: string;
  name: string;
  className: string;
  level: number;
  exp: number;
  skillPoints: number;
  statPoints: number;
  str: number;
  agi: number;
  vit: number;
  mag: number;
  hp: number;
  mana: number;
  maxHp: number;
  maxMana: number;
  expToNext: number;
  defense: number;
  evasion: number;
  accuracy: number;
  attackSpeed: number;
  corePhysDamage: number;
  coreMagicDamage: number;
  posX: number;
  posY: number;
  posZ: number;
}

export interface InventoryItem {
  id: string;
  level: number;
  rarity: string;
  affixJson?: string;
  equipped?: boolean;
  definition: { name: string; slot: string };
}

export interface CharacterSkill {
  id: string;
  level: number;
  skill: {
    id: string;
    name: string;
    manaCost: number;
    damageKind?: string;
    element?: string;
  };
}

export interface CharacterQuest {
  id: string;
  progressValue: number;
  completed: boolean;
  quest: { title: string; targetValue: number };
}

export interface Enemy {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  x: number;
  z: number;
  yaw?: number;
  anim?: 'idle' | 'walk' | 'attack' | 'death';
  animSeq?: number;
  diedAt?: number;
  defense?: number;
  evasion?: number;
  physicAttack?: number;
  fireResist?: number;
  coldResist?: number;
}
