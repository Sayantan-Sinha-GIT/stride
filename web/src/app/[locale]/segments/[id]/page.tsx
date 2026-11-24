import React from 'react';
import type { Metadata } from 'next';
import { SegmentDetailClient } from '@/components/segments/SegmentDetailClient';
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

  let title = 'Segment Leaderboard — Stride';
  let description = 'Competitive road and trail segment leaderboard on Stride.';
  try {
    const res = await fetch(`${base}/v1/segments/${id}`, { cache: 'no-store' });
    if (res.ok) {
      const json = (await res.json()) as {
        segment?: { name: string; city: string; distance_m: number };
      };
      if (json.segment) {
        title = `${json.segment.name} (${json.segment.city || 'India'}) — Stride Segment`;
        description = `${(json.segment.distance_m / 1000).toFixed(2)} km verified road segment leaderboard.`;
      }
    }
  } catch {
    // ignore
  }

  return {
    title,
    description,
    openGraph: { title, description },
    alternates: {
      languages: {
        en: `${siteUrl}/en/segments/${id}`,
        hi: `${siteUrl}/hi/segments/${id}`,
      },
    },
  };
}

export default async function SegmentDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: raw, id } = await params;
  const locale = normalizeLocale(raw);
  return <SegmentDetailClient segmentId={id} locale={locale} />;
}
