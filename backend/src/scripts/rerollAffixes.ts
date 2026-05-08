/**
 * Migration: re-roll affixJson for ALL existing inventory items so they match
 * the new rarity-based opt count (W:0, G:2-3, B:4, Y:5, M:6) and base stamps.
 *
 * Run with:
 *   pnpm --filter backend tsx src/scripts/rerollAffixes.ts
 *   # or from backend/:
 *   npx tsx src/scripts/rerollAffixes.ts
 *
 * Optional flags:
 *   --dry         : print intended changes without writing
 *   --keep-luck   : preserve existing luckPercent on rings/amulets
 */
import { prisma } from '../modules/shared/prisma.js';
import { randomAffixes } from '../modules/item/item.service.js';
import { setByItemId } from '../modules/content/sets.js';
import { ItemRarity } from '@prisma/client';

async function main() {
  const dry = process.argv.includes('--dry');
  const keepLuck = process.argv.includes('--keep-luck');

  const rows = await prisma.inventoryItem.findMany({
    include: { definition: true },
  });

  console.log(`[migrate] inspecting ${rows.length} items (dry=${dry}, keepLuck=${keepLuck})`);

  let changed = 0;
  let unchanged = 0;
  for (const it of rows) {
    let prevLuck: number | undefined;
    if (keepLuck) {
      try {
        const o = JSON.parse(it.affixJson) as Record<string, unknown>;
        if (typeof o.luckPercent === 'number' && Number.isFinite(o.luckPercent)) {
          prevLuck = o.luckPercent as number;
        }
      } catch {
        /* ignore */
      }
    }

    const next = randomAffixes(it.level, it.rarity as ItemRarity, it.definition.slot);

    // Re-attach set metadata for Mythic set items.
    const setMeta = setByItemId.get(it.definition.id);
    if (setMeta && (it.rarity as ItemRarity) === ItemRarity.MYTHIC) {
      (next as any).setKey = setMeta.key;
      (next as any).setName = setMeta.name;
      (next as any).setPiecesTotal = setMeta.piecesTotal;
      (next as any).setBonuses = setMeta.bonuses;
    }

    if (typeof prevLuck === 'number') (next as any).luckPercent = prevLuck;

    const nextJson = JSON.stringify(next);
    if (nextJson === it.affixJson) {
      unchanged += 1;
      continue;
    }
    changed += 1;
    if (dry) {
      console.log(
        `[dry] ${it.id} (${it.rarity} ${it.definition.slot} lv${it.level}) BEFORE=${it.affixJson}\n      AFTER =${nextJson}`,
      );
      continue;
    }
    await prisma.inventoryItem.update({ where: { id: it.id }, data: { affixJson: nextJson } });
  }

  console.log(`[migrate] done. changed=${changed} unchanged=${unchanged}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
