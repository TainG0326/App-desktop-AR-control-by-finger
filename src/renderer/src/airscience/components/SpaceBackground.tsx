/**
 * ImmersiveSpaceBackground — realistic deep space environment.
 * 
 * Creates the illusion of being inside a starfield with:
 * - Multi-layer parallax starfields (near, mid, far)
 * - Colorful nebula clouds
 * - Milky way band
 * - Twinkling stars with color variations
 * - Shooting stars
 */

import { useEffect, useRef } from 'react';
import styles from './SpaceBackground.module.css';

interface Star {
  x: number;
  y: number;
  size: number;
  brightness: number;
  twinkleSpeed: number;
  twinklePhase: number;
  color: string;
  layer: number; // 0 = far, 1 = mid, 2 = near
}

export function SpaceBackground(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const starsRef = useRef<Star[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const setSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    setSize();
    window.addEventListener('resize', setSize);

    // Initialize stars with multiple layers
    const initStars = (): void => {
      const stars: Star[] = [];
      const colors = [
        'rgba(255, 255, 255,', // white
        'rgba(200, 220, 255,', // blue-white
        'rgba(255, 240, 220,', // warm white
        'rgba(255, 200, 180,', // orange
        'rgba(180, 200, 255,', // blue
        'rgba(220, 180, 255,', // purple
      ];
      
      // Far layer: many tiny stars
      for (let i = 0; i < 600; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 0.8 + 0.2,
          brightness: Math.random() * 0.5 + 0.3,
          twinkleSpeed: Math.random() * 0.001 + 0.0005,
          twinklePhase: Math.random() * Math.PI * 2,
          color: colors[Math.floor(Math.random() * colors.length)],
          layer: 0
        });
      }
      
      // Mid layer: medium stars
      for (let i = 0; i < 200; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 1.5 + 0.8,
          brightness: Math.random() * 0.6 + 0.5,
          twinkleSpeed: Math.random() * 0.002 + 0.001,
          twinklePhase: Math.random() * Math.PI * 2,
          color: colors[Math.floor(Math.random() * colors.length)],
          layer: 1
        });
      }
      
      // Near layer: bright stars
      for (let i = 0; i < 50; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 2.5 + 1.5,
          brightness: Math.random() * 0.5 + 0.7,
          twinkleSpeed: Math.random() * 0.003 + 0.002,
          twinklePhase: Math.random() * Math.PI * 2,
          color: colors[Math.floor(Math.random() * colors.length)],
          layer: 2
        });
      }
      
      starsRef.current = stars;
    };
    initStars();

    // Shooting stars
    interface ShootingStar {
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      maxLife: number;
    }
    const shootingStars: ShootingStar[] = [];
    let lastShootingStar = 0;

    // Frame counter
    let frame = 0;
    const startTime = Date.now();

    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);
      frame++;
      
      // Time-based animation
      const elapsed = (Date.now() - startTime) * 0.001;

      // Clear with deep space gradient background
      const bgGradient = ctx.createRadialGradient(
        canvas.width * 0.5,
        canvas.height * 0.3,
        0,
        canvas.width * 0.5,
        canvas.height * 0.5,
        Math.max(canvas.width, canvas.height)
      );
      bgGradient.addColorStop(0, '#0a0e1f');
      bgGradient.addColorStop(0.3, '#050810');
      bgGradient.addColorStop(1, '#000000');
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Milky way band
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(-0.4);
      ctx.translate(-canvas.width / 2, -canvas.height / 2);
      
      const milkyWayGradient = ctx.createLinearGradient(
        -canvas.width, canvas.height * 0.3,
        canvas.width * 2, canvas.height * 0.7
      );
      milkyWayGradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
      milkyWayGradient.addColorStop(0.5, 'rgba(180, 200, 255, 0.04)');
      milkyWayGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      
      ctx.fillStyle = milkyWayGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Nebula clouds
      const nebulaColors = [
        { x: 0.2, y: 0.3, color: 'rgba(100, 50, 180, 0.08)' },
        { x: 0.8, y: 0.7, color: 'rgba(40, 90, 200, 0.06)' },
        { x: 0.5, y: 0.5, color: 'rgba(180, 60, 120, 0.05)' },
        { x: 0.7, y: 0.2, color: 'rgba(80, 150, 200, 0.07)' },
      ];
      
      nebulaColors.forEach(nebula => {
        const nebulaGradient = ctx.createRadialGradient(
          canvas.width * nebula.x,
          canvas.height * nebula.y,
          0,
          canvas.width * nebula.x,
          canvas.height * nebula.y,
          300
        );
        nebulaGradient.addColorStop(0, nebula.color);
        nebulaGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = nebulaGradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      });
      
      ctx.restore();

      // Draw stars
      starsRef.current.forEach(star => {
        const twinkle = Math.sin(elapsed * star.twinkleSpeed * 100 + star.twinklePhase) * 0.3 + 0.7;
        const alpha = star.brightness * twinkle;
        
        // Far layer stars - just dots
        if (star.layer === 0) {
          ctx.fillStyle = `${star.color}${alpha})`;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
          ctx.fill();
        } 
        // Mid layer stars with slight glow
        else if (star.layer === 1) {
          ctx.fillStyle = `${star.color}${alpha})`;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
          ctx.fill();
          
          // Subtle glow
          const glowGradient = ctx.createRadialGradient(
            star.x, star.y, 0,
            star.x, star.y, star.size * 3
          );
          glowGradient.addColorStop(0, `${star.color}${alpha * 0.3})`);
          glowGradient.addColorStop(1, `${star.color}0)`);
          ctx.fillStyle = glowGradient;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        // Near layer - bright with strong glow
        else {
          // Bright center
          ctx.fillStyle = `${star.color}${Math.min(1, alpha * 1.5)})`;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
          ctx.fill();
          
          // Strong glow
          const glowGradient = ctx.createRadialGradient(
            star.x, star.y, 0,
            star.x, star.y, star.size * 6
          );
          glowGradient.addColorStop(0, `${star.color}${alpha * 0.5})`);
          glowGradient.addColorStop(0.5, `${star.color}${alpha * 0.15})`);
          glowGradient.addColorStop(1, `${star.color}0)`);
          ctx.fillStyle = glowGradient;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size * 6, 0, Math.PI * 2);
          ctx.fill();
          
          // Cross flare for bright stars
          if (star.brightness > 0.8 && Math.random() > 0.7) {
            ctx.strokeStyle = `${star.color}${alpha * 0.5})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(star.x - star.size * 4, star.y);
            ctx.lineTo(star.x + star.size * 4, star.y);
            ctx.moveTo(star.x, star.y - star.size * 4);
            ctx.lineTo(star.x, star.y + star.size * 4);
            ctx.stroke();
          }
        }
      });

      // Shooting stars
      if (frame - lastShootingStar > 300 && Math.random() > 0.95) {
        lastShootingStar = frame;
        shootingStars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height * 0.5,
          vx: -3 - Math.random() * 2,
          vy: 1 + Math.random(),
          life: 60,
          maxLife: 60
        });
      }

      shootingStars.forEach((ss, idx) => {
        ss.x += ss.vx;
        ss.y += ss.vy;
        ss.life--;
        
        const trailLength = 60;
        const trailGradient = ctx.createLinearGradient(
          ss.x, ss.y,
          ss.x - trailLength * ss.vx, ss.y - trailLength * ss.vy
        );
        trailGradient.addColorStop(0, `rgba(255, 255, 255, ${ss.life / ss.maxLife})`);
        trailGradient.addColorStop(0.5, `rgba(255, 255, 255, ${(ss.life / ss.maxLife) * 0.5})`);
        trailGradient.addColorStop(1, `rgba(255, 255, 255, 0)`);
        
        ctx.strokeStyle = trailGradient;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ss.x, ss.y);
        ctx.lineTo(ss.x - trailLength * ss.vx * 0.5, ss.y - trailLength * ss.vy * 0.5);
        ctx.stroke();
        
        // Head
        ctx.fillStyle = `rgba(255, 255, 255, ${ss.life / ss.maxLife})`;
        ctx.beginPath();
        ctx.arc(ss.x, ss.y, 2, 0, Math.PI * 2);
        ctx.fill();
        
        if (ss.life <= 0 || ss.x < 0 || ss.y > canvas.height) {
          shootingStars.splice(idx, 1);
        }
      });

      requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener('resize', setSize);
      cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return (
    <div className={styles.spaceBackground}>
      <canvas ref={canvasRef} className={styles.starfield} />
      <div className={styles.nebulaOverlay} />
      <div className={styles.vignette} />
    </div>
  );
}