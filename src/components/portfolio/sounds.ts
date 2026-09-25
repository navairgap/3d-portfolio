/**
 * Tiny WebAudio synth for UI feedback sounds.
 *
 * The keypress sound is a layered physical model of a mechanical key
 * switch (Cherry-MX style "thock") built from three parts:
 *  1. CLICK  — a very short band-passed noise burst (the plastic stem
 *     hitting the housing; this is what makes it read as a REAL key
 *     instead of an electronic beep)
 *  2. KNOCK  — a resonant mid-frequency ping (~900 Hz) that gives the
 *     cap its "hollow plastic" character
 *  3. THOCK  — a damped low sine with a fast pitch drop (the case/body
 *     resonance you feel in a heavy keyboard)
 * Every press randomises pitch, gain and stereo position so bursts of
 * typing sound organic; the spacebar gets a deeper, rounder voice.
 *
 * Zero audio assets — everything is synthesized, so it only ever
 * initialises after a user gesture (browser autoplay policy).
 */

let ctx: AudioContext | null = null;
let enabled = false;
let noiseBuf: AudioBuffer | null = null;

export function setSoundEnabled(value: boolean): void {
  enabled = value;
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    return ctx;
  } catch {
    return null;
  }
}

/** Shared white-noise buffer (reused by every noise hit). */
function getNoise(audio: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    const len = Math.floor(audio.sampleRate * 0.15);
    noiseBuf = audio.createBuffer(1, len, audio.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }
  return noiseBuf;
}

/**
 * Band-passed noise hit — the transient "tick" layer.
 * Starts at full gain and decays exponentially, like an impact.
 */
function noiseHit(
  audio: AudioContext,
  t0: number,
  freq: number,
  q: number,
  gainV: number,
  dur: number,
  pan: number
): void {
  const src = audio.createBufferSource();
  src.buffer = getNoise(audio);
  src.playbackRate.value = 0.9 + Math.random() * 0.2;

  const bp = audio.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = q;

  const hp = audio.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = Math.max(120, freq * 0.35);

  const g = audio.createGain();
  g.gain.setValueAtTime(gainV, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  const p = audio.createStereoPanner
    ? audio.createStereoPanner()
    : null;
  if (p) p.pan.value = pan;

  src.connect(bp);
  bp.connect(hp);
  hp.connect(g);
  if (p) {
    g.connect(p);
    p.connect(audio.destination);
  } else {
    g.connect(audio.destination);
  }
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

/**
 * Damped sine "thock" — pitch drops as the impact settles, exactly like
 * a key bottoming out on a plate.
 */
function thock(
  audio: AudioContext,
  t0: number,
  startFreq: number,
  endFreq: number,
  gainV: number,
  dur: number
): void {
  const osc = audio.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(startFreq, t0);
  osc.frequency.exponentialRampToValueAtTime(
    Math.max(30, endFreq),
    t0 + dur
  );
  const g = audio.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gainV, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(audio.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Resonant mid "knock" — the hollow plastic cap ping. */
function knock(
  audio: AudioContext,
  t0: number,
  freq: number,
  gainV: number,
  dur: number
): void {
  const osc = audio.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, t0);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.72, t0 + dur);
  const g = audio.createGain();
  g.gain.setValueAtTime(gainV, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(audio.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/**
 * Mechanical keypress. Pass the key label for per-key voicing —
 * 'SPACE' gets a deeper, rounder sound, wide keys (SHIFT/ENTER/BACKSPACE)
 * get a slightly lower voice than letter keys.
 */
export function playKeyClick(label?: string | null): void {
  if (!enabled) return;
  const audio = getCtx();
  if (!audio) return;

  const isSpace = label === 'SPACE';
  const isWide =
    !isSpace &&
    !!label &&
    ['SHIFT', 'ENTER', 'BKSP', 'TAB', 'CAPS', 'CTRL'].includes(label);

  const detune = 0.88 + Math.random() * 0.26;
  const vol = 0.8 + Math.random() * 0.4;
  const pan = randomPan();
  const t0 = audio.currentTime + 0.001;

  // 1. CLICK — the plastic impact transient
  noiseHit(
    audio,
    t0,
    (isSpace ? 1500 : isWide ? 2100 : 2700) * detune,
    isSpace ? 0.8 : 1.1,
    (isSpace ? 0.34 : 0.26) * vol,
    isSpace ? 0.03 : 0.017,
    pan
  );
  // 2. KNOCK — hollow cap resonance
  knock(
    audio,
    t0,
    (isSpace ? 560 : isWide ? 760 : 950) * detune,
    0.075 * vol,
    0.028
  );
  // 3. THOCK — body/plate resonance with pitch drop
  thock(
    audio,
    t0,
    (isSpace ? 92 : isWide ? 125 : 155) * detune,
    (isSpace ? 55 : 82) * detune,
    (isSpace ? 0.4 : 0.26) * vol,
    isSpace ? 0.095 : 0.07
  );

  // 4. subtle key-UP click shortly after (the release of the stem)
  const upDelay = 0.045 + Math.random() * 0.05;
  noiseHit(
    audio,
    t0 + upDelay,
    (isSpace ? 1200 : 2000) * detune,
    1.4,
    0.075 * vol,
    0.012,
    -pan
  );
}

/** random stereo position so bursts of typing feel wide */
function randomPan(): number {
  return Math.random() * 0.5 - 0.25;
}

/** Soft tick for toggles / switches. */
export function playUiTick(): void {
  if (!enabled) return;
  const audio = getCtx();
  if (!audio) return;
  const t0 = audio.currentTime + 0.001;
  noiseHit(audio, t0, 2600, 2.2, 0.12, 0.03, 0);
  thock(audio, t0, 720, 400, 0.06, 0.045);
}

/** Plastic "clack" for a Rubik's cube quarter-turn. */
export function playCubeTurn(): void {
  if (!enabled) return;
  const audio = getCtx();
  if (!audio) return;
  const detune = 0.9 + Math.random() * 0.25;
  const t0 = audio.currentTime + 0.001;
  // the snap of the layer clicking into place
  noiseHit(audio, t0, 340 * detune, 0.9, 0.16, 0.035, 0.2);
  noiseHit(audio, t0 + 0.012, 1600 * detune, 1.6, 0.08, 0.018, 0.2);
  thock(audio, t0, 240 * detune, 130, 0.14, 0.06);
}

/** Tiny 3-note arpeggio when the cube solves itself. */
export function playSolveFanfare(): void {
  if (!enabled) return;
  const audio = getCtx();
  if (!audio) return;
  const t0 = audio.currentTime + 0.001;
  const notes = [523, 659, 784];
  notes.forEach((f, i) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0.055, t0 + i * 0.1);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      t0 + i * 0.1 + (i === 2 ? 0.24 : 0.1)
    );
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(t0 + i * 0.1);
    osc.stop(t0 + i * 0.1 + 0.28);
  });
}

/**
 * Coffee sip — a rising band-passed noise slurp followed by two low
 * swallows (gulp) as the mug tips back. Layered like the key model:
 * the swell of the slurp reads as liquid through a small opening, the
 * thock pair reads as the swallow.
 */
export function playCoffeeSlurp(): void {
  if (!enabled) return;
  const audio = getCtx();
  if (!audio) return;
  const t0 = audio.currentTime + 0.001;

  // SLURP — noise swept up through a resonant band, swelling then dying
  const src = audio.createBufferSource();
  src.buffer = getNoise(audio);
  src.loop = true; // the shared noise buffer is only 150ms long
  src.playbackRate.value = 0.85 + Math.random() * 0.2;
  const bp = audio.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.6;
  bp.frequency.setValueAtTime(420, t0);
  bp.frequency.exponentialRampToValueAtTime(1500, t0 + 0.5);
  const g = audio.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.08, t0 + 0.15);
  g.gain.setValueAtTime(0.08, t0 + 0.33);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.52);
  src.connect(bp);
  bp.connect(g);
  g.connect(audio.destination);
  src.start(t0);
  src.stop(t0 + 0.56);

  // GULP — two damped low drops, like a swallow
  thock(audio, t0 + 0.5, 200, 85, 0.16, 0.14);
  thock(audio, t0 + 0.68, 155, 70, 0.13, 0.13);
}

/** Soft ceramic tap when the mug lands back on the desk. */
export function playMugDown(): void {
  if (!enabled) return;
  const audio = getCtx();
  if (!audio) return;
  const t0 = audio.currentTime + 0.001;
  noiseHit(audio, t0, 900, 1.2, 0.1, 0.03, 0);
  thock(audio, t0, 320, 150, 0.14, 0.09);
}
