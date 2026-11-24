'use client';

import React, { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  DownloadSimple,
  Gear,
  Key,
  MapPin,
  ShieldCheck,
  SignOut,
  Trash,
} from '@phosphor-icons/react';
import { useAuth, type SessionSettings } from '@/components/AuthProvider';
import { StrideMap, type MapOverlayZone } from '@/components/maps/StrideMap';
import { useTheme, type ThemeMode } from '@/components/ThemeProvider';
import { getMessages, normalizeLocale } from '@/i18n';
import { apiFetch, clearAuthTokens } from '@/lib/api';

interface ZoneRow extends MapOverlayZone {
  id: string;
  name: string;
}

interface SessionRow {
  id: string;
  deviceName: string;
  ipHint: string;
  lastSeenAt: string;
  isCurrent: boolean;
}

export default function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = use(params);
  const locale = normalizeLocale(raw);
  const m = getMessages(locale);
  const router = useRouter();
  const { user, refreshMe } = useAuth();
  const { mode, setMode } = useTheme();

  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState('');
  const [homeCity, setHomeCity] = useState('');
  const [weightKg, setWeightKg] = useState('70');

  const [language, setLanguage] = useState<'en' | 'hi'>(locale);
  const [units, setUnits] = useState<'metric' | 'imperial'>('metric');
  const [defaultVis, setDefaultVis] = useState<'public' | 'followers' | 'private'>('followers');
  const [hideStartEnd, setHideStartEnd] = useState('0');
  const [isPrivateAcc, setIsPrivateAcc] = useState(false);

  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [zoneName, setZoneName] = useState('Home');
  const [zoneLat, setZoneLat] = useState(12.9762);
  const [zoneLng, setZoneLng] = useState(77.5929);
  const [zoneRadius, setZoneRadius] = useState(250);

  const [notifPrefs, setNotifPrefs] = useState<Record<string, unknown>>({});
  const [providers, setProviders] = useState<string[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (!user) return;
    try {
      const [meRes, zoneRes, notifRes, sessRes] = await Promise.all([
        apiFetch<{
          user: { displayName: string; handle: string; bio: string; homeCity: string; weightKg: number };
          settings: SessionSettings;
          providers: string[];
        }>('/v1/me'),
        apiFetch<{ privacyZones: ZoneRow[] }>('/v1/me/privacy-zones'),
        apiFetch<{ preferences: Record<string, unknown> }>('/v1/me/notifications/preferences'),
        apiFetch<{ sessions: SessionRow[] }>('/v1/auth/sessions'),
      ]);
      setDisplayName(meRes.user.displayName);
      setHandle(meRes.user.handle);
      setBio(meRes.user.bio);
      setHomeCity(meRes.user.homeCity);
      setWeightKg(String(meRes.user.weightKg || 70));
      setLanguage(meRes.settings.language);
      setUnits(meRes.settings.units);
      setDefaultVis(meRes.settings.defaultVisibility);
      setHideStartEnd(String(meRes.settings.hideStartEndMeters || 0));
      setIsPrivateAcc(meRes.settings.isPrivateAccount);
      setProviders(meRes.providers || []);
      setZones(zoneRes.privacyZones || []);
      setNotifPrefs(notifRes.preferences || {});
      setSessions(sessRes.sessions || []);
    } catch {
      // ignore
    }
  }, [user]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <div className="stride-card flex flex-col gap-4 p-8">
          <h1 className="text-xl font-bold">{m.nav.settings}</h1>
          <p className="text-sm text-[var(--stride-text-secondary)]">Sign in to manage profile, privacy zones, devices & exports.</p>
          <Link href={`/${locale}/login`} className="stride-btn-primary flex items-center justify-center">
            {m.nav.login}
          </Link>
        </div>
      </div>
    );
  }

  const saveProfileAndPrefs = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      await apiFetch('/v1/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          displayName,
          handle,
          bio,
          homeCity,
          weightKg: Number(weightKg),
        }),
      });
      await apiFetch('/v1/me/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          theme: mode,
          language,
          units,
          defaultVisibility: defaultVis,
          hideStartEndMeters: Number(hideStartEnd),
          isPrivateAccount: isPrivateAcc,
        }),
      });
      document.cookie = `stride_lang=${language}; Path=/; Max-Age=${365 * 86400}; SameSite=Lax`;
      await refreshMe();
      setNotice('Profile and preferences saved.');
      if (language !== locale) {
        router.push(`/${language}/settings`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const addPrivacyZone = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/v1/me/privacy-zones', {
        method: 'POST',
        body: JSON.stringify({
          name: zoneName,
          lat: zoneLat,
          lng: zoneLng,
          radiusMeters: zoneRadius,
        }),
      });
      setNotice(`Added privacy zone "${zoneName}" (${zoneRadius}m).`);
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add privacy zone');
    }
  };

  const removeZone = async (id: string) => {
    setError(null);
    try {
      await apiFetch(`/v1/me/privacy-zones/${id}`, { method: 'DELETE' });
      setZones((prev) => prev.filter((z) => z.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove zone');
    }
  };

  const saveNotifPrefs = async (next: Record<string, unknown>) => {
    setError(null);
    setNotifPrefs(next);
    try {
      await apiFetch('/v1/me/notifications/preferences', {
        method: 'PATCH',
        body: JSON.stringify(next),
      });
      setNotice('Notification preferences updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save notification preferences');
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/v1/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setNotice('Password changed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password change failed');
    }
  };

  const revokeSession = async (id: string) => {
    setError(null);
    try {
      await apiFetch(`/v1/auth/sessions/${id}`, { method: 'DELETE' });
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to revoke session');
    }
  };

  const downloadExport = async () => {
    setError(null);
    try {
      const data = await apiFetch('/v1/me/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stride-export-${user.handle}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const deleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') return;
    setError(null);
    try {
      await apiFetch('/v1/me', { method: 'DELETE' });
      clearAuthTokens();
      router.push(`/${locale}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Account deletion failed');
    }
  };

  return (
    <div className="mx-auto flex max-w-[1160px] flex-col gap-6 px-4 py-8 md:px-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Gear size={24} weight="bold" className="text-[var(--stride-accent)]" />
        <span>{m.nav.settings}</span>
      </h1>

      {notice && (
        <div className="rounded-xl border border-[var(--stride-success)] bg-[rgba(24,184,122,0.12)] px-4 py-2.5 text-xs text-[var(--stride-success)]">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-[var(--stride-danger)] bg-[rgba(239,68,68,0.12)] px-4 py-2.5 text-xs text-[var(--stride-danger)]">
          {error}
        </div>
      )}

      {/* Profile, Appearance, Language & Units */}
      <form onSubmit={saveProfileAndPrefs} className="stride-card flex flex-col gap-4 p-6">
        <h2 className="text-lg font-bold">Profile, Appearance & Privacy Defaults</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Display Name
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="min-h-[42px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Handle
            <input
              type="text"
              required
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              className="min-h-[42px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Home City
            <input
              type="text"
              value={homeCity}
              onChange={(e) => setHomeCity(e.target.value)}
              className="min-h-[42px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Weight (kg, for MET calorie estimate)
            <input
              type="number"
              min="25"
              max="250"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              className="min-h-[42px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold md:col-span-2">
            Bio
            <textarea
              rows={2}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] p-3 text-sm"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Theme
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as ThemeMode)}
              className="min-h-[42px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-sm"
            >
              <option value="system">{m.theme.system}</option>
              <option value="dark">{m.theme.dark}</option>
              <option value="light">{m.theme.light}</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold">
            Language (भाषा)
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'en' | 'hi')}
              className="min-h-[42px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-sm"
            >
              <option value="en">English</option>
              <option value="hi">हिन्दी (Hindi)</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold">
            Units
            <select
              value={units}
              onChange={(e) => setUnits(e.target.value as 'metric' | 'imperial')}
              className="min-h-[42px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-sm"
            >
              <option value="metric">Metric (km, m)</option>
              <option value="imperial">Imperial (mi, ft)</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold">
            Default Visibility
            <select
              value={defaultVis}
              onChange={(e) => setDefaultVis(e.target.value as typeof defaultVis)}
              className="min-h-[42px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-sm"
            >
              <option value="followers">Followers Only</option>
              <option value="public">Public</option>
              <option value="private">Only Me</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-xs">
          <label className="flex items-center gap-2 font-semibold">
            Hide start/end meters:
            <input
              type="number"
              min="0"
              max="2000"
              step="50"
              value={hideStartEnd}
              onChange={(e) => setHideStartEnd(e.target.value)}
              className="w-24 rounded-lg border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-2 py-1"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2 font-semibold">
            <input
              type="checkbox"
              checked={isPrivateAcc}
              onChange={(e) => setIsPrivateAcc(e.target.checked)}
              className="h-4 w-4 accent-[var(--stride-accent)]"
            />
            <span>Private account (require follow approval)</span>
          </label>
        </div>

        <button type="submit" className="stride-btn-primary w-fit px-6 text-xs">
          {m.common.save}
        </button>
      </form>

      {/* Interactive Privacy Zones */}
      <div className="stride-card grid grid-cols-1 gap-6 p-6 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-5">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <ShieldCheck size={20} weight="bold" className="text-[var(--stride-warning)]" />
            <span>Privacy Zones</span>
          </h2>
          <p className="text-xs text-[var(--stride-text-secondary)]">
            Click anywhere on the map to pick coordinates. Portions of routes inside your privacy zones are stripped server-side before anyone else can view or download them.
          </p>

          <form onSubmit={addPrivacyZone} className="flex flex-col gap-2.5 text-xs">
            <input
              type="text"
              required
              value={zoneName}
              onChange={(e) => setZoneName(e.target.value)}
              placeholder="Zone name (Home / Office)"
              className="min-h-[40px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                step="0.0001"
                value={zoneLat}
                onChange={(e) => setZoneLat(Number(e.target.value))}
                className="font-mono-num min-h-[40px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3"
              />
              <input
                type="number"
                step="0.0001"
                value={zoneLng}
                onChange={(e) => setZoneLng(Number(e.target.value))}
                className="font-mono-num min-h-[40px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3"
              />
            </div>
            <label className="flex items-center justify-between">
              <span>Radius: {zoneRadius} m</span>
              <input
                type="range"
                min={100}
                max={2000}
                step={50}
                value={zoneRadius}
                onChange={(e) => setZoneRadius(Number(e.target.value))}
                className="w-40 accent-[var(--stride-accent)]"
              />
            </label>
            <button type="submit" className="stride-btn-primary inline-flex items-center justify-center gap-1.5 text-xs">
              <MapPin size={14} weight="bold" />
              <span>Add Privacy Zone</span>
            </button>
          </form>

          <div className="flex flex-col gap-2">
            {zones.map((z) => (
              <div key={z.id} className="flex items-center justify-between rounded-xl border border-[var(--stride-border-subtle)] bg-[var(--stride-bg-elevated)] px-3 py-2 text-xs">
                <span>
                  <strong>{z.name}</strong> ({z.radiusMeters}m)
                </span>
                <button
                  type="button"
                  onClick={() => removeZone(z.id)}
                  aria-label="Delete zone"
                  className="text-[var(--stride-danger)]"
                >
                  <Trash size={14} weight="bold" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-7">
          <StrideMap
            privacyZones={[...zones, { lat: zoneLat, lng: zoneLng, radiusMeters: zoneRadius }]}
            center={[zoneLng, zoneLat]}
            zoom={13}
            pitch={0}
            heightClass="h-[340px]"
            onMapClick={(lat, lng) => {
              setZoneLat(Number(lat.toFixed(5)));
              setZoneLng(Number(lng.toFixed(5)));
            }}
          />
        </div>
      </div>

      {/* Notification Preferences & Quiet Hours */}
      <div id="notifications" className="stride-card flex flex-col gap-4 p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Bell size={20} weight="bold" className="text-[var(--stride-accent)]" />
          <span>Notification Preferences & Quiet Hours</span>
        </h2>
        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          {[
            ['kudos', 'Kudos'],
            ['comments', 'Comments'],
            ['follows', 'Follows'],
            ['segments_pr', 'Segment PRs'],
            ['challenges', 'Challenges'],
            ['goals', 'Goal Reminders'],
            ['clubs', 'Club Announcements'],
            ['weekly_digest', 'Weekly Email Digest'],
          ].map(([key, label]) => (
            <label key={key} className="flex cursor-pointer items-center gap-2 font-medium">
              <input
                type="checkbox"
                checked={notifPrefs[key] !== false && !(key === 'weekly_digest' && !notifPrefs[key])}
                onChange={(e) => saveNotifPrefs({ ...notifPrefs, [key]: e.target.checked })}
                className="h-4 w-4 accent-[var(--stride-accent)]"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold">
          <input
            type="checkbox"
            checked={Boolean(notifPrefs.quiet_hours_enabled)}
            onChange={(e) => saveNotifPrefs({ ...notifPrefs, quiet_hours_enabled: e.target.checked })}
            className="h-4 w-4 accent-[var(--stride-accent)]"
          />
          <span>Enable Quiet Hours (22:00 – 07:00 IST)</span>
        </label>
      </div>

      {/* Security, Sessions, Export & Delete */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="stride-card flex flex-col gap-4 p-6">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <Key size={18} weight="bold" className="text-[var(--stride-accent)]" />
            <span>Connected Logins & Password</span>
          </h2>
          <div className="text-xs text-[var(--stride-text-secondary)]">
            Active providers: <strong className="uppercase">{providers.join(', ') || 'email'}</strong>
          </div>
          <form onSubmit={changePassword} className="flex flex-col gap-2.5 text-xs">
            {providers.includes('email') && (
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                className="min-h-[40px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3"
              />
            )}
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (8+ chars)"
              className="min-h-[40px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3"
            />
            <button type="submit" className="stride-btn-secondary w-fit px-4 text-xs">
              Update Password
            </button>
          </form>

          <div className="border-t border-[var(--stride-border-subtle)] pt-3">
            <h3 className="mb-2 text-xs font-bold uppercase text-[var(--stride-text-muted)]">
              Active Devices ({sessions.length})
            </h3>
            <div className="flex flex-col gap-2">
              {sessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-xl bg-[var(--stride-bg-elevated)] px-3 py-2 text-xs">
                  <span>
                    {s.deviceName} {s.isCurrent && <strong className="text-[var(--stride-success)]">(Current)</strong>}
                  </span>
                  <button
                    type="button"
                    onClick={() => revokeSession(s.id)}
                    className="inline-flex items-center gap-1 text-[var(--stride-danger)] hover:underline"
                  >
                    <SignOut size={13} weight="bold" /> Sign Out
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="stride-card flex flex-col justify-between gap-4 p-6">
          <div>
            <h2 className="text-base font-bold">Your Data Rights (Export & Deletion)</h2>
            <p className="mt-1 text-xs text-[var(--stride-text-secondary)]">
              Download all your activities as GPX 1.1 + JSON anytime, or permanently delete your account and personal location data.
            </p>
            <button
              type="button"
              onClick={downloadExport}
              className="stride-btn-secondary mt-4 inline-flex items-center gap-2 px-4 text-xs"
            >
              <DownloadSimple size={16} weight="bold" />
              <span>Export All Data (GPX + JSON)</span>
            </button>
          </div>

          <div className="rounded-xl border border-[var(--stride-danger)] bg-[rgba(239,68,68,0.08)] p-4">
            <div className="text-xs font-bold text-[var(--stride-danger)]">Danger Zone: Delete Account</div>
            <p className="mt-1 text-[11px] text-[var(--stride-text-secondary)]">
              Type DELETE below to permanently remove your profile, activities, privacy zones, and sessions.
            </p>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="Type DELETE"
                className="min-h-[38px] flex-1 rounded-lg border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-xs"
              />
              <button
                type="button"
                disabled={deleteConfirm !== 'DELETE'}
                onClick={deleteAccount}
                className="rounded-lg bg-[var(--stride-danger)] px-4 text-xs font-bold text-white disabled:opacity-40"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
