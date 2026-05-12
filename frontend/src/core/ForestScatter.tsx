import { useLayoutEffect, useMemo } from 'react';
import { Clone, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { fixGltfSpecularGlossinessMaterials } from './gltfSpecularGlossinessFix';
import { MAP_HALF_SIZE } from './world';

/** Kết quả `useGLTF` có `parser` để gắn texture từ extension cũ. */
type GltfWithParser = {
  scene: THREE.Object3D;
  parser: { getDependency: (type: string, index: number) => Promise<unknown> };
};

import forestPackUrl from '../assets/model/various_forest_assets_pack.glb?url';
import simpleTreeUrl from '../assets/model/simple_tree.glb?url';
import treePs1Url from '../assets/model/tree_ps1psx_style.glb?url';

/** Số cây / prop trên bản đồ (random trong các mẫu có sẵn). */
const SCATTER_COUNT = 50;
/** Lùi vào trong biên map để không chồng lên viền xanh. */
const EDGE_MARGIN = 7;
/** Seed cố định → vị trí ổn định mỗi lần load (đổi số = bố cục khác). */
const SCATTER_SEED = 738_561;

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
    const rng = mulberry32(SCATTER_SEED);
    const span = MAP_HALF_SIZE - EDGE_MARGIN;
    return Array.from({ length: SCATTER_COUNT }, (_, i) => {
      const src = templates[Math.floor(rng() * templates.length)]!;
      return {
        id: i,
        source: src,
        position: [(rng() * 2 - 1) * span, -0.02, (rng() * 2 - 1) * span] as [number, number, number],
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
