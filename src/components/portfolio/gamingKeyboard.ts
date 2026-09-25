import * as THREE from 'three';
import gsap from 'gsap';
import {
  heightCanvasToNormalTexture,
  createNoiseRoughnessMap,
  roundRectPath,
} from './pbr';

/**
 * Procedural "gaming keyboard" built on top of the room.glb Keyboard deck.
 * The original mesh is a plain dark slab — this module adds:
 *  - an ANSI-style 60% key layout (~75 keycaps) with real legends
 *  - legends drawn into one shared canvas atlas used as BOTH the base map
 *    and the emissive map, so each glyph shines in the animated RGB color
 *    (shine-through backlit keycaps) while the cap body stays dark
 *  - a matching normal-map atlas: every cell carries a rounded-rect bevel
 *    height field (plus a subtle center dish, like real PBT caps) converted
 *    to tangent-space normals — the caps get real depth and edges instead
 *    of reading as flat tapered boxes
 *  - a shared micro-noise roughness map so the plastic sheen varies across
 *    each cap (manufactured, not shader-perfect)
 *  - an RGB underglow point light that spills onto the desk
 *  - a typing animation (press bursts / single idle "ghost" presses)
 *
 * Orientation notes (room layout): the desk is viewed from the +X side, so
 * the viewer's left/right runs along -Z/+Z and rows run along X with row 0
 * (the number row) on the far side. Columns are therefore emitted starting
 * at max.z (viewer's left) and keycap legends are UV-mapped so their
 * left-to-right axis follows the viewer's right (-Z) and their up axis
 * points away from the viewer (-X).
 */

export interface GamingKeyboard {
  group: THREE.Group;
  update: (dt: number, elapsed: number, dark: boolean) => void;
  pressRandomKey: () => string;
  burst: (onPress?: (label: string) => void, count?: number) => void;
  dispose: () => void;
}

interface KeyCap {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  label: string;
  col: number;
  row: number;
  baseY: number;
  flash: number;
  pressed: boolean;
}

interface KeyDef {
  label: string;
  units: number;
}

function k(label: string, units = 1): KeyDef {
  return { label, units };
}

const ARROWS = new Set(['\u2190', '\u2192', '\u2193', '\u2191']);

// ANSI-style 60% layout — every row MUST sum to exactly the same total
// (15 key units). The bottom row is the standard arrow-cluster variant:
// 1.25 / 1.25 / 1.25 / 6.25u spacebar / 1 / 1 then the ← ↓ → triad.
const LAYOUT: KeyDef[][] = [
  [
    k('ESC'),
    k('1'), k('2'), k('3'), k('4'), k('5'), k('6'), k('7'), k('8'), k('9'), k('0'),
    k('-'), k('='),
    k('BKSP', 2),
  ],
  [
    k('TAB', 1.5),
    k('Q'), k('W'), k('E'), k('R'), k('T'), k('Y'), k('U'), k('I'), k('O'), k('P'),
    k('['), k(']'),
    k('\\', 1.5),
  ],
  [
    k('CAPS', 1.75),
    k('A'), k('S'), k('D'), k('F'), k('G'), k('H'), k('J'), k('K'), k('L'),
    k(';'), k("'"),
    k('ENTER', 2.25),
  ],
  [
    k('SHIFT', 2.25),
    k('Z'), k('X'), k('C'), k('V'), k('B'), k('N'), k('M'),
    k(','), k('.'), k('/'),
    k('\u2191'),
    k('SHIFT', 1.75),
  ],
  [
    k('CTRL', 1.25), k('WIN', 1.25), k('ALT', 1.25), k('SPACE', 6.25),
    k('ALT'), k('FN'),
    k('\u2190'), k('\u2193'), k('\u2192'),
  ],
];

// ---------------------------------------------------------------------------
// Legend atlas — one 1024x1024 canvas, 8x8 cells of 128px
// ---------------------------------------------------------------------------

const ATLAS_COLS = 8;
const ATLAS_ROWS = 8;
const CELL = 128;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

interface CellRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

interface LegendAtlas {
  texture: THREE.CanvasTexture;
  normalTexture: THREE.CanvasTexture;
  rects: Map<string, CellRect>;
  blank: CellRect;
  dispose: () => void;
}

function drawArrowGlyph(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  arrow: string
): void {
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;
  const s = 30;
  c.beginPath();
  switch (arrow) {
    case '\u2190': // left
      c.moveTo(cx - s, cy);
      c.lineTo(cx + s * 0.7, cy - s * 0.8);
      c.lineTo(cx + s * 0.7, cy + s * 0.8);
      break;
    case '\u2192': // right
      c.moveTo(cx + s, cy);
      c.lineTo(cx - s * 0.7, cy - s * 0.8);
      c.lineTo(cx - s * 0.7, cy + s * 0.8);
      break;
    case '\u2191': // up
      c.moveTo(cx, cy - s);
      c.lineTo(cx - s * 0.8, cy + s * 0.7);
      c.lineTo(cx + s * 0.8, cy + s * 0.7);
      break;
    default: // down
      c.moveTo(cx, cy + s);
      c.lineTo(cx - s * 0.8, cy - s * 0.7);
      c.lineTo(cx + s * 0.8, cy - s * 0.7);
      break;
  }
  c.closePath();
  c.fill();
}

function drawCell(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string | null
): void {
  // cap body color (dark) — brighter than black so the RGB emissive map
  // gives the caps a faint tint while glyphs glow at full strength
  c.fillStyle = '#1d1d29';
  c.fillRect(x, y, CELL, CELL);

  if (!label || label === 'SPACE') return;

  c.fillStyle = '#eaecf4';

  if (ARROWS.has(label)) {
    drawArrowGlyph(c, x, y, label);
    return;
  }

  const len = label.length;
  const size = len <= 1 ? 62 : len === 2 ? 44 : len === 3 ? 32 : 25;
  c.font = `bold ${size}px ${MONO}`;
  c.textBaseline = 'middle';
  if (len >= 3) {
    // words (ESC, TAB, CAPS...) sit bottom-left like real modifier caps
    c.textAlign = 'left';
    c.fillText(label, x + 16, y + CELL - 26);
  } else {
    c.textAlign = 'center';
    c.fillText(label, x + CELL / 2, y + CELL / 2 + 3);
  }
}

function buildLegendAtlas(): LegendAtlas {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * CELL;
  canvas.height = ATLAS_ROWS * CELL;
  const c = canvas.getContext('2d');
  if (!c) {
    throw new Error('2D canvas context unavailable');
  }

  const w = canvas.width;
  const h = canvas.height;

  function rectFor(index: number): CellRect {
    const col = index % ATLAS_COLS;
    const row = Math.floor(index / ATLAS_COLS);
    return {
      u0: (col * CELL) / w,
      u1: ((col + 1) * CELL) / w,
      // flipY texture convention: v = 1 is the canvas top edge
      v0: 1 - ((row + 1) * CELL) / h,
      v1: 1 - (row * CELL) / h,
    };
  }

  // unique labels (the spacebar keeps a blank cap)
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const row of LAYOUT) {
    for (const key of row) {
      if (key.label === 'SPACE' || seen.has(key.label)) continue;
      seen.add(key.label);
      labels.push(key.label);
    }
  }

  labels.forEach((label, i) => {
    drawCell(c, (i % ATLAS_COLS) * CELL, Math.floor(i / ATLAS_COLS) * CELL, label);
  });

  const blankIndex = labels.length;
  drawCell(
    c,
    (blankIndex % ATLAS_COLS) * CELL,
    Math.floor(blankIndex / ATLAS_COLS) * CELL,
    null
  );

  const rects = new Map<string, CellRect>();
  labels.forEach((label, i) => rects.set(label, rectFor(i)));

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  const normalTexture = buildNormalAtlas();
  normalTexture.anisotropy = 8;

  return {
    texture,
    normalTexture,
    rects,
    blank: rectFor(blankIndex),
    dispose: () => {
      texture.dispose();
      normalTexture.dispose();
    },
  };
}

/**
 * Normal-map atlas on the same grid as the legends: every cell carries a
 * rounded-rect bevel height field (dense steps near the edge approximate a
 * rounded profile) with a gentle center dish like a real PBT keycap. The
 * height canvas is Sobel-converted to tangent-space normals (pbr.ts), and
 * because the keycap top-face UVs already address atlas cells, the bevels
 * align perfectly with each cap's edges.
 */
function buildNormalAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * CELL;
  canvas.height = ATLAS_ROWS * CELL;
  const c = canvas.getContext('2d')!;

  const margin = CELL * 0.11; // flat gap between neighbouring caps
  const bevel = CELL * 0.13; // ramp width inside the plateau edge
  const radius = CELL * 0.14;

  for (let row = 0; row < ATLAS_ROWS; row++) {
    for (let col = 0; col < ATLAS_COLS; col++) {
      const x0 = col * CELL;
      const y0 = row * CELL;

      // base height: fully recessed (the gap between caps)
      c.fillStyle = '#000000';
      c.fillRect(x0, y0, CELL, CELL);

      // the plateau ramp — a rounded rect drawn at N insets with a
      // quadratic spacing (denser toward the edge = rounded bevel)
      const steps = 16;
      c.fillStyle = `rgba(255,255,255,${1 / steps})`;
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const inset = margin + bevel * Math.pow(t, 1.6);
        c.beginPath();
        roundRectPath(
          c,
          x0 + inset,
          y0 + inset,
          CELL - inset * 2,
          CELL - inset * 2,
          Math.max(2, radius * (1 - t * 0.55))
        );
        c.fill();
      }

      // center dish — real keycaps scoop in the middle; a soft dark
      // radial gradient lowers the plateau height toward the center so
      // the normals tilt gently inward around the scoop
      const cx = x0 + CELL / 2;
      const cy = y0 + CELL / 2;
      const g = c.createRadialGradient(
        cx,
        cy,
        CELL * 0.08,
        cx,
        cy,
        CELL * 0.34
      );
      g.addColorStop(0, 'rgba(0,0,0,0.22)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(x0, y0, CELL, CELL);
    }
  }

  return heightCanvasToNormalTexture(
    canvas,
    1.9,
    THREE.ClampToEdgeWrapping
  );
}

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------

// keycaps are wider at the bottom than the top — fake it by pinching the
// upper vertices of a plain box
const TAPER = 0.76;

function taperedBoxGeo(w: number, h: number, d: number): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  // BoxGeometry always owns a plain BufferAttribute — cast for getX/setX
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0) {
      pos.setX(i, pos.getX(i) * TAPER);
      pos.setZ(i, pos.getZ(i) * TAPER);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

export function createGamingKeyboard(deck: THREE.Mesh): GamingKeyboard {
  // world-space bounds of the deck (called before any responsive scaling,
  // and the deck chain has identity rotation/scale in room.glb)
  const worldBox = new THREE.Box3().setFromObject(deck);
  const min = deck.worldToLocal(worldBox.min.clone());
  const max = deck.worldToLocal(worldBox.max.clone());

  const sizeX = max.x - min.x; // short axis (rows, front-to-back)
  const sizeZ = max.z - min.z; // long axis (columns, left-to-right)
  const topY = Math.max(min.y, max.y);

  // defensive: derive the pitch from the WIDEST row so a layout typo can
  // never push keycaps past the edge of the deck — every row must fit
  const rowUnits = LAYOUT.map((r) => r.reduce((s, key) => s + key.units, 0));
  const totalUnits = Math.max(...rowUnits);
  const pitchZ = sizeZ / totalUnits;
  const pitchX = sizeX / LAYOUT.length;
  const capH = Math.min(0.0075, pitchX * 0.3);

  const group = new THREE.Group();
  group.name = 'KeyboardRGB';
  deck.add(group);

  const keys: KeyCap[] = [];
  const disposables: Array<{ dispose(): void }> = [];
  const atlas = buildLegendAtlas();
  disposables.push(atlas);

  // shared micro-noise roughness map — the keycap UVs address atlas cells,
  // so each cap automatically samples its own region of the noise and the
  // plastic sheen varies key to key like a real set
  const noiseRoughness = createNoiseRoughnessMap(256);
  disposables.push(noiseRoughness);

  const geoCache = new Map<string, THREE.BoxGeometry>();

  function baseGeo(capX: number, keyZ: number): THREE.BoxGeometry {
    const key = `${capX.toFixed(4)}|${keyZ.toFixed(4)}`;
    let geo = geoCache.get(key);
    if (!geo) {
      geo = taperedBoxGeo(capX, capH, keyZ);
      geoCache.set(key, geo);
      disposables.push(geo);
    }
    return geo;
  }

  function setKeyUVs(
    geo: THREE.BufferGeometry,
    capX: number,
    keyZ: number,
    rect: CellRect
  ): void {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    // the tapered top face only spans TAPER x the full footprint
    const halfX = (capX * TAPER) / 2;
    const halfZ = (keyZ * TAPER) / 2;
    const blankU = (atlas.blank.u0 + atlas.blank.u1) / 2;
    const blankV = (atlas.blank.v0 + atlas.blank.v1) / 2;
    const inset = 0.04;

    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > 0) {
        // top face: u runs toward the viewer's right (-Z), v toward the
        // top of the legend (away from the viewer, -X)
        const fx = THREE.MathUtils.clamp(pos.getX(i) / halfX, -1, 1);
        const fz = THREE.MathUtils.clamp(pos.getZ(i) / halfZ, -1, 1);
        const u = inset + ((1 - fz) / 2) * (1 - 2 * inset);
        const v = inset + ((1 - fx) / 2) * (1 - 2 * inset);
        uv.setXY(
          i,
          rect.u0 + u * (rect.u1 - rect.u0),
          rect.v0 + v * (rect.v1 - rect.v0)
        );
      } else {
        // sides + bottom sample the blank cell
        uv.setXY(i, blankU, blankV);
      }
    }
    uv.needsUpdate = true;
  }

  function addKey(
    x: number,
    z: number,
    keySizeZ: number,
    col: number,
    row: number,
    rect: CellRect,
    label: string
  ): void {
    const capX = pitchX * 0.74;
    const geo = baseGeo(capX, keySizeZ).clone();
    setKeyUVs(geo, capX, keySizeZ, rect);
    disposables.push(geo);

    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: atlas.texture,
      emissiveMap: atlas.texture,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0,
      // PBR keycap surface: real bevels + dish from the normal atlas,
      // micro-variance from the shared noise — reads as moulded plastic
      normalMap: atlas.normalTexture,
      normalScale: new THREE.Vector2(0.65, 0.65),
      roughnessMap: noiseRoughness,
      roughness: 0.62,
      metalness: 0.05,
    });

    const mesh = new THREE.Mesh(geo, material);
    mesh.name = 'KeyboardKey';
    mesh.position.set(x, topY + capH / 2 - 0.0008, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    keys.push({
      mesh,
      material,
      label,
      col,
      row,
      baseY: mesh.position.y,
      flash: 0,
      pressed: false,
    });
  }

  // emit columns from the viewer's left (max.z) toward the right (min.z)
  LAYOUT.forEach((rowKeys, r) => {
    const x = min.x + pitchX * (r + 0.5);
    let z = max.z;
    let col = 0;
    for (const key of rowKeys) {
      const w = key.units * pitchZ;
      const rect =
        key.label === 'SPACE'
          ? atlas.blank
          : atlas.rects.get(key.label) ?? atlas.blank;
      addKey(x, z - w / 2, w - pitchZ * 0.18, col, r, rect, key.label);
      z -= w;
      col += key.units;
    }
  });

  // RGB underglow spilling onto the desk
  const glow = new THREE.PointLight(0xff0044, 0.5, Math.max(sizeX, sizeZ) * 1.4);
  glow.position.set((min.x + max.x) / 2, topY + 0.06, (min.z + max.z) / 2);
  group.add(glow);

  function update(dt: number, elapsed: number, dark: boolean): void {
    const boost = dark ? 1.35 : 0.55;
    for (const key of keys) {
      if (key.flash > 0) key.flash = Math.max(0, key.flash - dt * 2.2);
      const hue =
        (((key.col * 0.045 + key.row * 0.13 - elapsed * 0.09) % 1) + 1) % 1;
      key.material.emissive.setHSL(hue, 0.95, 0.5);
      const wave =
        0.5 + 0.22 * Math.sin(elapsed * 2.4 + key.col * 0.7 + key.row * 0.9);
      // flash stays vivid in both themes so presses read clearly
      key.material.emissiveIntensity = wave * boost + key.flash * 3.4;
    }
    glow.color.setHSL(((elapsed * 0.06) % 1 + 1) % 1, 0.85, 0.5);
    // brighter in light mode than before — the gaming desk is dark now,
    // so the RGB spill reads clearly in BOTH themes
    glow.intensity = dark ? 1.0 : 0.7;
  }

  function pressKey(key: KeyCap): void {
    if (key.pressed) return;
    key.pressed = true;
    key.flash = 1;
    gsap.to(key.mesh.position, {
      y: key.baseY - 0.0042,
      duration: 0.05,
      ease: 'power2.in',
      onComplete: () => {
        gsap.to(key.mesh.position, {
          y: key.baseY,
          duration: 0.16,
          ease: 'power2.out',
          onComplete: () => {
            key.pressed = false;
          },
        });
      },
    });
  }

  function pressRandomKey(): string {
    if (keys.length === 0) return '';
    const key = keys[Math.floor(Math.random() * keys.length)];
    pressKey(key);
    return key.label;
  }

  function burst(
    onPress?: (label: string) => void,
    count?: number
  ): void {
    const n = count ?? 16 + Math.floor(Math.random() * 12);
    for (let i = 0; i < n; i++) {
      gsap.delayedCall(i * 0.055 + Math.random() * 0.025, () => {
        onPress?.(pressRandomKey());
      });
    }
  }

  function dispose(): void {
    disposables.forEach((d) => d.dispose());
    keys.forEach((key) => key.material.dispose());
  }

  return { group, update, pressRandomKey, burst, dispose };
}
