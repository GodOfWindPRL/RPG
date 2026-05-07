import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Base camera offset from player (world units); effective offset = this × distanceScale. */
export const CAMERA_BASE_OFFSET = { x: 7, y: 8, z: 9 };

const DEFAULT_DISTANCE_SCALE = 2;
const DEFAULT_FOV = 58;

interface CameraSettingsState {
  /** Pull camera back / in (0.5 … 4). Default 2 = twice original offset → wider view. */
  distanceScale: number;
  /** Perspective FOV in degrees (35 … 85). */
  fov: number;
  setDistanceScale: (value: number) => void;
  setFov: (value: number) => void;
  resetCameraSettings: () => void;
}

export const useCameraSettingsStore = create<CameraSettingsState>()(
  persist(
    (set) => ({
      distanceScale: DEFAULT_DISTANCE_SCALE,
      fov: DEFAULT_FOV,
      setDistanceScale: (value) =>
        set({ distanceScale: Math.min(4, Math.max(0.5, Math.round(value * 10) / 10)) }),
      setFov: (value) => set({ fov: Math.min(85, Math.max(35, Math.round(value))) }),
      resetCameraSettings: () =>
        set({ distanceScale: DEFAULT_DISTANCE_SCALE, fov: DEFAULT_FOV }),
    }),
    { name: 'slt-rpg-camera-settings' },
  ),
);
