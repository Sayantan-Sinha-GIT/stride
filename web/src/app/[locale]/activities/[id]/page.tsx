import React from 'react';
import type { Metadata } from 'next';
import { ActivityDetailClient } from '@/components/activities/ActivityDetailClient';
import { normalizeLocale } from '@/i18n';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const base = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8787';

  let title = 'Stride Activity';
  let description = 'View route replay, splits, elevation profile, and segment efforts on Stride.';

  try {
    const res = await fetch(`${base}/v1/activities/${id}`, { cache: 'no-store' });
    if (res.ok) {
      const json = (await res.json()) as {
        activity?: { title: string; distanceM: number; author?: { displayName: string } };
      };
      if (json.activity) {
        title = `${json.activity.title} — ${json.activity.author?.displayName || 'Stride'}`;
        description = `${(json.activity.distanceM / 1000).toFixed(2)} km GPS telemetry & route replay on Stride.`;
      }
    }
  } catch {
    // Public metadata fallback
  }

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [`${siteUrl}/api/og/activity/${id}`],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`${siteUrl}/api/og/activity/${id}`],
    },
    alternates: {
      languages: {
        en: `${siteUrl}/en/activities/${id}`,
        hi: `${siteUrl}/hi/activities/${id}`,
      },
    },
  };
}

export default async function ActivityDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: raw, id } = await params;
  const locale = normalizeLocale(raw);
  return <ActivityDetailClient activityId={id} locale={locale} />;
}
