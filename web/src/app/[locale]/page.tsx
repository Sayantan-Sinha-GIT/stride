import React from 'react';
import { LandingShowcase } from '@/components/landing/LandingShowcase';
import { normalizeLocale } from '@/i18n';

export const dynamic = 'force-dynamic';

async function fetchShowcaseData() {
  const base = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8787';
  try {
    const [segRes, clubRes, chRes] = await Promise.all([
      fetch(`${base}/v1/segments`, { cache: 'no-store' }),
      fetch(`${base}/v1/clubs`, { cache: 'no-store' }),
      fetch(`${base}/v1/challenges`, { cache: 'no-store' }),
    ]);
    const segJson = segRes.ok ? ((await segRes.json()) as { segments?: unknown[] }) : {};
    const clubJson = clubRes.ok ? ((await clubRes.json()) as { clubs?: unknown[] }) : {};
    const chJson = chRes.ok ? ((await chRes.json()) as { challenges?: unknown[] }) : {};

    return {
      segments: (segJson.segments || []).slice(0, 4) as never[],
      clubs: (clubJson.clubs || []).slice(0, 4) as never[],
      challenges: (chJson.challenges || []).slice(0, 3) as never[],
    };
  } catch {
    return { segments: [], clubs: [], challenges: [] };
  }
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = normalizeLocale(rawLocale);
  const data = await fetchShowcaseData();

  return (
    <LandingShowcase
      locale={locale}
      featuredSegments={data.segments}
      featuredClubs={data.clubs}
      featuredChallenges={data.challenges}
    />
  );
}
