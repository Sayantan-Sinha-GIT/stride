'use client';

import React, { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Flame,
  Gauge,
  Medal,
  Plus,
  Sneaker,
  Target,
  Trash,
  Trophy,
} from '@phosphor-icons/react';
import { useAuth } from '@/components/AuthProvider';
import { CinemaPageHeader } from '@/components/layout/CinemaPageHeader';
import { getMessages, normalizeLocale } from '@/i18n';
import { apiFetch } from '@/lib/api';
import { formatDistance, formatDuration, formatElevation } from '@/lib/format';

interface DashboardPayload {
  totalsBySport: Array<{
    activity_type: string;
    week_distance_m: number;
    week_moving_s: number;
    month_distance_m: number;
    year_distance_m: number;
    year_elevation_m: number;
    total_count: number;
  }>;
  weeklyTrend: Array<{
    week_start: string;
    distance_m: number;
    moving_time_s: number;
    elevation_gain_m: number;
    activity_count: number;
  }>;
  streakDays: number;
  goals: Array<{
    id: string;
    period: 'weekly' | 'monthly';
    activity_type: string;
    metric_type: 'distance_m' | 'moving_time_s' | 'activity_count';
    target_value: number;
    current_value: number;
  }>;
  records: Array<{
    id: string;
    metric_key: string;
    activity_type: string;
    activity_id: string;
    activity_title: string;
    value_num: number;
  }>;
  badges: Array<{
    code: string;
    title_en: string;
    title_hi: string;
    description_en: string;
    description_hi: string;
  }>;
  gear: Array<{
    id: string;
    name: string;
    gear_type: string;
    brand: string;
    initial_distance_m: number;
    logged_distance_m: number;
    max_distance_m: number | null;
    retired: boolean;
  }>;
}

export default function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = use(params);
  const locale = normalizeLocale(raw);
  const m = getMessages(locale);
  const { user, settings } = useAuth();

  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);

  // Add Goal
  const [goalPeriod, setGoalPeriod] = useState<'weekly' | 'monthly'>('weekly');
  const [goalTargetKm, setGoalTargetKm] = useState('30');

  // Add Gear
  const [gearName, setGearName] = useState('');
  const [gearType, setGearType] = useState<'shoes' | 'bike'>('shoes');
  const [gearInitialKm, setGearInitialKm] = useState('0');

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<DashboardPayload>('/v1/analytics/dashboard');
      setData(res);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <div className="stride-card flex flex-col items-center gap-4 p-8 text-center">
          <Gauge size={36} weight="bold" className="text-[var(--stride-accent)]" />
          <h1 className="text-xl font-bold">Training Analytics Dashboard</h1>
          <p className="text-sm text-[var(--stride-text-secondary)]">
            Sign in (or click 1-Click Demo Athlete) to view weekly volume, streaks, personal records, goals, and gear mileage.
          </p>
          <Link href={`/${locale}/login`} className="stride-btn-primary inline-flex items-center px-6 text-sm">
            {m.nav.login}
          </Link>
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="mx-auto max-w-[1380px] px-4 py-12 text-center text-sm text-[var(--stride-text-secondary)]">
        {m.common.loading}
      </div>
    );
  }

  const addGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/v1/analytics/goals', {
      method: 'POST',
      body: JSON.stringify({
        period: goalPeriod,
        activityType: 'all',
        metricType: 'distance_m',
        targetValue: Math.max(1000, Number(goalTargetKm) * 1000),
      }),
    });
    load();
  };

  const deleteGoal = async (id: string) => {
    await apiFetch(`/v1/analytics/goals/${id}`, { method: 'DELETE' });
    load();
  };

  const addGear = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/v1/analytics/gear', {
      method: 'POST',
      body: JSON.stringify({
        name: gearName,
        gearType,
        initialDistanceM: Math.max(0, Number(gearInitialKm) * 1000),
        maxDistanceM: gearType === 'shoes' ? 750_000 : 10_000_000,
      }),
    });
    setGearName('');
    load();
  };

  const toggleRetireGear = async (id: string, retired: boolean) => {
    await apiFetch(`/v1/analytics/gear/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ retired: !retired }),
    });
    load();
  };

  const maxWeekDist = Math.max(1000, ...data.weeklyTrend.map((w) => w.distance_m));

  return (
    <div className="mx-auto flex max-w-[1380px] flex-col gap-6 px-4 py-8 md:px-6">
      <CinemaPageHeader
        index="02"
        eyebrow={locale === 'hi' ? 'ट्रेनिंग एनालिटिक्स' : 'TRAINING ANALYTICS'}
        title={`${m.nav.dashboard} · ${user.displayName}`}
        subtitle={`@${user.handle} · ${locale === 'hi' ? 'साप्ताहिक वॉल्यूम, लक्ष्य, PRs और गियर माइलेज' : 'Weekly endurance load, streaks, personal records, goals, and gear mileage.'}`}
        action={
          <div className="flex items-center gap-2.5">
            <div className="stride-card flex items-center gap-2 px-3.5 py-2 text-xs font-bold">
              <Flame size={17} weight="fill" className="text-[var(--stride-accent)]" />
              <span className="font-mono-num">{data.streakDays}-day streak</span>
            </div>
            <Link href={`/${locale}/year-in-review`} className="stride-btn-luminous inline-flex items-center px-4 text-xs">
              {locale === 'hi' ? 'वार्षिक समीक्षा' : 'Year in Review'}
            </Link>
          </div>
        }
      />

      {/* Sport Totals */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {data.totalsBySport.length === 0 ? (
          <div className="stride-card p-5 text-xs text-[var(--stride-text-muted)] md:col-span-3">
            No activities logged yet. Record or import GPX to unlock analytics.
          </div>
        ) : (
          data.totalsBySport.map((t) => (
            <div key={t.activity_type} className="stride-card p-5">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-[var(--stride-accent-tint)] px-2.5 py-0.5 text-xs font-bold uppercase text-[var(--stride-accent)]">
                  {t.activity_type}
                </span>
                <span className="text-xs text-[var(--stride-text-muted)]">{t.total_count} activities</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-[var(--stride-text-muted)]">Week</div>
                  <div className="font-mono-num font-bold">{formatDistance(t.week_distance_m, settings.units, locale)}</div>
                </div>
                <div>
                  <div className="text-[var(--stride-text-muted)]">Month</div>
                  <div className="font-mono-num font-bold">{formatDistance(t.month_distance_m, settings.units, locale)}</div>
                </div>
                <div>
                  <div className="text-[var(--stride-text-muted)]">Year Elev</div>
                  <div className="font-mono-num font-bold">{formatElevation(t.year_elevation_m, settings.units, locale)}</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 12-Week Volume Trend Chart */}
      <div className="stride-cinema-card p-6">
        <h2 className="mb-4 text-base font-bold">12-Week Distance Volume</h2>
        {data.weeklyTrend.length === 0 ? (
          <p className="text-xs text-[var(--stride-text-muted)]">Not enough weekly history yet.</p>
        ) : (
          <div className="flex h-40 items-end justify-start gap-3">
            {data.weeklyTrend.map((w) => {
              const hPct = Math.max(8, Math.round((w.distance_m / maxWeekDist) * 100));
              return (
                <div key={w.week_start} className="flex w-14 flex-col items-center gap-1.5">
                  <span className="font-mono-num text-[10px] text-[var(--stride-text-secondary)]">
                    {(w.distance_m / 1000).toFixed(1)}k
                  </span>
                  <div className="flex h-28 w-full items-end justify-center">
                    <div
                      className="w-10 rounded-t-md transition-all"
                      style={{
                        height: `${hPct}%`,
                        background:
                          'linear-gradient(180deg, var(--stride-accent) 0%, var(--stride-accent-gold) 100%)',
                      }}
                    />
                  </div>
                  <span className="font-mono-num text-[10px] text-[var(--stride-text-muted)]">
                    {w.week_start.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Goals + Personal Records */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Goals */}
        <div className="stride-card flex flex-col gap-4 p-5">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <Target size={18} weight="bold" className="text-[var(--stride-accent)]" />
            <span>Training Goals</span>
          </h2>
          <form onSubmit={addGoal} className="flex flex-wrap gap-2">
            <select
              value={goalPeriod}
              onChange={(e) => setGoalPeriod(e.target.value as 'weekly' | 'monthly')}
              className="min-h-[38px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-xs"
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <input
              type="number"
              min="1"
              value={goalTargetKm}
              onChange={(e) => setGoalTargetKm(e.target.value)}
              className="min-h-[38px] w-24 rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-xs"
            />
            <button type="submit" className="stride-btn-primary inline-flex min-h-[38px] items-center gap-1 px-4 text-xs">
              <Plus size={14} weight="bold" />
              <span>Add km Goal</span>
            </button>
          </form>

          <div className="flex flex-col gap-3">
            {data.goals.map((g) => {
              const pct = Math.min(100, Math.round((g.current_value / g.target_value) * 100));
              return (
                <div key={g.id} className="rounded-xl border border-[var(--stride-border-subtle)] bg-[var(--stride-bg-elevated)] p-3 text-xs">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="font-semibold capitalize">
                      {g.period} {g.activity_type} target
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono-num">
                        {g.metric_type === 'distance_m'
                          ? `${(g.current_value / 1000).toFixed(1)} / ${(g.target_value / 1000).toFixed(0)} km`
                          : `${Math.round(g.current_value)} / ${Math.round(g.target_value)}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteGoal(g.id)}
                        aria-label="Delete goal"
                        className="text-[var(--stride-text-muted)] hover:text-[var(--stride-danger)]"
                      >
                        <Trash size={14} weight="bold" />
                      </button>
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--stride-bg-surface)]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        background: 'linear-gradient(90deg, var(--stride-accent) 0%, var(--stride-success) 100%)',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Personal Records */}
        <div className="stride-card flex flex-col gap-4 p-5">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <Trophy size={18} weight="bold" className="text-[var(--stride-warning)]" />
            <span>Personal Records</span>
          </h2>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {data.records.map((pr) => {
              const isDist = pr.metric_key.endsWith('_longest_distance');
              const isClimb = pr.metric_key.endsWith('_highest_climb');
              const valLabel = isDist
                ? formatDistance(pr.value_num, settings.units, locale)
                : isClimb
                  ? formatElevation(pr.value_num, settings.units, locale)
                  : formatDuration(pr.value_num);
              return (
                <Link
                  key={pr.id}
                  href={`/${locale}/activities/${pr.activity_id}`}
                  className="rounded-xl border border-[var(--stride-border-subtle)] bg-[var(--stride-bg-elevated)] p-3 text-xs hover:border-[var(--stride-accent)]"
                >
                  <div className="uppercase text-[var(--stride-text-muted)]">{pr.metric_key.replace(/_/g, ' ')}</div>
                  <div className="font-mono-num mt-1 text-base font-bold text-[var(--stride-accent)]">{valLabel}</div>
                  <div className="mt-0.5 truncate text-[11px] text-[var(--stride-text-secondary)]">{pr.activity_title}</div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Gear & Badges */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="stride-card flex flex-col gap-4 p-5">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <Sneaker size={18} weight="bold" className="text-[var(--stride-accent)]" />
            <span>Shoes & Bikes Mileage</span>
          </h2>
          <form onSubmit={addGear} className="flex flex-wrap gap-2">
            <input
              type="text"
              required
              value={gearName}
              onChange={(e) => setGearName(e.target.value)}
              placeholder="Shoe or bike name"
              className="min-h-[38px] flex-1 rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-xs"
            />
            <select
              value={gearType}
              onChange={(e) => setGearType(e.target.value as 'shoes' | 'bike')}
              className="min-h-[38px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-xs"
            >
              <option value="shoes">Shoes</option>
              <option value="bike">Bike</option>
            </select>
            <input
              type="number"
              min="0"
              value={gearInitialKm}
              onChange={(e) => setGearInitialKm(e.target.value)}
              placeholder="Initial km"
              className="min-h-[38px] w-24 rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-xs"
            />
            <button type="submit" className="stride-btn-primary min-h-[38px] px-4 text-xs">
              Add
            </button>
          </form>

          <div className="flex flex-col gap-2.5">
            {data.gear.map((g) => {
              const totalM = g.initial_distance_m + g.logged_distance_m;
              return (
                <div key={g.id} className="flex items-center justify-between rounded-xl border border-[var(--stride-border-subtle)] bg-[var(--stride-bg-elevated)] p-3 text-xs">
                  <div>
                    <div className="font-bold">
                      {g.name} {g.retired && <span className="text-[var(--stride-text-muted)]">(Retired)</span>}
                    </div>
                    <div className="font-mono-num text-[var(--stride-text-secondary)]">
                      {formatDistance(totalM, settings.units, locale)}
                      {g.max_distance_m ? ` / ${formatDistance(g.max_distance_m, settings.units, locale)}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleRetireGear(g.id, g.retired)}
                    className="rounded-full border border-[var(--stride-border-strong)] px-3 py-1 text-[11px] font-semibold"
                  >
                    {g.retired ? 'Reactivate' : 'Retire'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="stride-card flex flex-col gap-4 p-5">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <Medal size={18} weight="bold" className="text-[var(--stride-warning)]" />
            <span>Earned Milestone Badges ({data.badges.length})</span>
          </h2>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {data.badges.map((b) => (
              <div key={b.code} className="rounded-xl border border-[var(--stride-border-subtle)] bg-[var(--stride-bg-elevated)] p-3 text-xs">
                <div className="font-bold text-[var(--stride-accent)]">
                  {locale === 'hi' ? b.title_hi : b.title_en}
                </div>
                <p className="mt-1 text-[var(--stride-text-secondary)]">
                  {locale === 'hi' ? b.description_hi : b.description_en}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
