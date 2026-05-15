import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import forestPackUrl from '../assets/model/various_forest_assets_pack.glb?url';
import simpleTreeUrl from '../assets/model/simple_tree.glb?url';
import treePs1Url from '../assets/model/tree_ps1psx_style.glb?url';
import meteoriteGltfUrl from '../assets/model/meteorite.glb?url';
import devilWalkUrl from '../assets/model/Devil Walk Forward.fbx?url';
import idleAnimUrl from '../assets/model/Idle.fbx?url';
import slashAnimUrl from '../assets/model/Slash.fbx?url';
import deathAnimUrl from '../assets/model/Death.fbx?url';
import savageAnimUrl from '../assets/model/3HitsCombo.fbx?url';
import monsterIdleUrl from '../assets/model/Monster Idle.fbx?url';
import monsterWalkUrl from '../assets/model/Walk Forward.fbx?url';
import monsterAttackUrl from '../assets/model/Attack.fbx?url';
import groundColorUrl from '../assets/Ground103_1K-JPG/Ground103_1K-JPG_Color.jpg';
import groundAoUrl from '../assets/Ground103_1K-JPG/Ground103_1K-JPG_AmbientOcclusion.jpg';
import waterEffectBulletUrl from '../assets/vfx/EffectBullet/Water Effect and Bullet 16x16.png';
import greenEffectBulletUrl from '../assets/vfx/EffectBullet/Green Effect and Bullet 16x16.png';
import redImpactExplosionUrl from '../assets/vfx/Effect Bullet Impact Explosion 32x32 V1/Red Effect Bullet Impact Explosion 32x32.png';
import { SLASH_SPRITE_FRAME_URLS } from '../vfx/slashSpriteFrameUrls';

function allSlashFrameUrls(): string[] {
  const out: string[] = [];
  const presets = Object.keys(SLASH_SPRITE_FRAME_URLS) as (keyof typeof SLASH_SPRITE_FRAME_URLS)[];
  for (const p of presets) {
    out.push(...SLASH_SPRITE_FRAME_URLS[p]);
  }
  return out;
}

const GLTF_URLS = [forestPackUrl, simpleTreeUrl, treePs1Url, meteoriteGltfUrl] as const;

/** Player và quái dùng chung `Death.fbx` — chỉ tải một lần. */
const FBX_URLS = Array.from(
  new Set([
    devilWalkUrl,
    idleAnimUrl,
    slashAnimUrl,
    deathAnimUrl,
    savageAnimUrl,
    monsterIdleUrl,
    monsterWalkUrl,
    monsterAttackUrl,
  ]),
);

const TEXTURE_URLS = [
  groundColorUrl,
  groundAoUrl,
  waterEffectBulletUrl,
  greenEffectBulletUrl,
  redImpactExplosionUrl,
  ...allSlashFrameUrls(),
] as const;

let preloadPromise: Promise<void> | null = null;

/**
 * Tải trước mesh/atlas dùng trong world để tránh Suspense / nháy đen lần đầu (Slash sprite, GLB, FBX).
 * Gọi một lần trước khi mount Canvas; dùng chung THREE.Cache với R3F loaders.
 */
export function preloadGameWorldAssets(): Promise<void> {
  if (preloadPromise) return preloadPromise;
  THREE.Cache.enabled = true;
  const gltfLoader = new GLTFLoader();
  const fbxLoader = new FBXLoader();
  const texLoader = new THREE.TextureLoader();
  preloadPromise = Promise.all([
    ...GLTF_URLS.map((u) => gltfLoader.loadAsync(u).then(() => undefined)),
    ...FBX_URLS.map((u) => fbxLoader.loadAsync(u).then(() => undefined)),
    ...TEXTURE_URLS.map((u) => texLoader.loadAsync(u).then(() => undefined)),
  ]).then(() => undefined);
  return preloadPromise;
}
