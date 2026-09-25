import * as THREE from 'three';
import { roundedRugGeometry } from './carpet';
import { roundRectPath } from './pbr';

/**
 * The room floor, restyled:
 *
 * 1) FLOOR SKIN — a plane laid over the shell's floor rectangle (0.5mm
 *    above it, 1mm below the rug) with its own material so the floor can
 *    carry a color of its own: a warm red surface in daylight that sinks
 *    to near-black slate at night, with a soft vignette toward the walls
 *    and a fine grain so it never reads as flat plastic. It receives the
 *    desk/chair shadows and never intercepts raycasts.
 *
 * 2) LED STRIPS — an overlay exactly on the rug's rounded-rectangle
 *    footprint (same shared geometry, 1mm above the rug weave) whose
 *    canvas traces the rug's OWN design — border band, inner hairline,
 *    corner diamonds and the twin hex outlines — as neon LED strips:
 *    white-hot dashed bead runs with colored halos, continuous neon
 *    tubes and junction beads, in magenta + cyan to echo the honeycomb
 *    wall and the night wall text. MeshBasicMaterial, toneMapped off:
 *    the bright cores exceed the bloom threshold and genuinely glow at
 *    night. Daylight keeps it at opacity 0; the render loop breathes it
 *    in with the theme.
 */

export const FLOOR_LIGHT_RED = new THREE.Color(0xa63a32);
export const FLOOR_DARK = new THREE.Color(0x232830);

/* ------------------------------------------------------------------ */
/* floor skin                                                          */
/* ------------------------------------------------------------------ */

function drawSkinTexture(): HTMLCanvasElement {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const x = c.getContext('2d')!;

  // near-white base — the material color does the tinting
  x.fillStyle = '#e9e9e9';
  x.fillRect(0, 0, S, S);

  // fine grain — matte mineral surface, not plastic
  for (let i = 0; i < 9000; i++) {
    const px = Math.random() * S;
    const py = Math.random() * S;
    x.fillStyle =
      Math.random() < 0.6
        ? `rgba(32, 32, 36, ${(0.02 + Math.random() * 0.05).toFixed(3)})`
        : `rgba(255, 255, 255, ${(0.02 + Math.random() * 0.05).toFixed(3)})`;
    x.fillRect(px, py, 1, 1);
  }

  // soft vignette — the room's edges settle darker
  const g = x.createRadialGradient(S / 2, S / 2, S * 0.22, S / 2, S / 2, S * 0.72);
  g.addColorStop(0, 'rgba(0, 0, 0, 0)');
  g.addColorStop(1, 'rgba(12, 10, 10, 0.18)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);

  return c;
}

export interface FloorSkin {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  dispose(): void;
}

export function createFloorSkin(w: number, d: number): FloorSkin {
  const texture = new THREE.CanvasTexture(drawSkinTexture());
  texture.anisotropy = 8;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  const geo = new THREE.PlaneGeometry(w, d);
  geo.rotateX(-Math.PI / 2);

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    color: FLOOR_LIGHT_RED.clone(),
    roughness: 0.9,
    metalness: 0,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.raycast = () => {};

  return {
    mesh,
    material,
    dispose() {
      geo.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}

/* ------------------------------------------------------------------ */
/* LED strips                                                          */
/* ------------------------------------------------------------------ */

const LED = 2048;

export interface FloorLed {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  dispose(): void;
}

export function createFloorLed(w = 0.95, d = 0.95): FloorLed {
  const c = document.createElement('canvas');
  c.width = LED;
  c.height = LED;
  const x = c.getContext('2d')!;

  // the rug's design was authored on a 1024 grid — scale it up 2x so the
  // strips land on exactly the same lines of the weave
  const k = LED / 1024;
  const cornerPx = LED * (0.055 / 0.95);
  const MAGENTA = '#ff59d8';
  const CYAN = '#5eeaff';

  const rrPath = (inset: number, r: number): void => {
    x.beginPath();
    roundRectPath(x, inset, inset, LED - inset * 2, LED - inset * 2, r);
  };
  const hexPath = (cx: number, cy: number, r: number): void => {
    x.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 3;
      const px = cx + r * Math.cos(a);
      const py = cy + r * Math.sin(a);
      if (i === 0) x.moveTo(px, py);
      else x.lineTo(px, py);
    }
    x.closePath();
  };

  x.lineCap = 'round';
  x.lineJoin = 'round';

  // ---- outer border strip: a dim magenta rail + white-hot LED bead run
  const bandInset = 30 * k;
  const bandR = Math.max(16, cornerPx - bandInset * 0.85);
  rrPath(bandInset, bandR);
  x.setLineDash([]);
  x.shadowBlur = 0;
  x.strokeStyle = 'rgba(255, 89, 216, 0.45)';
  x.lineWidth = 30;
  x.stroke();

  x.shadowColor = MAGENTA;
  x.shadowBlur = 34;
  rrPath(bandInset, bandR);
  x.setLineDash([56, 34]);
  x.strokeStyle = '#fff2fb';
  x.lineWidth = 26;
  x.stroke();
  x.setLineDash([]);
  x.shadowBlur = 0;

  // ---- inner hairline: a fine cyan bead run
  const lineInset = 68 * k;
  const lineR = Math.max(12, cornerPx - lineInset * 0.85);
  x.shadowColor = CYAN;
  x.shadowBlur = 22;
  rrPath(lineInset, lineR);
  x.setLineDash([30, 22]);
  x.strokeStyle = '#eafeff';
  x.lineWidth = 12;
  x.stroke();
  x.setLineDash([]);
  x.shadowBlur = 0;

  // ---- twin hex outlines, neon tubes with junction beads
  const hexes: Array<{ r: number; color: string; core: string; lw: number }> = [
    { r: 300 * k, color: CYAN, core: '#c8f9ff', lw: 26 },
    { r: 236 * k, color: MAGENTA, core: '#ffc9f2', lw: 20 },
  ];
  hexes.forEach(({ r, color, core, lw }) => {
    x.shadowColor = color;
    x.shadowBlur = 30;
    hexPath(LED / 2, LED / 2, r);
    x.strokeStyle = core;
    x.lineWidth = lw;
    x.stroke();

    // junction beads at the vertices — like the wall honeycomb
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 3;
      const px = LED / 2 + r * Math.cos(a);
      const py = LED / 2 + r * Math.sin(a);
      x.beginPath();
      x.arc(px, py, 26, 0, Math.PI * 2);
      x.fillStyle = '#ffffff';
      x.fill();
    }
  });
  x.shadowBlur = 0;

  // ---- corner diamonds — bright gems in the border band corners
  const dg = 26 * k;
  const dPos = 72 * k;
  [
    [dPos, dPos],
    [LED - dPos, dPos],
    [dPos, LED - dPos],
    [LED - dPos, LED - dPos],
  ].forEach(([cx, cy]) => {
    x.beginPath();
    x.moveTo(cx, cy - dg);
    x.lineTo(cx + dg, cy);
    x.lineTo(cx, cy + dg);
    x.lineTo(cx - dg, cy);
    x.closePath();
    x.shadowColor = MAGENTA;
    x.shadowBlur = 26;
    x.fillStyle = '#fff6fd';
    x.fill();
  });
  x.shadowBlur = 0;

  const texture = new THREE.CanvasTexture(c);
  texture.anisotropy = 16;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  // same footprint + UV mapping as the rug — texel-for-texel alignment
  const geo = roundedRugGeometry(w, d, 0.055);

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0,
    toneMapped: false,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.renderOrder = 2;
  mesh.raycast = () => {};

  return {
    mesh,
    material,
    dispose() {
      geo.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
