import { haversineMeters, isValidLatLng, turnAngleDegrees } from './geo.js';
import type { ActivityType, RawTrackPoint } from './types.js';

export const ACTIVITY_LIMITS: Record<
  ActivityType,
  {
    maxAccuracyM: number;
    maxJumpSpeedMps: number;
    movingThresholdMps: number;
    fairMaxAvgMps: number;
    fairMaxPeakMps: number;
  }
> = {
  walk: {
    maxAccuracyM: 35,
    maxJumpSpeedMps: 5.5,
    movingThresholdMps: 0.45,
    fairMaxAvgMps: 3.4,
    fairMaxPeakMps: 5.0,
  },
  hike: {
    maxAccuracyM: 40,
    maxJumpSpeedMps: 6.5,
    movingThresholdMps: 0.4,
    fairMaxAvgMps: 3.6,
    fairMaxPeakMps: 5.5,
  },
  run: {
    maxAccuracyM: 35,
    maxJumpSpeedMps: 12.0,
    movingThresholdMps: 0.85,
    fairMaxAvgMps: 7.4, // ~2:15/km elite boundary
    fairMaxPeakMps: 11.5,
  },
  ride: {
    maxAccuracyM: 50,
    maxJumpSpeedMps: 32.0,
    movingThresholdMps: 1.4,
    fairMaxAvgMps: 18.9, // ~68 km/h
    fairMaxPeakMps: 29.2, // ~105 km/h
  },
};

export const ELEVATION_HYSTERESIS_M = 3.0;
export const PAUSE_GAP_SECONDS = 15;

export interface ValidatedRawPoint {
  lat: number;
  lng: number;
  ele: number;
  time: number;
  hr?: number | null;
  accuracyM?: number | null;
}

export function filterGpsPoints(
  rawPoints: RawTrackPoint[],
  activityType: ActivityType
): { kept: ValidatedRawPoint[]; droppedCount: number } {
  const limits = ACTIVITY_LIMITS[activityType];
  const candidate: ValidatedRawPoint[] = [];
  let droppedCount = 0;

  for (const pt of rawPoints) {
    if (!isValidLatLng(pt) || typeof pt.time !== 'number' || !Number.isFinite(pt.time)) {
      droppedCount++;
      continue;
    }
    if (pt.accuracyM != null && Number.isFinite(pt.accuracyM) && pt.accuracyM > limits.maxAccuracyM) {
      droppedCount++;
      continue;
    }
    candidate.push({
      lat: pt.lat,
      lng: pt.lng,
      ele: typeof pt.ele === 'number' && Number.isFinite(pt.ele) ? pt.ele : 0,
      time: pt.time,
      hr: typeof pt.hr === 'number' && Number.isFinite(pt.hr) ? pt.hr : null,
      accuracyM: pt.accuracyM ?? null,
    });
  }

  candidate.sort((a, b) => a.time - b.time);

  // Drop noisy initial fix if point[0] jumps wildly from point[1] while point[1] aligns with point[2]
  if (candidate.length >= 3) {
    const dt01 = Math.max(1, (candidate[1].time - candidate[0].time) / 1000);
    const dt12 = Math.max(1, (candidate[2].time - candidate[1].time) / 1000);
    const v01 = haversineMeters(candidate[0], candidate[1]) / dt01;
    const v12 = haversineMeters(candidate[1], candidate[2]) / dt12;
    if (v01 > limits.maxJumpSpeedMps && v12 <= limits.maxJumpSpeedMps) {
      candidate.shift();
      droppedCount++;
    }
  }

  const kept: ValidatedRawPoint[] = [];
  for (const pt of candidate) {
    if (kept.length === 0) {
      kept.push(pt);
      continue;
    }
    const prev = kept[kept.length - 1];
    if (pt.time <= prev.time) {
      // Duplicate timestamp: keep whichever had better accuracy
      if ((pt.accuracyM ?? 15) < (prev.accuracyM ?? 15)) {
        kept[kept.length - 1] = pt;
      }
      droppedCount++;
      continue;
    }
    const dt = (pt.time - prev.time) / 1000;
    const dist = haversineMeters(prev, pt);
    const impliedSpeed = dist / dt;

    // Reject impossible teleport jumps (when dt < 120s, guard short-interval GPS glitch spikes)
    if (impliedSpeed > limits.maxJumpSpeedMps && dt <= 120) {
      droppedCount++;
      continue;
    }
    kept.push(pt);
  }

  return { kept, droppedCount };
}

/**
 * Corner-preserving 3-point spatial smoothing.
 * Only smooths shallow jitter; skips sharp turns (> 25 deg) or long pause gaps.
 */
export function smoothSpatialPoints(points: ValidatedRawPoint[]): ValidatedRawPoint[] {
  if (points.length < 3) return points.map((p) => ({ ...p }));
  const out: ValidatedRawPoint[] = [{ ...points[0] }];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    const dt1 = (curr.time - prev.time) / 1000;
    const dt2 = (next.time - curr.time) / 1000;
    if (dt1 > PAUSE_GAP_SECONDS || dt2 > PAUSE_GAP_SECONDS) {
      out.push({ ...curr });
      continue;
    }

    const d1 = haversineMeters(prev, curr);
    const d2 = haversineMeters(curr, next);
    if (d1 < 1.5 || d2 < 1.5) {
      out.push({ ...curr });
      continue;
    }

    const angle = turnAngleDegrees(prev, curr, next);
    if (angle > 25) {
      out.push({ ...curr });
      continue;
    }

    out.push({
      ...curr,
      lat: 0.2 * prev.lat + 0.6 * curr.lat + 0.2 * next.lat,
      lng: 0.2 * prev.lng + 0.6 * curr.lng + 0.2 * next.lng,
    });
  }
  out.push({ ...points[points.length - 1] });
  return out;
}

export function smoothElevations(points: ValidatedRawPoint[]): {
  elevations: number[];
  gainM: number;
  lossM: number;
  minM: number;
  maxM: number;
} {
  if (points.length === 0) {
    return { elevations: [], gainM: 0, lossM: 0, minM: 0, maxM: 0 };
  }

  // 1) 5-point rolling median to crush altitude spikes
  const med: number[] = points.map((_, idx) => {
    const start = Math.max(0, idx - 2);
    const end = Math.min(points.length - 1, idx + 2);
    const win: number[] = [];
    for (let j = start; j <= end; j++) win.push(points[j].ele);
    win.sort((a, b) => a - b);
    return win[Math.floor(win.length / 2)];
  });

  // 2) 3-point weighted moving average
  const smooth = med.map((val, idx) => {
    if (idx === 0 || idx === med.length - 1) return val;
    return Number((0.25 * med[idx - 1] + 0.5 * val + 0.25 * med[idx + 1]).toFixed(1));
  });

  // 3) Hysteresis sum with minimum change threshold (3.0m)
  let anchor = smooth[0];
  let gainM = 0;
  let lossM = 0;
  let minM = smooth[0];
  let maxM = smooth[0];

  for (let i = 1; i < smooth.length; i++) {
    const e = smooth[i];
    if (e < minM) minM = e;
    if (e > maxM) maxM = e;
    const diff = e - anchor;
    if (diff >= ELEVATION_HYSTERESIS_M) {
      gainM += diff;
      anchor = e;
    } else if (diff <= -ELEVATION_HYSTERESIS_M) {
      lossM += -diff;
      anchor = e;
    }
  }

  return {
    elevations: smooth,
    gainM: Math.round(gainM * 10) / 10,
    lossM: Math.round(lossM * 10) / 10,
    minM: Math.round(minM * 10) / 10,
    maxM: Math.round(maxM * 10) / 10,
  };
}
