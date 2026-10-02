import * as THREE from 'three';

/**
 * Recursively dispose geometries / materials / textures of an object tree so
 * recycled content never leaks GPU memory.
 */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material as
      | THREE.Material
      | THREE.Material[]
      | undefined;
    if (Array.isArray(material)) {
      material.forEach((m) => disposeMaterial(m));
    } else if (material) {
      disposeMaterial(material);
    }
  });
}

function disposeMaterial(material: THREE.Material): void {
  // Dispose every texture slot that exists on the material.
  const mat = material as THREE.Material & Record<string, unknown>;
  for (const key of Object.keys(mat)) {
    const value = mat[key];
    if (value && value instanceof THREE.Texture) {
      value.dispose();
    }
  }
  material.dispose();
}

export function disposeRenderTarget(target: THREE.RenderTarget | null): void {
  target?.dispose();
}
