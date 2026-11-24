'use client';

import React, { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BookmarkSimple, Compass, MagnifyingGlass, Trash } from '@phosphor-icons/react';
import { useAuth } from '@/components/AuthProvider';
import { StrideMap } from '@/components/maps/StrideMap';
import { getMessages, normalizeLocale } from '@/i18n';
import { apiFetch } from '@/lib/api';
import { formatDistance, formatElevation } from '@/lib/format';

interface NearbyRoute {
  id: string;
  kind: 'activity' | 'segment';
  name: string;
  city: string;
  activityType: string;
  distanceM: number;
  elevationGainM: number;
  encodedPolyline: string;
  distanceFromSearchM: number;
}

interface SavedRoute {
  id: string;
  name: string;
  activity_type: string;
  distance_m: number;
  elevation_gain_m: number;
  encoded_polyline: string;
}

const CITY_COORDS: Record<string, { label: string; lat: number; lng: number }> = {
  bengaluru: { label: 'Bengaluru', lat: 12.9762, lng: 77.5929 },
  mumbai: { label: 'Mumbai', lat: 18.9382, lng: 72.8247 },
  kolkata: { label: 'Kolkata', lat: 22.5494, lng: 88.3478 },
  delhi: { label: 'New Delhi', lat: 28.5931, lng: 77.2197 },
};

export default function RoutesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = use(params);
  const locale = normalizeLocale(raw);
  const m = getMessages(locale);
  const { user, settings } = useAuth();

  const [coords, setCoords] = useState<{ lat: number; lng: number }>({ lat: 12.9762, lng: 77.5929 });
  const [cityQuery, setCityQuery] = useState('');
  const [sport, setSport] = useState('');
  const [nearby, setNearby] = useState<NearbyRoute[]>([]);
  const [saved, setSaved] = useState<SavedRoute[]>([]);
  const [activePolyline, setActivePolyline] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const loadNearby = useCallback(async () => {
    const qs = new URLSearchParams({
      lat: String(coords.lat),
      lng: String(coords.lng),
      radiusKm: '45',
    });
    if (sport) qs.set('activityType', sport);
    const res = await apiFetch<{ activities: NearbyRoute[]; segments: NearbyRoute[] }>(
      `/v1/routes/nearby?${qs.toString()}`
    );
    const combined = [...(res.activities || []), ...(res.segments || [])];
    setNearby(combined);
    if (combined[0]?.encodedPolyline) setActivePolyline(combined[0].encodedPolyline);
  }, [coords, sport]);

  const loadSaved = useCallback(async () => {
    if (!user) return;
    const res = await apiFetch<{ savedRoutes: SavedRoute[] }>('/v1/routes/saved');
    setSaved(res.savedRoutes || []);
  }, [user]);

  useEffect(() => {
    loadNearby();
  }, [loadNearby]);

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  const handleGeocode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cityQuery.trim()) return;
    const res = await apiFetch<{ results: Array<{ label: string; lat: number; lng: number }> }>(
      `/v1/maps/geocode?q=${encodeURIComponent(cityQuery.trim())}`
    );
    if (res.results[0]) {
      setCoords({ lat: res.results[0].lat, lng: res.results[0].lng });
    }
  };

  const saveRoute = async (route: NearbyRoute) => {
    if (!user) return;
    await apiFetch('/v1/routes/saved', {
      method: 'POST',
      body: JSON.stringify({
        sourceActivityId: route.kind === 'activity' ? route.id : undefined,
        sourceSegmentId: route.kind === 'segment' ? route.id : undefined,
        name: route.name,
        activityType: route.activityType,
        distanceM: route.distanceM,
        elevationGainM: route.elevationGainM,
        encodedPolyline: route.encodedPolyline,
      }),
    });
    setNotice(`Saved "${route.name}"`);
    loadSaved();
  };

  const deleteSaved = async (id: string) => {
    await apiFetch(`/v1/routes/saved/${id}`, { method: 'DELETE' });
    setSaved((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="mx-auto flex max-w-[1380px] flex-col gap-6 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Compass size={24} weight="bold" className="text-[var(--stride-accent)]" />
            <span>{m.nav.routes}</span>
          </h1>
          <p className="text-sm text-[var(--stride-text-secondary)]">
            PostGIS proximity route discovery from public activities and verified segments (zero external routing API cost).
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {Object.entries(CITY_COORDS).map(([key, c]) => (
            <button
              key={key}
              type="button"
              onClick={() => setCoords({ lat: c.lat, lng: c.lng })}
              className="stride-btn-secondary min-h-[38px] px-3.5 text-xs"
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {notice && (
        <div className="rounded-xl border border-[var(--stride-success)] bg-[rgba(24,184,122,0.12)] px-4 py-2 text-xs text-[var(--stride-success)]">
          {notice}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <form onSubmit={handleGeocode} className="flex flex-1 gap-2 min-w-[260px]">
          <input
            type="text"
            value={cityQuery}
            onChange={(e) => setCityQuery(e.target.value)}
            placeholder="Search any city or park via cached geocoder..."
            className="min-h-[42px] flex-1 rounded-full border border-[var(--stride-border-strong)] bg-[var(--stride-bg-surface)] px-4 text-xs"
          />
          <button type="submit" aria-label="Search location" className="stride-btn-primary px-4 text-xs">
            <MagnifyingGlass size={16} weight="bold" />
          </button>
        </form>
        <select
          value={sport}
          onChange={(e) => setSport(e.target.value)}
          className="min-h-[42px] rounded-full border border-[var(--stride-border-strong)] bg-[var(--stride-bg-surface)] px-4 text-xs font-semibold"
        >
          <option value="">{m.sports.all}</option>
          <option value="run">{m.sports.run}</option>
          <option value="ride">{m.sports.ride}</option>
          <option value="walk">{m.sports.walk}</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <StrideMap
            encodedPolyline={activePolyline}
            center={[coords.lng, coords.lat]}
            heightClass="h-[380px]"
            pitch={35}
          />
        </div>

        <div className="flex flex-col gap-3 lg:col-span-5">
          <h2 className="text-base font-bold">Nearby Public Routes ({nearby.length})</h2>
          {nearby.length === 0 ? (
            <div className="stride-card p-6 text-xs text-[var(--stride-text-muted)]">
              No public routes within 45 km of this location yet. Try Bengaluru, Mumbai, Kolkata, or New Delhi.
            </div>
          ) : (
            <div className="flex max-h-[340px] flex-col gap-2.5 overflow-y-auto pr-1">
              {nearby.map((r) => (
                <div
                  key={`${r.kind}-${r.id}`}
                  className="stride-card flex items-center justify-between gap-3 p-3.5"
                >
                  <button
                    type="button"
                    onClick={() => setActivePolyline(r.encodedPolyline)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate text-sm font-bold text-[var(--stride-text-primary)]">
                      {r.name}
                    </div>
                    <div className="text-xs text-[var(--stride-text-secondary)]">
                      <span className="uppercase">{r.kind}</span> · {formatDistance(r.distanceM, settings.units, locale)} · +
                      {formatElevation(r.elevationGainM, settings.units, locale)}
                    </div>
                  </button>
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/${locale}/${r.kind === 'segment' ? 'segments' : 'activities'}/${r.id}`}
                      className="rounded-full border border-[var(--stride-border-strong)] px-3 py-1.5 text-xs font-semibold"
                    >
                      Open
                    </Link>
                    {user && (
                      <button
                        type="button"
                        onClick={() => saveRoute(r)}
                        aria-label="Save route"
                        className="rounded-full bg-[var(--stride-accent-tint)] p-2 text-[var(--stride-accent)]"
                      >
                        <BookmarkSimple size={15} weight="bold" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {user && saved.length > 0 && (
        <div className="stride-card p-5">
          <h2 className="mb-3 text-base font-bold">Your Saved Routes ({saved.length})</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {saved.map((sr) => (
              <div
                key={sr.id}
                className="flex items-center justify-between rounded-xl border border-[var(--stride-border-subtle)] bg-[var(--stride-bg-elevated)] p-3 text-xs"
              >
                <button
                  type="button"
                  onClick={() => setActivePolyline(sr.encoded_polyline)}
                  className="text-left"
                >
                  <div className="font-bold">{sr.name}</div>
                  <div className="text-[var(--stride-text-secondary)]">
                    {formatDistance(sr.distance_m, settings.units, locale)}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => deleteSaved(sr.id)}
                  aria-label="Remove saved route"
                  className="text-[var(--stride-text-muted)] hover:text-[var(--stride-danger)]"
                >
                  <Trash size={15} weight="bold" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
