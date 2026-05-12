import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../systems/gameStore';
import type { SlashSpritePreset } from '../vfx/slashSpriteFrameUrls';
import { SlashSpriteFx, SAVAGE_SPRITE_FORWARD_OFFSET_M, SAVAGE_VFX_WORLD_SCALE_MUL } from './SlashSpriteFx';

type Layer = { key: number; preset: SlashSpritePreset; periodMs: number };

function burstDurationSec(periodMs: number, preset: SlashSpritePreset): number {
  const p = periodMs / 1000;
  if (preset === 'slash1') return Math.max(0.2, Math.min(0.48, p * 0.4));
  return Math.max(0.12, Math.min(0.32, p * 0.26));
}

/** Savage: 3 nhát theo server 20% / 40% / 60% period — VFX Slash2, Slash3, Slash1 (Slash1 = 2 swing trong một clip). */
export function SavageSlashSpriteBurst() {
  const burst = useGameStore((s) => s.savageSpriteBurst);
  const clearSavageSpriteBurst = useGameStore((s) => s.clearSavageSpriteBurst);
  const [layers, setLayers] = useState<Layer[]>([]);
  const keyRef = useRef(0);

  useEffect(() => {
    if (!burst) return;
    setLayers([]);
    keyRef.current = burst.id * 1000;
    const { periodMs: periodSnap } = burst;
    const add = (preset: SlashSpritePreset, delayMs: number) =>
      window.setTimeout(() => {
        keyRef.current += 1;
        const key = keyRef.current;
        setLayers((prev) => [...prev, { key, preset, periodMs: periodSnap }]);
      }, Math.round(delayMs));

    const t1 = add('slash2', periodSnap * 0.2);
    const t2 = add('slash3', periodSnap * 0.4);
    const t3 = add('slash1', periodSnap * 0.6);
    const end = window.setTimeout(() => {
      clearSavageSpriteBurst();
      setLayers([]);
    }, Math.round(periodSnap * 0.65) + 900);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearTimeout(end);
    };
  }, [burst, clearSavageSpriteBurst]);

  if (layers.length === 0) return null;

  return (
    <>
      {layers.map((l) => (
        <SlashSpriteFx
          key={l.key}
          playToken={l.key}
          x={0}
          z={0}
          yaw={0}
          anchorToPlayer
          forwardOffsetM={SAVAGE_SPRITE_FORWARD_OFFSET_M}
          worldScaleMul={SAVAGE_VFX_WORLD_SCALE_MUL}
          durationSec={burstDurationSec(l.periodMs, l.preset)}
          preset={l.preset}
          onFinished={() => setLayers((prev) => prev.filter((x) => x.key !== l.key))}
        />
      ))}
    </>
  );
}
