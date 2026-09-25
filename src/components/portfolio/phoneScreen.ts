import * as THREE from 'three';

/**
 * Phone screen content rendered to a canvas texture — a real portrait phone
 * UI. Two states:
 *  - idle:    lock screen (live clock, date, padlock, a "Contacts"
 *             notification, a GitHub notification, quick actions)
 *  - contact: contacts app opened when the phone is picked up off the desk
 *             (avatar header, GitHub / website / location / stack rows,
 *             status pill) — the GitHub/website rows are tappable through
 *             hitTest() when the 3D screen is clicked.
 *
 * Texture orientation: the room.glb "Mobile Screen" quad is a portrait
 * rectangle whose uv `v` axis is the LONG side. With flipY=false and
 * texture rotation PI the canvas' top edge runs along the geometry's +v
 * axis, so when the phone stands up with +v pointing at the sky the UI
 * reads upright (see computeStandPose() in PortfolioExperience.tsx).
 *
 * The canvas aspect (width/height) is passed in by measuring the real quad
 * at runtime, so the UI is never stretched.
 */

export interface PhoneScreen {
  texture: THREE.CanvasTexture;
  drawIdle: () => void;
  drawContact: () => void;
  /** map a screen-space uv hit to a contact row url (or null) */
  hitTest: (u: number, v: number) => string | null;
  dispose: () => void;
}

const H = 1160; // design-space height — all layout math stays in these units
const SCALE = 2; // canvas is rendered at 2x design size so the phone UI
// stays crisp when the camera flies in close (high-DPI screens too)
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const ACCENT = '#34d399';
const TEXT = '#eef3f9';
const MUTED = '#93a0b4';

// 24x24 SVG glyph paths reused for the canvas icons
const GITHUB_PATH =
  'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12';
const PIN_PATH =
  'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z';

function rr(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  c.beginPath();
  if (typeof c.roundRect === 'function') {
    c.roundRect(x, y, w, h, r);
    return;
  }
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function fillPath(
  c: CanvasRenderingContext2D,
  pathData: string,
  cx: number,
  cy: number,
  half: number,
  color: string
): void {
  const p = new Path2D(pathData);
  c.save();
  c.translate(cx - half, cy - half);
  c.scale((half * 2) / 24, (half * 2) / 24);
  c.fillStyle = color;
  c.fill(p);
  c.restore();
}

function drawGlobe(
  c: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number
): void {
  c.strokeStyle = '#e8f0f8';
  c.lineWidth = Math.max(3, r * 0.16);
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.stroke();
  c.beginPath();
  c.moveTo(cx - r, cy);
  c.lineTo(cx + r, cy);
  c.stroke();
  c.beginPath();
  c.ellipse(cx, cy, r * 0.52, r, 0, 0, Math.PI * 2);
  c.stroke();
}

function drawTerminal(
  c: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  half: number
): void {
  c.strokeStyle = '#e8f0f8';
  c.lineWidth = Math.max(3, half * 0.14);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  rr(c, cx - half, cy - half * 0.78, half * 2, half * 1.56, half * 0.3);
  c.stroke();
  const s = half * 0.42;
  c.beginPath();
  c.moveTo(cx - half * 0.55, cy - s * 0.4);
  c.lineTo(cx - half * 0.15, cy);
  c.lineTo(cx - half * 0.55, cy + s * 0.4);
  c.stroke();
  c.beginPath();
  c.moveTo(cx - half * 0.02, cy + s * 0.42);
  c.lineTo(cx + half * 0.55, cy + s * 0.42);
  c.stroke();
}

function timeParts(): { hh: string; mm: string; date: string } {
  const now = new Date();
  return {
    hh: String(now.getHours()).padStart(2, '0'),
    mm: String(now.getMinutes()).padStart(2, '0'),
    date: now.toLocaleDateString('en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }),
  };
}

interface ContactRow {
  icon: 'github' | 'globe' | 'pin' | 'term';
  label: string;
  value: string;
  url: string | null;
}

const CONTACT_ROWS: ContactRow[] = [
  {
    icon: 'github',
    label: 'GITHUB',
    value: 'github.com/navairgap',
    url: 'https://github.com/navairgap',
  },
  {
    icon: 'globe',
    label: 'WEBSITE',
    value: 'navairgap.github.io',
    url: 'https://navairgap.github.io',
  },
  { icon: 'pin', label: 'LOCATION', value: 'Pune, India', url: null },
  { icon: 'term', label: 'STACK', value: 'Python · C · Linux', url: null },
];

export function createPhoneScreen(aspect: number): PhoneScreen {
  const W = Math.round(THREE.MathUtils.clamp(H * aspect, 320, H));
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const c = canvas.getContext('2d');
  if (!c) {
    throw new Error('2D canvas context unavailable');
  }
  // draw everything in design units — the canvas itself is 2x for sharpness
  c.scale(SCALE, SCALE);

  const texture = new THREE.CanvasTexture(canvas);
  // glTF UV convention (matches how the rest of the room textures are set up)
  texture.flipY = false;
  texture.anisotropy = 8;
  // rotation PI: the canvas' top edge runs along the quad's +v axis (the
  // long side) — upright once the phone stands up vertically
  texture.center.set(0.5, 0.5);
  texture.rotation = Math.PI;

  // tap targets (canvas px) filled in by drawContact, cleared by drawIdle
  let hitRects: { x: number; y: number; w: number; h: number; url: string }[] =
    [];

  function baseBackground(top: string, bottom: string): void {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    // faint grid, terminal vibe
    c.strokeStyle = 'rgba(110, 140, 210, 0.06)';
    c.lineWidth = 1;
    for (let i = 76; i < Math.max(W, H); i += 76) {
      if (i < W) {
        c.beginPath();
        c.moveTo(i, 0);
        c.lineTo(i, H);
        c.stroke();
      }
      c.beginPath();
      c.moveTo(0, i);
      c.lineTo(W, i);
      c.stroke();
    }
  }

  function drawStatusBar(): void {
    const { hh, mm } = timeParts();

    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.fillStyle = '#dfe6f0';
    c.font = `600 40px ${MONO}`;
    c.fillText(`${hh}:${mm}`, 44, 76);

    // --- status icons, laid out right-to-left with real gaps so they can
    // never cross each other: [clock] ... [signal bars] [wifi] [battery]
    const right = W - 44;

    // battery (rightmost): 58px cell + 5px nub
    const batW = 58;
    const batH = 27;
    const batX = right - 5 - batW;
    const batY = 48;
    c.strokeStyle = 'rgba(223,230,240,0.6)';
    c.lineWidth = 4;
    rr(c, batX, batY, batW, batH, 8);
    c.stroke();
    c.fillStyle = ACCENT;
    rr(c, batX + 5, batY + 5, batW - 14, batH - 10, 4);
    c.fill();
    c.fillStyle = 'rgba(223,230,240,0.6)';
    rr(c, right - 5, batY + batH / 2 - 6, 5, 12, 2);
    c.fill();

    // wifi: 26px-radius arcs, 22px clear of the battery
    const wx = batX - 22 - 26;
    const wy = 76;
    c.strokeStyle = '#dfe6f0';
    c.lineWidth = 5.5;
    c.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const r = 8 + i * 9;
      c.beginPath();
      c.arc(wx, wy, r, Math.PI * 1.25, Math.PI * 1.75);
      c.stroke();
    }
    c.fillStyle = '#dfe6f0';
    c.beginPath();
    c.arc(wx, wy - 2, 5.5, 0, Math.PI * 2);
    c.fill();

    // signal bars: 4 bars, 22px clear of the wifi icon
    const barsRight = wx - 26 - 22;
    for (let i = 0; i < 4; i++) {
      const bh = 12 + i * 7;
      c.fillStyle = i === 3 ? 'rgba(223,230,240,0.35)' : '#dfe6f0';
      rr(c, barsRight - 57 + i * 16, 78 - bh, 9, bh, 3);
      c.fill();
    }
  }

  function drawHomeIndicator(): void {
    c.fillStyle = 'rgba(255,255,255,0.35)';
    rr(c, W / 2 - 110, H - 30, 220, 10, 5);
    c.fill();
  }

  function drawPadlock(cx: number, cy: number): void {
    c.strokeStyle = '#9fb0c4';
    c.lineWidth = 10;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(cx, cy - 11, 24, Math.PI, 0);
    c.stroke();

    c.fillStyle = '#c6d2e0';
    rr(c, cx - 32, cy - 12, 64, 52, 12);
    c.fill();

    c.fillStyle = '#0a0f18';
    c.beginPath();
    c.arc(cx, cy + 11, 8, 0, Math.PI * 2);
    c.fill();
    rr(c, cx - 4, cy + 13, 8, 17, 4);
    c.fill();
  }

  // ------------------------------------------------------------------
  // LOCK SCREEN (idle, phone lying on the desk)
  // ------------------------------------------------------------------
  function drawIdle(): void {
    hitRects = [];
    baseBackground('#04060b', '#0a1322');

    // soft glow behind the clock
    const rg = c.createRadialGradient(W / 2, 380, 10, W / 2, 380, 340);
    rg.addColorStop(0, 'rgba(52, 211, 153, 0.14)');
    rg.addColorStop(1, 'rgba(52, 211, 153, 0)');
    c.fillStyle = rg;
    c.fillRect(0, 0, W, H);

    drawStatusBar();
    drawPadlock(W / 2, 190);

    const { hh, mm, date } = timeParts();

    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.fillStyle = '#f2f6fb';
    c.font = `600 128px ${MONO}`;
    c.fillText(`${hh}:${mm}`, W / 2, 400);
    c.fillStyle = MUTED;
    c.font = `500 30px ${MONO}`;
    c.fillText(date, W / 2, 452);

    // notification card — contacts
    const nx = 36;
    const nw = W - 72;
    let ny = 540;
    let nh = 168;
    rr(c, nx, ny, nw, nh, 30);
    c.fillStyle = 'rgba(255,255,255,0.07)';
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.10)';
    c.lineWidth = 2;
    c.stroke();

    // app icon (person glyph)
    rr(c, nx + 26, ny + 36, 92, 92, 24);
    c.fillStyle = 'rgba(52,211,153,0.16)';
    c.fill();
    c.strokeStyle = 'rgba(52,211,153,0.4)';
    c.stroke();
    c.fillStyle = ACCENT;
    c.beginPath();
    c.arc(nx + 72, ny + 68, 18, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(nx + 47, ny + 114);
    c.quadraticCurveTo(nx + 72, ny + 84, nx + 97, ny + 114);
    c.closePath();
    c.fill();

    c.textAlign = 'left';
    c.fillStyle = '#aab6c6';
    c.font = `600 23px ${MONO}`;
    c.fillText('CONTACTS  \u00b7  now', nx + 142, ny + 58);
    c.fillStyle = '#f2f6fb';
    c.font = `600 32px ${MONO}`;
    c.fillText('tap for my contacts', nx + 142, ny + 108);

    // notification card — github
    ny = 540 + 168 + 18;
    nh = 150;
    rr(c, nx, ny, nw, nh, 30);
    c.fillStyle = 'rgba(255,255,255,0.05)';
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.08)';
    c.stroke();

    rr(c, nx + 26, ny + 32, 86, 86, 22);
    c.fillStyle = 'rgba(255,255,255,0.08)';
    c.fill();
    fillPath(c, GITHUB_PATH, nx + 69, ny + 75, 22, '#dfe6f0');

    c.fillStyle = '#aab6c6';
    c.font = `600 23px ${MONO}`;
    c.fillText('GITHUB  \u00b7  2m ago', nx + 142, ny + 56);
    c.fillStyle = '#f2f6fb';
    c.font = `600 30px ${MONO}`;
    c.fillText('new star \u2014 SentinelWiFi', nx + 142, ny + 102);

    // quick actions (flashlight / camera)
    const qy = 1000;
    for (const qx of [W / 2 - 130, W / 2 + 130]) {
      c.beginPath();
      c.arc(qx, qy, 50, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,0.09)';
      c.fill();
    }
    // flashlight glyph
    c.fillStyle = '#dfe6f0';
    rr(c, W / 2 - 130 - 12, qy - 24, 24, 36, 6);
    c.fill();
    rr(c, W / 2 - 130 - 18, qy - 30, 36, 10, 4);
    c.fill();
    // camera glyph
    const ccx = W / 2 + 130;
    rr(c, ccx - 23, qy - 14, 46, 32, 8);
    c.fill();
    c.fillStyle = 'rgba(10,15,24,0.9)';
    c.beginPath();
    c.arc(ccx, qy + 2, 10, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#dfe6f0';
    rr(c, ccx - 7, qy - 21, 14, 9, 3);
    c.fill();

    drawHomeIndicator();

    texture.needsUpdate = true;
  }

  // ------------------------------------------------------------------
  // CONTACTS APP (phone picked up, standing vertically)
  // ------------------------------------------------------------------
  function drawContactRow(row: ContactRow, y: number): void {
    const x = 44;
    const w = W - 88;
    const h = 100;
    rr(c, x, y, w, h, 24);
    c.fillStyle = row.url
      ? 'rgba(255,255,255,0.07)'
      : 'rgba(255,255,255,0.045)';
    c.fill();
    c.strokeStyle = row.url
      ? 'rgba(52,211,153,0.30)'
      : 'rgba(255,255,255,0.08)';
    c.lineWidth = 2;
    c.stroke();

    // accent bar
    c.fillStyle = ACCENT;
    rr(c, x, y + 20, 5, h - 40, 3);
    c.fill();

    // icon tile
    const ix = x + 20;
    const iy = y + 19;
    const is = 62;
    rr(c, ix, iy, is, is, 16);
    c.fillStyle = 'rgba(52,211,153,0.14)';
    c.fill();
    c.strokeStyle = 'rgba(52,211,153,0.35)';
    c.stroke();
    if (row.icon === 'github') {
      fillPath(c, GITHUB_PATH, ix + is / 2, iy + is / 2, 17, '#e8f0f8');
    } else if (row.icon === 'globe') {
      drawGlobe(c, ix + is / 2, iy + is / 2, 17);
    } else if (row.icon === 'pin') {
      fillPath(c, PIN_PATH, ix + is / 2, iy + is / 2, 15, '#e8f0f8');
    } else {
      drawTerminal(c, ix + is / 2, iy + is / 2, 17);
    }

    c.textAlign = 'left';
    c.fillStyle = '#8b96a8';
    c.font = `600 21px ${MONO}`;
    c.fillText(row.label, ix + is + 16, y + 36);
    c.fillStyle = TEXT;
    c.font = `600 28px ${MONO}`;
    c.fillText(row.value, ix + is + 16, y + 72);

    if (row.url) {
      hitRects.push({ x, y, w, h, url: row.url });
    }
  }

  function drawContact(): void {
    hitRects = [];
    baseBackground('#070b12', '#0c1424');

    // green wash from the top
    const rg = c.createRadialGradient(W / 2, 150, 8, W / 2, 150, 420);
    rg.addColorStop(0, 'rgba(52, 211, 153, 0.18)');
    rg.addColorStop(1, 'rgba(52, 211, 153, 0)');
    c.fillStyle = rg;
    c.fillRect(0, 0, W, H);

    drawStatusBar();

    // app title
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.fillStyle = ACCENT;
    c.font = `600 31px ${MONO}`;
    c.fillText('\u2039  CONTACTS', W / 2, 162);

    // avatar
    const ax = W / 2;
    const ay = 296;
    const ar = 96;
    c.beginPath();
    c.arc(ax, ay, ar + 8, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(52,211,153,0.35)';
    c.lineWidth = 3;
    c.stroke();
    const ag = c.createRadialGradient(ax, ay - ar * 0.4, 8, ax, ay, ar);
    ag.addColorStop(0, '#4be0ab');
    ag.addColorStop(1, '#0d9e6c');
    c.beginPath();
    c.arc(ax, ay, ar, 0, Math.PI * 2);
    c.fillStyle = ag;
    c.fill();
    c.fillStyle = '#04241a';
    c.font = `800 106px ${MONO}`;
    c.fillText('N', ax, ay + 38);

    // name + handle
    c.fillStyle = TEXT;
    c.font = `800 60px ${MONO}`;
    c.fillText('NAV', ax, 478);
    c.fillStyle = MUTED;
    c.font = `500 27px ${MONO}`;
    c.fillText('@navairgap', ax, 520);
    c.fillStyle = '#6f7d90';
    c.font = `500 23px ${MONO}`;
    c.fillText('defense-first developer', ax, 552);

    CONTACT_ROWS.forEach((row, i) => drawContactRow(row, 600 + i * 112));

    // status pill
    const pw = Math.min(W - 110, 420);
    const px = (W - pw) / 2;
    const py = 1062;
    rr(c, px, py, pw, 50, 25);
    c.fillStyle = 'rgba(52,211,153,0.12)';
    c.fill();
    c.strokeStyle = 'rgba(52,211,153,0.4)';
    c.lineWidth = 2;
    c.stroke();
    c.fillStyle = ACCENT;
    c.beginPath();
    c.arc(px + 36, py + 25, 9, 0, Math.PI * 2);
    c.fill();
    c.textAlign = 'left';
    c.fillStyle = '#7ee7b8';
    c.font = `600 22px ${MONO}`;
    c.fillText('OPEN TO COLLABORATION', px + 58, py + 33);

    // footnote
    c.textAlign = 'center';
    c.fillStyle = '#5f6b7d';
    c.font = `500 20px ${MONO}`;
    c.fillText('tap a row to open \u00b7 esc to close', W / 2, H - 48);

    drawHomeIndicator();

    texture.needsUpdate = true;
  }

  /**
   * Screen-space uv → canvas px (inverse of the texture transform):
   * rotation PI + flipY=false means canvas x = (1-u)·W, canvas y = (1-v)·H.
   */
  function hitTest(u: number, v: number): string | null {
    const cx = (1 - u) * W;
    const cy = (1 - v) * H;
    for (const r of hitRects) {
      if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) {
        return r.url;
      }
    }
    return null;
  }

  drawIdle();

  return {
    texture,
    drawIdle,
    drawContact,
    hitTest,
    dispose: () => texture.dispose(),
  };
}
