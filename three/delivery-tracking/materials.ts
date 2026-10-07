import * as THREE from "three";

/**
 * Shared palette + materials. High-key "architectural model" look: pale
 * ground, light roads, white buildings — the AsiaMight warehouse and vans
 * carry the only saturated colour, so they read instantly.
 */
export const PALETTE = {
  sky: "#eef0f3",
  ground: "#dddbd5",
  groundCity: "#e7e6e2",
  park: "#c6dbb6",
  water: "#a3c4dd",
  rail: "#a8a6b0",

  road: "#a7aab6",
  roadMajor: "#9a9eac",
  roadMotorway: "#8c91a1",
  sidewalk: "#e6e5e1",
  curb: "#e1e0dc",
  marking: "#ffffff",
  markingYellow: "#f0b84a",

  lot: "#d5d6da",
  yard: "#c4c6cd",

  building: "#eff1f4",
  buildingRoof: "#dfe3e8",

  cladding: "#c8432d",
  claddingDark: "#a93622",
  wallWhite: "#f5f4f1",
  plinth: "#a7a8ad",
  roof: "#dcdde2",
  steel: "#8b919a",
  steelDark: "#4c525b",
  floor: "#e3e2de",

  chili: "#d6472c",
  saffron: "#e8a530",
  jade: "#3f8a5f",
  indigo: "#3e4e77",
  ink: "#1d1b18",
  mist: "#f3ecdd",

  kraft: "#cfa671",
  kraftDark: "#b98d58",
  pallet: "#c3a57c",
  tote: "#4c6fb3",
  glass: "#2f3d4b",
  rubber: "#27292d",
  skin: "#d7a17a",
  foliage: "#86b07a",
  trunk: "#8a7560",
} as const;

function std(color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });
}

export const MAT = {
  lot: std(PALETTE.lot, { roughness: 0.95 }),
  yard: std(PALETTE.yard, { roughness: 0.95 }),
  sidewalk: std(PALETTE.sidewalk, { roughness: 0.95 }),
  marking: std(PALETTE.marking, { roughness: 0.6 }),
  markingYellow: std(PALETTE.markingYellow, { roughness: 0.6 }),

  wallWhite: std(PALETTE.wallWhite, { roughness: 0.7 }),
  plinth: std(PALETTE.plinth, { roughness: 0.9 }),
  roof: std(PALETTE.roof, { roughness: 0.65, metalness: 0.1 }),
  steel: std(PALETTE.steel, { roughness: 0.45, metalness: 0.5 }),
  steelDark: std(PALETTE.steelDark, { roughness: 0.5, metalness: 0.4 }),
  floor: std(PALETTE.floor, { roughness: 0.55 }),

  chili: std(PALETTE.chili, { roughness: 0.55 }),
  saffron: std(PALETTE.saffron, { roughness: 0.55 }),
  jade: std(PALETTE.jade, { roughness: 0.55 }),
  indigo: std(PALETTE.indigo, { roughness: 0.55 }),
  ink: std(PALETTE.ink, { roughness: 0.6 }),
  white: std("#fbfaf8", { roughness: 0.4 }),
  /** Neutral base for instanced meshes that carry per-instance colours. */
  matte: std("#ffffff", { roughness: 0.85 }),
  satin: std("#ffffff", { roughness: 0.45, metalness: 0.05 }),

  kraft: std(PALETTE.kraft),
  pallet: std(PALETTE.pallet),
  glass: std(PALETTE.glass, { roughness: 0.08, metalness: 0.75 }),
  glassBlue: std("#5d7891", { roughness: 0.06, metalness: 0.8 }),
  glassLight: std("#b9cad8", { roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.32, depthWrite: false }),
  wrap: std("#e9eef3", { roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.4, depthWrite: false }),
  rubber: std(PALETTE.rubber, { roughness: 0.9 }),
  plastic: std("#3a3d43", { roughness: 0.7 }),
  skin: std(PALETTE.skin, { roughness: 0.8 }),
  foliage: std(PALETTE.foliage, { roughness: 1 }),
  trunk: std(PALETTE.trunk, { roughness: 1 }),
  headlight: std("#fffaf0", { emissive: "#fff3d6", emissiveIntensity: 1.7, roughness: 0.2 }),
  taillight: std("#c0251c", { emissive: "#e0301f", emissiveIntensity: 1.3, roughness: 0.3 }),
  lampGlow: std("#fff6e0", { emissive: "#ffe6b0", emissiveIntensity: 1.9, roughness: 0.3 }),
} as const;

/** Unit geometries reused everywhere — scale the mesh, not the geometry. */
export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  plane: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 18),
  sphere: new THREE.SphereGeometry(1, 20, 14),
} as const;
