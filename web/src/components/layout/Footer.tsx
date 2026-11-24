import React from 'react';
import Link from 'next/link';
import { getMessages, type Locale } from '@/i18n';

export function Footer({ locale }: { locale: Locale }) {
  const m = getMessages(locale);

  return (
    <footer className="relative mt-16 overflow-hidden border-t border-[var(--stride-border-subtle)] bg-[var(--stride-bg-elevated)] pb-24 md:pb-8">
      <div className="mx-auto grid max-w-[1380px] grid-cols-1 gap-8 px-4 py-12 sm:grid-cols-2 md:grid-cols-4 md:px-6">
        <div>
          <div className="text-base font-bold text-[var(--stride-text-primary)]">{m.brand}</div>
          <p className="mt-2 text-xs leading-relaxed text-[var(--stride-text-secondary)]">
            {m.tagline}
          </p>
        </div>

        <div className="flex flex-col gap-2 text-xs">
          <span className="font-semibold text-[var(--stride-text-primary)]">
            {locale === 'hi' ? 'प्रोडक्ट' : 'Platform'}
          </span>
          <Link href={`/${locale}/feed`} className="text-[var(--stride-text-secondary)] hover:text-[var(--stride-accent)]">
            {m.nav.feed}
          </Link>
          <Link href={`/${locale}/segments`} className="text-[var(--stride-text-secondary)] hover:text-[var(--stride-accent)]">
            {m.nav.segments}
          </Link>
          <Link href={`/${locale}/routes`} className="text-[var(--stride-text-secondary)] hover:text-[var(--stride-accent)]">
            {m.nav.routes}
          </Link>
          <Link href={`/${locale}/heatmap`} className="text-[var(--stride-text-secondary)] hover:text-[var(--stride-accent)]">
            {m.nav.heatmap}
          </Link>
        </div>

        <div className="flex flex-col gap-2 text-xs">
          <span className="font-semibold text-[var(--stride-text-primary)]">
            {locale === 'hi' ? 'समुदाय और ऐप' : 'Community & App'}
          </span>
          <Link href={`/${locale}/clubs`} className="text-[var(--stride-text-secondary)] hover:text-[var(--stride-accent)]">
            {m.nav.clubs}
          </Link>
          <Link href={`/${locale}/challenges`} className="text-[var(--stride-text-secondary)] hover:text-[var(--stride-accent)]">
            {m.nav.challenges}
          </Link>
          <Link href={`/${locale}/download`} className="text-[var(--stride-text-secondary)] hover:text-[var(--stride-accent)]">
            {m.nav.download}
          </Link>
          <Link href={`/${locale}/year-in-review`} className="text-[var(--stride-text-secondary)] hover:text-[var(--stride-accent)]">
            {locale === 'hi' ? 'वार्षिक समीक्षा' : 'Year in Review'}
          </Link>
        </div>

        <div className="flex flex-col gap-2 text-xs">
          <span className="font-semibold text-[var(--stride-text-primary)]">
            {locale === 'hi' ? 'गोपनीयता और नियम' : 'Privacy & Legal'}
          </span>
          <Link href={`/${locale}/privacy`} className="text-[var(--stride-text-secondary)] hover:text-[var(--stride-accent)]">
            {locale === 'hi' ? 'गोपनीयता नीति (DPDP)' : 'Privacy Policy (DPDP)'}
          </Link>
          <Link href={`/${locale}/terms`} className="text-[var(--stride-text-secondary)] hover:text-[var(--stride-accent)]">
            {locale === 'hi' ? 'सेवा की शर्तें' : 'Terms of Service'}
          </Link>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="font-editorial pointer-events-none mx-auto max-w-[1380px] px-4 text-center text-[56px] leading-none font-extrabold tracking-tight text-[var(--stride-text-primary)] opacity-[0.045] select-none sm:text-[96px] lg:text-[132px]"
      >
        STRIDE
      </div>
    </footer>
  );
}
