import { useLayoutEffect, useMemo } from 'react';
import { Clone, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { fixGltfSpecularGlossinessMaterials } from './gltfSpecularGlossinessFix';
import { computeForestScatterXZ, FOREST_SCATTER_SEED } from './forestObstacles';

/** Kết quả `useGLTF` có `parser` để gắn texture từ extension cũ. */
type GltfWithParser = {
  scene: THREE.Object3D;
  parser: { getDependency: (type: string, index: number) => Promise<unknown> };
};

import forestPackUrl from '../assets/model/various_forest_assets_pack.glb?url';
import simpleTreeUrl from '../assets/model/simple_tree.glb?url';
import treePs1Url from '../assets/model/tree_ps1psx_style.glb?url';

/** Seed riêng cho chọn mẫu / xoay / scale — giữ `computeForestScatterXZ` đúng thứ tự với server. */
const FOREST_VISUAL_RNG_SEED = FOREST_SCATTER_SEED + 1_000_003;

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Các nhánh con trực tiếp của `GLTF_SceneRootNode` (AppleTree, đá, cây thông, …). */
function collectForestPropRoots(scene: THREE.Object3D): THREE.Object3D[] {
  const roots: THREE.Object3D[] = [];
  scene.traverse((o) => {
    if (o.name === 'GLTF_SceneRootNode') {
      for (const c of o.children) roots.push(c);
    }
  });
  return roots;
}

useGLTF.preload(forestPackUrl);
useGLTF.preload(simpleTreeUrl);
useGLTF.preload(treePs1Url);

export function ForestScatter() {
  const forestGltf = useGLTF(forestPackUrl) as unknown as GltfWithParser;
  const simpleGltf = useGLTF(simpleTreeUrl) as unknown as GltfWithParser;
  const ps1Gltf = useGLTF(treePs1Url) as unknown as GltfWithParser;
  const { scene: forestScene } = forestGltf;
  const { scene: simpleScene } = simpleGltf;
  const { scene: ps1Scene } = ps1Gltf;

  useLayoutEffect(() => {
    let cancel = false;
    Promise.all([
      fixGltfSpecularGlossinessMaterials(forestGltf.scene, forestGltf.parser),
      fixGltfSpecularGlossinessMaterials(simpleGltf.scene, simpleGltf.parser),
      fixGltfSpecularGlossinessMaterials(ps1Gltf.scene, ps1Gltf.parser),
    ]).then(() => {
      if (!cancel) {
        forestGltf.scene.updateMatrixWorld(true);
        simpleGltf.scene.updateMatrixWorld(true);
        ps1Gltf.scene.updateMatrixWorld(true);
      }
    });
    return () => {
      cancel = true;
    };
  }, [forestGltf, simpleGltf, ps1Gltf]);

  const templates = useMemo(() => {
    const roots = collectForestPropRoots(forestScene);
    const extra: THREE.Object3D[] = [];
    const s = simpleScene.children[0];
    const p = ps1Scene.children[0];
    if (s) extra.push(s);
    if (p) extra.push(p);
    return roots.length > 0 ? [...roots, ...extra] : extra;
  }, [forestScene, simpleScene, ps1Scene]);

  const placements = useMemo(() => {
    if (templates.length === 0) return [];
    const rng = mulberry32(FOREST_VISUAL_RNG_SEED);
    const xz = computeForestScatterXZ();
    return xz.map((p, i) => {
      const src = templates[Math.floor(rng() * templates.length)]!;
      return {
        id: i,
        source: src,
        position: [p.x, -0.02, p.z] as [number, number, number],
        rotation: [0, rng() * Math.PI * 2, 0] as [number, number, number],
        scale: 0.4 + rng() * 0.55,
      };
    });
  }, [templates]);

  return (
    <group name="forest-scatter">
      {placements.map((p) => (
        <Clone
          key={p.id}
          object={p.source}
          position={p.position}
          rotation={p.rotation}
          scale={p.scale}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
}
