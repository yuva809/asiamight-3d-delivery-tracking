import * as THREE from "three";

/** Deterministic PRNG so procedural props are identical on every load. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BoxInstance {
  position: [number, number, number];
  scale: [number, number, number];
  rotationY?: number;
  color?: string;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

/** Write a list of box transforms (and optional colours) into an InstancedMesh. */
export function applyBoxInstances(mesh: THREE.InstancedMesh, items: BoxInstance[]) {
  items.forEach((it, i) => {
    _p.set(...it.position);
    _s.set(...it.scale);
    _q.setFromEuler(_e.set(0, it.rotationY ?? 0, 0));
    _m.compose(_p, _q, _s);
    mesh.setMatrixAt(i, _m);
    if (it.color) mesh.setColorAt(i, _c.set(it.color));
  });
  mesh.count = items.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
}

/** Centre + size of an axis-aligned rect given as [minX, minZ, maxX, maxZ]. */
export function rectToBox(rect: [number, number, number, number]) {
  const [x0, z0, x1, z1] = rect;
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 };
}
