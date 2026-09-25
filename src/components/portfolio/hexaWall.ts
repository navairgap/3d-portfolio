import * as THREE from 'three';
import { heightCanvasToNormalTexture } from './pbr';

/**
 * Procedural honeycomb wall textures — a detailed embossed hex-panel wall
 * for the daylight look (map + normalMap) and a neon LED honeycomb for the
 * night look (emissiveMap), in the spirit of hex gaming-room wall panels.
 *
 * All canvases render the SAME pointy-top honeycomb lattice so the
 * embossed grooves and the neon edges line up exactly. The canvas is a
 * true lattice period horizontally (6 columns) and vertically (3 periods,
 * rounded to whole pixels — the sub-pixel seam is invisible under the
 * wide strokes), and every hexagon is additionally drawn at the 9 wrap
 * offsets so the textures tile seamlessly with RepeatWrapping.
 *
 * Detail passes on the map: per-panel brightness variation, groove
 * shadow + highlight strokes (fake bevel), an inner AO edge inside each
 * panel, paint-speck micro noise, and a matching normalMap (Sobel-converted
 * from the groove height field) so the panels carry REAL bevels that catch
 * light from every direction — a proper PBR surface, not a painted bump.
 * The emissive map adds LED junction nodes at every lattice vertex,
 * per-cell aura variance and a few faintly backlit panels — the little
 * imperfections that make LED walls read real instead of printed.
 *
 * The floor/ceiling faces of the room shell are pinned to the uv
 * origin, which is the interior of the hexagon at lattice (0, 0) —
 * plain base color, no lines (see PortfolioExperience).
 */

const CANVAS_W = 1024;
const COLUMNS = 6; // hexagon columns per tile — one horizontal lattice period
const HEX_W = CANVAS_W / COLUMNS; // hex flat-to-flat width, px
const R = HEX_W / Math.sqrt(3); // circumradius (pointy-top)
const ROW_H = 1.5 * R; // vertical distance between hex row centers
const CANVAS_H = Math.round(3 * 2 * ROW_H); // 3 vertical lattice periods

// deterministic per-cell hashes -> 0..1 (stable across renders).
// PERIODIC in the lattice so wrap-drawn copies of a cell carry the same
// parameters as the cell they cover — otherwise the tile would seam.
function cellNoise(col: number, row: number): number {
  const c = ((col % COLUMNS) + COLUMNS) % COLUMNS;
  const r6 = ((row % 6) + 6) % 6;
  const s = Math.sin(c * 127.1 + r6 * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function cellNoise2(col: number, row: number): number {
  const c = ((col % COLUMNS) + COLUMNS) % COLUMNS;
  const r6 = ((row % 6) + 6) % 6;
  const s = Math.sin(c * 269.5 + r6 * 183.3) * 4331.7123;
  return s - Math.floor(s);
}

function hexPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number
): void {
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 2 + (k * Math.PI) / 3; // pointy-top
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// draw every hexagon of the infinite lattice that lands near the
// canvas, each one at the 9 wrap offsets — the union restricted to the
// canvas is exactly the CANVAS_W x CANVAS_H periodic pattern
function strokeLattice(
  ctx: CanvasRenderingContext2D,
  paint: (ctx: CanvasRenderingContext2D, col: number, row: number) => void
): void {
  const offsets = [-CANVAS_W, 0, CANVAS_W].flatMap((dx) =>
    [-CANVAS_H, 0, CANVAS_H].map((dy) => [dx, dy])
  );
  for (let row = -2; row <= Math.ceil(CANVAS_H / ROW_H) + 1; row++) {
    for (let col = -1; col <= COLUMNS; col++) {
      const x = col * HEX_W + (row % 2 === 0 ? 0 : HEX_W / 2);
      const y = row * ROW_H;
      for (const [dx, dy] of offsets) {
        ctx.save();
        ctx.translate(x + dx, y + dy);
        paint(ctx, col, row);
        ctx.restore();
      }
    }
  }
}

// the unique vertices of the lattice (shared corners of 2-3 hexagons
// are deduped on a half-pixel grid) — drawn once each at their raw
// position; margin cells cover the canvas edges without wrap copies,
// so no node is ever double-painted
function latticeVertices(): { x: number; y: number }[] {
  const seen = new Map<string, { x: number; y: number }>();
  const add = (x: number, y: number) => {
    const key = `${Math.round(x * 2)}|${Math.round(y * 2)}`;
    if (!seen.has(key)) seen.set(key, { x, y });
  };
  for (let row = -2; row <= Math.ceil(CANVAS_H / ROW_H) + 1; row++) {
    for (let col = -1; col <= COLUMNS + 1; col++) {
      const cx = col * HEX_W + (row % 2 === 0 ? 0 : HEX_W / 2);
      const cy = row * ROW_H;
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 2 + (k * Math.PI) / 3;
        add(cx + R * Math.cos(a), cy + R * Math.sin(a));
      }
    }
  }
  return [...seen.values()];
}

// fine paint-speck noise — a wall-sized sprinkle of dust/grain that
// makes large flat panels read as a real painted surface
function speckle(
  ctx: CanvasRenderingContext2D,
  count: number,
  darkAlpha: number,
  lightAlpha: number
): void {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * CANVAS_W;
    const y = Math.random() * CANVAS_H;
    const dark = Math.random() < 0.6;
    ctx.fillStyle = dark
      ? `rgba(30, 36, 44, ${(Math.random() * darkAlpha).toFixed(3)}`
      : `rgba(255, 255, 255, ${(Math.random() * lightAlpha).toFixed(3)}`;
    ctx.fillRect(x, y, 1, 1);
  }
}

export interface HexaWall {
  map: THREE.CanvasTexture;
  emissiveMap: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  /** world units covered by one tile horizontally */
  tileW: number;
  /** world units covered by one tile vertically (regular hexagons) */
  tileH: number;
  dispose(): void;
}

export function createHexaWall(
  hexWorldWidth = 0.26,
  neon = '#fa3fd0'
): HexaWall {
  // ---------- map: white base, embossed honeycomb panels ----------
  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = CANVAS_W;
  baseCanvas.height = CANVAS_H;
  const bctx = baseCanvas.getContext('2d')!;
  bctx.fillStyle = '#ffffff';
  bctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // per-panel brightness variation — each cell carries its own subtle
  // shade like real wall tiles from different dye lots
  strokeLattice(bctx, (ctx, col, row) => {
    const n = cellNoise(col, row);
    hexPath(ctx, 0, 0, R);
    ctx.fillStyle = `rgba(18, 26, 36, ${(0.015 + n * 0.04).toFixed(3)})`;
    ctx.fill();
  });

  // inner AO edge — a whisper of shadow where each panel meets the
  // groove, so the honeycomb reads recessed rather than drawn-on
  strokeLattice(bctx, (ctx) => {
    hexPath(ctx, 0, 0, R * 0.9);
    ctx.strokeStyle = 'rgba(24, 32, 42, 0.05)';
    ctx.lineWidth = HEX_W * 0.045;
    ctx.stroke();
  });

  // groove shadow (offset down-right) — the lower lip of the bevel
  strokeLattice(bctx, (ctx) => {
    ctx.translate(HEX_W * 0.008, HEX_W * 0.012);
    hexPath(ctx, 0, 0, R);
    ctx.strokeStyle = 'rgba(96, 108, 122, 0.22)';
    ctx.lineWidth = HEX_W * 0.058;
    ctx.lineJoin = 'miter';
    ctx.stroke();
  });

  // groove highlight (offset up-left) — the upper lip catching light
  strokeLattice(bctx, (ctx) => {
    ctx.translate(-HEX_W * 0.006, -HEX_W * 0.009);
    hexPath(ctx, 0, 0, R);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = HEX_W * 0.038;
    ctx.lineJoin = 'miter';
    ctx.stroke();
  });

  // the crisp groove line itself
  strokeLattice(bctx, (ctx) => {
    hexPath(ctx, 0, 0, R);
    ctx.strokeStyle = '#ccd4dd';
    ctx.lineWidth = HEX_W * 0.03;
    ctx.lineJoin = 'miter';
    ctx.stroke();
  });

  // painted-surface grain
  speckle(bctx, 42000, 0.05, 0.6);

  // ---------- height/normal: grooves recessed, panels raised ----------
  // the bump canvas IS the height field; the normal map is Sobel-converted
  // from it (see pbr.ts) so the bevels respond to light from any direction
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = CANVAS_W;
  bumpCanvas.height = CANVAS_H;
  const pctx = bumpCanvas.getContext('2d')!;
  pctx.fillStyle = '#8c8c8c';
  pctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  // wide soft groove well
  strokeLattice(pctx, (ctx) => {
    hexPath(ctx, 0, 0, R);
    ctx.strokeStyle = '#3c3c3c';
    ctx.lineWidth = HEX_W * 0.055;
    ctx.lineJoin = 'miter';
    ctx.stroke();
  });
  // slightly raised panel shoulder inside each cell
  strokeLattice(pctx, (ctx) => {
    hexPath(ctx, 0, 0, R * 0.93);
    ctx.strokeStyle = '#9d9d9d';
    ctx.lineWidth = HEX_W * 0.03;
    ctx.stroke();
  });
  speckle(pctx, 26000, 0.16, 0.16);

  const normalMap = heightCanvasToNormalTexture(bumpCanvas, 1.5);

  // ---------- emissiveMap: black base, neon LED honeycomb ----------
  const neonCanvas = document.createElement('canvas');
  neonCanvas.width = CANVAS_W;
  neonCanvas.height = CANVAS_H;
  const nctx = neonCanvas.getContext('2d')!;
  nctx.fillStyle = '#000000';
  nctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // a few panels read faintly backlit, like the LED behind them is set
  // to a low ambient level — depth without noise
  strokeLattice(nctx, (ctx, col, row) => {
    if (cellNoise2(col, row) > 0.86) {
      hexPath(ctx, 0, 0, R * 0.96);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, 'rgba(250, 63, 208, 0.085)');
      g.addColorStop(1, 'rgba(250, 63, 208, 0)');
      ctx.fillStyle = g;
      ctx.fill();
    }
  });

  // three stroke passes fake the LED glow: wide halo -> mid aura ->
  // bright hot core (the bloom pass finishes the job at night). The
  // aura carries a little per-cell variance — LED binning, not print
  const passes: [string, number, number][] = [
    [neon, HEX_W * 0.16, 0.16], // halo
    [neon, HEX_W * 0.085, -1], // aura (per-cell variance)
    ['#ffb1ef', HEX_W * 0.03, 1], // hot core
  ];
  passes.forEach(([color, width, alpha], i) => {
    strokeLattice(nctx, (ctx, col, row) => {
      hexPath(ctx, 0, 0, R);
      ctx.strokeStyle = color;
      ctx.globalAlpha =
        i === 1 ? 0.34 + cellNoise(col, row) * 0.2 : alpha;
      ctx.lineWidth = width;
      ctx.lineJoin = 'miter';
      ctx.stroke();
    });
  });
  nctx.globalAlpha = 1;

  // LED junction nodes — a bright bead at every lattice vertex, where
  // the strip segments would actually connect
  for (const v of latticeVertices()) {
    const rad = HEX_W * 0.095;
    const g = nctx.createRadialGradient(v.x, v.y, 0, v.x, v.y, rad);
    g.addColorStop(0, 'rgba(255, 255, 255, 1)');
    g.addColorStop(0.45, 'rgba(250, 63, 208, 0.75)');
    g.addColorStop(1, 'rgba(250, 63, 208, 0)');
    nctx.fillStyle = g;
    nctx.beginPath();
    nctx.arc(v.x, v.y, rad, 0, Math.PI * 2);
    nctx.fill();
  }

  const map = new THREE.CanvasTexture(baseCanvas);
  const emissiveMap = new THREE.CanvasTexture(neonCanvas);
  for (const tex of [map, emissiveMap, normalMap]) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }

  const tileW = COLUMNS * hexWorldWidth;
  const tileH = tileW * (CANVAS_H / CANVAS_W);

  return {
    map,
    emissiveMap,
    normalMap,
    tileW,
    tileH,
    dispose() {
      map.dispose();
      emissiveMap.dispose();
      normalMap.dispose();
    },
  };
}
