'use client';

import React, { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Copy, Sparkle, Trophy } from '@phosphor-icons/react';
import { useAuth } from '@/components/AuthProvider';
import { getMessages, normalizeLocale } from '@/i18n';
import { apiFetch } from '@/lib/api';
import { formatDistance, formatDuration, formatElevation } from '@/lib/format';

interface YearReviewPayload {
  year: number;
  summary: {
    total_activities: number;
    total_distance_m: number;
    total_moving_s: number;
    total_elevation_m: number;
    total_calories: number;
    total_kudos: number;
    active_days: number;
  };
  bySport: Array<{ activity_type: string; count: number; distance_m: number }>;
  topMonth: { month: string; distance_m: number } | null;
  topSegments: Array<{ id: string; name: string; elapsed_time_s: number; is_pr: boolean }>;
}

export default function YearInReviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = use(params);
  const locale = normalizeLocale(raw);
  const m = getMessages(locale);
  const { user, settings } = useAuth();
  const [year, setYear] = useState(new Date().getUTCFullYear());
  const [data, setData] = useState<YearReviewPayload | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    apiFetch<YearReviewPayload>(`/v1/analytics/year-in-review?year=${year}`)
      .then(setData)
      .catch(() => {});
  }, [user, year]);

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <div className="stride-card flex flex-col gap-4 p-8">
          <h1 className="text-xl font-bold">Year in Review</h1>
          <p className="text-sm text-[var(--stride-text-secondary)]">Sign in to view your personalized annual training card.</p>
          <Link href={`/${locale}/login`} className="stride-btn-primary flex items-center justify-center">
            {m.nav.login}
          </Link>
        </div>
      </div>
    );
  }

  const copySummary = () => {
    if (!data) return;
    const text = `My ${data.year} on Stride: ${formatDistance(data.summary.total_distance_m, settings.units, locale)} across ${data.summary.total_activities} activities (${data.summary.active_days} active days, +${Math.round(data.summary.total_elevation_m)}m climbed)!`;
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--stride-accent-tint)] px-3 py-1 text-xs font-bold text-[var(--stride-accent)]">
            <Sparkle size={14} weight="fill" />
            {locale === 'hi' ? 'वार्षिक एथलीट समीक्षा' : 'Annual Athlete Recap'}
          </span>
          <h1 className="mt-2 text-3xl font-bold">{user.displayName}’s {year}</h1>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="min-h-[40px] rounded-full border border-[var(--stride-border-strong)] bg-[var(--stride-bg-surface)] px-4 text-xs font-semibold"
          >
            {[2026, 2025, 2024].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button type="button" onClick={copySummary} className="stride-btn-primary inline-flex items-center gap-1.5 px-4 text-xs">
            <Copy size={15} weight="bold" />
            <span>{copied ? 'Copied!' : 'Copy Share Text'}</span>
          </button>
        </div>
      </div>

      {data && (
        <div className="stride-cinema-card stride-grid-bg grid grid-cols-2 gap-4 p-6 md:grid-cols-3">
          <div>
            <div className="text-xs text-[var(--stride-text-muted)]">Total Distance</div>
            <div className="font-mono-num mt-1 text-3xl font-bold text-[var(--stride-accent)]">
              {formatDistance(data.summary.total_distance_m || 0, settings.units, locale)}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--stride-text-muted)]">Active Time</div>
            <div className="font-mono-num mt-1 text-3xl font-bold">
              {formatDuration(data.summary.total_moving_s || 0)}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--stride-text-muted)]">Elevation Climbed</div>
            <div className="font-mono-num mt-1 text-3xl font-bold">
              {formatElevation(data.summary.total_elevation_m || 0, settings.units, locale)}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--stride-text-muted)]">Active Days</div>
            <div className="font-mono-num mt-1 text-2xl font-bold">{data.summary.active_days}</div>
          </div>
          <div>
            <div className="text-xs text-[var(--stride-text-muted)]">Activities</div>
            <div className="font-mono-num mt-1 text-2xl font-bold">{data.summary.total_activities}</div>
          </div>
          <div>
            <div className="text-xs text-[var(--stride-text-muted)]">Kudos Earned</div>
            <div className="font-mono-num mt-1 text-2xl font-bold">{data.summary.total_kudos}</div>
          </div>
        </div>
      )}

      {data && data.topSegments.length > 0 && (
        <div className="stride-card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
            <Trophy size={18} weight="bold" className="text-[var(--stride-warning)]" />
            <span>Top Segment Performances</span>
          </h2>
          <div className="flex flex-col gap-2">
            {data.topSegments.map((s) => (
              <Link
                key={s.id}
                href={`/${locale}/segments/${s.id}`}
                className="flex items-center justify-between rounded-xl border border-[var(--stride-border-subtle)] bg-[var(--stride-bg-elevated)] px-4 py-2.5 text-xs"
              >
                <span className="font-semibold">{s.name}</span>
                <span className="font-mono-num font-bold text-[var(--stride-accent)]">
                  {formatDuration(s.elapsed_time_s)} {s.is_pr ? '• PR' : ''}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
