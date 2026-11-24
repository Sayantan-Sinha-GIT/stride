'use client';

import React, { useEffect, useRef } from 'react';
import { useTheme } from '../ThemeProvider';

/**
 * Living animated topographic elevation contour field with subtle drifting GPS pulse lines.
 * Pauses animation automatically under `prefers-reduced-motion: reduce`.
 */
export function TopoCanvas({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frameId = 0;
    let time = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const isDark = resolvedTheme === 'dark';
      const lineBase = isDark ? 'rgba(255, 77, 28, ' : 'rgba(209, 56, 14, ';
      const isoBase = isDark ? 'rgba(255, 255, 255, ' : 'rgba(12, 18, 25, ';

      // Draw animated topographic elevation bands
      const bands = 11;
      for (let b = 0; b < bands; b++) {
        const yBase = (h / (bands + 1)) * (b + 1);
        ctx.beginPath();
        for (let x = 0; x <= w; x += 24) {
          const wave =
            Math.sin(x * 0.0045 + time * 0.65 + b * 0.55) * 24 +
            Math.cos(x * 0.009 - time * 0.4 + b * 0.9) * 14;
          const y = yBase + wave;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle =
          b % 3 === 0 ? `${lineBase}0.16)` : `${isoBase}${isDark ? '0.06' : '0.07'})`;
        ctx.lineWidth = b % 3 === 0 ? 1.5 : 1;
        ctx.stroke();
      }

      // Draw drifting pulse dots along key contour ribbons
      if (!reducedMotion) {
        for (let p = 0; p < 3; p++) {
          const b = p * 3;
          const yBase = (h / (bands + 1)) * (b + 1);
          const x = ((time * (65 + p * 22) + p * 280) % (w + 80)) - 40;
          const wave =
            Math.sin(x * 0.0045 + time * 0.65 + b * 0.55) * 24 +
            Math.cos(x * 0.009 - time * 0.4 + b * 0.9) * 14;
          const y = yBase + wave;

          ctx.beginPath();
          ctx.arc(x, y, 3.2, 0, Math.PI * 2);
          ctx.fillStyle = isDark ? 'rgba(255, 77, 28, 0.85)' : 'rgba(209, 56, 14, 0.8)';
          ctx.fill();

          ctx.beginPath();
          ctx.arc(x, y, 10, 0, Math.PI * 2);
          ctx.fillStyle = `${lineBase}0.16)`;
          ctx.fill();
        }
      }

      if (!reducedMotion) {
        time += 0.016;
        frameId = requestAnimationFrame(draw);
      }
    };

    draw();
    return () => {
      window.removeEventListener('resize', resize);
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [resolvedTheme]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
}
