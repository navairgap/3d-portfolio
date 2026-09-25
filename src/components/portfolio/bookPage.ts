import * as THREE from 'three';

/**
 * "About me" notebook page, drawn to a canvas texture with real typesetting
 * so every line is measured and placed on a strict grid:
 *  - ONE left margin shared by the title, subtitle, body, quote bar and pills
 *  - word-wrapped body with constant leading (no hand-placed lines)
 *  - numbered editorial sections (01 PROFILE / 02 STACK) with rules
 *
 * SHARPNESS: the canvas renders at 1.5x the page's coordinate system
 * (1785x2526 backing a 1190x1684 design grid) so every glyph rasterizes
 * from vector outlines at supersampled size — combined with 16x
 * anisotropy the page reads crisp both minified on the desk and in the
 * close-up About view, on any DPR.
 *
 * FONTS: Poppins faces used here are 400/500/600/700 + italic 400/500,
 * matching the Google Fonts link in layout.tsx. Every face is explicitly
 * requested through document.fonts.load() and the page redraws once they
 * arrive — the first paint may use the fallback, the crisp webfont
 * replaces it moments later.
 *
 * The canvas keeps the A4 proportions of the page quad in room.glb
 * (595x842 at 2x = 1190x1684 design units) and is drawn top-down like
 * the original book-inner.jpg, so with flipY=false it maps onto the mesh
 * identically.
 */

const SCALE = 1.5; // supersampling factor
const W = 1190; // design width  (A4 595 @2x)
const H = 1684; // design height (A4 842 @2x)
const M = 96; // page margin — every block aligns its left edge here
const CW = W - M * 2; // content width

const SANS = "'Poppins', ui-sans-serif, system-ui, 'DejaVu Sans', sans-serif";
const MONO =
  "ui-monospace, 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace";

const PAPER = '#f8f5ee';
const INK = '#171f27';
const BODY = '#242a33';
const MUTED = '#5a6472';
const FAINT = '#8a8375';
const RULE = '#ddd6c8';
const ACCENT = '#e06d6d';
const GREEN = '#34d399';

const GITHUB_PATH =
  'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12';

function setLS(c: CanvasRenderingContext2D, px: number): void {
  // letterSpacing is Chromium 99+; assigning it where unsupported is a no-op
  try {
    (c as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
      `${px}px`;
  } catch {
    /* not supported — fine */
  }
}

interface Tok {
  text: string;
  medium?: boolean;
}

/** measure + wrap styled word tokens to a max width, constant leading */
function wrapTokens(
  c: CanvasRenderingContext2D,
  tokens: Tok[],
  maxW: number,
  size: number
): Tok[][] {
  const lines: Tok[][] = [];
  let line: Tok[] = [];
  let x = 0;
  const spaceW = (w: string) => {
    c.font = `${w} ${size}px ${SANS}`;
    return c.measureText(' ').width;
  };
  for (const tok of tokens) {
    c.font = `${tok.medium ? 500 : 400} ${size}px ${SANS}`;
    const w = c.measureText(tok.text).width;
    const sw = spaceW(tok.medium ? '500' : '400');
    if (line.length > 0 && x + sw + w > maxW) {
      lines.push(line);
      line = [];
      x = 0;
    }
    if (line.length > 0) x += sw;
    x += w;
    line.push(tok);
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

function drawTokens(
  c: CanvasRenderingContext2D,
  lines: Tok[][],
  x0: number,
  y0: number,
  size: number,
  leading: number,
  color: string,
  mediumColor?: string
): number {
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  lines.forEach((line, li) => {
    let x = x0;
    line.forEach((tok) => {
      const w = tok.medium ? '600' : '400';
      c.font = `${w} ${size}px ${SANS}`;
      c.fillStyle = tok.medium && mediumColor ? mediumColor : color;
      c.fillText(tok.text, x, y0 + li * leading);
      x += c.measureText(tok.text).width + c.measureText(' ').width;
    });
  });
  return y0 + (lines.length - 1) * leading;
}

/** wrap a plain string (italic quote) */
function wrapPlain(
  c: CanvasRenderingContext2D,
  text: string,
  font: string,
  maxW: number
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  c.font = font;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (line && c.measureText(test).width > maxW) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

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

/** editorial section label: coral tick + spaced mono caps + hairline rule */
function sectionLabel(
  c: CanvasRenderingContext2D,
  text: string,
  y: number
): void {
  c.fillStyle = ACCENT;
  c.fillRect(M, y - 17, 26, 9);
  setLS(c, 5);
  c.font = `600 23px ${MONO}`;
  c.fillStyle = MUTED;
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  c.fillText(text, M + 42, y);
  setLS(c, 0);
  const lw = c.measureText(text).width;
  c.fillStyle = RULE;
  c.fillRect(M + 42 + lw + 24, y - 10, CW - 42 - lw - 24, 3);
}

export function createBookPage(): {
  texture: THREE.CanvasTexture;
  dispose: () => void;
} {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * SCALE);
  canvas.height = Math.round(H * SCALE);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas context unavailable');
  }
  // non-nullable alias — nested helper functions read `c` and TypeScript
  // does not propagate the guard's narrowing into hoisted declarations
  const c = ctx;
  // supersample: keep authoring in the 1190x1684 design grid
  c.scale(SCALE, SCALE);

  const texture = new THREE.CanvasTexture(canvas);
  // same mapping as the original book-inner.jpg (glTF UV convention)
  texture.flipY = false;
  // grazing angles + heavy minification on the desk — max anisotropy
  // keeps the page readable before the About close-up
  texture.anisotropy = 16;

  function draw(): void {
    c.clearRect(0, 0, W, H);
    // ------------------------------------------------------------ paper
    c.fillStyle = PAPER;
    c.fillRect(0, 0, W, H);

    // notebook margin rule — the classic red editorial margin line
    c.fillStyle = 'rgba(224, 109, 109, 0.34)';
    c.fillRect(58, 300, 3, 1252);

    // ------------------------------------------------------ header band
    const HEAD_H = 258;
    c.fillStyle = INK;
    c.fillRect(0, 0, W, HEAD_H);
    c.fillStyle = ACCENT;
    c.fillRect(0, HEAD_H - 6, W, 6);

    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    setLS(c, 3);
    c.fillStyle = '#f2f5f9';
    c.font = `700 84px ${SANS}`;
    c.fillText('NAVAIRGAP', M, 146);
    setLS(c, 4);
    c.fillStyle = '#9aa3ad';
    c.font = `600 24px ${SANS}`;
    c.fillText('SECURITY RESEARCHER · BACKEND DEVELOPER', M, 200);
    setLS(c, 0);

    // terminal dots, top right
    const dots = ['#f08080', '#e8c07a', GREEN];
    dots.forEach((col, i) => {
      c.beginPath();
      c.arc(W - M - (dots.length - 1 - i) * 34, 70, 9, 0, Math.PI * 2);
      c.fillStyle = col;
      c.fill();
    });

    // shell prompt, right-aligned on the subtitle baseline
    c.textAlign = 'right';
    c.font = `500 27px ${MONO}`;
    c.fillStyle = GREEN;
    c.fillText('$ ~/navairgap', W - M, 200);
    c.textAlign = 'left';

    // ------------------------------------------------- 01 · profile
    sectionLabel(c, '01 · PROFILE', 352);

    let y = 516;
    c.fillStyle = INK;
    c.font = `700 168px ${SANS}`;
    c.fillText('NAV', M, y);
    // coral full stop — the brand mark of the page
    const navW = c.measureText('NAV').width;
    c.fillStyle = ACCENT;
    c.fillText('.', M + navW + 6, y);

    // kicker — auto-shrink so it never exceeds the content width
    const KICKER = 'DEFENSE-FIRST · PUNE, INDIA · LEARNING IN PUBLIC';
    let kSize = 30;
    for (; kSize > 20; kSize -= 1) {
      setLS(c, 6);
      c.font = `600 ${kSize}px ${SANS}`;
      const w = c.measureText(KICKER).width;
      if (w <= CW) break;
    }
    y += 78;
    c.fillStyle = MUTED;
    c.font = `600 ${kSize}px ${SANS}`;
    c.fillText(KICKER, M, y);
    setLS(c, 0);

    // ------------------------------------------------------ body copy
    const BODY_TEXT =
      "Hello, I'm NAV — a defense-first developer from Pune, India. I build passive, local-first security tools like SentinelWiFi and real-time backend systems with Python, Socket.IO, C and Linux. I learn in public — networking → security → C → operating systems — documenting every step of the way.";
    const emphasis = new Set([
      'NAV',
      'SentinelWiFi',
      'Python,',
      'Socket.IO,',
      'C',
      'Linux.',
    ]);
    const tokens: Tok[] = BODY_TEXT.split(' ').map((t) => ({
      text: t,
      medium: emphasis.has(t),
    }));
    const bodySize = 35;
    const bodyLeading = 56;
    const bodyLines = wrapTokens(c, tokens, CW, bodySize);
    const bodyEnd = drawTokens(
      c,
      bodyLines,
      M,
      y + 110,
      bodySize,
      bodyLeading,
      BODY,
      ACCENT
    );

    // ---------------------------------------------------------- quote
    // (inside section 01 — the personal statement closes the profile)
    const QUOTE =
      '\u201CThe best security tool is the one that\u2019s honest about what it doesn\u2019t do.\u201D';
    const qFont = `italic 500 38px ${SANS}`;
    const qIndent = 58;
    const qLines = wrapPlain(c, QUOTE, qFont, CW - qIndent - 26);
    const qLeading = 62;
    const qTop = bodyEnd + 78;
    const qSize = qLines.length * qLeading;

    // accent bar flush with the shared left margin
    c.fillStyle = ACCENT;
    c.fillRect(M, qTop - 42, 7, qSize + 16);

    // oversized opening quote mark hanging beside the first line
    c.font = `700 88px ${SANS}`;
    c.fillStyle = 'rgba(224, 109, 109, 0.5)';
    c.fillText('\u201C', M + 16, qTop + 24);

    c.font = qFont;
    c.fillStyle = '#3d4550';
    qLines.forEach((line, i) => {
      c.fillText(line, M + qIndent + 26, qTop + i * qLeading);
    });

    // --------------------------------------------------- 02 · stack
    const stackY = qTop + qSize + 76;
    sectionLabel(c, '02 · STACK', stackY);

    const chips: string[][] = [
      ['Python', 'C', 'Linux', 'Socket.IO'],
      ['Networking', 'Git', 'Vim', 'Bash'],
    ];
    const chipFont = `500 26px ${MONO}`;
    c.font = chipFont;
    const chipH = 58;
    const chipGap = 18;
    let cy = stackY + 28;
    chips.forEach((row) => {
      let cx = M;
      row.forEach((label) => {
        const tw = c.measureText(label).width;
        const cw = 20 + 14 + 12 + tw + 24;
        rr(c, cx, cy, cw, chipH, 29);
        c.fillStyle = 'rgba(23, 31, 39, 0.05)';
        c.fill();
        c.strokeStyle = 'rgba(23, 31, 39, 0.30)';
        c.lineWidth = 2.5;
        c.stroke();
        // coral tick
        c.fillStyle = ACCENT;
        c.fillRect(cx + 20, cy + chipH / 2 - 6, 11, 12);
        c.font = chipFont;
        c.fillStyle = INK;
        c.textAlign = 'left';
        c.textBaseline = 'alphabetic';
        c.fillText(label, cx + 20 + 14 + 12, cy + chipH / 2 + 9);
        cx += cw + chipGap;
      });
      cy += chipH + 18;
    });

    // ------------------------------------------------------- link pills
    const pillY = cy + 26;
    const pillH = 72;
    const pillFont = `500 28px ${MONO}`;
    c.font = pillFont;
    const label1 = 'github.com/navairgap';
    const label2 = 'navairgap.github.io';
    const padX = 30;
    const glyph = 34;
    const w1 = padX + glyph + 18 + c.measureText(label1).width + padX;
    const w2 = padX + glyph + 18 + c.measureText(label2).width + padX;

    const drawPill = (
      px: number,
      pw: number,
      label: string,
      kind: 'github' | 'globe'
    ): void => {
      rr(c, px, pillY, pw, pillH, 36);
      c.fillStyle = 'rgba(23, 31, 39, 0.05)';
      c.fill();
      c.strokeStyle = 'rgba(23, 31, 39, 0.30)';
      c.lineWidth = 2.5;
      c.stroke();

      const chy = pillY + pillH / 2;
      if (kind === 'github') {
        const p = new Path2D(GITHUB_PATH);
        c.save();
        c.translate(px + padX, chy - glyph / 2);
        c.scale(glyph / 24, glyph / 24);
        c.fillStyle = INK;
        c.fill(p);
        c.restore();
      } else {
        c.strokeStyle = ACCENT;
        c.lineWidth = 3.5;
        c.beginPath();
        c.arc(px + padX + glyph / 2, chy, glyph / 2, 0, Math.PI * 2);
        c.stroke();
        c.beginPath();
        c.moveTo(px + padX, chy);
        c.lineTo(px + padX + glyph, chy);
        c.stroke();
        c.beginPath();
        c.ellipse(
          px + padX + glyph / 2,
          chy,
          glyph * 0.26,
          glyph / 2,
          0,
          0,
          Math.PI * 2
        );
        c.stroke();
      }

      c.font = pillFont;
      c.fillStyle = INK;
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
      c.fillText(label, px + padX + glyph + 18, chy + 10);
    };

    drawPill(M, w1, label1, 'github');
    drawPill(M + w1 + 26, w2, label2, 'globe');

    // ---------------------------------------------------------- footer
    const fy = 1622;
    c.fillStyle = RULE;
    c.fillRect(M, fy - 56, CW, 3);
    c.font = `500 24px ${MONO}`;
    c.fillStyle = FAINT;
    c.textAlign = 'left';
    c.fillText('NAVAIRGAP — FIELD NOTES', M, fy);
    c.textAlign = 'right';
    c.fillText('ABOUT · 01', W - M, fy);
    c.textAlign = 'left';

    texture.needsUpdate = true;
  }

  draw();

  // redraw once the real webfonts are in — every face used on this page
  // is requested explicitly (weights 400/500/600/700 + italic 400/500)
  // so the canvas never renders a synthesized or fallback glyph
  if (typeof document !== 'undefined' && document.fonts) {
    const redraw = (): void => {
      draw();
    };
    const faces = [
      `400 20px ${SANS}`,
      `500 20px ${SANS}`,
      `600 20px ${SANS}`,
      `700 20px ${SANS}`,
      `italic 400 38px ${SANS}`,
      `italic 500 38px ${SANS}`,
    ];
    Promise.all(faces.map((f) => document.fonts.load(f).catch(() => {})))
      .then(redraw)
      .catch(() => {});
    document.fonts.ready.then(redraw).catch(() => {});
  }

  return {
    texture,
    dispose: () => texture.dispose(),
  };
}
