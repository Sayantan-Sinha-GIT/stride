'use client';

import React, { use, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { processTrack, type ActivityType, type RawTrackPoint } from '@stride/track-engine';
import {
  FileArrowUp,
  NotePencil,
  Pause,
  Play,
  Record,
  ShieldWarning,
  Stop,
  Trash,
} from '@phosphor-icons/react';
import { useAuth } from '@/components/AuthProvider';
import { StrideMap } from '@/components/maps/StrideMap';
import { getMessages, normalizeLocale } from '@/i18n';
import { apiFetch } from '@/lib/api';
import { formatDistance, formatDuration, formatElevation } from '@/lib/format';

const DRAFT_KEY = 'stride_unfinished_recording_v1';

const SIM_WAYPOINTS: Array<[number, number]> = [
  [12.9762, 77.5929],
  [12.9776, 77.5941],
  [12.979, 77.5956],
  [12.9788, 77.5982],
  [12.9768, 77.5999],
  [12.9746, 77.5998],
  [12.9726, 77.5974],
  [12.9731, 77.5942],
  [12.9752, 77.5924],
];

export default function RecordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = use(params);
  const locale = normalizeLocale(raw);
  const m = getMessages(locale);
  const router = useRouter();
  const { user, settings } = useAuth();

  const [tab, setTab] = useState<'gps' | 'gpx' | 'manual'>('gps');
  const [safetyDismissed, setSafetyDismissed] = useState(false);

  // Live GPS + Simulator State
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'paused'>('idle');
  const [simMode, setSimMode] = useState(true);
  const [autoPause, setAutoPause] = useState(true);
  const [activityType, setActivityType] = useState<ActivityType>('run');
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'followers' | 'private'>(
    settings.defaultVisibility || 'followers'
  );
  const [points, setPoints] = useState<RawTrackPoint[]>([]);
  const [unfinishedDraft, setUnfinishedDraft] = useState<{
    activityType: ActivityType;
    points: RawTrackPoint[];
  } | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const simStepRef = useRef(0);

  // GPX Import State
  const [gpxFile, setGpxFile] = useState<File | null>(null);
  const [gpxText, setGpxText] = useState('');

  // Manual Entry State
  const [manualDistanceKm, setManualDistanceKm] = useState('5.0');
  const [manualMinutes, setManualMinutes] = useState('30');
  const [manualElevM, setManualElevM] = useState('25');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check crash recovery draft on mount
  useEffect(() => {
    try {
      const rawDraft = localStorage.getItem(DRAFT_KEY);
      if (rawDraft) {
        const parsed = JSON.parse(rawDraft) as { activityType: ActivityType; points: RawTrackPoint[] };
        if (parsed.points?.length >= 2) {
          setUnfinishedDraft(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Persist points continuously for crash recovery
  useEffect(() => {
    if (points.length >= 2) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ activityType, points }));
    }
  }, [points, activityType]);

  // GPS Simulator / Geolocation Ticker
  useEffect(() => {
    if (recordingState !== 'recording') {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (simMode) {
      const timer = window.setInterval(() => {
        setPoints((prev) => {
          const step = simStepRef.current++;
          const seg = Math.floor(step / 5) % (SIM_WAYPOINTS.length - 1);
          const frac = (step % 5) / 5;
          const [lat1, lng1] = SIM_WAYPOINTS[seg];
          const [lat2, lng2] = SIM_WAYPOINTS[seg + 1];
          const pt: RawTrackPoint = {
            lat: lat1 + (lat2 - lat1) * frac,
            lng: lng1 + (lng2 - lng1) * frac,
            ele: 920 + Math.sin(step * 0.35) * 8,
            time: Date.now(),
            accuracyM: 5,
          };
          return [...prev, pt];
        });
      }, 1000);
      return () => window.clearInterval(timer);
    }

    if (!navigator.geolocation) {
      setError('Browser geolocation unavailable. Switch on GPS Simulation Mode to test.');
      setRecordingState('paused');
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (autoPause && pos.coords.speed != null && pos.coords.speed < 0.45 && points.length > 2) {
          return;
        }
        setPoints((prev) => [
          ...prev,
          {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            ele: pos.coords.altitude ?? 0,
            time: pos.timestamp || Date.now(),
            accuracyM: pos.coords.accuracy ?? 12,
          },
        ]);
      },
      (geoErr) => {
        setError(`GPS error: ${geoErr.message}. Enable GPS Simulator to test indoors.`);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [recordingState, simMode, autoPause, points.length]);

  const liveMetrics = useMemo(() => {
    if (points.length < 2) return null;
    return processTrack(points, { activityType, weightKg: user?.weightKg || 70 });
  }, [points, activityType, user?.weightKg]);

  const saveRecorded = async () => {
    if (!user) {
      router.push(`/${locale}/login`);
      return;
    }
    if (points.length < 2) {
      setError('Record at least 2 GPS points before saving.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const clientId = `web-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const res = await apiFetch<{ activity: { id: string } }>('/v1/activities', {
        method: 'POST',
        headers: { 'Idempotency-Key': clientId },
        body: JSON.stringify({
          clientId,
          title: title.trim() || `${activityType.toUpperCase()} — ${new Date().toLocaleTimeString()}`,
          activityType,
          source: 'recorded',
          visibility,
          points,
        }),
      });
      localStorage.removeItem(DRAFT_KEY);
      router.push(`/${locale}/activities/${res.activity.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : m.common.error);
    } finally {
      setSaving(false);
    }
  };

  const handleImportGpx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      router.push(`/${locale}/login`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let res: { activity: { id: string } };
      if (gpxFile) {
        const fd = new FormData();
        fd.append('file', gpxFile);
        if (title) fd.append('title', title);
        fd.append('activityType', activityType);
        fd.append('visibility', visibility);
        res = await apiFetch('/v1/activities/import-gpx', { method: 'POST', body: fd });
      } else {
        res = await apiFetch('/v1/activities/import-gpx', {
          method: 'POST',
          body: JSON.stringify({ gpx: gpxText, title: title || undefined, activityType, visibility }),
        });
      }
      router.push(`/${locale}/activities/${res.activity.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : m.common.error);
    } finally {
      setSaving(false);
    }
  };

  const handleManualSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      router.push(`/${locale}/login`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<{ activity: { id: string } }>('/v1/activities', {
        method: 'POST',
        body: JSON.stringify({
          clientId: `manual-${Date.now()}`,
          title: title.trim() || `Manual ${activityType}`,
          activityType,
          source: 'manual',
          visibility,
          distanceM: Math.round(Number(manualDistanceKm) * 1000),
          durationS: Math.round(Number(manualMinutes) * 60),
          elevationGainM: Math.round(Number(manualElevM)),
        }),
      });
      router.push(`/${locale}/activities/${res.activity.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : m.common.error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1120px] px-4 py-8 md:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--stride-text-primary)]">{m.nav.record}</h1>
          <p className="text-sm text-[var(--stride-text-secondary)]">
            {locale === 'hi'
              ? 'लाइव GPS रिकॉर्ड करें, सिम्युलेटर चलाएं, GPX अपलोड करें या मैनुअल लॉग जोड़ें।'
              : 'Record with GPS / Dev Simulator, import GPX 1.1 tracks, or log a manual workout.'}
          </p>
        </div>

        {!user && (
          <Link href={`/${locale}/login`} className="stride-btn-primary px-4 text-xs flex items-center">
            {m.nav.login}
          </Link>
        )}
      </div>

      {/* Non-intrusive Outdoor Safety Reminder (PRD §9) */}
      {!safetyDismissed && (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-[var(--stride-warning)] bg-[rgba(245,158,11,0.1)] px-4 py-3 text-xs">
          <div className="flex items-center gap-2 text-[var(--stride-text-primary)]">
            <ShieldWarning size={18} weight="bold" className="shrink-0 text-[var(--stride-warning)]" />
            <span>
              {locale === 'hi'
                ? 'सड़क पर सतर्क रहें, ट्रैफ़िक नियमों का पालन करें और कम रोशनी में चमकदार कपड़े पहनें।'
                : 'Safety reminder: Watch traffic, follow local road rules, and stay visible in low light.'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSafetyDismissed(true)}
            className="shrink-0 font-semibold text-[var(--stride-accent)] hover:underline"
          >
            Got it
          </button>
        </div>
      )}

      {/* Crash Recovery Banner */}
      {unfinishedDraft && recordingState === 'idle' && points.length === 0 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--stride-accent)] bg-[var(--stride-accent-tint)] p-4 text-xs">
          <span>
            Unfinished recording recovered ({unfinishedDraft.points.length} GPS points). Resume or discard?
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setActivityType(unfinishedDraft.activityType);
                setPoints(unfinishedDraft.points);
                setUnfinishedDraft(null);
              }}
              className="stride-btn-primary px-3.5 text-xs"
            >
              Recover Track
            </button>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem(DRAFT_KEY);
                setUnfinishedDraft(null);
              }}
              className="stride-btn-secondary px-3.5 text-xs"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-[var(--stride-danger)] bg-[rgba(239,68,68,0.12)] px-4 py-3 text-xs text-[var(--stride-danger)]">
          {error}
        </div>
      )}

      {/* Mode Tabs */}
      <div className="mb-5 flex flex-wrap gap-2">
        {[
          { id: 'gps', label: 'Live GPS / Simulator', icon: Record },
          { id: 'gpx', label: 'GPX 1.1 Import', icon: FileArrowUp },
          { id: 'manual', label: 'Manual Entry', icon: NotePencil },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as 'gps' | 'gpx' | 'manual')}
              className={`inline-flex min-h-[42px] items-center gap-2 rounded-full px-4 text-xs font-semibold ${
                tab === t.id
                  ? 'bg-[var(--stride-accent)] text-white'
                  : 'border border-[var(--stride-border-strong)] bg-[var(--stride-bg-surface)] text-[var(--stride-text-secondary)]'
              }`}
            >
              <Icon size={16} weight="bold" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Common Metadata Row */}
      <div className="stride-card mb-5 grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--stride-text-secondary)]">
          Activity Title
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Morning Tempo Run"
            className="min-h-[42px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-sm text-[var(--stride-text-primary)]"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--stride-text-secondary)]">
          Sport Type
          <select
            value={activityType}
            onChange={(e) => setActivityType(e.target.value as ActivityType)}
            className="min-h-[42px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-sm text-[var(--stride-text-primary)]"
          >
            <option value="run">{m.sports.run}</option>
            <option value="ride">{m.sports.ride}</option>
            <option value="walk">{m.sports.walk}</option>
            <option value="hike">{m.sports.hike}</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--stride-text-secondary)]">
          Visibility
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as 'public' | 'followers' | 'private')}
            className="min-h-[42px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-sm text-[var(--stride-text-primary)]"
          >
            <option value="followers">{m.privacy.visibilityFollowers}</option>
            <option value="public">{m.privacy.visibilityPublic}</option>
            <option value="private">{m.privacy.visibilityPrivate}</option>
          </select>
        </label>
      </div>

      {tab === 'gps' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="stride-card flex flex-col gap-4 p-5 lg:col-span-5">
            <div className="flex items-center justify-between text-xs">
              <label className="flex cursor-pointer items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  checked={simMode}
                  onChange={(e) => setSimMode(e.target.checked)}
                  className="h-4 w-4 accent-[var(--stride-accent)]"
                />
                <span>Dev GPS Simulator (Indoors Test)</span>
              </label>

              <label className="flex cursor-pointer items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  checked={autoPause}
                  onChange={(e) => setAutoPause(e.target.checked)}
                  className="h-4 w-4 accent-[var(--stride-accent)]"
                />
                <span>Auto-Pause</span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-xl bg-[var(--stride-bg-elevated)] p-4 text-center">
              <div>
                <div className="text-[11px] text-[var(--stride-text-muted)]">{m.metrics.distance}</div>
                <div className="font-mono-num text-xl font-bold">
                  {formatDistance(liveMetrics?.distanceM || 0, settings.units, locale)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[var(--stride-text-muted)]">{m.metrics.movingTime}</div>
                <div className="font-mono-num text-xl font-bold">
                  {formatDuration(liveMetrics?.movingTimeS || 0)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[var(--stride-text-muted)]">{m.metrics.elevation}</div>
                <div className="font-mono-num text-lg font-bold">
                  {formatElevation(liveMetrics?.elevationGainM || 0, settings.units, locale)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[var(--stride-text-muted)]">GPS Points</div>
                <div className="font-mono-num text-lg font-bold">{points.length}</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {recordingState !== 'recording' ? (
                <button
                  type="button"
                  onClick={() => setRecordingState('recording')}
                  className="stride-btn-primary flex flex-1 items-center justify-center gap-2 text-sm"
                >
                  <Play size={16} weight="fill" />
                  <span>{points.length > 0 ? 'Resume' : 'Start Recording'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setRecordingState('paused')}
                  className="stride-btn-secondary flex flex-1 items-center justify-center gap-2 text-sm"
                >
                  <Pause size={16} weight="fill" />
                  <span>Pause</span>
                </button>
              )}

              {points.length >= 2 && (
                <>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={saveRecorded}
                    className="stride-btn-primary flex flex-1 items-center justify-center gap-2 text-sm"
                  >
                    <Stop size={16} weight="fill" />
                    <span>{saving ? 'Saving...' : 'Stop & Save'}</span>
                  </button>
                  <button
                    type="button"
                    aria-label="Discard recording"
                    onClick={() => {
                      setRecordingState('idle');
                      setPoints([]);
                      localStorage.removeItem(DRAFT_KEY);
                    }}
                    className="stride-btn-secondary px-3 text-[var(--stride-danger)]"
                  >
                    <Trash size={16} weight="bold" />
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="lg:col-span-7">
            <StrideMap points={points} heightClass="h-[380px]" pitch={35} />
          </div>
        </div>
      )}

      {tab === 'gpx' && (
        <form onSubmit={handleImportGpx} className="stride-card flex flex-col gap-4 p-6">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--stride-text-secondary)]">
            Upload GPX 1.1 File (Max 5 MB)
            <input
              type="file"
              accept=".gpx,application/gpx+xml,text/xml"
              onChange={(e) => setGpxFile(e.target.files?.[0] || null)}
              className="rounded-xl border border-dashed border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] p-4 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--stride-text-secondary)]">
            Or Paste GPX XML Directly
            <textarea
              rows={6}
              value={gpxText}
              onChange={(e) => setGpxText(e.target.value)}
              placeholder="<gpx version='1.1'>...</gpx>"
              className="font-mono-num rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] p-3 text-xs"
            />
          </label>
          <button type="submit" disabled={saving || (!gpxFile && !gpxText.trim())} className="stride-btn-primary w-fit px-6 text-sm">
            {saving ? 'Importing...' : 'Import & Match Segments'}
          </button>
        </form>
      )}

      {tab === 'manual' && (
        <form onSubmit={handleManualSave} className="stride-card flex flex-col gap-4 p-6">
          <p className="text-xs text-[var(--stride-text-secondary)]">
            Manual entries count toward goals, totals, and weekly streaks, and are automatically flagged as ineligible for segment leaderboards.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--stride-text-secondary)]">
              Distance (km)
              <input
                type="number"
                step="0.1"
                min="0.1"
                required
                value={manualDistanceKm}
                onChange={(e) => setManualDistanceKm(e.target.value)}
                className="min-h-[42px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--stride-text-secondary)]">
              Duration (minutes)
              <input
                type="number"
                min="1"
                required
                value={manualMinutes}
                onChange={(e) => setManualMinutes(e.target.value)}
                className="min-h-[42px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--stride-text-secondary)]">
              Elevation Gain (m)
              <input
                type="number"
                min="0"
                value={manualElevM}
                onChange={(e) => setManualElevM(e.target.value)}
                className="min-h-[42px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-sm"
              />
            </label>
          </div>
          <button type="submit" disabled={saving} className="stride-btn-primary w-fit px-6 text-sm">
            {saving ? 'Saving...' : 'Save Manual Activity'}
          </button>
        </form>
      )}
    </div>
  );
}
