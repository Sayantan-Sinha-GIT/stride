import type { BoundingBox, LatLng } from './types.js';

export const EARTH_RADIUS_M = 6371008.8;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export function isValidLatLng(p: Partial<LatLng> | null | undefined): p is LatLng {
  if (!p || typeof p.lat !== 'number' || typeof p.lng !== 'number') return false;
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return false;
  return p.lat >= -90 && p.lat <= 90 && p.lng >= -180 && p.lng <= 180;
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const lat1 = a.lat * DEG_TO_RAD;
  const lat2 = b.lat * DEG_TO_RAD;
  const dLat = (b.lat - a.lat) * DEG_TO_RAD;
  const dLng = (b.lng - a.lng) * DEG_TO_RAD;

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  return EARTH_RADIUS_M * c;
}

export function bearingDegrees(a: LatLng, b: LatLng): number {
  const lat1 = a.lat * DEG_TO_RAD;
  const lat2 = b.lat * DEG_TO_RAD;
  const dLng = (b.lng - a.lng) * DEG_TO_RAD;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * RAD_TO_DEG) + 360) % 360;
}

export function turnAngleDegrees(p0: LatLng, p1: LatLng, p2: LatLng): number {
  const b1 = bearingDegrees(p0, p1);
  const b2 = bearingDegrees(p1, p2);
  let diff = Math.abs(b2 - b1);
  if (diff > 180) diff = 360 - diff;
  return diff;
}

/**
 * Local equirectangular projection in meters centered on origin lat/lng
 */
function toLocalMeters(p: LatLng, origin: LatLng): { x: number; y: number } {
  const cosLat = Math.cos(origin.lat * DEG_TO_RAD);
  return {
    x: (p.lng - origin.lng) * DEG_TO_RAD * EARTH_RADIUS_M * cosLat,
    y: (p.lat - origin.lat) * DEG_TO_RAD * EARTH_RADIUS_M,
  };
}

export function projectPointToSegment(
  p: LatLng,
  a: LatLng,
  b: LatLng
): { distanceMeters: number; t: number; point: LatLng } {
  const origin = a;
  const pm = toLocalMeters(p, origin);
  const bm = toLocalMeters(b, origin);
  const lenSq = bm.x * bm.x + bm.y * bm.y;
  if (lenSq < 1e-9) {
    return {
      distanceMeters: haversineMeters(p, a),
      t: 0,
      point: { lat: a.lat, lng: a.lng },
    };
  }
  const rawT = (pm.x * bm.x + pm.y * bm.y) / lenSq;
  const t = Math.max(0, Math.min(1, rawT));
  const proj: LatLng = {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  };
  return {
    distanceMeters: haversineMeters(p, proj),
    t,
    point: proj,
  };
}

function perpendicularDistanceMeters(p: LatLng, a: LatLng, b: LatLng): number {
  return projectPointToSegment(p, a, b).distanceMeters;
}

export function douglasPeucker<T extends LatLng>(
  points: T[],
  toleranceMeters = 5
): T[] {
  if (points.length <= 2) return [...points];

  let maxDist = 0;
  let splitIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistanceMeters(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      splitIdx = i;
    }
  }

  if (maxDist > toleranceMeters) {
    const left = douglasPeucker(points.slice(0, splitIdx + 1), toleranceMeters);
    const right = douglasPeucker(points.slice(splitIdx), toleranceMeters);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

function encodeSignedValue(val: number): string {
  let v = val < 0 ? ~(val << 1) : val << 1;
  let out = '';
  while (v >= 0x20) {
    out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  out += String.fromCharCode(v + 63);
  return out;
}

export function encodePolyline(points: LatLng[]): string {
  let prevLat = 0;
  let prevLng = 0;
  let out = '';
  for (const pt of points) {
    const lat = Math.round(pt.lat * 1e5);
    const lng = Math.round(pt.lng * 1e5);
    out += encodeSignedValue(lat - prevLat);
    out += encodeSignedValue(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return out;
}

export function decodePolyline(encoded: string): LatLng[] {
  if (!encoded) return [];
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && index < encoded.length);
    const dLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dLat;

    if (index >= encoded.length) break;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && index < encoded.length);
    const dLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dLng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

export function polylineLengthMeters(points: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1], points[i]);
  }
  return total;
}

export function computeBoundingBox(points: LatLng[]): BoundingBox | null {
  if (points.length === 0) return null;
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  return { minLat, minLng, maxLat, maxLng };
}

export function toWktLineString(points: LatLng[]): string {
  if (points.length < 2) return '';
  const coords = points.map((p) => `${p.lng.toFixed(6)} ${p.lat.toFixed(6)}`).join(', ');
  return `LINESTRING(${coords})`;
}

export function resamplePolyline(points: LatLng[], numSamples: number): LatLng[] {
  if (points.length === 0 || numSamples <= 0) return [];
  if (points.length === 1 || numSamples === 1) return [{ lat: points[0].lat, lng: points[0].lng }];

  const cum: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + haversineMeters(points[i - 1], points[i]));
  }
  const total = cum[cum.length - 1];
  if (total < 1e-3) {
    return Array.from({ length: numSamples }, () => ({ lat: points[0].lat, lng: points[0].lng }));
  }

  const resampled: LatLng[] = [];
  let segIdx = 0;
  for (let k = 0; k < numSamples; k++) {
    const target = (k / (numSamples - 1)) * total;
    while (segIdx < cum.length - 2 && cum[segIdx + 1] < target) {
      segIdx++;
    }
    const segLen = cum[segIdx + 1] - cum[segIdx];
    const ratio = segLen > 1e-6 ? (target - cum[segIdx]) / segLen : 0;
    const p0 = points[segIdx];
    const p1 = points[segIdx + 1];
    resampled.push({
      lat: p0.lat + (p1.lat - p0.lat) * ratio,
      lng: p0.lng + (p1.lng - p0.lng) * ratio,
    });
  }
  return resampled;
}

export function discreteHausdorffMeters(a: LatLng[], b: LatLng[]): number {
  if (a.length === 0 || b.length === 0) return Infinity;
  const directed = (from: LatLng[], to: LatLng[]) => {
    let maxMin = 0;
    for (const p of from) {
      let minDist = Infinity;
      for (let i = 0; i < to.length; i++) {
        const d =
          i + 1 < to.length
            ? projectPointToSegment(p, to[i], to[i + 1]).distanceMeters
            : haversineMeters(p, to[i]);
        if (d < minDist) minDist = d;
      }
      if (minDist > maxMin) maxMin = minDist;
    }
    return maxMin;
  };
  return Math.max(directed(a, b), directed(b, a));
}

export function discreteFrechetMeters(a: LatLng[], b: LatLng[]): number {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return Infinity;
  const dp: number[][] = Array.from({ length: n }, () => new Array<number>(m).fill(-1));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const d = haversineMeters(a[i], b[j]);
      if (i === 0 && j === 0) {
        dp[i][j] = d;
      } else if (i === 0) {
        dp[i][j] = Math.max(dp[i][j - 1], d);
      } else if (j === 0) {
        dp[i][j] = Math.max(dp[i - 1][j], d);
      } else {
        dp[i][j] = Math.max(Math.min(dp[i - 1][j], dp[i - 1][j - 1], dp[i][j - 1]), d);
      }
    }
  }
  return dp[n - 1][m - 1];
}
