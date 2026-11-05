import * as THREE from 'three';

/**
 * Shared procedural PBR map utilities for the photorealism pass.
 *
 *  - heightCanvasToNormalTexture(): Sobel-converts a grayscale height canvas
 *    into a tangent-space normal map (RGB). Sample indices wrap so seamless
 *    tileable heights (e.g. the honeycomb wall) convert to seamless normals.
 *    The green channel sign accounts for canvas textures' flipY upload: the
 *    derivation is n = normalize(-dH/du, +dH/dy_canvas, 1) because canvas +y
 *    maps to -v after the flip.
 *
 *  - createNoiseRoughnessMap(): one shared multi-octave grayscale noise
 *    texture. All channels are equal, so a single instance can serve as a
 *    material's roughnessMap (G channel), metalnessMap (B channel) and even
 *    aoMap (R channel) simultaneously — micro-variance that breaks up flat
 *    PBR surfaces and makes them read as manufactured rather than
 *    shader-perfect.
 */

export function heightCanvasToNormalTexture(
  canvas: HTMLCanvasElement,
  strength = 1,
  wrap: THREE.Wrapping = THREE.RepeatWrapping
): THREE.CanvasTexture {
  const w = canvas.width;
  const h = canvas.height;
  const src = canvas
    .getContext('2d')!
    .getImageData(0, 0, w, h).data;

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d')!;
  const img = octx.createImageData(w, h);

  // wrap-around height sample — keeps tiled heights seamless
  const height = (x: number, y: number): number => {
    const xi = ((x % w) + w) % w;
    const yi = ((y % h) + h) % h;
    return src[(yi * w + xi) * 4] / 255;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Sobel gradients over the height field
      const dx =
        height(x + 1, y - 1) +
        2 * height(x + 1, y) +
        height(x + 1, y + 1) -
        height(x - 1, y - 1) -
        2 * height(x - 1, y) -
        height(x - 1, y + 1);
      const dy =
        height(x - 1, y + 1) +
        2 * height(x, y + 1) +
        height(x + 1, y + 1) -
        height(x - 1, y - 1) -
        2 * height(x, y - 1) -
        height(x + 1, y - 1);

      // see the header comment for the green-channel sign derivation
      let nx = -dx * strength;
      let ny = dy * strength;
      const nz = 1;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= len;
      ny /= len;

      const i = (y * w + x) * 4;
      img.data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      img.data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      img.data[i + 2] = Math.round((1 / len) * 0.5 * 255 + 127.5);
      img.data[i + 3] = 255;
    }
  }

  octx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(out);
  tex.wrapS = wrap;
  tex.wrapT = wrap;
  return tex;
}

/**
 * Cross-browser rounded-rectangle path. `ctx.roundRect` needs Chrome 99+ /
 * Safari 16+ / Firefox 112+; this falls back to the classic arcTo recipe so
 * the procedural textures render on older browsers too.
 */
export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rad = Math.min(r, w / 2, h / 2);
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, rad);
    return;
  }
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/**
 * Multi-octave grayscale micro-noise, ~0.72 mean with blotchy meso-variance
 * and fine speckle. Shared instance across materials — see header.
 */
export function createNoiseRoughnessMap(size = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // base level
  ctx.fillStyle = '#b7b7b7';
  ctx.fillRect(0, 0, size, size);

  // meso-variance — soft lighter/darker blotches, drawn at the 9 wrap
  // offsets so the noise tiles seamlessly
  const offsets = [-size, 0, size].flatMap((dx) =>
    [-size, 0, size].map((dy) => [dx, dy])
  );
  for (let i = 0; i < 46; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = size * (0.08 + Math.random() * 0.22);
    const light = Math.random() < 0.5;
    const a = 0.035 + Math.random() * 0.075;
    for (const [dx, dy] of offsets) {
      const g = ctx.createRadialGradient(
        x + dx,
        y + dy,
        0,
        x + dx,
        y + dy,
        r
      );
      g.addColorStop(0, light ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
    }
  }

  // fine speckle — the manufacturing grain
  const specks = size * size * 0.16;
  for (let i = 0; i < specks; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const light = Math.random() < 0.5;
    const a = 0.05 + Math.random() * 0.16;
    ctx.fillStyle = light
      ? `rgba(255,255,255,${a.toFixed(3)})`
      : `rgba(0,0,0,${a.toFixed(3)})`;
    ctx.fillRect(x, y, 1, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Tiled micro-relief normal map for the model's flat-colour surfaces
 * (desk top, PC tower, floor). room.glb ships with NO textures at all —
 * every surface is a plain colour plus a roughness value, which is why
 * they read as shader-perfect plastic. This turns the shared noise field
 * into a real height → normal conversion: a fine orange-peel/speckle
 * relief that catches the key light and the environment, so large panels
 * gain visible surface instead of a dead flat tone.
 *
 * Cheap by construction: one 256² canvas generated once at load, shared
 * by every material, sampled with RepeatWrapping + anisotropy — a single
 * extra texture fetch per fragment.
 */
export function createSurfaceGrainNormal(size = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // mid-grey base = flat surface; every deviation below becomes relief
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  // soft meso blotches — shallow rolling undulation like painted plaster
  // or a moulded desk shell, drawn at the 9 wrap offsets so it tiles
  const offsets = [-size, 0, size].flatMap((dx) =>
    [-size, 0, size].map((dy) => [dx, dy])
  );
  for (let i = 0; i < 38; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = size * (0.06 + Math.random() * 0.2);
    const light = Math.random() < 0.5;
    const a = 0.05 + Math.random() * 0.06;
    for (const [dx, dy] of offsets) {
      const g = ctx.createRadialGradient(
        x + dx,
        y + dy,
        0,
        x + dx,
        y + dy,
        r
      );
      g.addColorStop(0, light ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
    }
  }

  // fine speckle — the grain you only see up close (mipmaps take it
  // away again at distance, so it never shimmers far away)
  const specks = size * size * 0.1;
  for (let i = 0; i < specks; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const light = Math.random() < 0.5;
    const a = 0.06 + Math.random() * 0.14;
    ctx.fillStyle = light
      ? `rgba(255,255,255,${a.toFixed(3)})`
      : `rgba(0,0,0,${a.toFixed(3)})`;
    ctx.fillRect(x, y, 1, 1);
  }

  const tex = heightCanvasToNormalTexture(canvas, 1.15, THREE.RepeatWrapping);
  tex.anisotropy = 8;
  return tex;
}

/**
 * Rebuild a mesh's UVs by box (triplanar) projection from its own
 * position + normal data.
 *
 * The GLB ships stale/unused UVs (the wall already regenerates its own),
 * so a material can't tile a map across a surface like the desk or the PC
 * shell — every vertex would sample one texel. Projecting each vertex onto
 * the dominant axis plane of its normal gives seamless, world-scaled UVs
 * (one `tile` unit per repeat) with no seams on boxy geometry. Non-axis-
 * aligned detail (curved parts) still maps cleanly because the dominant
 * axis flips with the normal.
 */
export function boxProjectUVs(
  geo: THREE.BufferGeometry,
  tile: number
): void {
  const pos = geo.attributes.position as THREE.BufferAttribute | undefined;
  const nor = geo.attributes.normal as THREE.BufferAttribute | undefined;
  if (!pos || !nor || tile <= 0) return;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    if (ay >= ax && ay >= az) {
      // top / bottom — project onto the x/z plane
      uv[i * 2] = pos.getX(i) / tile;
      uv[i * 2 + 1] = pos.getZ(i) / tile;
    } else if (ax >= az) {
      // side facing ±x — project onto the z/y plane
      uv[i * 2] = pos.getZ(i) / tile;
      uv[i * 2 + 1] = pos.getY(i) / tile;
    } else {
      // side facing ±z — project onto the x/y plane
      uv[i * 2] = pos.getX(i) / tile;
      uv[i * 2 + 1] = pos.getY(i) / tile;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
