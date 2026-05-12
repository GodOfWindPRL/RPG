import * as THREE from 'three';

const KHR_SPEC_GLOSS = 'KHR_materials_pbrSpecularGlossiness';

type ParserLike = {
  getDependency: (type: string, index: number) => Promise<unknown>;
};

type SpecGlossExt = {
  diffuseFactor?: number[];
  diffuseTexture?: { index: number };
  specularFactor?: number[];
  glossinessFactor?: number;
};

/**
 * GLTFLoader (three-stdlib) không còn plugin cho `KHR_materials_pbrSpecularGlossiness`.
 * Gán diffuse map / màu + roughness gần đúng từ extension để cây/đá có texture.
 */
export function fixGltfSpecularGlossinessMaterials(
  root: THREE.Object3D,
  parser: ParserLike,
): Promise<void> {
  const pending: Promise<void>[] = [];

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
      const ext = mat.userData?.gltfExtensions?.[KHR_SPEC_GLOSS] as SpecGlossExt | undefined;
      if (!ext) continue;

      const df = ext.diffuseFactor;
      if (df && df.length >= 3) {
        mat.color.setRGB(df[0], df[1], df[2], THREE.LinearSRGBColorSpace);
        if (df.length > 3 && df[3] < 1) {
          mat.opacity = df[3];
          mat.transparent = true;
        }
      }

      if (ext.diffuseTexture !== undefined) {
        const idx = ext.diffuseTexture.index;
        pending.push(
          parser.getDependency('texture', idx).then((tex) => {
            const t = tex as THREE.Texture;
            t.colorSpace = THREE.SRGBColorSpace;
            mat.map = t;
            mat.color.setRGB(1, 1, 1);
            mat.needsUpdate = true;
          }),
        );
      }

      const gloss = ext.glossinessFactor ?? 0.5;
      mat.metalness = 0;
      mat.roughness = THREE.MathUtils.clamp(1 - gloss, 0.05, 1);
      const spec = ext.specularFactor;
      if (spec && spec.length >= 3) {
        const avg = (spec[0] + spec[1] + spec[2]) / 3;
        if (avg > 0.2) mat.metalness = THREE.MathUtils.clamp(avg * 0.25, 0, 0.4);
      }
      mat.needsUpdate = true;
    }
  });

  return Promise.all(pending).then(() => undefined);
}
