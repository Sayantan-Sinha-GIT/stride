'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useTheme } from '../ThemeProvider';

const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  varying float vElev;
  varying float vDist;

  float terrainHeight(vec2 p, float t) {
    float h = sin(p.x * 0.42 + t * 0.25) * cos(p.y * 0.45 - t * 0.18) * 1.45;
    h += sin(p.x * 0.85 + p.y * 0.55 + t * 0.42) * 0.55;
    vec2 peak = p - vec2(1.5, -0.5);
    h += exp(-dot(peak, peak) / 18.0) * 1.9;
    h += sin(t * 0.9 + p.x * 0.3 + p.y * 0.25) * 0.14;
    return h;
  }

  void main() {
    vec3 pos = position;
    float elev = terrainHeight(pos.xz, uTime);
    pos.y += elev;
    vElev = elev;
    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    vDist = -mvPos.z;
    gl_Position = projectionMatrix * mvPos;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uBaseColor;
  uniform vec3 uRidgeColor;
  uniform vec3 uContourColor;
  uniform float uOpacity;
  varying float vElev;
  varying float vDist;

  void main() {
    float normElev = clamp((vElev + 2.0) / 5.2, 0.0, 1.0);
    vec3 col = mix(uBaseColor, uRidgeColor, pow(normElev, 1.35));
    float contour = abs(fract(vElev * 2.4) - 0.5);
    float contourLine = 1.0 - smoothstep(0.0, 0.075, contour);
    col = mix(col, uContourColor, contourLine * 0.65);
    float fade = 1.0 - smoothstep(12.0, 26.0, vDist);
    gl_FragColor = vec4(col, uOpacity * fade);
  }
`;

/**
 * Interactive GPU-driven WebGL 3D topographic elevation terrain & glowing GPS telemetry ribbon.
 * Runs displacement + hypsometric contour shading on GPU, pauses offscreen, and adapts segments for mobile 60fps.
 */
export function Terrain3DCanvas({ className = '' }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isMobile = window.innerWidth < 768;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !isMobile, powerPreference: 'high-performance' });
    } catch {
      return;
    }

    const width = Math.max(host.clientWidth, 320);
    const height = Math.max(host.clientHeight, 320);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.35 : 2));
    renderer.setSize(width, height);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 120);
    camera.position.set(0, 6.4, 13.5);
    camera.lookAt(0, 0.4, 0);

    const isDark = resolvedTheme === 'dark';

    // Adaptive mesh density: 48x32 mobile, 96x60 desktop — animated purely in GLSL
    const segsX = isMobile ? 48 : 96;
    const segsZ = isMobile ? 32 : 60;
    const planeGeo = new THREE.PlaneGeometry(26, 16, segsX, segsZ);
    planeGeo.rotateX(-Math.PI / 2);

    const uniforms = {
      uTime: { value: 0 },
      uBaseColor: { value: new THREE.Color(isDark ? 0x0b1118 : 0xe9e6dd) },
      uRidgeColor: { value: new THREE.Color(isDark ? 0x1e2b3b : 0xdad5c7) },
      uContourColor: { value: new THREE.Color(isDark ? 0xff4d1c : 0xc9340b) },
      uOpacity: { value: isDark ? 0.72 : 0.42 },
    };

    const shaderMat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
    });
    const terrainSolid = new THREE.Mesh(planeGeo, shaderMat);
    scene.add(terrainSolid);

    const wireMat = new THREE.ShaderMaterial({
      uniforms: {
        ...uniforms,
        uBaseColor: { value: new THREE.Color(isDark ? 0xff4d1c : 0xc9340b) },
        uRidgeColor: { value: new THREE.Color(isDark ? 0xff8a5b : 0xd1380e) },
        uContourColor: { value: new THREE.Color(isDark ? 0xffb347 : 0xc9340b) },
        uOpacity: { value: isDark ? 0.19 : 0.12 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      wireframe: true,
      transparent: true,
    });
    const terrainWire = new THREE.Mesh(planeGeo, wireMat);
    terrainWire.position.y = 0.03;
    if (!isMobile) {
      scene.add(terrainWire);
    }

    // Subtle glowing GPS spline ribbon over peaks
    const curvePts: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const x = -9 + t * 18;
      const z = Math.sin(t * Math.PI * 2.2) * 3.1;
      const y =
        Math.sin(x * 0.42) * Math.cos(z * 0.45) * 1.45 +
        Math.sin(x * 0.85 + z * 0.55) * 0.55 +
        Math.exp(-((x - 1.5) * (x - 1.5) + (z + 0.5) * (z + 0.5)) / 18) * 1.9 +
        0.28;
      curvePts.push(new THREE.Vector3(x, y, z));
    }
    const routeCurve = new THREE.CatmullRomCurve3(curvePts);
    const tubeGeo = new THREE.TubeGeometry(routeCurve, 90, 0.055, 8, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color: isDark ? 0xff7043 : 0xd1380e,
      transparent: true,
      opacity: isDark ? 0.88 : 0.72,
    });
    const routeMesh = new THREE.Mesh(tubeGeo, tubeMat);
    scene.add(routeMesh);

    const runnerBeacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 16, 16),
      new THREE.MeshBasicMaterial({ color: isDark ? 0x18b87a : 0x0d8a59 })
    );
    scene.add(runnerBeacon);

    let pointerX = 0;
    let pointerY = 0;
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const nx = e.clientX / Math.max(window.innerWidth, 1) - 0.5;
      const ny = e.clientY / Math.max(window.innerHeight, 1) - 0.5;
      pointerX = nx * 1.6;
      pointerY = ny * 0.7;
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    const onResize = () => {
      if (!host) return;
      const w = Math.max(host.clientWidth, 320);
      const h = Math.max(host.clientHeight, 320);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    let frameId = 0;
    let elapsed = 0;
    let lastRender = 0;
    let inViewport = true;
    let tabVisible = !document.hidden;

    const renderFrame = (now = 0) => {
      frameId = 0;
      if (!inViewport || !tabVisible) return;

      // Throttle mobile WebGL cadence to ~30fps so touch scrolling stays locked at 60fps+
      if (isMobile && !reducedMotion && lastRender !== 0 && now - lastRender < 32) {
        frameId = requestAnimationFrame(renderFrame);
        return;
      }
      lastRender = now;

      if (!reducedMotion) {
        elapsed += isMobile ? 0.024 : 0.015;
        uniforms.uTime.value = elapsed;

        const beaconPos = routeCurve.getPointAt((elapsed * 0.06) % 1);
        runnerBeacon.position.copy(beaconPos);

        const scrollRatio = Math.min(window.scrollY / 900, 1);
        camera.position.x += (pointerX - camera.position.x) * 0.05;
        camera.position.y += (6.4 - scrollRatio * 1.4 - pointerY - camera.position.y) * 0.05;
        camera.lookAt(0, 0.35 - scrollRatio * 0.5, 0);
      } else {
        runnerBeacon.position.copy(routeCurve.getPointAt(0.55));
      }

      renderer.render(scene, camera);
      if (!reducedMotion && inViewport && tabVisible) {
        frameId = requestAnimationFrame(renderFrame);
      }
    };

    const startLoop = () => {
      if (!frameId && inViewport && tabVisible) {
        renderFrame();
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        inViewport = entries[0]?.isIntersecting ?? true;
        if (inViewport) {
          startLoop();
        } else if (frameId) {
          cancelAnimationFrame(frameId);
          frameId = 0;
        }
      },
      { threshold: 0.02 }
    );
    observer.observe(host);

    const onVisibilityChange = () => {
      tabVisible = !document.hidden;
      if (tabVisible) {
        startLoop();
      } else if (frameId) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    renderFrame();

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', onResize);
      planeGeo.dispose();
      shaderMat.dispose();
      wireMat.dispose();
      tubeGeo.dispose();
      tubeMat.dispose();
      runnerBeacon.geometry.dispose();
      (runnerBeacon.material as THREE.Material).dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === host) {
        host.removeChild(renderer.domElement);
      }
    };
  }, [resolvedTheme]);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    />
  );
}
