import 'dotenv/config';
import http from 'http';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { prisma } from './modules/shared/prisma.js';
import { seedStaticContent } from './modules/content/seed.js';
import { authRpgRouter } from './modules/auth/auth.router.js';
import { playerRpgRouter } from './modules/player/player.router.js';
import { gameRpgRouter } from './modules/game/game.router.js';
import { attachRpgSocket } from './modules/combat/world.gateway.js';

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

app.use(cors({ origin: true }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'slt-adventure-rpg-backend' });
});

app.use('/api/rpg/auth', authRpgRouter);
app.use('/api/rpg/player', playerRpgRouter);
app.use('/api/rpg/game', gameRpgRouter);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('API error:', err);
  if (res.headersSent) return;
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ error: message });
});

const httpServer = http.createServer(app);
attachRpgSocket(httpServer);

async function start() {
  await prisma.$connect();
  await seedStaticContent();
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`SLT Adventure API ready on http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error('Failed to start server', error);
  process.exit(1);
});
