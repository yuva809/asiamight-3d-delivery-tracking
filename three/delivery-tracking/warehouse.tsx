"use client";

import { useFrame } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { DOCK_DOOR, DOCKS, OFFICE, WAREHOUSE } from "@/features/delivery-tracking/scene-layout";
import { InstancedBoxes } from "./instanced-boxes";
import { GEO, MAT, PALETTE } from "./materials";
import { useSceneSettings } from "./scene-settings";
import { withGroundNoise } from "./ground-shading";
import { useSignTexture } from "./sign-texture";
import { boxWorldUV, claddingTexture, doorTexture } from "./textures";
import type { BoxInstance } from "./utils";

const { minX, maxX, minZ, maxZ, height: H, wallThickness: T } = WAREHOUSE;
/** Polished concrete slab with saw-cut joints every 6 m. */
const FLOOR_MAT = withGroundNoise(MAT.floor.clone(), { scale: 0.45, strength: 0.05, joints: 6, jointStrength: 0.08, fadeFar: 160 });
/** Front walls are split here: the lower band (with docks) always stays. */
const CUT = 5.0;
const PLINTH = 1.2;
const COPING = 0.7;
const PERSON_DOOR_X = 9;

interface WallPiece {
  /** centre */
  p: [number, number, number];
  /** size */
  s: [number, number, number];
}

function solidSpans(from: number, to: number, holes: [number, number][]) {
  const spans: [number, number][] = [];
  let cursor = from;
  for (const [a, b] of [...holes].sort((p, q) => p[0] - q[0])) {
    if (a > cursor) spans.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < to) spans.push([cursor, to]);
  return spans;
}

/** One mesh per wall piece with metre-scaled UVs so the cladding ribs tile evenly. */
function Cladding({ pieces, material }: { pieces: WallPiece[]; material: THREE.Material }) {
  const geos = useMemo(() => pieces.map((w) => boxWorldUV(...w.s)), [pieces]);
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos]);
  return (
    <>
      {pieces.map((w, i) => (
        <mesh key={i} position={w.p} geometry={geos[i]} material={material} castShadow receiveShadow />
      ))}
    </>
  );
}

interface WarehouseProps {
  /** Dock ids whose doors are rolled up (a van is loading there). */
  openDocks: string[];
  /** Zone currently highlighted by the order flow (unused here, reserved). */
  onSelect?: () => void;
  selected?: boolean;
}

/**
 * The AsiaMight distribution centre: ribbed red cladding, concrete plinth,
 * clerestory glazing, five docks with shelters and sectional doors, a dock
 * canopy, glazed two-storey office, rooftop plant and solar array.
 */
export const Warehouse = memo(function Warehouse({ openDocks, onSelect, selected = false }: WarehouseProps) {
  const { buildingMode, animate } = useSceneSettings();
  const upperFront = useRef<THREE.Group>(null);
  const rooftop = useRef<THREE.Group>(null);
  const roof = useRef<THREE.Mesh>(null);
  const k = useRef(buildingMode === "exterior" ? 1 : 0);
  const roofOpacity = useRef(buildingMode === "exterior" ? 1 : buildingMode === "operational" ? 0.1 : 0);

  const claddingMat = useMemo(() => {
    const tex = claddingTexture();
    // The rib texture doubles as a bump map so the low sun rakes across the profile.
    const m = new THREE.MeshStandardMaterial({ color: PALETTE.cladding, roughness: 0.5, metalness: 0.2, map: tex, bumpMap: tex, bumpScale: 3 });
    return m;
  }, []);
  const roofMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: PALETTE.roof, roughness: 0.7, metalness: 0.1, transparent: true }),
    [],
  );
  useEffect(() => () => {
    claddingMat.dispose();
    roofMat.dispose();
  }, [claddingMat, roofMat]);

  useFrame((_, dt) => {
    const wantK = buildingMode === "exterior" ? 1 : 0;
    const wantRoof = buildingMode === "exterior" ? 1 : buildingMode === "operational" ? 0.1 : 0;
    const d = Math.min(dt, 0.05);
    k.current = animate ? THREE.MathUtils.damp(k.current, wantK, 4, d) : wantK;
    roofOpacity.current = animate ? THREE.MathUtils.damp(roofOpacity.current, wantRoof, 4, d) : wantRoof;
    if (upperFront.current) {
      upperFront.current.scale.y = Math.max(0.001, k.current);
      upperFront.current.visible = k.current > 0.01;
    }
    if (roof.current) {
      const mat = roof.current.material as THREE.MeshStandardMaterial;
      mat.opacity = roofOpacity.current;
      mat.depthWrite = roofOpacity.current > 0.95;
      roof.current.visible = roofOpacity.current > 0.01;
    }
    if (rooftop.current) rooftop.current.visible = roofOpacity.current > 0.6;
  });

  const walls = useMemo(() => {
    const back: WallPiece[] = [];
    const frontLower: WallPiece[] = [];
    const frontUpper: WallPiece[] = [];
    const W = maxX - minX + 2 * T;
    const D = maxZ - minZ;
    // North + west: full height.
    back.push({ p: [0, H / 2, minZ - T / 2], s: [W, H, T] });
    back.push({ p: [minX - T / 2, H / 2, 0], s: [T, H, D] });
    // East wall behind the office annex: full height.
    back.push({ p: [maxX + T / 2, H / 2, (minZ + OFFICE.maxZ) / 2], s: [T, H, OFFICE.maxZ - minZ] });

    // South wall: docks + personnel door in the lower band.
    const sz = maxZ + T / 2;
    const dockHoles = DOCKS.map((d) => [d.x - DOCK_DOOR.width / 2, d.x + DOCK_DOOR.width / 2] as [number, number]);
    const doorHole: [number, number] = [PERSON_DOOR_X - 0.6, PERSON_DOOR_X + 0.6];
    for (const [a, b] of solidSpans(minX - T, maxX + T, [...dockHoles, doorHole])) {
      frontLower.push({ p: [(a + b) / 2, CUT / 2, sz], s: [b - a, CUT, T] });
    }
    for (const [a, b] of dockHoles) {
      frontLower.push({ p: [(a + b) / 2, (DOCK_DOOR.height + CUT) / 2, sz], s: [b - a, CUT - DOCK_DOOR.height, T] });
    }
    frontLower.push({ p: [PERSON_DOOR_X, (2.4 + CUT) / 2, sz], s: [1.2, CUT - 2.4, T] });
    frontUpper.push({ p: [0, CUT + (H - CUT) / 2, sz], s: [W, H - CUT, T] });

    // East wall, visible part (south of the office annex).
    const ex = maxX + T / 2;
    const ez0 = OFFICE.maxZ;
    frontLower.push({ p: [ex, CUT / 2, (ez0 + maxZ) / 2], s: [T, CUT, maxZ - ez0] });
    frontUpper.push({ p: [ex, CUT + (H - CUT) / 2, (ez0 + maxZ) / 2], s: [T, H - CUT, maxZ - ez0] });
    return { back, frontLower, frontUpper };
  }, []);

  const trims = useMemo(() => {
    const W = maxX - minX + 2 * T + 0.1;
    const D = maxZ - minZ + 0.1;
    const plinthBack: BoxInstance[] = [
      { position: [0, PLINTH / 2, minZ - T / 2], scale: [W, PLINTH, T + 0.1] },
      { position: [minX - T / 2, PLINTH / 2, 0], scale: [T + 0.1, PLINTH, D] },
    ];
    const plinthFront: BoxInstance[] = [];
    const dockHoles = DOCKS.map((d) => [d.x - DOCK_DOOR.width / 2, d.x + DOCK_DOOR.width / 2] as [number, number]);
    for (const [a, b] of solidSpans(minX - T - 0.05, maxX + T + 0.05, [...dockHoles, [PERSON_DOOR_X - 0.6, PERSON_DOOR_X + 0.6]])) {
      plinthFront.push({ position: [(a + b) / 2, PLINTH / 2, maxZ + T / 2], scale: [b - a, PLINTH, T + 0.1] });
    }
    plinthFront.push({ position: [maxX + T / 2, PLINTH / 2, (OFFICE.maxZ + maxZ) / 2], scale: [T + 0.1, PLINTH, maxZ - OFFICE.maxZ] });
    const copingBack: BoxInstance[] = [
      { position: [0, H - COPING / 2, minZ - T / 2], scale: [W, COPING, T + 0.12] },
      { position: [minX - T / 2, H - COPING / 2, 0], scale: [T + 0.12, COPING, D] },
    ];
    const copingFront: BoxInstance[] = [
      { position: [0, H - COPING / 2, maxZ + T / 2], scale: [W, COPING, T + 0.12] },
      { position: [maxX + T / 2, H - COPING / 2, (OFFICE.maxZ + maxZ) / 2], scale: [T + 0.12, COPING, maxZ - OFFICE.maxZ] },
    ];
    // Clerestory ribbon windows on the north and west walls.
    const windows: BoxInstance[] = [];
    for (let x = minX + 2.5; x < maxX - 2; x += 4.2) {
      windows.push({ position: [x + 1.7, 7.6, minZ - T - 0.01], scale: [3.4, 1.1, 0.06] });
    }
    for (let z = minZ + 2.5; z < maxZ - 2; z += 4.2) {
      windows.push({ position: [minX - T - 0.01, 7.6, z + 1.7], scale: [0.06, 1.1, 3.4] });
    }
    return { plinthBack, plinthFront, copingBack, copingFront, windows };
  }, []);

  return (
    <group>
      {/* Floor slab */}
      <mesh
        position={[0, WAREHOUSE.floorY / 2, 0]}
        scale={[maxX - minX + 2 * T, WAREHOUSE.floorY, maxZ - minZ + 2 * T]}
        geometry={GEO.box}
        material={FLOOR_MAT}
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.();
        }}
      />

      <Cladding pieces={walls.back} material={claddingMat} />
      <InstancedBoxes items={trims.plinthBack} material={MAT.plinth} castShadow />
      <InstancedBoxes items={trims.copingBack} material={MAT.wallWhite} castShadow />
      <InstancedBoxes items={trims.windows} material={MAT.glass} />

      <Cladding pieces={walls.frontLower} material={claddingMat} />
      <InstancedBoxes items={trims.plinthFront} material={MAT.plinth} castShadow />
      <mesh position={[PERSON_DOOR_X, 1.2, maxZ + T + 0.02]} scale={[1.1, 2.35, 0.05]} geometry={GEO.box} material={MAT.steelDark} />

      <group ref={upperFront} position={[0, CUT, 0]} scale-y={buildingMode === "exterior" ? 1 : 0.001}>
        <group position={[0, -CUT, 0]}>
          <Cladding pieces={walls.frontUpper} material={claddingMat} />
          <InstancedBoxes items={trims.copingFront} material={MAT.wallWhite} castShadow />
          <FacadeSign />
        </group>
      </group>

      <DockFronts openDocks={openDocks} />
      <DockCanopy />
      <RoofStructure />
      <mesh ref={roof} position={[0, H + 0.12, 0]} scale={[maxX - minX + 2 * T, 0.24, maxZ - minZ + 2 * T]} geometry={GEO.box} material={roofMat} castShadow />
      <group ref={rooftop}>
        <Rooftop />
      </group>
      <OfficeAnnex />

      {selected && (
        <mesh position={[0, 0.3, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[30, 31, 64]} />
          <meshBasicMaterial color={PALETTE.chili} transparent opacity={0.6} />
        </mesh>
      )}
    </group>
  );
});

function FacadeSign() {
  const tex = useSignTexture({
    title: "AsiaMight",
    subtitle: "Distribution Centre Berlin",
    background: "#b93a25",
    foreground: "#fff7ee",
    mark: true,
    markColor: "#fff7ee",
    width: 1024,
    height: 256,
  });
  return (
    <mesh position={[13.5, 7.3, maxZ + T + 0.03]}>
      <planeGeometry args={[14, 3.5]} />
      <meshStandardMaterial map={tex} roughness={0.5} />
    </mesh>
  );
}

const doorMat = new THREE.MeshStandardMaterial({ color: "#f7f7f5", roughness: 0.5, metalness: 0.1 });

/** Dock shelters, sectional doors, levelers, bumpers, lamps and numbers. */
function DockFronts({ openDocks }: { openDocks: string[] }) {
  const { animate } = useSceneSettings();
  const doors = useRef<(THREE.Mesh | null)[]>([]);
  const z = maxZ + T;

  useEffect(() => {
    const tex = doorTexture();
    doorMat.map = tex;
    doorMat.needsUpdate = true;
  }, []);

  useFrame((_, dt) => {
    DOCKS.forEach((d, i) => {
      const m = doors.current[i];
      if (!m) return;
      const target = openDocks.includes(d.id) ? 0.55 : DOCK_DOOR.height;
      const h = animate ? THREE.MathUtils.damp(m.scale.y, target, 3, Math.min(dt, 0.05)) : target;
      m.scale.y = h;
      m.position.y = DOCK_DOOR.height - h / 2;
    });
  });

  const items = useMemo(() => {
    const pads: BoxInstance[] = [];
    const stripes: BoxInstance[] = [];
    const levelers: BoxInstance[] = [];
    const bumpers: BoxInstance[] = [];
    const lamps: BoxInstance[] = [];
    const bollards: BoxInstance[] = [];
    for (const d of DOCKS) {
      const w = DOCK_DOOR.width;
      for (const s of [-1, 1]) {
        pads.push({ position: [d.x + s * (w / 2 + 0.3), (DOCK_DOOR.height + 0.5) / 2, z + 0.4], scale: [0.6, DOCK_DOOR.height + 0.5, 0.8] });
        stripes.push({ position: [d.x + s * (w / 2 + 0.3), 2.3, z + 0.81], scale: [0.12, 3.2, 0.02], color: PALETTE.markingYellow });
        bumpers.push({ position: [d.x + s * 1.15, 0.75, z + 0.18], scale: [0.4, 0.45, 0.36] });
        bollards.push({ position: [d.x + s * 2.35, 0.6, z + 1.3], scale: [0.24, 1.2, 0.24], color: PALETTE.saffron });
      }
      pads.push({ position: [d.x, DOCK_DOOR.height + 0.5, z + 0.4], scale: [w + 1.2, 0.6, 0.8] });
      levelers.push({ position: [d.x, 0.06, z + 0.7], scale: [w - 0.4, 0.06, 1.4], color: "#9aa0a8" });
      levelers.push({ position: [d.x, 0.08, z + 1.45], scale: [w - 0.4, 0.06, 0.14], color: PALETTE.saffron });
      lamps.push({ position: [d.x + 2.3, 4.0, z + 0.6], scale: [0.1, 0.1, 1.1], color: PALETTE.steelDark });
    }
    return { pads, stripes, levelers, bumpers, lamps, bollards };
  }, [z]);

  return (
    <group>
      {DOCKS.map((d, i) => (
        <mesh
          key={d.id}
          ref={(m) => {
            doors.current[i] = m;
          }}
          position={[d.x, DOCK_DOOR.height / 2, maxZ + T / 2]}
          scale={[DOCK_DOOR.width - 0.06, DOCK_DOOR.height, 0.1]}
          geometry={GEO.box}
          material={doorMat}
          castShadow
        />
      ))}
      <InstancedBoxes items={items.pads} material={MAT.plastic} castShadow />
      <InstancedBoxes items={items.stripes} material={MAT.matte} />
      <InstancedBoxes items={items.levelers} material={MAT.matte} receiveShadow />
      <InstancedBoxes items={items.bumpers} material={MAT.rubber} />
      <InstancedBoxes items={items.lamps} material={MAT.matte} />
      <InstancedBoxes items={items.bollards} material={MAT.matte} castShadow />
      {DOCKS.map((d) => (
        <group key={d.id}>
          <mesh position={[d.x + 2.3, 3.95, z + 1.15]} scale={[0.32, 0.18, 0.24]} geometry={GEO.box} material={MAT.lampGlow} />
          <DockNumber n={d.id.replace("D", "")} position={[d.x, DOCK_DOOR.height + 0.5, z + 0.82]} />
        </group>
      ))}
    </group>
  );
}

function DockNumber({ n, position }: { n: string; position: [number, number, number] }) {
  const tex = useSignTexture({ title: n, background: "#ffffff", foreground: "#1d1b18", width: 128, height: 128 });
  return (
    <mesh position={position}>
      <planeGeometry args={[0.5, 0.5]} />
      <meshStandardMaterial map={tex} roughness={0.6} />
    </mesh>
  );
}

function DockCanopy() {
  const x0 = DOCKS[0].x - 3.2;
  const x1 = DOCKS[DOCKS.length - 1].x + 3.2;
  const z = maxZ + T;
  const rods = useMemo<BoxInstance[]>(() => {
    const out: BoxInstance[] = [];
    for (let x = x0 + 1; x <= x1 - 1; x += 5) out.push({ position: [x, 6.4, z + 1.3], scale: [0.06, 0.06, 3.0], rotationY: 0 });
    return out;
  }, [x0, x1, z]);
  return (
    <group>
      <mesh position={[(x0 + x1) / 2, 5.55, z + 1.6]} scale={[x1 - x0, 0.22, 3.2]} geometry={GEO.box} material={MAT.wallWhite} castShadow receiveShadow />
      <mesh position={[(x0 + x1) / 2, 5.5, z + 3.2]} scale={[x1 - x0, 0.42, 0.08]} geometry={GEO.box} material={MAT.steelDark} castShadow />
      <group rotation-x={0.45}>
        <InstancedBoxes items={rods} material={MAT.steel} />
      </group>
    </group>
  );
}

/** Portal frames, purlins and high-bay lights — visible through the translucent roof. */
function RoofStructure() {
  const items = useMemo(() => {
    const frames: BoxInstance[] = [];
    const purlins: BoxInstance[] = [];
    const lights: BoxInstance[] = [];
    const columns: BoxInstance[] = [];
    for (let x = minX + 6; x <= maxX - 6; x += 6) {
      frames.push({ position: [x, H - 0.45, 0], scale: [0.3, 0.6, maxZ - minZ] });
      for (const z of [minZ + 0.4, maxZ - 0.4]) columns.push({ position: [x, H / 2, z], scale: [0.35, H, 0.35] });
    }
    for (let z = minZ + 3; z <= maxZ - 3; z += 4) purlins.push({ position: [0, H - 0.18, z], scale: [maxX - minX, 0.16, 0.14] });
    for (let x = minX + 3; x <= maxX - 3; x += 6) {
      for (let z = minZ + 4; z <= maxZ - 4; z += 6.5) lights.push({ position: [x, H - 0.9, z], scale: [0.18, 0.06, 2.4] });
    }
    return { frames, purlins, lights, columns };
  }, []);
  return (
    <group>
      <InstancedBoxes items={items.frames} material={MAT.steel} castShadow />
      <InstancedBoxes items={items.purlins} material={MAT.steel} />
      <InstancedBoxes items={items.columns} material={MAT.steel} castShadow />
      <InstancedBoxes items={items.lights} material={MAT.lampGlow} />
    </group>
  );
}

const fanGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.08, 20);
const solarMat = new THREE.MeshStandardMaterial({ color: "#2c3b55", roughness: 0.25, metalness: 0.6 });

function Rooftop() {
  const items = useMemo(() => {
    const skylights: BoxInstance[] = [];
    for (let z = minZ + 4; z <= maxZ - 4; z += 7) skylights.push({ position: [-8, H + 0.4, z], scale: [24, 0.35, 1.6] });
    const hvac: BoxInstance[] = [
      { position: [15, H + 1.0, -9], scale: [4, 1.6, 2.6] },
      { position: [15, H + 1.0, -4.5], scale: [4, 1.6, 2.6] },
      { position: [19.5, H + 0.7, 8], scale: [2.4, 1.0, 2.4] },
    ];
    const solar: BoxInstance[] = [];
    for (let x = 6; x <= 21; x += 2.2) {
      for (let z = 1; z <= 12; z += 2.6) solar.push({ position: [x, H + 0.55, z], scale: [2.0, 0.08, 1.2] });
    }
    const vents: BoxInstance[] = [
      { position: [-20, H + 0.6, -10], scale: [0.6, 1.2, 0.6] },
      { position: [-2, H + 0.6, 10], scale: [0.6, 1.2, 0.6] },
      { position: [3, H + 0.6, -11], scale: [0.6, 1.2, 0.6] },
    ];
    return { skylights, hvac, solar, vents };
  }, []);
  return (
    <group>
      <InstancedBoxes items={items.skylights} material={MAT.glassBlue} />
      <InstancedBoxes items={items.hvac} material={MAT.wallWhite} castShadow />
      <InstancedBoxes items={items.vents} material={MAT.steel} castShadow />
      <group rotation-x={0}>
        {items.solar.map((s, i) => (
          <mesh key={i} position={s.position} scale={s.scale} rotation-x={-0.25} geometry={GEO.box} material={solarMat} castShadow />
        ))}
      </group>
      {[-9, -4.5].map((z) => (
        <group key={z}>
          <mesh position={[14, H + 1.85, z]} geometry={fanGeo} material={MAT.steelDark} />
          <mesh position={[16, H + 1.85, z]} geometry={fanGeo} material={MAT.steelDark} />
        </group>
      ))}
    </group>
  );
}

/** Two-storey glazed office + entrance on the east end. */
function OfficeAnnex() {
  const { minX: x0, maxX: x1, minZ: z0, maxZ: z1, height: h } = OFFICE;
  const w = x1 - x0;
  const d = z1 - z0;
  const mullions = useMemo(() => {
    const out: BoxInstance[] = [];
    for (let z = z0; z <= z1 + 0.01; z += 1.75) out.push({ position: [x1 + 0.02, h / 2, z], scale: [0.12, h, 0.12] });
    for (let x = x0 + 0.5; x <= x1 + 0.01; x += 1.75) {
      out.push({ position: [x, h / 2, z1 + 0.02], scale: [0.12, h, 0.12] });
    }
    for (const y of [0.1, 4.0, h - 0.1]) {
      out.push({ position: [x1 + 0.02, y, (z0 + z1) / 2], scale: [0.14, 0.2, d] });
      out.push({ position: [(x0 + x1) / 2, y, z1 + 0.02], scale: [w, 0.2, 0.14] });
    }
    return out;
  }, [x0, x1, z0, z1, h, w, d]);
  const sign = useSignTexture({
    title: "AsiaMight",
    subtitle: "Logistics",
    background: "#1d1b18",
    foreground: "#ffffff",
    mark: true,
    markColor: "#d6472c",
    width: 1024,
    height: 256,
  });
  return (
    <group>
      <mesh position={[(x0 + x1) / 2, h / 2, (z0 + z1) / 2]} scale={[w, h, d]} geometry={GEO.box} material={MAT.glassBlue} castShadow receiveShadow />
      <mesh position={[(x0 + x1) / 2, 4.0, (z0 + z1) / 2]} scale={[w + 0.3, 0.35, d + 0.3]} geometry={GEO.box} material={MAT.wallWhite} castShadow />
      <mesh position={[(x0 + x1) / 2, h + 0.25, (z0 + z1) / 2]} scale={[w + 0.4, 0.5, d + 0.4]} geometry={GEO.box} material={MAT.wallWhite} castShadow />
      <InstancedBoxes items={mullions} material={MAT.wallWhite} />
      {/* Entrance canopy + doors on the east face */}
      <mesh position={[x1 + 1.4, 3.1, -8]} scale={[2.8, 0.22, 4.2]} geometry={GEO.box} material={MAT.wallWhite} castShadow />
      <mesh position={[x1 + 0.06, 1.3, -8]} scale={[0.08, 2.6, 2.2]} geometry={GEO.box} material={MAT.glass} />
      <mesh position={[x1 + 0.3, h + 1.0, (z0 + z1) / 2]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[7, 1.75]} />
        <meshStandardMaterial map={sign} roughness={0.5} />
      </mesh>
    </group>
  );
}
