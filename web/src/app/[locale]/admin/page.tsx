'use client';

import React, { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowsClockwise, CheckCircle, ShieldCheck, XCircle } from '@phosphor-icons/react';
import { useAuth } from '@/components/AuthProvider';
import { getMessages, normalizeLocale } from '@/i18n';
import { apiFetch } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

interface AdminStatsPayload {
  stats: {
    total_users: number;
    total_activities: number;
    total_segments: number;
    total_clubs: number;
    open_reports: number;
  };
  reports: Array<{
    id: string;
    reporter_handle: string | null;
    target_type: string;
    target_id: string;
    reason: string;
    details: string;
    status: string;
    created_at: string;
  }>;
}

export default function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = use(params);
  const locale = normalizeLocale(raw);
  const m = getMessages(locale);
  const { user } = useAuth();

  const [data, setData] = useState<AdminStatsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiFetch<AdminStatsPayload>('/v1/admin/stats');
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Admin access required');
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  if (!user || user.role !== 'admin') {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <div className="stride-card flex flex-col gap-4 p-8">
          <ShieldCheck size={32} weight="bold" className="mx-auto text-[var(--stride-warning)]" />
          <h1 className="text-xl font-bold">Admin Moderation Area</h1>
          <p className="text-sm text-[var(--stride-text-secondary)]">
            {error || 'Sign in with an administrator account (or click Demo Moderator) to access moderation controls.'}
          </p>
          <Link href={`/${locale}/login`} className="stride-btn-primary flex items-center justify-center">
            {m.nav.login}
          </Link>
        </div>
      </div>
    );
  }

  const resolveReport = async (id: string, status: 'resolved' | 'dismissed', hideTarget: boolean) => {
    await apiFetch(`/v1/admin/reports/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ status, hideTarget, note: hideTarget ? 'Hidden by moderator' : 'Reviewed' }),
    });
    setNotice(`Report ${status}${hideTarget ? ' & target hidden' : ''}.`);
    load();
  };

  const triggerCron = async () => {
    const res = await apiFetch<{ heatmap: { cellsUpserted: number } }>('/v1/admin/cron/run', {
      method: 'POST',
    });
    setNotice(`Cron completed: ${res.heatmap.cellsUpserted} anonymized heatmap cells updated.`);
  };

  return (
    <div className="mx-auto flex max-w-[1380px] flex-col gap-6 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ShieldCheck size={24} weight="bold" className="text-[var(--stride-warning)]" />
          <span>Moderation & System Admin</span>
        </h1>
        <button type="button" onClick={triggerCron} className="stride-btn-secondary inline-flex items-center gap-2 px-4 text-xs">
          <ArrowsClockwise size={15} weight="bold" />
          <span>Run Heatmap & Cleanup Cron</span>
        </button>
      </div>

      {notice && (
        <div className="rounded-xl border border-[var(--stride-success)] bg-[rgba(24,184,122,0.12)] px-4 py-2.5 text-xs text-[var(--stride-success)]">
          {notice}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ['Users', data.stats.total_users],
              ['Activities', data.stats.total_activities],
              ['Segments', data.stats.total_segments],
              ['Clubs', data.stats.total_clubs],
              ['Open Reports', data.stats.open_reports],
            ].map(([label, val]) => (
              <div key={String(label)} className="stride-card p-4">
                <div className="text-xs text-[var(--stride-text-muted)]">{label}</div>
                <div className="font-mono-num mt-1 text-2xl font-bold">{val}</div>
              </div>
            ))}
          </div>

          <div className="stride-card flex flex-col gap-3 p-5">
            <h2 className="text-base font-bold">Reports Queue ({data.reports.length})</h2>
            {data.reports.map((rep) => (
              <div
                key={rep.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--stride-border-subtle)] bg-[var(--stride-bg-elevated)] p-4 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-[var(--stride-accent-tint)] px-2 py-0.5 font-bold uppercase text-[var(--stride-accent)]">
                      {rep.target_type}
                    </span>
                    <span className="font-bold">{rep.reason}</span>
                    <span className="uppercase text-[var(--stride-text-muted)]">({rep.status})</span>
                  </div>
                  <p className="mt-1 text-[var(--stride-text-secondary)]">{rep.details}</p>
                  <div className="mt-1 text-[11px] text-[var(--stride-text-muted)]">
                    Reported by @{rep.reporter_handle || 'system'} · {formatDateTime(rep.created_at, locale)}
                  </div>
                </div>

                {rep.status === 'open' && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => resolveReport(rep.id, 'resolved', true)}
                      className="rounded-full bg-[var(--stride-danger)] px-3.5 py-1.5 font-semibold text-white"
                    >
                      Hide Target & Resolve
                    </button>
                    <button
                      type="button"
                      onClick={() => resolveReport(rep.id, 'resolved', false)}
                      className="inline-flex items-center gap-1 rounded-full bg-[var(--stride-success)] px-3.5 py-1.5 font-semibold text-white"
                    >
                      <CheckCircle size={13} weight="bold" /> Keep & Resolve
                    </button>
                    <button
                      type="button"
                      onClick={() => resolveReport(rep.id, 'dismissed', false)}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--stride-border-strong)] px-3.5 py-1.5"
                    >
                      <XCircle size={13} weight="bold" /> Dismiss
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
