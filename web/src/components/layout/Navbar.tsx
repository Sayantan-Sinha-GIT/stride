'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell,
  Compass,
  DeviceMobile,
  Flame,
  Gear,
  Gauge,
  Globe,
  List,
  Monitor,
  Moon,
  Path,
  PlusCircle,
  ShieldCheck,
  SignIn,
  SignOut,
  Sun,
  Trophy,
  UsersThree,
  X,
} from '@phosphor-icons/react';
import { getMessages, type Locale } from '@/i18n';
import { useAuth } from '../AuthProvider';
import { useTheme, type ThemeMode } from '../ThemeProvider';

export function Navbar({ locale }: { locale: Locale }) {
  const m = getMessages(locale);
  const pathname = usePathname();
  const router = useRouter();
  const { user, unreadNotifications, logout } = useAuth();
  const { mode, setMode } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const otherLocale: Locale = locale === 'en' ? 'hi' : 'en';
  const switchedPath = pathname?.replace(/^\/(en|hi)/, `/${otherLocale}`) || `/${otherLocale}`;

  const switchLanguage = () => {
    document.cookie = `stride_lang=${otherLocale}; Path=/; Max-Age=${365 * 86400}; SameSite=Lax`;
    router.push(switchedPath);
  };

  const cycleTheme = () => {
    const order: ThemeMode[] = ['dark', 'light', 'system'];
    const idx = order.indexOf(mode);
    setMode(order[(idx + 1) % order.length]);
  };

  const navItems = [
    { href: `/${locale}/feed`, label: m.nav.feed, icon: Path },
    { href: `/${locale}/segments`, label: m.nav.segments, icon: Trophy },
    { href: `/${locale}/routes`, label: m.nav.routes, icon: Compass },
    { href: `/${locale}/clubs`, label: m.nav.clubs, icon: UsersThree },
    { href: `/${locale}/challenges`, label: m.nav.challenges, icon: Flame },
    { href: `/${locale}/heatmap`, label: m.nav.heatmap, icon: Globe },
    { href: `/${locale}/dashboard`, label: m.nav.dashboard, icon: Gauge },
    { href: `/${locale}/download`, label: m.nav.download, icon: DeviceMobile },
  ];

  const isActive = (href: string) => pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <>
      <header className="stride-glass sticky top-0 z-40 border-b border-[var(--stride-border-subtle)]">
        <div className="mx-auto flex h-16 max-w-[1380px] items-center justify-between gap-3 px-4 md:px-6">
          <div className="flex items-center gap-6">
            <Link
              href={`/${locale}`}
              className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-[var(--stride-text-primary)]"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--stride-accent)] to-[var(--stride-accent-gold)] text-white shadow-sm">
                <Path size={18} weight="bold" />
              </span>
              <span className="font-editorial">{m.brand}</span>
            </Link>

            <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive(item.href)
                      ? 'bg-[var(--stride-accent-tint)] text-[var(--stride-accent)]'
                      : 'text-[var(--stride-text-secondary)] hover:bg-[var(--stride-bg-surface-hover)] hover:text-[var(--stride-text-primary)]'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            {/* Theme 3-way switcher */}
            <button
              type="button"
              onClick={cycleTheme}
              title={`Theme: ${mode}`}
              aria-label={`Switch theme (current: ${mode})`}
              className="flex min-h-[40px] items-center gap-1.5 rounded-full border border-[var(--stride-border-subtle)] bg-[var(--stride-bg-surface)] px-3 text-xs font-medium text-[var(--stride-text-secondary)] hover:text-[var(--stride-text-primary)]"
            >
              {mode === 'dark' ? (
                <Moon size={16} weight="bold" />
              ) : mode === 'light' ? (
                <Sun size={16} weight="bold" />
              ) : (
                <Monitor size={16} weight="bold" />
              )}
              <span className="hidden sm:inline capitalize">{m.theme[mode]}</span>
            </button>

            {/* EN / HI Language Switcher */}
            <button
              type="button"
              onClick={switchLanguage}
              className="flex min-h-[40px] items-center gap-1 rounded-full border border-[var(--stride-border-subtle)] bg-[var(--stride-bg-surface)] px-3 text-xs font-semibold text-[var(--stride-text-primary)] hover:border-[var(--stride-border-strong)]"
            >
              <Globe size={15} weight="bold" />
              <span>{locale === 'en' ? m.common.hindiSwitch : m.common.englishSwitch}</span>
            </button>

            <Link
              href={`/${locale}/record`}
              className="stride-btn-primary hidden items-center gap-1.5 px-3.5 text-xs sm:inline-flex"
            >
              <PlusCircle size={16} weight="bold" />
              <span>{m.nav.record}</span>
            </Link>

            {user ? (
              <div className="flex items-center gap-1.5">
                <Link
                  href={`/${locale}/notifications`}
                  aria-label="Notifications"
                  className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[var(--stride-border-subtle)] bg-[var(--stride-bg-surface)] text-[var(--stride-text-secondary)] hover:text-[var(--stride-text-primary)]"
                >
                  <Bell size={18} weight="bold" />
                  {unreadNotifications > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--stride-accent)] px-1 text-[10px] font-bold text-white">
                      {unreadNotifications}
                    </span>
                  )}
                </Link>

                {user.role === 'admin' && (
                  <Link
                    href={`/${locale}/admin`}
                    title={m.nav.admin}
                    className="hidden h-10 items-center gap-1 rounded-full border border-[var(--stride-border-subtle)] bg-[var(--stride-bg-surface)] px-3 text-xs font-semibold text-[var(--stride-warning)] md:inline-flex"
                  >
                    <ShieldCheck size={16} weight="bold" />
                    <span>{m.nav.admin}</span>
                  </Link>
                )}

                <Link
                  href={`/${locale}/settings`}
                  title={m.nav.settings}
                  aria-label={m.nav.settings}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--stride-border-subtle)] bg-[var(--stride-bg-surface)] text-[var(--stride-text-secondary)] hover:text-[var(--stride-text-primary)]"
                >
                  <Gear size={18} weight="bold" />
                </Link>

                <button
                  type="button"
                  onClick={() => logout()}
                  title={m.nav.logout}
                  aria-label={m.nav.logout}
                  className="hidden h-10 w-10 items-center justify-center rounded-full border border-[var(--stride-border-subtle)] bg-[var(--stride-bg-surface)] text-[var(--stride-text-secondary)] hover:text-[var(--stride-danger)] sm:flex"
                >
                  <SignOut size={18} weight="bold" />
                </button>
              </div>
            ) : (
              <Link
                href={`/${locale}/login`}
                className="stride-btn-secondary inline-flex items-center gap-1.5 px-3.5 text-xs"
              >
                <SignIn size={16} weight="bold" />
                <span>{m.nav.login}</span>
              </Link>
            )}

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle navigation menu"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--stride-border-subtle)] bg-[var(--stride-bg-surface)] text-[var(--stride-text-primary)] lg:hidden"
            >
              {mobileMenuOpen ? <X size={18} weight="bold" /> : <List size={18} weight="bold" />}
            </button>
          </div>
        </div>

        {/* Tablet/Mobile Slide-down Drawer */}
        {mobileMenuOpen && (
          <div className="border-t border-[var(--stride-border-subtle)] bg-[var(--stride-bg-elevated)] px-4 py-4 lg:hidden">
            <div className="grid grid-cols-2 gap-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex min-h-[44px] items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium ${
                      isActive(item.href)
                        ? 'bg-[var(--stride-accent-tint)] text-[var(--stride-accent)]'
                        : 'bg-[var(--stride-bg-surface)] text-[var(--stride-text-primary)]'
                    }`}
                  >
                    <Icon size={18} weight="bold" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              <Link
                href={`/${locale}/record`}
                onClick={() => setMobileMenuOpen(false)}
                className="flex min-h-[44px] items-center gap-2 rounded-xl bg-[var(--stride-accent)] px-3 py-2 text-sm font-semibold text-white"
              >
                <PlusCircle size={18} weight="bold" />
                <span>{m.nav.record}</span>
              </Link>
              {user && (
                <>
                  <Link
                    href={`/${locale}/year-in-review`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex min-h-[44px] items-center gap-2 rounded-xl bg-[var(--stride-bg-surface)] px-3 py-2 text-sm font-medium text-[var(--stride-text-primary)]"
                  >
                    <Trophy size={18} weight="bold" />
                    <span>{locale === 'hi' ? 'वार्षिक समीक्षा' : 'Year in Review'}</span>
                  </Link>
                  {user.role === 'admin' && (
                    <Link
                      href={`/${locale}/admin`}
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex min-h-[44px] items-center gap-2 rounded-xl bg-[var(--stride-bg-surface)] px-3 py-2 text-sm font-medium text-[var(--stride-warning)]"
                    >
                      <ShieldCheck size={18} weight="bold" />
                      <span>{m.nav.admin}</span>
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Consumer Mobile Bottom Bar (BookMyShow-grade speed & >= 44px touch targets) */}
      <nav
        aria-label="Mobile quick bar"
        className="stride-glass fixed right-0 bottom-0 left-0 z-40 grid grid-cols-5 border-t border-[var(--stride-border-subtle)] px-1 py-1 md:hidden"
      >
        {[
          { href: `/${locale}/feed`, label: m.nav.feed, icon: Path },
          { href: `/${locale}/segments`, label: m.nav.segments, icon: Trophy },
          { href: `/${locale}/record`, label: locale === 'hi' ? 'रिकॉर्ड' : 'Record', icon: PlusCircle },
          { href: `/${locale}/clubs`, label: m.nav.clubs, icon: UsersThree },
          { href: `/${locale}/dashboard`, label: m.nav.dashboard, icon: Gauge },
        ].map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium ${
                active ? 'text-[var(--stride-accent)]' : 'text-[var(--stride-text-secondary)]'
              }`}
            >
              <Icon size={20} weight={active ? 'fill' : 'regular'} />
              <span className="truncate max-w-full px-1">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
