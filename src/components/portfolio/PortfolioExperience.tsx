'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry';
import gsap from 'gsap';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib';
import './portfolio.css';
import {
  createGamingKeyboard,
  type GamingKeyboard,
} from './gamingKeyboard';
import { createPhoneScreen, type PhoneScreen } from './phoneScreen';
import { createBookPage } from './bookPage';
import { createRubiksCube, type RubiksCube } from './rubiksCube';
import { createHexaWall, type HexaWall } from './hexaWall';
import { createNoiseRoughnessMap } from './pbr';
import {
  createCarpet,
  CARPET_LIGHT,
  CARPET_DARK,
  type Carpet,
} from './carpet';
import {
  createFloorSkin,
  createFloorLed,
  FLOOR_LIGHT_RED,
  FLOOR_DARK,
  type FloorSkin,
  type FloorLed,
} from './floor';
import {
  setSoundEnabled,
  playKeyClick,
  playUiTick,
  playCubeTurn,
  playSolveFanfare,
  playCoffeeSlurp,
  playMugDown,
} from './sounds';

/**
 * NAV — 3D Portfolio experience.
 * React/Next.js port of sushilthapa98/3d-portfolio (main.js) with
 * navairgap's info, plus original interactive extras:
 *  - asset progress loader + "enter the room" gate + intro camera sweep
 *  - clickable phone: the phone is picked up off the desk, stands upright
 *    and opens a portrait contacts-app UI; the GitHub/website rows on the
 *    screen are tappable and open their links
 *  - procedural RGB gaming keyboard with typing animation
 *  - procedural Rubik's cube: click it and it scrambles, then solves
 *    itself with animated quarter-turns and a sparkle burst
 *  - synthesized key-click sounds (toggle in the header)
 *  - light/dark room themes, subtle bloom glow in the dark theme,
 *    drifting dust motes, idle auto-orbit and a quick-actions bar
 *  - hover tooltips on interactive props, ESC to reset the camera
 */

interface ProjectDef {
  image: string;
  url: string;
  mesh?: THREE.Mesh | null;
  y?: number;
}

const PROJECTS: ProjectDef[] = [
  {
    image: '/textures/project-sentinelwifi.png',
    url: 'https://github.com/navairgap/SentinelWiFi',
  },
  {
    image: '/textures/project-banter.png',
    url: 'https://github.com/navairgap/banter',
  },
  {
    image: '/textures/project-airgapos.png',
    url: 'https://github.com/navairgap/airgap-os',
  },
  {
    image: '/textures/project-portwarden.png',
    url: 'https://github.com/navairgap/portwarden',
  },
];

const CLIP_NAMES = [
  'fan_rotation',
  'fan_rotation.001',
  'fan_rotation.002',
  'fan_rotation.003',
  'fan_rotation.004',
];

const GITHUB_URL = 'https://github.com/navairgap';
const SITE_URL = 'https://navairgap.github.io';

// the walls in the light theme — a clear sky blue (daylight studio
// tint); at night they sink to a deep charcoal slate so the neon
// honeycomb reads like LED wall panels against the dark
const WALL_LIGHT_BLUE = new THREE.Color(0x97c7ef);
const WALL_DARK_SLATE = new THREE.Color(0x2e3440);

const INTERACTIVE_NAMES = new Set([
  'Mobile',
  'Mobile_Screen',
  'Keyboard',
  'KeyboardKey',
  'Book',
  'Book001',
  'SwitchBoard',
  'Switch',
  'RubikCube',
  'CPU',
  'Coffe',
  'project',
]);

// meshes that SWALLOW clicks even though they trigger nothing — the
// monitor (video panel + housing) sits right in front of the PC tower,
// so a click aimed at the video must not fall through the raycast and
// power the PC off by accident
const CLICK_BLOCKER_NAMES = new Set(['Monitor', 'Pc']);

function findInteractiveName(object: THREE.Object3D): string | null {
  let obj: THREE.Object3D | null = object;
  while (obj) {
    if (INTERACTIVE_NAMES.has(obj.name)) return obj.name;
    obj = obj.parent;
  }
  return null;
}

function isClickBlocker(object: THREE.Object3D): boolean {
  let obj: THREE.Object3D | null = object;
  while (obj) {
    // an interactive ancestor wins — the hit belongs to that prop
    if (INTERACTIVE_NAMES.has(obj.name)) return false;
    if (CLICK_BLOCKER_NAMES.has(obj.name)) return true;
    obj = obj.parent;
  }
  return false;
}

function hoverLabelFor(name: string): string | null {
  switch (name) {
    case 'Mobile':
    case 'Mobile_Screen':
      return 'Contact — click me';
    case 'Keyboard':
    case 'KeyboardKey':
      return 'Gaming keyboard — click to type';
    case 'Book':
    case 'Book001':
      return 'About me';
    case 'SwitchBoard':
    case 'Switch':
      return 'Lights on / off';
    case 'RubikCube':
      return "Rubik's cube — click to watch it solve itself";
    case 'CPU':
      return 'PC power';
    case 'Coffe':
      return 'Coffee — click to drink';
    case 'project':
      return 'Open project';
    default:
      return null;
  }
}

interface WorldActions {
  resetCamera: () => void;
  goToAbout: () => void;
  goToProjects: () => void;
  goToPhone: () => void;
  goToKeyboardPeek: () => void;
  goToCubeShow: () => void;
  toggleLights: () => void;
  startIntro: () => void;
}

export default function PortfolioExperience() {
  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<WorldActions | null>(null);
  const contactMenuRef = useRef<HTMLLIElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [entered, setEntered] = useState(false);
  const [loaderGone, setLoaderGone] = useState(false);
  const [closeVisible, setCloseVisible] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [cubePhase, setCubePhase] = useState<string | null>(null);
  const [coffeeMsg, setCoffeeMsg] = useState<string | null>(null);
  const [hintVisible, setHintVisible] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [lightsOn, setLightsOn] = useState(true);

  // Close contact dropdown when clicking outside
  useEffect(() => {
    const onMouseUp = (e: MouseEvent) => {
      if (
        contactMenuRef.current &&
        !contactMenuRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mouseup', onMouseUp);
    return () => document.removeEventListener('mouseup', onMouseUp);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // headless/throttled rAF can stretch gsap timelines — keep them real-time
    gsap.ticker.lagSmoothing(false);

    let theme = 'light';
    let hasEntered = false;
    let introStarted = false;
    let phoneViewOpen = false;
    let bookCover: THREE.Mesh | null = null;
    let bookMesh: THREE.Mesh | null = null;
    let bookPage: ReturnType<typeof createBookPage> | null = null;
    let lightSwitch: THREE.Object3D | null = null;
    let titleText: THREE.Mesh | null = null;
    let subtitleText: THREE.Mesh | null = null;
    let mixer: THREE.AnimationMixer | null = null;
    let mobile: THREE.Mesh | null = null;
    let mobileScreen: THREE.Mesh | null = null;
    let phoneStanding = false;
    let phoneRestQuat: THREE.Quaternion | null = null;
    let phoneRestPos: THREE.Vector3 | null = null;
    let keyboardDeck: THREE.Mesh | null = null;
    let keyboard: GamingKeyboard | null = null;
    let phone: PhoneScreen | null = null;
    let cube: RubiksCube | null = null;
    let rubikOriginal: THREE.Mesh | null = null;
    let roomRoot: THREE.Group | null = null;
    let tableMesh: THREE.Mesh | null = null;
    let tableOriginalMat: THREE.Material | THREE.Material[] | null = null;
    let tableGamingMat: THREE.MeshStandardMaterial | null = null;
    // camera choreography sequence — bumping it invalidates stale
    // gsap.delayedCall closures so rapid view-switching can never fight
    let camSeq = 0;
    let kbPeekBusyUntil = 0;
    let kbPeekLastSeq = -1;
    let videoEl: HTMLVideoElement | null = null;
    let idleTypeTimer = 4;
    let elapsed = 0;
    let lastInteraction = performance.now();

    // PC power state — the tower on the desk is the power button
    let pcOn = true;
    let screenMesh: THREE.Mesh | null = null;
    let videoMat: THREE.MeshBasicMaterial | null = null;
    let screenOffMat: THREE.MeshPhysicalMaterial | null = null;
    let glassMats: THREE.MeshPhysicalMaterial[] = [];
    let cpuGroup: THREE.Object3D | null = null;
    let ledMeshes: THREE.Mesh[] = [];
    let ledOriginalMats: (THREE.Material | THREE.Material[])[] = [];
    let ledOffMat: THREE.MeshStandardMaterial | null = null;
    let monitorBlockers: THREE.Object3D[] = [];
    let envRT: THREE.WebGLRenderTarget | null = null;
    // the plant cluster + tower LOD stand-ins and their shared resources
    let plantPot: THREE.Object3D | null = null;
    let towerLedStripMat: THREE.MeshStandardMaterial | null = null;
    // the KTX2-powered badge on the tower front (created async once the
    // .ktx2 transcodes)
    let ktxBadgeMat: THREE.MeshStandardMaterial | null = null;
    // extra textures owned by the main file (disposed on unmount — the
    // scene traverse only disposes geometries and materials)
    const extraTextures: THREE.Texture[] = [];
    // coffee mug — click it to take an animated sip
    let mug: THREE.Object3D | null = null;
    let mugRestPos: THREE.Vector3 | null = null;
    let mugRestQuat: THREE.Quaternion | null = null;
    let coffeeBusyUntil = 0;
    let coffeeLastSeq = -1;
    let steamTexture: THREE.CanvasTexture | null = null;
    let steamPuffs: THREE.Sprite[] = [];
    // wall material — sky blue while the lights are on; carries the
    // honeycomb textures (embossed panels by day, neon LED grid at night)
    let wallMat: THREE.MeshStandardMaterial | null = null;
    let hexaWall: HexaWall | null = null;
    // the shell mesh itself — its bbox sizes the floor skin
    let wallShell: THREE.Mesh | null = null;
    // the floor rug — woven, theme-tinted
    let carpet: Carpet | null = null;
    // the floor's own surface (red by day, near-black at night) and the
    // LED strip overlay tracing the rug's design
    let floorSkin: FloorSkin | null = null;
    let floorLed: FloorLed | null = null;
    // book materials — dimmed at night so the page never glares
    let bookMat: THREE.MeshStandardMaterial | null = null;
    let bookCoverMat: THREE.MeshStandardMaterial | null = null;
    // neon honeycomb level — 0 in daylight, ~1.25 at night; tweened by
    // switchTheme and breathed over in the render loop
    const wallNeon = { level: 0 };
    // LED strip level on the floor — 0 by day, 1 at night (breathed in
    // the render loop like the honeycomb)
    const floorLedState = { level: 0 };
    const mobileQuery = window.matchMedia('(max-width: 992px)');
    // evaluated live so rotating a phone / resizing re-frames correctly
    const isMobileNow = () => mobileQuery.matches;

    const projects: ProjectDef[] = PROJECTS.map((p) => ({ ...p }));

    let aboutCameraPos = { x: 0.12, y: 0.2, z: 0.55 };
    let aboutCameraRot = { x: -1.54, y: 0.13, z: 1.41 };
    let projectsCameraPos = { x: 1, y: 0.45, z: 0.01 };
    let projectsCameraRot = { x: 0.05, y: 0.05, z: 0 };

    const defaultCameraPos = {
      x: 1.009028643133046,
      y: 0.5463638814987481,
      z: 0.4983449671971262,
    };
    const defaultCameraRot = {
      x: -0.8313297556598935,
      y: 0.9383399492446749,
      z: 0.7240714481613063,
    };

    // SCENE & CAMERA
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.01,
      1000
    );
    // cinematic start position — tweened to the default view on "enter"
    camera.position.set(2.05, 1.08, 1.42);

    // RENDERER — canvas created imperatively (safe under StrictMode remounts)
    const canvas = document.createElement('canvas');
    canvas.className = 'experience-canvas';
    container.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    // cap raised from 1.75 — on DPR-3 phones the canvas used to be
    // upscaled ~1.7x by the compositor, which read as a blurred scene
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // CONTROLS — disabled until the intro sweep finishes
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minDistance = 0.9;
    controls.maxDistance = 1.6;
    controls.minAzimuthAngle = 0.2;
    controls.maxAzimuthAngle = Math.PI * 0.78;
    controls.minPolarAngle = 0.3;
    controls.maxPolarAngle = Math.PI / 2;
    controls.enabled = false;
    controls.autoRotateSpeed = 0.55;
    controls.update();
    camera.lookAt(0.02, 0.06, 0.08);

    // LOAD MANAGER (drives the loader percentage)
    const manager = new THREE.LoadingManager();
    manager.onProgress = (_url, loaded, total) => {
      if (total > 0) {
        setProgress(Math.round((loaded / total) * 100));
      }
    };

    // LOAD MODEL & ASSETS — geometry arrives Draco-compressed (the GLB
    // ships Draco meshes + local decoders), and the KTX2 pipeline is
    // wired into the GLTFLoader so any KHR_texture_basisu asset would
    // load with GPU-native compressed textures; the badge texture below
    // exercises the same loader on a standalone .ktx2
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/draco/');
    const ktx2Loader = new KTX2Loader(manager);
    ktx2Loader.setTranscoderPath('/ktx2/');
    ktx2Loader.detectSupport(renderer);
    const gltfLoader = new GLTFLoader(manager);
    gltfLoader.setDRACOLoader(dracoLoader);
    gltfLoader.setKTX2Loader(ktx2Loader);

    // LIGHTS — daylight is kept soft on purpose: the room reads as a
    // lit studio rather than a glare box
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);
    const roomLight = new THREE.PointLight(0xffffff, 2.05, 10);
    roomLight.position.set(0.3, 2, 0.5);
    roomLight.castShadow = true;
    roomLight.shadow.mapSize.width = 2048;
    roomLight.shadow.mapSize.height = 2048;
    roomLight.shadow.camera.near = 0.1;
    roomLight.shadow.camera.far = 2.5;
    // PCFSoftShadowMap + a small slope-scaled bias paired with a normal
    // bias — the standard anti-acne recipe: the normal bias pushes the
    // sample point along the surface normal so curved receivers (mug,
    // keycaps, plant leaves) never self-shadow their own front faces
    roomLight.shadow.bias = -0.0008;
    roomLight.shadow.normalBias = 0.015;
    scene.add(roomLight);

    // lights for pc fans
    const fanLight1 = new THREE.PointLight(0xff0000, 30, 0.2);
    const fanLight2 = new THREE.PointLight(0x00ff00, 30, 0.12);
    const fanLight3 = new THREE.PointLight(0x00ff00, 30, 0.2);
    const fanLight4 = new THREE.PointLight(0x00ff00, 30, 0.2);
    const fanLight5 = new THREE.PointLight(0x00ff00, 30, 0.05);
    fanLight1.position.set(0, 0.29, -0.29);
    fanLight2.position.set(-0.15, 0.29, -0.29);
    fanLight3.position.set(0.21, 0.29, -0.29);
    fanLight4.position.set(0.21, 0.19, -0.29);
    fanLight5.position.set(0.21, 0.08, -0.29);
    scene.add(fanLight1, fanLight2, fanLight3, fanLight4, fanLight5);
    const FAN_LIGHTS = [fanLight1, fanLight2, fanLight3, fanLight4, fanLight5];
    const FAN_LIGHT_BASE = FAN_LIGHTS.map((l) => l.intensity);

    // point lights for the wall text — a two-tone spill at night: warm
    // coral around the NAVAIRGAP title and cool cyan down the subtitle,
    // so the lockup glows in two different colours against the magenta
    // honeycomb
    const pointLight1 = new THREE.PointLight(0xff8a5a, 0, 1.1);
    const pointLight2 = new THREE.PointLight(0xff8a5a, 0, 1.1);
    const pointLight3 = new THREE.PointLight(0x53e8ff, 0, 1.1);
    const pointLight4 = new THREE.PointLight(0x53e8ff, 0, 1.1);
    pointLight1.position.set(-0.2, 0.6, 0.24);
    pointLight2.position.set(-0.2, 0.6, 0.42);
    pointLight3.position.set(-0.2, 0.6, 0.01);
    pointLight4.position.set(-0.2, 0.6, -0.14);
    scene.add(pointLight1, pointLight2, pointLight3, pointLight4);

    // soft light above the phone, faded in when the contact view opens
    const phoneLight = new THREE.PointLight(0x9db8ff, 0, 0.35);
    scene.add(phoneLight);

    // warm reading light above the notebook — night only: the room light
    // dims with the theme, and this little pool of warm light keeps the
    // about page readable (and inviting) after dark. Positioned once the
    // room loads, from the book's real world position
    const bookLight = new THREE.PointLight(0xffd9a6, 0, 0.34);
    scene.add(bookLight);

    // magenta under-glow above the rug — the floor LED strips softly
    // light the desk legs and the weave at night (off in daylight)
    const floorGlowLight = new THREE.PointLight(0xff59d8, 0, 0.65);
    floorGlowLight.position.set(0.22, -0.12, 0.12);
    scene.add(floorGlowLight);

    // MONITOR GLOW — a RectAreaLight panel fitted to the screen, mounted
    // just in front of the display and aimed down at the desk so the
    // keyboard and desktop catch the cool spill of the panel (the classic
    // "screen in a dark room" look). Positioned from the real screen
    // mesh once the room loads; the base intensity is theme- and
    // PC-power-aware, and the render loop breathes it with a subtle
    // two-sine shimmer so it reads as a live display, not a floodlight
    RectAreaLightUniformsLib.init();
    const monitorGlow = new THREE.RectAreaLight(0xbdd6ff, 0, 0.17, 0.1);
    scene.add(monitorGlow);
    const monitorGlowState = { base: 0 };

    // shared PBR micro-noise — grayscale with equal channels, so one
    // texture serves as the roughnessMap (G channel) AND metalnessMap
    // (B channel) on the desk, floor, tower and keycaps: micro-variance
    // that makes flat PBR surfaces read as manufactured
    const noiseMap = createNoiseRoughnessMap(256);
    noiseMap.anisotropy = Math.min(
      8,
      renderer.capabilities.getMaxAnisotropy()
    );
    extraTextures.push(noiseMap);

    // ENVIRONMENT MAP — an equirectangular HDRI (RGBE) filtered through
    // PMREM gives every PBR material in the room physically-plausible
    // ambient light and reflections: the metal fan rings and CPU parts
    // glint as the camera orbits, the desk picks up a sheen, the glass
    // panels read as glass. A procedural RoomEnvironment is installed
    // first so materials have an env from the first frame; the HDRI (a
    // soft overcast pedestrian overpass — reads like studio daylight)
    // swaps in as soon as it decodes, still behind the loader gate.
    // Kept subtle per material below via envMapIntensity, and dimmed
    // with the night theme so the dark room keeps its mood.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnvironment = new RoomEnvironment();
    envRT = pmrem.fromScene(roomEnvironment, 0.04);
    scene.environment = envRT.texture;
    roomEnvironment.dispose();
    let worldDisposed = false;
    new RGBELoader(manager).load(
      '/textures/pedestrian_overpass_1k.hdr',
      (hdrTexture) => {
        if (worldDisposed) {
          hdrTexture.dispose();
          return;
        }
        hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
        const hdriRT = pmrem.fromEquirectangular(hdrTexture);
        // swap — the shader defines are identical (IBL is already active
        // on every standard material), so this is a uniform update, not
        // a recompile
        scene.environment = hdriRT.texture;
        envRT?.dispose();
        envRT = hdriRT;
        hdrTexture.dispose();
        pmrem.dispose();
      },
      undefined,
      () => {
        // network/decode failure — the procedural studio env stays
        pmrem.dispose();
      }
    );

    // theme-aware environment intensity — every registered standard
    // material gets base * boost, so reflections can be tuned per
    // surface and the whole layer can breathe with the light switch
    const envEntries: { mat: THREE.MeshStandardMaterial; boost: number }[] =
      [];
    const envState = { base: 0.34 };
    const applyEnvIntensity = () => {
      envEntries.forEach(({ mat, boost }) => {
        mat.envMapIntensity = envState.base * boost;
      });
    };
    const registerEnvMaterial = (
      mat: THREE.Material | THREE.Material[] | null | undefined,
      boost: number
    ) => {
      if (!mat) return;
      const list = Array.isArray(mat) ? mat : [mat];
      list.forEach((m) => {
        const std = m as THREE.MeshStandardMaterial;
        if (std.isMeshStandardMaterial) {
          if (!envEntries.some((e) => e.mat === std)) {
            envEntries.push({ mat: std, boost });
          }
        }
      });
    };

    // POST-PROCESSING — the cinematic chain: SSAO grounds every contact
    // (dark crevices where the desk meets the keyboard, the mug meets the
    // mat, the cube meets the desk…), a very slight DoF keeps the eye on
    // the focal plane, bloom makes the screen + neon genuinely glow, and
    // a film-grain pass adds the analogue texture. SSAO and DoF re-render
    // the scene for normals/depth, so they are desktop-only; mobile keeps
    // bloom + grain. MSAA stays on both the composer target AND the SSAO
    // beauty target so edges stay clean through the whole chain.
    let composer: EffectComposer | null = null;
    let renderPass: RenderPass | null = null;
    let ssaoPass: SSAOPass | null = null;
    let bokehPass: BokehPass | null = null;
    let bloomPass: UnrealBloomPass | null = null;
    let filmPass: FilmPass | null = null;
    try {
      // MSAA render target — rendering through the composer would
      // otherwise lose the renderer's antialiasing and grow jaggies;
      // 4x multisampling keeps the edges clean
      const bufferSize = renderer.getDrawingBufferSize(
        new THREE.Vector2()
      );
      const composerRT = new THREE.WebGLRenderTarget(
        bufferSize.x,
        bufferSize.y,
        { samples: 4 }
      );
      composer = new EffectComposer(renderer, composerRT);
      renderPass = new RenderPass(scene, camera);
      composer.addPass(renderPass);
      if (!isMobileNow()) {
        // SSAO — tuned for the room's true world scale (camera distances
        // ~1–2.5m): a ~0.3m sample kernel with tight depth clamps gives
        // contact shadows without haloing the walls
        ssaoPass = new SSAOPass(
          scene,
          camera,
          bufferSize.x,
          bufferSize.y
        );
        ssaoPass.kernelRadius = 0.32;
        ssaoPass.minDistance = 0.0006;
        ssaoPass.maxDistance = 0.06;
        ssaoPass.beautyRenderTarget.samples = 4;
        composer.addPass(ssaoPass);
        // SSAOPass renders its own beauty pass — skip the redundant
        // RenderPass while it is active (re-enabled never; the composer
        // only needs ONE beauty source)
        renderPass.enabled = false;
        // very slight depth of field — the focal plane tracks the orbit
        // target in the render loop
        bokehPass = new BokehPass(scene, camera, {
          focus: 1.45,
          aperture: 0.00012,
          maxblur: 0.0028,
        });
        composer.addPass(bokehPass);
      }
      // bloom — near-zero threshold catch: only genuinely bright pixels
      // (the video panel, the neon wall/LED/fans) bloom; strength is
      // tweened per theme in switchTheme
      bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.12,
        0.55,
        0.82
      );
      composer.addPass(bloomPass);
      // film grain — subtle animated monochrome noise, no scanlines
      filmPass = new FilmPass(0.05, 0.0, 0.0, false);
      composer.addPass(filmPass);
      composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      composer.setSize(window.innerWidth, window.innerHeight);
    } catch (err) {
      console.warn(
        'post-processing unavailable, falling back to plain rendering',
        err
      );
      composer = null;
      renderPass = null;
      ssaoPass = null;
      bokehPass = null;
      bloomPass = null;
      filmPass = null;
    }

    // DUST MOTES — slow drifting specks that catch the light.
    // Night-mode-only: the site boots in the light theme, so they start
    // hidden and fade in when the lights go off (switchTheme below).
    const DUST_COUNT = 80;
    const DUST_OPACITY = 0.4;
    const dustBase = new Float32Array(DUST_COUNT * 3);
    const dustPhase = new Float32Array(DUST_COUNT);
    for (let i = 0; i < DUST_COUNT; i++) {
      dustBase[i * 3] = -0.45 + Math.random() * 1.1;
      dustBase[i * 3 + 1] = 0.08 + Math.random() * 0.55;
      dustBase[i * 3 + 2] = -0.4 + Math.random() * 0.9;
      dustPhase[i] = Math.random() * Math.PI * 2;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(dustBase.slice(), 3)
    );
    const dustMat = new THREE.PointsMaterial({
      color: 0xcfe0ff,
      size: 0.0045,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const dust = new THREE.Points(dustGeo, dustMat);
    dust.visible = false;
    // same raycast exclusion as the cube's sparks — Points objects use a
    // 1-world-unit default raycast threshold, and the click handler rays
    // through the whole scene; these must never be hit targets
    dust.raycast = () => {};
    scene.add(dust);

    // ANIMATION LOOP
    const clock = new THREE.Clock();
    let rafId = 0;
    let idleClockTimer = 0;
    // ADAPTIVE QUALITY GUARD — the SSAO and DoF passes re-render the scene
    // and run per-pixel estimation; on software GL (headless machines,
    // remote sandboxes) or very weak iGPUs that can collapse the frame
    // rate. A rolling frame-cost probe watches playback and degrades in
    // tiers: first the heavy passes drop (SSAO + DoF), then bloom. Real
    // GPUs keep the full cinematic chain.
    const perf = {
      frames: 0,
      acc: 0,
      cleanChecks: 0,
      tier: 0,
      watching: true,
      last: 0,
    };
    function degradeStep(): void {
      perf.tier++;
      if (perf.tier === 1 && ssaoPass) {
        ssaoPass.enabled = false;
        if (bokehPass) bokehPass.enabled = false;
        if (renderPass) renderPass.enabled = true;
        console.info(
          '[portfolio] slow GPU detected — SSAO and depth of field disabled to keep the frame rate smooth'
        );
      } else if (perf.tier === 2) {
        if (bloomPass) bloomPass.enabled = false;
        composer?.setPixelRatio(1);
        composer?.setSize(window.innerWidth, window.innerHeight);
        console.info(
          '[portfolio] very slow GPU detected — bloom disabled, plain render path'
        );
      }
    }
    function animate() {
      rafId = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      if (mixer) {
        mixer.update(dt);
      }
      elapsed += dt;

      // keep the phone's lock-screen clock fresh
      idleClockTimer += dt;
      if (idleClockTimer > 30) {
        idleClockTimer = 0;
        if (!phoneViewOpen) phone?.drawIdle();
      }

      if (keyboard) {
        keyboard.update(dt, elapsed, theme === 'dark');
        if (hasEntered) {
          // idle "ghost typing" so the desk feels alive
          idleTypeTimer -= dt;
          if (idleTypeTimer <= 0) {
            keyboard.pressRandomKey();
            idleTypeTimer = 2.5 + Math.random() * 4.5;
          }
        }
      }

      if (cube) {
        cube.update(dt, elapsed, theme === 'dark');
      }

      // the neon honeycomb breathes gently at night (level is 0 in
      // daylight, so this is a no-op until the lights go off)
      if (wallMat) {
        wallMat.emissiveIntensity =
          wallNeon.level > 0.001
            ? wallNeon.level * (1 + Math.sin(elapsed * 1.6) * 0.06)
            : 0;
      }

      // the floor LED strips breathe on their own slightly faster rhythm
      // (level is 0 in daylight — the overlay stays fully transparent)
      if (floorLed) {
        floorLed.material.opacity =
          floorLedState.level > 0.001
            ? Math.min(1, floorLedState.level * (1 + Math.sin(elapsed * 2.1) * 0.07))
            : 0;
      }

      // drifting dust motes (night mode only — skip the work when hidden)
      if (dust.visible) {
        const dpos = dustGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < DUST_COUNT; i++) {
          const t = elapsed * 0.12 + dustPhase[i];
          dpos.setX(i, dustBase[i * 3] + Math.sin(t) * 0.02);
          dpos.setY(
            i,
            dustBase[i * 3 + 1] +
              Math.sin(elapsed * 0.07 + dustPhase[i] * 1.7) * 0.015
          );
          dpos.setZ(i, dustBase[i * 3 + 2] + Math.cos(t * 0.8) * 0.02);
        }
        dpos.needsUpdate = true;
      }

      // slow orbit after a while without input (any input pauses it)
      if (controls.enabled) {
        if (
          hasEntered &&
          !phoneViewOpen &&
          performance.now() - lastInteraction > 14000
        ) {
          controls.autoRotate = true;
        }
        controls.update();
      }

      // monitor glow shimmer — two overlapping sines read as panel
      // flicker rather than a pulse; fully off when the base is 0
      monitorGlow.intensity =
        monitorGlowState.base > 0.001
          ? monitorGlowState.base *
            (1 +
              Math.sin(elapsed * 6.7) * 0.045 +
              Math.sin(elapsed * 11.3 + 1.7) * 0.03)
          : 0;

      // the DoF focal plane tracks the orbit target, so whatever the
      // camera is framed on stays sharp and the room's edges soften
      if (bokehPass) {
        bokehPass.uniforms['focus'].value = camera.position.distanceTo(
          controls.target
        );
      }

      // the full cinematic chain runs in BOTH themes (SSAO + DoF +
      // grain are as important by day as by night); plain rendering is
      // only the console-error fallback
      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
      // adaptive quality — watch the WALL-CLOCK frame interval (rAF-to-rAF),
      // which captures GPU-side cost that async WebGL calls hide from a
      // simple render() timing; degrade in tiers if the GPU can't keep up
      if (perf.watching && perf.tier < 2) {
        const now = performance.now();
        if (perf.last) {
          perf.acc += now - perf.last;
          perf.frames++;
          if (perf.frames >= 20 || perf.acc > 3000) {
            const avg = perf.acc / Math.max(1, perf.frames);
            perf.frames = 0;
            perf.acc = 0;
            if (avg > 120) {
              degradeStep();
            } else if (++perf.cleanChecks >= 3) {
              // three clean windows in a row — stable, stop watching
              perf.watching = false;
            }
          }
        }
        perf.last = now;
      }
    }

    // INTRO 3D TEXT (wall) — title + subtitle built as ONE type lockup from
    // the same font: both lines share the exact same left edge (geometries
    // are translated by their left side bearing) and the subtitle's size is
    // solved so its width matches the title, so the block reads as a clean
    // aligned rectangle on the wall
    function loadIntroText() {
      const loader = new FontLoader(manager);
      loader.load('/fonts/unione.json', function (font) {
        const makeMaterials = () => [
          new THREE.MeshPhongMaterial({ color: 0x171f27, flatShading: true }),
          new THREE.MeshPhongMaterial({ color: 0xffffff }),
        ];

        const build = (str: string, size: number, depth: number) => {
          const geo = new TextGeometry(str, {
            font: font,
            size: size,
            height: depth,
          });
          geo.computeBoundingBox();
          const bb = geo.boundingBox!;
          const width = bb.max.x - bb.min.x;
          // strip the left side bearing so the anchor IS the left edge
          geo.translate(-bb.min.x, 0, 0);
          return { geo, width };
        };

        const TITLE_SIZE = 0.08;
        const DEPTH_RATIO = 0.125; // title: 0.01 depth at 0.08 size

        const title = build('NAVAIRGAP', TITLE_SIZE, TITLE_SIZE * DEPTH_RATIO);

        // solve the subtitle size that makes its width equal the title width
        const SUB_RAW = 'SECURITY RESEARCHER / BACKEND DEVELOPER';
        const probe = build(SUB_RAW, 0.02, 0.0025);
        probe.geo.dispose();
        let subSize = 0.02 * (title.width / probe.width);
        subSize = THREE.MathUtils.clamp(subSize, 0.014, 0.032);
        // same ABSOLUTE extrusion depth as the title so the 3D style reads
        // identically on both lines (a proportional depth is invisible at
        // the subtitle's scale)
        const sub = build(SUB_RAW, subSize, TITLE_SIZE * DEPTH_RATIO);

        titleText = new THREE.Mesh(title.geo, makeMaterials());
        titleText.rotation.y = Math.PI * 0.5;
        titleText.position.set(-0.27, 0.55, 0.42);
        scene.add(titleText);

        // the wall is viewed nearly head-on along the extrusion axis, so
        // white side faces (the title's look) vanish at subtitle scale —
        // dark side faces keep the extrusion silhouette readable instead
        subtitleText = new THREE.Mesh(sub.geo, [
          new THREE.MeshPhongMaterial({
            color: 0x171f27,
            flatShading: true,
          }),
          new THREE.MeshPhongMaterial({ color: 0x3d4956 }),
        ]);
        subtitleText.rotation.y = Math.PI * 0.5;
        // same wall offset, same left edge (z), tucked under the baseline
        subtitleText.position.set(-0.27, 0.5, 0.42);
        scene.add(subtitleText);
      });
    }

    // THEME SWITCH (light / dark)
    function switchTheme(themeType: string) {
      if (themeType === 'dark') {
        if (lightSwitch) lightSwitch.rotation.z = Math.PI / 7;
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');

        // the desk goes back to its original pale surface — the dark
        // theme tints the whole room and that lavender desk is the look
        // the dark mode is loved for
        if (tableMesh && tableOriginalMat) {
          tableMesh.material = tableOriginalMat;
        }

        // the walls sink into a deep charcoal slate at night and the
        // neon honeycomb wakes up — an LED-panel glow against the dark
        // (the level is applied with a gentle breathing pulse in the
        // render loop)
        if (wallMat) {
          gsap.to(wallMat.color, {
            r: WALL_DARK_SLATE.r,
            g: WALL_DARK_SLATE.g,
            b: WALL_DARK_SLATE.b,
            duration: 1.2,
          });
          gsap.to(wallNeon, { level: 1.25, duration: 1.6 });
        }

        // the floor rug deepens to navy with the night
        if (carpet) {
          gsap.to(carpet.material.color, {
            r: CARPET_DARK.r,
            g: CARPET_DARK.g,
            b: CARPET_DARK.b,
            duration: 1.2,
          });
        }

        // the floor skin sinks to near-black slate and the LED strips
        // wake up, tracing the rug's border, hexes and diamonds in
        // magenta + cyan (the render loop breathes them gently); a soft
        // magenta under-glow lifts the weave and the desk legs
        if (floorSkin) {
          gsap.to(floorSkin.material.color, {
            r: FLOOR_DARK.r,
            g: FLOOR_DARK.g,
            b: FLOOR_DARK.b,
            duration: 1.2,
          });
        }
        gsap.to(floorLedState, { level: 1, duration: 1.6 });
        gsap.to(floorGlowLight, { intensity: 0.32, duration: 1.6 });

        // the notebook settles for the night: its paper and cover dim a
        // touch (no more glare off the page) while a warm reading light
        // fades in right above the desk — the about view stays readable
        // and cozy after dark
        if (bookMat) {
          gsap.to(bookMat.color, {
            r: 0.855,
            g: 0.875,
            b: 0.894,
            duration: 1.2,
          });
        }
        if (bookCoverMat) {
          gsap.to(bookCoverMat.color, {
            r: 0.87,
            g: 0.87,
            b: 0.88,
            duration: 1.2,
          });
        }
        gsap.to(bookLight, { intensity: 0.55, duration: 1.4 });

        // main lights
        gsap.to(roomLight.color, {
          r: 0.27254901960784313,
          g: 0.23137254901963385,
          b: 0.6862745098039216,
        });
        gsap.to(ambientLight.color, {
          r: 0.17254901960784313,
          g: 0.23137254901963385,
          b: 0.6862745098039216,
        });
        gsap.to(roomLight, { intensity: 1.5 });
        gsap.to(ambientLight, { intensity: 0.3 });

        // fan lights
        gsap.to(fanLight5, { distance: 0.07 });

        // text color — two different neon colours at night: the
        // NAVAIRGAP title glows warm coral (the brand accent, popping
        // against the magenta honeycomb) while the subtitle underneath
        // glows cool cyan. Both are overdriven past 1 so the bloom pass
        // renders them as real neon
        if (titleText) {
          const mats = titleText.material as THREE.MeshPhongMaterial[];
          gsap.to(mats[0].color, { r: 2.8, g: 1.0, b: 0.5, duration: 0 });
          gsap.to(mats[1].color, { r: 1.2, g: 0.45, b: 0.25, duration: 0 });
        }
        if (subtitleText) {
          const mats = subtitleText.material as THREE.MeshPhongMaterial[];
          gsap.to(mats[0].color, { r: 0.4, g: 2.1, b: 2.3, duration: 0 });
          gsap.to(mats[1].color, { r: 0.2, g: 0.95, b: 1.05, duration: 0 });
        }

        // text light
        gsap.to(pointLight1, { intensity: 0.6 });
        gsap.to(pointLight2, { intensity: 0.6 });
        gsap.to(pointLight3, { intensity: 0.6 });
        gsap.to(pointLight4, { intensity: 0.6 });

        // reflections settle down with the night — the env layer is
        // dimmed so the dark room keeps its mood
        gsap.to(envState, {
          base: 0.28,
          duration: 1.2,
          onUpdate: applyEnvIntensity,
        });

        // glow on — the RGB setup deserves it
        if (bloomPass) {
          gsap.to(bloomPass, { strength: 0.5, duration: 1.2 });
        }
        // the monitor's screen spill brightens for the night — the panel
        // becomes the desk's key light
        gsap.to(monitorGlowState, {
          base: pcOn ? 2.3 : 0,
          duration: 1.2,
        });
        // the KTX2 badge reads as a backlit acrylic sticker at night
        if (ktxBadgeMat) {
          gsap.to(ktxBadgeMat, { emissiveIntensity: 1.1, duration: 1.2 });
        }
        // dust motes drift in with the night mode
        gsap.killTweensOf(dustMat);
        dust.visible = true;
        gsap.to(dustMat, { opacity: DUST_OPACITY, duration: 1.2 });
        setLightsOn(false);
      } else {
        if (lightSwitch) lightSwitch.rotation.z = 0;
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');

        // gaming desk: dark matte surface in the light theme so the RGB
        // keyboard, cube and screens pop like a proper battlestation
        if (tableMesh && tableGamingMat) {
          tableMesh.material = tableGamingMat;
        }

        // whitish-blue walls in daylight — a soft studio tint; the
        // neon honeycomb fades back out with the lights
        if (wallMat) {
          gsap.to(wallMat.color, {
            r: WALL_LIGHT_BLUE.r,
            g: WALL_LIGHT_BLUE.g,
            b: WALL_LIGHT_BLUE.b,
            duration: 1.2,
          });
          gsap.to(wallNeon, { level: 0, duration: 0.8 });
        }

        // the floor rug returns to its warm red daylight weave
        if (carpet) {
          gsap.to(carpet.material.color, {
            r: CARPET_LIGHT.r,
            g: CARPET_LIGHT.g,
            b: CARPET_LIGHT.b,
            duration: 1.2,
          });
        }

        // the floor goes back to its red daylight surface and the LED
        // strips + under-glow switch off with the honeycomb
        if (floorSkin) {
          gsap.to(floorSkin.material.color, {
            r: FLOOR_LIGHT_RED.r,
            g: FLOOR_LIGHT_RED.g,
            b: FLOOR_LIGHT_RED.b,
            duration: 1.2,
          });
        }
        gsap.to(floorLedState, { level: 0, duration: 0.8 });
        gsap.to(floorGlowLight, { intensity: 0, duration: 0.8 });

        // the notebook wakes up: bright white paper + cover again, and
        // the reading light hands over to the daylight
        if (bookMat) {
          gsap.to(bookMat.color, { r: 1, g: 1, b: 1, duration: 1.2 });
        }
        if (bookCoverMat) {
          gsap.to(bookCoverMat.color, { r: 1, g: 1, b: 1, duration: 1.2 });
        }
        gsap.to(bookLight, { intensity: 0, duration: 0.8 });

        // main light
        gsap.to(roomLight.color, { r: 1, g: 1, b: 1 });
        gsap.to(ambientLight.color, { r: 1, g: 1, b: 1 });
        gsap.to(roomLight, { intensity: 2.05 });
        gsap.to(ambientLight, { intensity: 0.45 });

        // fan light
        gsap.to(fanLight5, { distance: 0.05 });

        // text color
        if (titleText) {
          const mats = titleText.material as THREE.MeshPhongMaterial[];
          gsap.to(mats[0].color, {
            r: 0.09019607843137255,
            g: 0.12156862745098039,
            b: 0.15294117647058825,
            duration: 0,
          });
          gsap.to(mats[1].color, { r: 1, g: 1, b: 1, duration: 0 });
        }
        if (subtitleText) {
          const mats = subtitleText.material as THREE.MeshPhongMaterial[];
          gsap.to(mats[0].color, {
            r: 0.09019607843137255,
            g: 0.12156862745098039,
            b: 0.15294117647058825,
            duration: 0,
          });
          gsap.to(mats[1].color, { r: 1, g: 1, b: 1, duration: 0 });
        }

        // text light
        gsap.to(pointLight1, { intensity: 0 });
        gsap.to(pointLight2, { intensity: 0 });
        gsap.to(pointLight3, { intensity: 0 });
        gsap.to(pointLight4, { intensity: 0 });

        // daylight reflections come back up
        gsap.to(envState, {
          base: 0.34,
          duration: 1,
          onUpdate: applyEnvIntensity,
        });

        if (bloomPass) {
          // a whisper of bloom stays on in daylight so the video panel
          // keeps its glow against the bright room
          gsap.to(bloomPass, { strength: 0.12, duration: 0.8 });
        }
        // daylight hands the desk back to the studio light — the screen
        // spill steps down to a supporting role
        gsap.to(monitorGlowState, {
          base: pcOn ? 1.1 : 0,
          duration: 1,
        });
        if (ktxBadgeMat) {
          gsap.to(ktxBadgeMat, { emissiveIntensity: 0.25, duration: 0.8 });
        }
        // dust motes belong to the night — fade out and hide in daylight
        gsap.killTweensOf(dustMat);
        gsap.to(dustMat, {
          opacity: 0,
          duration: 0.8,
          onComplete: () => {
            if (theme !== 'dark') dust.visible = false;
          },
        });
        setLightsOn(true);
      }
    }

    function toggleLights() {
      theme = theme === 'light' ? 'dark' : 'light';
      switchTheme(theme);
    }

    // PC POWER — the tower on the desk IS the power button: clicking it
    // kills the monitor video, coasts the fans down and darkens every
    // LED in the case; clicking again boots it back up (fans spin up,
    // LEDs relight, the video fades in after a short POST beat)
    function pcPowerOff() {
      pcOn = false;
      playUiTick();
      videoEl?.pause();
      if (mixer) {
        gsap.killTweensOf(mixer);
        // fans coast down instead of freezing mid-blade
        gsap.to(mixer, { timeScale: 0, duration: 1.6, ease: 'power2.out' });
      }
      FAN_LIGHTS.forEach((light) => {
        gsap.to(light, { intensity: 0, duration: 0.45 });
      });
      ledMeshes.forEach((mesh) => {
        if (ledOffMat) mesh.material = ledOffMat;
      });
      // the monitor glow and the tower's LOD stand-in LED die with it
      gsap.to(monitorGlowState, { base: 0, duration: 0.45 });
      if (towerLedStripMat) {
        gsap.to(towerLedStripMat, { emissiveIntensity: 0.04, duration: 0.45 });
      }
      if (screenMesh && screenOffMat) {
        if (videoMat) gsap.killTweensOf(videoMat);
        screenMesh.material = screenOffMat;
      }
    }

    function pcPowerOn() {
      pcOn = true;
      playUiTick();
      videoEl?.play().catch(() => {});
      if (mixer) {
        gsap.killTweensOf(mixer);
        gsap.to(mixer, { timeScale: 1, duration: 0.7, ease: 'power2.in' });
      }
      FAN_LIGHTS.forEach((light, i) => {
        gsap.to(light, { intensity: FAN_LIGHT_BASE[i], duration: 0.5 });
      });
      ledMeshes.forEach((mesh, i) => {
        mesh.material = ledOriginalMats[i];
      });
      // screen spill + stand-in LED come back with the boot
      gsap.to(monitorGlowState, {
        base: theme === 'dark' ? 2.3 : 1.1,
        duration: 0.5,
        delay: 0.5,
      });
      if (towerLedStripMat) {
        gsap.to(towerLedStripMat, {
          emissiveIntensity: 1.6,
          duration: 0.5,
          delay: 0.5,
        });
      }
      if (screenMesh && videoMat) {
        gsap.killTweensOf(videoMat);
        // a short POST beat, then the panel fades in like a real boot
        videoMat.transparent = true;
        videoMat.opacity = 0;
        screenMesh.material = videoMat;
        gsap.to(videoMat, {
          opacity: 1,
          duration: 0.55,
          delay: 0.5,
          ease: 'power2.in',
          onComplete: () => {
            videoMat!.transparent = false;
            videoMat!.opacity = 1;
          },
        });
      }
    }

    function togglePcPower() {
      if (pcOn) pcPowerOff();
      else pcPowerOn();
    }

    // CAMERA HELPERS
    function enableOrbitControls() {
      controls.enabled = true;
    }

    function disableOrbitControls() {
      controls.enabled = false;
    }

    function killCameraTweens(): void {
      gsap.killTweensOf(camera.position);
      gsap.killTweensOf(camera.rotation);
    }

    // schedule a delayed call that auto-cancels when a newer camera
    // choreography starts — prevents stale callbacks from yanking the
    // camera or flashing UI state after the user switched views
    function guardedDelay(delay: number, fn: () => void): void {
      const seq = camSeq;
      gsap.delayedCall(delay, () => {
        if (seq === camSeq) fn();
      });
    }

    function resetBookCover() {
      if (!bookCover) return;
      gsap.killTweensOf(bookCover.rotation);
      gsap.to(bookCover.rotation, { x: 0, duration: 1.5 });
    }

    // put the mug down if a sip was interrupted by another view —
    // guarantees the mug can never be left floating mid-air
    function resetMug() {
      setCoffeeMsg(null);
      if (!mug || !mugRestPos || !mugRestQuat) return;
      gsap.killTweensOf(mug.position);
      gsap.killTweensOf(mug.quaternion);
      const settled =
        mug.position.distanceTo(mugRestPos) < 1e-4 &&
        Math.abs(mug.quaternion.dot(mugRestQuat)) > 0.99999;
      if (settled) return;
      gsap.to(mug.position, {
        x: mugRestPos.x,
        y: mugRestPos.y,
        z: mugRestPos.z,
        duration: 0.6,
        ease: 'power2.out',
      });
      gsap.to(mug.quaternion, {
        x: mugRestQuat.x,
        y: mugRestQuat.y,
        z: mugRestQuat.z,
        w: mugRestQuat.w,
        duration: 0.6,
        ease: 'power2.out',
      });
    }

    // Put the phone back down on the desk (no-op if it isn't up)
    function closePhoneView() {
      if (!phoneViewOpen && !phoneStanding) return;
      phoneViewOpen = false;
      // kill any in-flight pickup/return tweens so they can never fight
      if (mobile) {
        gsap.killTweensOf(mobile.position);
        gsap.killTweensOf(mobile.quaternion);
      }
      setPhoneOpen(false);
      phone?.drawIdle();
      gsap.to(phoneLight, { intensity: 0, duration: 0.5 });
      if (mobile && phoneStanding && phoneRestQuat && phoneRestPos) {
        phoneStanding = false;
        gsap.to(mobile.quaternion, {
          x: phoneRestQuat.x,
          y: phoneRestQuat.y,
          z: phoneRestQuat.z,
          w: phoneRestQuat.w,
          duration: 1.1,
          ease: 'power2.inOut',
        });
        gsap.to(mobile.position, {
          x: phoneRestPos.x,
          y: phoneRestPos.y,
          z: phoneRestPos.z,
          duration: 1.1,
          ease: 'power2.inOut',
        });
        // park the glow light back over the desk for the next pickup
        const mp = new THREE.Vector3();
        mobile.getWorldPosition(mp);
        phoneLight.position.set(mp.x + 0.05, mp.y + 0.11, mp.z + 0.05);
      }
    }

    function resetProjects() {
      if (projects.length === 0) return;
      projects.forEach((project) => {
        if (!project.mesh) return;
        gsap.killTweensOf(project.mesh.position);
        gsap.killTweensOf(project.mesh.scale);
        gsap.killTweensOf(project.mesh.material as THREE.MeshBasicMaterial);
        gsap.to(project.mesh.material as THREE.MeshBasicMaterial, {
          opacity: 0,
          duration: 1,
        });
        gsap.to(project.mesh.position, {
          y: project.y ?? 0,
          duration: 1,
        });
        gsap.to(project.mesh.scale, {
          x: 0,
          y: 0,
          z: 0,
          duration: 0,
          delay: 1,
        });
      });
    }

    function lookAtEuler(
      eye: THREE.Vector3,
      target: THREE.Vector3
    ): { x: number; y: number; z: number } {
      const m = new THREE.Matrix4().lookAt(
        eye,
        target,
        new THREE.Vector3(0, 1, 0)
      );
      const e = new THREE.Euler().setFromRotationMatrix(m, 'XYZ');
      return { x: e.x, y: e.y, z: e.z };
    }

    function resetCamera() {
      camSeq++;
      killCameraTweens();
      kbPeekBusyUntil = 0;
      setCubePhase(null);
      closePhoneView();
      setCloseVisible(false);
      resetBookCover();
      resetMug();
      resetProjects();
      gsap.to(camera.position, { ...defaultCameraPos, duration: 1.5 });
      gsap.to(camera.rotation, { ...defaultCameraRot, duration: 1.5 });
      guardedDelay(1.5, enableOrbitControls);

      // reset dimmed light for about display
      if (theme !== 'dark') {
        gsap.to(roomLight, { intensity: 2.05, duration: 1.5 });
      } else {
        gsap.to(roomLight, { intensity: 1.5, duration: 1.5 });
      }
    }

    function cameraToAbout() {
      if (!bookCover) return;
      killCameraTweens();
      gsap.to(camera.position, { ...aboutCameraPos, duration: 1.5 });
      gsap.to(camera.rotation, { ...aboutCameraRot, duration: 1.5 });
      gsap.killTweensOf(bookCover.rotation);
      gsap.to(bookCover.rotation, { x: Math.PI, duration: 1.5, delay: 1.5 });

      // prevent about text clutter due to bright light — dim the key
      // light in BOTH themes; at night the warm reading light above the
      // notebook takes over so the page stays glare-free and readable
      if (theme !== 'dark') {
        gsap.to(roomLight, { intensity: 1, duration: 1.5 });
      } else {
        gsap.to(roomLight, { intensity: 0.85, duration: 1.5 });
      }
    }

    function goToAbout() {
      if (!bookCover) return; // room assets not ready yet
      camSeq++;
      killCameraTweens();
      disableOrbitControls();
      closePhoneView();
      setCloseVisible(false);
      resetProjects();
      resetMug();
      cameraToAbout();
      guardedDelay(1.5, () => setCloseVisible(true));
    }

    // PROJECT PLANES
    function createProjectPlanes() {
      projects.forEach((project, i) => {
        const colIndex = i % 3 === 0 ? 0 : 1;
        const rowIndex = Math.floor(i / 3);
        const geometry = new THREE.PlaneGeometry(0.71, 0.4);
        const material = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          map: new THREE.TextureLoader(manager).load(project.image),
          transparent: true,
          opacity: 0.0,
        });
        const projectPlane = new THREE.Mesh(geometry, material);
        projectPlane.name = 'project';
        projectPlane.userData = { url: project.url };
        projectPlane.position.set(
          0.3 + i * 0.8 * colIndex,
          1 - rowIndex * 0.5,
          -1.15
        );
        projectPlane.scale.set(0, 0, 0);
        project.mesh = projectPlane;
        project.y = 1 - rowIndex * 0.5;
        scene.add(projectPlane);
      });
    }

    function goToProjects() {
      camSeq++;
      killCameraTweens();
      disableOrbitControls();
      closePhoneView();
      setCloseVisible(false);
      resetBookCover();
      resetMug();
      gsap.to(camera.position, { ...projectsCameraPos, duration: 1.5 });
      gsap.to(camera.rotation, { ...projectsCameraRot, duration: 1.5 });
      guardedDelay(1.5, () => setCloseVisible(true));

      // animate & show project items
      projects.forEach((project, i) => {
        if (!project.mesh) return;
        project.mesh.scale.set(1, 1, 1);
        gsap.to(project.mesh.material as THREE.MeshBasicMaterial, {
          opacity: 1,
          duration: 1.5,
          delay: 1.5 + i * 0.1,
        });
        gsap.to(project.mesh.position, {
          y: (project.y ?? 0) + 0.05,
          duration: 1,
          delay: 1.5 + i * 0.1,
        });
      });
    }

    // PHONE MATH — the screen quad's own UV axes are recovered in world
    // space, so every calculation below stays correct whatever orientation
    // the model author baked in (and after we rotate the phone ourselves).
    // With the screen texture's PI rotation + flipY=false the canvas
    // content's up direction runs along the quad's +v axis (the LONG side)
    // — see phoneScreen.ts — so the phone reads portrait once it stands up.
    function screenAxes(): {
      center: THREE.Vector3;
      normal: THREE.Vector3;
      uAxis: THREE.Vector3;
      vAxis: THREE.Vector3;
      uLen: number;
      vLen: number;
    } | null {
      if (!mobileScreen) return null;
      mobileScreen.updateWorldMatrix(true, false);
      const pos = mobileScreen.geometry.attributes.position;
      const uv = mobileScreen.geometry.attributes.uv;
      if (!pos || !uv || pos.count < 4) return null;

      // find the vertices closest to the uv corners to recover the quad's
      // u/v axes in world space
      let i00 = 0;
      let i10 = 0;
      let i01 = 0;
      let d00 = Infinity;
      let d10 = Infinity;
      let d01 = Infinity;
      for (let i = 0; i < pos.count; i++) {
        const u = uv.getX(i);
        const v = uv.getY(i);
        const q00 = u * u + v * v;
        const q10 = (1 - u) * (1 - u) + v * v;
        const q01 = u * u + (1 - v) * (1 - v);
        if (q00 < d00) {
          d00 = q00;
          i00 = i;
        }
        if (q10 < d10) {
          d10 = q10;
          i10 = i;
        }
        if (q01 < d01) {
          d01 = q01;
          i01 = i;
        }
      }
      const vertexWorld = (i: number) =>
        new THREE.Vector3(
          pos.getX(i),
          pos.getY(i),
          pos.getZ(i)
        ).applyMatrix4(mobileScreen.matrixWorld);
      const uVec = new THREE.Vector3().subVectors(
        vertexWorld(i10),
        vertexWorld(i00)
      );
      const vVec = new THREE.Vector3().subVectors(
        vertexWorld(i01),
        vertexWorld(i00)
      );
      const uLen = uVec.length();
      const vLen = vVec.length();
      if (uLen < 1e-6 || vLen < 1e-6) return null;
      const uAxis = uVec.divideScalar(uLen);
      const vAxis = vVec.divideScalar(vLen);

      let normal = new THREE.Vector3().crossVectors(uAxis, vAxis);
      if (normal.lengthSq() < 1e-10) {
        normal.set(0, 1, 0);
      } else {
        normal.normalize();
      }

      const box = new THREE.Box3().setFromObject(mobileScreen);
      const center = box.getCenter(new THREE.Vector3());
      const toDefault = new THREE.Vector3(
        defaultCameraPos.x - center.x,
        defaultCameraPos.y - center.y,
        defaultCameraPos.z - center.z
      );
      if (normal.dot(toDefault) < 0) normal.negate();

      return { center, normal, uAxis, vAxis, uLen, vLen };
    }

    // Camera framing basis for the current phone pose — content-up runs
    // along the quad's +v axis, so the UI reads upright in the view.
    function phoneViewBasis(): {
      center: THREE.Vector3;
      normal: THREE.Vector3;
      up: THREE.Vector3;
      uLen: number;
      vLen: number;
    } | null {
      const ax = screenAxes();
      if (!ax) return null;
      return {
        center: ax.center,
        normal: ax.normal,
        up: ax.vAxis,
        uLen: ax.uLen,
        vLen: ax.vLen,
      };
    }

    // Target pose for the "picked up" phone: standing vertically (the
    // screen's long +v axis along world up), screen facing the default
    // camera, lifted just clear of the desk as if being held.
    function computeStandPose(): {
      quat: THREE.Quaternion;
      pos: THREE.Vector3;
    } | null {
      if (!mobile || !mobileScreen) return null;
      const ax = screenAxes();
      if (!ax) return null;

      // rotation that maps: +v -> world up, screen normal -> toward viewer
      const toY = new THREE.Vector3(0, 1, 0);
      const toZ = new THREE.Vector3(
        defaultCameraPos.x - ax.center.x,
        0,
        defaultCameraPos.z - ax.center.z
      );
      if (toZ.lengthSq() < 1e-10) toZ.set(0, 0, 1);
      toZ.normalize();
      const toX = new THREE.Vector3().crossVectors(toY, toZ).normalize();

      const fromY = ax.vAxis.clone();
      const fromZ = ax.normal.clone();
      const fromX = new THREE.Vector3()
        .crossVectors(fromY, fromZ)
        .normalize();

      const mFrom = new THREE.Matrix4().makeBasis(fromX, fromY, fromZ);
      const mTo = new THREE.Matrix4().makeBasis(toX, toY, toZ);
      const qWorld = new THREE.Quaternion().setFromRotationMatrix(
        mTo.clone().multiply(mFrom.clone().invert())
      );

      // convert the world-space target rotation into the mobile's own
      // local frame (its parent may be scaled on small screens)
      const qCur = mobile.getWorldQuaternion(new THREE.Quaternion());
      const qParent = mobile.parent
        ? mobile.parent.getWorldQuaternion(new THREE.Quaternion())
        : new THREE.Quaternion();
      const targetQuat = qParent
        .clone()
        .invert()
        .multiply(qWorld.multiply(qCur));

      // lift so the standing phone clears the desk (world -> local)
      const worldPos = mobile.getWorldPosition(new THREE.Vector3());
      const bodyLong = ax.vLen + 0.007;
      const wp = worldPos.clone();
      wp.y += 0.008 + bodyLong / 2;
      const targetPos = mobile.parent
        ? mobile.parent.worldToLocal(wp.clone())
        : wp;

      return { quat: targetQuat, pos: targetPos };
    }

    // evaluate a function as if the phone had already stood up
    function withPhonePose<T>(
      pose: { quat: THREE.Quaternion; pos: THREE.Vector3 },
      fn: () => T
    ): T {
      if (!mobile) return fn();
      const q = mobile.quaternion.clone();
      const p = mobile.position.clone();
      mobile.quaternion.copy(pose.quat);
      mobile.position.copy(pose.pos);
      mobile.updateWorldMatrix(true, true);
      const out = fn();
      mobile.quaternion.copy(q);
      mobile.position.copy(p);
      mobile.updateWorldMatrix(true, true);
      return out;
    }

    // PHONE CONTACT VIEW — "picked up" choreography: the phone rises off
    // the desk and stands vertical while the camera swoops in front of it,
    // then the contacts app opens on the portrait screen.
    function goToPhone() {
      if (!mobile || phoneViewOpen) return;
      const stand = computeStandPose();
      if (!stand) return;
      const basis = withPhonePose(stand, () => phoneViewBasis());
      if (!basis) return;
      phoneViewOpen = true;
      camSeq++;
      killCameraTweens();
      disableOrbitControls();
      resetProjects();
      resetBookCover();
      resetMug();
      hideTooltip();
      setCloseVisible(false);

      // the phone is picked up and stands on end
      phoneStanding = true;
      gsap.killTweensOf(mobile.quaternion);
      gsap.killTweensOf(mobile.position);
      gsap.to(mobile.quaternion, {
        x: stand.quat.x,
        y: stand.quat.y,
        z: stand.quat.z,
        w: stand.quat.w,
        duration: 1.25,
        ease: 'power2.inOut',
      });
      gsap.to(mobile.position, {
        x: stand.pos.x,
        y: stand.pos.y,
        z: stand.pos.z,
        duration: 1.25,
        ease: 'power2.inOut',
      });

      const { center, normal, up, uLen, vLen } = basis;

      // distance so the portrait screen fills a set fraction of the
      // viewport (height on desktop, width on narrow screens)
      const vHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const hHalf = vHalf * camera.aspect;
      const fill = isMobileNow() ? 0.66 : 0.6;
      const dist = Math.max(
        (vLen / 2) / (fill * vHalf),
        (uLen / 2) / (fill * hHalf)
      );
      const eye = center.clone().addScaledVector(normal, dist);
      const rot = new THREE.Euler().setFromRotationMatrix(
        new THREE.Matrix4().lookAt(eye, center, up),
        'XYZ'
      );

      gsap.to(camera.position, {
        x: eye.x,
        y: eye.y,
        z: eye.z,
        duration: 1.5,
        delay: 0.3,
        ease: 'power2.inOut',
      });
      gsap.to(camera.rotation, {
        x: rot.x,
        y: rot.y,
        z: rot.z,
        duration: 1.5,
        delay: 0.3,
        ease: 'power2.inOut',
      });
      guardedDelay(1.75, () => {
        setPhoneOpen(true);
        setCloseVisible(true);
        phone?.drawContact();
        const b = phoneViewBasis();
        if (b) {
          phoneLight.position
            .copy(b.center)
            .addScaledVector(b.normal, 0.05)
            .add(new THREE.Vector3(0, 0.09, 0));
        }
        gsap.to(phoneLight, { intensity: 0.55, duration: 0.5 });
      });
    }

    // KEYBOARD TYPING PEEK — swoop over the keys, type, glide back
    function goToKeyboardPeek() {
      if (!keyboardDeck) return;
      // ignore re-triggers while a peek show is already running — unless
      // the user navigated away in between (camSeq changed), then a fresh
      // peek is legitimate
      if (
        performance.now() < kbPeekBusyUntil &&
        kbPeekLastSeq === camSeq
      ) {
        return;
      }
      kbPeekBusyUntil = performance.now() + 4700;
      kbPeekLastSeq = camSeq + 1; // this choreography's sequence
      camSeq++;
      killCameraTweens();
      disableOrbitControls();
      closePhoneView();
      resetProjects();
      resetBookCover();
      resetMug();
      hideTooltip();

      const p = new THREE.Vector3();
      keyboardDeck.getWorldPosition(p);
      p.y += 0.012;
      const dir = new THREE.Vector3(
        defaultCameraPos.x - p.x,
        defaultCameraPos.y - p.y,
        defaultCameraPos.z - p.z
      ).normalize();
      const dist = isMobileNow() ? 0.25 : 0.3;
      const eye = p.clone().addScaledVector(dir, dist);
      eye.y = Math.max(eye.y, p.y + 0.13);
      const rot = lookAtEuler(eye, p);

      gsap.to(camera.position, {
        x: eye.x,
        y: eye.y,
        z: eye.z,
        duration: 1.1,
        ease: 'power2.inOut',
      });
      gsap.to(camera.rotation, {
        ...rot,
        duration: 1.1,
        ease: 'power2.inOut',
      });

      // type once the camera arrives, then return to the default view
      guardedDelay(1.1, () => {
        keyboard?.burst((label) => playKeyClick(label), 30);
      });
      guardedDelay(1.1 + 2.2, () => {
        gsap.to(camera.position, {
          ...defaultCameraPos,
          duration: 1.2,
          ease: 'power2.inOut',
        });
        gsap.to(camera.rotation, {
          ...defaultCameraRot,
          duration: 1.2,
          ease: 'power2.inOut',
        });
      });
      guardedDelay(1.1 + 2.2 + 1.25, enableOrbitControls);
    }

    // COFFEE SIP — the mug is the tiniest prop with the biggest job:
    // clicking it lifts it off the desk, tips it back for a drink
    // (steam curling off the rim, slurp + gulp if sounds are on), then
    // settles it back down with a ceramic tap
    function drinkCoffee() {
      if (!mug || !mugRestPos || !mugRestQuat) return;
      // ignore re-triggers while a sip is already running — unless the
      // user navigated away in between (camSeq changed)
      if (
        performance.now() < coffeeBusyUntil &&
        coffeeLastSeq === camSeq
      ) {
        return;
      }
      coffeeBusyUntil = performance.now() + 5600;
      coffeeLastSeq = camSeq + 1; // this choreography's sequence
      camSeq++;
      killCameraTweens();
      disableOrbitControls();
      closePhoneView();
      resetProjects();
      resetBookCover();
      setCubePhase(null);
      hideTooltip();
      setCloseVisible(false);

      // where the mug sits in the world right now
      const anchor = mug.getWorldPosition(new THREE.Vector3());
      // horizontal direction from the mug toward the default view —
      // the sip leans that way so the drink reads from the default cam
      const toCam = new THREE.Vector3(
        defaultCameraPos.x - anchor.x,
        0,
        defaultCameraPos.z - anchor.z
      ).normalize();

      // close-up camera pose (approach from the default-view direction)
      const look = anchor.clone();
      look.y += 0.03;
      const dir = new THREE.Vector3(
        defaultCameraPos.x - look.x,
        defaultCameraPos.y - look.y,
        defaultCameraPos.z - look.z
      ).normalize();
      const dist = isMobileNow() ? 0.2 : 0.24;
      const eye = look.clone().addScaledVector(dir, dist);
      eye.y = Math.max(eye.y, look.y + 0.09);
      const rot = lookAtEuler(eye, look);

      // lift pose (room-local — the room may be scaled on mobile):
      // up off the desk and nudged toward the viewer
      const roomScale = roomRoot ? roomRoot.scale.x || 1 : 1;
      const liftLocal = mugRestPos.clone();
      liftLocal.x += (toCam.x * 0.045) / roomScale;
      liftLocal.y += 0.115 / roomScale;
      liftLocal.z += (toCam.z * 0.045) / roomScale;

      // drinking tilt — rotate the mug's up-axis toward the viewer
      const tiltAxis = new THREE.Vector3()
        .crossVectors(new THREE.Vector3(0, 1, 0), toCam)
        .normalize();
      const tiltQuat = new THREE.Quaternion().setFromAxisAngle(
        tiltAxis,
        THREE.MathUtils.degToRad(64)
      );

      setCoffeeMsg('☕ drink coffee');
      gsap.to(camera.position, {
        x: eye.x,
        y: eye.y,
        z: eye.z,
        duration: 1.1,
        ease: 'power2.inOut',
      });
      gsap.to(camera.rotation, {
        ...rot,
        duration: 1.1,
        ease: 'power2.inOut',
      });

      // the pickup
      gsap.to(mug.position, {
        x: liftLocal.x,
        y: liftLocal.y,
        z: liftLocal.z,
        duration: 0.85,
        delay: 0.5,
        ease: 'power2.inOut',
      });

      // tip it back and sip
      guardedDelay(1.2, () => {
        playCoffeeSlurp();
        gsap.to(mug.quaternion, {
          x: tiltQuat.x,
          y: tiltQuat.y,
          z: tiltQuat.z,
          w: tiltQuat.w,
          duration: 0.55,
          ease: 'power2.inOut',
        });
      });

      // steam curls off the rim while drinking (the rim tracks the
      // mug through its lift + tilt via matrixWorld)
      for (let i = 0; i < 6; i++) {
        guardedDelay(1.55 + i * 0.26, () => {
          if (!mug) return;
          const rim = new THREE.Vector3(0, 0.03, 0).applyMatrix4(
            mug.matrixWorld
          );
          spawnSteamPuff(rim);
        });
      }

      // tip back down and return to the desk
      guardedDelay(3.2, () => {
        gsap.to(mug.quaternion, {
          x: mugRestQuat.x,
          y: mugRestQuat.y,
          z: mugRestQuat.z,
          w: mugRestQuat.w,
          duration: 0.5,
          ease: 'power2.inOut',
        });
      });
      guardedDelay(3.6, () => {
        gsap.to(mug.position, {
          x: mugRestPos.x,
          y: mugRestPos.y,
          z: mugRestPos.z,
          duration: 0.85,
          ease: 'power2.inOut',
        });
      });
      guardedDelay(4.35, () => playMugDown());

      // back to the default view, recharged
      guardedDelay(4.45, () => {
        setCoffeeMsg('ahh — recharged ⚡');
        gsap.to(camera.position, {
          ...defaultCameraPos,
          duration: 1.15,
          ease: 'power2.inOut',
        });
        gsap.to(camera.rotation, {
          ...defaultCameraRot,
          duration: 1.15,
          ease: 'power2.inOut',
        });
      });
      guardedDelay(5.2, () => setCoffeeMsg(null));
      guardedDelay(5.35, enableOrbitControls);
    }

    // a soft radial-gradient sprite puff that rises off the coffee
    function spawnSteamPuff(origin: THREE.Vector3) {
      if (!steamTexture) {
        const c = document.createElement('canvas');
        c.width = 64;
        c.height = 64;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
        grad.addColorStop(0, 'rgba(255,255,255,0.9)');
        grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 64, 64);
        steamTexture = new THREE.CanvasTexture(c);
      }
      const mat = new THREE.SpriteMaterial({
        map: steamTexture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const puff = new THREE.Sprite(mat);
      const jitter = () => (Math.random() - 0.5) * 0.014;
      puff.position.set(origin.x + jitter(), origin.y, origin.z + jitter());
      puff.scale.setScalar(0.02);
      scene.add(puff);
      steamPuffs.push(puff);

      gsap.to(puff.position, {
        y: origin.y + 0.06 + Math.random() * 0.02,
        x: puff.position.x + (Math.random() - 0.5) * 0.02,
        z: puff.position.z + (Math.random() - 0.5) * 0.02,
        duration: 1.3,
        ease: 'sine.in',
      });
      gsap.to(puff.scale, {
        x: 0.055,
        y: 0.055,
        z: 0.055,
        duration: 1.3,
        ease: 'sine.out',
      });
      gsap.to(mat, {
        opacity: 0.5,
        duration: 0.22,
        onComplete: () => {
          gsap.to(mat, {
            opacity: 0,
            duration: 0.9,
            delay: 0.15,
            onComplete: () => {
              scene.remove(puff);
              mat.dispose();
              const i = steamPuffs.indexOf(puff);
              if (i >= 0) steamPuffs.splice(i, 1);
            },
          });
        },
      });
    }

    // RUBIK'S CUBE SHOW — fly in close, the cube scrambles itself, then
    // solves itself with a flourish; the camera returns when it's done
    function goToCubeShow() {
      if (!cube) return;
      camSeq++;
      killCameraTweens();
      disableOrbitControls();
      closePhoneView();
      resetProjects();
      resetBookCover();
      resetMug();
      hideTooltip();
      setCloseVisible(false);

      cube.group.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(cube.group);
      const center = box.getCenter(new THREE.Vector3());
      const sizeVec = box.getSize(new THREE.Vector3());
      const edge = Math.max(sizeVec.x, sizeVec.y, sizeVec.z);
      if (edge < 1e-4) return;

      // approach from the default-view direction, slightly elevated so
      // three faces stay visible; distance solves the framing like the
      // phone view does (height on desktop, width on narrow screens)
      const dir = new THREE.Vector3(
        defaultCameraPos.x - center.x,
        0,
        defaultCameraPos.z - center.z
      );
      if (dir.lengthSq() < 1e-10) dir.set(1, 0, 0);
      dir.normalize();
      const vHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const hHalf = vHalf * camera.aspect;
      const fill = isMobileNow() ? 0.52 : 0.5;
      const dist =
        Math.max(
          (edge * 0.92) / (fill * vHalf),
          (edge * 0.78) / (fill * hHalf)
        ) * 1.06;
      const eye = center.clone().addScaledVector(dir, dist);
      eye.y = Math.max(center.y + edge * 0.95, center.y + 0.02);
      const target = center.clone();
      target.y -= edge * 0.12;
      const rot = lookAtEuler(eye, target);

      gsap.to(camera.position, {
        x: eye.x,
        y: eye.y,
        z: eye.z,
        duration: 1.2,
        ease: 'power2.inOut',
      });
      gsap.to(camera.rotation, {
        ...rot,
        duration: 1.2,
        ease: 'power2.inOut',
      });

      guardedDelay(1.3, () => {
        setCloseVisible(true);
        cube?.startShow({
          onMove: () => playCubeTurn(),
          onPhase: (phase) => {
            setCubePhase(
              phase === 'scramble' ? 'scrambling…' : 'auto-solving…'
            );
          },
          onSolved: () => {
            playSolveFanfare();
            setCubePhase('solved — zero bugs, as it should be');
            guardedDelay(1.35, () => {
              setCubePhase(null);
              setCloseVisible(false);
              killCameraTweens();
              gsap.to(camera.position, {
                ...defaultCameraPos,
                duration: 1.3,
                ease: 'power2.inOut',
              });
              gsap.to(camera.rotation, {
                ...defaultCameraRot,
                duration: 1.3,
                ease: 'power2.inOut',
              });
              guardedDelay(1.35, enableOrbitControls);
            });
          },
        });
      });
    }

    // INTRO SWEEP (after the "enter" gate)
    function startIntro() {
      if (introStarted) return;
      introStarted = true;
      hasEntered = true;
      camSeq++;
      killCameraTweens();
      videoEl?.play().catch(() => {});
      gsap.to(camera.position, {
        ...defaultCameraPos,
        duration: 2.8,
        ease: 'power2.inOut',
      });
      gsap.to(camera.rotation, {
        ...defaultCameraRot,
        duration: 2.8,
        ease: 'power2.inOut',
      });
      guardedDelay(2.9, () => {
        enableOrbitControls();
        setHintVisible(true);
        // no cube wiggle here — the cube must stay quiet until the user
        // actually clicks it; no nudging, no advertising
        gsap.delayedCall(7, () => setHintVisible(false));
      });
    }

    // 3D WORLD CLICK LISTENERS (raycaster)
    const mousePosition = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();

    function hideTooltip() {
      const el = tooltipRef.current;
      if (el) el.classList.remove('hover-tooltip--visible');
      canvas.style.cursor = '';
    }

    function onWindowClick(e: MouseEvent) {
      if (!hasEntered) return;
      // e.target is not always an Element (the document itself, text
      // nodes via synthetic events…) — guard before using .closest
      const target = e.target instanceof Element ? e.target : null;
      // ignore clicks that originate from the UI chrome (including the
      // loader gate — its ENTER button sits right over the desk props)
      if (
        target &&
        target.closest(
          'header, footer, main, nav, #close-btn, #loader-wrapper'
        )
      ) {
        return;
      }

      if (phoneViewOpen) {
        // tapping a contact row opens its link; anything else puts the
        // phone back down on the desk
        mousePosition.x = (e.clientX / window.innerWidth) * 2 - 1;
        mousePosition.y = -(e.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mousePosition, camera);
        if (mobileScreen) {
          const hit = raycaster.intersectObject(mobileScreen, false)[0];
          if (hit && hit.uv && phone) {
            const url = phone.hitTest(hit.uv.x, hit.uv.y);
            if (url) {
              window.open(url, '_blank');
              return;
            }
          }
        }
        resetCamera();
        return;
      }

      mousePosition.x = (e.clientX / window.innerWidth) * 2 - 1;
      mousePosition.y = -(e.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mousePosition, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);

      for (const intersect of intersects) {
        const name = findInteractiveName(intersect.object);
        if (!name) {
          // the monitor swallows clicks aimed at the video so the tower
          // behind it can't be powered off by accident
          if (isClickBlocker(intersect.object)) break;
          continue;
        }

        if (name === 'project') {
          const url = intersect.object.userData?.url as string | undefined;
          if (url) window.open(url, '_blank');
        } else if (name === 'CPU') {
          togglePcPower();
        } else if (name === 'Coffe') {
          drinkCoffee();
        } else if (name === 'Book' || name === 'Book001') {
          goToAbout();
        } else if (name === 'SwitchBoard' || name === 'Switch') {
          toggleLights();
          playUiTick();
        } else if (name === 'Mobile' || name === 'Mobile_Screen') {
          goToPhone();
        } else if (name === 'Keyboard' || name === 'KeyboardKey') {
          goToKeyboardPeek();
        } else if (name === 'RubikCube') {
          goToCubeShow();
        }
        break; // handle the first interactive hit only
      }
    }

    // HOVER TOOLTIPS over interactive props
    let hoverTargets: THREE.Object3D[] = [];

    function onPointerMove(e: PointerEvent) {
      if (
        !hasEntered ||
        !controls.enabled ||
        e.pointerType === 'touch' ||
        phoneViewOpen
      ) {
        hideTooltip();
        return;
      }
      const target = e.target instanceof Element ? e.target : null;
      // only hover over the 3D scene itself — skip the UI chrome
      if (
        target &&
        target.closest(
          'header, footer, main, nav, #close-btn, #loader-wrapper'
        )
      ) {
        hideTooltip();
        return;
      }

      mousePosition.x = (e.clientX / window.innerWidth) * 2 - 1;
      mousePosition.y = -(e.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mousePosition, camera);
      const hits = raycaster.intersectObjects(hoverTargets, true);

      const el = tooltipRef.current;
      if (!el) return;

      if (hits.length > 0) {
        const name = findInteractiveName(hits[0].object);
        let label = name ? hoverLabelFor(name) : null;
        if (name === 'CPU') {
          label = pcOn ? 'PC power — turn off' : 'PC power — turn on';
        }
        if (label) {
          el.textContent = label;
          el.style.left = `${e.clientX}px`;
          el.style.top = `${e.clientY}px`;
          el.classList.add('hover-tooltip--visible');
          canvas.style.cursor = 'pointer';
          return;
        }
      }
      hideTooltip();
    }

    // RESPONSIVE — idempotent, re-run on resize so rotating a phone
    // re-frames the room correctly
    function initResponsive(roomScene: THREE.Group) {
      const mobile = isMobileNow();
      roomScene.scale.setScalar(mobile ? 0.95 : 1);

      // about view: look STRAIGHT DOWN at the notebook page, computed
      // from the book's real world-space geometry (works at any room
      // scale) — the old fixed pose was ~12° off-axis which tilted every
      // line of text on the page. Page X maps to screen-vertical and page
      // Z to screen-horizontal (camera rolled 90°), so the distance is
      // solved from the current fov + aspect to frame the page evenly.
      roomScene.updateMatrixWorld(true);
      if (bookMesh) {
        const geo = bookMesh.geometry;
        geo.computeBoundingBox();
        const bb = geo.boundingBox;
        if (bb) {
          // world-space page box (accounts for responsive room scaling)
          const worldBox = bb
            .clone()
            .applyMatrix4(bookMesh.matrixWorld);
          const center = worldBox.getCenter(new THREE.Vector3());
          const sizeX = worldBox.max.x - worldBox.min.x; // screen vertical
          const sizeZ = worldBox.max.z - worldBox.min.z; // screen horizontal
          const halfTan = Math.tan(
            THREE.MathUtils.degToRad(camera.fov) / 2
          );
          const fillV = 0.78; // page fills ~78% of the view height
          const fillH = mobile ? 0.95 : 0.9;
          // horizontal content: page + part of the opened cover beside it
          const contentH = sizeZ * (mobile ? 1.12 : 1.42);
          const distV = sizeX / (fillV * 2 * halfTan);
          const distH = contentH / (fillH * 2 * halfTan * camera.aspect);
          const dist = Math.max(distV, distH);
          aboutCameraPos = {
            x: center.x,
            y: center.y + dist,
            z: center.z,
          };
          // top-down, rolled so the page's text reads upright
          aboutCameraRot = {
            x: -Math.PI / 2,
            y: 0,
            z: Math.PI / 2,
          };
        }
      }

      if (mobile) {
        projectsCameraPos = { x: 1.1, y: 0.82, z: 0.5 };
        projectsCameraRot = { x: 0, y: 0, z: 1.55 };
        controls.maxDistance = 1.5;
        controls.maxAzimuthAngle = Math.PI * 0.75;
      } else {
        projectsCameraPos = { x: 1, y: 0.45, z: 0.01 };
        projectsCameraRot = { x: 0.05, y: 0.05, z: 0 };
        controls.maxDistance = 1.6;
        controls.maxAzimuthAngle = Math.PI * 0.78;
      }
      projects.forEach((project) => {
        if (project.mesh) {
          project.mesh.position.z = mobile ? -1.13 : -1.15;
        }
      });
    }

    // expose world actions for the UI
    worldRef.current = {
      resetCamera,
      goToAbout,
      goToProjects,
      goToPhone,
      goToKeyboardPeek,
      goToCubeShow,
      toggleLights,
      startIntro,
    };


    // build project planes up-front (hidden until "Projects" is opened)
    createProjectPlanes();

    // LOAD THE ROOM
    gltfLoader.load(
      '/models/room.glb',
      function (room) {
        // load video
        const video = document.createElement('video');
        video.src = '/textures/arcane.mp4';
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        video.loop = true;
        videoEl = video;

        // create video texture
        const videoTexture = new THREE.VideoTexture(video);
        // Linear filtering — the footage reads as smooth real video
        // instead of nearest-neighbor blocks; the sRGB decode is skipped
        // too so it shows at its authored brightness on screen
        videoTexture.minFilter = THREE.LinearFilter;
        videoTexture.magFilter = THREE.LinearFilter;
        videoTexture.generateMipmaps = false;

        room.scene.children.forEach((child) => {
          // disable shadow by wall
          if (child.name !== 'Wall') {
            child.castShadow = true;
          }
          child.receiveShadow = true;

          // whitish-blue honeycomb walls while the lights are on (the
          // site boots in the light theme): a subtle embossed hex grid
          // by day, and at night switchTheme fades in the neon LED
          // honeycomb via the emissive map
          if (child.name === 'Wall') {
            const wall = child as THREE.Mesh;
            wallShell = wall;
            const mat = wall.material as THREE.MeshStandardMaterial;
            if (mat && mat.color) {
              wallMat = mat;
              mat.color.copy(WALL_LIGHT_BLUE);

              hexaWall = createHexaWall(0.26);
              const maxAniso = Math.min(
                8,
                renderer.capabilities.getMaxAnisotropy()
              );
              hexaWall.map.anisotropy = maxAniso;
              hexaWall.emissiveMap.anisotropy = maxAniso;
              hexaWall.normalMap.anisotropy = maxAniso;
              mat.map = hexaWall.map;
              mat.emissiveMap = hexaWall.emissiveMap;
              // true tangent-space bevels from the groove height field —
              // the panels catch light from every direction and the SSAO
              // pass grounds their crevices
              mat.normalMap = hexaWall.normalMap;
              mat.normalScale = new THREE.Vector2(0.85, 0.85);
              // matte painted panels with micro-variance
              mat.roughnessMap = noiseMap;
              mat.roughness = 0.92;
              mat.emissive = new THREE.Color(0xffffff);
              mat.emissiveIntensity = 0;
              // the material shipped with no textures — adding maps
              // recompiles the shader
              mat.needsUpdate = true;

              // regenerate clean world-scale UVs (box projection): the
              // GLB's authored UVs were never used for rendering, and
              // this way the honeycomb tiles at one consistent physical
              // scale on every wall. Floor and ceiling vertices are
              // pinned to the uv origin — the interior of the hex at
              // lattice (0,0), plain base color with no lines — so only
              // the walls wear the pattern
              const geo = wall.geometry;
              const pos = geo.attributes.position as THREE.BufferAttribute;
              const nor = geo.attributes.normal as THREE.BufferAttribute;
              const uvArr = new Float32Array(pos.count * 2);
              for (let i = 0; i < pos.count; i++) {
                const ax = Math.abs(nor.getX(i));
                const ay = Math.abs(nor.getY(i));
                const az = Math.abs(nor.getZ(i));
                if (ay > ax && ay > az) {
                  // floor / ceiling — blank hex-center texel
                  uvArr[i * 2] = 0;
                  uvArr[i * 2 + 1] = 0;
                } else if (ax >= az) {
                  // wall facing ±x — project onto the z/y plane
                  uvArr[i * 2] = pos.getZ(i) / hexaWall.tileW;
                  uvArr[i * 2 + 1] = pos.getY(i) / hexaWall.tileH;
                } else {
                  // wall facing ±z — project onto the x/y plane
                  uvArr[i * 2] = pos.getX(i) / hexaWall.tileW;
                  uvArr[i * 2 + 1] = pos.getY(i) / hexaWall.tileH;
                }
              }
              geo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
            }
          }

          // the coffee mug — remember its resting pose for the sip
          // choreography and the interrupted-sip reset
          if (child.name === 'Coffe') {
            mug = child;
            mugRestPos = child.position.clone();
            mugRestQuat = child.quaternion.clone();
          }

          // the plant cluster (pot + leaves + soil) — wrapped in a LOD
          // below once the whole room is in the graph
          if (child.name === 'Plant_Pot') {
            plantPot = child;
          }

          if (child.children) {
            child.children.forEach((innerChild) => {
              const innerMesh = innerChild as THREE.Mesh;

              // disable shadow by book cover & switch btn
              if (
                innerChild.name !== 'Book001' &&
                innerChild.name !== 'Switch'
              ) {
                innerChild.castShadow = true;
              }

              // add texture to book cover
              if (innerChild.name === 'Book001') {
                const bookCoverTexture = new THREE.TextureLoader(
                  manager
                ).load('/textures/book-cover.png');
                bookCoverTexture.flipY = false;
                // the cover is read at a shallow angle in the about view
                // — anisotropy keeps the emblem crisp instead of mip-blurred
                bookCoverTexture.anisotropy = Math.min(
                  8,
                  renderer.capabilities.getMaxAnisotropy()
                );
                bookCoverMat = new THREE.MeshStandardMaterial({
                  side: THREE.DoubleSide,
                  color: 0xffffff,
                  map: bookCoverTexture,
                  roughness: 0.55,
                });
                innerMesh.material = bookCoverMat;
                // registered BEFORE the room-wide env pass with a LOW
                // boost: at night the studio environment would otherwise
                // keep the white cover glaring while the room goes dark
                registerEnvMaterial(bookCoverMat, 0.5);
              }

              innerChild.receiveShadow = true;
            });
          }

          if (child.name === 'Stand') {
            const stand = child as THREE.Mesh;
            const screen = stand.children[0] as THREE.Mesh;
            screenMesh = screen;
            videoMat = new THREE.MeshBasicMaterial({
              map: videoTexture,
              toneMapped: false,
            });
            screen.material = videoMat;
            video.play().catch(() => {});

            // a powered-off monitor: dark glossy glass that still catches
            // the room in its reflections
            screenOffMat = new THREE.MeshPhysicalMaterial({
              color: 0x05070b,
              roughness: 0.07,
              metalness: 0.35,
              clearcoat: 1,
              clearcoatRoughness: 0.12,
            });
            registerEnvMaterial(screenOffMat, 3.3);

            // the monitor (screen + housing) swallows hovers so the
            // tower behind it never flashes a tooltip through the video
            monitorBlockers.push(stand);
          }

          // the PC tower — its glass panels and every LED live here
          if (child.name === 'CPU') {
            const cpu = child as THREE.Mesh;
            cpuGroup = cpu;

            // tempered-glass panels, the ORIGINAL look: gray
            // transmission glass you can see the spinning fans and
            // their LED rings through. Two gotchas handled here:
            // 1) GLTFLoader sanitizes node names at runtime (spaces
            //    -> underscores, dots stripped), so the glTF nodes
            //    'CPU Glass' / 'CPU Glass.001' load as 'CPU_Glass' /
            //    'CPU_Glass001' — matching the raw name silently
            //    skipped them, and these meshes carry NO glTF material,
            //    so they fell back to the pure-white default material
            //    and the whole tower rendered as a blank white box.
            // 2) envMapIntensity is locked to 0 (registered with boost
            //    0 before the room-wide reflection pass) so the studio
            //    environment can never wash the glass out.
            // Material NAMES are not sanitized, so the LED matching
            // below ('Light' / 'Red Glow') is reliable — those meshes
            // are swapped to a dead-dark material when the PC is
            // powered off and restored when it boots again.
            cpu.traverse((inner) => {
              const m = inner as THREE.Mesh;
              if (inner.name.startsWith('CPU_Glass')) {
                const mat = new THREE.MeshPhysicalMaterial();
                mat.roughness = 0;
                mat.color.set(0x999999);
                mat.ior = 3;
                // the first panel refracts a touch harder, as before
                mat.transmission = inner.name === 'CPU_Glass' ? 2 : 1;
                mat.opacity = 0.8;
                mat.depthWrite = false;
                mat.depthTest = false;
                registerEnvMaterial(mat, 0);
                m.material = mat;
                glassMats.push(mat);
                return;
              }
              if (m.isMesh && m.material) {
                const mats = Array.isArray(m.material)
                  ? m.material
                  : [m.material];
                if (
                  mats.some(
                    (mm) => mm.name === 'Light' || mm.name === 'Red Glow'
                  )
                ) {
                  ledMeshes.push(m);
                  ledOriginalMats.push(m.material);
                }
              }
            });
            ledOffMat = new THREE.MeshStandardMaterial({
              color: 0x0a0c0f,
              roughness: 0.4,
              metalness: 0.1,
            });

            // PBR micro-variance on the tower's metal/painted shells —
            // the shared noise roughness map reads as machining and
            // handling marks (the glass panels, LEDs and the off-state
            // material stay untouched)
            cpu.traverse((inner) => {
              const mm = inner as THREE.Mesh;
              if (!mm.isMesh || !mm.material) return;
              const mats = Array.isArray(mm.material)
                ? mm.material
                : [mm.material];
              mats.forEach((raw) => {
                const std = raw as THREE.MeshStandardMaterial;
                if (
                  std.isMeshStandardMaterial &&
                  !std.isMeshPhysicalMaterial &&
                  raw.name !== 'Light' &&
                  raw.name !== 'Red Glow'
                ) {
                  std.roughnessMap = noiseMap;
                  std.needsUpdate = true;
                }
              });
            });
          }

          if (child.name === 'Book') {
            const book = child as THREE.Mesh;
            bookMesh = book;
            bookCover = book.children[0] as THREE.Mesh;

            // about-me page: canvas texture with measured typesetting
            // (single left margin, wrapped lines, constant leading) —
            // replaces the old hand-baked jpg whose lines drifted
            bookPage = createBookPage();
            bookMat = new THREE.MeshStandardMaterial({
              color: 0xffffff,
              map: bookPage.texture,
            });
            book.material = bookMat;
            // LOW env boost (registered before the room-wide pass): the
            // white paper is a mirror for the studio environment at
            // default intensity, and at night that glare drowned the ink
            // — at 0.3 the page keeps a paper-soft sheen by day and goes
            // quiet with the room at night (the warm reading light above
            // the desk takes over)
            registerEnvMaterial(bookMat, 0.3);
          }

          if (child.name === 'SwitchBoard') {
            lightSwitch = child.children[0];
          }

          if (child.name === 'Mobile') {
            mobile = child as THREE.Mesh;
            mobile.children.forEach((inner) => {
              if (inner.name === 'Mobile_Screen') {
                mobileScreen = inner as THREE.Mesh;
              }
            });
          }

          if (child.name === 'Rubik Cube' || child.name === 'Rubik_Cube') {
            rubikOriginal = child as THREE.Mesh;
          }

          if (child.name === 'Keyboard') {
            keyboardDeck = child as THREE.Mesh;
          }

          // the desk — restyled as a dark gaming surface in the light
          // theme (see switchTheme); the original pale material is kept
          // so the dark theme can restore it
          if (child.name === 'Table') {
            tableMesh = child as THREE.Mesh;
            tableOriginalMat = tableMesh.material;
          }
        });

        scene.add(room.scene);

        // floor rug — a woven rounded carpet under and in front of the
        // desk, added to the room group so it inherits the responsive
        // scaling; it sits a hair above the shell's floor to avoid
        // z-fighting and never intercepts raycasts
        carpet = createCarpet(0.95, 0.95);
        carpet.mesh.position.set(0.22, -0.4685, 0.12);
        room.scene.add(carpet.mesh);

        // the floor's own skin — sized from the shell's real bounding
        // box (the Wall node IS the room: an inverted box whose bottom
        // face is the floor), laid 0.5mm above the shell floor and 1mm
        // below the rug. Red in daylight, near-black slate at night,
        // with a vignette + grain so it never reads as flat plastic
        if (wallShell) {
          wallShell.updateMatrix();
          if (!wallShell.geometry.boundingBox) {
            wallShell.geometry.computeBoundingBox();
          }
          const shellBox = wallShell.geometry.boundingBox!.clone();
          shellBox.applyMatrix4(wallShell.matrix);
          floorSkin = createFloorSkin(
            shellBox.max.x - shellBox.min.x,
            shellBox.max.z - shellBox.min.z
          );
          // never float above the rug, whatever the shell's exact height
          const skinY = Math.min(-0.4693, shellBox.min.y + 0.0007);
          floorSkin.mesh.position.set(
            (shellBox.min.x + shellBox.max.x) / 2,
            skinY,
            (shellBox.min.z + shellBox.max.z) / 2
          );
          room.scene.add(floorSkin.mesh);
          registerEnvMaterial(floorSkin.material, 0.5);
          // PBR micro-variance — the red day floor reads as a matte
          // finished surface with grain, not flat plastic
          floorSkin.material.roughnessMap = noiseMap;
          floorSkin.material.needsUpdate = true;
        }

        // LED strips on the floor — an overlay with the rug's exact
        // footprint (shared geometry), tracing the rug's own design
        // (border band, hairline, corner diamonds, twin hexes) as neon
        // strips: white-hot dashed LED beads with magenta halos, cyan
        // bead runs and hex tubes with junction dots. Invisible in
        // daylight; switchTheme + the render loop breathe it in at night
        floorLed = createFloorLed(0.95, 0.95);
        floorLed.mesh.position.set(0.22, -0.4675, 0.12);
        room.scene.add(floorLed.mesh);

        // gaming keyboard: procedural RGB keycaps on top of the deck
        // (must happen before the responsive scaling below)
        if (keyboardDeck) {
          keyboard = createGamingKeyboard(keyboardDeck);
        }

        // phone screen: canvas texture (idle wallpaper -> contact app).
        // The canvas is sized to the real screen quad so the portrait UI
        // never stretches, and the rest pose is remembered so the phone
        // can be put back down exactly where it was.
        if (mobileScreen && mobile) {
          phoneRestQuat = mobile.quaternion.clone();
          phoneRestPos = mobile.position.clone();
          const ax = screenAxes();
          const aspect = ax ? ax.uLen / ax.vLen : 0.475;
          phone = createPhoneScreen(aspect);
          mobileScreen.material = new THREE.MeshBasicMaterial({
            map: phone.texture,
          });
        }

        // Rubik's cube: hide the static prop and rebuild it as a real,
        // animated 3x3 cube at the same spot (measured before any
        // responsive scaling is applied, so the proportions stay exact)
        if (rubikOriginal && rubikOriginal.parent) {
          const cubeParent = rubikOriginal.parent;
          const cubeBox = new THREE.Box3().setFromObject(rubikOriginal);
          const cubeSize = cubeBox.getSize(new THREE.Vector3());
          const edge = Math.max(cubeSize.x, cubeSize.y, cubeSize.z);
          const cubeCenter = cubeBox.getCenter(new THREE.Vector3());
          const localCenter = cubeParent.worldToLocal(cubeCenter.clone());
          cube = createRubiksCube(
            cubeParent,
            localCenter,
            rubikOriginal.getWorldQuaternion(new THREE.Quaternion()),
            edge
          );
          rubikOriginal.visible = false;
          // the hidden static prop must also stay out of raycasts — three
          // doesn't skip invisible objects, and an unlabeled hit on it would
          // shadow the animated cube's hover tooltip (kept in the graph so
          // the cleanup traverse still disposes its geometry)
          rubikOriginal.raycast = () => {};

          // LIFT the cube so it RESTS on the desk: the static prop was
          // modeled sunk into the tabletop (its lower half vanished into
          // the table), and a cube rebuilt at the same center inherits
          // that sink. Raycast straight down from above the cube — the
          // first non-cube hit is the desk surface.
          cube.group.updateWorldMatrix(true, true);
          const cubeWorldBox = new THREE.Box3().setFromObject(cube.group);
          const cx = (cubeWorldBox.min.x + cubeWorldBox.max.x) / 2;
          const cz = (cubeWorldBox.min.z + cubeWorldBox.max.z) / 2;
          const deskRay = new THREE.Raycaster(
            new THREE.Vector3(cx, cubeWorldBox.max.y + 0.05, cz),
            new THREE.Vector3(0, -1, 0),
            0.01,
            2
          );
          const isCubePart = (o: THREE.Object3D | null): boolean => {
            let cur: THREE.Object3D | null = o;
            while (cur) {
              if (cur === cube.group) return true;
              cur = cur.parent;
            }
            return false;
          };
          const deskHits = deskRay
            .intersectObjects(scene.children, true)
            .filter((h) => !isCubePart(h.object));
          if (deskHits.length > 0) {
            const sink = cubeWorldBox.min.y - deskHits[0].point.y;
            if (sink > 0.0005) {
              const wp = cube.group.getWorldPosition(new THREE.Vector3());
              wp.y -= sink;
              cube.group.position.copy(cubeParent.worldToLocal(wp));
            }
          }
        }

        // gaming desk surface: matte charcoal with a soft sheen that
        // catches the keyboard's RGB spill — applied in the light theme
        // (the site boots in light), original material restored in dark.
        // The noise maps give it a brushed matte finish with sparse
        // metallic flecks, like a real hard gaming mat
        if (tableMesh) {
          tableGamingMat = new THREE.MeshStandardMaterial({
            color: 0x181b21,
            roughness: 0.55,
            metalness: 0.28,
            roughnessMap: noiseMap,
            metalnessMap: noiseMap,
          });
          tableMesh.material = tableGamingMat;
        }

        // one consistent reflection pass over every PBR material in the
        // room — GLTF materials share instances so each registers once;
        // the wall stays matte, the desk gets an extra-wet sheen (the
        // desk material is registered BEFORE the traverse so its boost
        // isn't shadowed by the duplicate check)
        registerEnvMaterial(tableGamingMat, 1.35);
        room.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          registerEnvMaterial(m.material, o.name === 'Wall' ? 0.27 : 1);
        });
        if (cube) {
          cube.group.traverse((o) =>
            registerEnvMaterial((o as THREE.Mesh).material, 1)
          );
        }
        if (keyboardDeck) {
          keyboardDeck.traverse((o) =>
            registerEnvMaterial((o as THREE.Mesh).material, 1)
          );
        }
        applyEnvIntensity();

        // ── LEVEL OF DETAIL ────────────────────────────────────────────
        // The room is deliberately light-poly (~5k tris), so LOD here is
        // about structure for the web: full-detail clusters render near,
        // cheap stand-ins take over past tuned distances, and the intro
        // sweep's wide shots actually exercise the swaps. Thresholds are
        // chosen from the real camera envelope (orbit ≈ 0.9–1.7m from
        // target) so the hero views always show the detailed models.
        const wrapInLod = (
          target: THREE.Object3D,
          levels: { object: THREE.Object3D; distance: number }[]
        ): THREE.LOD => {
          const parent = target.parent!;
          const lod = new THREE.LOD();
          // the LOD carries the interactive name so raycast name-chains
          // keep resolving through the swapped levels
          lod.name = target.name;
          lod.position.copy(target.position);
          lod.quaternion.copy(target.quaternion);
          lod.scale.copy(target.scale);
          parent.add(lod);
          parent.remove(target);
          target.position.set(0, 0, 0);
          target.quaternion.set(0, 0, 0, 1);
          target.scale.set(1, 1, 1);
          lod.addLevel(target, 0);
          levels.forEach((l) => lod.addLevel(l.object, l.distance));
          return lod;
        };

        // the stand-ins are built in the target's LOCAL frame (the LOD
        // adopts its transform, so a local-space box fits exactly)
        const localBoxOf = (target: THREE.Object3D): THREE.Box3 => {
          target.updateWorldMatrix(true, true);
          const inv = target.matrixWorld.clone().invert();
          return new THREE.Box3()
            .setFromObject(target)
            .applyMatrix4(inv);
        };

        // crossed alpha-tested foliage quads + a simple pot — reads as a
        // bushy plant from across the room for a handful of triangles
        const createPlantImpostor = (
          box: THREE.Box3,
          planes: number
        ): THREE.Group => {
          const group = new THREE.Group();
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const potH = size.y * 0.24;
          const width = Math.max(size.x, size.z) * 1.18;
          const foliageH = Math.max(0.01, size.y - potH * 0.55);

          const c = document.createElement('canvas');
          c.width = 256;
          c.height = 256;
          const ctx = c.getContext('2d')!;
          for (let i = 0; i < 110; i++) {
            const x = 26 + Math.random() * 204;
            const y = 14 + Math.random() * 228;
            const rx = 9 + Math.random() * 26;
            const ry = rx * (0.32 + Math.random() * 0.3);
            const shade = 0.8 + Math.random() * 0.5;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(Math.random() * Math.PI);
            ctx.fillStyle = `rgba(${Math.round(46 * shade)},${Math.round(
              74 * shade
            )},${Math.round(46 * shade)},${(
              0.82 +
              Math.random() * 0.18
            ).toFixed(2)})`;
            ctx.beginPath();
            ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
          const tex = new THREE.CanvasTexture(c);
          extraTextures.push(tex);
          const leafMat = new THREE.MeshStandardMaterial({
            map: tex,
            alphaTest: 0.3,
            side: THREE.DoubleSide,
            roughness: 0.9,
            metalness: 0,
          });
          registerEnvMaterial(leafMat, 0.5);
          const geo = new THREE.PlaneGeometry(width, foliageH);
          for (let i = 0; i < planes; i++) {
            const p = new THREE.Mesh(geo, leafMat);
            p.position.set(
              center.x,
              box.min.y + potH * 0.55 + foliageH / 2,
              center.z
            );
            p.rotation.y = (Math.PI / planes) * i;
            group.add(p);
          }
          const pot = new THREE.Mesh(
            new THREE.CylinderGeometry(
              width * 0.17,
              width * 0.125,
              potH,
              10
            ),
            new THREE.MeshStandardMaterial({
              color: 0x6e4a38,
              roughness: 0.85,
              metalness: 0.02,
              roughnessMap: noiseMap,
            })
          );
          pot.position.set(center.x, box.min.y + potH / 2, center.z);
          group.add(pot);
          return group;
        };

        // the tower's stand-in: a dark slab on the local box with a slim
        // emissive LED strip on the camera-facing face (dead when the PC
        // powers down — pcPowerOff tweens towerLedStripMat)
        const createTowerImpostor = (
          box: THREE.Box3,
          faceDir: THREE.Vector3
        ): THREE.Group => {
          const group = new THREE.Group();
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const half = size.clone().multiplyScalar(0.5);
          const body = new THREE.Mesh(
            new THREE.BoxGeometry(size.x, size.y, size.z),
            new THREE.MeshStandardMaterial({
              color: 0x0c0e12,
              roughness: 0.45,
              metalness: 0.55,
              roughnessMap: noiseMap,
            })
          );
          body.position.copy(center);
          group.add(body);
          if (!towerLedStripMat) {
            towerLedStripMat = new THREE.MeshStandardMaterial({
              color: 0x101014,
              emissive: new THREE.Color(0x59f2c4),
              emissiveIntensity: pcOn ? 1.6 : 0.04,
              roughness: 0.4,
            });
          }
          const eps = 0.0014;
          const strip = new THREE.Mesh(
            new THREE.PlaneGeometry(0.005, size.y * 0.6),
            towerLedStripMat
          );
          strip.position.set(
            center.x + faceDir.x * (half.x + eps),
            center.y + faceDir.y * (half.y + eps),
            center.z + faceDir.z * (half.z + eps)
          );
          strip.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 0, 1),
            faceDir
          );
          group.add(strip);
          return group;
        };

        // the tower: full detail up close, the slab + LED stand-in when
        // the camera pulls back (intro sweep / deep orbit)
        if (cpuGroup) {
          const cpuWorldCenter = new THREE.Box3()
            .setFromObject(cpuGroup)
            .getCenter(new THREE.Vector3());
          const toCam = new THREE.Vector3(
            defaultCameraPos.x - cpuWorldCenter.x,
            (defaultCameraPos.y - cpuWorldCenter.y) * 0.3,
            defaultCameraPos.z - cpuWorldCenter.z
          ).normalize();
          const cpuWorldQuat = cpuGroup.getWorldQuaternion(
            new THREE.Quaternion()
          );
          const localDir = toCam
            .clone()
            .applyQuaternion(cpuWorldQuat.clone().invert());
          const faceDir = new THREE.Vector3();
          if (
            Math.abs(localDir.x) >= Math.abs(localDir.y) &&
            Math.abs(localDir.x) >= Math.abs(localDir.z)
          ) {
            faceDir.set(Math.sign(localDir.x), 0, 0);
          } else if (Math.abs(localDir.y) >= Math.abs(localDir.z)) {
            faceDir.set(0, Math.sign(localDir.y), 0);
          } else {
            faceDir.set(0, 0, Math.sign(localDir.z));
          }
          const cpuLocalBox = localBoxOf(cpuGroup);
          wrapInLod(cpuGroup, [
            { object: createTowerImpostor(cpuLocalBox, faceDir), distance: 2.3 },
          ]);
        }

        // the plant: two crossed impostor quads from the far-mid mark,
        // a single plane from the very back
        if (plantPot) {
          const pBox = localBoxOf(plantPot);
          wrapInLod(plantPot, [
            { object: createPlantImpostor(pBox, 2), distance: 2.55 },
            { object: createPlantImpostor(pBox, 1), distance: 3.9 },
          ]);
        }

        // add animation
        mixer = new THREE.AnimationMixer(room.scene);
        const clips = room.animations;
        CLIP_NAMES.forEach((clipName) => {
          const clip = THREE.AnimationClip.findByName(clips, clipName);
          if (clip) {
            const action = mixer!.clipAction(clip);
            action.play();
          }
        });

        loadIntroText();
        initResponsive(room.scene);
        roomRoot = room.scene;

        // soft light above the phone (position respects responsive scaling)
        if (mobile) {
          const mp = new THREE.Vector3();
          mobile.getWorldPosition(mp);
          phoneLight.position.set(mp.x + 0.05, mp.y + 0.11, mp.z + 0.05);
        }

        // the notebook's warm reading light — placed from the book's real
        // world position once the responsive scaling has settled, so it
        // hangs just above the page whatever the room scale
        if (bookMesh) {
          const bp = new THREE.Vector3();
          bookMesh.getWorldPosition(bp);
          bookLight.position.set(bp.x, bp.y + 0.17, bp.z + 0.02);
        }

        // mount the monitor glow panel just off the screen surface, aimed
        // down at the keyboard (world poses are final after the responsive
        // scaling). RectAreaLight emits along its local -Z, so lookAt aims
        // the panel's light at the keyboard exactly
        if (screenMesh && keyboardDeck) {
          screenMesh.updateWorldMatrix(true, false);
          const screenCenter = new THREE.Box3()
            .setFromObject(screenMesh)
            .getCenter(new THREE.Vector3());
          const screenNormal = new THREE.Vector3(
            0,
            0,
            1
          ).transformDirection(screenMesh.matrixWorld);
          const toCam = new THREE.Vector3(
            defaultCameraPos.x - screenCenter.x,
            defaultCameraPos.y - screenCenter.y,
            defaultCameraPos.z - screenCenter.z
          );
          if (screenNormal.dot(toCam) < 0) screenNormal.negate();
          monitorGlow.position
            .copy(screenCenter)
            .addScaledVector(screenNormal, 0.008);
          const kbPos = new THREE.Vector3();
          keyboardDeck.getWorldPosition(kbPos);
          kbPos.y += 0.012;
          monitorGlow.lookAt(kbPos);
          // daylight boot value — the dark theme raises it in switchTheme
          monitorGlowState.base = pcOn ? 1.1 : 0;
        }

        // KTX2 BADGE — a small backlit sticker on the tower's camera-facing
        // face, loaded through the KTX2Loader pipeline (UASTC + Zstd →
        // GPU-native compressed texture, transcoded in a worker): the badge
        // literally IS the proof the KTX2 path is live, visible in both
        // themes and through PC power cycles
        ktx2Loader.load(
          '/textures/sample_uastc_zstd.ktx2',
          (ktxTex) => {
            // the file ships a single mip level — no mipmapping; and keep
            // the passthrough encoding so the badge matches the scene's
            // tuned linear pipeline exactly
            ktxTex.minFilter = THREE.LinearFilter;
            ktxTex.generateMipmaps = false;
            ktxTex.anisotropy = Math.min(
              8,
              renderer.capabilities.getMaxAnisotropy()
            );
            ktxTex.encoding = THREE.LinearEncoding;
            extraTextures.push(ktxTex);

            if (!cpuGroup || !roomRoot) return;
            // placement on the camera-facing face of the tower's world box
            const worldBox = new THREE.Box3().setFromObject(cpuGroup);
            const center = worldBox.getCenter(new THREE.Vector3());
            const half = worldBox
              .getSize(new THREE.Vector3())
              .multiplyScalar(0.5);
            const dir = new THREE.Vector3(
              defaultCameraPos.x - center.x,
              (defaultCameraPos.y - center.y) * 0.3,
              defaultCameraPos.z - center.z
            ).normalize();
            const n = new THREE.Vector3();
            if (
              Math.abs(dir.x) >= Math.abs(dir.y) &&
              Math.abs(dir.x) >= Math.abs(dir.z)
            ) {
              n.set(Math.sign(dir.x), 0, 0);
            } else if (Math.abs(dir.y) >= Math.abs(dir.z)) {
              n.set(0, Math.sign(dir.y), 0);
            } else {
              n.set(0, 0, Math.sign(dir.z));
            }
            const eps = 0.0016;
            const worldPos = new THREE.Vector3(
              center.x + n.x * (half.x + eps),
              center.y + n.y * (half.y + eps),
              center.z + n.z * (half.z + eps)
            );

            const badgeGeo = new THREE.PlaneGeometry(0.022, 0.0305);
            // compressed textures upload without flipY — mirror the V
            // channel so the artwork reads upright on the standard plane
            const uvAttr = badgeGeo.attributes.uv as THREE.BufferAttribute;
            for (let i = 0; i < uvAttr.count; i++) {
              uvAttr.setY(i, 1 - uvAttr.getY(i));
            }
            const badgeMat = new THREE.MeshStandardMaterial({
              map: ktxTex,
              emissiveMap: ktxTex,
              emissive: new THREE.Color(0xffffff),
              emissiveIntensity: theme === 'dark' ? 1.1 : 0.25,
              roughness: 0.35,
              metalness: 0.1,
              transparent: true,
            });
            ktxBadgeMat = badgeMat;
            const badge = new THREE.Mesh(badgeGeo, badgeMat);
            // sit above the tempered glass (which renders depth-test-free
            // from the transparent queue)
            badge.renderOrder = 20;
            badge.position.copy(roomRoot.worldToLocal(worldPos.clone()));
            badge.lookAt(worldPos.clone().add(n));
            roomRoot.add(badge);
          },
          undefined,
          (err) => {
            // the pipeline is best-effort decoration — never block the
            // experience on one sticker
            console.warn('KTX2 badge unavailable:', err);
          }
        );

        // hover raycast targets
        hoverTargets = [
          mobile,
          keyboardDeck,
          cube?.group ?? null,
          cpuGroup,
          ...monitorBlockers,
          ...projects.map((p) => p.mesh),
          ...room.scene.children.filter(
            (c) =>
              c.name === 'Book' ||
              c.name === 'SwitchBoard' ||
              c.name === 'Coffe'
          ),
        ].filter((o): o is THREE.Object3D => Boolean(o));

        animate();
        setReady(true);
      },
      undefined,
      function (error) {
        console.error(error);
        // don't trap the user behind the loader if assets fail
        setReady(true);
      }
    );

    // GLOBAL LISTENERS
    window.addEventListener('click', onWindowClick);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    // any interaction pauses the idle auto-orbit
    const markActive = () => {
      lastInteraction = performance.now();
      controls.autoRotate = false;
    };
    window.addEventListener('pointerdown', markActive, { passive: true });
    window.addEventListener('wheel', markActive, { passive: true });
    window.addEventListener('touchstart', markActive, { passive: true });
    window.addEventListener('keydown', markActive);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && hasEntered) {
        resetCamera();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer?.setSize(window.innerWidth, window.innerHeight);
      // re-apply responsive framing (handles device rotation)
      if (roomRoot) initResponsive(roomRoot);
    };
    window.addEventListener('resize', onResize);

    // CLEANUP
    return () => {
      worldDisposed = true;
      cancelAnimationFrame(rafId);
      videoEl?.pause();
      window.removeEventListener('click', onWindowClick);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', markActive);
      window.removeEventListener('wheel', markActive);
      window.removeEventListener('touchstart', markActive);
      window.removeEventListener('keydown', markActive);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      gsap.globalTimeline.clear();
      controls.dispose();
      dracoLoader.dispose();
      ktx2Loader.dispose();
      renderer.dispose();
      canvas.remove();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[];
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else if (mat) mat.dispose();
      });
      keyboard?.dispose();
      phone?.dispose();
      bookPage?.dispose();
      cube?.dispose();
      dustGeo.dispose();
      dustMat.dispose();
      composer?.dispose();
      ssaoPass?.dispose();
      bokehPass?.dispose();
      filmPass?.dispose();
      envRT?.dispose();
      videoMat?.dispose();
      screenOffMat?.dispose();
      glassMats.forEach((m) => m.dispose());
      ledOffMat?.dispose();
      // textures owned by this file (the scene traverse only handles
      // geometries + materials): the shared noise, impostor canvases and
      // the KTX2 badge texture
      extraTextures.forEach((t) => t.dispose());
      extraTextures.length = 0;
      // any steam puffs still rising when the component unmounts
      steamPuffs.forEach((puff) => {
        scene.remove(puff);
        (puff.material as THREE.SpriteMaterial).dispose();
      });
      steamPuffs.length = 0;
      steamTexture?.dispose();
      hexaWall?.dispose();
      carpet?.dispose();
      floorSkin?.dispose();
      floorLed?.dispose();
      worldRef.current = null;
    };
  }, []);

  const handleEnter = () => {
    if (!entered) {
      setEntered(true);
      worldRef.current?.startIntro();
      window.setTimeout(() => setLoaderGone(true), 850);
    }
  };

  const handleSoundToggle = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    if (next) playUiTick();
  };

  return (
    <>
      <div className="experience" ref={containerRef} />
      <div className="vignette" aria-hidden="true" />

      <div
        id="hover-tooltip"
        ref={tooltipRef}
        role="status"
        aria-hidden="true"
      />

      {!loaderGone && (
        <div
          id="loader-wrapper"
          className={entered ? 'loader-wrapper--leaving' : ''}
        >
          <div className="loader-inner">
            <div className="loader-logo">
              NAV<span>AIR</span>GAP
            </div>

            {!ready ? (
              <>
                <div className="loader" />
                <div className="loader-progress">
                  <span>{progress}</span>%
                </div>
                <div className="loader-label">loading the room</div>
              </>
            ) : (
              <>
                <div className="loader-ready-label">room ready</div>
                <button id="enter-btn" onClick={handleEnter} autoFocus>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 96 960 960"
                    height="22"
                    width="22"
                    aria-hidden="true"
                  >
                    <path d="M384 672l384-192-384-192v384z" />
                  </svg>
                  ENTER
                </button>
                <div className="loader-tip">
                  tip — enable key sounds with the speaker icon after entering
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <header>
        <a
          href="#"
          id="logo"
          aria-label="NAV — home"
          onClick={(e) => {
            e.preventDefault();
            worldRef.current?.resetCamera();
          }}
        >
          <img src="/images/logo.png" width={70} height={70} alt="NAV logo" />
        </a>

        <nav className="main-nav" aria-label="Social links">
          <ul>
            <li>
              <button
                id="sound-toggle"
                aria-pressed={soundOn}
                aria-label="Toggle keyboard sounds"
                title={soundOn ? 'Key sounds on' : 'Key sounds off'}
                onClick={handleSoundToggle}
              >
                {soundOn ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    width="24"
                    height="24"
                    aria-hidden="true"
                  >
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    width="24"
                    height="24"
                    aria-hidden="true"
                  >
                    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                  </svg>
                )}
                <span>{soundOn ? 'Sound on' : 'Sound off'}</span>
              </button>
            </li>
            <li>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                  aria-hidden="true"
                >
                  <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                </svg>
                <span>GitHub</span>
              </a>
            </li>
          </ul>
        </nav>

        <nav className="side-nav" aria-label="Portfolio menu">
          <ul>
            <li>
              <a
                href="#"
                id="about-menu"
                onClick={(e) => {
                  e.preventDefault();
                  worldRef.current?.goToAbout();
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 96 960 960"
                  height="24"
                  width="24"
                  aria-hidden="true"
                >
                  <path d="M222 801q63-44 125-67.5T480 710q71 0 133.5 23.5T739 801q44-54 62.5-109T820 576q0-145-97.5-242.5T480 236q-145 0-242.5 97.5T140 576q0 61 19 116t63 109Zm257.814-195Q422 606 382.5 566.314q-39.5-39.686-39.5-97.5t39.686-97.314q39.686-39.5 97.5-39.5t97.314 39.686q39.5 39.686 39.5 97.5T577.314 566.5q-39.686 39.5-97.5 39.5Zm.654 370Q398 976 325 944.5q-73-31.5-127.5-86t-86-127.266Q80 658.468 80 575.734T111.5 420.5q31.5-72.5 86-127t127.266-86q72.766-31.5 155.5-31.5T635.5 207.5q72.5 31.5 127 86t86 127.032q31.5 72.532 31.5 155T848.5 731q-31.5 73-86 127.5t-127.032 86q-72.532 31.5-155 31.5ZM480 916q55 0 107.5-16T691 844q-51-36-104-55t-107-19q-54 0-107 19t-104 55q51 40 103.5 56T480 916Zm0-370q34 0 55.5-21.5T557 469q0-34-21.5-55.5T480 392q-34 0-55.5 21.5T403 469q0 34 21.5 55.5T480 546Zm0-77Zm0 374Z" />
                </svg>
                <span>About Me</span>
              </a>
            </li>
            <li>
              <a
                href="#"
                id="projects-menu"
                onClick={(e) => {
                  e.preventDefault();
                  worldRef.current?.goToProjects();
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 96 960 960"
                  height="24"
                  width="24"
                  aria-hidden="true"
                >
                  <path d="M480 926 120 646l50-37 310 241 310-241 50 37-360 280Zm0-152L120 494l360-280 360 280-360 280Zm0-301Zm0 225 262-204-262-204-262 204 262 204Z" />
                </svg>
                <span>Projects</span>
              </a>
            </li>
            <li className="contact-menu" ref={contactMenuRef}>
              <a
                href="#"
                id="contact-btn"
                aria-haspopup="true"
                aria-expanded={dropdownOpen}
                onClick={(e) => {
                  e.preventDefault();
                  setDropdownOpen((v) => !v);
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 96 960 960"
                  height="24"
                  width="24"
                  aria-hidden="true"
                >
                  <path d="M475 916q5 0 11.5-2.5T497 907l337-338q13-13 19.5-29.667Q860 522.667 860 506q0-17-6.5-34T834 442L654 262q-13-13-30-19.5t-34-6.5q-16.667 0-33.333 6.5Q540 249 527 262l-18 18 81 82q13 14 23 32.5t10 40.5q0 38-29.5 67T526 531q-25 0-41.5-7.5t-30.185-21.341L381 429 200 610q-5 5-7 10.526-2 5.527-2 11.842 0 12.632 8.5 21.132 8.5 8.5 21.167 8.5 6.333 0 11.833-3t9.5-7l138-138 42 42-137 137q-5 5-7 11t-2 12q0 12 9 21t21 9q6 0 11.5-2.5t9.5-6.5l138-138 42 42-137 137q-4 4-6.5 10.333Q361 794.667 361 801q0 12 9 21t21 9q6 0 11-2t10-7l138-138 42 42-138 138q-5 5-7 11t-2 11q0 14 8 22t22 8Zm.064 60Q442 976 416 951.5t-31-60.619Q351 886 328 863t-28-57q-34-5-56.5-28.5T216 721q-37-5-61-30t-24-60q0-17 6.724-34.049T157 567l224-224 110 110q8 8 17.333 12.5Q517.667 470 527 470q13 0 24.5-11.5t11.5-24.654q0-5.846-3.5-13.346T548 405L405 262q-13-13-30-19.5t-34-6.5q-16.667 0-33.333 6.5Q291 249 278.059 261.857L126 414q-14 14-19.5 29.5t-6.5 35q-1 19.5 7.5 38T128 550l-43 43q-20-22-32.5-53T40 477q0-30 11.5-57.5T84 371l151-151q22-22 49.793-32.5 27.794-10.5 57-10.5Q371 177 398.5 187.5T448 220l18 18 18-18q22-22 49.793-32.5 27.794-10.5 57-10.5Q620 177 647.5 187.5T697 220l179 179q22 22 33 50.033t11 57Q920 535 909 562.5T876 612L539 949q-13 13-29.532 20t-34.404 7ZM377 430Z" />
                </svg>
                <span>Get In Touch</span>
              </a>

              {dropdownOpen && (
                <div className="contact-menu__dropdown contact-menu__dropdown--open">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 96 960 960"
                    width="40"
                    height="40"
                    aria-hidden="true"
                  >
                    <path d="m480 136 371 222q17 9 23 24.5t6 30.5v463q0 24-18 42t-42 18H140q-24 0-42-18t-18-42V413q0-15 6.5-30.5T109 358l371-222Zm0 466 336-197-336-202-336 202 336 197Zm0 67L140 469v407h680V469L480 669Zm0 207h340-680 340Z" />
                  </svg>
                  <h4>Find me on GitHub at</h4>
                  <a
                    href={GITHUB_URL}
                    target="_blank"
                    rel="noreferrer"
                    id="contact-email"
                  >
                    <span>github.com/navairgap</span>
                  </a>
                  <div className="seperator">
                    <div className="line" />
                    <div className="text">or visit</div>
                    <div className="line" />
                  </div>
                  <ul className="social-icons">
                    <li>
                      <a
                        href={GITHUB_URL}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="GitHub profile"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          width="20"
                          height="20"
                          aria-hidden="true"
                        >
                          <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                        </svg>
                      </a>
                    </li>
                    <li>
                      <a
                        href={SITE_URL}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Portfolio website"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          width="20"
                          height="20"
                          aria-hidden="true"
                        >
                          <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95c-.32-1.25-.78-2.45-1.38-3.56 1.84.63 3.37 1.91 4.33 3.56zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2 0 .68.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56-1.84-.63-3.37-1.9-4.33-3.56zm2.95-8H5.08c.96-1.66 2.49-2.93 4.33-3.56C8.81 5.55 8.35 6.75 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2 0-.68.07-1.35.16-2h4.68c.09.65.16 1.32.16 2 0 .68-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95c-.96 1.65-2.49 2.93-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2 0-.68-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z" />
                        </svg>
                      </a>
                    </li>
                    <li>
                      <a
                        href="https://github.com/navairgap?tab=stars"
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Starred repositories"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          width="20"
                          height="20"
                          aria-hidden="true"
                        >
                          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                        </svg>
                      </a>
                    </li>
                  </ul>
                </div>
              )}
            </li>
          </ul>
        </nav>
      </header>

      <main>
        {closeVisible && (
          <a
            href="#"
            id="close-btn"
            aria-label="Close and go back"
            onClick={(e) => {
              e.preventDefault();
              worldRef.current?.resetCamera();
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 96 960 960"
              width="48"
              height="48"
              aria-hidden="true"
            >
              <path d="m330 768 150-150 150 150 42-42-150-150 150-150-42-42-150 150-150-150-42 42 150 150-150 150 42 42Zm150 208q-82 0-155-31.5t-127.5-86Q143 804 111.5 731T80 576q0-83 31.5-156t86-127Q252 239 325 207.5T480 176q83 0 156 31.5T763 293q54 54 85.5 127T880 576q0 82-31.5 155T763 858.5q-54 54.5-127 86T480 976Zm0-60q142 0 241-99.5T820 576q0-142-99-241t-241-99q-141 0-240.5 99T140 576q0 141 99.5 240.5T480 916Zm0-340Z" />
            </svg>
          </a>
        )}

        {phoneOpen && (
          <div className="hint-chip" role="status">
            tap a row to open its link · tap anywhere or press ESC to put the
            phone down
          </div>
        )}

        {cubePhase && (
          <div className="hint-chip" role="status">
            {cubePhase}
          </div>
        )}

        {coffeeMsg && (
          <div className="hint-chip hint-chip--coffee" role="status">
            {coffeeMsg}
          </div>
        )}

        <section className="section section--about">
          <h1>NAV</h1>
          <p>
            Hello, I&apos;m NAV (navairgap), a defense-first developer from
            Pune, India. I build passive, local-first security tools like
            SentinelWiFi — which audits WiFi environments and LANs you own
            without ever attacking them — and real-time backend systems with
            Python, Socket.IO, C and Linux. I learn in public: networking,
            Python, security, C, operating systems, documented as I go.
          </p>
          <p>
            The air gap between attacker and target is my favorite place to
            stand. Reach out on GitHub if you have any questions or
            collaboration ideas!
          </p>
        </section>
      </main>

      {loaderGone && (
        <nav className="room-controls" aria-label="Room quick actions">
          <button
            type="button"
            onClick={() => worldRef.current?.goToPhone()}
            title="Pick up the phone — my contacts"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              aria-hidden="true"
            >
              <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
            </svg>
            <span>Contacts</span>
          </button>
          <button
            type="button"
            onClick={() => worldRef.current?.goToKeyboardPeek()}
            title="Watch the keyboard type"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              aria-hidden="true"
            >
              <path d="M20 5H4c-1.1 0-1.99.9-1.99 2L2 19c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z" />
            </svg>
            <span>Keyboard</span>
          </button>
          <button
            type="button"
            onClick={() => worldRef.current?.toggleLights()}
            title="Toggle the room lights"
            aria-pressed={!lightsOn}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              aria-hidden="true"
            >
              <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6C7.67 12.17 7 10.64 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.64-.67 3.17-2.15 4.1z" />
            </svg>
            <span>{lightsOn ? 'Lights off' : 'Lights on'}</span>
          </button>
          <button
            type="button"
            onClick={() => worldRef.current?.resetCamera()}
            title="Reset the view"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              aria-hidden="true"
            >
              <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z" />
            </svg>
            <span>Reset</span>
          </button>
        </nav>
      )}

      {hintVisible && (
        <div className="hint-chip" role="status">
          Tip — tap the phone for my contacts · the keyboard types · the PC
          tower is the power button · open the book for my story · sip the
          mug for a coffee break · ESC resets the view
        </div>
      )}

      <footer>
        2025 portfolio — designed &amp; developed by{' '}
        <a href={GITHUB_URL} target="_blank" rel="noreferrer">
          NAV
        </a>{' '}
        · 3D concept by{' '}
        <a
          href="https://github.com/sushilthapa98/3d-portfolio"
          target="_blank"
          rel="noreferrer"
        >
          Sushil Thapa
        </a>
      </footer>
    </>
  );
}
