/**
 * SpaceExplorer3D — Scientific 3D Earth Engine.
 * Based on NASA data visualization with real textures.
 *
 * Hand-gesture interaction:
 * - Zoom (5-finger open + steady → ARMED): hand depth → camera distance
 *   via useGestureStore zoomFactor / zoomPhase
 * - Drag (pinch): synthetic pointer events → OrbitControls
 * - Click (dwell/pinch): synthetic pointerdown → raycasting → discovery
 * - AZIMUTH slider: drag via hand cursor (pointerdown + pointermove)
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PLANET_THEMES, themeToStyle } from './planetTheme.js';
import { getFact } from '@renderer/airscience/engines/contentEngine.js';
import { useProgressStore } from '@renderer/airscience/stores/progressStore.js';
import { useGestureStore } from '@renderer/stores/gestureStore.js';
import { pointerRef } from '@renderer/stores/pointerStore.js';
import styles from './SpaceExplorer3D.module.css';

export function SpaceExplorer3D(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const earthRef = useRef<THREE.Mesh | null>(null);
  const nightRef = useRef<THREE.Mesh | null>(null);
  const cloudRef = useRef<THREE.Mesh | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animRef = useRef<number>(0);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const nightShaderRef = useRef<THREE.ShaderMaterial | null>(null);

  // Camera zoom state — 4.5 fits the globe cleanly within the fullscreen canvas
  // with margin around the left/right panels and the body selector at top.
  const cameraDistRef = useRef<number>(4.5);
  const baselineDistRef = useRef<number>(4.5);
  const zoomActiveRef = useRef<boolean>(false);
  const rafRef = useRef<number>(0);

  const [loading, setLoading] = useState(0);
  const [ready, setReady] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [sunAngle, setSunAngle] = useState(0);
  const [time, setTime] = useState(() =>
    new Date().toISOString().replace('T', ' ').slice(0, 19)
  );

  // Layers
  const [layers, setLayers] = useState({
    surface: true,
    clouds: true,
    night: true,
    topo: true
  });
  const [selectedLayer, setSelectedLayer] = useState<
    'surface' | 'clouds' | 'night' | 'topo'
  >('surface');

  const discoverObject = useProgressStore((s) => s.discoverObject);

  // Subscribe to gesture store for zoom + phase
  const zoomPhase = useGestureStore((s) => s.zoomPhase);
  const zoomFactor = useGestureStore((s) => s.zoomFactor);

  // Provenance data
  const provenance: Record<
    string,
    { org: string; dataset: string; instrument: string; steps: string[] }
  > = {
    surface: {
      org: 'NASA Visible Earth',
      dataset: 'Blue Marble NG',
      instrument: 'MODIS',
      steps: ['Validate metadata', 'Equirectangular projection', 'WebP 2048×1024']
    },
    clouds: {
      org: 'NASA Earth Observatory',
      dataset: 'Global Cloud Composite',
      instrument: 'VIIRS',
      steps: ['Grayscale alpha conversion', 'WebP encoding']
    },
    night: {
      org: 'NASA Goddard',
      dataset: 'Black Marble 2016',
      instrument: 'VIIRS Day/Night Band',
      steps: ['City light isolation', 'Custom shader blend']
    },
    topo: {
      org: 'NASA JPL',
      dataset: 'SRTM',
      instrument: 'C-band Radar',
      steps: ['Normal map generation', 'Scale validation']
    }
  };

  const earthMetrics = [
    {
      cat: 'Physical',
      items: [
        { l: 'Mean Radius', v: '6,371', u: 'km' },
        { l: 'Mass', v: '5.972×10²⁴', u: 'kg' },
        { l: 'Gravity', v: '9.81', u: 'm/s²' },
        { l: 'Density', v: '5.51', u: 'g/cm³' }
      ]
    },
    {
      cat: 'Orbital',
      items: [
        { l: 'Semi-major', v: '149.6M', u: 'km' },
        { l: 'Eccentricity', v: '0.0167', u: '' },
        { l: 'Period', v: '365.26', u: 'days' },
        { l: 'Axial Tilt', v: '23.44', u: '°' }
      ]
    }
  ];

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

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // OrbitControls: receives synthetic pointer events from InteractionDispatcher
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

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.03));
    const sun = new THREE.DirectionalLight(0xffffff, 2.5);
    sun.position.set(5, 0, 0);
    scene.add(sun);
    sunLightRef.current = sun;

    // Earth fallback material
    const fallbackMat = new THREE.MeshPhongMaterial({ color: 0x2266aa, shininess: 15 });
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), fallbackMat);
    earth.userData = { id: 'earth', label: 'Trái Đất' };
    scene.add(earth);
    earthRef.current = earth;

    // Texture loader + progress tracking
    let loaded = 0;
    const total = 4;
    const texLoader = new THREE.TextureLoader();
    const onTex = (): void => {
      loaded++;
      setLoading((loaded / total) * 100);
      if (loaded >= total) setTimeout(() => setReady(true), 300);
    };

    let albedo: THREE.Texture | null = null;
    let bump: THREE.Texture | null = null;
    let clouds: THREE.Texture | null = null;
    let night: THREE.Texture | null = null;

    const finalizeEarth = (): void => {
      if (!earthRef.current) return;
      const mat = new THREE.MeshPhongMaterial({
        map: albedo ?? undefined,
        bumpMap: bump ?? undefined,
        bumpScale: 0.02,
        specular: new THREE.Color(0x222222),
        shininess: 25
      });
      earthRef.current.material = mat;
    };

    texLoader.load(
      'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
      (t) => {
        albedo = t;
        onTex();
        finalizeEarth();
      },
      undefined,
      onTex
    );
    texLoader.load(
      'https://unpkg.com/three-globe/example/img/earth-topology.png',
      (t) => {
        bump = t;
        onTex();
        finalizeEarth();
      },
      undefined,
      onTex
    );
    texLoader.load(
      'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_clouds_1024.png',
      (t) => {
        clouds = t;
        onTex();
        if (cloudRef.current) {
          (cloudRef.current.material as THREE.MeshLambertMaterial).map = t;
          (cloudRef.current.material as THREE.MeshLambertMaterial).needsUpdate = true;
        }
      },
      undefined,
      onTex
    );
    texLoader.load(
      'https://unpkg.com/three-globe/example/img/earth-night.jpg',
      (t) => {
        night = t;
        onTex();
        if (nightShaderRef.current) nightShaderRef.current.uniforms.nightTexture.value = t;
      },
      undefined,
      onTex
    );

    // Clouds mesh
    const cloudMat = new THREE.MeshLambertMaterial({
      transparent: true,
      opacity: 0.6,
      depthWrite: false
    });
    const cloudMesh = new THREE.Mesh(new THREE.SphereGeometry(1.008, 64, 64), cloudMat);
    scene.add(cloudMesh);
    cloudRef.current = cloudMesh;

    // Night shader
    const nightMat = new THREE.ShaderMaterial({
      uniforms: {
        nightTexture: { value: night },
        sunDirection: { value: new THREE.Vector3(1, 0, 0) }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vN;
        void main() {
          vUv = uv;
          vN = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D nightTexture;
        uniform vec3 sunDirection;
        varying vec2 vUv;
        varying vec3 vN;
        void main() {
          float d = dot(vN, sunDirection);
          float i = smoothstep(-0.2, 0.05, -d);
          vec4 t = texture2D(nightTexture, vUv);
          gl_FragColor = vec4(t.rgb * i * 2.0, t.r * i);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending
    });
    const nightMesh = new THREE.Mesh(new THREE.SphereGeometry(1.002, 64, 64), nightMat);
    scene.add(nightMesh);
    nightRef.current = nightMesh;
    nightShaderRef.current = nightMat;

    // Atmosphere — disabled by default; can be re-enabled via Layers toggle.
    // The shader was the source of the visible "outer frame" around the globe
    // and is no longer added at init. Users turn it on explicitly if they want it.

    // Resize
    const onResize = (): void => {
      if (!camera || !renderer) return;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    // Click handler (also fires on synthetic pointer events from InteractionDispatcher)
    const onCanvasClick = (event: PointerEvent): void => {
      if (!cameraRef.current || !sceneRef.current) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);
      const hits = ray.intersectObjects(sceneRef.current.children, true);
      const earthHit = hits.find((h) => h.object === earthRef.current);
      if (earthHit) {
        const fact = getFact('space.earth.basic');
        if (fact) discoverObject('space', 'earth', fact.xpReward);
      }
    };
    renderer.domElement.addEventListener('pointerdown', onCanvasClick);

    // Animate — separate RAF for gesture-driven camera zoom
    const clock = new THREE.Clock();
    const animate = (): void => {
      animRef.current = requestAnimationFrame(animate);
      const d = clock.getDelta();

      // Apply hand-driven zoom from gesture store every frame
      if (zoomActiveRef.current && cameraRef.current && controlsRef.current) {
        // Read zoomFactor directly from store (every frame, no React re-render needed)
        const currentZoomFactor = useGestureStore.getState().zoomFactor;
        const currentZoomPhase = useGestureStore.getState().zoomPhase;

        if (currentZoomPhase === 'TRACKING') {
          // zoomFactor: >1 = hand closer = zoom IN (camera moves closer to earth)
          const newDist = baselineDistRef.current / currentZoomFactor;
          const clampedDist = Math.max(controls.minDistance, Math.min(controls.maxDistance, newDist));
          cameraDistRef.current = clampedDist;

          // Set camera position on the same axis it originally was
          const dir = cameraRef.current.position.clone().normalize();
          cameraRef.current.position.copy(dir.multiplyScalar(clampedDist));
          controlsRef.current.update();
        }
      }

      if (earthRef.current) earthRef.current.rotation.y += d * 0.03;
      if (nightRef.current) nightRef.current.rotation.y += d * 0.03;
      if (cloudRef.current) cloudRef.current.rotation.y += d * 0.04;

      // Only update controls if not in hand-zoom mode (avoid conflict)
      if (!zoomActiveRef.current && controlsRef.current) {
        controlsRef.current.update();
      }

      if (nightShaderRef.current && sunLightRef.current) {
        nightShaderRef.current.uniforms.sunDirection.value
          .copy(sunLightRef.current.position)
          .normalize();
      }
      renderer.render(scene, camera);
    };
    rafRef.current = requestAnimationFrame(animate);

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

  // ── Sync zoom phase from gesture store to camera ─────────────────────────
  useEffect(() => {
    const wasActive = zoomActiveRef.current;

    if (zoomPhase === 'TRACKING' && !wasActive) {
      // Activation: lock baseline distance
      baselineDistRef.current = cameraDistRef.current;
      zoomActiveRef.current = true;
    } else if (zoomPhase !== 'TRACKING' && wasActive) {
      // Deactivation: release camera back to OrbitControls
      zoomActiveRef.current = false;
    }
  }, [zoomPhase]);

  // ── Time ticker ─────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(
      () => setTime(new Date().toISOString().replace('T', ' ').slice(0, 19)),
      1000
    );
    return () => clearInterval(t);
  }, []);

  // ── Layer toggles ────────────────────────────────────────────────────────
  const toggleLayer = useCallback(
    (id: 'surface' | 'clouds' | 'night' | 'topo'): void => {
      setLayers((p) => {
        const next = { ...p, [id]: !p[id] };
        if (id === 'clouds' && cloudRef.current) cloudRef.current.visible = next.clouds;
        if (id === 'night' && nightRef.current) nightRef.current.visible = next.night;
        if (id === 'topo' && earthRef.current) {
          const mat = earthRef.current.material as THREE.MeshPhongMaterial;
          if (mat) mat.bumpScale = next.topo ? 0.02 : 0;
        }
        return next;
      });
    },
    []
  );

  // ── Sun slider ──────────────────────────────────────────────────────────
  const onSunChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    const v = parseFloat(e.target.value);
    setSunAngle(v);
    if (sunLightRef.current) {
      const r = v * (Math.PI / 180);
      sunLightRef.current.position.set(Math.cos(r) * 5, 0, Math.sin(r) * 5);
    }
  }, []);

  // ── AZIMUTH slider drag via hand pointer ────────────────────────────────
  const handleSunPointerDown = useCallback(
    (e: React.PointerEvent<HTMLInputElement>) => {
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);

      // Use hand cursor position as anchor if visible, otherwise raw event position
      const getAnchorX = (): number =>
        pointerRef.visible ? pointerRef.position.x : e.clientX;

      const startX = getAnchorX();
      const startAngle = sunAngle;

      // pixels → degrees (1px = 0.5°)
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

  const prov = provenance[selectedLayer];

  return (
    <div className={styles.explorer} ref={containerRef} style={themeToStyle(PLANET_THEMES.earth)}>
      {/* Loading */}
      {!ready && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingContent}>
            <div className={styles.satellite}>🛰️</div>
            <div className={styles.loadingTitle}>INITIALIZING NASA DATA</div>
            <div className={styles.loadingSub}>Fetching telemetry datasets...</div>
            <div className={styles.loadingBar}>
              <div className={styles.loadingBarFill} style={{ width: `${loading}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Instruction overlay */}
      {ready && showHint && (
        <div className={styles.instructionOverlay}>
          <div className={styles.instructionContent}>
            <div className={styles.instructionGlyph}>🌍</div>

            <div className={styles.instructionHeader}>
              <div className={styles.instructionIcon}>🌍</div>
              <div className={styles.instructionTitleBlock}>
                <p className={styles.instructionEyebrow}>SPACE WORLD · EXPLORE</p>
                <h2 className={styles.instructionTitle}>Khám phá Trái Đất 3D</h2>
              </div>
            </div>
            <p className={styles.instructionSubtitle}>
              Dùng tay điều khiển quả cầu thời gian thực — dữ liệu trực tiếp từ NASA.
            </p>

            <div className={styles.instructionSteps}>
              <div className={styles.instructionStep}>
                <span className={styles.stepNumber}>1</span>
                <span>
                  🖐 Giơ <b>5 ngón tay</b> + giữ yên 1.5s → <b>zoom bằng tay</b>
                </span>
              </div>
              <div className={styles.instructionStep}>
                <span className={styles.stepNumber}>2</span>
                <span>
                  🖐✋ <b>Vẫy tay</b> → xoay camera quanh Trái Đất
                </span>
              </div>
              <div className={styles.instructionStep}>
                <span className={styles.stepNumber}>3</span>
                <span>
                  🤏 <b>Bóp ngón tay</b> (pinch) → kéo thanh Mặt Trời ở dưới
                </span>
              </div>
              <div className={styles.instructionStep}>
                <span className={styles.stepNumber}>4</span>
                <span>
                  🤏 <b>Bóp + giữ</b> → chạm vào Trái Đất để nhận thông tin
                </span>
              </div>
            </div>

            <div className={styles.instructionTip}>
              <span>💡</span>
              <span>
                <b>Mẹo:</b> Di chuyển tay ra xa/một gần camera để zoom — bạn sẽ thấy mây,
                ánh đèn thành phố về đêm và địa hình núi non chi tiết hơn.
              </span>
            </div>

            <button className={styles.startBtn} onClick={() => setShowHint(false)}>
              🚀 BẮT ĐẦU KHÁM PHÁ TRÁI ĐẤT
            </button>
          </div>
        </div>
      )}

      {/* 3D Canvas */}
      <div ref={canvasContainerRef} className={styles.canvas} />

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.title}>🌌 SPACE WORLD</span>
          <div className={styles.divider} />
          <span className={styles.integrityPill}>
            <span className={styles.integrityDot} />
            DATA INTEGRITY
          </span>
        </div>
        <div className={styles.headerRight}>
          {/* Zoom phase indicator */}
          <span
            className={styles.p0Badge}
            style={{
              background:
                zoomPhase === 'TRACKING'
                  ? 'rgba(74, 222, 128, 0.18)'
                  : zoomPhase === 'COOLDOWN'
                    ? 'rgba(251, 191, 36, 0.18)'
                    : 'rgba(107, 114, 128, 0.18)',
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
          <span className={styles.sourceInfo}>
            <span className={styles.sourceLabel}>SRC:</span>
            <span className={styles.sourceValue}>NASA PDS</span>
          </span>
          <span className={styles.p0Badge}>P0</span>
        </div>
      </header>

      {/* Main UI */}
      <main className={styles.main}>
        {/* Left Panel */}
        <aside className={styles.leftPanel}>
          <div className={styles.panel}>
            <div className={styles.panelTitle}>Layers</div>
            <div className={styles.layerList}>
              {(['surface', 'clouds', 'night', 'topo'] as const).map((id) => (
                <div
                  key={id}
                  className={styles.layerItem}
                  data-layer={id}
                  onClick={() => {
                    toggleLayer(id);
                    setSelectedLayer(id);
                  }}
                >
                  <div
                    className={`${styles.toggle} ${layers[id] ? styles.toggleOn : ''}`}
                  />
                  <span className={styles.layerName}>
                    {id === 'surface'
                      ? 'Surface (Blue Marble)'
                      : id === 'clouds'
                        ? 'Clouds'
                        : id === 'night'
                          ? 'Night Lights'
                          : 'Topography'}
                  </span>
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
            <div className={styles.panelTitle}>📊 Earth Data</div>
            <div className={styles.dataScroll}>
              <div className={styles.dataHeader}>EARTH</div>
              {earthMetrics.map((g) => (
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

        {/* Right Panel */}
        <aside className={styles.rightPanel}>
          <div className={`${styles.panel} ${styles.provPanel}`}>
            <div className={styles.panelTitleOrange}>📜 Provenance</div>
            <div className={styles.provSub}>P0 Scientific Data</div>
            <div className={styles.provContent}>
              <div className={styles.codeBox}>{`{ "layer": "${selectedLayer}" }`}</div>
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
        </aside>
      </main>

      {/* Footer — SIM TIME only (AZIMUTH moved to left panel) */}
      <footer className={styles.footer}>
        <div className={styles.footerLeft}>
          <div className={styles.playBtn}>▶</div>
          <div>
            <div className={styles.timeLbl}>SIM TIME</div>
            <div className={styles.timeVal}>{time}</div>
          </div>
        </div>
        <div className={styles.footerRight}>
          <span className={styles.sunLbl}>NASA PDS · Realtime</span>
        </div>
      </footer>
    </div>
  );
}
