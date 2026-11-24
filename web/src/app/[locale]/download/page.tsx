'use client';

import React, { use, useEffect, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import {
  AndroidLogo,
  AppleLogo,
  CheckCircle,
  DownloadSimple,
  Gauge,
  HardDrives,
  Lightning,
  ShieldCheck,
} from '@phosphor-icons/react';
import { normalizeLocale } from '@/i18n';

interface VariantMeta {
  size: number;
  sha256: string;
}

function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DownloadPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = use(params);
  const locale = normalizeLocale(raw);
  const isHi = locale === 'hi';

  const [qrVariant, setQrVariant] = useState<'lite' | 'full'>('lite');
  const [qrUrl, setQrUrl] = useState<string>('');
  const [liteReady, setLiteReady] = useState<boolean | null>(null);
  const [fullReady, setFullReady] = useState<boolean | null>(null);
  const [manifest, setManifest] = useState<{ lite?: VariantMeta; full?: VariantMeta } | null>(null);

  useEffect(() => {
    fetch('/api/download-apk?variant=lite', { method: 'HEAD' })
      .then((r) => setLiteReady(r.ok))
      .catch(() => setLiteReady(false));
    fetch('/api/download-apk', { method: 'HEAD' })
      .then((r) => setFullReady(r.ok))
      .catch(() => setFullReady(false));

    const manifestUrl =
      process.env.NEXT_PUBLIC_APK_MANIFEST_URL ||
      'https://stride-apk.srimantasutapa123.workers.dev/manifest.json';
    fetch(manifestUrl)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setManifest({ lite: data.lite, full: data.full ?? data });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const origin =
      typeof window !== 'undefined' ? window.location.origin : 'https://stride-web.srimantasutapa123.workers.dev';
    const target =
      qrVariant === 'lite'
        ? `${origin}/api/download-apk?variant=lite`
        : `${origin}/api/download-apk`;
    QRCode.toDataURL(target, { width: 220, margin: 1 })
      .then(setQrUrl)
      .catch(() => {});
  }, [qrVariant]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-6 md:py-10">
      <div className="flex flex-col gap-2">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[var(--stride-accent-tint)] px-3 py-1 text-xs font-bold text-[var(--stride-accent)]">
          <Lightning size={15} weight="bold" />
          {isHi ? 'दो Android संस्करण + Web Lite PWA' : 'Dual Android Editions + Web Lite PWA'}
        </span>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
          {isHi ? 'Stride मोबाइल ऐप डाउनलोड करें' : 'Get the Stride Mobile App'}
        </h1>
        <p className="max-w-3xl text-sm text-[var(--stride-text-secondary)]">
          {isHi
            ? 'कम स्टोरेज और कम RAM वाले फोन के लिए अल्ट्रा-लाइट Stride Lite (हार्ड-कैप्ड कैश गार्जियन सहित) या स्टैंडर्ड Flutter संस्करण चुनें।'
            : 'Choose ultra-compact Stride Lite with a strict Storage & Cache Guardian for low-storage/RAM phones, or the full Flutter companion edition.'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Stride Lite Card */}
        <div
          className="stride-cinema-card flex flex-col justify-between gap-5 p-6 lg:col-span-4"
          style={{
            borderColor: 'var(--stride-accent)',
            boxShadow: 'var(--stride-shadow-deep), var(--stride-shadow-glow)',
          }}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--stride-accent)] px-2.5 py-0.5 text-[11px] font-bold text-white">
                <Lightning size={13} weight="fill" />
                {isHi ? 'सुझावित · अल्ट्रा-लाइट' : 'RECOMMENDED · LITE'}
              </span>
              <span className="font-mono text-xs font-bold text-[var(--stride-secondary)]">
                {formatBytes(manifest?.lite?.size)}
              </span>
            </div>
            <h2 className="text-2xl font-bold">Stride Lite</h2>
            <p className="text-xs leading-relaxed text-[var(--stride-text-secondary)]">
              {isHi
                ? 'नेटिव Kotlin में बना हल्का ऐप — 0 MB मैप टाइल कैश, 512 KB–5 MB हार्ड-सीमित SQLite LRU कैश, डेटा सेवर और बैकग्राउंड GPS रिकवरी।'
                : 'Pure native Android build with zero heavy engine libraries, 0 bytes of map tile bloat, configurable 512 KB–5 MB LRU cache cap, SQLite VACUUM, and Data Saver.'}
            </p>
            <ul className="space-y-1.5 pt-1 text-xs text-[var(--stride-text-secondary)]">
              <li className="flex items-center gap-2">
                <HardDrives size={14} weight="fill" className="text-[var(--stride-success)]" />
                <span>{isHi ? 'स्वचालित कैश सफाई व SQLite कॉम्पैक्शन' : 'Auto-purge temp cache + 1-tap SQLite VACUUM'}</span>
              </li>
              <li className="flex items-center gap-2">
                <Gauge size={14} weight="fill" className="text-[var(--stride-success)]" />
                <span>{isHi ? 'लॉगिन, फ़ीड, सेगमेंट्स, क्लब व ऑफ़लाइन GPS' : 'Auth + OTP, Feed, Segments, Clubs & Offline GPS'}</span>
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck size={14} weight="fill" className="text-[var(--stride-success)]" />
                <span>
                  SHA-256: <code className="font-mono text-[11px]">{manifest?.lite?.sha256?.slice(0, 12) ?? 'verified'}</code>
                </span>
              </li>
            </ul>
          </div>

          <a
            href="/api/download-apk?variant=lite"
            download="stride-lite-android.apk"
            className="stride-btn-luminous inline-flex items-center justify-center gap-2 px-4 text-xs"
          >
            <AndroidLogo size={17} weight="bold" />
            <DownloadSimple size={15} weight="bold" />
            <span>
              {liteReady === false
                ? 'Lite APK Building...'
                : isHi
                  ? `Stride Lite APK डाउनलोड (${formatBytes(manifest?.lite?.size)})`
                  : `Download Stride Lite (${formatBytes(manifest?.lite?.size)})`}
            </span>
          </a>
        </div>

        {/* Stride Standard Card */}
        <div className="stride-cinema-card flex flex-col justify-between gap-5 p-6 lg:col-span-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--stride-accent-tint)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--stride-accent)]">
                FLUTTER STANDARD
              </span>
              <span className="font-mono text-xs font-bold text-[var(--stride-text-secondary)]">
                {formatBytes(manifest?.full?.size)}
              </span>
            </div>
            <h2 className="text-2xl font-bold">Stride Standard</h2>
            <p className="text-xs leading-relaxed text-[var(--stride-text-secondary)]">
              {isHi
                ? 'पूरा Flutter क्रॉस-प्लेटफ़ॉर्म ऐप (15 MB इमेज मेमोरी कैप, 4 MB डिस्क सीमा और Google Play Integrity / FCM पुश तैयार)।'
                : 'Complete cross-platform Flutter recorder trimmed of heavy tile libraries, with 15 MB memory cache cap, 4 MB disk cap, FCM push, and crash-safe SQLite sync.'}
            </p>
            <ul className="space-y-1.5 pt-1 text-xs text-[var(--stride-text-secondary)]">
              <li className="flex items-center gap-2">
                <CheckCircle size={14} weight="fill" className="text-[var(--stride-success)]" />
                <span>{isHi ? 'Android पहले + iOS TestFlight तैयार कोडबेस' : 'Android-first + iOS-ready codebase'}</span>
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck size={14} weight="fill" className="text-[var(--stride-success)]" />
                <span>
                  SHA-256: <code className="font-mono text-[11px]">{manifest?.full?.sha256?.slice(0, 12) ?? 'verified'}</code>
                </span>
              </li>
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            <a
              href="/api/download-apk"
              download="stride-android.apk"
              className="stride-btn-secondary inline-flex items-center justify-center gap-2 px-4 text-xs"
            >
              <AndroidLogo size={17} weight="bold" />
              <DownloadSimple size={15} weight="bold" />
              <span>
                {fullReady === false
                  ? 'Standard APK Unavailable'
                  : isHi
                    ? `स्टैंडर्ड APK डाउनलोड (${formatBytes(manifest?.full?.size)})`
                    : `Download Standard (${formatBytes(manifest?.full?.size)})`}
              </span>
            </a>
            <Link
              href={`/${locale}/record`}
              className="stride-btn-secondary inline-flex items-center justify-center gap-2 px-4 text-xs"
            >
              <AppleLogo size={16} weight="bold" />
              <span>{isHi ? 'वेब / iOS PWA रिकॉर्डर खोलें' : 'Web Lite PWA / iOS Recorder'}</span>
            </Link>
          </div>
        </div>

        {/* QR Code Card */}
        <div className="stride-cinema-card flex flex-col items-center justify-between gap-4 p-6 lg:col-span-4">
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--stride-text-secondary)]">
              {isHi ? 'फ़ोन से स्कैन करें' : 'Scan to Install'}
            </span>
            <div className="flex rounded-full border border-[var(--stride-glass-border)] p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setQrVariant('lite')}
                className={`rounded-full px-2.5 py-1 font-semibold transition ${
                  qrVariant === 'lite' ? 'bg-[var(--stride-accent)] text-white' : 'text-[var(--stride-text-secondary)]'
                }`}
              >
                Lite
              </button>
              <button
                type="button"
                onClick={() => setQrVariant('full')}
                className={`rounded-full px-2.5 py-1 font-semibold transition ${
                  qrVariant === 'full' ? 'bg-[var(--stride-accent)] text-white' : 'text-[var(--stride-text-secondary)]'
                }`}
              >
                Standard
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--stride-glass-border)] bg-white p-4 shadow-xl">
            {qrUrl ? (
              <img src={qrUrl} alt={`QR Code for Stride ${qrVariant} APK`} className="h-44 w-44" />
            ) : (
              <div className="flex h-44 w-44 items-center justify-center text-xs text-slate-500">Generating QR...</div>
            )}
          </div>

          <span className="text-center text-[11px] text-[var(--stride-text-secondary)]">
            {qrVariant === 'lite'
              ? `stride-lite-android.apk (${formatBytes(manifest?.lite?.size)})`
              : `stride-android.apk (${formatBytes(manifest?.full?.size)})`}
          </span>
        </div>
      </div>

      {/* Architecture & Cache Comparison */}
      <div className="stride-cinema-card overflow-x-auto p-5">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-[var(--stride-text-secondary)]">
          {isHi ? 'साइज और कैश तुलना' : 'Size & Cache Comparison'}
        </h3>
        <table className="w-full min-w-[540px] text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--stride-glass-border)] text-[var(--stride-text-secondary)]">
              <th className="py-2 pr-4">{isHi ? 'विशेषता' : 'Metric'}</th>
              <th className="py-2 pr-4 text-[var(--stride-accent)]">Stride Lite (Native)</th>
              <th className="py-2">Stride Standard (Flutter)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--stride-glass-border)]">
            <tr>
              <td className="py-2 pr-4 font-medium">{isHi ? 'डाउनलोड साइज' : 'Download Size'}</td>
              <td className="py-2 pr-4 font-mono font-bold text-[var(--stride-success)]">{formatBytes(manifest?.lite?.size)}</td>
              <td className="py-2 font-mono">{formatBytes(manifest?.full?.size)}</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-medium">{isHi ? 'अधिकतम कैश सीमा' : 'Disk Cache Policy'}</td>
              <td className="py-2 pr-4">512 KB / 2 MB / 5 MB LRU + SQLite VACUUM</td>
              <td className="py-2">15 MB mem + 4 MB temp cap + Clear Cache</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-medium">{isHi ? 'मैप टाइल स्टोरेज' : 'Map Tile Disk Cache'}</td>
              <td className="py-2 pr-4 text-[var(--stride-success)]">0 bytes (Vector Canvas)</td>
              <td className="py-2 text-[var(--stride-success)]">0 bytes (Vector Canvas)</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-medium">{isHi ? 'पैकेज ID (साइड-बाय-साइड)' : 'Package ID'}</td>
              <td className="py-2 pr-4 font-mono">com.stride.tracker.lite</td>
              <td className="py-2 font-mono">com.stride.tracker</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
