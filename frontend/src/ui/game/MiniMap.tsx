import { useState } from 'react';
import { useGameStore } from '../../systems/gameStore';
import { CAMERA_BASE_OFFSET } from '../../systems/cameraSettingsStore';

const SIZE = 152;
const ZOOM_LEVELS = [100, 200, 300] as const;

function basisFromCameraOffset() {
  const fwdX = -CAMERA_BASE_OFFSET.x;
  const fwdZ = -CAMERA_BASE_OFFSET.z;
  const fLen = Math.hypot(fwdX, fwdZ) || 1;
  const fx = fwdX / fLen;
  const fz = fwdZ / fLen;
  const rx = -fz;
  const rz = fx;
  return { fx, fz, rx, rz };
}

export function MiniMap() {
  const character = useGameStore((s) => s.character);
  const enemies = useGameStore((s) => s.enemies);
  const [zoomIdx, setZoomIdx] = useState(1); // default radius: 200
  if (!character) return null;

  const radius = ZOOM_LEVELS[zoomIdx];
  const inner = SIZE - 40;
  const half = inner / 2;
  const { fx, fz, rx, rz } = basisFromCameraOffset();

  const alive = enemies.filter((e) => e.hp > 0);

  return (
    <div className="mini-map" style={{ width: SIZE, height: SIZE }}>
      <div className="mini-map-title">Map · R{radius}</div>
      <div className="mini-map-frame" style={{ height: inner }}>
        {alive.map((enemy) => {
          const dx = enemy.x - character.posX;
          const dz = enemy.z - character.posZ;

          // Player-centric, camera-relative coordinates.
          const localX = dx * rx + dz * rz;
          const localY = -(dx * fx + dz * fz);

          if (Math.abs(localX) > radius || Math.abs(localY) > radius) return null;

          const left = half + (localX / radius) * half;
          const top = half + (localY / radius) * half;
          return (
            <div
              key={enemy.id}
              className="mini-map-dot mini-map-dot-enemy"
              style={{ left: `${left}px`, top: `${top}px` }}
            />
          );
        })}

        <div className="mini-map-dot mini-map-dot-player" style={{ left: `${half}px`, top: `${half}px` }} />
      </div>

      <div className="mini-map-zoom-row">
        <button
          type="button"
          className="mini-map-zoom-btn"
          onClick={() => setZoomIdx((z) => Math.max(0, z - 1))}
          title="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          className="mini-map-zoom-btn"
          onClick={() => setZoomIdx((z) => Math.min(ZOOM_LEVELS.length - 1, z + 1))}
          title="Zoom out"
        >
          -
        </button>
      </div>
    </div>
  );
}
