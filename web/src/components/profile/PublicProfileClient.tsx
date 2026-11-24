'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Flag, Prohibit, UserCheck, UserPlus } from '@phosphor-icons/react';
import { ActivityCard, type FeedActivityItem } from '@/components/activities/ActivityCard';
import { useAuth } from '@/components/AuthProvider';
import { getMessages, type Locale } from '@/i18n';
import { apiFetch } from '@/lib/api';
import { formatDistance } from '@/lib/format';

interface PublicProfilePayload {
  profile: {
    id: string;
    handle: string;
    displayName: string;
    bio: string;
    homeCity: string;
    isPrivateAccount: boolean;
    followersCount: number;
    followingCount: number;
    followStatus: 'accepted' | 'pending' | null;
    visibleDistanceM: number;
    visibleActivityCount: number;
  };
  activities: FeedActivityItem[];
  badges: Array<{ code: string; title_en: string; title_hi: string }>;
}

export function PublicProfileClient({ handle, locale }: { handle: string; locale: Locale }) {
  const m = getMessages(locale);
  const { user, settings } = useAuth();
  const [data, setData] = useState<PublicProfilePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [blockedId, setBlockedId] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const res = await apiFetch<PublicProfilePayload>(`/v1/users/${handle}`);
      setData(res);
      setBlockedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Profile not found');
    }
  };

  useEffect(() => {
    load();
  }, [handle, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center text-sm text-[var(--stride-danger)]">
        {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center text-sm text-[var(--stride-text-secondary)]">
        {m.common.loading}
      </div>
    );
  }

  const { profile, activities, badges } = data;
  const isMe = user?.id === profile.id;

  const toggleFollow = async () => {
    if (!user) return;
    if (profile.followStatus) {
      await apiFetch(`/v1/users/${profile.id}/follow`, { method: 'DELETE' });
    } else {
      await apiFetch(`/v1/users/${profile.id}/follow`, { method: 'POST' });
    }
    load();
  };

  const blockUser = async () => {
    if (!user) return;
    await apiFetch(`/v1/users/${profile.id}/block`, { method: 'POST' });
    setBlockedId(profile.id);
    setNotice('User blocked. Follows removed and profile hidden.');
  };

  const unblockUser = async () => {
    if (!user || !blockedId) return;
    await apiFetch(`/v1/users/${blockedId}/block`, { method: 'DELETE' });
    setBlockedId(null);
    setNotice('User unblocked.');
    load();
  };

  if (blockedId) {
    return (
      <div className="mx-auto max-w-md px-4 py-12">
        <div className="stride-card flex flex-col items-center gap-4 p-6 text-center">
          <Prohibit size={32} weight="bold" className="text-[var(--stride-warning)]" />
          <h1 className="text-lg font-bold">@{profile.handle} has been blocked</h1>
          <p className="text-xs text-[var(--stride-text-secondary)]">
            Two-way follows were removed and their activities are hidden from your stream.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={unblockUser} className="stride-btn-secondary px-4 text-xs">
              Unblock
            </button>
            <Link href={`/${locale}/feed`} className="stride-btn-primary inline-flex items-center px-4 text-xs">
              Back to Feed
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const reportUser = async () => {
    if (!user) return;
    await apiFetch('/v1/reports', {
      method: 'POST',
      body: JSON.stringify({ targetType: 'user', targetId: profile.id, reason: 'Profile Abuse Report' }),
    });
    setNotice('User reported to moderation.');
  };

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-4 py-8 md:px-6">
      {notice && (
        <div className="rounded-xl border border-[var(--stride-warning)] bg-[rgba(245,158,11,0.12)] px-4 py-2 text-xs">
          {notice}
        </div>
      )}

      <div className="stride-card flex flex-wrap items-start justify-between gap-4 p-6">
        <div>
          <h1 className="text-2xl font-bold">{profile.displayName}</h1>
          <div className="text-xs text-[var(--stride-text-muted)]">
            @{profile.handle} {profile.homeCity ? `· ${profile.homeCity}` : ''}
          </div>
          {profile.bio && <p className="mt-2 max-w-[60ch] text-sm text-[var(--stride-text-secondary)]">{profile.bio}</p>}
          <div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold">
            <span className="font-mono-num">{profile.followersCount} Followers</span>
            <span className="font-mono-num">{profile.followingCount} Following</span>
            <span className="font-mono-num">{formatDistance(profile.visibleDistanceM, settings.units, locale)} Visible</span>
          </div>
        </div>

        {user && !isMe && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={toggleFollow}
              className={profile.followStatus ? 'stride-btn-secondary inline-flex items-center gap-1.5 px-4 text-xs' : 'stride-btn-primary inline-flex items-center gap-1.5 px-4 text-xs'}
            >
              {profile.followStatus === 'accepted' ? <UserCheck size={15} weight="bold" /> : <UserPlus size={15} weight="bold" />}
              <span>
                {profile.followStatus === 'accepted'
                  ? 'Following'
                  : profile.followStatus === 'pending'
                    ? 'Requested'
                    : 'Follow'}
              </span>
            </button>
            <button type="button" onClick={blockUser} className="stride-btn-secondary inline-flex items-center gap-1 px-3 text-xs text-[var(--stride-danger)]">
              <Prohibit size={15} weight="bold" />
              <span>Block</span>
            </button>
            <button type="button" onClick={reportUser} className="stride-btn-secondary inline-flex items-center gap-1 px-3 text-xs">
              <Flag size={15} weight="bold" />
            </button>
          </div>
        )}
      </div>

      {badges.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {badges.map((b) => (
            <span key={b.code} className="rounded-full border border-[var(--stride-border-strong)] bg-[var(--stride-bg-surface)] px-3 py-1 text-xs font-semibold">
              {locale === 'hi' ? b.title_hi : b.title_en}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">Visible Activities ({activities.length})</h2>
        {activities.length === 0 ? (
          <div className="stride-card p-6 text-xs text-[var(--stride-text-muted)]">No visible activities to display.</div>
        ) : (
          activities.map((a) => (
            <ActivityCard key={a.id} activity={{ ...a, author: { id: profile.id, handle: profile.handle, displayName: profile.displayName } }} locale={locale} units={settings.units} />
          ))
        )}
      </div>
    </div>
  );
}
