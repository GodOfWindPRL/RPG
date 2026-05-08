export type SetDefinition = {
  key: string;
  name: string;
  /** ItemDefinition ids that belong to this set. */
  itemIds: string[];
  /** Bonus lines unlocked at 2..N pieces (length should be >= itemIds.length - 1). */
  bonuses: string[];
};

export const mythicSets: SetDefinition[] = [
  {
    key: 'storm_callers',
    name: 'Storm Caller',
    itemIds: ['set_storm_ring', 'set_storm_amulet', 'set_storm_helm'],
    bonuses: ['+18% Lightning damage', '+12% Attack speed'],
  },
  {
    key: 'ashen_war',
    name: 'Ashen War',
    itemIds: ['set_ashen_blade', 'set_ashen_mail', 'set_ashen_boots', 'set_ashen_gloves'],
    bonuses: ['+25% Physic damage', '+12% Move speed', '+10% Crit rate'],
  },
  {
    key: 'dawn_veil',
    name: 'Veil of Dawn',
    itemIds: ['set_dawn_helm', 'set_dawn_ring'],
    bonuses: ['+40% Crit damage'],
  },
  {
    key: 'grave_bloom',
    name: 'Grave Bloom',
    itemIds: ['set_grave_amulet', 'set_grave_legs', 'set_grave_gloves', 'set_grave_boots', 'set_grave_helm'],
    bonuses: ['+22% Poison damage', '+14% Evasion', '+160 Max HP', '+10% Crit rate'],
  },
  {
    key: 'skyforged',
    name: 'Skyforged',
    itemIds: ['set_sky_blade', 'set_sky_mail', 'set_sky_helm', 'set_sky_legs', 'set_sky_gloves', 'set_sky_boots'],
    bonuses: ['+18% Cold damage', '+18% Fire damage', '+18% Lightning damage', '+18% Poison damage', '+14% Attack speed'],
  },
  {
    key: 'iron_oath',
    name: 'Iron Oath',
    itemIds: ['set_oath_ring', 'set_oath_amulet', 'set_oath_mail'],
    bonuses: ['+220 Max HP', '+20% Defense'],
  },
  {
    key: 'ember_pact',
    name: 'Ember Pact',
    itemIds: ['set_ember_blade', 'set_ember_amulet', 'set_ember_gloves', 'set_ember_boots'],
    bonuses: ['+28% Fire damage', '+12% Crit rate', '+15% Move speed'],
  },
  {
    key: 'mirror_hunt',
    name: 'Mirror Hunt',
    itemIds: ['set_mirror_ring', 'set_mirror_helm', 'set_mirror_legs'],
    bonuses: ['+14% Accuracy', '+20% Evasion'],
  },
  {
    key: 'wyrm_sigil',
    name: 'Wyrm Sigil',
    itemIds: ['set_wyrm_amulet', 'set_wyrm_ring', 'set_wyrm_blade', 'set_wyrm_helm'],
    bonuses: ['+26% Magic damage', '+26% Physic damage', '+10% Crit rate'],
  },
  {
    key: 'starbound',
    name: 'Starbound',
    itemIds: ['set_star_ring', 'set_star_amulet', 'set_star_helm', 'set_star_mail', 'set_star_boots'],
    bonuses: ['+140 Max Mana', '+22% Magic damage', '+12% Attack speed', '+15% Move speed'],
  },
];

export const setByItemId = new Map<string, { key: string; name: string; piecesTotal: number; bonuses: string[] }>();
for (const s of mythicSets) {
  for (const id of s.itemIds) {
    setByItemId.set(id, { key: s.key, name: s.name, piecesTotal: s.itemIds.length, bonuses: s.bonuses });
  }
}

