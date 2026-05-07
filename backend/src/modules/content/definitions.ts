import { ItemRarity, QuestType, SkillDamageKind, SkillElement } from '@prisma/client';

export const skillDefinitions = [
  {
    id: 'slash',
    name: 'Slash',
    description: 'A fast melee strike (physical).',
    requiredLevel: 1,
    requiredSkill: null,
    baseDamage: 40,
    manaCost: 5,
    cooldownMs: 1200,
    damageKind: SkillDamageKind.PHYSIC,
    element: SkillElement.NONE,
  },
  {
    id: 'firebolt',
    name: 'Firebolt',
    description: 'Fire magic using base magic damage.',
    requiredLevel: 2,
    requiredSkill: null,
    baseDamage: 60,
    manaCost: 12,
    cooldownMs: 2600,
    damageKind: SkillDamageKind.MAGIC,
    element: SkillElement.FIRE,
  },
];

export const itemDefinitions = [
  { id: 'rusty_sword', name: 'Rusty Sword', slot: 'weapon', basePower: 8, minLevel: 1, maxLevel: 4, rarity: ItemRarity.WHITE, icon: 'sword' },
  { id: 'wolf_blade', name: 'Wolf Blade', slot: 'weapon', basePower: 14, minLevel: 3, maxLevel: 8, rarity: ItemRarity.BLUE, icon: 'sword' },
  { id: 'hunter_mail', name: 'Hunter Mail', slot: 'armor', basePower: 10, minLevel: 2, maxLevel: 7, rarity: ItemRarity.GREEN, icon: 'armor' },
  { id: 'storm_charm', name: 'Storm Charm', slot: 'amulet', basePower: 18, minLevel: 5, maxLevel: 10, rarity: ItemRarity.YELLOW, icon: 'amulet' },
  { id: 'mythic_set_core', name: 'Mythic Set Core', slot: 'relic', basePower: 30, minLevel: 8, maxLevel: 10, rarity: ItemRarity.MYTHIC, icon: 'relic' },
];

export const questDefinitions = [
  {
    id: 'q_kill_wolves',
    title: 'Thin The Pack',
    description: 'Kill 5 wolves in Ember Hollow.',
    type: QuestType.KILL_ENEMIES,
    targetValue: 5,
    targetKey: 'wolf',
    rewardExp: 40,
    rewardGold: 20,
  },
  {
    id: 'q_collect_blue',
    title: 'Treasure Hunter',
    description: 'Collect 1 blue item.',
    type: QuestType.COLLECT_ITEMS,
    targetValue: 1,
    targetKey: 'BLUE',
    rewardExp: 55,
    rewardGold: 25,
  },
];

export const dungeons = [
  { key: 'ember_hollow', zone: 'Ember Hollow', difficulty: 1, bossId: 'boss_ember' },
  { key: 'crypt_of_ashes', zone: 'Crypt of Ashes', difficulty: 2, bossId: 'boss_ash' },
];
