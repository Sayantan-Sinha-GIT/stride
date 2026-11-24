'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FilteredTrackPoint } from '@stride/track-engine';
import {
  ArrowsClockwise,
  BookmarkSimple,
  DownloadSimple,
  Flag,
  Heart,
  Pause,
  Play,
  Plus,
  ShieldCheck,
  Trash,
  Trophy,
} from '@phosphor-icons/react';
import { useAuth } from '@/components/AuthProvider';
import { TelemetryChart } from '@/components/charts/TelemetryChart';
import { StrideMap } from '@/components/maps/StrideMap';
import { getMessages, type Locale } from '@/i18n';
import { apiFetch, getClientApiBase, getStoredAccessToken } from '@/lib/api';
import {
  formatDateTime,
  formatDistance,
  formatDuration,
  formatElevation,
  formatPaceOrSpeed,
} from '@/lib/format';

interface ActivityDetailPayload {
  activity: {
    id: string;
    title: string;
    description: string;
    activityType: 'run' | 'ride' | 'walk' | 'hike';
    source: string;
    visibility: 'public' | 'followers' | 'private';
    startedAt: string;
    distanceM: number;
    movingTimeS: number;
    elapsedTimeS: number;
    elevationGainM: number;
    elevationLossM: number;
    avgSpeedMps: number;
    maxSpeedMps: number;
    caloriesEstimate: number;
    encodedPolyline: string;
    privacyClipped: boolean;
    points: FilteredTrackPoint[];
    splitsKm: Array<{
      splitIndex: number;
      distanceM: number;
      movingTimeS: number;
      paceSecPerKm: number | null;
      speedKmh: number;
      elevationGainM: number;
    }>;
    stream: Array<{ t: number; d: number; ele: number; speedKmh: number }>;
    kudosCount: number;
    commentCount: number;
    viewerHasKudos: boolean;
    canEdit: boolean;
    author: { id: string; handle: string; displayName: string; homeCity?: string };
  };
  segmentEfforts: Array<{
    id: string;
    segment_id: string;
    segment_name: string;
    segment_distance_m: number;
    elapsed_time_s: number;
    is_pr: boolean;
    is_flagged: boolean;
    flag_reason?: string;
  }>;
  comments: Array<{
    id: string;
    body: string;
    created_at: string;
    user_id: string;
    handle: string;
    display_name: string;
  }>;
}

export function ActivityDetailClient({
  activityId,
  locale,
}: {
  activityId: string;
  locale: Locale;
}) {
  const m = getMessages(locale);
  const router = useRouter();
  const { user, settings } = useAuth();

  const [data, setData] = useState<ActivityDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Route Replay
  const [playing, setPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [replayProgress, setReplayProgress] = useState<number | undefined>(undefined);

  // Comments & Interactions
  const [commentText, setCommentText] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  // Create Segment Modal
  const [showSegModal, setShowSegModal] = useState(false);
  const [segName, setSegName] = useState('');
  const [segStartIdx, setSegStartIdx] = useState(0);
  const [segEndIdx, setSegEndIdx] = useState(10);
  const [segError, setSegError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ActivityDetailPayload>(`/v1/activities/${activityId}`);
      setData(res);
      if (res.activity.points?.length > 4) {
        setSegStartIdx(Math.floor(res.activity.points.length * 0.1));
        setSegEndIdx(Math.floor(res.activity.points.length * 0.8));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load activity');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [activityId, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setReplayProgress((prev) => {
        const cur = prev ?? 0;
        const next = cur + 0.01 * replaySpeed;
        if (next >= 1) {
          setPlaying(false);
          return 1;
        }
        return Number(next.toFixed(3));
      });
    }, 80);
    return () => window.clearInterval(id);
  }, [playing, replaySpeed]);

  const segmentSlicePoints = useMemo(() => {
    if (!showSegModal || !data?.activity.points?.length) return [];
    return data.activity.points.slice(segStartIdx, segEndIdx + 1);
  }, [showSegModal, data, segStartIdx, segEndIdx]);

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
          <Link href={`/${locale}/feed`} className="stride-btn-secondary mt-4 inline-flex items-center px-5 text-xs">
            {m.common.back}
          </Link>
        </div>
      </div>
    );
  }

  const { activity, segmentEfforts, comments } = data;

  const toggleKudos = async () => {
    if (!user) return router.push(`/${locale}/login`);
    const method = activity.viewerHasKudos ? 'DELETE' : 'POST';
    const res = await apiFetch<{ kudosCount: number; viewerHasKudos: boolean }>(
      `/v1/activities/${activity.id}/kudos`,
      { method }
    );
    setData((prev) =>
      prev
        ? {
            ...prev,
            activity: {
              ...prev.activity,
              kudosCount: res.kudosCount,
              viewerHasKudos: res.viewerHasKudos,
            },
          }
        : prev
    );
  };

  const addComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    const res = await apiFetch<{
      comment: { id: string; body: string; created_at: string; user_id: string; handle: string; display_name: string };
    }>(`/v1/activities/${activity.id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: commentText }),
    });
    setCommentText('');
    setData((prev) =>
      prev
        ? {
            ...prev,
            comments: [...prev.comments, res.comment],
            activity: { ...prev.activity, commentCount: prev.activity.commentCount + 1 },
          }
        : prev
    );
  };

  const deleteComment = async (commentId: string) => {
    await apiFetch(`/v1/activities/${activity.id}/comments/${commentId}`, { method: 'DELETE' });
    setData((prev) =>
      prev
        ? {
            ...prev,
            comments: prev.comments.filter((c) => c.id !== commentId),
            activity: {
              ...prev.activity,
              commentCount: Math.max(0, prev.activity.commentCount - 1),
            },
          }
        : prev
    );
  };

  const changeVisibility = async (visibility: 'public' | 'followers' | 'private') => {
    await apiFetch(`/v1/activities/${activity.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ visibility }),
    });
    setData((prev) =>
      prev ? { ...prev, activity: { ...prev.activity, visibility } } : prev
    );
    setNotice('Visibility updated');
  };

  const recompute = async () => {
    const res = await apiFetch<{ distanceM: number; matchedSegments: number }>(
      `/v1/activities/${activity.id}/recompute`,
      { method: 'POST' }
    );
    setNotice(`Recomputed metrics & matched ${res.matchedSegments} segments`);
    load();
  };

  const saveRoute = async () => {
    await apiFetch('/v1/routes/saved', {
      method: 'POST',
      body: JSON.stringify({
        sourceActivityId: activity.id,
        name: activity.title,
        activityType: activity.activityType,
        distanceM: activity.distanceM,
        elevationGainM: activity.elevationGainM,
        encodedPolyline: activity.encodedPolyline,
      }),
    });
    setNotice('Saved to your routes for offline reference');
  };

  const createSegment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSegError(null);
    try {
      const res = await apiFetch<{ segment: { id: string; name: string } }>('/v1/segments', {
        method: 'POST',
        body: JSON.stringify({
          activityId: activity.id,
          name: segName,
          city: activity.author.homeCity || '',
          startIndex: segStartIdx,
          endIndex: segEndIdx,
        }),
      });
      setShowSegModal(false);
      router.push(`/${locale}/segments/${res.segment.id}`);
    } catch (err) {
      setSegError(err instanceof Error ? err.message : 'Segment validation failed');
    }
  };

  const deleteActivity = async () => {
    await apiFetch(`/v1/activities/${activity.id}`, { method: 'DELETE' });
    router.push(`/${locale}/feed`);
  };

  const reportActivity = async () => {
    if (!user) return router.push(`/${locale}/login`);
    await apiFetch('/v1/reports', {
      method: 'POST',
      body: JSON.stringify({
        targetType: 'activity',
        targetId: activity.id,
        reason: 'Suspicious GPS / Moderation Review',
      }),
    });
    setNotice('Report submitted to moderators.');
  };

  return (
    <div className="mx-auto flex max-w-[1380px] flex-col gap-6 px-4 py-8 md:px-6">
      {notice && (
        <div className="rounded-xl border border-[var(--stride-success)] bg-[rgba(24,184,122,0.12)] px-4 py-2.5 text-xs font-medium text-[var(--stride-success)]">
          {notice}
        </div>
      )}

      {/* Header */}
      <div className="stride-card flex flex-col justify-between gap-4 p-5 md:flex-row md:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--stride-text-secondary)]">
            <Link href={`/${locale}/u/${activity.author.handle}`} className="font-semibold text-[var(--stride-accent)] hover:underline">
              {activity.author.displayName} (@{activity.author.handle})
            </Link>
            <span>·</span>
            <span>{formatDateTime(activity.startedAt, locale)}</span>
            <span>·</span>
            <span className="uppercase">{activity.source}</span>
            {activity.privacyClipped && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--stride-accent-tint)] px-2 py-0.5 font-semibold text-[var(--stride-accent)]">
                <ShieldCheck size={13} weight="bold" />
                {m.privacy.clippedBadge}
              </span>
            )}
          </div>
          <h1 className="mt-1 text-2xl font-bold text-[var(--stride-text-primary)] md:text-3xl">
            {activity.title}
          </h1>
          {activity.description && (
            <p className="mt-1 text-sm text-[var(--stride-text-secondary)]">{activity.description}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleKudos}
            className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 text-xs font-semibold ${
              activity.viewerHasKudos
                ? 'bg-[var(--stride-accent)] text-white'
                : 'border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)]'
            }`}
          >
            <Heart size={15} weight={activity.viewerHasKudos ? 'fill' : 'bold'} />
            <span>{activity.kudosCount}</span>
          </button>

          {activity.encodedPolyline && (
            <button
              type="button"
              onClick={async () => {
                const token = getStoredAccessToken();
                const res = await fetch(`${getClientApiBase()}/v1/activities/${activity.id}/gpx`, {
                  headers: token ? { Authorization: `Bearer ${token}` } : {},
                  credentials: 'include',
                });
                if (!res.ok) return;
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `stride-${activity.id.slice(0, 8)}.gpx`;
                link.click();
                URL.revokeObjectURL(url);
              }}
              className="stride-btn-secondary inline-flex items-center gap-1.5 px-3.5 text-xs"
            >
              <DownloadSimple size={15} weight="bold" />
              <span>GPX</span>
            </button>
          )}

          {user && activity.encodedPolyline && (
            <button
              type="button"
              onClick={saveRoute}
              className="stride-btn-secondary inline-flex items-center gap-1.5 px-3.5 text-xs"
            >
              <BookmarkSimple size={15} weight="bold" />
              <span>Save Route</span>
            </button>
          )}

          {activity.canEdit && (
            <>
              <select
                value={activity.visibility}
                onChange={(e) => changeVisibility(e.target.value as 'public' | 'followers' | 'private')}
                aria-label="Activity visibility"
                className="min-h-[40px] rounded-full border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-xs font-semibold"
              >
                <option value="public">{m.privacy.visibilityPublic}</option>
                <option value="followers">{m.privacy.visibilityFollowers}</option>
                <option value="private">{m.privacy.visibilityPrivate}</option>
              </select>
              {activity.points.length >= 6 && activity.source !== 'manual' && (
                <button
                  type="button"
                  onClick={() => setShowSegModal((v) => !v)}
                  className="stride-btn-primary inline-flex items-center gap-1.5 px-3.5 text-xs"
                >
                  <Plus size={15} weight="bold" />
                  <span>Create Segment</span>
                </button>
              )}
              <button
                type="button"
                onClick={recompute}
                title="Recompute metrics & segment matches"
                className="stride-btn-secondary px-3 text-xs"
              >
                <ArrowsClockwise size={15} weight="bold" />
              </button>
              <button
                type="button"
                onClick={deleteActivity}
                title="Delete activity"
                className="stride-btn-secondary px-3 text-xs text-[var(--stride-danger)]"
              >
                <Trash size={15} weight="bold" />
              </button>
            </>
          )}

          {!activity.canEdit && (
            <button
              type="button"
              onClick={reportActivity}
              className="stride-btn-secondary inline-flex items-center gap-1 px-3 text-xs"
            >
              <Flag size={14} weight="bold" />
              <span>Report</span>
            </button>
          )}
        </div>
      </div>

      {/* Create Segment Inline Panel */}
      {showSegModal && (
        <form onSubmit={createSegment} className="stride-card flex flex-col gap-3 border-[var(--stride-accent)] p-5">
          <h2 className="text-base font-bold">Create Competitive Segment from This Route</h2>
          {segError && (
            <div className="rounded-xl border border-[var(--stride-danger)] bg-[rgba(239,68,68,0.12)] px-3.5 py-2 text-xs font-medium text-[var(--stride-danger)]">
              {segError}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Segment Name
              <input
                type="text"
                required
                minLength={3}
                value={segName}
                onChange={(e) => setSegName(e.target.value)}
                placeholder="Kings Way Climb"
                className="min-h-[40px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Start Point Index ({segStartIdx})
              <input
                type="range"
                min={0}
                max={Math.max(1, activity.points.length - 5)}
                value={segStartIdx}
                onChange={(e) => setSegStartIdx(Math.min(Number(e.target.value), segEndIdx - 3))}
                className="accent-[var(--stride-accent)]"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              End Point Index ({segEndIdx})
              <input
                type="range"
                min={3}
                max={Math.max(4, activity.points.length - 1)}
                value={segEndIdx}
                onChange={(e) => setSegEndIdx(Math.max(Number(e.target.value), segStartIdx + 3))}
                className="accent-[var(--stride-accent)]"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="stride-btn-primary px-5 text-xs">
              Publish Segment & Backfill Leaderboard
            </button>
            <button type="button" onClick={() => setShowSegModal(false)} className="stride-btn-secondary px-4 text-xs">
              {m.common.cancel}
            </button>
          </div>
        </form>
      )}

      {/* Map + Replay Controls */}
      {activity.points.length >= 2 && (
        <div className="stride-card flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (replayProgress == null || replayProgress >= 1) setReplayProgress(0);
                  setPlaying((v) => !v);
                }}
                className="stride-btn-primary inline-flex min-h-[38px] items-center gap-1.5 px-4 text-xs"
              >
                {playing ? <Pause size={14} weight="fill" /> : <Play size={14} weight="fill" />}
                <span>{playing ? 'Pause Replay' : 'Animated Route Replay'}</span>
              </button>
              {[1, 4, 8].map((sp) => (
                <button
                  key={sp}
                  type="button"
                  onClick={() => setReplaySpeed(sp)}
                  className={`min-h-[34px] rounded-full px-3 text-xs font-semibold ${
                    replaySpeed === sp
                      ? 'bg-[var(--stride-accent-tint)] text-[var(--stride-accent)]'
                      : 'bg-[var(--stride-bg-elevated)] text-[var(--stride-text-secondary)]'
                  }`}
                >
                  {sp}x
                </button>
              ))}
            </div>
            {replayProgress != null && (
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(replayProgress * 100)}
                onChange={(e) => {
                  setPlaying(false);
                  setReplayProgress(Number(e.target.value) / 100);
                }}
                aria-label="Replay progress"
                className="w-48 accent-[var(--stride-accent)]"
              />
            )}
          </div>

          <StrideMap
            points={showSegModal && segmentSlicePoints.length >= 2 ? segmentSlicePoints : activity.points}
            replayProgress={replayProgress}
            heightClass="h-[380px]"
            pitch={42}
          />
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: m.metrics.distance, val: formatDistance(activity.distanceM, settings.units, locale) },
          { label: m.metrics.movingTime, val: formatDuration(activity.movingTimeS) },
          { label: m.metrics.elapsedTime, val: formatDuration(activity.elapsedTimeS) },
          {
            label: activity.activityType === 'ride' ? m.metrics.speed : m.metrics.pace,
            val: formatPaceOrSpeed(activity.avgSpeedMps, activity.activityType, settings.units, locale),
          },
          { label: m.metrics.elevation, val: formatElevation(activity.elevationGainM, settings.units, locale) },
          { label: m.metrics.calories, val: `~${activity.caloriesEstimate} kcal` },
        ].map((stat) => (
          <div key={stat.label} className="stride-card p-4">
            <div className="text-xs text-[var(--stride-text-muted)]">{stat.label}</div>
            <div className="font-mono-num mt-1 text-lg font-bold text-[var(--stride-text-primary)]">{stat.val}</div>
          </div>
        ))}
      </div>
      <p className="text-right text-[11px] text-[var(--stride-text-muted)]">{m.metrics.caloriesNote}</p>

      {/* Elevation Chart */}
      <TelemetryChart
        stream={activity.stream}
        progressRatio={replayProgress}
        onSelectProgress={(r) => {
          setPlaying(false);
          setReplayProgress(r);
        }}
      />

      {/* Segments + Splits + Comments */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-7">
          {/* Matched Segments */}
          <div className="stride-card p-5">
            <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
              <Trophy size={18} weight="bold" className="text-[var(--stride-accent)]" />
              <span>Matched Segments ({segmentEfforts.length})</span>
            </h2>
            {segmentEfforts.length === 0 ? (
              <p className="text-xs text-[var(--stride-text-muted)]">No segments matched on this activity.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {segmentEfforts.map((eff) => (
                  <Link
                    key={eff.id}
                    href={`/${locale}/segments/${eff.segment_id}`}
                    className="flex items-center justify-between rounded-xl border border-[var(--stride-border-subtle)] bg-[var(--stride-bg-elevated)] px-3.5 py-2.5 text-xs hover:border-[var(--stride-accent)]"
                  >
                    <div>
                      <div className="font-semibold text-[var(--stride-text-primary)]">{eff.segment_name}</div>
                      <div className="text-[var(--stride-text-muted)]">
                        {formatDistance(eff.segment_distance_m, settings.units, locale)}
                        {eff.is_flagged && (
                          <span className="ml-2 text-[var(--stride-danger)]">Flagged: {eff.flag_reason}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {eff.is_pr && (
                        <span className="rounded-full bg-[var(--stride-accent)] px-2 py-0.5 text-[10px] font-bold text-white">
                          PR
                        </span>
                      )}
                      <span className="font-mono-num text-sm font-bold">{formatDuration(eff.elapsed_time_s)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Splits */}
          {activity.splitsKm?.length > 0 && (
            <div className="stride-card overflow-x-auto p-5">
              <h2 className="mb-3 text-base font-bold">Kilometer Splits</h2>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--stride-border-subtle)] text-[var(--stride-text-muted)]">
                    <th className="py-2">KM</th>
                    <th className="py-2">Time</th>
                    <th className="py-2">Pace / Speed</th>
                    <th className="py-2">Elev +</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.splitsKm.map((sp) => (
                    <tr key={sp.splitIndex} className="border-b border-[var(--stride-border-subtle)]">
                      <td className="font-mono-num py-2 font-semibold">{sp.splitIndex}</td>
                      <td className="font-mono-num py-2">{formatDuration(sp.movingTimeS)}</td>
                      <td className="font-mono-num py-2">
                        {sp.paceSecPerKm ? `${Math.floor(sp.paceSecPerKm / 60)}:${String(sp.paceSecPerKm % 60).padStart(2, '0')}/km` : `${sp.speedKmh} km/h`}
                      </td>
                      <td className="font-mono-num py-2">+{sp.elevationGainM}m</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Comments Column */}
        <div id="comments" className="stride-card flex flex-col gap-4 p-5 lg:col-span-5">
          <h2 className="text-base font-bold">
            {m.metrics.comments} ({comments.length})
          </h2>

          {user && (
            <form onSubmit={addComment} className="flex gap-2">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Write a comment or kudos note..."
                className="min-h-[42px] flex-1 rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-xs"
              />
              <button type="submit" className="stride-btn-primary px-4 text-xs">
                Post
              </button>
            </form>
          )}

          <div className="flex flex-col gap-3">
            {comments.length === 0 ? (
              <p className="text-xs text-[var(--stride-text-muted)]">No comments yet.</p>
            ) : (
              comments.map((cm) => (
                <div
                  key={cm.id}
                  className="flex items-start justify-between gap-2 rounded-xl border border-[var(--stride-border-subtle)] bg-[var(--stride-bg-elevated)] p-3 text-xs"
                >
                  <div>
                    <Link href={`/${locale}/u/${cm.handle}`} className="font-semibold text-[var(--stride-text-primary)] hover:text-[var(--stride-accent)]">
                      {cm.display_name} (@{cm.handle})
                    </Link>
                    <p className="mt-1 text-[var(--stride-text-secondary)]">{cm.body}</p>
                  </div>
                  {(user?.id === cm.user_id || activity.canEdit || user?.role === 'admin') && (
                    <button
                      type="button"
                      onClick={() => deleteComment(cm.id)}
                      aria-label="Delete comment"
                      className="text-[var(--stride-text-muted)] hover:text-[var(--stride-danger)]"
                    >
                      <Trash size={14} weight="bold" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
