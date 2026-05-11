/** Level-scaled mana and flat elemental bonus for spells (server + client parity). */

export function clampSkillLevel(raw: number): number {
  return Math.max(1, Math.min(20, Math.floor(raw || 1)));
}

/** MP cost at current skill level (slash etc. use DB). */
export function effectiveSpellManaCost(skillId: string, level: number): number {
  const lv = clampSkillLevel(level);
  if (skillId === 'firebolt') {
    // L1=12; mỗi bậc +2,+4,+6,… so với cấp trước → +2*(L-1) từ L-1→L
    return 12 + (lv - 1) * lv;
  }
  if (skillId === 'blizzard') {
    const base = 30;
    return base + Math.floor((3 * (lv - 1) * lv) / 2);
  }
  if (skillId === 'chaosorb') {
    const base = 14;
    return base + Math.floor((3 * (lv - 1) * lv) / 2);
  }
  return 0;
}

/** Flat elemental damage added by the skill (before attack% multiplier). */
export function spellSkillFlatElementBonus(skillId: string, level: number): number {
  const lv = clampSkillLevel(level);
  if (skillId === 'firebolt') {
    let sum = 30;
    for (let n = 2; n <= lv; n++) sum += 6 + n;
    return sum;
  }
  if (skillId === 'blizzard') {
    let sum = 50;
    for (let n = 2; n <= lv; n++) sum += 10 + 5 * (n - 2);
    return sum;
  }
  if (skillId === 'chaosorb') {
    let sum = 10;
    for (let n = 2; n <= lv; n++) sum += n;
    return sum;
  }
  return 0;
}

export function isSpellDamageKind(kind: string | undefined): boolean {
  return kind === 'SPELL' || kind === 'MAGIC';
}
