import { spellSkillFlatElementBonus } from '../core/skillScaling';

/** Tên hiển thị khi chưa có bản ghi từ API. */
export const SKILL_DISPLAY_NAME: Record<string, string> = {
  slash: 'Slash',
  firebolt: 'Firebolt',
  blizzard: 'Blizzard',
  chaosorb: 'Chaos Orb',
  meteor: 'Meteor',
};

export const SKILL_DESCRIPTION_VI: Record<string, string> = {
  slash: 'Chém cận chiến theo hướng đang nhìn, gây sát thương vật lý và nguyên tố trên vũ khí.',
  firebolt:
    'Bắn một quả cầu lửa về phía trước; khi chạm mục tiêu hoặc điểm ngắm sẽ nổ, gây sát thương hỏa trong phạm vi 5×5 ô phía trước.',
  blizzard:
    'Gọi bão tuyết cố định 5×5 ô trong 2 giây; mỗi 0.2s một mảnh băng rơi ngẫu nhiên trong vùng, mỗi mảnh gây sát thương băng trong phạm vi 4×4 ô.',
  chaosorb:
    'Phóng quỹ độc theo đường thẳng; nổ khi trúng quái trên đường bay và nổ thêm tại điểm tối đa, gây sát thương độc vùng tròn.',
  meteor:
    'Triệu hồi một thiên thạch khổng lồ kích thước 4×4 ô rơi thẳng xuống điểm ngắm, gây sát thương hỏa trong phạm vi 4×4 (150% sát thương đòn của skill). Sau khi chạm đất tạo vùng cháy nổ 8×8 ô trong 3 giây, mỗi 0,5 giây gây thêm 20% sát thương đòn của skill mỗi lần tick. Spell luôn trúng.',
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
  if (skillId === 'slash') return 'Physic · Melee';
  if (skillId === 'firebolt') return 'Spell · Fire';
  if (skillId === 'meteor') return 'Spell · Fire';
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
  return null;
}
