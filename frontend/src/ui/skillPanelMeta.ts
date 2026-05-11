import { spellSkillFlatElementBonus } from '../core/skillScaling';

/** Tên hiển thị khi chưa có bản ghi từ API. */
export const SKILL_DISPLAY_NAME: Record<string, string> = {
  slash: 'Slash',
  savage: 'Savage',
  blink: 'Blink',
  haste: 'Haste',
  splitarrow: 'Split Arrow',
  firebolt: 'Firebolt',
  chainlightning: 'Chain Lightning',
  blizzard: 'Blizzard',
  chaosorb: 'Chaos Orb',
  meteor: 'Meteor',
};

/**
 * Khớp backend `SkillDefinition.requiredLevel` — ngưỡng cho cấp skill 1 (mỗi +1 cấp skill cần thêm +1 lv nhân vật).
 * Fallback khi API không gửi field (skill chưa có bản ghi CharacterSkill).
 */
export const SKILL_REQUIRED_LEVEL: Record<string, number> = {
  slash: 1,
  savage: 1,
  blink: 1,
  haste: 1,
  splitarrow: 1,
  firebolt: 1,
  chaosorb: 1,
  blizzard: 1,
  chainlightning: 1,
  meteor: 5,
};

/** Khi chưa có `skill.requiredSkill` từ API — skill nhánh cần học trước (vd Meteor → Firebolt). */
export const SKILL_REQUIRED_PARENT: Record<string, string | null> = {
  slash: null,
  savage: null,
  blink: null,
  haste: null,
  splitarrow: null,
  firebolt: null,
  chaosorb: null,
  blizzard: null,
  chainlightning: null,
  meteor: 'firebolt',
};

/** Fallback cho `skill.castKind` khi skill chưa được học (API chưa có bản ghi CharacterSkill). */
export const SKILL_CAST_KIND: Record<string, 'MELEE' | 'RANGED' | 'AREA' | 'TELEPORT' | 'BUFF'> = {
  slash: 'MELEE',
  savage: 'MELEE',
  blink: 'TELEPORT',
  haste: 'BUFF',
  splitarrow: 'RANGED',
  firebolt: 'RANGED',
  chaosorb: 'RANGED',
  chainlightning: 'RANGED',
  blizzard: 'AREA',
  meteor: 'AREA',
};

export function requiredPlayerLevelForNextSkillRank(baseRequiredLevel: number, currentSkillLevel: number): number {
  return baseRequiredLevel + Math.max(0, currentSkillLevel);
}

export const SKILL_DESCRIPTION_VI: Record<string, string> = {
  slash: 'Chém nhanh một nhát theo hướng đang nhìn.',
  savage: 'Liên hoàn chém ba nhát trước mặt.',
  blink: 'Teleport tới vị trí bạn chọn.',
  haste: 'Tăng tốc đánh và tốc chạy trong một lúc.',
  splitarrow: 'Bắn nhiều mũi tên xòe quạt về phía trước.',
  firebolt: 'Cầu lửa bay thẳng, nổ khi chạm địch.',
  chainlightning: 'Tia sét nhảy giữa các mục tiêu gần nhau.',
  blizzard: 'Hạ bão tuyết xuống một vùng chỉ định.',
  chaosorb: 'Quả độc bay theo đường thẳng, nổ khi chạm địch.',
  meteor: 'Thiên thạch rơi xuống điểm bạn chọn.',
};

/** Synergy: skill này cộng thêm cho skill khác (UI; combat sẽ nối sau). */
export type SynergyGrantPart = { text: string; highlight?: boolean };

export const SKILL_SYNERGY_GRANTS_OTHERS: Record<string, SynergyGrantPart[][]> = {
  firebolt: [
    [
      { text: 'Firebolt: +10% sát thương ' },
      { text: 'Meteor', highlight: true },
      { text: ' khi skill ' },
      { text: 'Meteor', highlight: true },
      { text: ' gây damage lên quái.', highlight: false },
    ],
  ],
};

export function skillTypeLabel(skillId: string, damageKind?: string): string {
  if (skillId === 'firebolt') return 'Spell · Fire';
  if (skillId === 'meteor') return 'Spell · Fire';
  if (skillId === 'chainlightning') return 'Spell · Lightning';
  if (skillId === 'blizzard') return 'Spell · Cold';
  if (skillId === 'chaosorb') return 'Spell · Poison';
  if (damageKind === 'SPELL' || damageKind === 'MAGIC') return 'Spell';
  return 'Physic';
}

export function spellOptsLabel(skillId: string, level: number): string | null {
  if (level <= 0) return null;
  if (skillId === 'firebolt') return `+${spellSkillFlatElementBonus(skillId, level)} fire dmg`;
  if (skillId === 'blizzard') return `+${spellSkillFlatElementBonus(skillId, level)} cold dmg`;
  if (skillId === 'chaosorb') return `+${spellSkillFlatElementBonus(skillId, level)} poison dmg`;
  if (skillId === 'meteor') return `+${spellSkillFlatElementBonus(skillId, level)} fire dmg`;
  if (skillId === 'chainlightning') return `+${spellSkillFlatElementBonus(skillId, level)} lightning dmg`;
  return null;
}
