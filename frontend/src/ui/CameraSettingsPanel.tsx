import { useCameraSettingsStore } from '../systems/cameraSettingsStore';

export function CameraSettingsPanel({ className = 'panel' }: { className?: string }) {
  const distanceScale = useCameraSettingsStore((s) => s.distanceScale);
  const fov = useCameraSettingsStore((s) => s.fov);
  const setDistanceScale = useCameraSettingsStore((s) => s.setDistanceScale);
  const setFov = useCameraSettingsStore((s) => s.setFov);
  const resetCameraSettings = useCameraSettingsStore((s) => s.resetCameraSettings);

  return (
    <div className={className}>
      <h3>Camera</h3>
      <label className="slider-label">
        Distance × {distanceScale.toFixed(1)}
        <input
          type="range"
          min={0.5}
          max={4}
          step={0.1}
          value={distanceScale}
          onChange={(e) => setDistanceScale(Number(e.target.value))}
        />
      </label>
      <label className="slider-label">
        FOV {fov}°
        <input type="range" min={35} max={85} step={1} value={fov} onChange={(e) => setFov(Number(e.target.value))} />
      </label>
      <button type="button" onClick={resetCameraSettings}>
        Reset camera
      </button>
    </div>
  );
}
