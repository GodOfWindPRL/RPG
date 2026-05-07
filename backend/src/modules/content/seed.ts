import { prisma } from '../shared/prisma.js';
import { itemDefinitions, questDefinitions, skillDefinitions } from './definitions.js';

export async function seedStaticContent() {
  await Promise.all(
    skillDefinitions.map((skill) =>
      prisma.skillDefinition.upsert({
        where: { id: skill.id },
        update: skill,
        create: skill,
      }),
    ),
  );

  await Promise.all(
    itemDefinitions.map((item) =>
      prisma.itemDefinition.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      }),
    ),
  );

  await Promise.all(
    questDefinitions.map((quest) =>
      prisma.questDefinition.upsert({
        where: { id: quest.id },
        update: quest,
        create: quest,
      }),
    ),
  );
}
