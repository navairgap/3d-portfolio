import * as THREE from 'three';

/**
 * A rounded woven rug for the room floor. Geometry: a rounded-rectangle
 * ShapeGeometry lying flat (UVs remapped to the texture), with a
 * procedural carpet texture — woven grain, speckle, a double border
 * band with corner accents and a quiet hex outline echo of the walls.
 * The texture is near-grayscale and tinted by the material color, which
 * the theme switch tweens between a warm red weave (day) and a deep
 * navy (night). The rug receives shadows (desk + chair legs) and never
 * intercepts raycasts.
 */

export const CARPET_LIGHT = new THREE.Color(0xb4473c);
export const CARPET_DARK = new THREE.Color(0x2a3345);

const TEX = 1024;

/**
 * The rug's rounded-rectangle footprint as a flat, upward-facing
 * ShapeGeometry with texture UVs — shared by the rug itself and by the
 * LED strip overlay that traces its design, so the two always align
 * texel-for-texel.
 */
export function roundedRugGeometry(
  w = 0.95,
  d = 0.95,
  r = 0.055
): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  const geo = new THREE.ShapeGeometry(s, 24);

  // ShapeGeometry writes shape-space xy as uvs — remap to the texture
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / d + 0.5);
  }
  uv.needsUpdate = true;

  // lie flat on the floor, facing up
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function drawCanvasTexture(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = TEX;
  c.height = TEX;
  const ctx = c.getContext('2d')!;

  // woven base
  ctx.fillStyle = '#d3d3d3';
  ctx.fillRect(0, 0, TEX, TEX);

  // weave grid — faint thread lines in both directions
  ctx.strokeStyle = 'rgba(60, 66, 76, 0.05)';
  ctx.lineWidth = 1;
  for (let y = 0; y < TEX; y += 3) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(TEX, y + 0.5);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(60, 66, 76, 0.03)';
  for (let x = 0; x < TEX; x += 5) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, TEX);
    ctx.stroke();
  }

  // fiber speckle — the little shadows and glints of a cut-pile rug
  for (let i = 0; i < 60000; i++) {
    const x = Math.random() * TEX;
    const y = Math.random() * TEX;
    if (Math.random() < 0.62) {
      ctx.fillStyle = `rgba(38, 44, 54, ${(0.02 + Math.random() * 0.05).toFixed(3)})`;
    } else {
      ctx.fillStyle = `rgba(255, 255, 255, ${(0.02 + Math.random() * 0.05).toFixed(3)})`;
    }
    ctx.fillRect(x, y, 1, 1);
  }

  // the rug's own corner radius, in texture pixels, so the border
  // band follows the rounded silhouette
  const cornerPx = TEX * (0.055 / 0.95);

  // outer border band
  const bandInset = 30;
  ctx.strokeStyle = '#a6a6a6';
  ctx.lineWidth = 34;
  ctx.beginPath();
  ctx.roundRect(bandInset, bandInset, TEX - bandInset * 2, TEX - bandInset * 2, Math.max(8, cornerPx - bandInset * 0.85));
  ctx.stroke();

  // inner hairline
  const lineInset = 68;
  ctx.strokeStyle = '#9c9c9c';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.roundRect(lineInset, lineInset, TEX - lineInset * 2, TEX - lineInset * 2, Math.max(6, cornerPx - lineInset * 0.85));
  ctx.stroke();

  // corner accents — small diamonds in the border band corners
  const d = 26;
  [
    [72, 72],
    [TEX - 72, 72],
    [72, TEX - 72],
    [TEX - 72, TEX - 72],
  ].forEach(([cx, cy]) => {
    ctx.beginPath();
    ctx.moveTo(cx, cy - d);
    ctx.lineTo(cx + d, cy);
    ctx.lineTo(cx, cy + d);
    ctx.lineTo(cx - d, cy);
    ctx.closePath();
    ctx.fillStyle = 'rgba(120, 128, 138, 0.55)';
    ctx.fill();
  });

  // quiet hex echo of the wall panels, centered
  const hexOutline = (cx: number, cy: number, r: number, style: string, lw: number) => {
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 2 + (k * Math.PI) / 3;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = style;
    ctx.lineWidth = lw;
    ctx.stroke();
  };
  hexOutline(TEX / 2, TEX / 2, 300, 'rgba(70, 80, 92, 0.13)', 12);
  hexOutline(TEX / 2, TEX / 2, 236, 'rgba(70, 80, 92, 0.09)', 8);

  // soft vignette — edges settle a touch darker like a used rug
  const vg = ctx.createRadialGradient(
    TEX / 2,
    TEX / 2,
    TEX * 0.28,
    TEX / 2,
    TEX / 2,
    TEX * 0.62
  );
  vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vg.addColorStop(1, 'rgba(20, 26, 34, 0.10)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, TEX, TEX);

  return c;
}

export interface Carpet {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  dispose(): void;
}

export function createCarpet(w = 0.95, d = 0.95): Carpet {
  const texture = new THREE.CanvasTexture(drawCanvasTexture());
  texture.anisotropy = 8; // grazing camera angles are the norm here
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  const geo = roundedRugGeometry(w, d, 0.055);

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    color: CARPET_LIGHT.clone(),
    roughness: 0.97,
    metalness: 0,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  // purely decorative — the floor's click behavior stays as it was
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
