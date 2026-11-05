import * as THREE from 'three';

/**
 * Book cover — drawn in code instead of the AI-generated PNG.
 *
 * The generated cover shipped with its lettering mirrored ("ЯAIAVAN",
 * "TƧЯIꟻ ƎƧИƎꟻƎꟻ") — unreadable in the hero About shot, which zooms
 * right into this mesh. Every element here is vector text on a canvas,
 * so the title always reads correctly, and the motif (shield + circuit
 * trace) is drawn with paths rather than hallucinated pixels.
 *
 * Canvas is 595x842 (A4 @72dpi) matching the old PNG's aspect, so the
 * existing cover geometry UVs keep their framing.
 */

const W = 595;
const H = 842;

export function createBookCoverTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const x = canvas.getContext('2d')!;

  // NOTE ON ORIENTATION: the cover is read from BOTH sides. The closed
  // book on the desk (hero view) shows the quad's FRONT face, which
  // displays this canvas as-authored; the open cover in the About view
  // shows the BACK face, which mirrors it along U. Authoring the canvas
  // upright keeps the hero view readable, and the material's shader
  // (PortfolioExperience.tsx) flips U on back faces so the About view
  // reads correctly too — one texture, both sides upright.

  // paper
  x.fillStyle = '#f4f2ee';
  x.fillRect(0, 0, W, H);
  // subtle paper grain
  for (let i = 0; i < 2600; i++) {
    const px = Math.random() * W;
    const py = Math.random() * H;
    x.fillStyle =
      Math.random() < 0.5 ? 'rgba(0,0,0,0.012)' : 'rgba(255,255,255,0.02)';
    x.fillRect(px, py, 1.4, 1.4);
  }

  // corner crop marks — print-design framing
  x.strokeStyle = '#c9c4ba';
  x.lineWidth = 2;
  const m = 34;
  const c = 26;
  [
    [m, m, 1, 1],
    [W - m, m, -1, 1],
    [m, H - m, 1, -1],
    [W - m, H - m, -1, -1],
  ].forEach(([cx, cy, dx, dy]) => {
    x.beginPath();
    x.moveTo(cx + dx * c, cy);
    x.lineTo(cx, cy);
    x.lineTo(cx, cy + dy * c);
    x.stroke();
  });

  // ── shield emblem ──────────────────────────────────────────────
  const scx = W / 2;
  const scy = 296;
  const sw = 118; // half width
  const sh = 158; // top to point

  x.save();
  // outer shield
  x.beginPath();
  x.moveTo(scx - sw, scy - sh);
  x.lineTo(scx + sw, scy - sh);
  x.lineTo(scx + sw, scy + sh * 0.25);
  x.quadraticCurveTo(scx + sw, scy + sh * 0.72, scx, scy + sh);
  x.quadraticCurveTo(scx - sw, scy + sh * 0.72, scx - sw, scy + sh * 0.25);
  x.closePath();
  x.fillStyle = '#1d2733';
  x.fill();

  // inner shield outline
  x.beginPath();
  x.moveTo(scx - sw * 0.84, scy - sh * 0.86);
  x.lineTo(scx + sw * 0.84, scy - sh * 0.86);
  x.lineTo(scx + sw * 0.84, scy + sh * 0.2);
  x.quadraticCurveTo(scx + sw * 0.84, scy + sh * 0.62, scx, scy + sh * 0.84);
  x.quadraticCurveTo(
    scx - sw * 0.84,
    scy + sh * 0.62,
    scx - sw * 0.84,
    scy + sh * 0.2
  );
  x.closePath();
  x.strokeStyle = '#e9a29b';
  x.lineWidth = 3;
  x.stroke();

  // circuit trace: a broken line that "shorts" — the security motif
  x.strokeStyle = '#f4f2ee';
  x.lineWidth = 10;
  x.lineCap = 'round';
  x.beginPath();
  x.moveTo(scx - 52, scy - 58);
  x.lineTo(scx - 12, scy - 58);
  x.lineTo(scx + 8, scy + 4);
  x.lineTo(scx + 52, scy + 4);
  x.stroke();
  // the two nodes with a spark between
  x.fillStyle = '#f4f2ee';
  [scx - 52, scx + 52].forEach((nx) => {
    x.beginPath();
    x.arc(nx, nx === scx - 52 ? scy - 58 : scy + 4, 11, 0, Math.PI * 2);
    x.fill();
  });
  x.strokeStyle = '#e9a29b';
  x.lineWidth = 4;
  x.beginPath();
  x.moveTo(scx - 8, scy - 20);
  x.lineTo(scx + 14, scy - 2);
  x.moveTo(scx + 2, scy - 30);
  x.lineTo(scx + 20, scy - 16);
  x.stroke();
  x.restore();

  // ── wordmark ───────────────────────────────────────────────────
  x.textAlign = 'center';
  x.textBaseline = 'alphabetic';
  x.fillStyle = '#1d2733';
  x.font = '700 74px "Poppins", sans-serif';
  // letter-spaced wordmark (drawn per glyph for the tracking)
  const word = 'NAVAIRGAP';
  const track = 6;
  const widths = [...word].map(
    (ch) => x.measureText(ch).width
  );
  const total = widths.reduce((s, w) => s + w, 0) + track * (word.length - 1);
  let gx = W / 2 - total / 2;
  [...word].forEach((ch, i) => {
    x.fillText(ch, gx + widths[i] / 2, 590);
    gx += widths[i] + track;
  });

  x.font = '600 20px "Poppins", sans-serif';
  x.fillStyle = '#8a8577';
  const sub = 'SECURITY RESEARCHER · BACKEND DEVELOPER';
  const subTrack = 3;
  x.font = '600 20px "Poppins", sans-serif';
  const sw2 = [...sub].map((ch) => x.measureText(ch).width);
  const st2 = sw2.reduce((s, w) => s + w, 0) + subTrack * (sub.length - 1);
  let sx = W / 2 - st2 / 2;
  [...sub].forEach((ch, i) => {
    x.fillText(ch, sx + sw2[i] / 2, 636);
    sx += sw2[i] + subTrack;
  });

  // bottom tag
  x.fillStyle = '#1d2733';
  x.font = '700 30px "Poppins", sans-serif';
  const tag = 'DEFENSE FIRST';
  const tagTrack = 8;
  const tw = [...tag].map((ch) => x.measureText(ch).width);
  const tt = tw.reduce((s, w) => s + w, 0) + tagTrack * (tag.length - 1);
  let tx = W / 2 - tt / 2;
  [...tag].forEach((ch, i) => {
    x.fillText(ch, tx + tw[i] / 2, 742);
    tx += tw[i] + tagTrack;
  });
  // accent rules flanking the tag
  x.strokeStyle = '#e9a29b';
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(W / 2 - tt / 2 - 46, 732);
  x.lineTo(W / 2 - tt / 2 - 12, 732);
  x.moveTo(W / 2 + tt / 2 + 12, 732);
  x.lineTo(W / 2 + tt / 2 + 46, 732);
  x.stroke();
  // tiny imprint footer
  x.font = '500 15px "Poppins", sans-serif';
  x.fillStyle = '#a49f93';
  x.fillText('FIELD NOTES · NO 01', W / 2, 792);

  // spine edge — the dark binding on the canvas's right edge: the side
  // the cover hinges from, correct in both the closed hero view and the
  // open About view
  x.fillStyle = 'rgba(29, 39, 51, 0.10)';
  x.fillRect(W - 14, 0, 14, H);

  const tex = new THREE.CanvasTexture(canvas);
  // @types/three r149 predates colorSpace — the runtime accepts both; the
  // sRGB tag keeps the paper tone from being double-decoded
  (tex as unknown as { encoding: number }).encoding = 3001;
  tex.anisotropy = 8;
  return tex;
}
