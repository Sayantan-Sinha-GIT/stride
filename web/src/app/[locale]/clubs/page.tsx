'use client';

import React, { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, UsersThree } from '@phosphor-icons/react';
import { useAuth } from '@/components/AuthProvider';
import { getMessages, normalizeLocale } from '@/i18n';
import { apiFetch } from '@/lib/api';

interface ClubRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  city: string;
  sport_focus: string;
  join_mode: string;
  member_count: number;
  membership_status?: string | null;
}

export default function ClubsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = use(params);
  const locale = normalizeLocale(raw);
  const m = getMessages(locale);
  const { user } = useAuth();

  const [clubs, setClubs] = useState<ClubRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [description, setDescription] = useState('');
  const [sportFocus, setSportFocus] = useState<'all' | 'run' | 'ride' | 'walk' | 'hike'>('run');
  const [joinMode, setJoinMode] = useState<'open' | 'approval'>('open');

  const load = async () => {
    const res = await apiFetch<{ clubs: ClubRow[] }>('/v1/clubs');
    setClubs(res.clubs || []);
  };

  useEffect(() => {
    load();
  }, [user?.id]);

  const createClub = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/v1/clubs', {
      method: 'POST',
      body: JSON.stringify({ name, city, description, sportFocus, joinMode }),
    });
    setName('');
    setDescription('');
    setShowCreate(false);
    load();
  };

  return (
    <div className="mx-auto max-w-[1380px] px-4 py-8 md:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <UsersThree size={24} weight="bold" className="text-[var(--stride-accent)]" />
            <span>{m.nav.clubs}</span>
          </h1>
          <p className="text-sm text-[var(--stride-text-secondary)]">
            {locale === 'hi'
              ? 'रनिंग और साइकलिंग क्लब से जुड़ें, ग्रुप इवेंट में भाग लें।'
              : 'Join local athletic groups, view club feeds, and RSVP to weekend meetups.'}
          </p>
        </div>

        {user && (
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="stride-btn-primary inline-flex items-center gap-1.5 px-4 text-xs"
          >
            <Plus size={15} weight="bold" />
            <span>Create Club</span>
          </button>
        )}
      </div>

      {showCreate && (
        <form onSubmit={createClub} className="stride-card mb-6 grid grid-cols-1 gap-3 p-5 md:grid-cols-2">
          <input
            type="text"
            required
            minLength={3}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Club Name"
            className="min-h-[42px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-sm"
          />
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City (e.g., Bengaluru)"
            className="min-h-[42px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-sm"
          />
          <select
            value={sportFocus}
            onChange={(e) => setSportFocus(e.target.value as typeof sportFocus)}
            className="min-h-[42px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-sm"
          >
            <option value="run">Run</option>
            <option value="ride">Ride</option>
            <option value="walk">Walk</option>
            <option value="all">All Sports</option>
          </select>
          <select
            value={joinMode}
            onChange={(e) => setJoinMode(e.target.value as 'open' | 'approval')}
            className="min-h-[42px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3 text-sm"
          >
            <option value="open">Open Join</option>
            <option value="approval">Admin Approval Required</option>
          </select>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Club description..."
            className="rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] p-3 text-sm md:col-span-2"
          />
          <div className="flex gap-2">
            <button type="submit" className="stride-btn-primary px-5 text-xs">
              Publish Club
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="stride-btn-secondary px-4 text-xs">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {clubs.map((club) => (
          <Link
            key={club.id}
            href={`/${locale}/clubs/${club.slug}`}
            className="stride-cinema-card flex flex-col justify-between gap-4 p-5 hover:border-[var(--stride-accent)]"
          >
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="rounded-full bg-[var(--stride-accent-tint)] px-2.5 py-0.5 font-semibold uppercase text-[var(--stride-accent)]">
                  {club.sport_focus} · {club.city || 'India'}
                </span>
                <span className="text-[var(--stride-text-muted)]">
                  {club.join_mode === 'approval' ? 'Approval' : 'Open'}
                </span>
              </div>
              <h2 className="mt-2.5 text-lg font-bold text-[var(--stride-text-primary)]">{club.name}</h2>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--stride-text-secondary)]">
                {club.description}
              </p>
            </div>
            <div className="flex items-center justify-between border-t border-[var(--stride-border-subtle)] pt-3 text-xs">
              <span className="font-mono-num font-bold">{club.member_count} members</span>
              {club.membership_status && (
                <span className="font-semibold text-[var(--stride-success)] uppercase">
                  {club.membership_status}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
