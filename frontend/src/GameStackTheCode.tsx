import { useEffect, useRef, useState } from 'react';
import type { PlayerInfo } from './App';

interface GameStackTheCodeProps {
  player: PlayerInfo;
  onBack: () => void;
}

type Block = { x: number; y: number; w: number; h: number; color: string };

const WIDTH = 520;
const HEIGHT = 620;
const BLOCK_HEIGHT = 32;
const INITIAL_BLOCK_WIDTH = 180;
const BASE_Y = HEIGHT - 40;

const BLOCK_COLORS = ['#38bdf8', '#818cf8', '#f472b6', '#f59e0b', '#34d399', '#22d3ee'];

export default function GameStackTheCode({ player, onBack }: GameStackTheCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [resetSeed, setResetSeed] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const stack: Block[] = [
      {
        x: (WIDTH - INITIAL_BLOCK_WIDTH) / 2,
        y: BASE_Y,
        w: INITIAL_BLOCK_WIDTH,
        h: BLOCK_HEIGHT,
        color: '#0ea5e9',
      },
    ];

    let animationId = 0;
    let localScore = 0;
    let movingX = 0;
    let movingDir = 1;
    let movingWidth = INITIAL_BLOCK_WIDTH;
    let dropY = 40;
    let dropping = false;
    let velocityY = 0;

    const createNextBlock = () => {
      movingWidth = Math.max(56, stack[stack.length - 1].w);
      movingX = 0;
      movingDir = 1;
      dropY = 40;
      velocityY = 0;
      dropping = false;
    };

    const placeBlock = () => {
      const top = stack[stack.length - 1];
      const overlapLeft = Math.max(movingX, top.x);
      const overlapRight = Math.min(movingX + movingWidth, top.x + top.w);
      const overlap = overlapRight - overlapLeft;

      if (overlap < 18) {
        setGameOver(true);
        setBest((prev) => Math.max(prev, localScore));
        return;
      }

      const y = top.y - BLOCK_HEIGHT;
      const block: Block = {
        x: overlapLeft,
        y,
        w: overlap,
        h: BLOCK_HEIGHT,
        color: BLOCK_COLORS[stack.length % BLOCK_COLORS.length],
      };
      stack.push(block);
      localScore += 1;
      setScore(localScore);
      createNextBlock();
    };

    const onDrop = () => {
      if (!gameOver && !dropping) {
        dropping = true;
        velocityY = 30;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        onDrop();
      }
    };

    const onMouseDown = () => onDrop();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onMouseDown);

    const draw = () => {
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.strokeStyle = '#155e75';
      ctx.lineWidth = 1;
      for (let y = 0; y < HEIGHT; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(WIDTH, y);
        ctx.stroke();
      }

      stack.forEach((block) => {
        ctx.fillStyle = block.color;
        ctx.fillRect(block.x, block.y, block.w, block.h);
      });

      if (!gameOver) {
        ctx.fillStyle = '#67e8f9';
        ctx.fillRect(movingX, dropY, movingWidth, BLOCK_HEIGHT);
      }
    };

    const loop = () => {
      if (!gameOver) {
        if (!dropping) {
          movingX += movingDir * 3.2;
          if (movingX <= 0) {
            movingX = 0;
            movingDir = 1;
          }
          if (movingX + movingWidth >= WIDTH) {
            movingX = WIDTH - movingWidth;
            movingDir = -1;
          }
        } else {
          velocityY += 0.55;
          dropY += velocityY;
          const landingY = stack[stack.length - 1].y - BLOCK_HEIGHT;
          if (dropY >= landingY) {
            dropY = landingY;
            placeBlock();
          }
        }
      }

      draw();
      animationId = requestAnimationFrame(loop);
    };

    createNextBlock();
    animationId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onMouseDown);
    };
  }, [gameOver, resetSeed]);

  const restart = () => {
    setScore(0);
    setGameOver(false);
    setResetSeed((x) => x + 1);
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-indigo-950 via-slate-900 to-cyan-950 p-4">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-4 flex items-center justify-between">
          <button type="button" onClick={onBack} className="text-sm font-medium text-white/90 hover:text-white">
            ← Về portal
          </button>
          <span className="text-sm text-white/80">Stack the Code • {player.playerName}</span>
        </div>

        <div className="rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur">
          <div className="mb-3 flex items-center justify-between text-sm text-white/90">
            <span>Tầng: {score}</span>
            <span>Kỷ lục: {best}</span>
            <span>Space / Click để thả block</span>
          </div>

          <canvas
            ref={canvasRef}
            width={WIDTH}
            height={HEIGHT}
            className="mx-auto block h-auto w-full max-w-[520px] rounded-xl border border-indigo-400/40 bg-slate-950"
          />

          {gameOver && (
            <div className="mt-4 flex items-center justify-between rounded-xl border border-amber-400/40 bg-amber-500/10 p-4">
              <p className="font-medium text-white">Tháp đổ rồi! Bạn xếp được {score} tầng.</p>
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
