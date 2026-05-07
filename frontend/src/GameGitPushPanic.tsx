import { useEffect, useRef, useState } from 'react';
import type { PlayerInfo } from './App';

interface GameGitPushPanicProps {
  player: PlayerInfo;
  onBack: () => void;
}

type Obstacle = { x: number; y: number; w: number; h: number };

const WIDTH = 920;
const HEIGHT = 360;
const GROUND_Y = HEIGHT - 70;
const RUNNER_X = 140;
const RUNNER_W = 42;
const RUNNER_H = 54;

export default function GameGitPushPanic({ player, onBack }: GameGitPushPanicProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [seed, setSeed] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId = 0;
    let last = performance.now();
    let y = GROUND_Y - RUNNER_H;
    let vy = 0;
    let speed = 260;
    let spawnCooldown = 1.2;
    const gravity = 980;
    const obstacles: Obstacle[] = [];
    let localScore = 0;

    const onJump = () => {
      if (!gameOver && y >= GROUND_Y - RUNNER_H - 0.1) {
        vy = -450;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        onJump();
      }
    };

    const onMouseDown = () => onJump();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onMouseDown);

    const spawnObstacle = () => {
      const h = 34 + Math.random() * 32;
      const w = 24 + Math.random() * 26;
      obstacles.push({
        x: WIDTH + 20,
        y: GROUND_Y - h,
        w,
        h,
      });
    };

    const intersects = (a: Obstacle, bx: number, by: number, bw: number, bh: number) => {
      return bx < a.x + a.w && bx + bw > a.x && by < a.y + a.h && by + bh > a.y;
    };

    const draw = () => {
      ctx.fillStyle = '#082f49';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.fillStyle = '#0c4a6e';
      for (let i = 0; i < 40; i += 1) {
        const x = (i * 90 - (localScore * 2) % 90) % WIDTH;
        ctx.fillRect(x, 70 + (i % 3) * 24, 50, 4);
      }

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y);

      ctx.fillStyle = '#22d3ee';
      ctx.fillRect(RUNNER_X, y, RUNNER_W, RUNNER_H);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(RUNNER_X + 8, y + 16, RUNNER_W - 16, 6);
      ctx.fillRect(RUNNER_X + 10, y + 34, RUNNER_W - 20, 6);

      ctx.fillStyle = '#fb7185';
      obstacles.forEach((ob) => {
        ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
        ctx.fillStyle = '#7f1d1d';
        ctx.fillRect(ob.x + 4, ob.y + 8, ob.w - 8, 4);
        ctx.fillStyle = '#fb7185';
      });
    };

    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      if (!gameOver) {
        vy += gravity * dt;
        y += vy * dt;
        if (y > GROUND_Y - RUNNER_H) {
          y = GROUND_Y - RUNNER_H;
          vy = 0;
        }

        speed += dt * 6;
        spawnCooldown -= dt;
        if (spawnCooldown <= 0) {
          spawnObstacle();
          spawnCooldown = Math.max(0.55, 1.25 - speed * 0.0014);
        }

        for (let i = obstacles.length - 1; i >= 0; i -= 1) {
          obstacles[i].x -= speed * dt;
          if (obstacles[i].x + obstacles[i].w < -20) {
            obstacles.splice(i, 1);
            localScore += 1;
            setScore(localScore);
          }
        }

        for (let i = 0; i < obstacles.length; i += 1) {
          if (intersects(obstacles[i], RUNNER_X, y, RUNNER_W, RUNNER_H)) {
            setGameOver(true);
            break;
          }
        }
      }

      draw();
      animationId = requestAnimationFrame(loop);
    };

    animationId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onMouseDown);
    };
  }, [gameOver, seed]);

  const restart = () => {
    setScore(0);
    setGameOver(false);
    setSeed((x) => x + 1);
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-950 via-sky-950 to-indigo-950 p-4">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-4 flex items-center justify-between">
          <button type="button" onClick={onBack} className="text-sm font-medium text-white/90 hover:text-white">
            ← Về portal
          </button>
          <span className="text-sm text-white/80">Git Push Panic • {player.playerName}</span>
        </div>

        <div className="rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur">
          <div className="mb-3 flex items-center justify-between text-sm text-white/90">
            <span>Score CI: {score}</span>
            <span>Space / ArrowUp / Click để nhảy</span>
          </div>

          <canvas
            ref={canvasRef}
            width={WIDTH}
            height={HEIGHT}
            className="h-auto w-full rounded-xl border border-sky-400/40 bg-slate-950"
          />

          {gameOver && (
            <div className="mt-4 flex items-center justify-between rounded-xl border border-rose-400/40 bg-rose-500/10 p-4">
              <p className="font-medium text-white">Pipeline fail! Bạn vượt qua {score} lỗi.</p>
              <button
                type="button"
                onClick={restart}
                className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-600"
              >
                Retry push
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
