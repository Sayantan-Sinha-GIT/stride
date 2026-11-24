import React from 'react';
import type { Metadata } from 'next';
import { AmbientTopoBackdrop } from '@/components/layout/AmbientTopoBackdrop';
import { Footer } from '@/components/layout/Footer';
import { Navbar } from '@/components/layout/Navbar';
import { normalizeLocale, type Locale } from '@/i18n';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = normalizeLocale(rawLocale);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  return {
    title:
      locale === 'hi'
        ? 'Stride — सटीक GPS ट्रैकिंग, सेगमेंट्स और प्राइवेसी-फर्स्ट फिटनेस'
        : 'Stride — GPS Activity Tracker, Segments & Social Fitness',
    alternates: {
      canonical: `${siteUrl}/${locale}`,
      languages: {
        en: `${siteUrl}/en`,
        hi: `${siteUrl}/hi`,
        'x-default': `${siteUrl}/en`,
      },
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale: Locale = normalizeLocale(rawLocale);

  return (
    <div lang={locale} className="relative flex min-h-screen flex-col pb-16 md:pb-0">
      <AmbientTopoBackdrop />
      <Navbar locale={locale} />
      <main className="flex-1">{children}</main>
      <Footer locale={locale} />
    </div>
  );
}
