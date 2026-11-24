'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Calendar, CheckCircle, UsersThree } from '@phosphor-icons/react';
import { ActivityCard, type FeedActivityItem } from '@/components/activities/ActivityCard';
import { useAuth } from '@/components/AuthProvider';
import { getMessages, type Locale } from '@/i18n';
import { apiFetch } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

interface ClubDetailPayload {
  club: {
    id: string;
    slug: string;
    name: string;
    description: string;
    city: string;
    sport_focus: string;
    join_mode: string;
    member_count: number;
    membership_status?: string | null;
    membership_role?: string | null;
  };
  members: Array<{ user_id: string; role: string; status: string; handle: string; display_name: string }>;
  feed: Array<{
    id: string;
    title: string;
    activityType: 'run' | 'ride' | 'walk' | 'hike';
    startedAt: string;
    distanceM: number;
    movingTimeS: number;
    elevationGainM: number;
    encodedPolyline: string;
    privacyClipped: boolean;
    kudosCount: number;
    commentCount: number;
    authorHandle: string;
    authorName: string;
  }>;
  events: Array<{
    id: string;
    title: string;
    description: string;
    location_name: string;
    starts_at: string;
    attendee_count: number;
    viewer_going: boolean;
  }>;
}

export function ClubDetailClient({ slug, locale }: { slug: string; locale: Locale }) {
  const m = getMessages(locale);
  const { user, settings } = useAuth();
  const [data, setData] = useState<ClubDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [evTitle, setEvTitle] = useState('');
  const [evLocation, setEvLocation] = useState('');
  const [evStarts, setEvStarts] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ClubDetailPayload>(`/v1/clubs/${slug}`);
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
          <Link href={`/${locale}/clubs`} className="stride-btn-secondary mt-4 inline-flex items-center px-5 text-xs">
            {m.common.back}
          </Link>
        </div>
      </div>
    );
  }

  const { club, members, feed, events } = data;

  const joinOrLeave = async () => {
    if (!user) return;
    if (club.membership_status) {
      await apiFetch(`/v1/clubs/${club.id}/leave`, { method: 'DELETE' });
    } else {
      await apiFetch(`/v1/clubs/${club.id}/join`, { method: 'POST' });
    }
    load();
  };

  const approveMember = async (uid: string) => {
    await apiFetch(`/v1/clubs/${club.id}/members/${uid}/approve`, { method: 'POST' });
    load();
  };

  const rsvpEvent = async (evId: string, going: boolean) => {
    if (!user) return;
    await apiFetch(`/v1/events/${evId}/rsvp`, {
      method: 'POST',
      body: JSON.stringify({ going: !going }),
    });
    load();
  };

  const createEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/v1/events', {
      method: 'POST',
      body: JSON.stringify({
        clubId: club.id,
        title: evTitle,
        locationName: evLocation,
        city: club.city,
        startsAt: new Date(evStarts).toISOString(),
      }),
    });
    setEvTitle('');
    setEvLocation('');
    load();
  };

  return (
    <div className="mx-auto flex max-w-[1380px] flex-col gap-6 px-4 py-8 md:px-6">
      <div className="stride-card flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <span className="rounded-full bg-[var(--stride-accent-tint)] px-3 py-0.5 text-xs font-bold uppercase text-[var(--stride-accent)]">
            {club.city} · {club.sport_focus}
          </span>
          <h1 className="mt-2 text-2xl font-bold">{club.name}</h1>
          <p className="mt-1 max-w-[65ch] text-sm text-[var(--stride-text-secondary)]">{club.description}</p>
        </div>
        {user && (
          <button
            type="button"
            onClick={joinOrLeave}
            className={club.membership_status ? 'stride-btn-secondary px-5 text-xs' : 'stride-btn-primary px-5 text-xs'}
          >
            {club.membership_status === 'accepted'
              ? 'Leave Club'
              : club.membership_status === 'pending'
                ? 'Request Pending (Cancel)'
                : club.join_mode === 'approval'
                  ? 'Request to Join'
                  : 'Join Club'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-8">
          <h2 className="text-lg font-bold">Club Public Feed</h2>
          {feed.length === 0 ? (
            <div className="stride-card p-6 text-xs text-[var(--stride-text-muted)]">No public member activities yet.</div>
          ) : (
            feed.map((f) => {
              const item: FeedActivityItem = {
                id: f.id,
                title: f.title,
                activityType: f.activityType,
                source: 'recorded',
                visibility: 'public',
                startedAt: f.startedAt,
                distanceM: f.distanceM,
                movingTimeS: f.movingTimeS,
                elevationGainM: f.elevationGainM,
                encodedPolyline: f.encodedPolyline,
                privacyClipped: f.privacyClipped,
                kudosCount: f.kudosCount,
                commentCount: f.commentCount,
                author: { id: '', handle: f.authorHandle, displayName: f.authorName },
              };
              return <ActivityCard key={f.id} activity={item} locale={locale} units={settings.units} />;
            })
          )}
        </div>

        <aside className="flex flex-col gap-5 lg:col-span-4">
          {/* Events */}
          <div className="stride-card flex flex-col gap-3 p-4">
            <h2 className="flex items-center gap-2 text-base font-bold">
              <Calendar size={18} weight="bold" className="text-[var(--stride-accent)]" />
              <span>Upcoming Group Events</span>
            </h2>
            {events.map((ev) => (
              <div key={ev.id} className="rounded-xl border border-[var(--stride-border-subtle)] bg-[var(--stride-bg-elevated)] p-3 text-xs">
                <div className="font-bold text-[var(--stride-text-primary)]">{ev.title}</div>
                <div className="mt-0.5 text-[var(--stride-text-secondary)]">
                  {formatDateTime(ev.starts_at, locale)} · {ev.location_name}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-mono-num text-[var(--stride-text-muted)]">{ev.attendee_count} going</span>
                  {user && (
                    <button
                      type="button"
                      onClick={() => rsvpEvent(ev.id, ev.viewer_going)}
                      className={`rounded-full px-3 py-1 font-semibold ${
                        ev.viewer_going ? 'bg-[var(--stride-success)] text-white' : 'bg-[var(--stride-accent)] text-white'
                      }`}
                    >
                      {ev.viewer_going ? 'Going ✓' : 'RSVP'}
                    </button>
                  )}
                </div>
              </div>
            ))}

            {club.membership_role === 'admin' && (
              <form onSubmit={createEvent} className="mt-2 flex flex-col gap-2 border-t border-[var(--stride-border-subtle)] pt-3">
                <span className="text-xs font-semibold">Host Group Meetup</span>
                <input
                  type="text"
                  required
                  value={evTitle}
                  onChange={(e) => setEvTitle(e.target.value)}
                  placeholder="Event title"
                  className="min-h-[38px] rounded-lg border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-xs"
                />
                <input
                  type="text"
                  required
                  value={evLocation}
                  onChange={(e) => setEvLocation(e.target.value)}
                  placeholder="Meeting location"
                  className="min-h-[38px] rounded-lg border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-xs"
                />
                <input
                  type="datetime-local"
                  required
                  value={evStarts}
                  onChange={(e) => setEvStarts(e.target.value)}
                  className="min-h-[38px] rounded-lg border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-xs"
                />
                <button type="submit" className="stride-btn-primary min-h-[38px] text-xs">
                  Create Event
                </button>
              </form>
            )}
          </div>

          {/* Members */}
          <div className="stride-card flex flex-col gap-2.5 p-4">
            <h2 className="flex items-center gap-2 text-base font-bold">
              <UsersThree size={18} weight="bold" className="text-[var(--stride-accent)]" />
              <span>Members ({club.member_count})</span>
            </h2>
            {members.map((mem) => (
              <div key={mem.user_id} className="flex items-center justify-between text-xs">
                <Link href={`/${locale}/u/${mem.handle}`} className="font-semibold hover:text-[var(--stride-accent)]">
                  {mem.display_name} (@{mem.handle})
                </Link>
                {mem.status === 'pending' && club.membership_role === 'admin' ? (
                  <button
                    type="button"
                    onClick={() => approveMember(mem.user_id)}
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--stride-success)] px-2.5 py-0.5 font-semibold text-white"
                  >
                    <CheckCircle size={12} weight="bold" /> Approve
                  </button>
                ) : (
                  <span className="uppercase text-[var(--stride-text-muted)]">{mem.role}</span>
                )}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
