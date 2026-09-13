/**
 * Planet3D — realistic 3D planet viewer with procedural NASA-quality textures.
 * 
 * Features:
 * - Realistic procedural textures per planet type
 * - Proper lighting (ambient + directional + rim light)
 * - Atmospheric glow for Earth
 * - Saturn rings with proper material
 * - Sun with corona glow effect
 * - Auto-rotation when not interacted
 */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import styles from './Planet3D.module.css';

// Planet configuration with realistic NASA-inspired colors
const PLANET_CONFIGS: Record<string, {
  baseColor: string;
  highlightColor: string;
  shadowColor: string;
  roughness: number;
  metalness: number;
  hasAtmosphere?: boolean;
  atmosphereColor?: string;
  hasRings?: boolean;
  ringColor?: string;
  emissive?: number;
  emissiveIntensity?: number;
  noiseScale: number;
  detailLevel: number;
}> = {
  sun: {
    baseColor: '#fdb813',
    highlightColor: '#fff4d6',
    shadowColor: '#d97e1a',
    roughness: 1,
    metalness: 0,
    emissive: 0xffaa00,
    emissiveIntensity: 1.2,
    noiseScale: 0.15,
    detailLevel: 2
  },
  mercury: {
    baseColor: '#8c7853',
    highlightColor: '#a89070',
    shadowColor: '#5a4a35',
    roughness: 0.95,
    metalness: 0.1,
    noiseScale: 0.3,
    detailLevel: 3
  },
  venus: {
    baseColor: '#e8c48a',
    highlightColor: '#f5d8a8',
    shadowColor: '#c9a060',
    roughness: 0.7,
    metalness: 0.0,
    noiseScale: 0.2,
    detailLevel: 2
  },
  earth: {
    baseColor: '#2f6a9d',
    highlightColor: '#5ba3e0',
    shadowColor: '#1a4a7a',
    roughness: 0.6,
    metalness: 0.2,
    hasAtmosphere: true,
    atmosphereColor: '#6aa3ff',
    noiseScale: 0.25,
    detailLevel: 3
  },
  moon: {
    baseColor: '#dfe2e8',
    highlightColor: '#f0f2f5',
    shadowColor: '#9aa0a8',
    roughness: 0.9,
    metalness: 0.05,
    noiseScale: 0.35,
    detailLevel: 3
  },
  mars: {
    baseColor: '#c1440e',
    highlightColor: '#e06030',
    shadowColor: '#8a2808',
    roughness: 0.95,
    metalness: 0.0,
    noiseScale: 0.28,
    detailLevel: 3
  },
  jupiter: {
    baseColor: '#d8ca9d',
    highlightColor: '#f0e8d0',
    shadowColor: '#a89870',
    roughness: 0.8,
    metalness: 0.1,
    noiseScale: 0.18,
    detailLevel: 2
  },
  saturn: {
    baseColor: '#fad5a5',
    highlightColor: '#fff0d8',
    shadowColor: '#d0a070',
    roughness: 0.7,
    metalness: 0.1,
    hasRings: true,
    ringColor: '#e8d8b8',
    noiseScale: 0.15,
    detailLevel: 2
  },
  uranus: {
    baseColor: '#4fd0e7',
    highlightColor: '#80e8ff',
    shadowColor: '#30a0c0',
    roughness: 0.5,
    metalness: 0.3,
    noiseScale: 0.12,
    detailLevel: 1
  },
  neptune: {
    baseColor: '#4b70dd',
    highlightColor: '#7090f0',
    shadowColor: '#3050a8',
    roughness: 0.5,
    metalness: 0.3,
    noiseScale: 0.14,
    detailLevel: 1
  }
};

// Simplex-like noise function
function createNoise(ctx: CanvasRenderingContext2D, width: number, height: number, scale: number, detailLevel: number): void {
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;
  
  // Generate multi-octave noise
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      
      // Spherical mapping - convert to lat/lon
      const u = x / width;
      const v = y / height;
      const theta = u * Math.PI * 2;
      const phi = v * Math.PI;
      
      // 3D coordinates on sphere
      const sx = Math.sin(phi) * Math.cos(theta);
      const sy = Math.sin(phi) * Math.sin(theta);
      const sz = Math.cos(phi);
      
      // Multi-octave noise
      let noise = 0;
      let amplitude = 1;
      let frequency = scale;
      let maxValue = 0;
      
      for (let i = 0; i < detailLevel; i++) {
        const nx = Math.floor(sx * frequency);
        const ny = Math.floor(sy * frequency);
        const nz = Math.floor(sz * frequency);
        
        // Simple hash-based noise
        const hash = Math.sin(nx * 12.9898 + ny * 78.233 + nz * 37.719) * 43758.5453;
        const n = (hash - Math.floor(hash)) * 2 - 1;
        
        noise += n * amplitude;
        maxValue += amplitude;
        
        amplitude *= 0.5;
        frequency *= 2;
      }
      
      noise = (noise / maxValue + 1) / 2; // Normalize to 0-1
      data[idx] = Math.floor(noise * 255);
      data[idx + 1] = Math.floor(noise * 255);
      data[idx + 2] = Math.floor(noise * 255);
      data[idx + 3] = 255;
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
}

interface Planet3DProps {
  /** Planet type - maps to planet configuration */
  type: string;
  /** Size in pixels */
  size?: number;
  /** Auto-rotate the planet */
  autoRotate?: boolean;
  /** Allow user interaction to rotate */
  allowInteraction?: boolean;
}

export function Planet3D({
  type,
  size = 300,
  autoRotate = true,
  allowInteraction = true
}: Planet3DProps): JSX.Element {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    planet: THREE.Mesh;
    rings?: THREE.Mesh;
    atmosphere?: THREE.Mesh;
    corona?: THREE.Mesh;
    isDragging: boolean;
    previousMousePosition: { x: number; y: number };
    animationId: number;
  }>();

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const config = PLANET_CONFIGS[type] || PLANET_CONFIGS.earth;

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.z = 3;

    // Renderer with transparency
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    // Lighting setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
    scene.add(ambientLight);

    // Main directional light (simulating sun)
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.4);
    sunLight.position.set(5, 3, 5);
    scene.add(sunLight);

    // Rim light for depth
    const rimLight = new THREE.DirectionalLight(0x4488ff, 0.25);
    rimLight.position.set(-5, 0, -5);
    scene.add(rimLight);

    // Planet geometry
    const geometry = new THREE.SphereGeometry(1, 64, 64);

    // Generate procedural texture
    const texture = generatePlanetTexture(type, config);
    texture.needsUpdate = true;

    // Material with texture and proper PBR properties
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: config.roughness,
      metalness: config.metalness,
      emissive: config.emissive ? new THREE.Color(config.emissive) : new THREE.Color(0x000000),
      emissiveIntensity: config.emissiveIntensity || 0
    });

    const planet = new THREE.Mesh(geometry, material);
    scene.add(planet);

    // Add atmosphere for Earth-like planets
    if (config.hasAtmosphere) {
      const atmosphereGeometry = new THREE.SphereGeometry(1.06, 64, 64);
      const atmosphereMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(config.atmosphereColor),
        transparent: true,
        opacity: 0.2,
        side: THREE.BackSide
      });
      const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
      scene.add(atmosphere);
    }

    // Add rings for Saturn
    let rings: THREE.Mesh | undefined;
    if (config.hasRings) {
      const ringGeometry = new THREE.RingGeometry(1.3, 2.2, 64);
      const ringTexture = generateRingTexture();
      const ringMaterial = new THREE.MeshBasicMaterial({
        map: ringTexture,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85
      });
      rings = new THREE.Mesh(ringGeometry, ringMaterial);
      rings.rotation.x = Math.PI / 2.2;
      scene.add(rings);
    }

    // Add corona glow for Sun
    let corona: THREE.Mesh | undefined;
    if (type === 'sun') {
      const coronaGeometry = new THREE.SphereGeometry(1.15, 32, 32);
      const coronaMaterial = new THREE.MeshBasicMaterial({
        color: 0xffcc44,
        transparent: true,
        opacity: 0.3,
        side: THREE.BackSide
      });
      corona = new THREE.Mesh(coronaGeometry, coronaMaterial);
      scene.add(corona);
    }

    // Store scene reference
    sceneRef.current = {
      scene,
      camera,
      renderer,
      planet,
      rings,
      atmosphere: config.hasAtmosphere ? scene.children.find(c => c !== planet && c !== sunLight && c !== ambientLight && c !== rimLight) as THREE.Mesh : undefined,
      corona,
      isDragging: false,
      previousMousePosition: { x: 0, y: 0 },
      animationId: 0
    };

    // Animation loop
    const animate = () => {
      sceneRef.current!.animationId = requestAnimationFrame(animate);

      if (autoRotate && !sceneRef.current?.isDragging) {
        planet.rotation.y += 0.005;
        if (rings) rings.rotation.z += 0.002;
        if (corona) corona.rotation.y += 0.003;
      }

      renderer.render(scene, camera);
    };
    animate();

    // Interaction handlers
    if (allowInteraction) {
      const onMouseDown = (e: MouseEvent) => {
        if (!sceneRef.current) return;
        sceneRef.current.isDragging = true;
        sceneRef.current.previousMousePosition = { x: e.clientX, y: e.clientY };
      };

      const onMouseMove = (e: MouseEvent) => {
        if (!sceneRef.current || !sceneRef.current.isDragging) return;
        
        const deltaX = e.clientX - sceneRef.current.previousMousePosition.x;
        const deltaY = e.clientY - sceneRef.current.previousMousePosition.y;
        
        sceneRef.current.planet.rotation.y += deltaX * 0.015;
        sceneRef.current.planet.rotation.x += deltaY * 0.015;
        
        if (sceneRef.current.rings) {
          sceneRef.current.rings.rotation.z += deltaX * 0.008;
        }
        
        sceneRef.current.previousMousePosition = { x: e.clientX, y: e.clientY };
      };

      const onMouseUp = () => {
        if (!sceneRef.current) return;
        sceneRef.current.isDragging = false;
      };

      renderer.domElement.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);

      return () => {
        cancelAnimationFrame(sceneRef.current!.animationId);
        renderer.domElement.removeEventListener('mousedown', onMouseDown);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        mount.removeChild(renderer.domElement);
        geometry.dispose();
        material.dispose();
        texture.dispose();
        if (rings) {
          rings.geometry.dispose();
          (rings.material as THREE.Material).dispose();
        }
        renderer.dispose();
      };
    }

    return () => {
      cancelAnimationFrame(sceneRef.current!.animationId);
      mount.removeChild(renderer.domElement);
      geometry.dispose();
      material.dispose();
      texture.dispose();
      if (rings) {
        rings.geometry.dispose();
        (rings.material as THREE.Material).dispose();
      }
      renderer.dispose();
    };
  }, [type, size, autoRotate, allowInteraction]);

  return (
    <div className={styles.planet3D}>
      <div ref={mountRef} style={{ width: size, height: size }} />
    </div>
  );
}

// Generate realistic planet texture based on planet type
function generatePlanetTexture(type: string, config: typeof PLANET_CONFIGS[string]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const baseColor = hexToRgb(config.baseColor);
  const highlightColor = hexToRgb(config.highlightColor);
  const shadowColor = hexToRgb(config.shadowColor);

  // Base gradient (spherical shading simulation)
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, `rgb(${shadowColor.r}, ${shadowColor.g}, ${shadowColor.b})`);
  gradient.addColorStop(0.3, `rgb(${baseColor.r}, ${baseColor.g}, ${baseColor.b})`);
  gradient.addColorStop(0.5, `rgb(${highlightColor.r}, ${highlightColor.g}, ${highlightColor.b})`);
  gradient.addColorStop(0.7, `rgb(${baseColor.r}, ${baseColor.g}, ${baseColor.b})`);
  gradient.addColorStop(1, `rgb(${shadowColor.r}, ${shadowColor.g}, ${shadowColor.b})`);
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Generate noise overlay for texture detail
  const noiseCanvas = document.createElement('canvas');
  noiseCanvas.width = 512;
  noiseCanvas.height = 256;
  const noiseCtx = noiseCanvas.getContext('2d')!;
  createNoise(noiseCtx, 512, 256, config.noiseScale, config.detailLevel);

  // Apply noise to texture
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.4;
  ctx.drawImage(noiseCanvas, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // Planet-specific enhancements
  switch (type) {
    case 'earth':
      // Add green continents
      ctx.fillStyle = 'rgba(76, 175, 80, 0.5)';
      for (let i = 0; i < 15; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const w = Math.random() * 150 + 50;
        const h = Math.random() * 100 + 30;
        ctx.beginPath();
        ctx.ellipse(x, y, w, h, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      // Add cloud streaks
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      for (let i = 0; i < 25; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const w = Math.random() * 200 + 80;
        const h = Math.random() * 30 + 10;
        ctx.beginPath();
        ctx.ellipse(x, y, w, h, Math.random() * 0.5 - 0.25, 0, Math.PI * 2);
        ctx.fill();
      }
      break;

    case 'mars':
      // Add dark crater spots
      ctx.fillStyle = 'rgba(80, 30, 10, 0.4)';
      for (let i = 0; i < 30; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const r = Math.random() * 20 + 5;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Add polar ice caps
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fillRect(0, 0, canvas.width, 25);
      ctx.fillRect(0, canvas.height - 25, canvas.width, 25);
      break;

    case 'jupiter':
      // Add horizontal bands
      ctx.strokeStyle = 'rgba(180, 140, 100, 0.25)';
      ctx.lineWidth = 15;
      for (let i = 0; i < 20; i++) {
        const y = (i / 20) * canvas.height;
        ctx.beginPath();
        ctx.moveTo(0, y);
        // Add some wave to bands
        for (let x = 0; x < canvas.width; x += 50) {
          const wave = Math.sin(x * 0.02 + i) * 8;
          ctx.lineTo(x, y + wave);
        }
        ctx.stroke();
      }
      // Great Red Spot
      ctx.fillStyle = 'rgba(200, 100, 80, 0.7)';
      ctx.beginPath();
      ctx.ellipse(canvas.width * 0.65, canvas.height * 0.55, 50, 30, 0, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'venus':
      // Thick swirling clouds
      ctx.strokeStyle = 'rgba(220, 180, 120, 0.3)';
      ctx.lineWidth = 20;
      for (let i = 0; i < 15; i++) {
        const y = (i / 15) * canvas.height;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x < canvas.width; x += 30) {
          const wave = Math.sin(x * 0.03 + i * 0.5) * 25;
          ctx.lineTo(x, y + wave);
        }
        ctx.stroke();
      }
      break;

    case 'mercury':
      // Dense craters
      ctx.fillStyle = 'rgba(40, 30, 20, 0.35)';
      for (let i = 0; i < 60; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const r = Math.random() * 15 + 3;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        // Crater rim highlight
        ctx.strokeStyle = 'rgba(180, 160, 130, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      break;

    case 'moon':
      // Dense craters like Mercury but grayer
      ctx.fillStyle = 'rgba(30, 30, 30, 0.3)';
      for (let i = 0; i < 50; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const r = Math.random() * 12 + 2;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Mare (dark patches)
      ctx.fillStyle = 'rgba(100, 100, 110, 0.2)';
      ctx.beginPath();
      ctx.ellipse(canvas.width * 0.3, canvas.height * 0.4, 100, 60, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(canvas.width * 0.6, canvas.height * 0.3, 80, 50, -0.1, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'sun':
      // Solar granulation pattern
      ctx.fillStyle = 'rgba(255, 200, 50, 0.3)';
      for (let i = 0; i < 100; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const r = Math.random() * 8 + 2;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
  }

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// Generate Saturn ring texture
function generateRingTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Create radial gradient for ring bands
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  
  // Multiple ring bands
  for (let r = 50; r < 240; r += 3) {
    const alpha = 0.3 + Math.random() * 0.4;
    const brightness = 180 + Math.random() * 60;
    ctx.fillStyle = `rgba(${brightness}, ${brightness - 20}, ${brightness - 40}, ${alpha})`;
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
    ctx.arc(centerX, centerY, r + 2, 0, Math.PI * 2, true);
    ctx.fill();
  }

  // Add some darker bands
  ctx.fillStyle = 'rgba(100, 80, 60, 0.5)';
  for (let angle = 0; angle < Math.PI * 2; angle += 0.3) {
    const r1 = 60 + Math.random() * 150;
    const r2 = r1 + 5 + Math.random() * 10;
    ctx.beginPath();
    ctx.arc(centerX, centerY, r1, angle, angle + 0.2);
    ctx.arc(centerX, centerY, r2, angle + 0.2, angle, true);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// Helper function to convert hex to RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 128, g: 128, b: 128 };
}
