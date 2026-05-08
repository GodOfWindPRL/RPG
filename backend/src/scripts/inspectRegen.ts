/** Diagnostic: list each character's equipped items and their regen contribution. */
import { prisma } from '../modules/shared/prisma.js';

async function main() {
  const chars = await prisma.character.findMany({
    include: { inventoryItems: { where: { equipped: true }, include: { definition: true } } },
  });
  for (const c of chars) {
    console.log(`\n=== ${c.name} (${c.id}) lv${c.level} hp=${c.hp} mana=${c.mana} ===`);
    let hpFlat = 0;
    let hpPct = 0;
    let mpFlat = 0;
    let mpPct = 0;
    for (const it of c.inventoryItems) {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(it.affixJson);
      } catch {
        /* ignore */
      }
      const h = (parsed.hpRegen as number | undefined) ?? 0;
      const hp = (parsed.hpRegenPct as number | undefined) ?? 0;
      const m = (parsed.manaRegen as number | undefined) ?? 0;
      const mp = (parsed.manaRegenPct as number | undefined) ?? 0;
      if (h || hp || m || mp) {
        console.log(
          `  [${it.rarity} ${it.definition.slot} lv${it.level}] hpFlat=${h} hpPct=${hp} mpFlat=${m} mpPct=${mp}  (${it.definition.name})`,
        );
      } else {
        console.log(`  [${it.rarity} ${it.definition.slot} lv${it.level}] (no regen affix)`);
      }
      hpFlat += h;
      hpPct += hp;
      mpFlat += m;
      mpPct += mp;
    }
    console.log(`  TOTAL: hpFlat=${hpFlat} hpPct=${hpPct}%  mpFlat=${mpFlat} mpPct=${mpPct}%`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
