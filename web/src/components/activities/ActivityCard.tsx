'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { decodePolyline } from '@stride/track-engine';
import {
  Bicycle,
  ChatCircle,
  Footprints,
  Heart,
  LockKey,
  Mountains,
  PersonSimpleRun,
  ShieldCheck,
} from '@phosphor-icons/react';
import { getMessages, type Locale } from '@/i18n';
import {
  formatDateTime,
  formatDistance,
  formatDuration,
  formatElevation,
  formatPaceOrSpeed,
  type Units,
} from '@/lib/format';

export interface FeedActivityItem {
  id: string;
  title: string;
  description?: string;
  activityType: 'run' | 'ride' | 'walk' | 'hike';
  source: string;
  visibility: string;
  startedAt: string;
  distanceM: number;
  movingTimeS: number;
  elevationGainM: number;
  avgSpeedMps?: number;
  encodedPolyline: string;
  privacyClipped?: boolean;
  kudosCount: number;
  commentCount: number;
  viewerHasKudos?: boolean;
  author?: {
    id: string;
    handle: string;
    displayName: string;
    homeCity?: string;
  };
}

function PolylinePreviewSvg({ encoded }: { encoded: string }) {
  const pathData = useMemo(() => {
    const pts = decodePolyline(encoded);
    if (pts.length < 2) return null;
    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const dLat = Math.max(0.0005, maxLat - minLat);
    const dLng = Math.max(0.0005, maxLng - minLng);

    const w = 320;
    const h = 110;
    const pad = 12;
    return pts
      .map((p, idx) => {
        const x = pad + ((p.lng - minLng) / dLng) * (w - pad * 2);
        const y = h - pad - ((p.lat - minLat) / dLat) * (h - pad * 2);
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }, [encoded]);

  if (!pathData) {
    return (
      <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-[var(--stride-border-subtle)] bg-[var(--stride-bg-elevated)] text-xs text-[var(--stride-text-muted)]">
        Manual / Protected Entry
      </div>
    );
  }

  return (
    <div className="stride-grid-bg overflow-hidden rounded-xl border border-[var(--stride-border-subtle)] bg-[var(--stride-bg-elevated)] p-2">
      <svg viewBox="0 0 320 110" className="h-24 w-full">
        <path
          d={pathData}
          fill="none"
          stroke="var(--stride-accent)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function ActivityCard({
  activity,
  locale,
  units = 'metric',
  onToggleKudos,
}: {
  activity: FeedActivityItem;
  locale: Locale;
  units?: Units;
  onToggleKudos?: (id: string, currentlyLiked: boolean) => void;
}) {
  const m = getMessages(locale);
  const SportIcon =
    activity.activityType === 'ride'
      ? Bicycle
      : activity.activityType === 'hike'
        ? Mountains
        : activity.activityType === 'walk'
          ? Footprints
          : PersonSimpleRun;

  const avgSpeed =
    activity.avgSpeedMps ??
    (activity.movingTimeS > 0 ? activity.distanceM / activity.movingTimeS : 0);

  return (
    <article className="stride-cinema-card flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--stride-accent-tint)] text-[var(--stride-accent)]">
            <SportIcon size={20} weight="bold" />
          </div>
          <div className="min-w-0">
            {activity.author ? (
              <Link
                href={`/${locale}/u/${activity.author.handle}`}
                className="text-sm font-semibold text-[var(--stride-text-primary)] hover:text-[var(--stride-accent)]"
              >
                {activity.author.displayName}{' '}
                <span className="font-normal text-[var(--stride-text-muted)]">
                  @{activity.author.handle}
                </span>
              </Link>
            ) : null}
            <div className="text-xs text-[var(--stride-text-secondary)]">
              {formatDateTime(activity.startedAt, locale)}
              {activity.author?.homeCity ? ` · ${activity.author.homeCity}` : ''}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {activity.privacyClipped && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--stride-accent-tint)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--stride-accent)]">
              <ShieldCheck size={13} weight="bold" />
              {m.privacy.clippedBadge}
            </span>
          )}
          {activity.visibility !== 'public' && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--stride-border-subtle)] px-2 py-0.5 text-[11px] text-[var(--stride-text-secondary)]">
              <LockKey size={12} weight="bold" />
              {activity.visibility === 'private'
                ? m.privacy.visibilityPrivate
                : m.privacy.visibilityFollowers}
            </span>
          )}
        </div>
      </div>

      <div>
        <Link
          href={`/${locale}/activities/${activity.id}`}
          className="text-lg font-bold text-[var(--stride-text-primary)] hover:text-[var(--stride-accent)]"
        >
          {activity.title}
        </Link>
        {activity.description && (
          <p className="mt-1 line-clamp-2 text-sm text-[var(--stride-text-secondary)]">
            {activity.description}
          </p>
        )}
      </div>

      <Link href={`/${locale}/activities/${activity.id}`} aria-label={activity.title}>
        <PolylinePreviewSvg encoded={activity.encodedPolyline} />
      </Link>

      <div className="grid grid-cols-4 gap-2 rounded-xl bg-[var(--stride-bg-elevated)] p-3 text-center">
        <div>
          <div className="text-[11px] text-[var(--stride-text-muted)]">{m.metrics.distance}</div>
          <div className="font-mono-num text-sm font-bold text-[var(--stride-text-primary)]">
            {formatDistance(activity.distanceM, units, locale)}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-[var(--stride-text-muted)]">{m.metrics.movingTime}</div>
          <div className="font-mono-num text-sm font-bold text-[var(--stride-text-primary)]">
            {formatDuration(activity.movingTimeS)}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-[var(--stride-text-muted)]">
            {activity.activityType === 'ride' ? m.metrics.speed : m.metrics.pace}
          </div>
          <div className="font-mono-num text-sm font-bold text-[var(--stride-text-primary)]">
            {formatPaceOrSpeed(avgSpeed, activity.activityType, units, locale)}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-[var(--stride-text-muted)]">{m.metrics.elevation}</div>
          <div className="font-mono-num text-sm font-bold text-[var(--stride-text-primary)]">
            {formatElevation(activity.elevationGainM, units, locale)}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-[var(--stride-border-subtle)] pt-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onToggleKudos?.(activity.id, Boolean(activity.viewerHasKudos))}
            disabled={!onToggleKudos}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors ${
              activity.viewerHasKudos
                ? 'bg-[var(--stride-accent-tint)] text-[var(--stride-accent)]'
                : 'bg-[var(--stride-bg-elevated)] text-[var(--stride-text-secondary)] hover:text-[var(--stride-text-primary)]'
            }`}
          >
            <Heart size={16} weight={activity.viewerHasKudos ? 'fill' : 'bold'} />
            <span>
              {activity.kudosCount} {m.metrics.kudos}
            </span>
          </button>

          <Link
            href={`/${locale}/activities/${activity.id}#comments`}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-[var(--stride-bg-elevated)] px-3 text-xs font-semibold text-[var(--stride-text-secondary)] hover:text-[var(--stride-text-primary)]"
          >
            <ChatCircle size={16} weight="bold" />
            <span>
              {activity.commentCount} {m.metrics.comments}
            </span>
          </Link>
        </div>

        <Link
          href={`/${locale}/activities/${activity.id}`}
          className="text-xs font-semibold text-[var(--stride-accent)] hover:underline"
        >
          {locale === 'hi' ? 'रूट रीप्ले और विवरण' : 'Replay & Details'}
        </Link>
      </div>
    </article>
  );
}
