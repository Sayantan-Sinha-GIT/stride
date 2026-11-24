'use client';

import React, { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, Check } from '@phosphor-icons/react';
import { useAuth } from '@/components/AuthProvider';
import { getMessages, normalizeLocale } from '@/i18n';
import { apiFetch } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

interface NotifRow {
  id: string;
  kind: string;
  target_type: string | null;
  target_id: string | null;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export default function NotificationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = use(params);
  const locale = normalizeLocale(raw);
  const m = getMessages(locale);
  const { user, refreshMe } = useAuth();
  const [items, setItems] = useState<NotifRow[]>([]);

  const load = async () => {
    if (!user) return;
    const res = await apiFetch<{ notifications: NotifRow[] }>('/v1/me/notifications');
    setItems(res.notifications || []);
  };

  useEffect(() => {
    load();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const markAllRead = async () => {
    await apiFetch('/v1/me/notifications/read-all', { method: 'POST' });
    await refreshMe();
    load();
  };

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <Link href={`/${locale}/login`} className="stride-btn-primary inline-flex items-center px-6">
          {m.nav.login}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8 md:px-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Bell size={24} weight="bold" className="text-[var(--stride-accent)]" />
          <span>Notifications</span>
        </h1>
        <div className="flex gap-2">
          <button type="button" onClick={markAllRead} className="stride-btn-secondary inline-flex items-center gap-1.5 px-4 text-xs">
            <Check size={14} weight="bold" />
            <span>Mark All Read</span>
          </button>
          <Link href={`/${locale}/settings#notifications`} className="stride-btn-secondary inline-flex items-center px-4 text-xs">
            Preferences
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {items.length === 0 ? (
          <div className="stride-card p-6 text-center text-xs text-[var(--stride-text-muted)]">
            You’re all caught up!
          </div>
        ) : (
          items.map((n) => (
            <div
              key={n.id}
              className={`stride-card flex items-start justify-between gap-3 p-4 text-xs ${
                n.read_at ? 'opacity-75' : 'border-[var(--stride-accent)]'
              }`}
            >
              <div>
                <div className="font-bold text-[var(--stride-text-primary)]">{n.title}</div>
                <div className="mt-1 text-[var(--stride-text-secondary)]">{n.body}</div>
                <div className="mt-1 text-[11px] text-[var(--stride-text-muted)]">{formatDateTime(n.created_at, locale)}</div>
              </div>
              {n.target_type === 'activity' && n.target_id && (
                <Link href={`/${locale}/activities/${n.target_id}`} className="font-semibold text-[var(--stride-accent)] hover:underline">
                  View
                </Link>
              )}
              {n.target_type === 'segment' && n.target_id && (
                <Link href={`/${locale}/segments/${n.target_id}`} className="font-semibold text-[var(--stride-accent)] hover:underline">
                  View
                </Link>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
