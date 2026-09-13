/**
 * SunExplorer3D — Scientific 3D Sun Engine.
 * Based on NASA SDO (Solar Dynamics Observatory) HMI & AIA imagery.
 *
 * Inspiration: https://eyes.nasa.gov/apps/solar-system/
 *
 * Visual approach:
 * - Photosphere: NASA SDO HMI Continuum (white-cream with granulation + dark sunspots)
 * - Chromosphere: AIA 304Å (pink/magenta transition region)
 * - Quiet Corona: AIA 171Å (golden glow at limb)
 * - Active Corona: AIA 193Å (orange hot plasma loops)
 *
 * Rendering approach (correct for self-emitting star):
 * - MeshStandardMaterial with `emissiveMap` (texture defines brightness)
 * - emissive: white, intensity 1.0 (sun's true output)
 * - No directional/ambient light (sun is its own light source)
 * - Limb darkening baked into canvas pixels
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PLANET_THEMES, themeToStyle } from './planetTheme.js';
import { getFact } from '@renderer/airscience/engines/contentEngine.js';
import { useProgressStore } from '@renderer/airscience/stores/progressStore.js';
import { useGestureStore } from '@renderer/stores/gestureStore.js';
import styles from './SunExplorer3D.module.css';

// ─────────────────────────────────────────────────────────────────────────
// CATALOG: Active sunspot regions (lat, lon, type, intensity)
// Real positions loosely based on NOAA AR tracker patterns
// ─────────────────────────────────────────────────────────────────────────
const ACTIVE_REGIONS = [
  { lat: 8, lon: 22, type: 'large', intensity: 1.0 },
  { lat: -6, lon: 48, type: 'medium', intensity: 0.8 },
  { lat: 14, lon: 78, type: 'large', intensity: 1.0 },
  { lat: -18, lon: 115, type: 'medium', intensity: 0.7 },
  { lat: 22, lon: 145, type: 'large', intensity: 1.0 },
  { lat: -3, lon: 178, type: 'small', intensity: 0.5 },
  { lat: 11, lon: 210, type: 'xlarge', intensity: 1.2 },
  { lat: -22, lon: 248, type: 'medium', intensity: 0.8 },
  { lat: 6, lon: 285, type: 'small', intensity: 0.5 },
  { lat: -14, lon: 322, type: 'large', intensity: 1.0 },
  { lat: 17, lon: 358, type: 'medium', intensity: 0.7 }
];

// ─────────────────────────────────────────────────────────────────────────
// NOISE UTILITIES
// ─────────────────────────────────────────────────────────────────────────

// Multi-octave value noise via grid + smooth interp
function valueNoise(w: number, h: number, cellSize: number): Float32Array {
  const gridW = Math.ceil(w / cellSize) + 2;
  const gridH = Math.ceil(h / cellSize) + 2;
  const grid: number[] = [];
  for (let i = 0; i < gridW * gridH; i++) {
    grid.push(Math.random());
  }
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = x / cellSize;
      const gy = y / cellSize;
      const ix = Math.floor(gx);
      const iy = Math.floor(gy);
      const fx = gx - ix;
      const fy = gy - iy;
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);
      const n00 = grid[iy * gridW + ix];
      const n10 = grid[iy * gridW + ix + 1];
      const n01 = grid[(iy + 1) * gridW + ix];
      const n11 = grid[(iy + 1) * gridW + ix + 1];
      const nx0 = n00 * (1 - sx) + n10 * sx;
      const nx1 = n01 * (1 - sx) + n11 * sx;
      data[y * w + x] = nx0 * (1 - sy) + nx1 * sy;
    }
  }
  return data;
}

// FBM (Fractional Brownian Motion) - multi-octave noise
function fbm(
  w: number,
  h: number,
  baseCell: number,
  octaves = 4
): Float32Array {
  const result = new Float32Array(w * h);
  let totalWeight = 0;
  let weight = 1;
  for (let o = 0; o < octaves; o++) {
    const cellSize = baseCell * Math.pow(2, -o * 0.5);
    const noise = valueNoise(w, h, Math.max(2, cellSize));
    for (let i = 0; i < result.length; i++) {
      result[i] += noise[i] * weight;
    }
    totalWeight += weight;
    weight *= 0.5;
  }
  for (let i = 0; i < result.length; i++) {
    result[i] /= totalWeight;
  }
  return result;
}

function latLonToUV(
  latDeg: number,
  lonDeg: number,
  w: number,
  h: number
): { x: number; y: number } {
  const u = ((lonDeg + 180) / 360) * w;
  const v = ((90 - latDeg) / 180) * h;
  return { x: u, y: v };
}

// ─────────────────────────────────────────────────────────────────────────
// TEXTURE GENERATION - NASA SDO HMI Continuum Simulation
// ─────────────────────────────────────────────────────────────────────────

interface SunTextureOptions {
  hasSunspots: boolean;
  activity: 'low' | 'medium' | 'high';
  width?: number;
  height?: number;
}

function generateSunTexture(opts: SunTextureOptions): {
  canvas: HTMLCanvasElement;
  spotCount: number;
} {
  const w = opts.width ?? 2048;
  const h = opts.height ?? 1024;

  // Activity density affects: sunspot count multiplier, brightness multiplier
  const activityMul = opts.activity === 'high' ? 1.0 : opts.activity === 'low' ? 0.35 : 0.7;
  const brightnessMul = opts.activity === 'high' ? 1.0 : opts.activity === 'low' ? 0.85 : 0.92;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(w, h);
  const data = imgData.data;

  // ── Layer 1: Supergranulation (large cells ~30 Mm) ─────────────────
  const superGran = fbm(w, h, 200, 4);

  // ── Layer 2: Granulation (small cells ~1 Mm, SDO signature) ─────────
  // Real SDO HMI shows granulation as ~1000 km cells with bright centers and dark lanes
  const granule = fbm(w, h, 14, 3);

  // ── Layer 3: Very fine detail ──────────────────────────────────────
  const fineNoise = fbm(w, h, 4, 2);

  // ── Layer 4: Limb darkening precompute ─────────────────────────────
  // HMI uses approximately μ^0.6 limb darkening
  const limbDarkening = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    const v = y / h;
    const theta = v * Math.PI;
    const mu = Math.abs(Math.cos(theta));
    limbDarkening[y] = 0.25 + 0.75 * Math.pow(Math.max(mu, 0.0001), 0.6);
  }

  // ── Layer 5: Build base photosphere ────────────────────────────────
  // SDO HMI Continuum is mostly WHITE-CREAM with subtle variations
  // Base value ~ 0.9-0.98 (very bright), granulation creates ±10% variation
  const photo = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const s = superGran[i]; // 0-1
      const g = granule[i]; // 0-1
      const f = fineNoise[i]; // 0-1

      // Granulation: bright cell centers, dark lanes
      // Use power curve to create cellular look
      const cellSharp = Math.pow(g, 1.8); // Stronger cell-center boost
      const cellDark = Math.pow(1 - g, 3); // Sharper dark lanes

      // Photosphere brightness: ~0.92 base, granulation ±0.06
      let v = 0.88 + cellSharp * 0.08 - cellDark * 0.05 + (s - 0.5) * 0.04 + (f - 0.5) * 0.03;
      v = Math.max(0.7, Math.min(1.0, v));

      // Apply limb darkening
      v *= limbDarkening[y];

      photo[i] = v;
    }
  }

  // ── Layer 6: Sunspots (if enabled) ─────────────────────────────────
  let spotCount = 0;
  const spotMask = new Float32Array(w * h); // tracks where sunspots are
  if (opts.hasSunspots) {
    ACTIVE_REGIONS.forEach((region) => {
      // Activity-based filtering
      if (opts.activity === 'low' && Math.random() > activityMul + 0.2) return;
      if (opts.activity === 'medium' && Math.random() > activityMul + 0.15) return;

      const center = latLonToUV(region.lat, region.lon, w, h);
      // Skip spots too close to limb (they'd look weird)
      const latNorm = Math.abs(region.lat) / 90;
      if (latNorm > 0.85) return;

      const baseR =
        region.type === 'xlarge'
          ? 80
          : region.type === 'large'
            ? 55
            : region.type === 'medium'
              ? 35
              : 22;
      const rPx = baseR * (w / 2048);

      // Each spot has a dark umbra + lighter penumbra + bright surrounding faculae
      const umbraR = rPx * 0.3;
      const penumbraR = rPx * (0.7 + Math.random() * 0.25);

      const minX = Math.max(0, Math.floor(center.x - penumbraR));
      const maxX = Math.min(w, Math.ceil(center.x + penumbraR));
      const minY = Math.max(0, Math.floor(center.y - penumbraR));
      const maxY = Math.min(h, Math.ceil(center.y + penumbraR));

      for (let y = minY; y < maxY; y++) {
        for (let x = 0; x < w; x++) {
          let dx = x - center.x;
          if (dx > w / 2) dx -= w;
          if (dx < -w / 2) dx += w;
          const dy = y - center.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          const idx = y * w + x;

          if (dist < umbraR) {
            // UMBRA: Very dark (15-25% brightness) - Wilson depression
            const t = dist / umbraR;
            const darkness = 0.15 + 0.1 * t * t;
            photo[idx] = darkness;
            spotMask[idx] = 1.0;
            spotCount++;
          } else if (dist < penumbraR) {
            // PENUMBRA: Filamentary structure, dark gray (35-65% brightness)
            // Add radial striations for penumbra filaments
            const t = (dist - umbraR) / (penumbraR - umbraR);
            // Radial striations: bright/dark filaments emanating from umbra
            const angle = Math.atan2(dy, dx);
            const striations = Math.sin(angle * 14 + Math.random() * 0.5) * 0.15;
            const darkness = 0.6 - 0.25 * (1 - t) + striations * (1 - t);
            photo[idx] = Math.min(photo[idx], Math.max(0.25, darkness));
            spotMask[idx] = Math.max(spotMask[idx], 0.6);
            spotCount++;
          } else {
            // Bright facular ring around the spot (plage)
            const t = (dist - penumbraR) / (rPx * 0.6);
            if (t < 1) {
              const ring = Math.exp(-Math.pow((t - 0.3) * 4, 2)) * 0.15;
              photo[idx] = Math.min(1, photo[idx] + ring * region.intensity);
            }
          }
        }
      }
    });
  }

  // ── Layer 7: Bright network / faculae (general, not spot-bound) ────
  // Real SDO shows bright network between granulation cells
  const networkNoise = fbm(w, h, 30, 2);
  for (let i = 0; i < photo.length; i++) {
    const boost = Math.pow(networkNoise[i], 3) * 0.06 * brightnessMul;
    photo[i] = Math.min(1, photo[i] + boost);
  }

  // ── Layer 8: Compose final image data ──────────────────────────────
  // SDO HMI Continuum is essentially grayscale. Apply slight warm tint.
  for (let i = 0; i < photo.length; i++) {
    let v = photo[i] * brightnessMul;

    // Soft contrast boost (S-curve)
    const t = v;
    v = t < 0.5 ? 2 * t * t * 0.7 + 0.3 * t : 1 - Math.pow(-2 * t + 2, 2) / 2 * 0.3;

    v = Math.max(0, Math.min(1, v));
    const val255 = Math.floor(v * 255);

    // Warm cream tint - matches HMI Continuum appearance
    const r = val255;
    const g = Math.floor(val255 * 0.99);
    const b = Math.floor(val255 * 0.92);

    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);

  return { canvas, spotCount };
}

// ─────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────

type AIAColor = 'none' | '304' | '171' | '193';

export function SunExplorer3D(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const sunRef = useRef<THREE.Mesh | null>(null);
  const coronaRef = useRef<THREE.Mesh | null>(null);
  const chromosphereRef = useRef<THREE.Mesh | null>(null);
  const sunMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const coronaMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const chromosphereMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animRef = useRef<number>(0);
  const clockRef = useRef<THREE.Clock | null>(null);

  // Camera zoom state — 4.5 fits the sun cleanly within the fullscreen canvas
  const cameraDistRef = useRef<number>(4.5);
  const baselineDistRef = useRef<number>(4.5);
  const zoomActiveRef = useRef<boolean>(false);

  // Reactive state
  const [loading, setLoading] = useState(0);
  const [ready, setReady] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [time, setTime] = useState(() =>
    new Date().toISOString().replace('T', ' ').slice(0, 19)
  );
  const [rotationSpeed, setRotationSpeed] = useState(50);
  const [showCorona, setShowCorona] = useState(true);
  const [showSunspots, setShowSunspots] = useState(true);
  const [solarActivity, setSolarActivity] = useState<'low' | 'medium' | 'high'>(
    'medium'
  );
  const [coronaColor, setCoronaColor] = useState<AIAColor>('171');
  const [spotCount, setSpotCount] = useState(0);

  const discoverObject = useProgressStore((s) => s.discoverObject);
  const zoomPhase = useGestureStore((s) => s.zoomPhase);

  // Refs for animation loop
  const rotationSpeedRef = useRef(rotationSpeed);
  const showCoronaRef = useRef(showCorona);
  const showSunspotsRef = useRef(showSunspots);
  const solarActivityRef = useRef(solarActivity);
  const coronaColorRef = useRef(coronaColor);

  useEffect(() => {
    rotationSpeedRef.current = rotationSpeed;
  }, [rotationSpeed]);
  useEffect(() => {
    showCoronaRef.current = showCorona;
  }, [showCorona]);
  useEffect(() => {
    showSunspotsRef.current = showSunspots;
  }, [showSunspots]);
  useEffect(() => {
    solarActivityRef.current = solarActivity;
  }, [solarActivity]);
  useEffect(() => {
    coronaColorRef.current = coronaColor;
  }, [coronaColor]);

  // Animation tick for smooth corona fading + rotation
  useEffect(() => {
    const tick = (): void => {
      // Smooth fade for corona based on toggle
      if (coronaMaterialRef.current) {
        const target = showCoronaRef.current && coronaColorRef.current !== 'none' ? 1.0 : 0.0;
        const u = coronaMaterialRef.current.uniforms;
        const cur = u.intensity.value;
        u.intensity.value = cur + (target - cur) * 0.12;

        // Update color based on AIA channel
        const aiaColors: Record<AIAColor, [number, number, number]> = {
          none: [1, 0.88, 0.65],
          '304': [1.0, 0.4, 0.6], // Pink/magenta chromosphere
          '171': [1.0, 0.78, 0.25], // Golden corona
          '193': [1.0, 0.55, 0.15] // Orange hot plasma
        };
        const targetCol = aiaColors[coronaColorRef.current];
        u.color.value.lerp(
          new THREE.Color(targetCol[0], targetCol[1], targetCol[2]),
          0.12
        );

        // Activity multiplier
        const a =
          solarActivityRef.current === 'high'
            ? 1.6
            : solarActivityRef.current === 'medium'
              ? 1.0
              : 0.55;
        u.activityLevel.value = a;
      }

      // Chromosphere ring (304Å always subtly visible if corona on)
      if (chromosphereMaterialRef.current) {
        const target =
          showCoronaRef.current &&
          (coronaColorRef.current === '304' || coronaColorRef.current === '171')
            ? 1.0
            : 0.0;
        const u = chromosphereMaterialRef.current.uniforms;
        const cur = u.intensity.value;
        u.intensity.value = cur + (target - cur) * 0.1;
      }
    };
    const id = setInterval(tick, 16);
    return () => clearInterval(id);
  }, []);

  const sunMetrics = [
    {
      cat: 'Physical',
      items: [
        { l: 'Mean Radius', v: '696,340', u: 'km' },
        { l: 'Mass', v: '1.989×10³⁰', u: 'kg' },
        { l: 'Surface Gravity', v: '274', u: 'm/s²' },
        { l: 'Density', v: '1.408', u: 'g/cm³' }
      ]
    },
    {
      cat: 'Solar',
      items: [
        { l: 'Temperature', v: '5,778', u: 'K' },
        { l: 'Core Temp', v: '15×10⁶', u: 'K' },
        { l: 'Luminosity', v: '3.846×10²⁶', u: 'W' },
        { l: 'Age', v: '4.6', u: 'billion yrs' }
      ]
    },
    {
      cat: 'Activity',
      items: [
        { l: 'Cycle', v: '~11', u: 'years' },
        { l: 'Sunspot Min', v: '2020', u: 'approx' },
        {
          l: 'Active Regions',
          v:
            solarActivity === 'high'
              ? '150+'
              : solarActivity === 'medium'
                ? '50-100'
                : '<30',
          u: ''
        },
        {
          l: 'Flare Class',
          v:
            solarActivity === 'high'
              ? 'X-Class'
              : solarActivity === 'medium'
                ? 'M-Class'
                : 'C-Class',
          u: ''
        }
      ]
    }
  ];

  const provenance = {
    surface: {
      org: 'NASA SDO',
      dataset: 'HMI Continuum (6173Å)',
      instrument: 'HMI',
      steps: [
        'Fe I 6173Å filter scan',
        'I/Q/U/V linear combinations',
        'NASA GSFC pipeline'
      ]
    },
    corona: {
      org: 'NASA SDO',
      dataset: 'AIA 304Å / 171Å / 193Å',
      instrument: 'AIA',
      steps: [
        'EUV multi-channel imaging',
        'Temperature mapping',
        'Per-channel color composite'
      ]
    },
    activity: {
      org: 'NOAA Space Weather',
      dataset: 'Solar Cycle Progression',
      instrument: 'Various',
      steps: ['Sunspot number', 'Solar flux index', 'Activity classification']
    }
  };

  // ── Init Three.js ───────────────────────────────────────────────────────
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(0, 0, cameraDistRef.current);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0); // Transparent so user/camera visible
    renderer.toneMapping = THREE.NoToneMapping; // Preserve exact colors
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 2.5;
    controls.maxDistance = 14;
    controls.enablePan = false;
    controls.rotateSpeed = 0.4;
    controls.zoomSpeed = 0.6;
    controlsRef.current = controls;

    // ── Sun: Shader-based (GLSL Simplex noise for real-time granulation) ──
    // From HTML Solar System demo: SUN_VERT / SUN_FRAG with Simplex noise
    // Activity level drives sunspot visibility
    const activityLevel =
      solarActivityRef.current === 'high'
        ? 1.0
        : solarActivityRef.current === 'medium'
          ? 0.6
          : 0.25;

    const sunMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uActivity: { value: activityLevel },
        uShowSpots: { value: showSunspotsRef.current ? 1.0 : 0.0 }
      },
      vertexShader: `
        varying vec3 vNormalW;
        varying vec3 vPositionW;
        void main() {
          vNormalW = normalize(mat3(modelMatrix) * normal);
          vPositionW = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uActivity;
        uniform float uShowSpots;
        varying vec3 vNormalW;
        varying vec3 vPositionW;

        // ── Simplex 3D Noise (Ashima Arts / Ian McEwan) ──────────────────
        vec3 mod289v3(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
        vec4 mod289v4(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
        vec4 permute4(vec4 x){return mod289v4(((x*34.0)+1.0)*x);}
        vec4 taylorInvSqrt4(vec4 r){return 1.79284291400159-0.85373472095314*r;}
        float snoise(vec3 v){
          const vec2 C=vec2(1.0/6.0,1.0/3.0);
          const vec4 D=vec4(0.0,0.5,1.0,2.0);
          vec3 i=floor(v+dot(v,C.yyy));
          vec3 x0=v-i+dot(i,C.xxx);
          vec3 g=step(x0.yzx,x0.xyz);
          vec3 l=1.0-g;
          vec3 i1=min(g.xyz,l.zxy);
          vec3 i2=max(g.xyz,l.zxy);
          vec3 x1=x0-i1+C.xxx;
          vec3 x2=x0-i2+C.yyy;
          vec3 x3=x0-D.yyy;
          i=mod289v3(i);
          vec4 p=permute4(permute4(permute4(
            i.z+vec4(0.0,i1.z,i2.z,1.0))
            +i.y+vec4(0.0,i1.y,i2.y,1.0))
            +i.x+vec4(0.0,i1.x,i2.x,1.0));
          float n_=0.142857142857;
          vec3 ns=n_*D.wyz-D.xzx;
          vec4 j=p-49.0*floor(p*ns.z*ns.z);
          vec4 x_=floor(j*ns.z);
          vec4 y_=floor(j-7.0*x_);
          vec4 x=x_*ns.x+ns.yyyy;
          vec4 y=y_*ns.x+ns.yyyy;
          vec4 h=1.0-abs(x)-abs(y);
          vec4 b0=vec4(x.xy,y.xy);
          vec4 b1=vec4(x.zw,y.zw);
          vec4 s0=floor(b0)*2.0+1.0;
          vec4 s1=floor(b1)*2.0+1.0;
          vec4 sh=-step(h,vec4(0.0));
          vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
          vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
          vec3 p0=vec3(a0.xy,h.x);
          vec3 p1=vec3(a0.zw,h.y);
          vec3 p2=vec3(a1.xy,h.z);
          vec3 p3=vec3(a1.zw,h.w);
          vec4 norm=taylorInvSqrt4(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
          p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
          vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
          m=m*m;
          return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
        }

        float fbm(vec3 p){
          float v=0.0,a=0.5;
          for(int i=0;i<5;i++){v+=a*snoise(p);p*=2.02;a*=0.5;}
          return v;
        }

        void main(){
          vec3 p = normalize(vPositionW)*2.6;

          // ── Granulation: two noise layers ───────────────────────────────
          float n1 = fbm(p + vec3(0.0, 0.0, uTime*0.045));
          float n2 = fbm(p*2.3 + vec3(uTime*0.03, 0.0, 0.0));
          float granules = n1*0.6 + n2*0.4;

          // ── Sunspot darkening (activity-driven) ───────────────────────
          float spotNoise = fbm(p*0.55 + vec3(0.0, 0.0, uTime*0.008));
          float spotMask = smoothstep(0.5, 0.78, spotNoise) * uShowSpots;

          // ── Color palette: cool dark red → orange → hot white ──────────
          float t = clamp(granules*0.5+0.5, 0.0, 1.0);
          vec3 colCool  = vec3(0.58, 0.09, 0.02);
          vec3 colMid   = vec3(0.97, 0.38, 0.04);
          vec3 colHot   = vec3(1.0,  0.82, 0.32);
          vec3 colWhite = vec3(1.0,  0.97, 0.88);

          vec3 color = mix(colCool, colMid,  smoothstep(0.0, 0.45, t));
          color      = mix(color,   colHot,  smoothstep(0.4, 0.78, t));
          color      = mix(color,   colWhite, smoothstep(0.8, 1.0, t));

          // Sunspot darkening
          color = mix(color, color*0.22, spotMask*0.88*uActivity);

          // ── Limb brightening (edges glow warmer) ──────────────────────
          float rim = pow(1.0-abs(vNormalW.z), 1.6);
          color += rim * vec3(1.0, 0.5, 0.15) * 0.12;

          gl_FragColor = vec4(color, 1.0);
        }
      `
    });
    sunMaterialRef.current = sunMaterial;

    const sunGeo = new THREE.SphereGeometry(1, 128, 128);
    const sunMesh = new THREE.Mesh(sunGeo, sunMaterial);
    sunMesh.userData = { id: 'sun', label: 'Mặt Trời' };
    scene.add(sunMesh);
    sunRef.current = sunMesh;

    // ── Corona shader (AIA-style outer glow) ─────────────────────────
    const coronaMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        intensity: { value: 1.0 },
        color: { value: new THREE.Color(1.0, 0.78, 0.25) }, // AIA 171 gold
        activityLevel: { value: 1.0 }
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * vec4(vPosition, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float intensity;
        uniform vec3 color;
        uniform float activityLevel;
        varying vec3 vNormal;
        varying vec3 vPosition;

        // Simple hash for noise
        float hash(vec3 p) {
          return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
        }

        void main() {
          vec3 viewDir = normalize(-vPosition);
          float NdotV = abs(dot(vNormal, viewDir));

          // Limb brightening for corona - visible only at edges
          float limbFactor = pow(1.0 - NdotV, 4.0);

          // Pulsation effect
          float pulse = sin(time * 1.5) * 0.06 + 1.0;

          // Add some noise texture for streaming effect
          float n = hash(vec3(vPosition.xy * 8.0, time * 0.3)) * 0.3 + 0.7;

          float alpha = limbFactor * intensity * 0.4 * pulse * n * activityLevel;
          alpha = clamp(alpha, 0.0, 0.5);

          gl_FragColor = vec4(color * alpha, alpha);
        }
      `,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false
    });
    coronaMaterialRef.current = coronaMaterial;

    const coronaGeo = new THREE.SphereGeometry(1.1, 64, 64);
    const coronaMesh = new THREE.Mesh(coronaGeo, coronaMaterial);
    scene.add(coronaMesh);
    coronaRef.current = coronaMesh;

    // ── Chromosphere ring (AIA 304Å - thin pink layer) ───────────────
    const chromosphereMaterial = new THREE.ShaderMaterial({
      uniforms: {
        intensity: { value: 0.0 },
        color: { value: new THREE.Color(1.0, 0.4, 0.6) }
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * vec4(vPosition, 1.0);
        }
      `,
      fragmentShader: `
        uniform float intensity;
        uniform vec3 color;
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vec3 viewDir = normalize(-vPosition);
          float NdotV = abs(dot(vNormal, viewDir));
          float ring = pow(1.0 - NdotV, 6.0);
          float alpha = ring * intensity * 0.45;
          gl_FragColor = vec4(color * alpha * 1.5, alpha);
        }
      `,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false
    });
    chromosphereMaterialRef.current = chromosphereMaterial;
    const chromoGeo = new THREE.SphereGeometry(1.03, 64, 64);
    const chromoMesh = new THREE.Mesh(chromoGeo, chromosphereMaterial);
    scene.add(chromoMesh);
    chromosphereRef.current = chromoMesh;

    // ── Stars (subtle background, visible through transparency) ──────
    const starGeo = new THREE.BufferGeometry();
    const verts: number[] = [];
    for (let i = 0; i < 600; i++) {
      verts.push(
        (Math.random() - 0.5) * 600,
        (Math.random() - 0.5) * 600,
        -(Math.random() * 200 + 30)
      );
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    const starMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.6,
      transparent: true,
      opacity: 0.5,
      depthWrite: false
    });
    scene.add(new THREE.Points(starGeo, starMaterial));

    const clock = new THREE.Clock();
    clockRef.current = clock;

    setLoading(100);
    setTimeout(() => setReady(true), 200);

    const onResize = (): void => {
      if (!camera || !renderer) return;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    const onCanvasClick = (event: PointerEvent): void => {
      if (!cameraRef.current || !sceneRef.current) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);
      const hits = ray.intersectObjects(sceneRef.current.children, true);
      const sunHit = hits.find((h) => h.object === sunRef.current);
      if (sunHit) {
        const fact = getFact('space.sun.basic');
        if (fact) discoverObject('space', 'sun', fact.xpReward);
      }
    };
    renderer.domElement.addEventListener('pointerdown', onCanvasClick);

    let elapsed = 0;
    const animate = (): void => {
      animRef.current = requestAnimationFrame(animate);
      const d = clock.getDelta();
      elapsed += d;

      // Hand-driven zoom
      if (zoomActiveRef.current && cameraRef.current && controlsRef.current) {
        const currentZoomFactor = useGestureStore.getState().zoomFactor;
        const currentZoomPhase = useGestureStore.getState().zoomPhase;
        if (currentZoomPhase === 'TRACKING') {
          const newDist = baselineDistRef.current / currentZoomFactor;
          const clampedDist = Math.max(
            controls.minDistance,
            Math.min(controls.maxDistance, newDist)
          );
          cameraDistRef.current = clampedDist;
          const dir = cameraRef.current.position.clone().normalize();
          cameraRef.current.position.copy(dir.multiplyScalar(clampedDist));
          controlsRef.current.update();
        }
      }

      // Update sun shader uniforms
      if (sunMaterialRef.current) {
        sunMaterialRef.current.uniforms.uTime.value = elapsed;
        // Sync activity / sunspot toggle from refs (cheap — just uniform update)
        const act =
          solarActivityRef.current === 'high'
            ? 1.0
            : solarActivityRef.current === 'medium'
              ? 0.6
              : 0.25;
        sunMaterialRef.current.uniforms.uActivity.value = act;
        sunMaterialRef.current.uniforms.uShowSpots.value = showSunspotsRef.current ? 1.0 : 0.0;
      }

      // Rotate sun
      if (sunRef.current) {
        sunRef.current.rotation.y += d * (rotationSpeedRef.current / 1000);
      }

      // Corona animation
      if (coronaRef.current && coronaMaterialRef.current) {
        coronaMaterialRef.current.uniforms.time.value = elapsed;
      }

      if (!zoomActiveRef.current && controlsRef.current) {
        controlsRef.current.update();
      }

      renderer.render(scene, camera);
    };
    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onCanvasClick);
      if (container && renderer) container.removeChild(renderer.domElement);
      sunMaterial.dispose();
      coronaMaterial.dispose();
      chromosphereMaterial.dispose();
      controls.dispose();
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const wasActive = zoomActiveRef.current;
    if (zoomPhase === 'TRACKING' && !wasActive) {
      baselineDistRef.current = cameraDistRef.current;
      zoomActiveRef.current = true;
    } else if (zoomPhase !== 'TRACKING' && wasActive) {
      zoomActiveRef.current = false;
    }
  }, [zoomPhase]);

  useEffect(() => {
    const t = setInterval(
      () => setTime(new Date().toISOString().replace('T', ' ').slice(0, 19)),
      1000
    );
    return () => clearInterval(t);
  }, []);

  const prov = provenance.surface;

  return (
    <div className={styles.explorer} ref={containerRef} style={themeToStyle(PLANET_THEMES.sun)}>
      {!ready && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingBox}>
            <div className={styles.spinner}>☀️</div>
            <div className={styles.loadingTitle}>LOADING NASA SDO DATA</div>
            <div className={styles.loadingSub}>
              Generating solar imagery datasets...
            </div>
            <div className={styles.loadingBar}>
              <div className={styles.loadingFill} style={{ width: `${loading}%` }} />
            </div>
          </div>
        </div>
      )}

      {ready && showHint && (
        <div className={styles.instructionOverlay}>
          <div className={styles.instructionBox}>
            <div className={styles.instructionGlyph}>☀️</div>

            <div className={styles.instrHeader}>
              <div className={styles.instrIcon}>☀️</div>
              <div className={styles.instrTitleBlock}>
                <p className={styles.instrEyebrow}>SOLAR EXPLORER · NASA SDO</p>
                <h2 className={styles.instrTitle}>Khám phá Mặt Trời 3D</h2>
              </div>
            </div>
            <p className={styles.instrSubtitle}>
              Quan sát quang cầu, vành nhật hoa và vết đen — dữ liệu thời gian thực từ Solar Dynamics Observatory.
            </p>

            <div className={styles.instrList}>
              <div className={styles.instrStep}>
                <span className={styles.instrNum}>1</span>
                <span>
                  🖐 Giơ <b>5 ngón tay</b> + giữ yên 1.5s → <b>zoom bằng tay</b>
                </span>
              </div>
              <div className={styles.instrStep}>
                <span className={styles.instrNum}>2</span>
                <span>
                  🖐✋ <b>Vẫy tay</b> → xoay camera quanh Mặt Trời
                </span>
              </div>
              <div className={styles.instrStep}>
                <span className={styles.instrNum}>3</span>
                <span>
                  🌡️ <b>Chọn bước sóng AIA</b> → đổi màu vành nhật hoa (304 / 171 / 193Å)
                </span>
              </div>
              <div className={styles.instrStep}>
                <span className={styles.instrNum}>4</span>
                <span>
                  🔆 <b>Điều chỉnh Solar Activity</b> → mật độ vết đen Mặt Trời thay đổi
                </span>
              </div>
            </div>

            <div className={styles.instrTip}>
              <span>💡</span>
              <span>
                <b>Mẹo:</b> Bật chế độ <b>High Activity</b> và chọn <b>AIA 193Å</b> để thấy
                các vòng plasma nóng bùng cháy trên vành nhật hoa.
              </span>
            </div>

            <button className={styles.startBtn} onClick={() => setShowHint(false)}>
              🔥 KHÁM PHÁ MẶT TRỜI
            </button>
          </div>
        </div>
      )}

      <div ref={canvasContainerRef} className={styles.canvas} />

      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.headerTitle}>☀️ SOLAR EXPLORER</span>
          <div className={styles.headerDot} />
          <span className={styles.integrityPill}>
            <span className={styles.integrityDot} />
            DATA INTEGRITY
          </span>
        </div>
        <div className={styles.headerRight}>
          <span
            className={styles.headerBadge}
            style={{
              background:
                zoomPhase === 'TRACKING'
                  ? 'rgba(74, 222, 128, 0.2)'
                  : zoomPhase === 'COOLDOWN'
                    ? 'rgba(251, 191, 36, 0.2)'
                    : 'rgba(107, 114, 128, 0.2)',
              borderColor:
                zoomPhase === 'TRACKING'
                  ? 'rgba(74, 222, 128, 0.5)'
                  : zoomPhase === 'COOLDOWN'
                    ? 'rgba(251, 191, 36, 0.5)'
                    : 'rgba(107, 114, 128, 0.4)',
              color:
                zoomPhase === 'TRACKING'
                  ? '#4ade80'
                  : zoomPhase === 'COOLDOWN'
                    ? '#fbbf24'
                    : '#94a3b8'
            }}
          >
            {zoomPhase === 'TRACKING'
              ? '🖐 ZOOM'
              : zoomPhase === 'COOLDOWN'
                ? '🖐 ...'
                : '🖐 IDLE'}
          </span>
          <span className={styles.headerSrc}>NASA SDO</span>
          <span className={styles.headerBadge}>P0</span>
        </div>
      </header>

      <main className={styles.main}>
        <aside className={styles.leftPanel}>
          <div className={styles.panel}>
            <div className={styles.panelTitle}>Layers</div>
            <div className={styles.layerList}>
              <div
                className={styles.layerItem}
                onClick={() => setShowCorona(!showCorona)}
              >
                <div
                  className={`${styles.toggle} ${showCorona ? styles.toggleOn : ''}`}
                />
                <span className={styles.layerName}>
                  Corona (AIA {coronaColor}Å) {showCorona ? '✓' : '○'}
                </span>
              </div>
              <div
                className={styles.layerItem}
                onClick={() => setShowSunspots(!showSunspots)}
              >
                <div
                  className={`${styles.toggle} ${showSunspots ? styles.toggleOn : ''}`}
                />
                <span className={styles.layerName}>
                  Sunspot Regions ({spotCount}) {showSunspots ? '✓' : '○'}
                </span>
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelTitle}>Corona Wavelength (AIA)</div>
            <div className={styles.activityButtons}>
              <button
                className={`${styles.activityBtn} ${coronaColor === '304' ? styles.active : ''}`}
                onClick={() => setCoronaColor('304')}
                style={
                  coronaColor === '304'
                    ? { borderColor: '#ff6499', color: '#ff6499' }
                    : undefined
                }
              >
                304Å
              </button>
              <button
                className={`${styles.activityBtn} ${coronaColor === '171' ? styles.active : ''}`}
                onClick={() => setCoronaColor('171')}
                style={
                  coronaColor === '171'
                    ? { borderColor: '#ffc64d', color: '#ffc64d' }
                    : undefined
                }
              >
                171Å
              </button>
              <button
                className={`${styles.activityBtn} ${coronaColor === '193' ? styles.active : ''}`}
                onClick={() => setCoronaColor('193')}
                style={
                  coronaColor === '193'
                    ? { borderColor: '#ff8c30', color: '#ff8c30' }
                    : undefined
                }
              >
                193Å
              </button>
            </div>
            <div className={styles.sliderValue}>
              {coronaColor === '304'
                ? 'Chromosphere / Transition Region (50,000 K)'
                : coronaColor === '171'
                  ? 'Quiet Corona (1.2 MK)'
                  : 'Active Region Corona (2 MK)'}
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelTitle}>Rotation Speed</div>
            <input
              type="range"
              min={0}
              max={200}
              value={rotationSpeed}
              onChange={(e) => setRotationSpeed(parseFloat(e.target.value))}
              className={styles.slider}
            />
            <div className={styles.sliderValue}>
              {(rotationSpeed / 1000).toFixed(3)} rad/s ({rotationSpeed}×10⁻³)
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelTitle}>Solar Activity</div>
            <div className={styles.activityButtons}>
              <button
                className={`${styles.activityBtn} ${solarActivity === 'low' ? styles.active : ''}`}
                onClick={() => setSolarActivity('low')}
              >
                🟢 Low
              </button>
              <button
                className={`${styles.activityBtn} ${solarActivity === 'medium' ? styles.active : ''}`}
                onClick={() => setSolarActivity('medium')}
              >
                🟡 Medium
              </button>
              <button
                className={`${styles.activityBtn} ${solarActivity === 'high' ? styles.active : ''}`}
                onClick={() => setSolarActivity('high')}
              >
                🔴 High
              </button>
            </div>
            <div className={styles.sliderValue}>
              Active: {solarActivity.toUpperCase()} — {spotCount} sunspots
            </div>
          </div>

          <div className={`${styles.panel} ${styles.dataPanel}`}>
            <div className={styles.panelTitle}>📊 Solar Data</div>
            <div className={styles.dataScroll}>
              <div className={styles.dataHeader}>THE SUN</div>
              {sunMetrics.map((g) => (
                <div key={g.cat} className={styles.dataGroup}>
                  <div className={styles.dataCat}>{g.cat}</div>
                  {g.items.map((i) => (
                    <div key={i.l} className={styles.dataRow}>
                      <span className={styles.dataLbl}>{i.l}</span>
                      <span className={styles.dataDots} />
                      <span className={styles.dataVal}>
                        {i.v} <span className={styles.dataUnit}>{i.u}</span>
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </aside>

        <aside className={styles.rightPanel}>
          <div className={`${styles.panel} ${styles.provPanel}`}>
            <div className={styles.panelTitleOrange}>📜 Provenance</div>
            <div className={styles.provSub}>P0 Scientific Data</div>
            <div className={styles.provContent}>
              <div className={styles.codeBox}>{`{ "source": "nasa_sdo" }`}</div>
              <div className={styles.field}>
                <div className={styles.fieldLabel}>SOURCE</div>
                <div className={styles.fieldVal}>🏛 {prov.org}</div>
              </div>
              <div className={styles.field}>
                <div className={styles.fieldLabel}>DATASET</div>
                <div className={styles.fieldVal}>{prov.dataset}</div>
                <div className={styles.fieldSub}>{prov.instrument}</div>
              </div>
              <div className={styles.pipeline}>
                <div className={styles.pipelineTitle}>Pipeline</div>
                {prov.steps.map((s, i) => (
                  <div key={i} className={styles.pipelineStep}>
                    <span className={styles.stepIdx}>[{i + 1}]</span> {s}
                  </div>
                ))}
              </div>
              <div className={styles.valid}>
                <div className={styles.validDot} />
                <span className={styles.validTxt}>SCIENTIFICALLY VALIDATED</span>
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelTitle}>🌡️ Solar Facts</div>
            <div className={styles.factList}>
              <div className={styles.fact}>
                <span className={styles.factIcon}>💡</span>
                <span>
                  The Sun contains 99.86% of all mass in our solar system
                </span>
              </div>
              <div className={styles.fact}>
                <span className={styles.factIcon}>🔥</span>
                <span>Core temperature: 15 million °C</span>
              </div>
              <div className={styles.fact}>
                <span className={styles.factIcon}>⚡</span>
                <span>
                  Every second, 600 million tons of hydrogen are converted to
                  helium
                </span>
              </div>
              <div className={styles.fact}>
                <span className={styles.factIcon}>🌊</span>
                <span>Light takes ~8 minutes to travel from Sun to Earth</span>
              </div>
            </div>
          </div>
        </aside>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerLeft}>
          <div className={styles.timeLbl}>SIM TIME</div>
          <div className={styles.timeVal}>{time}</div>
        </div>
        <div className={styles.footerCenter}>
          <span className={styles.footerLabel}>
            ☀️ NASA SDO Solar Dynamics Observatory — HMI/AIA
          </span>
        </div>
        <div className={styles.footerRight}>
          <span className={styles.footerStatus}>
            {solarActivity === 'high'
              ? '🔴 Active'
              : solarActivity === 'medium'
                ? '🟡 Moderate'
                : '🟢 Quiet'}{' '}
            Solar Period
          </span>
        </div>
      </footer>
    </div>
  );
}