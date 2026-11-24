import { ACTIVITY_LIMITS } from './filter.js';
import type { ActivitySource, ActivityType, FilteredTrackPoint, PersonalRecordCandidate } from './types.js';

const DISTANCE_PR_TARGETS: Record<
  ActivityType,
  Array<{ key: string; meters: number }>
> = {
  run: [
    { key: 'run_1k', meters: 1000 },
    { key: 'run_5k', meters: 5000 },
    { key: 'run_10k', meters: 10000 },
    { key: 'run_hm', meters: 21097.5 },
    { key: 'run_marathon', meters: 42195 },
  ],
  ride: [
    { key: 'ride_10k', meters: 10000 },
    { key: 'ride_20k', meters: 20000 },
    { key: 'ride_50k', meters: 50000 },
    { key: 'ride_100k', meters: 100000 },
  ],
  walk: [
    { key: 'walk_1k', meters: 1000 },
    { key: 'walk_5k', meters: 5000 },
  ],
  hike: [
    { key: 'hike_5k', meters: 5000 },
    { key: 'hike_10k', meters: 10000 },
  ],
};

function interpolateTimeAtDist(points: FilteredTrackPoint[], idx: number, targetDistM: number): number {
  if (idx <= 0) return points[0].time;
  const p0 = points[idx - 1];
  const p1 = points[idx];
  const segD = p1.distFromStartM - p0.distFromStartM;
  if (segD <= 1e-6) return p1.time;
  const ratio = Math.max(0, Math.min(1, (targetDistM - p0.distFromStartM) / segD));
  return p0.time + (p1.time - p0.time) * ratio;
}

export function detectPersonalRecords(
  points: FilteredTrackPoint[],
  activityType: ActivityType,
  source: ActivitySource,
  elevationGainM: number,
  distanceM: number,
  elapsedTimeS: number
): PersonalRecordCandidate[] {
  if (source === 'manual' || points.length < 2) return [];
  const limits = ACTIVITY_LIMITS[activityType];
  const avgSpeed = elapsedTimeS > 0 ? distanceM / elapsedTimeS : 0;
  if (avgSpeed > limits.fairMaxAvgMps) return [];

  const candidates: PersonalRecordCandidate[] = [];
  const totalDist = points[points.length - 1].distFromStartM;
  const targets = DISTANCE_PR_TARGETS[activityType] ?? [];

  for (const target of targets) {
    if (totalDist < target.meters) continue;
    let bestSeconds = Infinity;
    let right = 1;

    for (let left = 0; left < points.length - 1; left++) {
      const startD = points[left].distFromStartM;
      const targetEndD = startD + target.meters;
      while (right < points.length && points[right].distFromStartM < targetEndD) {
        right++;
      }
      if (right >= points.length) break;
      const endTimeMs = interpolateTimeAtDist(points, right, targetEndD);
      const dtS = (endTimeMs - points[left].time) / 1000;
      const impliedSpeed = target.meters / Math.max(dtS, 0.1);
      if (dtS > 0 && impliedSpeed <= limits.fairMaxPeakMps && dtS < bestSeconds) {
        bestSeconds = dtS;
      }
    }

    if (Number.isFinite(bestSeconds)) {
      candidates.push({
        metricKey: target.key,
        activityType,
        valueNum: Math.round(bestSeconds * 10) / 10,
        distanceM: target.meters,
        durationS: Math.round(bestSeconds * 10) / 10,
      });
    }
  }

  if (distanceM > 0) {
    candidates.push({
      metricKey: `${activityType}_longest_distance`,
      activityType,
      valueNum: Math.round(distanceM * 10) / 10,
      distanceM: Math.round(distanceM * 10) / 10,
      durationS: elapsedTimeS,
    });
  }
  if (elevationGainM > 0) {
    candidates.push({
      metricKey: `${activityType}_highest_climb`,
      activityType,
      valueNum: Math.round(elevationGainM * 10) / 10,
      distanceM: Math.round(distanceM * 10) / 10,
      durationS: elapsedTimeS,
    });
  }

  return candidates;
}
