'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookmarkSimple, Flag, Trophy } from '@phosphor-icons/react';
import { useAuth } from '@/components/AuthProvider';
import { StrideMap } from '@/components/maps/StrideMap';
import { getMessages, type Locale } from '@/i18n';
import { apiFetch } from '@/lib/api';
import {
  formatDateTime,
  formatDistance,
  formatDuration,
  formatElevation,
  formatPaceOrSpeed,
} from '@/lib/format';

interface SegmentDetail {
  id: string;
  name: string;
  city: string;
  activity_type: 'run' | 'ride' | 'walk' | 'hike';
  distance_m: number;
  elevation_gain_m: number;
  encoded_polyline: string;
  effort_count: number;
}

interface LeaderboardRow {
  rank: number;
  effort_id: string;
  activity_id: string;
  elapsed_time_s: number;
  avg_speed_mps: number;
  started_at: string;
  handle: string;
  display_name: string;
}

export function SegmentDetailClient({
  segmentId,
  locale,
}: {
  segmentId: string;
  locale: Locale;
}) {
  const m = getMessages(locale);
  const { user, settings } = useAuth();

  const [segment, setSegment] = useState<SegmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<LeaderboardRow[]>([]);
  const [range, setRange] = useState<'all' | 'year' | 'month' | 'following'>('all');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch<{ segment: SegmentDetail }>(`/v1/segments/${segmentId}`)
      .then((res) => setSegment(res.segment))
      .catch((err) => {
        setSegment(null);
        setError(err instanceof Error ? err.message : m.common.notFound);
      })
      .finally(() => setLoading(false));
  }, [segmentId, m.common.notFound]);

  useEffect(() => {
    apiFetch<{ entries: LeaderboardRow[] }>(`/v1/segments/${segmentId}/leaderboard?range=${range}`)
      .then((res) => setEntries(res.entries || []))
      .catch(() => setEntries([]));
  }, [segmentId, range]);

  const flagEffort = async (effortId: string) => {
    if (!user) return;
    await apiFetch(`/v1/segments/efforts/${effortId}/flag`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Suspicious speed or GPS error' }),
    });
    setNotice('Effort flagged for fairness review.');
  };

  const saveSegmentRoute = async () => {
    if (!segment || !user) return;
    await apiFetch('/v1/routes/saved', {
      method: 'POST',
      body: JSON.stringify({
        sourceSegmentId: segment.id,
        name: segment.name,
        activityType: segment.activity_type,
        distanceM: segment.distance_m,
        elevationGainM: segment.elevation_gain_m,
        encodedPolyline: segment.encoded_polyline,
      }),
    });
    setNotice('Segment saved to your routes!');
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[1380px] px-4 py-12 text-center text-sm text-[var(--stride-text-secondary)]">
        {m.common.loading}
      </div>
    );
  }

  if (error || !segment) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <div className="stride-card p-6 text-center">
          <p className="text-sm font-semibold text-[var(--stride-danger)]">{error || m.common.notFound}</p>
          <Link href={`/${locale}/segments`} className="stride-btn-secondary mt-4 inline-flex items-center px-5 text-xs">
            {m.common.back}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1380px] flex-col gap-6 px-4 py-8 md:px-6">
      {notice && (
        <div className="rounded-xl border border-[var(--stride-success)] bg-[rgba(24,184,122,0.12)] px-4 py-2.5 text-xs text-[var(--stride-success)]">
          {notice}
        </div>
      )}

      <div className="stride-card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <span className="rounded-full bg-[var(--stride-accent-tint)] px-3 py-0.5 text-xs font-bold uppercase text-[var(--stride-accent)]">
            {segment.activity_type} · {segment.city}
          </span>
          <h1 className="mt-2 text-2xl font-bold">{segment.name}</h1>
          <div className="mt-1 flex gap-4 text-xs text-[var(--stride-text-secondary)]">
            <span>{formatDistance(segment.distance_m, settings.units, locale)}</span>
            <span>+{formatElevation(segment.elevation_gain_m, settings.units, locale)}</span>
            <span>{segment.effort_count} valid efforts</span>
          </div>
        </div>

        {user && (
          <button
            type="button"
            onClick={saveSegmentRoute}
            className="stride-btn-secondary inline-flex items-center gap-1.5 px-4 text-xs"
          >
            <BookmarkSimple size={15} weight="bold" />
            <span>Save Route</span>
          </button>
        )}
      </div>

      <StrideMap encodedPolyline={segment.encoded_polyline} heightClass="h-[320px]" pitch={40} />

      <div className="stride-card flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Trophy size={20} weight="bold" className="text-[var(--stride-warning)]" />
            <span>Leaderboard</span>
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {(['all', 'year', 'month', ...(user ? ['following'] : [])] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r as typeof range)}
                className={`min-h-[36px] rounded-full px-3.5 text-xs font-semibold capitalize ${
                  range === r
                    ? 'bg-[var(--stride-accent)] text-white'
                    : 'bg-[var(--stride-bg-elevated)] text-[var(--stride-text-secondary)]'
                }`}
              >
                {r === 'all' ? 'All Time' : r === 'year' ? 'This Year' : r === 'month' ? 'This Month' : 'Following'}
              </button>
            ))}
          </div>
        </div>

        {entries.length === 0 ? (
          <p className="text-xs text-[var(--stride-text-muted)]">No leaderboard efforts in this timeframe yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--stride-border-subtle)] text-[var(--stride-text-muted)]">
                  <th className="py-2">Rank</th>
                  <th className="py-2">Athlete</th>
                  <th className="py-2">Pace / Speed</th>
                  <th className="py-2">Date</th>
                  <th className="py-2 text-right">Time</th>
                  {user && <th className="py-2 text-right">Fairness</th>}
                </tr>
              </thead>
              <tbody>
                {entries.map((row) => (
                  <tr key={row.effort_id} className="border-b border-[var(--stride-border-subtle)]">
                    <td className="font-mono-num py-3 font-bold">#{row.rank}</td>
                    <td className="py-3">
                      <Link href={`/${locale}/u/${row.handle}`} className="font-semibold hover:text-[var(--stride-accent)]">
                        {row.display_name} (@{row.handle})
                      </Link>
                    </td>
                    <td className="font-mono-num py-3">
                      {formatPaceOrSpeed(row.avg_speed_mps, segment.activity_type, settings.units, locale)}
                    </td>
                    <td className="py-3 text-[var(--stride-text-secondary)]">
                      <Link href={`/${locale}/activities/${row.activity_id}`} className="hover:underline">
                        {formatDateTime(row.started_at, locale)}
                      </Link>
                    </td>
                    <td className="font-mono-num py-3 text-right font-bold text-[var(--stride-accent)]">
                      {formatDuration(row.elapsed_time_s)}
                    </td>
                    {user && (
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => flagEffort(row.effort_id)}
                          title="Flag suspicious effort"
                          className="text-[var(--stride-text-muted)] hover:text-[var(--stride-danger)]"
                        >
                          <Flag size={14} weight="bold" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
