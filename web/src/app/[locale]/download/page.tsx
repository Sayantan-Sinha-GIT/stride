'use client';

import React, { use, useEffect, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import {
  AndroidLogo,
  AppleLogo,
  CheckCircle,
  DeviceMobile,
  DownloadSimple,
  ShieldCheck,
} from '@phosphor-icons/react';
import { normalizeLocale } from '@/i18n';

export default function DownloadPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = use(params);
  const locale = normalizeLocale(raw);
  const [qrUrl, setQrUrl] = useState<string>('');
  const [apkReady, setApkReady] = useState<boolean | null>(null);

  useEffect(() => {
    const target =
      typeof window !== 'undefined' ? window.location.href : 'https://stride.app/download';
    QRCode.toDataURL(target, { width: 220, margin: 1 })
      .then(setQrUrl)
      .catch(() => {});

    fetch('/api/download-apk', { method: 'HEAD' })
      .then((r) => setApkReady(r.ok))
      .catch(() => setApkReady(false));
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-6">
      <div className="stride-cinema-card relative overflow-hidden p-6 md:p-10" style={{ boxShadow: 'var(--stride-shadow-deep), var(--stride-shadow-glow)' }}>
        <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-12">
          <div className="flex flex-col gap-4 md:col-span-8">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[var(--stride-accent-tint)] px-3 py-1 text-xs font-bold text-[var(--stride-accent)]">
              <DeviceMobile size={15} weight="bold" />
              Flutter Native Companion App
            </span>
            <h1 className="text-3xl font-bold md:text-4xl">
              {locale === 'hi' ? 'Stride मोबाइल ऐप डाउनलोड करें' : 'Get the Stride Mobile App'}
            </h1>
            <p className="text-sm leading-relaxed text-[var(--stride-text-secondary)]">
              {locale === 'hi'
                ? 'बैकग्राउंड GPS रिकॉर्डिंग, फोन बंद होने पर भी सुरक्षित स्टोरेज, क्रैश रिकवरी और ऑफ़लाइन सिंक के साथ Android व iOS-तैयार ऐप।'
                : 'Android-first (iOS-ready) Flutter recorder built with foreground service reliability, continuous SQLite crash recovery, GPX import, and idempotent offline sync.'}
            </p>

            <div className="flex flex-wrap gap-3 pt-1">
              <a
                href="/api/download-apk"
                download="stride-android.apk"
                className="stride-btn-luminous inline-flex items-center gap-2 px-5 text-xs"
              >
                <AndroidLogo size={18} weight="bold" />
                <DownloadSimple size={16} weight="bold" />
                <span>
                  {apkReady === false ? 'Build Android APK (Local)' : 'Download Android Release APK'}
                </span>
              </a>
              <Link
                href={`/${locale}/record`}
                className="stride-btn-secondary inline-flex items-center gap-2 px-5 text-xs"
              >
                <AppleLogo size={18} weight="bold" />
                <span>iOS TestFlight Ready · Use Web Recorder</span>
              </Link>
            </div>

            <div className="mt-2 flex flex-col gap-1.5 text-xs text-[var(--stride-text-secondary)]">
              <div className="flex items-center gap-2">
                <CheckCircle size={15} weight="fill" className="text-[var(--stride-success)]" />
                <span>Offline-first SQLite queue: never loses an activity in dead zones</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck size={15} weight="fill" className="text-[var(--stride-success)]" />
                <span>Transparent foreground notification &amp; battery-aware sampling</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 rounded-2xl border border-[var(--stride-glass-border)] bg-white p-4 text-center shadow-xl md:col-span-4">
            {qrUrl ? (
              <img src={qrUrl} alt="QR Code for Stride Mobile Download" className="h-44 w-44" />
            ) : (
              <div className="flex h-44 w-44 items-center justify-center text-xs text-slate-500">Generating QR...</div>
            )}
            <span className="text-[11px] font-semibold text-slate-700">Scan on Phone to Open Download</span>
          </div>
        </div>
      </div>
    </div>
  );
}
