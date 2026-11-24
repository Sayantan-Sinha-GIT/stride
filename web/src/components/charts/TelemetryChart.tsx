'use client';

import React from 'react';

interface StreamPoint {
  t: number;
  d: number;
  ele: number;
  speedKmh: number;
}

export function TelemetryChart({
  stream,
  progressRatio,
  onSelectProgress,
}: {
  stream: StreamPoint[];
  progressRatio?: number;
  onSelectProgress?: (ratio: number) => void;
}) {
  if (!stream || stream.length < 2) {
    return null;
  }

  const w = 720;
  const h = 150;
  const padX = 12;
  const padY = 14;

  const eles = stream.map((s) => s.ele);
  const minE = Math.min(...eles);
  const maxE = Math.max(...eles);
  const rangeE = Math.max(4, maxE - minE);
  const maxD = Math.max(1, stream[stream.length - 1].d);

  const coords = stream.map((s) => {
    const x = padX + (s.d / maxD) * (w - padX * 2);
    const y = h - padY - ((s.ele - minE) / rangeE) * (h - padY * 2);
    return { x, y, ele: s.ele, speedKmh: s.speedKmh };
  });

  const linePath = coords
    .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${h - padY} L ${coords[0].x.toFixed(1)} ${h - padY} Z`;

  const cursorX =
    progressRatio != null
      ? padX + Math.max(0, Math.min(1, progressRatio)) * (w - padX * 2)
      : null;

  return (
    <div className="stride-card p-4">
      <div className="mb-2 flex items-center justify-between text-xs text-[var(--stride-text-secondary)]">
        <span className="font-semibold uppercase tracking-wider">Elevation & Speed Profile</span>
        <span className="font-mono-num">
          {Math.round(minE)}m – {Math.round(maxE)}m
        </span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-36 w-full cursor-pointer select-none"
        onClick={(e) => {
          if (!onSelectProgress) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          onSelectProgress(ratio);
        }}
      >
        <defs>
          <linearGradient id="strideEleFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--stride-accent)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--stride-accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#strideEleFill)" />
        <path d={linePath} fill="none" stroke="var(--stride-accent)" strokeWidth="2.5" />
        {cursorX != null && (
          <line
            x1={cursorX}
            y1={padY / 2}
            x2={cursorX}
            y2={h - padY / 2}
            stroke="var(--stride-text-primary)"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
        )}
      </svg>
    </div>
  );
}
