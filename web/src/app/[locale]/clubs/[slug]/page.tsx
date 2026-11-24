import React from 'react';
import type { Metadata } from 'next';
import { ClubDetailClient } from '@/components/clubs/ClubDetailClient';
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

  let title = 'Running & Cycling Club — Stride';
  let description = 'Explore club activities, members, and upcoming meetups on Stride.';
  try {
    const res = await fetch(`${base}/v1/clubs/${slug}`, { cache: 'no-store' });
    if (res.ok) {
      const json = (await res.json()) as { club?: { name: string; description: string; city: string } };
      if (json.club) {
        title = `${json.club.name} (${json.club.city || 'Stride'})`;
        description = json.club.description || description;
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
        en: `${siteUrl}/en/clubs/${slug}`,
        hi: `${siteUrl}/hi/clubs/${slug}`,
      },
    },
  };
}

export default async function ClubDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: raw, slug } = await params;
  const locale = normalizeLocale(raw);
  return <ClubDetailClient slug={slug} locale={locale} />;
}
