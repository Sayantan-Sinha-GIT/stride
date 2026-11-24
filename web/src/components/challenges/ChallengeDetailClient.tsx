'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Flame, Trophy } from '@phosphor-icons/react';
import { useAuth } from '@/components/AuthProvider';
import { getMessages, type Locale } from '@/i18n';
import { apiFetch } from '@/lib/api';

interface ChallengeDetailPayload {
  challenge: {
    id: string;
    slug: string;
    title: string;
    description: string;
    metric_type: string;
    target_value: number;
    starts_at: string;
    ends_at: string;
    viewer_joined: boolean;
    viewer_progress: number;
    viewer_completed: boolean;
  };
  leaderboard: Array<{
    rank: number;
    user_id: string;
    progress_value: number;
    completed: boolean;
    handle: string;
    display_name: string;
    home_city: string;
  }>;
}

export function ChallengeDetailClient({ slug, locale }: { slug: string; locale: Locale }) {
  const m = getMessages(locale);
  const { user } = useAuth();
  const [data, setData] = useState<ChallengeDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ChallengeDetailPayload>(`/v1/challenges/${slug}`);
      setData(res);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : m.common.notFound);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [slug, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="mx-auto max-w-[1380px] px-4 py-12 text-center text-sm text-[var(--stride-text-secondary)]">
        {m.common.loading}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <div className="stride-card p-6 text-center">
          <p className="text-sm font-semibold text-[var(--stride-danger)]">{error || m.common.notFound}</p>
          <Link href={`/${locale}/challenges`} className="stride-btn-secondary mt-4 inline-flex items-center px-5 text-xs">
            {m.common.back}
          </Link>
        </div>
      </div>
    );
  }

  const { challenge, leaderboard } = data;

  const formatMetric = (val: number) => {
    if (challenge.metric_type === 'distance_m') return `${(val / 1000).toFixed(1)} km`;
    if (challenge.metric_type === 'elevation_m') return `${Math.round(val)} m`;
    return `${Math.round(val)}`;
  };

  const toggleJoin = async () => {
    if (!user) return;
    if (challenge.viewer_joined) {
      await apiFetch(`/v1/challenges/${challenge.id}/leave`, { method: 'DELETE' });
    } else {
      await apiFetch(`/v1/challenges/${challenge.id}/join`, { method: 'POST' });
    }
    load();
  };

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-4 py-8 md:px-6">
      <div className="stride-card flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--stride-accent-tint)] px-3 py-0.5 text-xs font-bold text-[var(--stride-accent)]">
            <Flame size={13} weight="bold" />
            Target: {formatMetric(challenge.target_value)}
          </span>
          <h1 className="mt-2 text-2xl font-bold">{challenge.title}</h1>
          <p className="mt-1 text-sm text-[var(--stride-text-secondary)]">{challenge.description}</p>
        </div>

        {user && (
          <button
            type="button"
            onClick={toggleJoin}
            className={challenge.viewer_joined ? 'stride-btn-secondary px-5 text-xs' : 'stride-btn-primary px-5 text-xs'}
          >
            {challenge.viewer_joined ? 'Leave Challenge' : 'Join Challenge'}
          </button>
        )}
      </div>

      <div className="stride-card p-5">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
          <Trophy size={18} weight="bold" className="text-[var(--stride-warning)]" />
          <span>Challenge Standings</span>
        </h2>
        <div className="flex flex-col gap-2.5">
          {leaderboard.map((row) => {
            const pct = Math.min(100, Math.round((row.progress_value / challenge.target_value) * 100));
            return (
              <div
                key={row.user_id}
                className="flex flex-col gap-1.5 rounded-xl border border-[var(--stride-border-subtle)] bg-[var(--stride-bg-elevated)] p-3.5 text-xs"
              >
                <div className="flex items-center justify-between">
                  <Link href={`/${locale}/u/${row.handle}`} className="font-semibold hover:text-[var(--stride-accent)]">
                    #{row.rank} · {row.display_name} (@{row.handle})
                  </Link>
                  <span className="font-mono-num font-bold">
                    {formatMetric(row.progress_value)} ({pct}%)
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--stride-bg-surface)]">
                  <div className="h-full bg-[var(--stride-accent)]" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
