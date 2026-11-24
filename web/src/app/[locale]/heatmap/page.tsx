'use client';

import React, { use, useEffect, useState } from 'react';
import { Globe, ShieldCheck } from '@phosphor-icons/react';
import { StrideMap, type HeatmapPoint } from '@/components/maps/StrideMap';
import { getMessages, normalizeLocale } from '@/i18n';
import { apiFetch } from '@/lib/api';

const CITY_CENTERS: Record<string, { label: string; center: [number, number] }> = {
  '': { label: 'All India', center: [77.5929, 12.9762] },
  bengaluru: { label: 'Bengaluru', center: [77.5929, 12.9762] },
  mumbai: { label: 'Mumbai', center: [72.8247, 18.9382] },
  kolkata: { label: 'Kolkata', center: [88.3478, 22.5494] },
  'new delhi': { label: 'New Delhi', center: [77.2197, 28.5931] },
};

export default function HeatmapPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = use(params);
  const locale = normalizeLocale(raw);
  const m = getMessages(locale);

  const [city, setCity] = useState('bengaluru');
  const [activityType, setActivityType] = useState('all');
  const [cells, setCells] = useState<Array<HeatmapPoint & { contributor_count: number }>>([]);
  const [threshold, setThreshold] = useState(3);

  useEffect(() => {
    const qs = new URLSearchParams({ activityType });
    if (city) qs.set('city', city);
    apiFetch<{ cells: Array<HeatmapPoint & { contributor_count: number }>; minContributorsThreshold: number }>(
      `/v1/heatmap?${qs.toString()}`
    )
      .then((res) => {
        setCells(res.cells || []);
        setThreshold(res.minContributorsThreshold || 3);
      })
      .catch(() => setCells([]));
  }, [city, activityType]);

  return (
    <div className="mx-auto flex max-w-[1380px] flex-col gap-5 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Globe size={24} weight="bold" className="text-[var(--stride-accent)]" />
            <span>{m.nav.heatmap}</span>
          </h1>
          <p className="text-sm text-[var(--stride-text-secondary)]">
            Aggregated public corridor density pre-computed via scheduled Cron Triggers and cached at the edge.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {Object.entries(CITY_CENTERS).map(([key, info]) => (
            <button
              key={key || 'all'}
              type="button"
              onClick={() => setCity(key)}
              className={`min-h-[38px] rounded-full px-3.5 text-xs font-semibold ${
                city === key
                  ? 'bg-[var(--stride-accent)] text-white'
                  : 'border border-[var(--stride-border-strong)] bg-[var(--stride-bg-surface)]'
              }`}
            >
              {info.label}
            </button>
          ))}
          <select
            value={activityType}
            onChange={(e) => setActivityType(e.target.value)}
            className="min-h-[38px] rounded-full border border-[var(--stride-border-strong)] bg-[var(--stride-bg-surface)] px-3.5 text-xs font-semibold"
          >
            <option value="all">{m.sports.all}</option>
            <option value="run">{m.sports.run}</option>
            <option value="ride">{m.sports.ride}</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-[var(--stride-success)] bg-[rgba(24,184,122,0.1)] px-4 py-2.5 text-xs text-[var(--stride-text-primary)]">
        <ShieldCheck size={17} weight="bold" className="shrink-0 text-[var(--stride-success)]" />
        <span>
          Privacy protection active: Private/followers-only activities and all privacy zones are excluded. Only grid cells with at least{' '}
          <strong>{threshold} distinct contributors</strong> are rendered ({cells.length} active cells shown).
        </span>
      </div>

      <StrideMap
        heatmapPoints={cells}
        center={CITY_CENTERS[city]?.center || [77.5929, 12.9762]}
        zoom={city ? 13 : 5}
        heightClass="h-[520px]"
        pitch={25}
      />
    </div>
  );
}
