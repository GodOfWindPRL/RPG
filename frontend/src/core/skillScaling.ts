/** Mirror backend/src/modules/content/skillScaling.ts for UI (mana display). */

export function clampSkillLevel(raw: number): number {
  return Math.max(1, Math.min(20, Math.floor(raw || 1)));
}

export function effectiveSpellManaCost(skillId: string, level: number): number {
  const lv = clampSkillLevel(level);
  if (skillId === 'firebolt') {
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
  if (skillId === 'meteor') {
    const base = 46;
    return base + Math.floor((5 * (lv - 1) * lv) / 2);
  }
  if (skillId === 'chainlightning') {
    const base = 18;
    return base + Math.floor((3 * (lv - 1) * lv) / 2);
  }
  return 0;
}

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
  if (skillId === 'meteor') {
    let sum = 36;
    for (let n = 2; n <= lv; n++) sum += 5 + n;
    return sum;
  }
  if (skillId === 'chainlightning') {
    return 20 + (lv - 1) * 5;
  }
  return 0;
}

/** Tổng số mục tiêu (gốc + chain): L1–4→3, L5–9→4, L10–14→5, L15–19→6, L20→7 */
export function chainLightningMaxTargets(level: number): number {
  const lv = clampSkillLevel(level);
  if (lv >= 20) return 7;
  if (lv >= 15) return 6;
  if (lv >= 10) return 5;
  if (lv >= 5) return 4;
  return 3;
}

export function isSpellDamageKind(kind: string | undefined): boolean {
  return kind === 'SPELL' || kind === 'MAGIC';
}

export function displaySkillManaCost(
  skillId: string,
  level: number,
  damageKind: string | undefined,
  dbManaCost: number,
): number {
  if (level <= 0) return dbManaCost;
  if (isSpellDamageKind(damageKind)) return effectiveSpellManaCost(skillId, level);
  return dbManaCost;
}

/** Chênh mana khi lên cấp kế tiếp (spell); null nếu không áp dụng. */
export function spellManaDeltaNext(skillId: string, level: number): number | null {
  if (level <= 0 || level >= 20) return null;
  if (!['firebolt', 'blizzard', 'chaosorb', 'meteor', 'chainlightning'].includes(skillId)) return null;
  return effectiveSpellManaCost(skillId, level + 1) - effectiveSpellManaCost(skillId, level);
}

/** Chênh bonus flat nguyên tố khi lên cấp kế tiếp; null nếu không áp dụng. */
export function spellFlatBonusDeltaNext(skillId: string, level: number): number | null {
  if (level <= 0 || level >= 20) return null;
  if (!['firebolt', 'blizzard', 'chaosorb', 'meteor', 'chainlightning'].includes(skillId)) return null;
  return spellSkillFlatElementBonus(skillId, level + 1) - spellSkillFlatElementBonus(skillId, level);
}
