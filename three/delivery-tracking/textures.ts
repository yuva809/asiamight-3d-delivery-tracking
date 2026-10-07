import * as THREE from "three";

/**
 * Small procedural textures (no image assets). Created lazily on the client.
 */

let cladding: THREE.CanvasTexture | null = null;
let door: THREE.CanvasTexture | null = null;

/** Trapezoidal steel cladding ribs, ~0.9 m period, tinted by material colour. */
export function claddingTexture() {
  if (cladding) return cladding;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 8;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.55, "#f4f4f4");
  grad.addColorStop(0.62, "#c9c9c9");
  grad.addColorStop(0.7, "#dedede");
  grad.addColorStop(0.86, "#ffffff");
  grad.addColorStop(1, "#ffffff");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 8);
  cladding = new THREE.CanvasTexture(c);
  cladding.wrapS = cladding.wrapT = THREE.RepeatWrapping;
  cladding.repeat.set(1 / 0.9, 1);
  cladding.colorSpace = THREE.SRGBColorSpace;
  cladding.anisotropy = 8;
  return cladding;
}

/** Sectional dock door: horizontal panels every ~0.6 m with a window band. */
export function doorTexture() {
  if (door) return door;
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 16, 256);
  const panels = 7;
  for (let i = 1; i < panels; i++) {
    const y = (i / panels) * 256;
    g.fillStyle = "#cfd2d6";
    g.fillRect(0, y - 2, 16, 3);
    g.fillStyle = "#fafafa";
    g.fillRect(0, y + 1, 16, 1);
  }
  // Vision panel row.
  g.fillStyle = "#6f8193";
  g.fillRect(0, (2 / panels) * 256 + 10, 16, 14);
  door = new THREE.CanvasTexture(c);
  door.wrapS = THREE.RepeatWrapping;
  door.colorSpace = THREE.SRGBColorSpace;
  return door;
}

/**
 * Box geometry whose UVs are in metres (so tiling textures keep their real
 * scale on boxes of any size). Face order: +x, -x, +y, -y, +z, -z.
 */
export function boxWorldUV(w: number, h: number, d: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
    }
  }
  uv.needsUpdate = true;
  return g;
}
