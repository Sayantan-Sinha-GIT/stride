import React from 'react';
import type { Metadata } from 'next';
import { PublicProfileClient } from '@/components/profile/PublicProfileClient';
import { normalizeLocale } from '@/i18n';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  return {
    title: `@${handle} — Stride Athlete`,
    description: `Public activities, badges, and stats for @${handle} on Stride.`,
    alternates: {
      languages: {
        en: `${siteUrl}/en/u/${handle}`,
        hi: `${siteUrl}/hi/u/${handle}`,
      },
    },
  };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ locale: string; handle: string }>;
}) {
  const { locale: raw, handle } = await params;
  const locale = normalizeLocale(raw);
  return <PublicProfileClient handle={handle} locale={locale} />;
}
