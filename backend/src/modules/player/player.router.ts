import { Router } from 'express';
import { authMiddleware, type AuthRequest } from '../../middleware/auth.js';
import { asyncRoute } from '../../asyncRoute.js';
import { createCharacter, getCharacterById, listCharacters } from './player.service.js';
import { withComputedStats } from './stats.js';

export const playerRpgRouter = Router();

playerRpgRouter.use(authMiddleware);

playerRpgRouter.get(
  '/characters',
  asyncRoute(async (req, res) => {
    const chars = await listCharacters((req as AuthRequest).user!.userId);
    res.json(chars);
  }),
);

playerRpgRouter.post(
  '/characters',
  asyncRoute(async (req, res) => {
    try {
      const { name, className } = req.body as { name?: string; className?: string };
      if (!name || !className) {
        res.status(400).json({ error: 'name and className are required' });
        return;
      }
      const character = await createCharacter((req as AuthRequest).user!.userId, name, className);
      res.json(character);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }),
);

playerRpgRouter.get(
  '/characters/:characterId',
  asyncRoute(async (req, res) => {
    const character = await getCharacterById(req.params.characterId, (req as AuthRequest).user!.userId);
    if (!character) {
      res.status(404).json({ error: 'Character not found' });
      return;
    }
    res.json(withComputedStats(character));
  }),
);
