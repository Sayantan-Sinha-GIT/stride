'use client';

import React, { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { MagnifyingGlass, PlusCircle, UserCheck, UserPlus } from '@phosphor-icons/react';
import { ActivityCard, type FeedActivityItem } from '@/components/activities/ActivityCard';
import { useAuth } from '@/components/AuthProvider';
import { CinemaPageHeader } from '@/components/layout/CinemaPageHeader';
import { getMessages, normalizeLocale } from '@/i18n';
import { apiFetch } from '@/lib/api';

interface SearchUser {
  id: string;
  handle: string;
  display_name: string;
  home_city: string;
  public_activity_count: number;
}

export default function FeedPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = use(params);
  const locale = normalizeLocale(raw);
  const m = getMessages(locale);
  const { user, settings } = useAuth();

  const [scope, setScope] = useState<'following' | 'public' | 'mine'>('public');
  const [items, setItems] = useState<FeedActivityItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [followRequests, setFollowRequests] = useState<Array<{ follower_id: string; handle: string; display_name: string }>>([]);

  useEffect(() => {
    if (user && scope === 'public') {
      setScope('following');
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadFeed = useCallback(
    async (cursor?: string | null, append = false) => {
      setLoading(true);
      try {
        const activeScope = !user && scope !== 'public' ? 'public' : scope;
        const qs = new URLSearchParams({ scope: activeScope, limit: '10' });
        if (cursor) qs.set('cursor', cursor);
        const res = await apiFetch<{ items: FeedActivityItem[]; nextCursor: string | null }>(
          `/v1/activities/feed?${qs.toString()}`
        );
        setItems((prev) => (append ? [...prev, ...res.items] : res.items));
        setNextCursor(res.nextCursor);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [scope, user]
  );

  useEffect(() => {
    loadFeed(null, false);
  }, [loadFeed]);

  useEffect(() => {
    if (!user) return;
    apiFetch<{ requests: Array<{ follower_id: string; handle: string; display_name: string }> }>(
      '/v1/me/follow-requests'
    )
      .then((res) => setFollowRequests(res.requests || []))
      .catch(() => {});
  }, [user]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch<{ users: SearchUser[] }>(
      `/v1/users/search?q=${encodeURIComponent(searchQuery.trim())}`
    );
    setSearchResults(res.users || []);
  };

  const handleKudos = async (id: string, currentlyLiked: boolean) => {
    if (!user) return;
    const method = currentlyLiked ? 'DELETE' : 'POST';
    const res = await apiFetch<{ kudosCount: number; viewerHasKudos: boolean }>(
      `/v1/activities/${id}/kudos`,
      { method }
    );
    setItems((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, kudosCount: res.kudosCount, viewerHasKudos: res.viewerHasKudos }
          : a
      )
    );
  };

  const handleFollowRequest = async (followerId: string, action: 'accept' | 'decline') => {
    await apiFetch(`/v1/me/follow-requests/${followerId}/${action}`, { method: 'POST' });
    setFollowRequests((prev) => prev.filter((r) => r.follower_id !== followerId));
  };

  return (
    <div className="mx-auto flex max-w-[1380px] flex-col gap-6 px-4 py-8 md:px-6">
      <CinemaPageHeader
        index="01"
        eyebrow={locale === 'hi' ? 'सोशल और सेगमेंट फ़ीड' : 'SOCIAL & TELEMETRY STREAM'}
        title={m.nav.feed}
        subtitle={
          locale === 'hi'
            ? 'फॉलो किए गए एथलीट्स के पब्लिक व प्राइवेसी-शील्डेड रूट्स, स्प्लिट्स और कुडोज़।'
            : 'Live workouts, Hausdorff-verified efforts, and server-shielded routes across your training circle.'
        }
        action={
          <Link href={`/${locale}/record`} className="stride-btn-luminous inline-flex items-center gap-1.5 px-4 text-xs">
            <PlusCircle size={16} weight="bold" />
            <span>{m.nav.record}</span>
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Main Feed Column */}
      <div className="flex flex-col gap-4 lg:col-span-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 rounded-full border border-[var(--stride-border-subtle)] bg-[var(--stride-bg-surface)] p-1">
            {user && (
              <button
                type="button"
                onClick={() => setScope('following')}
                className={`min-h-[38px] rounded-full px-4 text-xs font-semibold ${
                  scope === 'following'
                    ? 'bg-[var(--stride-accent)] text-white'
                    : 'text-[var(--stride-text-secondary)]'
                }`}
              >
                {locale === 'hi' ? 'फॉलोइंग' : 'Following'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setScope('public')}
              className={`min-h-[38px] rounded-full px-4 text-xs font-semibold ${
                scope === 'public'
                  ? 'bg-[var(--stride-accent)] text-white'
                  : 'text-[var(--stride-text-secondary)]'
              }`}
            >
              {locale === 'hi' ? 'पब्लिक खोज' : 'Explore Public'}
            </button>
            {user && (
              <button
                type="button"
                onClick={() => setScope('mine')}
                className={`min-h-[38px] rounded-full px-4 text-xs font-semibold ${
                  scope === 'mine'
                    ? 'bg-[var(--stride-accent)] text-white'
                    : 'text-[var(--stride-text-secondary)]'
                }`}
              >
                {locale === 'hi' ? 'मेरी गतिविधियाँ' : 'My Activities'}
              </button>
            )}
          </div>
        </div>

        {loading && items.length === 0 ? (
          <div className="stride-card p-8 text-center text-sm text-[var(--stride-text-secondary)]">
            {m.common.loading}
          </div>
        ) : items.length === 0 ? (
          <div className="stride-cinema-card flex flex-col items-center gap-4 p-8 text-center">
            <p className="text-sm font-semibold text-[var(--stride-text-primary)]">
              {scope === 'following'
                ? locale === 'hi'
                  ? 'आपकी फॉलोइंग फ़ीड अभी खाली है।'
                  : 'Your Following stream is empty so far.'
                : m.common.empty}
            </p>
            <p className="max-w-md text-xs text-[var(--stride-text-secondary)]">
              {scope === 'following'
                ? locale === 'hi'
                  ? 'पब्लिक एथलीट्स के रूट्स देखें या अपनी पहली गतिविधि रिकॉर्ड करें।'
                  : 'Browse public activities to follow local athletes or record your first workout.'
                : m.common.empty}
            </p>
            <div className="flex flex-wrap justify-center gap-2.5">
              {scope !== 'public' && (
                <button
                  type="button"
                  onClick={() => setScope('public')}
                  className="stride-btn-primary px-5 text-xs"
                >
                  {locale === 'hi' ? 'पब्लिक स्ट्रीम देखें' : 'Explore Public Stream'}
                </button>
              )}
              <Link href={`/${locale}/record`} className="stride-btn-secondary inline-flex items-center px-5 text-xs">
                {locale === 'hi' ? 'पहली गतिविधि रिकॉर्ड करें' : 'Record / Import First Workout'}
              </Link>
            </div>
          </div>
        ) : (
          items.map((act) => (
            <ActivityCard
              key={act.id}
              activity={act}
              locale={locale}
              units={settings.units}
              onToggleKudos={user ? handleKudos : undefined}
            />
          ))
        )}

        {nextCursor && (
          <button
            type="button"
            onClick={() => loadFeed(nextCursor, true)}
            className="stride-btn-secondary w-full text-sm"
          >
            {locale === 'hi' ? 'और लोड करें' : 'Load More Activities'}
          </button>
        )}
      </div>

      {/* Right Sidebar: Athlete Search & Follow Requests */}
      <aside className="flex flex-col gap-4 lg:col-span-4">
        {followRequests.length > 0 && (
          <div className="stride-cinema-card flex flex-col gap-3 p-5">
            <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--stride-text-primary)]">
              <UserPlus size={16} weight="bold" className="text-[var(--stride-accent)]" />
              <span>Pending Follow Requests</span>
            </h2>
            {followRequests.map((req) => (
              <div key={req.follower_id} className="flex items-center justify-between gap-2 text-xs">
                <Link href={`/${locale}/u/${req.handle}`} className="font-semibold hover:underline">
                  {req.display_name} (@{req.handle})
                </Link>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleFollowRequest(req.follower_id, 'accept')}
                    className="rounded-full bg-[var(--stride-success)] px-2.5 py-1 font-semibold text-white"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFollowRequest(req.follower_id, 'decline')}
                    className="rounded-full border border-[var(--stride-border-strong)] px-2.5 py-1"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="stride-cinema-card flex flex-col gap-3 p-5">
          <h2 className="text-sm font-bold text-[var(--stride-text-primary)]">{m.common.search}</h2>
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="रोहन / arjun / Bengaluru..."
              className="min-h-[42px] flex-1 rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-sm"
            />
            <button type="submit" aria-label="Search athletes" className="stride-btn-primary px-3.5">
              <MagnifyingGlass size={16} weight="bold" />
            </button>
          </form>
          {searchResults.length > 0 && (
            <div className="flex flex-col gap-2 pt-1">
              {searchResults.map((u) => (
                <Link
                  key={u.id}
                  href={`/${locale}/u/${u.handle}`}
                  className="flex items-center justify-between rounded-xl border border-[var(--stride-border-subtle)] bg-[var(--stride-bg-elevated)] px-3 py-2 text-xs hover:border-[var(--stride-accent)]"
                >
                  <div>
                    <div className="font-semibold text-[var(--stride-text-primary)]">{u.display_name}</div>
                    <div className="text-[var(--stride-text-muted)]">
                      @{u.handle} {u.home_city ? `· ${u.home_city}` : ''}
                    </div>
                  </div>
                  <UserCheck size={16} weight="bold" className="text-[var(--stride-accent)]" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </aside>
      </div>
    </div>
  );
}
