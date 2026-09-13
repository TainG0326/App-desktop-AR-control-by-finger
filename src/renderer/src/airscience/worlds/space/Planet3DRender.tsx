/**
 * Planet3DRender - Immersive 3D planet renderer with NASA-quality visuals.
 * 
 * Features:
 * - Real texture support from NASA datasets
 * - Atmospheric scattering for Earth
 * - Saturn rings with proper physics
 * - Sun with corona and solar flare effects
 * - Dynamic lighting with real sun position
 * - Smooth auto-rotation with orbital mechanics
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PLANET_CONFIGS, type PlanetConfig } from './planetConfigs.js';
import {
  buildPlanetTexture,
  genRingTexture,
  createRingGeometry,
  SATURN_RING_BANDS
} from './planetTextures.js';
import styles from './Planet3D.module.css';

/* ─────────────────────────────────────────────────────────────────────────
END PROCEDURAL TEXTURE HELPERS
------------------------------------------------------------------------ */

interface Planet3DRenderProps {
  /** Planet type */
  type: string;
  /** Size in pixels (or use fullscreen mode) */
  size?: number;
  /** Auto-rotate the planet */
  autoRotate?: boolean;
  /** Rotation speed */
  rotationSpeed?: number;
  /** Show orbit path */
  showOrbit?: boolean;
  /** Is this planet selected/focused */
  selected?: boolean;
  /** Custom scale multiplier */
  scale?: number;
  /** Enable orbit animation */
  animateOrbit?: boolean;
  /** Initial orbit angle (radians) */
  initialOrbitAngle?: number;
  /** Fill viewport (fullscreen mode) */
  fullscreen?: boolean;
  /** Enable mouse zoom + orbit (recommended with fullscreen) */
  enableControls?: boolean;
}

export function Planet3DRender({
  type,
  size = 200,
  autoRotate = true,
  rotationSpeed = 0.003,
  showOrbit = false,
  selected = false,
  scale = 1,
  animateOrbit = false,
  initialOrbitAngle = 0,
  fullscreen = false,
  enableControls = false
}: Planet3DRenderProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const planetRef = useRef<THREE.Mesh | null>(null);
  const atmosphereRef = useRef<THREE.Mesh | null>(null);
  const cloudsRef = useRef<THREE.Mesh | null>(null);
  const ringsRef = useRef<THREE.Group | null>(null);
  const orbitGroupRef = useRef<THREE.Group | null>(null);
  const animationRef = useRef<number>(0);
  const orbitAngleRef = useRef(initialOrbitAngle);

  const config = PLANET_CONFIGS[type] || PLANET_CONFIGS.earth;

  // Initialize Three.js scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.z = 4;
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    const renderW = fullscreen ? window.innerWidth : size;
    const renderH = fullscreen ? window.innerHeight : size;
    renderer.setSize(renderW, renderH);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // OrbitControls (fullscreen + enableControls)
    let controls: OrbitControls | null = null;
    if (fullscreen && enableControls) {
      camera.aspect = renderW / renderH;
      camera.updateProjectionMatrix();
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.minDistance = 1.6;
      controls.maxDistance = 12;
      controls.enablePan = false;
      controls.rotateSpeed = 0.5;
      controls.zoomSpeed = 0.8;
    } else {
      camera.aspect = 1;
      camera.updateProjectionMatrix();
    }

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);

    // Sun light (main directional light)
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
    sunLight.position.set(10, 5, 10);
    scene.add(sunLight);

    // Rim light for depth
    const rimLight = new THREE.DirectionalLight(0x4488ff, 0.3);
    rimLight.position.set(-5, 0, -5);
    scene.add(rimLight);

    // Fill light
    const fillLight = new THREE.DirectionalLight(0xffffee, 0.2);
    fillLight.position.set(-3, -2, 3);
    scene.add(fillLight);

    // Create orbit group if animating
    let orbitGroup: THREE.Group | null = null;
    if (animateOrbit) {
      orbitGroup = new THREE.Group();
      scene.add(orbitGroup);
      orbitGroupRef.current = orbitGroup;
    }

    // Planet geometry - high detail sphere
    const geometry = new THREE.SphereGeometry(1, 64, 64);

    // Create material with realistic properties
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(config.baseColor),
      roughness: config.roughness,
      metalness: config.metalness,
      emissive: config.isEmissive ? new THREE.Color(config.emissiveColor || '#ff6600') : new THREE.Color(0x000000),
      emissiveIntensity: config.emissiveIntensity || 0
    });

    const planet = new THREE.Mesh(geometry, material);
    planet.name = 'planet';

    if (animateOrbit && orbitGroup) {
      orbitGroup.add(planet);
    } else {
      scene.add(planet);
    }
    planetRef.current = planet;

    // Add surface detail with procedural noise
    addSurfaceDetail(planet, config);

    // Add atmosphere for planets with atmosphere
    if (config.hasAtmosphere) {
      const atmosphereGeometry = new THREE.SphereGeometry(1 + (config.atmosphereThickness || 0.05), 64, 64);
      const atmosphereMaterial = new THREE.ShaderMaterial({
        uniforms: {
          glowColor: { value: new THREE.Color(config.atmosphereColor || '#6aa3ff') },
          viewVector: { value: new THREE.Vector3(0, 0, 4) }
        },
        vertexShader: `
          uniform vec3 viewVector;
          varying float intensity;
          void main() {
            vec3 vNormal = normalize(normalMatrix * normal);
            vec3 vNormel = normalize(normalMatrix * viewVector);
            intensity = pow(0.7 - dot(vNormal, vNormel), 2.0);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 glowColor;
          varying float intensity;
          void main() {
            vec3 glow = glowColor * intensity;
            gl_FragColor = vec4(glow, intensity * 0.6);
          }
        `,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true
      });
      const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
      planet.add(atmosphere);
      atmosphereRef.current = atmosphere;
    }

    // Add clouds for Earth
    if (config.hasClouds) {
      const cloudGeometry = new THREE.SphereGeometry(1.01, 64, 64);
      const cloudMaterial = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 }
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float time;
          varying vec2 vUv;
          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
          }
          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                       mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
          }
          void main() {
            vec2 uv = vUv * 8.0;
            float n = noise(uv + time * 0.02);
            n += noise(uv * 2.0 + time * 0.03) * 0.5;
            n += noise(uv * 4.0 + time * 0.04) * 0.25;
            n = smoothstep(0.3, 0.7, n);
            gl_FragColor = vec4(1.0, 1.0, 1.0, n * 0.4);
          }
        `,
        transparent: true,
        depthWrite: false
      });
      const clouds = new THREE.Mesh(cloudGeometry, cloudMaterial);
      clouds.name = 'clouds';
      planet.add(clouds);
      cloudsRef.current = clouds;
    }

    // Add rings for Saturn (HTML-style: gradient texture + custom ring geometry)
    if (config.hasRings) {
      const ringsGroup = createSaturnRings(config);
      planet.add(ringsGroup);
      ringsRef.current = ringsGroup;
    }

    // Add ice caps ONLY for Earth (Mars has polar caps baked in texture;
    // Mercury doesn't have real polar caps so skip)
    if (config.id === 'earth') {
      addIceCaps(planet);
    }

    // Great Red Spot is now baked into Jupiter's banded texture — skip mesh-based spot
    if (config.hasGreatRedSpot && config.id !== 'jupiter') {
      addGreatRedSpot(planet);
    }

    // Add corona for Sun
    if (type === 'sun') {
      addSunCorona(planet);
    }

    // Add orbit path if needed
    if (showOrbit && config.orbitRadius) {
      const orbitCurve = new THREE.EllipseCurve(0, 0, config.orbitRadius, config.orbitRadius, 0, 2 * Math.PI, false, 0);
      const orbitPoints = orbitCurve.getPoints(128);
      const orbitGeometry = new THREE.BufferGeometry().setFromPoints(orbitPoints);
      const orbitMaterial = new THREE.LineBasicMaterial({
        color: 0x4488ff,
        transparent: true,
        opacity: 0.2
      });
      const orbitLine = new THREE.Line(orbitGeometry, orbitMaterial);
      orbitLine.rotation.x = Math.PI / 2;
      if (animateOrbit && orbitGroup) {
        orbitGroup.add(orbitLine);
      } else {
        scene.add(orbitLine);
      }
    }

    // Animation loop
    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);

      // Planet rotation
      if (autoRotate && planet) {
        planet.rotation.y += rotationSpeed;
      }

      // Orbit animation
      if (animateOrbit && orbitGroup && config.orbitRadius) {
        orbitAngleRef.current += config.orbitSpeed || 0.001;
        orbitGroup.rotation.y = orbitAngleRef.current;
      }

      // Cloud rotation (slightly faster)
      if (cloudsRef.current && planet) {
        cloudsRef.current.rotation.y += rotationSpeed * 0.8;
      }

      // Ring rotation
      if (ringsRef.current) {
        ringsRef.current.rotation.z += 0.0005;
      }

      // Update atmosphere shader
      if (atmosphereRef.current) {
        const atmosphereMaterial = atmosphereRef.current.material as THREE.ShaderMaterial;
        if (atmosphereMaterial.uniforms && camera) {
          const vector = camera.position.clone().sub(atmosphereRef.current.getWorldPosition(new THREE.Vector3()));
          atmosphereMaterial.uniforms.viewVector.value = vector;
        }
      }

      // Update cloud shader time
      if (cloudsRef.current) {
        const cloudMaterial = cloudsRef.current.material as THREE.ShaderMaterial;
        if (cloudMaterial.uniforms && cloudMaterial.uniforms.time) {
          cloudMaterial.uniforms.time.value = Date.now() * 0.001;
        }
      }

      if (controls) controls.update();

      renderer.render(scene, camera);
    };
    animate();
    setLoaded(true);

    // Resize handler (only for fullscreen)
    const onResize = (): void => {
      if (!fullscreen) return;
      const w = window.innerWidth, h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // Cleanup
    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener('resize', onResize);
      if (controls) controls.dispose();
      container.removeChild(renderer.domElement);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, [type, size, config, autoRotate, rotationSpeed, showOrbit, animateOrbit, initialOrbitAngle, fullscreen, enableControls]);

  // Update scale when prop changes
  useEffect(() => {
    if (planetRef.current) {
      planetRef.current.scale.setScalar(scale);
    }
  }, [scale]);

  return (
    <div
      className={`${styles.planetContainer} ${selected ? styles.selected : ''} ${loaded ? styles.loaded : ''}`}
      style={{
        width: fullscreen ? '100vw' : size,
        height: fullscreen ? '100vh' : size,
        position: fullscreen ? 'fixed' : 'relative',
        top: fullscreen ? 0 : undefined,
        left: fullscreen ? 0 : undefined,
        zIndex: fullscreen ? 1 : undefined
      }}
    >
      <div
        ref={containerRef}
        className={styles.canvas}
        style={fullscreen ? { width: '100vw', height: '100vh' } : undefined}
      />
      {type === 'sun' && <div className={styles.sunGlow} />}
    </div>
  );
}

// Helper functions for planet details

function addSurfaceDetail(planet: THREE.Mesh, config: PlanetConfig): void {
  // Add procedural surface detail based on planet type
  const material = planet.material as THREE.MeshStandardMaterial;

  // EARTH: kept untouched (uses special atmosphere + clouds)
  if (config.id === 'earth') {
    material.roughness = 0.4;
    material.metalness = 0.1;
    return;
  }

  // SUN: emissive only (no canvas texture needed, shader handles it)
  if (config.id === 'sun') return;

  // OTHER PLANETS: apply procedural texture from HTML
  const seed = (config.id.charCodeAt(0) || 1) * 1000;
  const cv = buildPlanetTexture(config.id, seed);
  if (cv) {
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    material.map = tex;
    material.color = new THREE.Color(0xffffff); // pure white so map colors show through
    material.needsUpdate = true;
  }
}

function createSaturnRings(config: PlanetConfig): THREE.Group {
  // Realistic Saturn band colors with Cassini Division gap at ~0.52
  // (palette shared with PlanetExplorer3D via planetTextures.SATURN_RING_BANDS)
  const innerRadius = config.ringInnerRadius || 1.4;
  const outerRadius = config.ringOuterRadius || 2.3;

  const ringTex = new THREE.CanvasTexture(genRingTexture(512, SATURN_RING_BANDS));
  ringTex.colorSpace = THREE.SRGBColorSpace;

  const ringGeo = createRingGeometry(innerRadius, outerRadius, 128);
  const ringMat = new THREE.MeshBasicMaterial({
    map: ringTex,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false
  });
  const ringsGroup = new THREE.Group();
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  ringsGroup.add(ring);

  return ringsGroup;
}

function addIceCaps(planet: THREE.Mesh): void {
  // Add polar ice caps using shader
  const iceCapMaterial = new THREE.ShaderMaterial({
    uniforms: {
      iceColor: { value: new THREE.Color(0xffffff) },
      iceSize: { value: 0.15 }
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 iceColor;
      uniform float iceSize;
      varying vec3 vNormal;
      varying vec3 vPosition;

      void main() {
        float latitude = abs(vPosition.y);
        float ice = smoothstep(1.0 - iceSize * 2.0, 1.0 - iceSize, latitude);
        gl_FragColor = vec4(iceColor, ice * 0.9);
      }
    `,
    transparent: true
  });

  const iceCapGeometry = new THREE.SphereGeometry(1.02, 32, 32);
  const iceCaps = new THREE.Mesh(iceCapGeometry, iceCapMaterial);
  planet.add(iceCaps);
}

function addGreatRedSpot(planet: THREE.Mesh): void {
  // Add Jupiter's Great Red Spot using a textured ellipse
  const spotGeometry = new THREE.CircleGeometry(0.15, 32);
  const spotMaterial = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      varying vec2 vUv;

      void main() {
        vec2 center = vec2(0.5, 0.5);
        vec2 uv = vUv - center;

        // Elliptical shape
        float dist = length(uv * vec2(1.0, 1.5));

        // Swirling effect
        float angle = atan(uv.y, uv.x) + time * 0.5;
        float swirl = sin(angle * 3.0 + dist * 20.0) * 0.1;
        dist += swirl;

        float alpha = smoothstep(0.5, 0.3, dist);

        // Color gradient from center
        vec3 outerColor = vec3(0.9, 0.6, 0.5);
        vec3 innerColor = vec3(0.7, 0.3, 0.2);
        vec3 color = mix(outerColor, innerColor, 1.0 - dist * 2.0);

        gl_FragColor = vec4(color, alpha * 0.8);
      }
    `,
    transparent: true,
    depthWrite: false
  });

  const spot = new THREE.Mesh(spotGeometry, spotMaterial);
  spot.position.set(0.3, 0.1, 0.95);
  spot.rotation.x = -0.2;
  planet.add(spot);

  // Animate the spot
  const animate = () => {
    if (spot.material instanceof THREE.ShaderMaterial) {
      spot.material.uniforms.time.value += 0.016;
    }
    requestAnimationFrame(animate);
  };
  animate();
}

function addSunCorona(planet: THREE.Mesh): void {
  // Add multiple glow layers for realistic sun appearance

  // Inner glow
  const innerGlowGeometry = new THREE.SphereGeometry(1.1, 32, 32);
  const innerGlowMaterial = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 }
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec2 vUv;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      varying vec3 vNormal;
      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      void main() {
        float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);

        // Add flickering
        float flicker = sin(time * 3.0) * 0.05 + 1.0;

        vec3 color = vec3(1.0, 0.8, 0.4) * intensity * flicker;
        gl_FragColor = vec4(color, intensity * 0.5);
      }
    `,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true
  });

  const innerGlow = new THREE.Mesh(innerGlowGeometry, innerGlowMaterial);
  planet.add(innerGlow);

  // Animate glow
  const animate = () => {
    if (innerGlow.material instanceof THREE.ShaderMaterial) {
      innerGlow.material.uniforms.time.value += 0.016;
    }
    requestAnimationFrame(animate);
  };
  animate();
}