'use client';

import React, { Suspense, use, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Key } from '@phosphor-icons/react';
import { normalizeLocale, type Locale } from '@/i18n';
import { apiFetch } from '@/lib/api';

function ResetPasswordInner({ locale }: { locale: Locale }) {
  const searchParams = useSearchParams();
  const urlToken = searchParams.get('token') || '';

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [step, setStep] = useState<'request' | 'confirm' | 'done'>(urlToken ? 'confirm' : 'request');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const requestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch('/v1/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email, language: locale }),
        skipAuthRefresh: true,
      });
      setStep('confirm');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send reset code');
    } finally {
      setLoading(false);
    }
  };

  const confirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch('/v1/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify(
          urlToken ? { token: urlToken, newPassword } : { email, code, newPassword }
        ),
        skipAuthRefresh: true,
      });
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="stride-card flex flex-col gap-5 p-6">
        <div className="flex items-center gap-2">
          <Key size={22} weight="bold" className="text-[var(--stride-accent)]" />
          <h1 className="text-xl font-bold text-[var(--stride-text-primary)]">
            {locale === 'hi' ? 'पासवर्ड रीसेट' : 'Reset Password'}
          </h1>
        </div>

        {error && (
          <div className="rounded-xl border border-[var(--stride-danger)] bg-[rgba(239,68,68,0.12)] px-3 py-2 text-xs text-[var(--stride-danger)]">
            {error}
          </div>
        )}

        {step === 'request' && (
          <form onSubmit={requestReset} className="flex flex-col gap-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="min-h-[44px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3.5 text-sm"
            />
            <button type="submit" disabled={loading} className="stride-btn-primary text-sm">
              {loading ? '...' : 'Send Reset Code'}
            </button>
          </form>
        )}

        {step === 'confirm' && (
          <form onSubmit={confirmReset} className="flex flex-col gap-3">
            {!urlToken && (
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="6-digit reset code"
                className="font-mono-num min-h-[44px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3.5 text-sm"
              />
            )}
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (8+ chars)"
              className="min-h-[44px] rounded-xl border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3.5 text-sm"
            />
            <button type="submit" disabled={loading} className="stride-btn-primary text-sm">
              {loading ? '...' : 'Update Password'}
            </button>
          </form>
        )}

        {step === 'done' && (
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-[var(--stride-success)]">Password updated cleanly. All prior sessions were signed out.</p>
            <Link href={`/${locale}/login`} className="stride-btn-primary flex items-center justify-center">
              Sign In Now
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = use(params);
  const locale = normalizeLocale(raw);
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm">Loading...</div>}>
      <ResetPasswordInner locale={locale} />
    </Suspense>
  );
}
