'use client';

import React, { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle, Flame, Plus } from '@phosphor-icons/react';
import { useAuth } from '@/components/AuthProvider';
import { getMessages, normalizeLocale } from '@/i18n';
import { apiFetch } from '@/lib/api';

interface ChallengeRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  activity_type: string;
  metric_type: string;
  target_value: number;
  starts_at: string;
  ends_at: string;
  participant_count: number;
  viewer_joined?: boolean;
  viewer_progress?: number;
  viewer_completed?: boolean;
}

export default function ChallengesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = use(params);
  const locale = normalizeLocale(raw);
  const m = getMessages(locale);
  const { user } = useAuth();

  const [challenges, setChallenges] = useState<ChallengeRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [metricType, setMetricType] = useState<'distance_m' | 'elevation_m' | 'activity_count'>('distance_m');
  const [targetKm, setTargetKm] = useState('50');

  const load = async () => {
    const res = await apiFetch<{ challenges: ChallengeRow[] }>('/v1/challenges');
    setChallenges(res.challenges || []);
  };

  useEffect(() => {
    load();
  }, [user?.id]);

  const createChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetValue =
      metricType === 'distance_m' ? Number(targetKm) * 1000 : Number(targetKm);
    const now = new Date();
    const end = new Date(now.getTime() + 30 * 86400 * 1000);
    await apiFetch('/v1/challenges', {
      method: 'POST',
      body: JSON.stringify({
        title,
        metricType,
        targetValue,
        startsAt: now.toISOString(),
        endsAt: end.toISOString(),
      }),
    });
    setTitle('');
    setShowCreate(false);
    load();
  };

  const formatTarget = (ch: ChallengeRow) => {
    if (ch.metric_type === 'distance_m') return `${(ch.target_value / 1000).toFixed(0)} km`;
    if (ch.metric_type === 'elevation_m') return `${Math.round(ch.target_value)} m climb`;
    return `${Math.round(ch.target_value)} activities`;
  };

  return (
    <div className="mx-auto max-w-[1380px] px-4 py-8 md:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Flame size={24} weight="bold" className="text-[var(--stride-accent)]" />
            <span>{m.nav.challenges}</span>
          </h1>
          <p className="text-sm text-[var(--stride-text-secondary)]">
            Time-boxed goals with live leaderboards and server-awarded completion badges.
          </p>
        </div>

        {user && (
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="stride-btn-primary inline-flex items-center gap-1.5 px-4 text-xs"
          >
            <Plus size={15} weight="bold" />
            <span>New Challenge</span>
          </button>
        )}
      </div>

      {showCreate && (
        <form onSubmit={createChallenge} className="stride-card mb-6 grid grid-cols-1 gap-3 p-5 md:grid-cols-4">
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Challenge title"
            className="min-h-[42px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-sm md:col-span-2"
          />
          <select
            value={metricType}
            onChange={(e) => setMetricType(e.target.value as typeof metricType)}
            className="min-h-[42px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-sm"
          >
            <option value="distance_m">Distance (km)</option>
            <option value="elevation_m">Elevation (m)</option>
            <option value="activity_count">Activity Count</option>
          </select>
          <input
            type="number"
            min="1"
            required
            value={targetKm}
            onChange={(e) => setTargetKm(e.target.value)}
            className="min-h-[42px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-sm"
          />
          <button type="submit" className="stride-btn-primary px-5 text-xs w-fit">
            Launch Challenge
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {challenges.map((ch) => {
          const pct =
            ch.viewer_joined && ch.target_value > 0
              ? Math.min(100, Math.round(((ch.viewer_progress || 0) / ch.target_value) * 100))
              : 0;
          return (
            <Link
              key={ch.id}
              href={`/${locale}/challenges/${ch.slug}`}
              className="stride-cinema-card flex flex-col justify-between gap-4 p-5 hover:border-[var(--stride-accent)]"
            >
              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="rounded-full bg-[var(--stride-accent-tint)] px-2.5 py-0.5 font-bold uppercase text-[var(--stride-accent)]">
                    Target: {formatTarget(ch)}
                  </span>
                  <span className="text-[var(--stride-text-muted)]">{ch.participant_count} joined</span>
                </div>
                <h2 className="mt-2.5 text-lg font-bold">{ch.title}</h2>
                <p className="mt-1 text-xs text-[var(--stride-text-secondary)]">{ch.description}</p>
              </div>

              {ch.viewer_joined && (
                <div>
                  <div className="mb-1 flex justify-between text-xs font-semibold">
                    <span>Your Progress</span>
                    <span className="flex items-center gap-1 font-mono-num">
                      {ch.viewer_completed && <CheckCircle size={14} weight="fill" className="text-[var(--stride-success)]" />}
                      {pct}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--stride-bg-elevated)]">
                    <div className="h-full bg-[var(--stride-accent)]" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
