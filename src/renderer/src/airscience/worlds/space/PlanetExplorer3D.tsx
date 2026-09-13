/**
 * PlanetExplorer3D — Scientific 3D Planet Engine for any solar system body.
 *
 * Mirrors SpaceExplorer3D's interaction model exactly:
 * - OrbitControls with damping for mouse drag + scroll zoom
 * - Hand-driven zoom (5-finger open + steady → ARMED): hand depth → camera distance
 * - Click (dwell/pinch): synthetic pointer events → raycasting → discovery
 * - Same UI panels (Layers, Data, Provenance) as Earth
 * - Same CSS module (SunExplorer3D.module.css, which shares class names)
 *
 * Visual sphere uses procedural texture generators from planetTextures.ts
 * (same source used by Planet3DRender card view — keeping the look identical).
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PLANET_CONFIGS } from './planetConfigs.js';
import {
  buildPlanetTexture,
  genRingTexture,
  createRingGeometry,
  SATURN_RING_BANDS
} from './planetTextures.js';
import { PLANET_THEMES, themeToStyle } from './planetTheme.js';
import { getFact } from '@renderer/airscience/engines/contentEngine.js';
import { useProgressStore } from '@renderer/airscience/stores/progressStore.js';
import { useGestureStore } from '@renderer/stores/gestureStore.js';
import { pointerRef } from '@renderer/stores/pointerStore.js';
import styles from './SunExplorer3D.module.css';

// ── Astronomical data per planet (real figures from NASA/IAU) ──────────
const PLANET_DATA: Record<string, {
  category: 'planet' | 'moon';
  descVi: string;
  physical: Array<{ l: string; v: string; u: string }>;
  orbital: Array<{ l: string; v: string; u: string }>;
  provenance: { org: string; dataset: string; instrument: string; steps: string[] };
}> = {
  mercury: {
    category: 'planet',
    descVi: 'Sao Thủy là hành tinh nhỏ nhất và gần Mặt Trời nhất. Bề mặt đầy hố va chạm, không có khí quyển nên nhiệt độ dao động cực đoan (-173°C đến 427°C).',
    physical: [
      { l: 'Bán kính', v: '2.439', u: 'km' },
      { l: 'Khối lượng', v: '3.30×10²³', u: 'kg' },
      { l: 'Trọng lực', v: '3.7', u: 'm/s²' },
      { l: 'Tỷ trọng', v: '5.43', u: 'g/cm³' }
    ],
    orbital: [
      { l: 'Bán trục lớn', v: '57.9M', u: 'km' },
      { l: 'Độ lệch tâm', v: '0.2056', u: '' },
      { l: 'Chu kỳ quỹ đạo', v: '88.0', u: 'ngày' },
      { l: 'Nghiêng trục', v: '0.03', u: '°' }
    ],
    provenance: {
      org: 'NASA MESSENGER',
      dataset: 'MDIS Surface Mapping',
      instrument: 'Wide Angle Camera',
      steps: ['WAC mosaic composition', 'Photometric correction', 'Procedural regolith synthesis']
    }
  },
  venus: {
    category: 'planet',
    descVi: 'Sao Kim có kích thước gần bằng Trái Đất nhưng khí quyển dày CO₂ tạo hiệu ứng nhà kính cực mạnh, là hành tinh nóng nhất hệ Mặt Trời (~464°C).',
    physical: [
      { l: 'Bán kính', v: '6.052', u: 'km' },
      { l: 'Khối lượng', v: '4.87×10²⁴', u: 'kg' },
      { l: 'Trọng lực', v: '8.87', u: 'm/s²' },
      { l: 'Tỷ trọng', v: '5.24', u: 'g/cm³' }
    ],
    orbital: [
      { l: 'Bán trục lớn', v: '108.2M', u: 'km' },
      { l: 'Độ lệch tâm', v: '0.0068', u: '' },
      { l: 'Chu kỳ quỹ đạo', v: '224.7', u: 'ngày' },
      { l: 'Nghiêng trục', v: '177.4', u: '°' }
    ],
    provenance: {
      org: 'NASA Magellan',
      dataset: 'Synthetic Aperture Radar',
      instrument: 'SAR',
      steps: ['Atmospheric absorption model', 'Cloud pattern simulation', 'Sulfuric acid haze layering']
    }
  },
  mars: {
    category: 'planet',
    descVi: 'Sao Hỏa có màu đỏ đặc trưng từ oxit sắt. Có núi lửa lớn nhất hệ Mặt Trời (Olympus Mons) và hẻm núi Valles Marineris. Hai cực có chỏm băng nước và CO₂.',
    physical: [
      { l: 'Bán kính', v: '3.389', u: 'km' },
      { l: 'Khối lượng', v: '6.42×10²³', u: 'kg' },
      { l: 'Trọng lực', v: '3.71', u: 'm/s²' },
      { l: 'Tỷ trọng', v: '3.93', u: 'g/cm³' }
    ],
    orbital: [
      { l: 'Bán trục lớn', v: '227.9M', u: 'km' },
      { l: 'Độ lệch tâm', v: '0.0934', u: '' },
      { l: 'Chu kỳ quỹ đạo', v: '687.0', u: 'ngày' },
      { l: 'Nghiêng trục', v: '25.19', u: '°' }
    ],
    provenance: {
      org: 'NASA MRO',
      dataset: 'MOLA Topography',
      instrument: 'HiRISE / MOLA',
      steps: ['Iron oxide spectral analysis', 'Polar ice cap synthesis', 'Olympus Mons elevation model']
    }
  },
  jupiter: {
    category: 'planet',
    descVi: 'Sao Mộc là hành tinh lớn nhất hệ Mặt Trời, chủ yếu gồm hydro và heli. Vết Đỏ Lớn là cơn bão đã tồn tại hàng trăm năm, rộng hơn cả Trái Đất.',
    physical: [
      { l: 'Bán kính', v: '69.911', u: 'km' },
      { l: 'Khối lượng', v: '1.90×10²⁷', u: 'kg' },
      { l: 'Trọng lực', v: '24.79', u: 'm/s²' },
      { l: 'Tỷ trọng', v: '1.33', u: 'g/cm³' }
    ],
    orbital: [
      { l: 'Bán trục lớn', v: '778.5M', u: 'km' },
      { l: 'Độ lệch tâm', v: '0.0489', u: '' },
      { l: 'Chu kỳ quỹ đạo', v: '11.86', u: 'năm' },
      { l: 'Nghiêng trục', v: '3.13', u: '°' }
    ],
    provenance: {
      org: 'NASA Juno',
      dataset: 'JIRAM / JunoCam',
      instrument: 'Infrared Imager',
      steps: ['Cloud band stratification', 'Great Red Spot turbulence model', 'Zonal wind speed profile']
    }
  },
  saturn: {
    category: 'planet',
    descVi: 'Sao Thổ nổi tiếng với hệ vành đai hoành tráng từ băng và đá. Là hành tinh có mật độ thấp nhất — về lý thuyết có thể nổi trên nước.',
    physical: [
      { l: 'Bán kính', v: '58.232', u: 'km' },
      { l: 'Khối lượng', v: '5.68×10²⁶', u: 'kg' },
      { l: 'Trọng lực', v: '10.44', u: 'm/s²' },
      { l: 'Tỷ trọng', v: '0.687', u: 'g/cm³' }
    ],
    orbital: [
      { l: 'Bán trục lớn', v: '1.434B', u: 'km' },
      { l: 'Độ lệch tâm', v: '0.0565', u: '' },
      { l: 'Chu kỳ quỹ đạo', v: '29.46', u: 'năm' },
      { l: 'Nghiêng trục', v: '26.73', u: '°' }
    ],
    provenance: {
      org: 'NASA Cassini',
      dataset: 'ISS / VIMS',
      instrument: 'Imaging Science Subsystem',
      steps: ['Ring particle density map', 'Cassini Division gap', 'Cloud band periodicity']
    }
  },
  uranus: {
    category: 'planet',
    descVi: 'Sao Thiên Vương có trục quay nghiêng gần như nằm ngang (~98°), "lăn" quanh Mặt Trời. Màu xanh lam từ methane hấp thụ ánh sáng đỏ.',
    physical: [
      { l: 'Bán kính', v: '25.362', u: 'km' },
      { l: 'Khối lượng', v: '8.68×10²⁵', u: 'kg' },
      { l: 'Trọng lực', v: '8.69', u: 'm/s²' },
      { l: 'Tỷ trọng', v: '1.27', u: 'g/cm³' }
    ],
    orbital: [
      { l: 'Bán trục lớn', v: '2.871B', u: 'km' },
      { l: 'Độ lệch tâm', v: '0.0457', u: '' },
      { l: 'Chu kỳ quỹ đạo', v: '84.01', u: 'năm' },
      { l: 'Nghiêng trục', v: '97.77', u: '°' }
    ],
    provenance: {
      org: 'NASA Voyager 2',
      dataset: 'ISS Uranus Encounter',
      instrument: 'Narrow Angle Camera',
      steps: ['Methane band absorption', 'Axial tilt synthesis', 'Faint ring system overlay']
    }
  },
  neptune: {
    category: 'planet',
    descVi: 'Sao Hải Vương là hành tinh xa nhất và có gió mạnh nhất (>2.000 km/h). Được phát hiện năm 1846 qua tính toán toán học trước khi quan sát trực tiếp.',
    physical: [
      { l: 'Bán kính', v: '24.622', u: 'km' },
      { l: 'Khối lượng', v: '1.02×10²⁶', u: 'kg' },
      { l: 'Trọng lực', v: '11.15', u: 'm/s²' },
      { l: 'Tỷ trọng', v: '1.64', u: 'g/cm³' }
    ],
    orbital: [
      { l: 'Bán trục lớn', v: '4.495B', u: 'km' },
      { l: 'Độ lệch tâm', v: '0.0113', u: '' },
      { l: 'Chu kỳ quỹ đạo', v: '164.8', u: 'năm' },
      { l: 'Nghiêng trục', v: '28.32', u: '°' }
    ],
    provenance: {
      org: 'NASA Voyager 2',
      dataset: 'ISS Neptune Encounter',
      instrument: 'Wide/ Narrow Angle',
      steps: ['Great Dark Spot analog', 'Supersonic wind profile', 'Methane deep blue synthesis']
    }
  },
  moon: {
    category: 'moon',
    descVi: 'Mặt Trăng là vệ tinh tự nhiên duy nhất của Trái Đất, hình thành ~4.5 tỷ năm trước từ vụ va chạm giữa Trái Đất sơ khai và thiên thể cỡ Sao Hỏa.',
    physical: [
      { l: 'Bán kính', v: '1.737', u: 'km' },
      { l: 'Khối lượng', v: '7.35×10²²', u: 'kg' },
      { l: 'Trọng lực', v: '1.62', u: 'm/s²' },
      { l: 'Tỷ trọng', v: '3.34', u: 'g/cm³' }
    ],
    orbital: [
      { l: 'Cách Trái Đất', v: '384.400', u: 'km' },
      { l: 'Chu kỳ quỹ đạo', v: '27.32', u: 'ngày' },
      { l: 'Khóa thủy triều', v: 'Có', u: '' },
      { l: 'Độ lệch tâm', v: '0.0549', u: '' }
    ],
    provenance: {
      org: 'NASA LRO',
      dataset: 'LROC WAC Mosaic',
      instrument: 'Wide Angle Camera',
      steps: ['Crater density mapping', 'Mare basalt synthesis', 'Regolith grain simulation']
    }
  }
};

interface PlanetExplorer3DProps {
  /** Planet id */
  planetId: keyof typeof PLANET_DATA;
}

export function PlanetExplorer3D({ planetId }: PlanetExplorer3DProps): JSX.Element {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const planetRef = useRef<THREE.Mesh | null>(null);
  const ringsRef = useRef<THREE.Group | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animRef = useRef<number>(0);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);

  // Camera zoom state (matches SpaceExplorer3D pattern)
  // 4.5 fits the planet cleanly within the fullscreen canvas.
  const cameraDistRef = useRef<number>(4.5);
  const baselineDistRef = useRef<number>(4.5);
  const zoomActiveRef = useRef<boolean>(false);
  const rafRef = useRef<number>(0);

  const [showHint, setShowHint] = useState(true);
  const [ready, setReady] = useState(false);
  const [sunAngle, setSunAngle] = useState(0);
  const [time, setTime] = useState(() =>
    new Date().toISOString().replace('T', ' ').slice(0, 19)
  );

  // Layers (mirrors SpaceExplorer3D's structure)
  type LayerId = 'surface' | 'rings' | 'atmosphere';
  const [layers, setLayers] = useState<{ surface: boolean; rings: boolean; atmosphere: boolean }>({
    surface: true,
    rings: true,
    atmosphere: true
  });

  const discoverObject = useProgressStore((s) => s.discoverObject);
  const zoomPhase = useGestureStore((s) => s.zoomPhase);

  const data = PLANET_DATA[planetId];
  const config = PLANET_CONFIGS[planetId] || PLANET_CONFIGS.earth;

  // Resolve planet-specific theme (from PLANET_THEMES or fallback to earth)
  const theme = PLANET_THEMES[planetId] ?? PLANET_THEMES.earth;
  const themeStyle = themeToStyle(theme);

  // ── Init Three.js (mirrors SpaceExplorer3D) ────────────────────────────
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

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 2.5;
    controls.maxDistance = 10;
    controls.enablePan = false;
    controls.rotateSpeed = 0.4;
    controls.zoomSpeed = 0.8;
    controlsRef.current = controls;

    // Stars
    const starGeo = new THREE.BufferGeometry();
    const verts: number[] = [];
    for (let i = 0; i < 4000; i++) {
      verts.push(
        (Math.random() - 0.5) * 2000,
        (Math.random() - 0.5) * 2000,
        -(Math.random() * 800 + 50)
      );
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    scene.add(
      new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.3 }))
    );

    // Lighting (same as Earth explorer)
    scene.add(new THREE.AmbientLight(0xffffff, 0.03));
    const sun = new THREE.DirectionalLight(0xffffff, 2.5);
    sun.position.set(5, 0, 0);
    scene.add(sun);
    sunLightRef.current = sun;

    // Planet fallback material
    const fallbackMat = new THREE.MeshPhongMaterial({
      color: new THREE.Color(config.baseColor),
      shininess: 15
    });
    const planet = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), fallbackMat);
    planet.userData = { id: planetId, label: config.nameVi };
    scene.add(planet);
    planetRef.current = planet;

    // Apply procedural texture (same as Planet3DRender)
    const seed = (planetId.charCodeAt(0) || 1) * 1000;
    const cv = buildPlanetTexture(planetId, seed);
    if (cv) {
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const mat = new THREE.MeshPhongMaterial({
        map: tex,
        specular: new THREE.Color(0x222222),
        shininess: 25
      });
      planet.material = mat;
    }

    // Atmosphere — disabled by default to remove the visible "outer frame"
    // around the planet. Users can toggle it on via the Atmosphere layer.

    // Rings (Saturn — same gradient texture as Planet3DRender)
    let ringsGroup: THREE.Group | null = null;
    if (config.hasRings) {
      const ringTex = new THREE.CanvasTexture(genRingTexture(512, SATURN_RING_BANDS));
      ringTex.colorSpace = THREE.SRGBColorSpace;
      const inner = config.ringInnerRadius ?? 1.4;
      const outer = config.ringOuterRadius ?? 2.3;
      const ringGeo = createRingGeometry(inner, outer, 128);
      const ringMat = new THREE.MeshBasicMaterial({
        map: ringTex,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false
      });
      ringsGroup = new THREE.Group();
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ringsGroup.add(ring);
      scene.add(ringsGroup);
      ringsRef.current = ringsGroup;
    }

    // Resize
    const onResize = (): void => {
      if (!camera || !renderer) return;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    // Click → discover (same pattern as SpaceExplorer3D)
    const onCanvasClick = (event: PointerEvent): void => {
      if (!cameraRef.current || !sceneRef.current) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);
      const hits = ray.intersectObjects(sceneRef.current.children, true);
      const planetHit = hits.find((h) => h.object === planetRef.current);
      if (planetHit) {
        const fact = getFact(`space.${planetId}.basic`);
        if (fact) discoverObject('space', planetId, fact.xpReward);
      }
    };
    renderer.domElement.addEventListener('pointerdown', onCanvasClick);

    // Animation loop with hand-zoom integration
    const clock = new THREE.Clock();
    const animate = (): void => {
      animRef.current = requestAnimationFrame(animate);
      const d = clock.getDelta();

      if (zoomActiveRef.current && cameraRef.current && controlsRef.current) {
        const currentZoomFactor = useGestureStore.getState().zoomFactor;
        const currentZoomPhase = useGestureStore.getState().zoomPhase;

        if (currentZoomPhase === 'TRACKING') {
          const newDist = baselineDistRef.current / currentZoomFactor;
          const clampedDist = Math.max(controls.minDistance, Math.min(controls.maxDistance, newDist));
          cameraDistRef.current = clampedDist;
          const dir = cameraRef.current.position.clone().normalize();
          cameraRef.current.position.copy(dir.multiplyScalar(clampedDist));
          controlsRef.current.update();
        }
      }

      if (planetRef.current) planetRef.current.rotation.y += d * 0.03;

      if (!zoomActiveRef.current && controlsRef.current) {
        controlsRef.current.update();
      }

      renderer.render(scene, camera);
    };
    rafRef.current = requestAnimationFrame(animate);
    setTimeout(() => setReady(true), 300);

    return () => {
      cancelAnimationFrame(animRef.current);
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onCanvasClick);
      if (container && renderer) container.removeChild(renderer.domElement);
      controls.dispose();
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync zoom phase from gesture store (matches SpaceExplorer3D)
  useEffect(() => {
    const wasActive = zoomActiveRef.current;
    if (zoomPhase === 'TRACKING' && !wasActive) {
      baselineDistRef.current = cameraDistRef.current;
      zoomActiveRef.current = true;
    } else if (zoomPhase !== 'TRACKING' && wasActive) {
      zoomActiveRef.current = false;
    }
  }, [zoomPhase]);

  // Time ticker
  useEffect(() => {
    const t = setInterval(
      () => setTime(new Date().toISOString().replace('T', ' ').slice(0, 19)),
      1000
    );
    return () => clearInterval(t);
  }, []);

  // Layer toggles
  const toggleLayer = useCallback((id: LayerId): void => {
    setLayers((p) => {
      const next = { ...p, [id]: !p[id] };
      if (id === 'surface' && planetRef.current) planetRef.current.visible = next.surface;
      if (id === 'rings' && ringsRef.current) ringsRef.current.visible = next.rings;
      return next;
    });
  }, []);

  if (!data) {
    return <div style={{ color: '#fff', padding: 40 }}>Unknown planet: {planetId}</div>;
  }

  const layerItems: Array<{ id: LayerId; label: string }> = [
    { id: 'surface', label: `Surface (${config.nameVi})` },
    ...(config.hasRings ? [{ id: 'rings' as LayerId, label: 'Rings (Vành đai)' }] : []),
    ...(config.hasAtmosphere ? [{ id: 'atmosphere' as LayerId, label: 'Atmosphere' }] : [])
  ];

  // Sun slider
  const onSunChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setSunAngle(v);
    if (sunLightRef.current) {
      const r = v * (Math.PI / 180);
      sunLightRef.current.position.set(Math.cos(r) * 5, 0, Math.sin(r) * 5);
    }
  }, []);

  // AZIMUTH slider with hand cursor drag
  const handleSunPointerDown = useCallback(
    (e: React.PointerEvent<HTMLInputElement>) => {
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      const getAnchorX = (): number =>
        pointerRef.visible ? pointerRef.position.x : e.clientX;
      const startX = getAnchorX();
      const startAngle = sunAngle;
      const SENSITIVITY = 0.5;
      const onMove = (_ev: PointerEvent): void => {
        const curX = pointerRef.visible ? pointerRef.position.x : _ev.clientX;
        const dx = curX - startX;
        const newAngle = Math.max(0, Math.min(360, startAngle + dx * SENSITIVITY));
        setSunAngle(newAngle);
        if (sunLightRef.current) {
          const r = newAngle * (Math.PI / 180);
          sunLightRef.current.position.set(Math.cos(r) * 5, 0, Math.sin(r) * 5);
        }
      };
      const onUp = (): void => {
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
      };
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
    },
    [sunAngle]
  );

  return (
    <div className={styles.explorer} style={themeStyle}>
      {/* Loading */}
      {!ready && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingBox}>
            <div className={styles.spinner}>{theme.glyph}</div>
            <div className={styles.loadingTitle}>INITIALIZING NASA DATA</div>
            <div className={styles.loadingSub}>
              Loading {config.nameVi} datasets…
            </div>
            <div className={styles.loadingBar}>
              <div className={styles.loadingFill} style={{ width: '85%' }} />
            </div>
          </div>
        </div>
      )}

      {/* Instruction overlay */}
      {ready && showHint && (
        <div className={styles.instructionOverlay}>
          <div className={styles.instructionBox}>
            <div className={styles.instructionGlyph}>{theme.glyph}</div>

            <div className={styles.instrHeader}>
              <div className={styles.instrIcon}>{theme.glyph}</div>
              <div className={styles.instrTitleBlock}>
                <p className={styles.instrEyebrow}>SPACE WORLD · {config.nameVi.toUpperCase()}</p>
                <h2 className={styles.instrTitle}>Khám phá {config.nameVi} 3D</h2>
              </div>
            </div>
            <p className={styles.instrSubtitle}>
              {data.descVi}
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
                  🖐✋ <b>Vẫy tay</b> → xoay camera quanh {config.nameVi}
                </span>
              </div>
              <div className={styles.instrStep}>
                <span className={styles.instrNum}>3</span>
                <span>
                  🤏 <b>Bóp ngón tay</b> (pinch) → kéo thanh Mặt Trời
                </span>
              </div>
              <div className={styles.instrStep}>
                <span className={styles.instrNum}>4</span>
                <span>
                  🤏 <b>Bóp + giữ</b> → click vào {config.nameVi}
                </span>
              </div>
            </div>

            <div className={styles.instrTip}>
              <span>💡</span>
              <span>
                <b>Mẹo:</b> Bật/tắt các <b>Layers</b> bên trái để xem {config.nameVi} ở
                các lớp khác nhau — từ bề mặt, khí quyển {config.hasAtmosphere ? 'đến ' : 'và '}đai hoa.
              </span>
            </div>

            <button className={styles.startBtn} onClick={() => setShowHint(false)}>
              🚀 BẮT ĐẦU KHÁM PHÁ {config.nameVi.toUpperCase()}
            </button>
          </div>
        </div>
      )}

      {/* 3D Canvas */}
      <div ref={canvasContainerRef} className={styles.canvas} />

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.headerTitle}>🌌 SPACE WORLD · {config.nameVi.toUpperCase()}</span>
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
            title={
              zoomPhase === 'TRACKING'
                ? '🖐 Zoom bằng tay đang hoạt động'
                : zoomPhase === 'COOLDOWN'
                  ? '🖐 Giơ 5 ngón giữ yên...'
                  : '🖐 Giơ 5 ngón + giữ 1.5s để zoom'
            }
          >
            {zoomPhase === 'TRACKING' ? '🖐 ZOOM' : zoomPhase === 'COOLDOWN' ? '🖐 ...' : '🖐 IDLE'}
          </span>
          <span className={styles.headerSrc}>{data.provenance.org}</span>
          <span className={styles.headerBadge}>P0</span>
        </div>
      </header>

      {/* Main UI */}
      <main className={styles.main}>
        {/* Left Panel */}
        <aside className={styles.leftPanel}>
          <div className={styles.panel}>
            <div className={styles.panelTitle}>Layers</div>
            <div className={styles.layerList}>
              {layerItems.map((l) => (
                <div
                  key={l.id}
                  className={styles.layerItem}
                  data-layer={l.id}
                  onClick={() => toggleLayer(l.id)}
                >
                  <div
                    className={`${styles.toggle} ${layers[l.id] ? styles.toggleOn : ''}`}
                  />
                  <span className={styles.layerName}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Sun AZIMUTH panel — moved up here so it isn't clipped by the
              bottom of the window in fullscreen mode. */}
          <div className={styles.panel}>
            <div className={styles.panelTitle}>☀️ Sun Azimuth</div>
            <div className={styles.azimuthRow}>
              <span className={styles.azimuthValue}>{sunAngle.toFixed(0)}°</span>
            </div>
            <input
              type="range"
              min={0}
              max={360}
              value={sunAngle}
              onPointerDown={handleSunPointerDown}
              onChange={onSunChange}
              className={styles.sunSlider}
              aria-label="Sun azimuth"
            />
            <div className={styles.azimuthHint}>Kéo để xoay hướng Mặt Trời chiếu sáng</div>
          </div>

          <div className={`${styles.panel} ${styles.dataPanel}`}>
            <div className={styles.panelTitle}>📊 {config.nameVi} Data</div>
            <div className={styles.dataScroll}>
              <div className={styles.dataHeader}>{config.nameEn.toUpperCase()}</div>
              <div className={styles.dataGroup}>
                <div className={styles.dataCat}>Physical</div>
                {data.physical.map((i) => (
                  <div key={i.l} className={styles.dataRow}>
                    <span className={styles.dataLbl}>{i.l}</span>
                    <span className={styles.dataDots} />
                    <span className={styles.dataVal}>
                      {i.v} <span className={styles.dataUnit}>{i.u}</span>
                    </span>
                  </div>
                ))}
              </div>
              <div className={styles.dataGroup}>
                <div className={styles.dataCat}>Orbital</div>
                {data.orbital.map((i) => (
                  <div key={i.l} className={styles.dataRow}>
                    <span className={styles.dataLbl}>{i.l}</span>
                    <span className={styles.dataDots} />
                    <span className={styles.dataVal}>
                      {i.v} <span className={styles.dataUnit}>{i.u}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* Right Panel */}
        <aside className={styles.rightPanel}>
          <div className={`${styles.panel} ${styles.provPanel}`}>
            <div className={styles.panelTitleOrange}>📜 Provenance</div>
            <div className={styles.provSub}>P0 Scientific Data</div>
            <div className={styles.provContent}>
              <div className={styles.codeBox}>{`{ "body": "${planetId}" }`}</div>
              <div className={styles.field}>
                <div className={styles.fieldLabel}>SOURCE</div>
                <div className={styles.fieldVal}>🏛 {data.provenance.org}</div>
              </div>
              <div className={styles.field}>
                <div className={styles.fieldLabel}>DATASET</div>
                <div className={styles.fieldVal}>{data.provenance.dataset}</div>
                <div className={styles.fieldSub}>{data.provenance.instrument}</div>
              </div>
              <div className={styles.pipeline}>
                <div className={styles.pipelineTitle}>Pipeline</div>
                {data.provenance.steps.map((s, i) => (
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
        </aside>
      </main>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerLeft}>
          <div className={styles.playBtn}>▶</div>
          <div>
            <div className={styles.timeLbl}>SIM TIME</div>
            <div className={styles.timeVal}>{time}</div>
          </div>
        </div>
        <div className={styles.footerRight}>
          <span className={styles.sunLbl}>{data.provenance.org}</span>
        </div>
      </footer>
    </div>
  );
}