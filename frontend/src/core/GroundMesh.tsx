import { Suspense, useLayoutEffect, useRef } from 'react';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { MAP_SIZE } from './world';
import groundColorUrl from '../assets/Ground103_1K-JPG/Ground103_1K-JPG_Color.jpg';
import groundAoUrl from '../assets/Ground103_1K-JPG/Ground103_1K-JPG_AmbientOcclusion.jpg';

/** One full texture across entire ground plane (MAP_SIZE × MAP_SIZE). */
const UV_REPEAT_U = 1;
const UV_REPEAT_V = 1;

function GroundFallback() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
      <planeGeometry args={[MAP_SIZE, MAP_SIZE, 1, 1]} />
      <meshStandardMaterial color="#334155" roughness={0.95} metalness={0.02} />
    </mesh>
  );
}

function GroundTextured() {
  const meshRef = useRef<THREE.Mesh>(null);
  const [map, aoMap] = useTexture([groundColorUrl, groundAoUrl]);

  useLayoutEffect(() => {
    for (const tex of [map, aoMap]) {
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.repeat.set(UV_REPEAT_U, UV_REPEAT_V);
      tex.offset.set(0, 0);
      tex.anisotropy = 8;
      tex.needsUpdate = true;
    }
    map.colorSpace = THREE.SRGBColorSpace;
    aoMap.colorSpace = THREE.NoColorSpace;

    const geo = meshRef.current?.geometry as THREE.PlaneGeometry | undefined;
    if (geo?.attributes.uv && !geo.attributes.uv2) {
      geo.setAttribute('uv2', geo.attributes.uv.clone());
    }
  }, [map, aoMap]);

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
      <planeGeometry args={[MAP_SIZE, MAP_SIZE, 1, 1]} />
      <meshStandardMaterial
        map={map}
        roughness={0.88}
        metalness={0.05}
        aoMap={aoMap}
        aoMapIntensity={1.1}
      />
    </mesh>
  );
}

export function GroundMesh() {
  return (
    <Suspense fallback={<GroundFallback />}>
      <GroundTextured />
    </Suspense>
  );
}
