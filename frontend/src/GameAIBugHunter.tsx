import { useEffect, useRef, useState } from 'react';
import type { PlayerInfo } from './App';

interface GameAIBugHunterProps {
  player: PlayerInfo;
  onBack: () => void;
}

type Enemy = { x: number; y: number; radius: number; speed: number };
type Bullet = { x: number; y: number; vx: number; vy: number; radius: number };

const WIDTH = 900;
const HEIGHT = 520;
const PLAYER_RADIUS = 18;
const PLAYER_SPEED = 260;
const BULLET_SPEED = 580;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export default function GameAIBugHunter({ player, onBack }: GameAIBugHunterProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [gameOver, setGameOver] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId = 0;
    let lastAt = performance.now();
    const pressed = new Set<string>();
    const enemies: Enemy[] = [];
    const bullets: Bullet[] = [];
    const playerPos = { x: WIDTH / 2, y: HEIGHT / 2 };
    const mousePos = { x: WIDTH / 2, y: HEIGHT / 2 };
    let localScore = 0;
    let localLives = 3;
    let spawnCooldown = 0;
    let shootCooldown = 0;

    const onKeyDown = (e: KeyboardEvent) => {
      pressed.add(e.key.toLowerCase());
    };

    const onKeyUp = (e: KeyboardEvent) => {
      pressed.delete(e.key.toLowerCase());
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mousePos.x = ((e.clientX - rect.left) / rect.width) * WIDTH;
      mousePos.y = ((e.clientY - rect.top) / rect.height) * HEIGHT;
    };

    const onMouseDown = () => {
      pressed.add('mouse');
    };

    const onMouseUp = () => {
      pressed.delete('mouse');
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);

    const spawnEnemy = () => {
      const edge = Math.floor(Math.random() * 4);
      const radius = 14 + Math.random() * 8;
      const speed = 60 + Math.random() * 70;
      let x = 0;
      let y = 0;

      if (edge === 0) {
        x = Math.random() * WIDTH;
        y = -radius;
      } else if (edge === 1) {
        x = WIDTH + radius;
        y = Math.random() * HEIGHT;
      } else if (edge === 2) {
        x = Math.random() * WIDTH;
        y = HEIGHT + radius;
      } else {
        x = -radius;
        y = Math.random() * HEIGHT;
      }

      enemies.push({ x, y, radius, speed });
    };

    const shoot = () => {
      const dx = mousePos.x - playerPos.x;
      const dy = mousePos.y - playerPos.y;
      const len = Math.hypot(dx, dy) || 1;
      bullets.push({
        x: playerPos.x,
        y: playerPos.y,
        vx: (dx / len) * BULLET_SPEED,
        vy: (dy / len) * BULLET_SPEED,
        radius: 4,
      });
    };

    const draw = () => {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.fillStyle = '#1e293b';
      for (let i = 0; i < 80; i += 1) {
        ctx.fillRect((i * 71) % WIDTH, (i * 43) % HEIGHT, 2, 2);
      }

      const aimAngle = Math.atan2(mousePos.y - playerPos.y, mousePos.x - playerPos.x);
      ctx.save();
      ctx.translate(playerPos.x, playerPos.y);
      ctx.rotate(aimAngle);
      ctx.fillStyle = '#22d3ee';
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#67e8f9';
      ctx.fillRect(6, -4, 20, 8);
      ctx.restore();

      ctx.fillStyle = '#38bdf8';
      bullets.forEach((b) => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      enemies.forEach((enemy) => {
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7f1d1d';
        ctx.fillRect(enemy.x - 8, enemy.y - 2, 16, 4);
      });
    };

    const loop = (now: number) => {
      const dt = Math.min((now - lastAt) / 1000, 0.05);
      lastAt = now;

      if (!gameOver) {
        let vx = 0;
        let vy = 0;
        if (pressed.has('w')) vy -= 1;
        if (pressed.has('s')) vy += 1;
        if (pressed.has('a')) vx -= 1;
        if (pressed.has('d')) vx += 1;
        const length = Math.hypot(vx, vy) || 1;
        playerPos.x = clamp(playerPos.x + ((vx / length) * PLAYER_SPEED * dt || 0), PLAYER_RADIUS, WIDTH - PLAYER_RADIUS);
        playerPos.y = clamp(playerPos.y + ((vy / length) * PLAYER_SPEED * dt || 0), PLAYER_RADIUS, HEIGHT - PLAYER_RADIUS);

        spawnCooldown -= dt;
        if (spawnCooldown <= 0) {
          spawnEnemy();
          const base = 1.2 - localScore * 0.01;
          spawnCooldown = Math.max(0.35, base);
        }

        shootCooldown -= dt;
        if (pressed.has('mouse') && shootCooldown <= 0) {
          shoot();
          shootCooldown = 0.14;
        }

        bullets.forEach((bullet) => {
          bullet.x += bullet.vx * dt;
          bullet.y += bullet.vy * dt;
        });
        for (let i = bullets.length - 1; i >= 0; i -= 1) {
          const bullet = bullets[i];
          if (bullet.x < -20 || bullet.x > WIDTH + 20 || bullet.y < -20 || bullet.y > HEIGHT + 20) {
            bullets.splice(i, 1);
          }
        }

        enemies.forEach((enemy) => {
          const dx = playerPos.x - enemy.x;
          const dy = playerPos.y - enemy.y;
          const len = Math.hypot(dx, dy) || 1;
          enemy.x += (dx / len) * enemy.speed * dt;
          enemy.y += (dy / len) * enemy.speed * dt;
        });

        for (let e = enemies.length - 1; e >= 0; e -= 1) {
          const enemy = enemies[e];
          for (let b = bullets.length - 1; b >= 0; b -= 1) {
            const bullet = bullets[b];
            const hit = Math.hypot(enemy.x - bullet.x, enemy.y - bullet.y) < enemy.radius + bullet.radius;
            if (hit) {
              enemies.splice(e, 1);
              bullets.splice(b, 1);
              localScore += 1;
              setScore(localScore);
              break;
            }
          }
        }

        for (let i = enemies.length - 1; i >= 0; i -= 1) {
          const enemy = enemies[i];
          const touch = Math.hypot(enemy.x - playerPos.x, enemy.y - playerPos.y) < enemy.radius + PLAYER_RADIUS;
          if (touch) {
            enemies.splice(i, 1);
            localLives -= 1;
            setLives(localLives);
            if (localLives <= 0) {
              setGameOver(true);
            }
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
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [gameOver]);

  const restart = () => {
    setScore(0);
    setLives(3);
    setGameOver(false);
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-900 via-cyan-950 to-slate-900 p-4">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-4 flex items-center justify-between">
          <button type="button" onClick={onBack} className="text-sm font-medium text-white/90 hover:text-white">
            ← Về portal
          </button>
          <span className="text-sm text-white/80">AI Bug Hunter • {player.playerName}</span>
        </div>

        <div className="rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur">
          <div className="mb-3 flex items-center justify-between text-sm text-white/90">
            <span>Điểm: {score}</span>
            <span>Mạng: {lives}</span>
            <span>WASD để di chuyển • Giữ chuột để bắn</span>
          </div>

          <canvas
            ref={canvasRef}
            width={WIDTH}
            height={HEIGHT}
            className="h-auto w-full rounded-xl border border-cyan-500/40 bg-slate-950"
          />

          {gameOver && (
            <div className="mt-4 flex items-center justify-between rounded-xl border border-red-400/40 bg-red-500/10 p-4">
              <p className="font-medium text-white">Bạn đã bị bug tràn ngập. Điểm cuối: {score}</p>
              <button
                type="button"
                onClick={restart}
                className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-600"
              >
                Chơi lại
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
