'use client';

import React, { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowCounterClockwise, GoogleLogo, UserPlus } from '@phosphor-icons/react';
import { useAuth } from '@/components/AuthProvider';
import { getMessages, normalizeLocale } from '@/i18n';
import { apiFetch, getClientApiBase } from '@/lib/api';

export default function SignupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = use(params);
  const locale = normalizeLocale(raw);
  const m = getMessages(locale);
  const router = useRouter();
  const { loginWithCredentials } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'register' | 'verify'>('register');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      await apiFetch('/v1/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email, password, displayName, handle, language: locale }),
        skipAuthRefresh: true,
      });
      setStep('verify');
      setInfo(locale === 'hi' ? `${email} पर 6-अंकीय कोड भेजा गया है।` : `Sent a 6-digit verification code to ${email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : m.common.error);
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
        body: JSON.stringify({ email, code }),
        skipAuthRefresh: true,
      });
      await loginWithCredentials(email, password);
      router.push(`/${locale}/feed`);
    } catch (err) {
      setError(err instanceof Error ? err.message : m.common.error);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      await apiFetch('/v1/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email, language: locale }),
        skipAuthRefresh: true,
      });
      setInfo(locale === 'hi' ? `${email} पर नया कोड भेजा गया है।` : `Sent a fresh verification code to ${email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : m.common.error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="stride-card flex flex-col gap-5 p-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--stride-text-primary)]">{m.nav.signup}</h1>
          <p className="mt-1 text-sm text-[var(--stride-text-secondary)]">
            {locale === 'hi'
              ? 'डिफ़ॉल्ट रूप से फॉलोअर्स-ओनली गोपनीयता के साथ नया खाता बनाएं।'
              : 'New accounts default to followers-only activity privacy.'}
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

        {step === 'register' ? (
          <form onSubmit={handleRegister} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--stride-text-secondary)]">
              {locale === 'hi' ? 'पूरा नाम' : 'Display Name'}
              <input
                type="text"
                required
                minLength={2}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Kavya Sharma"
                className="min-h-[44px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3.5 text-sm text-[var(--stride-text-primary)]"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--stride-text-secondary)]">
              {locale === 'hi' ? 'हैंडल (Unique Handle)' : 'Unique Handle'}
              <input
                type="text"
                required
                minLength={3}
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="kavya_runs"
                className="min-h-[44px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3.5 text-sm text-[var(--stride-text-primary)]"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--stride-text-secondary)]">
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="kavya@example.com"
                className="min-h-[44px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3.5 text-sm text-[var(--stride-text-primary)]"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--stride-text-secondary)]">
              Password (8+ characters)
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="min-h-[44px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3.5 text-sm text-[var(--stride-text-primary)]"
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="stride-btn-primary mt-1 flex items-center justify-center gap-2 text-sm"
            >
              <UserPlus size={16} weight="bold" />
              <span>{loading ? '...' : m.nav.signup}</span>
            </button>

            <a
              href={`${getClientApiBase()}/v1/auth/google/start?lang=${locale}`}
              className="stride-btn-secondary flex items-center justify-center gap-2 text-sm"
            >
              <GoogleLogo size={17} weight="bold" />
              <span>{locale === 'hi' ? 'Google से साइन अप करें' : 'Sign up with Google'}</span>
            </a>
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
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="6-digit code"
              className="font-mono-num min-h-[44px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3.5 text-center text-lg tracking-widest text-[var(--stride-text-primary)]"
            />
            <button type="submit" disabled={loading} className="stride-btn-primary text-sm">
              {loading ? '...' : 'Verify & Continue'}
            </button>
            <div className="flex items-center justify-between gap-2 text-xs">
              <button
                type="button"
                disabled={loading}
                onClick={handleResend}
                className="inline-flex items-center gap-1 font-semibold text-[var(--stride-accent)] hover:underline"
              >
                <ArrowCounterClockwise size={14} weight="bold" />
                <span>Resend Code</span>
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setStep('register');
                  setError(null);
                  setInfo(null);
                }}
                className="text-[var(--stride-text-secondary)] hover:underline"
              >
                Edit Details
              </button>
            </div>
          </form>
        )}

        <p className="text-center text-xs text-[var(--stride-text-secondary)]">
          Already registered?{' '}
          <Link href={`/${locale}/login`} className="font-semibold text-[var(--stride-accent)] hover:underline">
            {m.nav.login}
          </Link>
        </p>
      </div>
    </div>
  );
}
