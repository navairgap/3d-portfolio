import * as THREE from 'three';
import { roundRectPath } from './pbr';

/**
 * Project wall posters — drawn, not generated.
 *
 * The original four images were AI-generated screenshots whose fake UI text
 * came out garbled ("Device ChecKUP", "portwaraden", "System Mobie zirro"),
 * which is exactly the kind of detail visitors zoom in on. Every poster
 * below is vector-drawn onto a canvas: real text (the project's actual
 * name), flat panels, crisp 2px lines — readable from any camera distance
 * because it is typography, not hallucinated pixels.
 *
 * The same module builds the PHOTO FRAME each poster hangs in: a dark
 * aluminium frame with a white mat cut-out, drawn as its own canvas so the
 * frame lives on a separate mesh slightly behind the artwork — the user's
 * brief was literally "make the images inside a photo frame, separate".
 */

export interface PosterSpec {
  /** one-word project key */
  key:
    | 'sentinelwifi'
    | 'banter'
    | 'portfolioos'
    | 'portwarden'
    | 'sentineldns'
    | 'tinykv';
  title: string;
  subtitle: string;
  accent: string;
  ink: string;
  paper: string;
}

export const POSTER_SPECS: PosterSpec[] = [
  {
    key: 'sentinelwifi',
    title: 'SentinelWiFi',
    subtitle: 'Rogue access-point detection',
    accent: '#39d98a',
    ink: '#0d1117',
    paper: '#0b0f14',
  },
  {
    key: 'banter',
    title: 'banter',
    subtitle: 'Realtime chat · Socket.IO',
    accent: '#f7b955',
    ink: '#16130c',
    paper: '#12100b',
  },
  {
    key: 'portfolioos',
    title: 'Portfolio OS',
    subtitle: 'Browser Linux desktop · 13 apps',
    accent: '#53c7ff',
    ink: '#0a1016',
    paper: '#0a0f15',
  },
  {
    key: 'portwarden',
    title: 'PortWarden',
    subtitle: 'Port & service monitoring',
    accent: '#ff7ab8',
    ink: '#140b11',
    paper: '#120a0f',
  },
  {
    key: 'sentineldns',
    title: 'SentinelDNS',
    subtitle: 'Passive DNS logger · Rust',
    accent: '#2dd4bf',
    ink: '#0a1412',
    paper: '#091210',
  },
  {
    key: 'tinykv',
    title: 'TinyKV',
    subtitle: 'Key-value store · C + LRU',
    accent: '#ff6b6b',
    ink: '#160b0b',
    paper: '#140a0a',
  },
];

const W = 1344;
const H = 768;

function newCanvas(w = W, h = H): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')!];
}

/** crisp rounded-rect fill+stroke helper (uses the compat path helper) */
function panel(
  x: CanvasRenderingContext2D,
  px: number,
  py: number,
  pw: number,
  ph: number,
  r: number,
  fill: string,
  stroke?: string,
  lw = 2
): void {
  x.beginPath();
  roundRectPath(x, px, py, pw, ph, r);
  x.fillStyle = fill;
  x.fill();
  if (stroke) {
    x.strokeStyle = stroke;
    x.lineWidth = lw;
    x.stroke();
  }
}

/** header bar shared by every poster: brand + window dots */
function drawChrome(
  x: CanvasRenderingContext2D,
  spec: PosterSpec,
  heading: string
): number {
  // dark card on transparent-ish paper
  x.fillStyle = spec.paper;
  x.fillRect(0, 0, W, H);

  // top chrome bar
  panel(x, 48, 44, W - 96, 64, 12, '#161b22');
  // traffic lights
  const dots = ['#ff5f57', '#febc2e', '#28c840'];
  dots.forEach((c, i) => {
    x.beginPath();
    x.arc(80 + i * 30, 76, 9, 0, Math.PI * 2);
    x.fillStyle = c;
    x.fill();
  });
  // terminal-style path, real text
  x.font = '600 26px "Poppins", sans-serif';
  x.fillStyle = '#8b949e';
  x.textAlign = 'left';
  x.textBaseline = 'middle';
  x.fillText(`~/${spec.key.toLowerCase()}`, 190, 78);
  // breadcrumb label on the right end of the chrome bar
  x.textAlign = 'right';
  x.fillStyle = '#6e7681';
  x.font = '500 24px "Poppins", sans-serif';
  x.fillText('navairgap.dev', W - 80, 78);
  x.textAlign = 'left';

  // project wordmark, huge and real
  x.font = '700 92px "Poppins", sans-serif';
  x.fillStyle = spec.accent;
  x.fillText(spec.title, 72, 220);
  x.font = '500 34px "Poppins", sans-serif';
  x.fillStyle = '#9aa7b4';
  x.fillText(spec.subtitle, 76, 286);

  // thin accent rule under the wordmark
  x.fillStyle = spec.accent;
  x.fillRect(76, 316, 180, 6);

  x.font = '600 28px "Poppins", sans-serif';
  x.fillStyle = '#c9d1d9';
  x.fillText(heading, 76, 372);
  return 420; // content origin y
}

/** rows of labelled values — the "readout" motif every poster shares */
function drawRows(
  x: CanvasRenderingContext2D,
  rows: [string, string, string][],
  originY: number,
  spec: PosterSpec
): void {
  const rowH = 84;
  rows.forEach(([label, value, tone], i) => {
    const ry = originY + i * rowH;
    panel(x, 76, ry, W - 152, rowH - 18, 10, '#151a21', '#232b34', 2);
    x.font = '600 30px "Poppins", sans-serif';
    x.fillStyle = '#8b949e';
    x.textBaseline = 'middle';
    x.fillText(label, 104, ry + rowH / 2 - 9);
    x.font = '700 32px "Poppins", sans-serif';
    x.fillStyle = tone === 'ok' ? spec.accent : '#e6edf3';
    x.textAlign = 'right';
    x.fillText(value, W - 104, ry + rowH / 2 - 9);
    x.textAlign = 'left';
  });
}

/* ------------------------------------------------------------------ */
/* per-project content                                                 */
/* ------------------------------------------------------------------ */

function drawSentinel(x: CanvasRenderingContext2D, spec: PosterSpec): void {
  // left half: radar sweep
  const cy = 560;
  const cx = 330;
  for (let r = 130; r > 24; r -= 26) {
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.strokeStyle = 'rgba(57, 217, 138, 0.35)';
    x.lineWidth = 3;
    x.stroke();
  }
  const grad = x.createRadialGradient(cx, cy, 0, cx, cy, 130);
  grad.addColorStop(0, 'rgba(57, 217, 138, 0.55)');
  grad.addColorStop(1, 'rgba(57, 217, 138, 0)');
  x.fillStyle = grad;
  x.beginPath();
  x.moveTo(cx, cy);
  x.arc(cx, cy, 130, -Math.PI / 2, -Math.PI / 2 + 1.1);
  x.closePath();
  x.fill();
  // detected APs
  [[380, 470], [270, 640], [410, 620]].forEach(([ax, ay], i) => {
    x.beginPath();
    x.arc(ax, ay, i === 0 ? 10 : 7, 0, Math.PI * 2);
    x.fillStyle = i === 0 ? '#ff6b6b' : spec.accent;
    x.fill();
  });
  // right half: a device audit panel (label + status rows, no fake
  // "device" placeholders — the three rows are the real checks)
  const audit: [string, string][] = [
    ['ssid fingerprint', 'MATCH'],
    ['handshake capture', 'CLEAN'],
    ['deauth monitor', 'ARMED'],
  ];
  let ay2 = 452;
  audit.forEach(([label, status]) => {
    panel(x, 640, ay2, 560, 64, 10, '#151a21', '#232b34', 2);
    x.font = '500 28px "Poppins", sans-serif';
    x.fillStyle = '#8b949e';
    x.textBaseline = 'middle';
    x.fillText(label, 668, ay2 + 32);
    x.font = '700 28px "Poppins", sans-serif';
    x.fillStyle = spec.accent;
    x.textAlign = 'right';
    x.fillText(status, W - 108, ay2 + 32);
    x.textAlign = 'left';
    ay2 += 78;
  });
  // verdict strip
  panel(x, 640, ay2 + 8, 560, 76, 10, '#152018', spec.accent, 2);
  x.font = '700 30px "Poppins", sans-serif';
  x.fillStyle = spec.accent;
  x.fillText('NETWORK: SECURE', 668, ay2 + 46);
}

function drawBanter(x: CanvasRenderingContext2D, spec: PosterSpec): void {
  // chat transcript with real words
  const msgs: [string, string, boolean][] = [
    ['nav', 'pushed the presence patch 🚀', false],
    ['ira', 'typing indicator still lags?', true],
    ['nav', 'fixed — socket acks now batch', false],
    ['ira', 'rooms scale to 1k?', true],
    ['nav', 'benchmark says 1.2k ✔', false],
  ];
  let my = 448;
  msgs.forEach(([who, text, mine]) => {
    const bw = 34 + text.length * 15;
    const bx = mine ? W - 76 - bw : 76;
    panel(x, bx, my, bw, 62, 30, mine ? '#233024' : '#1b2027', mine ? spec.accent : '#2a323b', 2);
    x.font = '500 26px "Poppins", sans-serif';
    x.fillStyle = mine ? '#d9f2e2' : '#c9d1d9';
    x.textBaseline = 'middle';
    x.fillText(`${who}: ${text}`, bx + 26, my + 31);
    my += 76;
  });
  // input bar
  panel(x, 76, my + 8, W - 152, 74, 36, '#161b22', '#232b34', 2);
  x.font = '500 28px "Poppins", sans-serif';
  x.fillStyle = '#6e7681';
  x.fillText('message #general — 1.2k peers online', 108, my + 45);
}

function drawPortfolioos(x: CanvasRenderingContext2D, spec: PosterSpec): void {
  // boot log — the real facts of the repo: window manager, workspaces,
  // 13 apps, React + TypeScript
  const lines: [string, string][] = [
    ['[ ok ]', 'window manager online'],
    ['[ ok ]', 'workspaces ×4 mounted'],
    ['[ ok ]', '13 apps linked'],
    ['[ ok ]', 'shell: React + TypeScript'],
    ['[ .. ]', 'guest session starting'],
  ];
  let ly = 452;
  x.font = '600 30px "Poppins", sans-serif';
  lines.forEach(([tag, text]) => {
    x.fillStyle = tag === '[ ok ]' ? spec.accent : '#e3b341';
    x.fillText(tag, 84, ly);
    x.fillStyle = '#c9d1d9';
    x.fillText(text, 210, ly);
    ly += 58;
  });
  // blinking-cursor prompt
  x.fillStyle = spec.accent;
  x.fillRect(84, ly + 4, 26, 40);
  x.font = '600 30px "Poppins", sans-serif';
  x.fillStyle = '#e6edf3';
  x.fillText('nav@os:~#_', 130, ly + 36);
}

function drawPortwarden(x: CanvasRenderingContext2D, spec: PosterSpec): void {
  // port table with real port numbers — 4 rows so the stack clears the
  // sparkline below (5 rows ran off the canvas into it)
  const ports: [string, string, string][] = [
    ['22/tcp', 'ssh', 'guarded'],
    ['80/tcp', 'http', 'guarded'],
    ['443/tcp', 'https', 'guarded'],
    ['3000/tcp', 'node', 'watched'],
  ];
  drawRows(
    x,
    ports.map((p) => [p[0], p[1], 'ok'] as [string, string, string]),
    440,
    spec
  );
  // little sparkline of packet flow
  x.beginPath();
  x.strokeStyle = spec.accent;
  x.lineWidth = 4;
  let py = 660;
  for (let i = 0; i <= 40; i++) {
    const px = 76 + (i / 40) * (W - 152);
    const noise = Math.sin(i * 0.9) * 12 + Math.sin(i * 2.3) * 7;
    if (i === 0) x.moveTo(px, py + noise);
    else x.lineTo(px, py + noise);
  }
  x.stroke();
  x.font = '500 24px "Poppins", sans-serif';
  x.fillStyle = '#8b949e';
  x.fillText('packets / sec — last 60s', 76, 724);
}

function drawSentineldns(x: CanvasRenderingContext2D, spec: PosterSpec): void {
  // left: live query log — record chip + client → domain + verdict
  const queries: [string, string, string][] = [
    ['A', 'router.lan → ads.example.com', 'BLOCKED'],
    ['AAAA', 'laptop.lan → home-assistant.io', 'PASSED'],
    ['TXT', 'phone.lan → api.telemetry.dev', 'FLAGGED'],
  ];
  let py = 442;
  queries.forEach(([rtype, path, verdict]) => {
    panel(x, 76, py, 700, 56, 10, '#151a21', '#232b34', 2);
    const chipW = rtype.length * 17 + 28;
    panel(
      x,
      96,
      py + 10,
      chipW,
      36,
      18,
      'rgba(45, 212, 191, 0.16)',
      spec.accent,
      2
    );
    x.font = '700 22px "Poppins", sans-serif';
    x.fillStyle = spec.accent;
    x.textBaseline = 'middle';
    x.fillText(rtype, 110, py + 29);
    x.font = '500 24px "Poppins", sans-serif';
    x.fillStyle = '#c9d1d9';
    x.fillText(path, 110 + chipW + 18, py + 29);
    x.textAlign = 'right';
    x.fillStyle = '#8b949e';
    x.fillText(verdict, 756, py + 29);
    x.textAlign = 'left';
    py += 66;
  });
  // right: top queried domains — labelled bars
  x.font = '600 24px "Poppins", sans-serif';
  x.fillStyle = '#8b949e';
  x.textBaseline = 'alphabetic';
  x.fillText('top domains', 804, 452);
  const mix: [string, number][] = [
    ['iot.lan', 0.38],
    ['github.com', 0.27],
    ['mqtt.lan', 0.19],
    ['other', 0.16],
  ];
  let by = 478;
  mix.forEach(([name, frac]) => {
    x.font = '500 22px "Poppins", sans-serif';
    x.fillStyle = '#9aa7b4';
    x.textBaseline = 'middle';
    x.fillText(name, 804, by + 14);
    panel(x, 960, by, 308, 28, 14, '#151a21', '#232b34', 2);
    panel(x, 962, by + 2, Math.max(24, Math.round(304 * frac)), 24, 12, spec.accent);
    by += 46;
  });
  // verdict strip
  panel(x, 76, 668, W - 152, 68, 10, '#0e1b18', spec.accent, 2);
  x.font = '700 28px "Poppins", sans-serif';
  x.fillStyle = spec.accent;
  x.fillText('MODE: PASSIVE — LOG ONLY', 104, 704);
}

function drawTinykv(x: CanvasRenderingContext2D, spec: PosterSpec): void {
  // the store's real interface: key/value operations
  const ops: [string, string][] = [
    ['SET user:nav "airgap"', 'OK'],
    ['GET session:token', 'HIT'],
    ['LRU evictions (24h)', '3 keys'],
  ];
  drawRows(
    x,
    ops.map((o) => [o[0], o[1], 'ok'] as [string, string, string]),
    440,
    spec
  );
  // footprint strip
  panel(x, 76, 690, W - 152, 68, 10, '#1a0f0f', spec.accent, 2);
  x.font = '700 28px "Poppins", sans-serif';
  x.fillStyle = spec.accent;
  x.fillText('STORE: ONLINE — 0.9 MB · LRU CACHE', 104, 726);
}

const DRAWERS: Record<
  PosterSpec['key'],
  (x: CanvasRenderingContext2D, spec: PosterSpec) => void
> = {
  sentinelwifi: drawSentinel,
  banter: drawBanter,
  portfolioos: drawPortfolioos,
  portwarden: drawPortwarden,
  sentineldns: drawSentineldns,
  tinykv: drawTinykv,
};

/** Render one project poster to a texture (crisp type, flat panels). */
export function createPosterTexture(spec: PosterSpec): THREE.CanvasTexture {
  const [canvas, x] = newCanvas();
  x.textAlign = 'left';
  x.textBaseline = 'alphabetic';
  drawChrome(x, spec, {
    sentinelwifi: 'live monitor',
    banter: 'chat room',
    portfolioos: 'boot session',
    portwarden: 'service guard',
    sentineldns: 'query log',
    tinykv: 'store ops',
  }[spec.key]);
  DRAWERS[spec.key](x, spec);
  const tex = new THREE.CanvasTexture(canvas);
  // @types/three r149 predates colorSpace — the runtime accepts both; the
  // sRGB tag keeps the flat brand colours from being double-decoded
  (tex as unknown as { encoding: number }).encoding = 3001;
  tex.anisotropy = 8;
  return tex;
}

/* ------------------------------------------------------------------ */
/* photo frame                                                         */
/* ------------------------------------------------------------------ */

const FRAME_H = 824;
// window (cut-out) size as a fraction of the frame, and the frame's own
// canvas width, are solved together so EVERYTHING locks to the poster's
// aspect (1344x768 = 1.75):
//   window aspect = (FRAME_W·WIN_W_FRAC)/(FRAME_H·WIN_H_FRAC) = ART
// which kills the drift that made the art overflow its cut-out on the
// sides and float with dark strips top/bottom. The solved frame plane is
// 0.776 x 0.465 world units — inside the 0.8 layout pitch, so neighbours
// no longer overlap either.
const ART_ASPECT = W / H; // 1.75
const WIN_H_FRAC = 0.86;
const WIN_W_FRAC = 0.915;
const FRAME_W = Math.round(FRAME_H * ((ART_ASPECT * WIN_H_FRAC) / WIN_W_FRAC)); // ≈1355

/**
 * The frame's own texture: brushed dark aluminium surround + white mat
 * with a bevelled cut-out. Drawn at FRAME_W/H (the poster sits at 1344x768
 * centered on the mat), so the frame mesh and the artwork mesh are fully
 * independent — swap the art without touching the frame.
 */
export function createFrameTexture(): THREE.CanvasTexture {
  const [canvas, x] = newCanvas(FRAME_W, FRAME_H);

  const winW = Math.round(FRAME_W * WIN_W_FRAC);
  const winH = Math.round(FRAME_H * WIN_H_FRAC);
  const winX = Math.round((FRAME_W - winW) / 2);
  const winY = Math.round((FRAME_H - winH) / 2);

  // outer aluminium — layered strokes for a brushed look
  x.fillStyle = '#23262b';
  x.fillRect(0, 0, FRAME_W, FRAME_H);
  const sheen = x.createLinearGradient(0, 0, FRAME_W, FRAME_H);
  sheen.addColorStop(0, 'rgba(255,255,255,0.10)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0.02)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.22)');
  x.fillStyle = sheen;
  x.fillRect(0, 0, FRAME_W, FRAME_H);

  // white mat, inside a 26px aluminium lip
  const mat = 26;
  x.fillStyle = '#e8e6e1';
  x.fillRect(mat, mat, FRAME_W - mat * 2, FRAME_H - mat * 2);

  // mat bevel — the classic double line around the cut-out
  x.strokeStyle = '#c9c5bd';
  x.lineWidth = 3;
  x.strokeRect(winX - 8, winY - 8, winW + 16, winH + 16);
  x.strokeStyle = '#b4afa6';
  x.lineWidth = 2;
  x.strokeRect(winX - 4, winY - 4, winW + 8, winH + 8);

  // the window itself is covered by the poster mesh on top — fill dark so
  // a 1px gap at the edges never flashes white
  x.fillStyle = '#101216';
  x.fillRect(winX, winY, winW, winH);

  const tex = new THREE.CanvasTexture(canvas);
  // see createPosterTexture — sRGB via the legacy encoding slot
  (tex as unknown as { encoding: number }).encoding = 3001;
  tex.anisotropy = 8;
  return tex;
}

/** frame texture's artwork window rect in 0..1 UV space */
export function frameWindowUV(): {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
} {
  return {
    u0: (1 - WIN_W_FRAC) / 2,
    u1: (1 + WIN_W_FRAC) / 2,
    v0: (1 - WIN_H_FRAC) / 2,
    v1: (1 + WIN_H_FRAC) / 2,
  };
}
