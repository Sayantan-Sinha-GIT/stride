'use client';

import React, { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { MagnifyingGlass, Trophy } from '@phosphor-icons/react';
import { useAuth } from '@/components/AuthProvider';
import { getMessages, normalizeLocale } from '@/i18n';
import { apiFetch } from '@/lib/api';
import { formatDistance, formatDuration, formatElevation } from '@/lib/format';

interface SegmentSummary {
  id: string;
  name: string;
  city: string;
  activity_type: string;
  distance_m: number;
  elevation_gain_m: number;
  effort_count: number;
  kom_time_s?: number;
}

export default function SegmentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = use(params);
  const locale = normalizeLocale(raw);
  const m = getMessages(locale);
  const { settings } = useAuth();

  const [segments, setSegments] = useState<SegmentSummary[]>([]);
  const [sport, setSport] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (sport) qs.set('activityType', sport);
      if (q.trim()) qs.set('q', q.trim());
      const res = await apiFetch<{ segments: SegmentSummary[] }>(`/v1/segments?${qs.toString()}`);
      setSegments(res.segments || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [sport]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-[1380px] px-4 py-8 md:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--stride-text-primary)]">{m.nav.segments}</h1>
          <p className="text-sm text-[var(--stride-text-secondary)]">
            {locale === 'hi'
              ? 'सत्यापित सड़क खंडों पर समय के साथ प्रतिस्पर्धा करें।'
              : 'Compete on verified road & park segments with interpolated entry/exit timing.'}
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <select
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            className="min-h-[42px] rounded-full border border-[var(--stride-border-strong)] bg-[var(--stride-bg-surface)] px-4 text-xs font-semibold"
          >
            <option value="">{m.sports.all}</option>
            <option value="run">{m.sports.run}</option>
            <option value="ride">{m.sports.ride}</option>
          </select>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="City or segment name..."
            className="min-h-[42px] rounded-full border border-[var(--stride-border-strong)] bg-[var(--stride-bg-surface)] px-4 text-xs"
          />
          <button type="submit" aria-label="Search segments" className="stride-btn-primary px-4 text-xs">
            <MagnifyingGlass size={16} weight="bold" />
          </button>
        </form>
      </div>

      {loading ? (
        <div className="stride-card p-8 text-center text-sm">{m.common.loading}</div>
      ) : segments.length === 0 ? (
        <div className="stride-card p-8 text-center text-sm">{m.common.empty}</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {segments.map((seg) => (
            <Link
              key={seg.id}
              href={`/${locale}/segments/${seg.id}`}
              className="stride-cinema-card flex flex-col justify-between gap-4 p-5 hover:border-[var(--stride-accent)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="rounded-full bg-[var(--stride-accent-tint)] px-2.5 py-0.5 text-[11px] font-bold uppercase text-[var(--stride-accent)]">
                    {seg.activity_type}
                  </span>
                  <h2 className="mt-2 text-lg font-bold text-[var(--stride-text-primary)]">{seg.name}</h2>
                  <p className="text-xs text-[var(--stride-text-secondary)]">{seg.city || 'India'}</p>
                </div>
                <Trophy size={20} weight="bold" className="text-[var(--stride-warning)]" />
              </div>

              <div className="grid grid-cols-3 gap-2 rounded-xl bg-[var(--stride-bg-elevated)] p-3 text-center text-xs">
                <div>
                  <div className="text-[var(--stride-text-muted)]">{m.metrics.distance}</div>
                  <div className="font-mono-num font-bold">
                    {formatDistance(seg.distance_m, settings.units, locale)}
                  </div>
                </div>
                <div>
                  <div className="text-[var(--stride-text-muted)]">Elev +</div>
                  <div className="font-mono-num font-bold">
                    {formatElevation(seg.elevation_gain_m, settings.units, locale)}
                  </div>
                </div>
                <div>
                  <div className="text-[var(--stride-text-muted)]">CR / Best</div>
                  <div className="font-mono-num font-bold text-[var(--stride-accent)]">
                    {seg.kom_time_s ? formatDuration(seg.kom_time_s) : `${seg.effort_count}`}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
