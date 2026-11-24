import React from 'react';
import type { Metadata } from 'next';
import { ChallengeDetailClient } from '@/components/challenges/ChallengeDetailClient';
import { normalizeLocale } from '@/i18n';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const base = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8787';

  let title = 'Challenge — Stride';
  let description = 'Live challenge progress & community leaderboard on Stride.';
  try {
    const res = await fetch(`${base}/v1/challenges/${slug}`, { cache: 'no-store' });
    if (res.ok) {
      const json = (await res.json()) as { challenge?: { title: string; description: string } };
      if (json.challenge) {
        title = `${json.challenge.title} — Stride Challenge`;
        description = json.challenge.description || description;
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
        en: `${siteUrl}/en/challenges/${slug}`,
        hi: `${siteUrl}/hi/challenges/${slug}`,
      },
    },
  };
}

export default async function ChallengeDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: raw, slug } = await params;
  const locale = normalizeLocale(raw);
  return <ChallengeDetailClient slug={slug} locale={locale} />;
}
