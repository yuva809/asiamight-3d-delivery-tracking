#!/usr/bin/env node
/**
 * Builds public/geo/berlin.json — the real Berlin geography under the 3D scene.
 *
 *   node scripts/fetch-berlin-geo.mjs
 *
 * Sources (© OpenStreetMap contributors, ODbL):
 *   - Overpass API: roads, buildings, street trees, lamps, water, parks, rail
 *   - OSRM demo server: driving routes warehouse → each branch
 *
 * Everything is projected to a local tangent plane in metres around the
 * warehouse (x = east, z = south) so the browser never touches lat/lon maths
 * for static geometry and needs no network at runtime.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const UA = "AsiaMight-DeliveryTracking-Prototype/0.1 (prototype; contact: yuvaneshlee@gmail.com)";
const OVERPASS = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

// Keep in sync with features/delivery-tracking/geo.ts
const ORIGIN = { lat: 52.4577, lon: 13.3960 };
const SITES = [
  { id: "warehouse", lat: ORIGIN.lat, lon: ORIGIN.lon, radius: 650 },
  { id: "br-hagelberger", lat: 52.4910787, lon: 13.386051, radius: 380 },
  { id: "br-kurfuerstenstrasse", lat: 52.5002045, lon: 13.3615482, radius: 380 },
  { id: "br-rudow", lat: 52.4339711, lon: 13.4690508, radius: 380 },
  { id: "br-spandau", lat: 52.5284, lon: 13.19473, radius: 380 },
];
// Whole operating area (all branches + margin).
const BBOX = { s: 52.415, w: 13.165, n: 52.545, e: 13.495 };
/**
 * Warehouse site placement in scene metres (keep in sync with
 * features/delivery-tracking/scene-layout.ts → SITE). The site sits beside the
 * real access road, rotated to align with it; OSM buildings inside its
 * footprint are removed (placeholder location).
 */
const SITE = { x: 26.05, z: 33.7, rotation: -2.77, minX: -36, maxX: 54, minZ: -26, maxZ: 38, gate: [0, 38] };

const K_LAT = 110540;
const K_LON = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180);
const project = (lat, lon) => [(lon - ORIGIN.lon) * K_LON, -(lat - ORIGIN.lat) * K_LAT];
const r1 = (v) => Math.round(v * 10) / 10;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CACHE_DIR = path.join(process.cwd(), "scripts/.cache");

async function overpass(query, label) {
  const cacheFile = path.join(CACHE_DIR, label.replace(/[^a-z0-9]+/gi, "-") + ".json");
  if (process.env.GEO_CACHE !== "0") {
    try {
      const cached = JSON.parse(await readFile(cacheFile, "utf8"));
      console.log(`  ✓ ${label}: ${cached.length} elements (cache)`);
      return cached;
    } catch {
      /* not cached */
    }
  }
  for (let attempt = 0; attempt < 12; attempt++) {
    const url = OVERPASS[attempt % OVERPASS.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
        signal: AbortSignal.timeout(180_000),
      });
      const text = await res.text();
      if (res.ok && text.startsWith("{")) {
        const json = JSON.parse(text);
        console.log(`  ✓ ${label}: ${json.elements.length} elements (${new URL(url).host})`);
        await mkdir(CACHE_DIR, { recursive: true });
        await writeFile(cacheFile, JSON.stringify(json.elements));
        return json.elements;
      }
      console.warn(`  … ${label}: ${new URL(url).host} → ${res.status}, retrying`);
    } catch (err) {
      console.warn(`  … ${label}: ${new URL(url).host} → ${err.message}, retrying`);
    }
    await sleep(Math.min(30000, 5000 * (attempt + 1)));
  }
  throw new Error(`Overpass failed for ${label}`);
}

// ---------- geometry helpers ----------
function rdp(points, eps) {
  if (points.length < 3) return points;
  const [ax, az] = points[0];
  const [bx, bz] = points[points.length - 1];
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz) || 1e-9;
  let maxD = -1;
  let idx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, pz] = points[i];
    const d = Math.abs(dz * px - dx * pz + bx * az - bz * ax) / len;
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > eps) {
    const left = rdp(points.slice(0, idx + 1), eps);
    const right = rdp(points.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[points.length - 1]];
}

/** RDP for closed rings: split at the farthest vertex so the chord is never zero-length. Returns an open ring. */
function rdpRing(ring, eps) {
  const pts = ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? ring.slice(0, -1) : ring;
  if (pts.length < 4) return pts;
  let far = 1;
  let best = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
    if (d > best) {
      best = d;
      far = i;
    }
  }
  const a = rdp(pts.slice(0, far + 1), eps);
  const b = rdp(pts.slice(far).concat([pts[0]]), eps);
  return a.slice(0, -1).concat(b.slice(0, -1));
}

const flat = (pts) => pts.flatMap(([x, z]) => [r1(x), r1(z)]);
const geomToLocal = (geometry) => geometry.map((p) => project(p.lat, p.lon));

function ringArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % pts.length];
    a += x1 * z2 - x2 * z1;
  }
  return Math.abs(a) / 2;
}

const COS = Math.cos(SITE.rotation);
const SIN = Math.sin(SITE.rotation);
const siteToWorld = ([lx, lz]) => [SITE.x + lx * COS + lz * SIN, SITE.z - lx * SIN + lz * COS];
const inMask = ([x, z], pad = 0) => {
  const dx = x - SITE.x;
  const dz = z - SITE.z;
  const lx = dx * COS - dz * SIN;
  const lz = dx * SIN + dz * COS;
  return lx > SITE.minX - pad && lx < SITE.maxX + pad && lz > SITE.minZ - pad && lz < SITE.maxZ + pad;
};
const unproject = ([x, z]) => ({ lat: ORIGIN.lat - z / K_LAT, lon: ORIGIN.lon + x / K_LON });
const GATE = unproject(siteToWorld(SITE.gate));

/** Join open way segments of a multipolygon into closed rings. */
function stitchRings(segments) {
  const rings = [];
  const pool = segments.filter((s) => s.length > 1).map((s) => s.slice());
  const key = (p) => `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`;
  while (pool.length) {
    let ring = pool.shift();
    let guard = 0;
    while (key(ring[0]) !== key(ring[ring.length - 1]) && guard++ < 5000) {
      const end = key(ring[ring.length - 1]);
      const i = pool.findIndex((s) => key(s[0]) === end || key(s[s.length - 1]) === end);
      if (i < 0) break;
      const seg = pool.splice(i, 1)[0];
      ring = ring.concat(key(seg[0]) === end ? seg.slice(1) : seg.slice(0, -1).reverse());
    }
    if (key(ring[0]) === key(ring[ring.length - 1]) && ring.length >= 4) rings.push(ring);
  }
  return rings;
}

function areaPolygons(elements, minArea, eps) {
  const out = [];
  for (const el of elements) {
    let rings = [];
    if (el.type === "way" && el.geometry) rings = [el.geometry];
    else if (el.type === "relation" && el.members) {
      rings = stitchRings(el.members.filter((m) => m.role !== "inner" && m.geometry).map((m) => m.geometry));
    }
    for (const ring of rings) {
      const local = geomToLocal(ring);
      if (ringArea(local) < minArea) continue;
      const simple = rdpRing(local, eps);
      if (simple.length < 3) continue;
      out.push(flat(simple));
    }
  }
  return out;
}

// ---------- queries ----------
const bb = `${BBOX.s},${BBOX.w},${BBOX.n},${BBOX.e}`;
const around = (s, r = s.radius) => `(around:${r},${s.lat},${s.lon})`;

async function main() {
  console.log("Fetching Berlin geography from OpenStreetMap…");

  const majorEls = await overpass(
    `[out:json][timeout:170];way["highway"~"^(motorway|trunk|primary|secondary)(_link)?$"](${bb});out geom tags;`,
    "major roads",
  );
  await sleep(1500);

  const localRoadQ = SITES.map(
    (s) =>
      `way["highway"~"^(tertiary|tertiary_link|residential|unclassified|living_street|pedestrian|service)$"]["service"!~"parking_aisle|driveway|drive-through"]["access"!~"private|no"]${around(s)};`,
  ).join("");
  const localEls = await overpass(`[out:json][timeout:120];(${localRoadQ});out geom tags;`, "local roads");
  await sleep(1500);

  const bldQ = SITES.map((s) => `way["building"]${around(s, s.radius - 30)};`).join("");
  const bldEls = await overpass(`[out:json][timeout:120];(${bldQ});out geom tags;`, "buildings");
  await sleep(1500);

  const treeQ = SITES.map((s) => `node["natural"="tree"]${around(s)};node["highway"="street_lamp"]${around(s)};`).join("");
  const pointEls = await overpass(`[out:json][timeout:120];(${treeQ});out;`, "trees + lamps");
  await sleep(1500);

  const waterEls = await overpass(
    `[out:json][timeout:170];(way["natural"="water"](${bb});relation["natural"="water"](${bb});way["waterway"="riverbank"](${bb}););out geom tags;`,
    "water areas",
  );
  await sleep(1500);
  const riverEls = await overpass(
    `[out:json][timeout:120];way["waterway"~"^(river|canal)$"](${bb});out geom tags;`,
    "rivers/canals",
  );
  await sleep(1500);
  const greenEls = await overpass(
    `[out:json][timeout:170];(way["leisure"="park"](${bb});relation["leisure"="park"](${bb});way["landuse"~"^(forest|cemetery|allotments|grass|recreation_ground)$"](${bb});relation["landuse"="forest"](${bb});way["natural"="wood"](${bb}););out geom tags;`,
    "parks/green",
  );
  await sleep(1500);
  const railEls = await overpass(
    `[out:json][timeout:120];way["railway"~"^(rail|light_rail)$"]["service"!~"."]["usage"!~"industrial|military|tourism"](${bb});out geom tags;`,
    "rail",
  );

  // ---------- roads ----------
  const CLASS = (hw) => hw.replace("_link", "");
  const majorRoads = [];
  for (const el of majorEls) {
    if (!el.geometry) continue;
    const cls = CLASS(el.tags.highway);
    const local = rdp(geomToLocal(el.geometry), cls === "secondary" ? 7 : 4);
    majorRoads.push({
      c: cls,
      n: cls === "secondary" ? undefined : (el.tags.name ?? undefined),
      l: el.tags.highway.endsWith("_link") ? 1 : undefined,
      o: el.tags.oneway === "yes" ? 1 : undefined,
      p: flat(local),
    });
  }
  const seen = new Set();
  const localRoads = [];
  for (const el of localEls) {
    if (seen.has(el.id) || !el.geometry) continue;
    seen.add(el.id);
    let local = geomToLocal(el.geometry);
    if (local.every((p) => inMask(p, 6))) continue;
    local = rdp(local, 1.2);
    localRoads.push({ c: CLASS(el.tags.highway), n: el.tags.name ?? undefined, p: flat(local) });
  }

  // ---------- buildings ----------
  const seenB = new Set();
  const buildings = [];
  for (const el of bldEls) {
    if (seenB.has(el.id) || !el.geometry || el.geometry.length < 4) continue;
    seenB.add(el.id);
    const local = geomToLocal(el.geometry);
    if (local.some((p) => inMask(p, 4))) continue;
    if (ringArea(local) < 12) continue;
    const t = el.tags;
    let h = Number.parseFloat(t.height);
    if (!Number.isFinite(h)) {
      const lv = Number.parseFloat(t["building:levels"]);
      if (Number.isFinite(lv)) h = lv * 3.2 + 1;
    }
    if (!Number.isFinite(h)) {
      const b = t.building;
      h = /garage|shed|hut|roof|carport|kiosk/.test(b) ? 3.5 : /industrial|warehouse|retail|commercial|supermarket/.test(b) ? 9 : 16;
    }
    const ring = rdpRing(local, 0.6);
    if (ring.length < 3) continue;
    buildings.push({ h: Math.round(Math.min(h, 80) * 10) / 10, p: flat(ring) });
  }

  // ---------- points ----------
  const trees = [];
  const lamps = [];
  const seenP = new Set();
  for (const el of pointEls) {
    if (seenP.has(el.id)) continue;
    seenP.add(el.id);
    const p = project(el.lat, el.lon);
    if (inMask(p, 2)) continue;
    if (el.tags?.natural === "tree") trees.push(r1(p[0]), r1(p[1]));
    else lamps.push(r1(p[0]), r1(p[1]));
  }

  // ---------- areas ----------
  const water = areaPolygons(waterEls, 2500, 6);
  const green = areaPolygons(greenEls, 15000, 8).filter((poly) => !inMask([poly[0], poly[1]]));
  const rivers = riverEls
    .filter((el) => el.geometry)
    .map((el) => ({ c: el.tags.waterway, n: el.tags.name ?? undefined, p: flat(rdp(geomToLocal(el.geometry), 6)) }));
  const rail = railEls.filter((el) => el.geometry).map((el) => flat(rdp(geomToLocal(el.geometry), 5)));

  // ---------- routes (OSRM) ----------
  console.log("Fetching driving routes (OSRM)…");
  const routes = [];
  for (const s of SITES.slice(1)) {
    const url = `https://router.project-osrm.org/route/v1/driving/${GATE.lon},${GATE.lat};${s.lon},${s.lat}?overview=full&geometries=geojson&steps=false`;
    let data = null;
    for (let i = 0; i < 4 && !data; i++) {
      try {
        const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
        if (res.ok) data = await res.json();
      } catch {
        /* retry */
      }
      if (!data) await sleep(2500);
    }
    if (!data?.routes?.length) throw new Error(`OSRM failed for ${s.id}`);
    const r = data.routes[0];
    const local = rdp(
      r.geometry.coordinates.map(([lon, lat]) => project(lat, lon)),
      1.5,
    );
    routes.push({
      branchId: s.id,
      distance: Math.round(r.distance),
      duration: Math.round(r.duration),
      p: flat(local),
      start: flat([project(data.waypoints[0].location[1], data.waypoints[0].location[0])]),
      end: flat([project(data.waypoints[1].location[1], data.waypoints[1].location[0])]),
    });
    console.log(`  ✓ route → ${s.id}: ${(r.distance / 1000).toFixed(1)} km, ${Math.round(r.duration / 60)} min`);
    await sleep(1200);
  }

  const out = {
    meta: {
      origin: ORIGIN,
      bbox: BBOX,
      site: SITE,
      sites: SITES.map(({ id, lat, lon, radius }) => ({ id, lat, lon, radius, xz: flat([project(lat, lon)]) })),
      attribution: "© OpenStreetMap contributors (ODbL) · routes © OSRM",
      generatedAt: new Date().toISOString(),
    },
    majorRoads,
    localRoads,
    buildings,
    trees,
    lamps,
    water,
    green,
    rivers,
    rail,
    routes,
  };

  const file = path.join(process.cwd(), "public/geo/berlin.json");
  await mkdir(path.dirname(file), { recursive: true });
  const json = JSON.stringify(out);
  await writeFile(file, json);
  console.log(
    `\nWrote ${file} — ${(json.length / 1024).toFixed(0)} KB · roads ${majorRoads.length}+${localRoads.length} · buildings ${buildings.length} · trees ${trees.length / 2} · lamps ${lamps.length / 2} · water ${water.length} · green ${green.length} · rail ${rail.length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
