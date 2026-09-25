import * as THREE from 'three';
import gsap from 'gsap';

/**
 * Procedural Rubik's cube that replaces the static prop baked into room.glb.
 *
 * The original "Rubik Cube" node is a single static mesh — this module takes
 * its place (same spot, same size, same resting rotation) as a real 3x3x3
 * build: 26 cubies with rounded stickers that can actually turn.
 *
 *  - idle: a slow presentation spin around its vertical axis, eased out
 *    while a show is running so the solving reads clearly
 *  - startShow(): the "watch it solve itself" choreography — the cube
 *    scrambles itself with 8 fast random quarter-turns, holds a beat for
 *    drama, then un-scrambles (inverse moves in reverse order, slower, with
 *    a long final turn) and ends with a sparkle burst. Because the solve is
 *    the exact inverse of the scramble, the cube ALWAYS finishes perfectly
 *    solved — no solver AI needed, zero drift.
 *
 * Move mechanics: a face turn re-parents the 9 cubies of one slice to a
 * temporary pivot group, gsap rotates the pivot a quarter turn, then the
 * cubies are re-attached with their transforms snapped back onto the exact
 * cubie grid — so hundreds of turns never accumulate float error.
 */

export interface RubiksCubeEvents {
  /** fired on every quarter-turn (hook up a click sound) */
  onMove?: () => void;
  /** fired when the scramble phase and the solve phase begin */
  onPhase?: (phase: 'scramble' | 'solve') => void;
  /** fired when the cube is back to solved (after the final turn) */
  onSolved?: () => void;
}

export interface RubiksCube {
  group: THREE.Group;
  update: (dt: number, elapsed: number, dark: boolean) => void;
  /** start (or attach to a running) scramble + auto-solve show */
  startShow: (events: RubiksCubeEvents) => boolean;
  /** true while a show is running */
  isBusy: () => boolean;
  dispose: () => void;
}

interface Move {
  axis: 'x' | 'y' | 'z';
  layer: -1 | 0 | 1;
  dir: 1 | -1;
}

// classic western color scheme — matches the original prop's palette
const FACE_COLORS: Record<string, number> = {
  px: 0xd63c3c, // right  — red
  nx: 0xe8843a, // left   — orange
  py: 0xf5d327, // top    — yellow
  ny: 0xf2f5f7, // bottom — white
  pz: 0x2ecc71, // front  — green
  nz: 0x2f6fc4, // back   — blue
};

const STICKER_DEFS: {
  normal: THREE.Vector3;
  key: keyof typeof FACE_COLORS;
  rot: [number, number, number];
}[] = [
  { normal: new THREE.Vector3(1, 0, 0), key: 'px', rot: [0, Math.PI / 2, 0] },
  { normal: new THREE.Vector3(-1, 0, 0), key: 'nx', rot: [0, -Math.PI / 2, 0] },
  { normal: new THREE.Vector3(0, 1, 0), key: 'py', rot: [-Math.PI / 2, 0, 0] },
  { normal: new THREE.Vector3(0, -1, 0), key: 'ny', rot: [Math.PI / 2, 0, 0] },
  { normal: new THREE.Vector3(0, 0, 1), key: 'pz', rot: [0, 0, 0] },
  { normal: new THREE.Vector3(0, 0, -1), key: 'nz', rot: [0, Math.PI, 0] },
];

const SCRAMBLE_MOVES = 8;
const SPARK_COUNT = 42;

export function createRubiksCube(
  parent: THREE.Object3D,
  center: THREE.Vector3,
  restQuat: THREE.Quaternion,
  edge: number
): RubiksCube {
  const spacing = edge / 3;
  const cubieSize = spacing * 0.96;
  const stickerSize = cubieSize * 0.88;
  const stickerOffset = cubieSize / 2 + edge * 0.004;

  // outer group carries the original prop's position + resting rotation;
  // the inner spinner is what idles around Y so face-turn math always
  // happens in a clean local frame
  const group = new THREE.Group();
  group.name = 'RubikCube';
  group.position.copy(center);
  group.quaternion.copy(restQuat);
  parent.add(group);

  const spinner = new THREE.Group();
  spinner.name = 'RubikCube';
  group.add(spinner);

  // ---- geometry & materials (all shared) ----
  const disposables: Array<{ dispose(): void }> = [];

  const bodyGeo = new THREE.BoxGeometry(cubieSize, cubieSize, cubieSize);
  disposables.push(bodyGeo);

  const stickerGeo = roundedSquareGeometry(stickerSize, stickerSize * 0.2);
  disposables.push(stickerGeo);

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x14161c,
    roughness: 0.55,
    metalness: 0.2,
  });
  disposables.push(bodyMat);

  const stickerMats: THREE.MeshStandardMaterial[] = [];
  for (const def of STICKER_DEFS) {
    const mat = new THREE.MeshStandardMaterial({
      color: FACE_COLORS[def.key],
      roughness: 0.32,
      metalness: 0.05,
      emissive: new THREE.Color(FACE_COLORS[def.key]),
      emissiveIntensity: 0,
    });
    stickerMats.push(mat);
    disposables.push(mat);
  }
  const matFor = (key: keyof typeof FACE_COLORS): THREE.MeshStandardMaterial =>
    stickerMats[STICKER_DEFS.findIndex((d) => d.key === key)];

  // ---- cubies ----
  const cubies: THREE.Object3D[] = [];
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        if (x === 0 && y === 0 && z === 0) continue; // hidden core
        const cubie = new THREE.Mesh(bodyGeo, bodyMat);
        cubie.name = 'RubikCube';
        cubie.position.set(x * spacing, y * spacing, z * spacing);
        cubie.castShadow = true;
        cubie.receiveShadow = true;
        spinner.add(cubie);
        cubies.push(cubie);

        for (const def of STICKER_DEFS) {
          // sticker only on boundary faces: grid pos · normal === 1
          if (def.normal.x * x + def.normal.y * y + def.normal.z * z !== 1) {
            continue;
          }
          const sticker = new THREE.Mesh(stickerGeo, matFor(def.key));
          sticker.name = 'RubikCube';
          sticker.position.copy(def.normal).multiplyScalar(stickerOffset);
          sticker.rotation.set(def.rot[0], def.rot[1], def.rot[2]);
          sticker.castShadow = false;
          sticker.receiveShadow = true;
          cubie.add(sticker);
        }
      }
    }
  }

  // ---- solve celebration sparks ----
  // night-mode-only: the sparkle dots read as glowing dust in daylight, so
  // the burst is skipped entirely while the room lights are on
  let darkTheme = false;
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(SPARK_COUNT * 3);
  const sparkColors = new Float32Array(SPARK_COUNT * 3);
  const sparkVel = new Float32Array(SPARK_COUNT * 3);
  const sparkPalette = [
    new THREE.Color(0xffffff),
    new THREE.Color(0x34d399),
    new THREE.Color(0xf5d327),
  ];
  for (let i = 0; i < SPARK_COUNT; i++) {
    const c = sparkPalette[i % sparkPalette.length];
    sparkColors[i * 3] = c.r;
    sparkColors[i * 3 + 1] = c.g;
    sparkColors[i * 3 + 2] = c.b;
  }
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkColors, 3));
  const sparkMat = new THREE.PointsMaterial({
    size: edge * 0.12,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  disposables.push(sparkGeo, sparkMat);
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.visible = false;
  sparks.frustumCulled = false;
  // CRITICAL: never let the particles participate in raycasting. Three's
  // Raycaster ignores `visible` and Points objects use a default 1-world-unit
  // hit threshold — the whole room is ~1.5 units wide, so these 42 points
  // were an invisible click/hover bubble over the entire desk (the light
  // switch, phone and keyboard all got hijacked to "Rubik's cube").
  sparks.raycast = () => {};
  group.add(sparks);
  let sparkLife = 0;

  function celebrate(): void {
    if (!darkTheme) return; // sparks are a night-mode flourish
    for (let i = 0; i < SPARK_COUNT; i++) {
      sparkPos[i * 3] = (Math.random() - 0.5) * edge * 0.6;
      sparkPos[i * 3 + 1] = (Math.random() - 0.5) * edge * 0.6;
      sparkPos[i * 3 + 2] = (Math.random() - 0.5) * edge * 0.6;
      const v = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
      );
      if (v.lengthSq() < 1e-6) v.set(0, 1, 0);
      v.normalize().multiplyScalar(edge * (1.1 + Math.random() * 1.6));
      v.y += edge * 0.7;
      sparkVel[i * 3] = v.x;
      sparkVel[i * 3 + 1] = v.y;
      sparkVel[i * 3 + 2] = v.z;
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparkLife = 1.15;
    sparks.visible = true;
  }

  // ---- move mechanics ----
  const activeTweens = new Set<gsap.core.Tween | gsap.core.Timeline>();
  const snapEuler = new THREE.Euler();

  function snapCubie(c: THREE.Object3D): void {
    c.position.set(
      Math.round(c.position.x / spacing) * spacing,
      Math.round(c.position.y / spacing) * spacing,
      Math.round(c.position.z / spacing) * spacing
    );
    snapEuler.setFromQuaternion(c.quaternion, 'XYZ');
    const q = Math.PI / 2;
    snapEuler.x = Math.round(snapEuler.x / q) * q;
    snapEuler.y = Math.round(snapEuler.y / q) * q;
    snapEuler.z = Math.round(snapEuler.z / q) * q;
    c.quaternion.setFromEuler(snapEuler);
  }

  function applyMove(move: Move, duration: number, onDone?: () => void): void {
    const slice = cubies.filter(
      (c) => Math.round(c.position[move.axis] / spacing) === move.layer
    );
    if (slice.length === 0) {
      onDone?.();
      return;
    }
    const pivot = new THREE.Group();
    spinner.add(pivot);
    slice.forEach((c) => pivot.attach(c));
    const tween = gsap.to(pivot.rotation, {
      [move.axis]: (move.dir * Math.PI) / 2,
      duration,
      ease: 'power2.inOut',
      onComplete: () => {
        slice.forEach((c) => {
          spinner.attach(c);
          snapCubie(c);
        });
        spinner.remove(pivot);
        activeTweens.delete(tween);
        onDone?.();
      },
    });
    activeTweens.add(tween);
  }

  function invertMove(m: Move): Move {
    return { axis: m.axis, layer: m.layer, dir: (m.dir * -1) as 1 | -1 };
  }

  function randomMove(prev: Move | null): Move {
    const axes: Move['axis'][] = ['x', 'y', 'z'];
    for (;;) {
      const axis = axes[Math.floor(Math.random() * 3)];
      const layer = (Math.floor(Math.random() * 3) - 1) as -1 | 0 | 1;
      const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      // never turn the same slice twice in a row
      if (prev && axis === prev.axis && layer === prev.layer) continue;
      return { axis, layer, dir };
    }
  }

  // ---- show runner ----
  let busy = false;
  let listener: RubiksCubeEvents | null = null;

  function startShow(events: RubiksCubeEvents): boolean {
    // always (re)bind the completion listener — even mid-show, so a fresh
    // camera choreography can attach to the running solve
    listener = events;
    if (busy) return false;
    busy = true;

    const scramble: Move[] = [];
    let prev: Move | null = null;
    for (let i = 0; i < SCRAMBLE_MOVES; i++) {
      const m = randomMove(prev);
      scramble.push(m);
      prev = m;
    }
    // solving = undo the scramble exactly, last move first
    const solve = scramble.slice().reverse().map(invertMove);

    // SELF-SERIALIZING STEP CHAIN — each quarter-turn only starts from the
    // previous turn's onComplete, so a pivot never shares cubies with the
    // next move. (A gsap timeline whose .call()s pile up in one throttled
    // tick — background tab, slow device, software renderer — used to let
    // two pivots steal the same cubie and corrupt the solve. Chained steps
    // stretch in time under throttling but can never overlap, so the cube
    // ALWAYS ends perfectly solved.)
    type Step =
      | { kind: 'phase'; phase: 'scramble' | 'solve' }
      | { kind: 'wait'; dur: number }
      | { kind: 'move'; move: Move; dur: number }
      | { kind: 'done' };

    const steps: Step[] = [
      { kind: 'phase', phase: 'scramble' },
      { kind: 'wait', dur: 0.25 },
    ];
    scramble.forEach((m) => {
      steps.push({ kind: 'move', move: m, dur: 0.22 });
      steps.push({ kind: 'wait', dur: 0.04 });
    });
    steps.push({ kind: 'wait', dur: 0.6 }); // dramatic pause
    steps.push({ kind: 'phase', phase: 'solve' });
    solve.forEach((m, i) => {
      const dur = i === solve.length - 1 ? 0.52 : 0.32;
      steps.push({ kind: 'move', move: m, dur });
      steps.push({ kind: 'wait', dur: 0.07 });
    });
    steps.push({ kind: 'wait', dur: 0.12 });
    steps.push({ kind: 'done' });

    const runStep = (i: number): void => {
      if (i >= steps.length) return;
      const step = steps[i];
      if (step.kind === 'phase') {
        events.onPhase?.(step.phase);
        runStep(i + 1);
      } else if (step.kind === 'wait') {
        const tw = gsap.delayedCall(step.dur, () => runStep(i + 1));
        activeTweens.add(tw);
      } else if (step.kind === 'move') {
        events.onMove?.();
        applyMove(step.move, step.dur, () => runStep(i + 1));
      } else {
        celebrate();
        busy = false;
        const done = listener;
        listener = null;
        done?.onSolved?.();
      }
    };
    runStep(0);
    return true;
  }

  // ---- idle spin / glow / spark integration ----
  let spinSpeed = 0;

  function update(dt: number, elapsed: number, dark: boolean): void {
    darkTheme = dark;
    const targetSpin = busy ? 0 : 0.055;
    spinSpeed += (targetSpin - spinSpeed) * Math.min(1, dt * 2.2);
    spinner.rotation.y += spinSpeed * dt;

    const glow = dark ? 0.16 + 0.07 * Math.sin(elapsed * 1.8) : 0;
    for (const mat of stickerMats) {
      mat.emissiveIntensity = glow;
    }

    if (sparkLife > 0) {
      sparkLife -= dt;
      for (let i = 0; i < SPARK_COUNT; i++) {
        sparkVel[i * 3 + 1] -= edge * 3.2 * dt;
        sparkPos[i * 3] += sparkVel[i * 3] * dt;
        sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
        sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
      }
      sparkGeo.attributes.position.needsUpdate = true;
      sparkMat.opacity = THREE.MathUtils.clamp(sparkLife, 0, 1);
      if (sparkLife <= 0) sparks.visible = false;
    }
  }

  function dispose(): void {
    activeTweens.forEach((t) => t.kill());
    activeTweens.clear();
    if (group.parent) group.parent.remove(group);
    disposables.forEach((d) => d.dispose());
  }

  return {
    group,
    update,
    startShow,
    isBusy: () => busy,
    dispose,
  };
}

/** Rounded square centered on the origin, used for every sticker. */
function roundedSquareGeometry(size: number, radius: number): THREE.ShapeGeometry {
  const hs = size / 2;
  const r = Math.min(radius, hs * 0.45);
  const shape = new THREE.Shape();
  shape.moveTo(-hs + r, -hs);
  shape.lineTo(hs - r, -hs);
  shape.quadraticCurveTo(hs, -hs, hs, -hs + r);
  shape.lineTo(hs, hs - r);
  shape.quadraticCurveTo(hs, hs, hs - r, hs);
  shape.lineTo(-hs + r, hs);
  shape.quadraticCurveTo(-hs, hs, -hs, hs - r);
  shape.lineTo(-hs, -hs + r);
  shape.quadraticCurveTo(-hs, -hs, -hs + r, -hs);
  return new THREE.ShapeGeometry(shape, 6);
}
