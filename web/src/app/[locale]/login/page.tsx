'use client';

import React, { Suspense, use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowCounterClockwise, GoogleLogo, ShieldCheck, SignIn } from '@phosphor-icons/react';
import { useAuth } from '@/components/AuthProvider';
import { getMessages, normalizeLocale, type Locale } from '@/i18n';
import { apiFetch, getClientApiBase, saveAuthTokens } from '@/lib/api';

function formatAuthError(code: string | null): string | null {
  if (!code) return null;
  const map: Record<string, string> = {
    google_oauth_unavailable: 'Google Sign-In is currently unavailable. Please sign in with email or try again.',
    google_exchange_failed: 'Google authorization expired or could not be completed. Please try again.',
    missing_id_token: 'Google did not return an identity token. Please try again.',
    google_verification_failed: 'Unable to verify your Google account. If an unverified email account exists, verify it first.',
  };
  return map[code] || code;
}

function LoginInner({ locale }: { locale: Locale }) {
  const m = getMessages(locale);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loginWithCredentials, refreshMe } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [showVerify, setShowVerify] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(formatAuthError(searchParams.get('error')));
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    const oauthCode = searchParams.get('oauthCode');
    const verifyToken = searchParams.get('verifyToken');

    if (oauthCode) {
      let active = true;
      setLoading(true);
      setError(null);
      setInfo(locale === 'hi' ? 'Google से लॉग इन पूरा हो रहा है...' : 'Completing Google sign-in...');
      apiFetch<{ accessToken: string; refreshToken: string }>('/v1/auth/oauth-exchange', {
        method: 'POST',
        body: JSON.stringify({ code: oauthCode }),
        skipAuthRefresh: true,
      })
        .then(async (res) => {
          if (!active) return;
          saveAuthTokens(res.accessToken, res.refreshToken);
          await refreshMe();
          router.replace(`/${locale}/feed`);
        })
        .catch((err) => {
          if (!active) return;
          setInfo(null);
          setError(err instanceof Error ? err.message : 'Unable to complete Google sign-in.');
          setLoading(false);
        });
      return () => {
        active = false;
      };
    }

    if (verifyToken) {
      let active = true;
      setLoading(true);
      setError(null);
      apiFetch('/v1/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token: verifyToken }),
        skipAuthRefresh: true,
      })
        .then(() => {
          if (!active) return;
          setShowVerify(false);
          setInfo(locale === 'hi' ? 'ईमेल सत्यापित हो गया! जारी रखने के लिए साइन इन करें।' : 'Email verified! Sign in below to continue.');
          router.replace(`/${locale}/login`);
        })
        .catch((err) => {
          if (!active) return;
          setError(err instanceof Error ? err.message : 'Verification link is invalid or expired.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }
  }, [searchParams, locale, refreshMe, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      await loginWithCredentials(email, password);
      router.push(`/${locale}/feed`);
    } catch (err) {
      const e2 = err as Error & { code?: string };
      if (e2.code === 'EMAIL_NOT_VERIFIED') {
        setShowVerify(true);
      }
      setError(e2.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      await apiFetch('/v1/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ email, code: verifyCode }),
        skipAuthRefresh: true,
      });
      setShowVerify(false);
      setInfo(locale === 'hi' ? 'ईमेल सत्यापित हो गया! अब लॉग इन हो रहा है...' : 'Email verified! Signing you in...');
      await loginWithCredentials(email, password);
      router.push(`/${locale}/feed`);
    } catch (err) {
      setError(err instanceof Error ? err.message : m.common.error);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email.trim()) return;
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      await apiFetch('/v1/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), language: locale }),
        skipAuthRefresh: true,
      });
      setInfo(locale === 'hi' ? `${email.trim()} पर नया 6-अंकीय कोड भेजा गया है।` : `Sent a fresh 6-digit code to ${email.trim()}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : m.common.error);
    } finally {
      setLoading(false);
    }
  };

  const quickDemo = async (demoEmail: string, demoPass: string, dest: string) => {
    setError(null);
    setLoading(true);
    try {
      await loginWithCredentials(demoEmail, demoPass);
      router.push(dest);
    } catch (err) {
      setError(err instanceof Error ? err.message : m.common.error);
    } finally {
      setLoading(false);
    }
  };

  const forgotHref = email.trim()
    ? `/${locale}/reset-password?email=${encodeURIComponent(email.trim())}`
    : `/${locale}/reset-password`;

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="stride-card flex flex-col gap-5 p-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--stride-text-primary)]">{m.nav.login}</h1>
          <p className="mt-1 text-sm text-[var(--stride-text-secondary)]">
            {locale === 'hi' ? 'अपने Stride खाते में प्रवेश करें' : 'Sign in to sync activities, segments & clubs.'}
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-[var(--stride-danger)] bg-[rgba(239,68,68,0.12)] px-3.5 py-2.5 text-xs font-medium text-[var(--stride-danger)]">
            {error}
          </div>
        )}
        {info && (
          <div className="rounded-xl border border-[var(--stride-success)] bg-[rgba(24,184,122,0.12)] px-3.5 py-2.5 text-xs font-medium text-[var(--stride-success)]">
            {info}
          </div>
        )}

        {!showVerify ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--stride-text-secondary)]">
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="arjun@stride.demo"
                className="min-h-[44px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3.5 text-sm text-[var(--stride-text-primary)] outline-none focus:border-[var(--stride-accent)]"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--stride-text-secondary)]">
              Password
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="min-h-[44px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3.5 text-sm text-[var(--stride-text-primary)] outline-none focus:border-[var(--stride-accent)]"
              />
            </label>

            <div className="flex justify-end">
              <Link href={forgotHref} className="text-xs font-medium text-[var(--stride-accent)] hover:underline">
                {locale === 'hi' ? 'पासवर्ड भूल गए?' : 'Forgot password?'}
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="stride-btn-primary flex items-center justify-center gap-2 text-sm"
            >
              <SignIn size={16} weight="bold" />
              <span>{loading ? '...' : m.nav.login}</span>
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="flex flex-col gap-3.5">
            <p className="text-xs text-[var(--stride-text-secondary)]">
              Enter the 6-digit verification code sent to <strong>{email}</strong>.
            </p>
            <input
              type="text"
              required
              maxLength={6}
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value)}
              placeholder="123456"
              className="font-mono-num min-h-[44px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3.5 text-center text-lg tracking-widest text-[var(--stride-text-primary)]"
            />
            <button type="submit" disabled={loading} className="stride-btn-primary text-sm">
              {loading ? '...' : 'Verify & Sign In'}
            </button>
            <div className="flex items-center justify-between gap-2 text-xs">
              <button
                type="button"
                disabled={loading}
                onClick={handleResend}
                className="inline-flex items-center gap-1 font-semibold text-[var(--stride-accent)] hover:underline"
              >
                <ArrowCounterClockwise size={14} weight="bold" />
                <span>Resend 6-digit code</span>
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setShowVerify(false);
                  setError(null);
                  setInfo(null);
                }}
                className="text-[var(--stride-text-secondary)] hover:underline"
              >
                Back to Sign In
              </button>
            </div>
          </form>
        )}

        <div className="relative flex items-center py-1">
          <div className="flex-grow border-t border-[var(--stride-border-subtle)]" />
          <span className="mx-3 text-[11px] uppercase text-[var(--stride-text-muted)]">or</span>
          <div className="flex-grow border-t border-[var(--stride-border-subtle)]" />
        </div>

        <a
          href={`${getClientApiBase()}/v1/auth/google/start?lang=${locale}`}
          className="stride-btn-secondary flex items-center justify-center gap-2 text-sm"
        >
          <GoogleLogo size={17} weight="bold" />
          <span>{locale === 'hi' ? 'Google से जारी रखें' : 'Continue with Google'}</span>
        </a>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            disabled={loading}
            onClick={() => quickDemo('arjun@stride.demo', 'StrideDemo123!', `/${locale}/feed`)}
            className="stride-btn-secondary px-3 text-xs"
          >
            {m.hero.ctaDemo}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => quickDemo('admin@stride.demo', 'StrideAdmin123!', `/${locale}/admin`)}
            className="stride-btn-secondary inline-flex items-center justify-center gap-1 px-3 text-xs"
          >
            <ShieldCheck size={14} weight="bold" className="text-[var(--stride-warning)]" />
            <span>{m.hero.ctaAdmin}</span>
          </button>
        </div>

        <p className="text-center text-xs text-[var(--stride-text-secondary)]">
          {locale === 'hi' ? 'नया खाता चाहिए?' : "Don't have an account?"}{' '}
          <Link href={`/${locale}/signup`} className="font-semibold text-[var(--stride-accent)] hover:underline">
            {m.nav.signup}
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = use(params);
  const locale = normalizeLocale(raw);
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm">Loading...</div>}>
      <LoginInner locale={locale} />
    </Suspense>
  );
}
