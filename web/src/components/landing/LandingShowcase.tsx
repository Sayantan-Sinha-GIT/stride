'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { maskTrackForViewer, processTrack, type RawTrackPoint } from '@stride/track-engine';
import {
  AndroidLogo,
  ArrowRight,
  ArrowsHorizontal,
  Compass,
  Crown,
  DeviceMobile,
  Flame,
  Gauge,
  Globe,
  Pause,
  Play,
  PlusCircle,
  ShieldCheck,
  Sparkle,
  Trophy,
  UsersThree,
} from '@phosphor-icons/react';
import { getMessages, type Locale } from '@/i18n';
import { formatDistance, formatDuration, formatElevation, formatPaceOrSpeed } from '@/lib/format';
import { useAuth } from '../AuthProvider';
import { TelemetryChart } from '../charts/TelemetryChart';
import { StrideMap } from '../maps/StrideMap';
import { Terrain3DCanvas } from '../maps/Terrain3DCanvas';

gsap.registerPlugin(ScrollTrigger, useGSAP);

interface ShowcaseProps {
  locale: Locale;
  featuredSegments: Array<{
    id: string;
    name: string;
    city: string;
    activity_type: string;
    distance_m: number;
    effort_count: number;
    kom_time_s?: number;
  }>;
  featuredClubs: Array<{
    id: string;
    slug: string;
    name: string;
    city: string;
    member_count: number;
    sport_focus: string;
  }>;
  featuredChallenges: Array<{
    id: string;
    slug: string;
    title: string;
    target_value: number;
    metric_type: string;
    participant_count: number;
  }>;
}

const DEMO_ROUTES: Record<
  'cubbon' | 'marine' | 'maidan',
  { label: string; city: string; type: 'run' | 'ride'; waypoints: Array<[number, number]>; durationS: number }
> = {
  cubbon: {
    label: 'Cubbon Park Loop',
    city: 'Bengaluru',
    type: 'run',
    durationS: 810,
    waypoints: [
      [12.9762, 77.5929],
      [12.9792, 77.5955],
      [12.9788, 77.5992],
      [12.9746, 77.6004],
      [12.9718, 77.5968],
      [12.9729, 77.5916],
      [12.9756, 77.5923],
    ],
  },
  marine: {
    label: 'Marine Drive Promenade',
    city: 'Mumbai',
    type: 'ride',
    durationS: 960,
    waypoints: [
      [18.9438, 72.8231],
      [18.9382, 72.8247],
      [18.9315, 72.8258],
      [18.9261, 72.8242],
      [18.9322, 72.8255],
      [18.9394, 72.8244],
    ],
  },
  maidan: {
    label: 'Maidan Victoria Loop',
    city: 'Kolkata',
    type: 'run',
    durationS: 1580,
    waypoints: [
      [22.5494, 88.3478],
      [22.5542, 88.3501],
      [22.5561, 88.3455],
      [22.5518, 88.3412],
      [22.5461, 88.3429],
      [22.5488, 88.3472],
    ],
  },
};

function buildTrack(waypoints: Array<[number, number]>, durationS: number, type: 'run' | 'ride') {
  const pts: RawTrackPoint[] = [];
  const t0 = 1_760_000_000_000;
  const stepsPerLeg = 30;
  const totalSteps = (waypoints.length - 1) * stepsPerLeg;
  let k = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [lat1, lng1] = waypoints[i];
    const [lat2, lng2] = waypoints[i + 1];
    for (let s = 0; s < (i === waypoints.length - 2 ? stepsPerLeg + 1 : stepsPerLeg); s++) {
      const ratio = s / stepsPerLeg;
      const f = k / totalSteps;
      pts.push({
        lat: lat1 + (lat2 - lat1) * ratio,
        lng: lng1 + (lng2 - lng1) * ratio,
        ele: 912 + Math.sin(f * Math.PI * 2) * 14 + f * 18,
        time: t0 + Math.round(f * durationS * 1000),
        accuracyM: 5,
      });
      k++;
    }
  }
  return processTrack(pts, { activityType: type, weightKg: 68 });
}

/**
 * Isolated hero telemetry deck so route replay updates never re-render downstream cinema sections.
 * Pauses automatically via IntersectionObserver when scrolled out of view on mobile & desktop.
 */
const HeroTelemetryDeck = React.memo(function HeroTelemetryDeck({
  locale,
  selectedCity,
  onSelectCity,
  activeTrack,
  onReplaySync,
}: {
  locale: Locale;
  selectedCity: 'cubbon' | 'marine' | 'maidan';
  onSelectCity: (city: 'cubbon' | 'marine' | 'maidan') => void;
  activeTrack: ReturnType<typeof buildTrack>;
  onReplaySync?: (progress: number) => void;
}) {
  const m = getMessages(locale);
  const deckRef = useRef<HTMLDivElement | null>(null);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replayProgress, setReplayProgress] = useState(0.58);
  const [deckVisible, setDeckVisible] = useState(true);

  useEffect(() => {
    // Auto-play live route replay on desktop; on mobile keep paused initially for effortless 60fps scrolling (one-tap Play Replay anytime)
    if (window.innerWidth >= 768 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setReplayPlaying(true);
    }
  }, []);

  useEffect(() => {
    const el = deckRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => setDeckVisible(entries[0]?.isIntersecting ?? true),
      { threshold: 0.05 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!replayPlaying || !deckVisible) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const id = window.setInterval(() => {
      setReplayProgress((prev) => {
        const next = prev >= 0.99 ? 0.02 : Number((prev + 0.024).toFixed(3));
        return next;
      });
    }, 240);
    return () => window.clearInterval(id);
  }, [replayPlaying, deckVisible]);

  useEffect(() => {
    onReplaySync?.(replayProgress);
  }, [replayProgress, onReplaySync]);

  return (
    <div
      ref={deckRef}
      className="hero-framed-deck stride-cinema-card relative z-10 mx-auto max-w-[960px] p-3.5 md:p-5"
      style={{ boxShadow: 'var(--stride-shadow-deep), var(--stride-shadow-glow)' }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {(['cubbon', 'marine', 'maidan'] as const).map((cityKey) => (
            <button
              key={cityKey}
              type="button"
              onClick={() => onSelectCity(cityKey)}
              className={`min-h-[36px] rounded-full px-3.5 text-xs font-semibold transition-all ${
                selectedCity === cityKey
                  ? 'bg-[var(--stride-accent)] text-white shadow-sm'
                  : 'bg-[var(--stride-bg-elevated)] text-[var(--stride-text-secondary)] hover:text-[var(--stride-text-primary)]'
              }`}
            >
              {DEMO_ROUTES[cityKey].city} · {DEMO_ROUTES[cityKey].label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden rounded-full bg-[var(--stride-bg-elevated)] px-3 py-1 text-[11px] font-semibold text-[var(--stride-text-secondary)] sm:inline-flex">
            Pitch 50° · Live Telemetry
          </span>
          <button
            type="button"
            onClick={() => setReplayPlaying((v) => !v)}
            className="flex min-h-[36px] items-center gap-1.5 rounded-full border border-[var(--stride-border-strong)] bg-[var(--stride-bg-elevated)] px-3.5 text-xs font-semibold text-[var(--stride-text-primary)]"
          >
            {replayPlaying ? <Pause size={14} weight="fill" /> : <Play size={14} weight="fill" />}
            <span>{replayPlaying ? 'Pause Replay' : 'Play Replay'}</span>
          </button>
        </div>
      </div>

      <StrideMap
        points={activeTrack.points}
        replayProgress={replayProgress}
        heightClass="h-[240px] md:h-[315px]"
        pitch={50}
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-[200px] flex-1 items-center gap-3">
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(replayProgress * 100)}
            onChange={(e) => {
              setReplayPlaying(false);
              setReplayProgress(Number(e.target.value) / 100);
            }}
            aria-label="Route replay timeline"
            className="h-2 w-full accent-[var(--stride-accent)]"
          />
          <span className="font-mono-num w-11 text-right text-xs text-[var(--stride-text-secondary)]">
            {Math.round(replayProgress * 100)}%
          </span>
        </div>

        <div className="grid w-full grid-cols-2 gap-2 rounded-2xl border border-[var(--stride-border-subtle)] bg-[var(--stride-bg-elevated)] px-3 py-2.5 text-center sm:grid-cols-4 lg:w-auto lg:min-w-[440px]">
          <div>
            <div className="text-[10px] tracking-wide uppercase text-[var(--stride-text-muted)]">
              {m.metrics.distance}
            </div>
            <div className="font-mono-num text-sm font-bold text-[var(--stride-text-primary)]">
              {formatDistance(activeTrack.distanceM, 'metric', locale)}
            </div>
          </div>
          <div>
            <div className="text-[10px] tracking-wide uppercase text-[var(--stride-text-muted)]">
              {m.metrics.movingTime}
            </div>
            <div className="font-mono-num text-sm font-bold text-[var(--stride-text-primary)]">
              {formatDuration(activeTrack.movingTimeS)}
            </div>
          </div>
          <div>
            <div className="text-[10px] tracking-wide uppercase text-[var(--stride-text-muted)]">
              {DEMO_ROUTES[selectedCity].type === 'ride' ? m.metrics.speed : m.metrics.pace}
            </div>
            <div className="font-mono-num text-sm font-bold text-[var(--stride-text-primary)]">
              {formatPaceOrSpeed(activeTrack.avgSpeedMps, DEMO_ROUTES[selectedCity].type, 'metric', locale)}
            </div>
          </div>
          <div>
            <div className="text-[10px] tracking-wide uppercase text-[var(--stride-text-muted)]">
              {m.metrics.elevation}
            </div>
            <div className="font-mono-num text-sm font-bold text-[var(--stride-text-primary)]">
              {formatElevation(activeTrack.elevationGainM, 'metric', locale)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export function LandingShowcase({
  locale,
  featuredSegments,
  featuredClubs,
  featuredChallenges,
}: ShowcaseProps) {
  const m = getMessages(locale);
  const router = useRouter();
  const { user, loginWithCredentials } = useAuth();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const curtainRef = useRef<HTMLDivElement | null>(null);

  const [selectedCity, setSelectedCity] = useState<'cubbon' | 'marine' | 'maidan'>('cubbon');
  const [chartProgress, setChartProgress] = useState(0.42);
  const [shieldRadiusM, setShieldRadiusM] = useState(250);
  const [demoLoading, setDemoLoading] = useState<string | null>(null);
  const [activeDiscipline, setActiveDiscipline] = useState<'run' | 'ride' | 'trail'>('run');
  const [phoneScreenMode, setPhoneScreenMode] = useState<'gps' | 'kom' | 'shield'>('gps');
  const [splitPct, setSplitPct] = useState(52);
  const [draggingSplit, setDraggingSplit] = useState(false);

  const activeTrack = useMemo(() => {
    const spec = DEMO_ROUTES[selectedCity];
    return buildTrack(spec.waypoints, spec.durationS, spec.type);
  }, [selectedCity]);

  const privacyPreview = useMemo(() => {
    const origin = activeTrack.points[0];
    if (!origin) return null;
    return maskTrackForViewer(
      activeTrack.points,
      [{ id: 'demo-home', name: 'Home Zone', lat: origin.lat, lng: origin.lng, radiusMeters: shieldRadiusM }],
      0
    );
  }, [activeTrack, shieldRadiusM]);

  const updateCurtainFromClientX = useCallback((clientX: number) => {
    const el = curtainRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = ((clientX - rect.left) / Math.max(rect.width, 1)) * 100;
    setSplitPct(Math.max(8, Math.min(92, Math.round(ratio))));
  }, []);

  useEffect(() => {
    if (!draggingSplit) return;
    const onMove = (e: PointerEvent) => updateCurtainFromClientX(e.clientX);
    const onUp = () => setDraggingSplit(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [draggingSplit, updateCurtainFromClientX]);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('.hero-entrance', {
          y: 22,
          duration: 0.65,
          stagger: 0.07,
          ease: 'power3.out',
        });

        gsap.to('.hero-backdrop-wordmark', {
          y: -58,
          scale: 1.06,
          scrollTrigger: {
            trigger: '.hero-cinema-band',
            start: 'top top',
            end: 'bottom top',
            scrub: 0.7,
          },
        });

        gsap.to('.hero-framed-deck', {
          y: -24,
          scale: 0.985,
          scrollTrigger: {
            trigger: '.hero-cinema-band',
            start: 'top top',
            end: 'bottom top',
            scrub: 0.85,
          },
        });

        gsap.to('.hero-wing-left', {
          y: -48,
          scrollTrigger: {
            trigger: '.hero-cinema-band',
            start: 'top top',
            end: 'bottom top',
            scrub: 0.6,
          },
        });

        gsap.to('.hero-wing-right', {
          y: -36,
          scrollTrigger: {
            trigger: '.hero-cinema-band',
            start: 'top top',
            end: 'bottom top',
            scrub: 0.9,
          },
        });

        // Kinetic telemetry strip counters
        gsap.utils.toArray<HTMLElement>('.kinetic-counter-val').forEach((el) => {
          const target = Number(el.dataset.target || '0');
          const decimals = Number(el.dataset.decimals || '0');
          const prefix = el.dataset.prefix || '';
          const suffix = el.dataset.suffix || '';
          const obj = { val: 0 };
          gsap.to(obj, {
            val: target,
            duration: 1.15,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: el,
              start: 'top 90%',
              once: true,
            },
            onUpdate: () => {
              el.textContent = `${prefix}${obj.val.toFixed(decimals)}${suffix}`;
            },
          });
        });

        // Stacked 3D perspective entrance for editorial showcase panels
        gsap.utils.toArray<HTMLElement>('.cinema-chapter-card').forEach((card) => {
          gsap.fromTo(
            card,
            { scale: 0.94, y: 42, rotateX: 4, transformPerspective: 1200 },
            {
              scale: 1,
              y: 0,
              rotateX: 0,
              ease: 'power2.out',
              scrollTrigger: {
                trigger: card,
                start: 'top 92%',
                end: 'top 42%',
                scrub: 0.65,
              },
            }
          );
        });

        // Scroll-scrubbed photo parallax
        gsap.utils.toArray<HTMLElement>('.parallax-photo').forEach((el) => {
          gsap.fromTo(
            el,
            { y: -18, scale: 1.08 },
            {
              y: 18,
              scale: 1.02,
              ease: 'none',
              scrollTrigger: {
                trigger: el.parentElement || el,
                start: 'top bottom',
                end: 'bottom top',
                scrub: 0.9,
              },
            }
          );
        });
      });
    },
    { scope: rootRef }
  );

  const handleDemoLogin = async (email: string, pass: string, target: string, key: string) => {
    setDemoLoading(key);
    try {
      await loginWithCredentials(email, pass);
      router.push(target);
    } finally {
      setDemoLoading(null);
    }
  };

  const disciplines = [
    {
      id: 'run' as const,
      num: '01',
      label: locale === 'hi' ? 'रोड रनिंग' : 'Road Running',
      metric: '4:12 /km · Cubbon Park',
      headline: locale === 'hi' ? 'शून्य GPS ड्रिफ्ट के साथ तेज़ पेस लॉगिंग' : 'Zero-drift pace precision on tree-canopy boulevards',
      desc:
        locale === 'hi'
          ? 'टेलीपोर्ट जम्प और रुके हुए ट्रैफ़िक सिग्नल ऑटो-फ़िल्टर होकर सटीक स्प्लिट्स देते हैं।'
          : 'Deterministic outlier smoothing removes city canyon jitter and signal pauses for verified splits.',
      image: '/images/sport-run.jpg',
      alt: 'Road runner striding through morning sunlight',
      href: `/${locale}/record`,
      cta: locale === 'hi' ? 'रन रिकॉर्ड करें' : 'Record Run',
    },
    {
      id: 'ride' as const,
      num: '02',
      label: locale === 'hi' ? 'माउंटेन साइकलिंग' : 'Road & Climb Cycling',
      metric: '34.8 km/h · +1,120m Gain',
      headline: locale === 'hi' ? 'हर हेयरपिन और क्लाइंब सेगमेंट की सटीक समय गणना' : 'Interpolated KOM split timing on technical ascents',
      desc:
        locale === 'hi'
          ? '3m हिस्टेरेसिस एलिवेशन क्लीनिंग और Hausdorff सेगमेंट मिलान के साथ हर क्लाइंब रैंक करें।'
          : 'Hausdorff proximity matching and 3m elevation hysteresis guarantee fair KOM/QOM climb leaderboards.',
      image: '/images/cycling-climb.jpg',
      alt: 'Road cyclists ascending sunlit mountain road',
      href: `/${locale}/segments`,
      cta: locale === 'hi' ? 'सेगमेंट्स देखें' : 'Explore KOMs',
    },
    {
      id: 'trail' as const,
      num: '03',
      label: locale === 'hi' ? 'ट्रेल और हाइकिंग' : 'Trail & Alpine Ridge',
      metric: '15s Auto-Pause · Offline Queue',
      headline: locale === 'hi' ? 'बिना नेटवर्क वाले जंगलों में भी क्रैश-प्रूफ़ ट्रैकिंग' : 'Crash-safe offline SQLite recording off the grid',
      desc:
        locale === 'hi'
          ? 'नेटवर्क के बिना हर पॉइंट फोन में सुरक्षित रहता है और ऑनलाइन होते ही सिंक होता है।'
          : 'Every waypoint persists locally in SQLite so dense forest canopy or zero signal never loses a trek.',
      image: '/images/sport-trail.jpg',
      alt: 'Sunlit emerald forest trail path winding uphill',
      href: `/${locale}/routes`,
      cta: locale === 'hi' ? 'रूट्स खोजें' : 'Find Trails',
    },
  ];

  const chapters = [
    {
      num: '02',
      tag: locale === 'hi' ? 'अध्याय ०२ · सेगमेंट इंजन' : 'CHAPTER 02 · HAUSDORFF ENGINE',
      title:
        locale === 'hi'
          ? 'सटीक एंट्री/एग्ज़िट इंटरपोलेशन से हर सेगमेंट का निष्पक्ष परिणाम'
          : 'Sub-second segment boundary arbitration that refuses shortcuts',
      body:
        locale === 'hi'
          ? 'दो अलग-अलग फोन पर रिकॉर्ड की गई रेस भी समान एल्गोरिदम से मापी जाती है—रिवर्स या शॉर्टकट स्वतः अस्वीकार होते हैं।'
          : 'Cross-device uploads pass through one deterministic @stride/track-engine pipeline validating loop order, minimum overlap, and anti-vehicle speed fairness.',
      metricLeft: '< 35m Hausdorff',
      metricRight: '10/10 Shared Vectors',
      href: `/${locale}/segments`,
      cta: locale === 'hi' ? 'लीडरबोर्ड खोलें' : 'Open Leaderboards',
      image: '/images/mountain-runner.jpg',
      alt: 'Trail runner ascending high mountain ridge above alpine valley',
      reverse: false,
    },
    {
      num: '03',
      tag: locale === 'hi' ? 'अध्याय ०३ · प्राइवेसी व हीटमैप्स' : 'CHAPTER 03 · K>=3 CITY HEATMAPS',
      title:
        locale === 'hi'
          ? 'कलेक्टिव सिटी हीटमैप्स — व्यक्तिगत घर के पते बिना उजागर किए'
          : 'City endurance pulse grids protected by k-anonymity thresholds',
      body:
        locale === 'hi'
          ? 'हीटमैप ग्रिड केवल तभी चमकता है जब कम से कम 3 अलग एथलीट उस क्षेत्र से गुज़रें; आपके होम ज़ोन सर्वर-साइड पर कटते हैं।'
          : 'Heatmap geohashes unlock only once three or more distinct athletes traverse a cell, while home/work coordinates clip before any API serialization.',
      metricLeft: 'k >= 3 Distinct Athletes',
      metricRight: 'Server-Clipped Polyline',
      href: `/${locale}/heatmap`,
      cta: locale === 'hi' ? 'हीटमैप एक्सप्लोर करें' : 'Inspect City Heatmap',
      image: '/images/sport-ride.jpg',
      alt: 'Cyclists riding beneath high sunlit mountain range',
      reverse: true,
    },
  ];

  return (
    <div ref={rootRef} className="relative">
      {/* ========================================================================
          ACT 1: FRAMED KINETIC VIEWPORT HERO + GPU-SHADER 3D WEBGL TERRAIN
         ======================================================================== */}
      <section className="hero-cinema-band relative overflow-hidden border-b border-[var(--stride-border-subtle)] bg-[var(--stride-bg-canvas)]">
        <div className="pointer-events-none absolute inset-0 z-0">
          <img
            src="/images/hero-alpine-dawn.jpg"
            alt="Sunrise clouds rolling between steep karst peaks"
            className="h-full w-full object-cover object-center opacity-50 transition-opacity duration-500 [html[data-theme='light']_&]:opacity-25"
          />
          <div className="absolute inset-0" style={{ background: 'var(--stride-vignette-bottom)' }} />
        </div>

        <Terrain3DCanvas className="z-[1] opacity-90" />

        <div className="stride-grid-bg relative z-10 mx-auto max-w-[1380px] px-4 pt-6 pb-10 md:px-6 lg:pt-8 lg:pb-12">
          <div className="grid grid-cols-1 items-end gap-6 lg:grid-cols-12">
            <div className="hero-entrance flex flex-col gap-3.5 lg:col-span-7">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--stride-glass-border)] bg-[var(--stride-bg-glass)] px-3.5 py-1.5 text-xs font-semibold text-[var(--stride-accent)] backdrop-blur-md">
                <Sparkle size={14} weight="fill" />
                <span>{m.hero.eyebrow}</span>
              </div>

              <h1 className="text-[32px] leading-[1.06] font-bold tracking-tight text-[var(--stride-text-primary)] md:text-[44px] xl:text-[50px]">
                {m.hero.title}
              </h1>

              <p className="max-w-[58ch] text-sm leading-relaxed text-[var(--stride-text-secondary)] md:text-base">
                {m.hero.subtitle}
              </p>
            </div>

            <div className="hero-entrance flex flex-col gap-3 lg:col-span-5 lg:items-end">
              <div className="flex flex-wrap items-center gap-2.5 lg:justify-end">
                <Link
                  href={`/${locale}/feed`}
                  className="stride-btn-luminous inline-flex items-center gap-2 px-5 text-sm"
                >
                  <span>{m.hero.ctaPrimary}</span>
                  <ArrowRight size={16} weight="bold" />
                </Link>
                <Link
                  href={`/${locale}/record`}
                  className="stride-btn-secondary inline-flex items-center gap-2 px-4 text-xs"
                >
                  <PlusCircle size={16} weight="bold" />
                  <span>{m.hero.ctaRecord}</span>
                </Link>
              </div>

              {!user && (
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <button
                    type="button"
                    disabled={demoLoading !== null}
                    onClick={() =>
                      handleDemoLogin('arjun@stride.demo', 'StrideDemo123!', `/${locale}/feed`, 'athlete')
                    }
                    className="stride-btn-secondary inline-flex min-h-[38px] items-center gap-1.5 px-3.5 text-xs"
                  >
                    <Play size={13} weight="fill" className="text-[var(--stride-accent)]" />
                    <span>{demoLoading === 'athlete' ? '...' : m.hero.ctaDemo}</span>
                  </button>
                  <button
                    type="button"
                    disabled={demoLoading !== null}
                    onClick={() =>
                      handleDemoLogin('admin@stride.demo', 'StrideAdmin123!', `/${locale}/admin`, 'admin')
                    }
                    className="stride-btn-secondary inline-flex min-h-[38px] items-center gap-1.5 px-3.5 text-xs"
                  >
                    <ShieldCheck size={14} weight="fill" className="text-[var(--stride-warning)]" />
                    <span>{demoLoading === 'admin' ? '...' : m.hero.ctaAdmin}</span>
                  </button>
                </div>
              )}

              <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: m.nav.segments, href: `/${locale}/segments`, icon: Trophy },
                  { label: m.nav.routes, href: `/${locale}/routes`, icon: Compass },
                  { label: m.nav.clubs, href: `/${locale}/clubs`, icon: UsersThree },
                  { label: m.nav.heatmap, href: `/${locale}/heatmap`, icon: Globe },
                ].map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <Link
                      key={cat.href}
                      href={cat.href}
                      className="stride-glass flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold text-[var(--stride-text-primary)] transition-colors hover:border-[var(--stride-accent)]"
                    >
                      <Icon size={15} weight="bold" className="text-[var(--stride-accent)]" />
                      <span className="truncate">{cat.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="relative mt-8 pt-6 md:mt-10 md:pt-10">
            <div
              aria-hidden="true"
              className="hero-backdrop-wordmark font-editorial pointer-events-none absolute -top-3 right-0 left-0 text-center text-[66px] leading-none font-extrabold tracking-tight text-[var(--stride-text-primary)] opacity-[0.09] select-none sm:text-[104px] lg:text-[138px]"
            >
              STRIDE
            </div>

            <div className="hero-wing-left stride-cinema-card stride-glass pointer-events-none absolute top-24 left-0 z-20 hidden w-44 p-3 xl:block">
              <div className="text-[10px] font-bold tracking-wider uppercase text-[var(--stride-accent)]">
                Determinism
              </div>
              <div className="font-mono-num mt-0.5 text-sm font-bold text-[var(--stride-text-primary)]">
                0.28% Variance
              </div>
              <div className="text-[11px] text-[var(--stride-text-secondary)]">
                Client + Server synced
              </div>
            </div>

            <div className="hero-wing-right stride-cinema-card stride-glass pointer-events-none absolute top-32 right-0 z-20 hidden w-44 p-3 xl:block">
              <div className="text-[10px] font-bold tracking-wider uppercase text-[var(--stride-success)]">
                Privacy Shield
              </div>
              <div className="font-mono-num mt-0.5 text-sm font-bold text-[var(--stride-text-primary)]">
                {privacyPreview?.hiddenPointCount ?? 0} Pts Clipped
              </div>
              <div className="text-[11px] text-[var(--stride-text-secondary)]">
                Zero home leaks
              </div>
            </div>

            <HeroTelemetryDeck
              locale={locale}
              selectedCity={selectedCity}
              onSelectCity={setSelectedCity}
              activeTrack={activeTrack}
              onReplaySync={setChartProgress}
            />
          </div>
        </div>
      </section>

      {/* ========================================================================
          ACT 2: KINETIC TELEMETRY DETERMINISM BAR
         ======================================================================== */}
      <section className="relative border-b border-[var(--stride-border-subtle)] bg-[var(--stride-bg-elevated)]/90 py-8">
        <div className="mx-auto max-w-[1380px] px-4 md:px-6">
          <div className="stride-cinema-card overflow-hidden p-5 md:p-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-bold tracking-widest uppercase text-[var(--stride-accent)]">
                  /01 GEODESIC DELTA
                </span>
                <span
                  data-target="0.28"
                  data-decimals="2"
                  data-suffix="%"
                  className="kinetic-counter-val font-mono-num text-2xl font-extrabold text-[var(--stride-text-primary)] md:text-3xl"
                >
                  0.28%
                </span>
                <span className="text-xs text-[var(--stride-text-secondary)]">
                  Verified 5km distance accuracy vs surveyor track
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-bold tracking-widest uppercase text-[var(--stride-accent)]">
                  /02 HAUSDORFF GATE
                </span>
                <span
                  data-target="35"
                  data-decimals="0"
                  data-prefix="< "
                  data-suffix="m"
                  className="kinetic-counter-val font-mono-num text-2xl font-extrabold text-[var(--stride-text-primary)] md:text-3xl"
                >
                  &lt; 35m
                </span>
                <span className="text-xs text-[var(--stride-text-secondary)]">
                  PostGIS spatial shape gate blocking shortcuts
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-bold tracking-widest uppercase text-[var(--stride-success)]">
                  /03 ANONYMITY FLOOR
                </span>
                <span
                  data-target="3"
                  data-decimals="0"
                  data-prefix="k >= "
                  className="kinetic-counter-val font-mono-num text-2xl font-extrabold text-[var(--stride-text-primary)] md:text-3xl"
                >
                  k &gt;= 3
                </span>
                <span className="text-xs text-[var(--stride-text-secondary)]">
                  Distinct athletes required per heatmap tile cell
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-bold tracking-widest uppercase text-[var(--stride-warning)]">
                  /04 CRASH SURVIVAL
                </span>
                <span
                  data-target="100"
                  data-decimals="0"
                  data-suffix="%"
                  className="kinetic-counter-val font-mono-num text-2xl font-extrabold text-[var(--stride-text-primary)] md:text-3xl"
                >
                  100%
                </span>
                <span className="text-xs text-[var(--stride-text-secondary)]">
                  SQLite WAL waypoint durability &amp; idempotent sync
                </span>
              </div>
            </div>
            <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--stride-bg-canvas)]">
              <div
                className="h-full w-full rounded-full"
                style={{
                  background:
                    'linear-gradient(90deg, var(--stride-accent) 0%, var(--stride-accent-gold) 45%, var(--stride-success) 100%)',
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================
          ACT 3: EXPANDABLE TACTILE DISCIPLINE PHOTO ACCORDION
         ======================================================================== */}
      <section className="mx-auto max-w-[1380px] px-4 py-12 md:px-6 md:py-14">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-xs font-bold tracking-widest uppercase text-[var(--stride-accent)]">
              {locale === 'hi' ? 'तीन खेल, एक सटीक इंजन' : 'THREE DISCIPLINES · ONE PHYSICS ENGINE'}
            </span>
            <h2 className="mt-1 text-2xl font-bold text-[var(--stride-text-primary)] md:text-3xl">
              {m.hero.capabilitiesTitle}
            </h2>
          </div>
          <Link href={`/${locale}/dashboard`} className="text-xs font-semibold text-[var(--stride-accent)] hover:underline">
            {m.nav.dashboard} →
          </Link>
        </div>

        <div className="flex flex-col gap-3.5 lg:h-[430px] lg:flex-row">
          {disciplines.map((d) => {
            const active = activeDiscipline === d.id;
            return (
              <div
                key={d.id}
                role="button"
                tabIndex={0}
                onClick={() => setActiveDiscipline(d.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveDiscipline(d.id);
                  }
                }}
                aria-expanded={active}
                className={`group relative cursor-pointer overflow-hidden rounded-[22px] border border-[var(--stride-glass-border)] shadow-xl transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  active ? 'min-h-[300px] lg:flex-[2.4]' : 'min-h-[140px] lg:flex-[0.9] lg:hover:flex-[1.15]'
                }`}
              >
                <img
                  src={d.image}
                  alt={d.alt}
                  className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
                />
                <div
                  className={`absolute inset-0 transition-opacity duration-500 ${
                    active
                      ? 'bg-gradient-to-t from-black/90 via-black/45 to-black/15'
                      : 'bg-gradient-to-t from-black/85 via-black/60 to-black/35'
                  }`}
                />

                <div className="relative z-10 flex h-full flex-col justify-between p-5 text-white md:p-6">
                  <div className={`flex gap-2 ${active ? 'flex-wrap items-center justify-between' : 'flex-col items-start'}`}>
                    <span className="whitespace-nowrap rounded-full border border-white/25 bg-black/55 px-3 py-1 text-[11px] font-bold tracking-wide uppercase backdrop-blur-md">
                      /{d.num} · {d.label}
                    </span>
                    <span className="font-mono-num whitespace-nowrap rounded-full bg-[var(--stride-accent)]/95 px-2.5 py-0.5 text-[11px] font-bold text-white">
                      {d.metric}
                    </span>
                  </div>

                  {active ? (
                    <div className="flex flex-col gap-3">
                      <h3 className="max-w-xl text-xl leading-tight font-bold text-white md:text-2xl">
                        {d.headline}
                      </h3>
                      <p className="max-w-lg text-xs leading-relaxed text-white/85 md:text-sm">
                        {d.desc}
                      </p>
                      <div className="pt-1">
                        <Link
                          href={d.href}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex min-h-[42px] items-center gap-1.5 rounded-full bg-white px-4 text-xs font-bold text-slate-950 transition-transform hover:scale-[1.03]"
                        >
                          <span>{d.cta}</span>
                          <ArrowRight size={14} weight="bold" />
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-end justify-between">
                      <span className="text-base font-bold text-white/95">{d.label}</span>
                      <span className="text-xs font-semibold text-white/75">Click to expand →</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ========================================================================
          ACT 4: INTERACTIVE BEFORE / AFTER TELEMETRY CURTAIN + LIVE PRIVACY SHIELD
         ======================================================================== */}
      <section className="relative border-y border-[var(--stride-border-subtle)] bg-[var(--stride-bg-elevated)] py-14">
        <div className="mx-auto max-w-[1380px] px-4 md:px-6">
          <div className="relative mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-xs font-bold tracking-widest uppercase text-[var(--stride-accent)]">
                {locale === 'hi' ? 'अध्याय ०१ · सिग्नल शुद्धि व सुरक्षा' : 'CHAPTER 01 · SIGNAL HYGIENE & PRIVACY SHIELD'}
              </div>
              <h2 className="mt-1 text-2xl font-bold text-[var(--stride-text-primary)] md:text-3xl">
                {locale === 'hi'
                  ? 'रॉ फोन GPS बनाम Stride इंजन — स्लाइड करके अंतर देखें'
                  : 'Raw Phone GPS vs. Stride Track Engine — Drag to inspect'}
              </h2>
            </div>
            <div aria-hidden="true" className="stride-chapter-num hidden text-[78px] md:block">
              01
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="stride-cinema-card flex flex-col justify-between gap-4 p-5 lg:col-span-6">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="rounded-full bg-[var(--stride-danger)]/15 px-3 py-1 font-bold text-[var(--stride-danger)]">
                  BEFORE · Raw Unfiltered GPS
                </span>
                <span className="font-mono-num text-[var(--stride-text-muted)]">Split: {splitPct}%</span>
                <span className="rounded-full bg-[var(--stride-success)]/15 px-3 py-1 font-bold text-[var(--stride-success)]">
                  AFTER · Stride Track Engine
                </span>
              </div>

              <div
                ref={curtainRef}
                onPointerDown={(e) => {
                  setDraggingSplit(true);
                  updateCurtainFromClientX(e.clientX);
                }}
                className="relative h-[290px] w-full cursor-ew-resize touch-none overflow-hidden rounded-2xl border border-[var(--stride-border-strong)] bg-[#070b10] select-none"
              >
                <div className="stride-grid-bg absolute inset-0 flex flex-col justify-between p-4 text-white">
                  <svg viewBox="0 0 600 240" className="h-full w-full">
                    <circle cx="88" cy="176" r="38" fill="rgba(24, 184, 122, 0.14)" stroke="#18b87a" strokeWidth="1.5" strokeDasharray="5 5" />
                    <text x="52" y="130" fill="#18b87a" fontSize="11" fontWeight="700">250m SHIELDED</text>
                    <path
                      d="M 118 158 C 165 130, 210 92, 265 98 C 318 104, 345 148, 405 132 C 455 118, 496 74, 542 86"
                      fill="none"
                      stroke="#18b87a"
                      strokeWidth="5"
                      strokeLinecap="round"
                    />
                    <circle cx="118" cy="158" r="5" fill="#18b87a" />
                    <circle cx="542" cy="86" r="6" fill="#ff4d1c" />
                  </svg>
                  <div className="flex items-center justify-end gap-2 text-[11px] font-semibold">
                    <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-emerald-300">
                      3m Hysteresis
                    </span>
                    <span className="font-mono-num rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-emerald-300">
                      +42m True Gain
                    </span>
                  </div>
                </div>

                <div
                  className="stride-grid-bg absolute inset-0 bg-[#130b0d] p-4 text-white"
                  style={{ clipPath: `inset(0 ${100 - splitPct}% 0 0)` }}
                >
                  <svg viewBox="0 0 600 240" className="h-full w-full">
                    <circle cx="88" cy="176" r="10" fill="rgba(239, 68, 68, 0.35)" stroke="#ef4444" strokeWidth="2" />
                    <text x="48" y="206" fill="#f87171" fontSize="11" fontWeight="700">HOME EXPOSED</text>
                    <path
                      d="M 88 176 L 138 148 L 165 56 L 194 128 L 265 98 L 304 188 L 352 108 L 405 132 L 442 42 L 488 94 L 542 86"
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="3.5"
                      strokeDasharray="6 4"
                      strokeLinecap="round"
                    />
                    <circle cx="165" cy="56" r="5" fill="#f59e0b" />
                    <circle cx="304" cy="188" r="5" fill="#f59e0b" />
                    <circle cx="442" cy="42" r="5" fill="#f59e0b" />
                  </svg>
                  <div className="absolute right-4 bottom-4 left-4 flex items-center justify-start gap-2 text-[11px] font-semibold">
                    <span className="rounded-full bg-red-500/20 px-2.5 py-0.5 text-red-300">+840m Canyon Drift</span>
                    <span className="font-mono-num rounded-full bg-amber-500/20 px-2.5 py-0.5 text-amber-300">
                      +194m Noise
                    </span>
                  </div>
                </div>

                <div
                  className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_16px_rgba(255,255,255,0.9)]"
                  style={{ left: `${splitPct}%` }}
                >
                  <div className="absolute top-1/2 left-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-[var(--stride-accent)] text-white shadow-lg">
                    <ArrowsHorizontal size={18} weight="bold" />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-[var(--stride-text-secondary)]">
                  Keyboard / slider control:
                </span>
                <input
                  type="range"
                  min={8}
                  max={92}
                  value={splitPct}
                  onChange={(e) => setSplitPct(Number(e.target.value))}
                  aria-label="Before and after GPS cleaning split slider"
                  className="h-2 flex-1 accent-[var(--stride-accent)]"
                />
              </div>
            </div>

            <div className="stride-cinema-card flex flex-col gap-4 p-5 lg:col-span-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-bold text-[var(--stride-text-primary)]">
                  <ShieldCheck size={18} weight="fill" className="text-[var(--stride-success)]" />
                  <span>Live Server Privacy Zone Simulator</span>
                </div>
                <span className="font-mono-num rounded-full bg-[var(--stride-accent-tint)] px-3 py-1 text-xs font-bold text-[var(--stride-accent)]">
                  {shieldRadiusM} m radius
                </span>
              </div>

              <div className="rounded-xl border border-[var(--stride-border-subtle)] bg-[var(--stride-bg-elevated)] p-3">
                <input
                  type="range"
                  min={100}
                  max={1200}
                  step={50}
                  value={shieldRadiusM}
                  onChange={(e) => setShieldRadiusM(Number(e.target.value))}
                  aria-label="Privacy zone radius meters"
                  className="h-2 w-full accent-[var(--stride-accent)]"
                />
                {privacyPreview && (
                  <div className="mt-2.5 grid grid-cols-3 gap-2 text-center text-xs">
                    <div>
                      <div className="text-[var(--stride-text-muted)]">Hidden Points</div>
                      <div className="font-mono-num font-bold text-[var(--stride-warning)]">
                        {privacyPreview.hiddenPointCount}
                      </div>
                    </div>
                    <div>
                      <div className="text-[var(--stride-text-muted)]">Public Visible</div>
                      <div className="font-mono-num font-bold text-[var(--stride-success)]">
                        {privacyPreview.points.length} pts
                      </div>
                    </div>
                    <div>
                      <div className="text-[var(--stride-text-muted)]">Visible Distance</div>
                      <div className="font-mono-num font-bold text-[var(--stride-text-primary)]">
                        {formatDistance(privacyPreview.visibleDistanceM, 'metric', locale)}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <StrideMap
                lazy
                points={privacyPreview?.points || activeTrack.points}
                privacyZones={
                  activeTrack.points[0]
                    ? [
                        {
                          lat: activeTrack.points[0].lat,
                          lng: activeTrack.points[0].lng,
                          radiusMeters: shieldRadiusM,
                        },
                      ]
                    : []
                }
                heightClass="h-[190px]"
                pitch={32}
              />

              <TelemetryChart
                stream={activeTrack.stream}
                progressRatio={chartProgress}
                onSelectProgress={setChartProgress}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================
          ACT 5: SCROLL-SCRUBBED 3D PERSPECTIVE STACKED CHAPTERS (02 & 03)
         ======================================================================== */}
      <section className="mx-auto flex max-w-[1380px] flex-col gap-12 px-4 py-14 md:px-6">
        {chapters.map((ch) => (
          <div
            key={ch.num}
            className="cinema-chapter-card stride-cinema-card grid grid-cols-1 items-center gap-8 p-6 lg:grid-cols-12 lg:p-8"
          >
            <div className={`relative flex flex-col gap-4 lg:col-span-6 ${ch.reverse ? 'lg:order-2' : ''}`}>
              <div aria-hidden="true" className="stride-chapter-num text-[76px] md:text-[96px]">
                {ch.num}
              </div>
              <span className="text-xs font-bold tracking-widest uppercase text-[var(--stride-accent)]">
                {ch.tag}
              </span>
              <h3 className="text-2xl leading-tight font-bold text-[var(--stride-text-primary)] md:text-3xl">
                {ch.title}
              </h3>
              <p className="text-sm leading-relaxed text-[var(--stride-text-secondary)]">
                {ch.body}
              </p>
              <div className="flex flex-wrap gap-2.5 pt-1">
                <span className="font-mono-num rounded-xl border border-[var(--stride-border-subtle)] bg-[var(--stride-bg-elevated)] px-3.5 py-2 text-xs font-bold text-[var(--stride-text-primary)]">
                  {ch.metricLeft}
                </span>
                <span className="font-mono-num rounded-xl border border-[var(--stride-border-subtle)] bg-[var(--stride-bg-elevated)] px-3.5 py-2 text-xs font-bold text-[var(--stride-success)]">
                  {ch.metricRight}
                </span>
              </div>
              <div className="pt-2">
                <Link
                  href={ch.href}
                  className="stride-btn-primary inline-flex items-center gap-2 px-5 text-xs"
                >
                  <span>{ch.cta}</span>
                  <ArrowRight size={15} weight="bold" />
                </Link>
              </div>
            </div>

            <div className={`relative h-[280px] overflow-hidden rounded-[22px] border border-[var(--stride-glass-border)] shadow-2xl md:h-[360px] lg:col-span-6 ${ch.reverse ? 'lg:order-1' : ''}`}>
              <img
                src={ch.image}
                alt={ch.alt}
                className={`parallax-photo h-[116%] w-full object-cover ${ch.reverse ? 'object-[50%_72%]' : 'object-center'}`}
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/15" />
              <div className="absolute right-4 bottom-4 left-4 flex items-center justify-between text-xs font-semibold text-white">
                <span className="rounded-full bg-black/55 px-3 py-1 backdrop-blur-md">{ch.metricLeft}</span>
                <span className="rounded-full bg-[var(--stride-accent)]/90 px-3 py-1">{ch.metricRight}</span>
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* ========================================================================
          ACT 6: LIVE NEON DB COMMUNITY ARENA + INTERACTIVE COMPANION STAGE
         ======================================================================== */}
      <section className="mx-auto max-w-[1380px] px-4 pb-16 md:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-xs font-bold tracking-widest uppercase text-[var(--stride-accent)]">
              LIVE POSTGRES + POSTGIS ARENA
            </span>
            <h2 className="mt-1 text-2xl font-bold text-[var(--stride-text-primary)] md:text-3xl">
              {locale === 'hi' ? 'सक्रिय सेगमेंट्स, क्लब और चुनौतियाँ' : 'Active Segments, Clubs & Challenges'}
            </h2>
          </div>
          <Link href={`/${locale}/segments`} className="text-xs font-semibold text-[var(--stride-accent)] hover:underline">
            {m.common.viewAll} →
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="stride-cinema-card flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-bold text-[var(--stride-text-primary)]">
                <Crown size={18} weight="fill" className="text-[var(--stride-warning)]" />
                <span>{m.nav.segments}</span>
              </h3>
              <Link href={`/${locale}/segments`} className="text-xs font-semibold text-[var(--stride-accent)] hover:underline">
                {m.common.viewAll}
              </Link>
            </div>
            <div className="flex flex-col gap-2.5">
              {featuredSegments.length === 0 ? (
                <p className="text-xs text-[var(--stride-text-muted)]">{m.common.empty}</p>
              ) : (
                featuredSegments.map((seg) => (
                  <Link
                    key={seg.id}
                    href={`/${locale}/segments/${seg.id}`}
                    className="flex items-center justify-between rounded-xl border border-[var(--stride-border-subtle)] bg-[var(--stride-bg-elevated)] px-3.5 py-2.5 transition-colors hover:border-[var(--stride-accent)]"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[var(--stride-text-primary)]">{seg.name}</div>
                      <div className="text-xs text-[var(--stride-text-secondary)]">
                        {seg.city} · {formatDistance(seg.distance_m, 'metric', locale)}
                      </div>
                    </div>
                    <div className="font-mono-num shrink-0 text-right text-xs font-bold text-[var(--stride-accent)]">
                      {seg.kom_time_s ? formatDuration(seg.kom_time_s) : `${seg.effort_count} efforts`}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="stride-cinema-card flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-bold text-[var(--stride-text-primary)]">
                <UsersThree size={18} weight="fill" className="text-[var(--stride-accent)]" />
                <span>{m.nav.clubs}</span>
              </h3>
              <Link href={`/${locale}/clubs`} className="text-xs font-semibold text-[var(--stride-accent)] hover:underline">
                {m.common.viewAll}
              </Link>
            </div>
            <div className="flex flex-col gap-2.5">
              {featuredClubs.map((club) => (
                <Link
                  key={club.id}
                  href={`/${locale}/clubs/${club.slug}`}
                  className="flex items-center justify-between rounded-xl border border-[var(--stride-border-subtle)] bg-[var(--stride-bg-elevated)] px-3.5 py-2.5 transition-colors hover:border-[var(--stride-accent)]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[var(--stride-text-primary)]">{club.name}</div>
                    <div className="text-xs text-[var(--stride-text-secondary)]">
                      {club.city} · {club.sport_focus.toUpperCase()}
                    </div>
                  </div>
                  <span className="font-mono-num shrink-0 rounded-full bg-[var(--stride-accent-tint)] px-2.5 py-0.5 text-xs font-semibold text-[var(--stride-accent)]">
                    {club.member_count}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <div className="stride-cinema-card flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-bold text-[var(--stride-text-primary)]">
                <Flame size={18} weight="fill" className="text-[var(--stride-accent)]" />
                <span>{m.nav.challenges}</span>
              </h3>
              <Link href={`/${locale}/challenges`} className="text-xs font-semibold text-[var(--stride-accent)] hover:underline">
                {m.common.viewAll}
              </Link>
            </div>
            <div className="flex flex-col gap-2.5">
              {featuredChallenges.map((ch) => (
                <Link
                  key={ch.id}
                  href={`/${locale}/challenges/${ch.slug}`}
                  className="flex items-center justify-between rounded-xl border border-[var(--stride-border-subtle)] bg-[var(--stride-bg-elevated)] px-3.5 py-2.5 transition-colors hover:border-[var(--stride-accent)]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[var(--stride-text-primary)]">{ch.title}</div>
                    <div className="text-xs text-[var(--stride-text-secondary)]">
                      {ch.participant_count} athletes joined
                    </div>
                  </div>
                  <ArrowRight size={16} weight="bold" className="text-[var(--stride-accent)]" />
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Sculpted Titanium Companion Mobile Hardware Showcase with 3 interactive views */}
        <div
          className="stride-cinema-card relative mt-8 overflow-hidden p-6 text-white md:p-10"
          style={{ background: 'linear-gradient(145deg, #0c131d 0%, #06090e 100%)' }}
        >
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
            <div className="flex flex-col gap-4 lg:col-span-7">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold text-[#ff7043]">
                <DeviceMobile size={15} weight="bold" />
                STRIDE FLUTTER COMPANION · ANDROID &amp; IOS-READY
              </span>
              <h2 className="text-2xl leading-tight font-bold text-white md:text-4xl">
                {locale === 'hi'
                  ? 'बैकग्राउंड GPS, क्रैश रिकवरी और ऑफ़लाइन सिंक — हर रन पॉकेट में'
                  : 'Pocket telemetry built for foreground endurance & dead-zone resilience'}
              </h2>
              <p className="max-w-xl text-sm leading-relaxed text-slate-300">
                {locale === 'hi'
                  ? 'SQLite ड्राफ़्ट सेविंग, Android फ़ोरग्राउंड सर्विस, और एक-क्लिक इडेम्पोटेंट अपलोड — चाहे सिग्नल गायब हो जाए।'
                  : 'Continuous SQLite draft persistence, battery-aware Android foreground GPS service, real/simulated GPS tracking, GPX import, and bilingual English/Hindi UI.'}
              </p>

              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { id: 'gps', label: 'Live GPS HUD' },
                    { id: 'kom', label: 'KOM Split Rank' },
                    { id: 'shield', label: 'Privacy Shield' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setPhoneScreenMode(tab.id)}
                    className={`min-h-[36px] rounded-full border px-3.5 text-xs font-semibold transition-colors ${
                      phoneScreenMode === tab.id
                        ? 'border-[#ff4d1c] bg-[#ff4d1c]/20 text-white'
                        : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Link
                  href={`/${locale}/download`}
                  className="stride-btn-luminous inline-flex items-center gap-2 px-6 text-sm"
                >
                  <AndroidLogo size={18} weight="bold" />
                  <span>{locale === 'hi' ? 'APK व QR डाउनलोड खोलें' : 'Get Android APK & QR'}</span>
                </Link>
                <span className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-slate-300">
                  Idempotency-Key Offline Sync
                </span>
              </div>
            </div>

            <div className="flex justify-center lg:col-span-5">
              <div className="relative w-[272px] rounded-[34px] border-[6px] border-slate-700 bg-[#0b1118] p-4 shadow-[0_32px_70px_-15px_rgba(255,77,28,0.42)]">
                <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-slate-700" />
                {phoneScreenMode === 'gps' && (
                  <>
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="font-bold text-white">STRIDE RECORDER</span>
                      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-semibold text-emerald-400">
                        GPS LOCK
                      </span>
                    </div>
                    <div className="my-3 rounded-2xl border border-white/10 bg-[#101822] p-3">
                      <svg viewBox="0 0 200 84" className="h-20 w-full">
                        <path
                          d="M 14 68 C 46 28, 86 24, 114 48 C 138 68, 162 24, 188 18"
                          fill="none"
                          stroke="#ff4d1c"
                          strokeWidth="4"
                          strokeLinecap="round"
                        />
                        <circle cx="14" cy="68" r="4.5" fill="#18b87a" />
                        <circle cx="188" cy="18" r="5.5" fill="#ff7043" />
                      </svg>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="rounded-xl bg-white/5 p-2.5">
                        <div className="text-[10px] text-slate-400">DISTANCE</div>
                        <div className="font-mono-num text-base font-bold text-white">10.42 km</div>
                      </div>
                      <div className="rounded-xl bg-white/5 p-2.5">
                        <div className="text-[10px] text-slate-400">AVG PACE</div>
                        <div className="font-mono-num text-base font-bold text-[#ff7043]">4:24 /km</div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-center gap-2 rounded-full bg-[var(--stride-accent)] py-2 text-xs font-bold text-white">
                      <Gauge size={14} weight="bold" />
                      <span>Foreground Active · SQLite Saved</span>
                    </div>
                  </>
                )}

                {phoneScreenMode === 'kom' && (
                  <>
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="font-bold text-white">SEGMENT LEADERBOARD</span>
                      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 font-semibold text-amber-300">
                        NEW PR
                      </span>
                    </div>
                    <div className="my-3 flex flex-col gap-2 rounded-2xl border border-white/10 bg-[#101822] p-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-amber-300">1. @arjun</span>
                        <span className="font-mono-num font-bold text-white">02:41</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-300">
                        <span>2. @priya</span>
                        <span className="font-mono-num">02:48 (+7s)</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-400">
                        <span>3. @rohan</span>
                        <span className="font-mono-num">02:54 (+13s)</span>
                      </div>
                    </div>
                    <div className="rounded-full bg-amber-500/20 py-2 text-center text-xs font-bold text-amber-300">
                      Hausdorff &lt; 35m Verified
                    </div>
                  </>
                )}

                {phoneScreenMode === 'shield' && (
                  <>
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="font-bold text-white">PRIVACY SHIELD</span>
                      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-semibold text-emerald-400">
                        ACTIVE
                      </span>
                    </div>
                    <div className="my-3 rounded-2xl border border-emerald-500/30 bg-[#101822] p-3 text-center">
                      <ShieldCheck size={32} weight="fill" className="mx-auto text-emerald-400" />
                      <div className="mt-2 text-xs font-bold text-white">Home Zone · 250m Clipped</div>
                      <div className="mt-1 text-[11px] text-slate-400">
                        Start/end coordinates stripped server-side before public feed delivery.
                      </div>
                    </div>
                    <div className="rounded-full bg-emerald-500/20 py-2 text-center text-xs font-bold text-emerald-300">
                      Zero Home Coordinates Leaked
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
