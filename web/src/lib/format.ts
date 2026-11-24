import type { Locale } from '@/i18n';

export type Units = 'metric' | 'imperial';

export function formatDistance(meters: number, units: Units = 'metric', locale: Locale = 'en'): string {
  const numLocale = locale === 'hi' ? 'hi-IN' : 'en-IN';
  if (units === 'imperial') {
    const miles = meters / 1609.344;
    return `${new Intl.NumberFormat(numLocale, { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(miles)} ${locale === 'hi' ? 'मील' : 'mi'}`;
  }
  const km = meters / 1000;
  return `${new Intl.NumberFormat(numLocale, { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(km)} ${locale === 'hi' ? 'किमी' : 'km'}`;
}

export function formatElevation(meters: number, units: Units = 'metric', locale: Locale = 'en'): string {
  const numLocale = locale === 'hi' ? 'hi-IN' : 'en-IN';
  if (units === 'imperial') {
    const ft = Math.round(meters * 3.28084);
    return `${new Intl.NumberFormat(numLocale).format(ft)} ft`;
  }
  return `${new Intl.NumberFormat(numLocale).format(Math.round(meters))} ${locale === 'hi' ? 'मी' : 'm'}`;
}

export function formatDuration(totalSeconds: number): string {
  const sec = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatPaceOrSpeed(
  avgSpeedMps: number,
  activityType: string,
  units: Units = 'metric',
  locale: Locale = 'en'
): string {
  if (!avgSpeedMps || avgSpeedMps <= 0.1) return '--';
  if (activityType === 'ride') {
    const val = units === 'imperial' ? avgSpeedMps * 2.23694 : avgSpeedMps * 3.6;
    return `${val.toFixed(1)} ${units === 'imperial' ? 'mph' : 'km/h'}`;
  }
  const distUnitMeters = units === 'imperial' ? 1609.344 : 1000;
  const secPerUnit = Math.round(distUnitMeters / avgSpeedMps);
  const min = Math.floor(secPerUnit / 60);
  const rem = secPerUnit % 60;
  const suffix = units === 'imperial' ? '/mi' : locale === 'hi' ? '/किमी' : '/km';
  return `${min}:${String(rem).padStart(2, '0')}${suffix}`;
}

export function formatDateTime(iso: string, locale: Locale = 'en'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}
