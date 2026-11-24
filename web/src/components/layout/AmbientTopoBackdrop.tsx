'use client';

import React from 'react';

/**
 * Fixed GPU-composited ambient radial aura + crisp architectural topo contours.
 * Pointer-events-none and transform-only so mobile scrolling stays at native 60fps.
 */
export function AmbientTopoBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none"
    >
      <div
        className="absolute -top-[28vh] -left-[12vw] h-[64vh] w-[64vw] rounded-full opacity-35 [html[data-theme='light']_&]:opacity-25"
        style={{
          background:
            'radial-gradient(circle at center, rgba(255, 77, 28, 0.36) 0%, rgba(245, 166, 35, 0.12) 42%, transparent 70%)',
        }}
      />
      <div
        className="absolute right-[-14vw] bottom-[-22vh] h-[58vh] w-[58vw] rounded-full opacity-30 [html[data-theme='light']_&]:opacity-20"
        style={{
          background:
            'radial-gradient(circle at center, rgba(24, 184, 122, 0.30) 0%, rgba(56, 189, 248, 0.10) 45%, transparent 72%)',
        }}
      />
      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full opacity-[0.045] [html[data-theme='light']_&]:opacity-[0.06]"
      >
        <path
          d="M-120 210 C 260 110, 540 310, 880 180 C 1180 70, 1340 260, 1580 170"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <path
          d="M-100 420 C 310 300, 620 510, 960 390 C 1220 295, 1380 460, 1580 380"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <path
          d="M-80 680 C 240 580, 590 740, 940 620 C 1240 520, 1410 700, 1580 610"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        />
      </svg>
    </div>
  );
}
