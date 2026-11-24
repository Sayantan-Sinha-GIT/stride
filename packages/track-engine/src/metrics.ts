import {
  ACTIVITY_LIMITS,
  PAUSE_GAP_SECONDS,
  filterGpsPoints,
  smoothElevations,
  smoothSpatialPoints,
} from './filter.js';
import {
  computeBoundingBox,
  decodePolyline,
  douglasPeucker,
  encodePolyline,
  haversineMeters,
  toWktLineString,
} from './geo.js';
import type {
  ActivityType,
  FilteredTrackPoint,
  ProcessedTrack,
  RawTrackPoint,
  SplitMetric,
  StreamSample,
} from './types.js';

const KM_METERS = 1000;
const MILE_METERS = 1609.344;

export function estimateCalories(
  activityType: ActivityType,
  avgSpeedMps: number,
  movingTimeS: number,
  weightKg = 70
): number {
  if (movingTimeS <= 0) return 0;
  const kmh = avgSpeedMps * 3.6;
  let met = 3.5;
  switch (activityType) {
    case 'walk':
      met = kmh < 4 ? 2.8 : kmh < 5.5 ? 3.5 : 4.5;
      break;
    case 'hike':
      met = kmh < 4 ? 5.3 : 6.5;
      break;
    case 'run':
      met = Math.max(6.0, Math.min(16.0, 2.2 + kmh * 0.85));
      break;
    case 'ride':
      met =
        kmh < 16
          ? 4.0
          : kmh < 20
            ? 6.8
            : kmh < 25
              ? 8.5
              : kmh < 32
                ? 10.5
                : 12.5;
      break;
  }
  const hours = movingTimeS / 3600;
  return Math.round(met * weightKg * hours);
}

export function computeSplits(
  points: FilteredTrackPoint[],
  splitLengthM: number
): SplitMetric[] {
  if (points.length < 2) return [];
  const splits: SplitMetric[] = [];
  let splitIndex = 1;
  let nextBoundaryM = splitLengthM;

  let splitStartTime = points[0].time;
  let splitStartDist = 0;
  let splitMovingS = 0;
  let splitEleGain = 0;
  let splitEleLoss = 0;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const segDist = curr.distFromStartM - prev.distFromStartM;
    const segDtS = Math.max(0, (curr.time - prev.time) / 1000);
    const segMovingS = curr.moving ? segDtS : 0;
    const eleDiff = curr.ele - prev.ele;
    const segGain = eleDiff > 0 ? eleDiff : 0;
    const segLoss = eleDiff < 0 ? -eleDiff : 0;

    let remPrevDist = prev.distFromStartM;
    let remPrevTime = prev.time;
    let remDist = segDist;
    let remElapsedS = segDtS;
    let remMovingS = segMovingS;
    let remGain = segGain;
    let remLoss = segLoss;

    while (remDist > 0 && remPrevDist + remDist >= nextBoundaryM) {
      const neededM = nextBoundaryM - remPrevDist;
      const ratio = neededM / remDist;
      const crossTime = remPrevTime + ratio * remElapsedS * 1000;
      const partElapsedS = (crossTime - splitStartTime) / 1000;
      const partMovingS = splitMovingS + ratio * remMovingS;
      const partGain = splitEleGain + ratio * remGain;
      const partLoss = splitEleLoss + ratio * remLoss;
      const distForSplit = nextBoundaryM - splitStartDist;
      const speedMps = partMovingS > 0 ? distForSplit / partMovingS : 0;

      splits.push({
        splitIndex,
        distanceM: Math.round(distForSplit),
        elapsedTimeS: Math.round(partElapsedS * 10) / 10,
        movingTimeS: Math.round(partMovingS * 10) / 10,
        paceSecPerKm:
          speedMps > 0.1 ? Math.round(1000 / speedMps) : null,
        speedKmh: Math.round(speedMps * 3.6 * 10) / 10,
        elevationGainM: Math.round(partGain),
        elevationLossM: Math.round(partLoss),
      });

      splitIndex++;
      splitStartDist = nextBoundaryM;
      splitStartTime = crossTime;
      nextBoundaryM += splitLengthM;
      splitMovingS = 0;
      splitEleGain = 0;
      splitEleLoss = 0;

      remPrevDist += neededM;
      remPrevTime = crossTime;
      remDist -= neededM;
      remElapsedS *= 1 - ratio;
      remMovingS *= 1 - ratio;
      remGain *= 1 - ratio;
      remLoss *= 1 - ratio;
    }

    splitMovingS += remMovingS;
    splitEleGain += remGain;
    splitEleLoss += remLoss;
  }

  const totalDist = points[points.length - 1].distFromStartM;
  const tailDist = totalDist - splitStartDist;
  if (tailDist >= 25) {
    const tailElapsedS = (points[points.length - 1].time - splitStartTime) / 1000;
    const speedMps = splitMovingS > 0 ? tailDist / splitMovingS : 0;
    splits.push({
      splitIndex,
      distanceM: Math.round(tailDist),
      elapsedTimeS: Math.round(tailElapsedS * 10) / 10,
      movingTimeS: Math.round(splitMovingS * 10) / 10,
      paceSecPerKm: speedMps > 0.1 ? Math.round(1000 / speedMps) : null,
      speedKmh: Math.round(speedMps * 3.6 * 10) / 10,
      elevationGainM: Math.round(splitEleGain),
      elevationLossM: Math.round(splitEleLoss),
    });
  }

  return splits;
}

export function buildStreamSamples(
  points: FilteredTrackPoint[],
  maxSamples = 180
): StreamSample[] {
  if (points.length === 0) return [];
  const t0 = points[0].time;
  const step = Math.max(1, Math.ceil(points.length / maxSamples));
  const out: StreamSample[] = [];
  for (let i = 0; i < points.length; i += step) {
    const p = points[i];
    out.push({
      t: Math.round((p.time - t0) / 1000),
      d: Math.round(p.distFromStartM),
      ele: p.ele,
      pace: p.speedMps > 0.4 ? Math.round(1000 / p.speedMps) : null,
      speedKmh: Math.round(p.speedMps * 3.6 * 10) / 10,
      hr: p.hr ?? null,
    });
  }
  const last = points[points.length - 1];
  if (out[out.length - 1]?.d !== Math.round(last.distFromStartM)) {
    out.push({
      t: Math.round((last.time - t0) / 1000),
      d: Math.round(last.distFromStartM),
      ele: last.ele,
      pace: last.speedMps > 0.4 ? Math.round(1000 / last.speedMps) : null,
      speedKmh: Math.round(last.speedMps * 3.6 * 10) / 10,
      hr: last.hr ?? null,
    });
  }
  return out;
}

export interface ProcessTrackOptions {
  activityType: ActivityType;
  weightKg?: number;
  skipSmoothing?: boolean;
}

export function processTrack(
  rawPoints: RawTrackPoint[],
  options: ProcessTrackOptions
): ProcessedTrack {
  const { activityType, weightKg = 70, skipSmoothing = false } = options;
  const limits = ACTIVITY_LIMITS[activityType];

  const { kept, droppedCount } = filterGpsPoints(rawPoints, activityType);
  if (kept.length === 0) {
    const nowIso = new Date().toISOString();
    return {
      activityType,
      startedAtIso: nowIso,
      endedAtIso: nowIso,
      rawPointCount: rawPoints.length,
      filteredPointCount: 0,
      droppedPointCount: droppedCount,
      distanceM: 0,
      elapsedTimeS: 0,
      movingTimeS: 0,
      avgSpeedMps: 0,
      maxSpeedMps: 0,
      avgPaceSecPerKm: null,
      elevationGainM: 0,
      elevationLossM: 0,
      minElevationM: 0,
      maxElevationM: 0,
      caloriesEstimate: 0,
      caloriesIsEstimate: true,
      encodedPolyline: '',
      simplifiedPoints: [],
      wktLineString: '',
      bbox: null,
      points: [],
      splitsKm: [],
      splitsMi: [],
      stream: [],
    };
  }

  const spatial = skipSmoothing ? kept : smoothSpatialPoints(kept);
  const { elevations, gainM, lossM, minM, maxM } = smoothElevations(spatial);

  const filteredPoints: FilteredTrackPoint[] = [];
  let cumDistM = 0;
  let movingTimeS = 0;
  let maxSpeedMps = 0;

  for (let i = 0; i < spatial.length; i++) {
    const curr = spatial[i];
    let speedMps = 0;
    let moving = false;

    if (i > 0) {
      const prev = spatial[i - 1];
      const d = haversineMeters(prev, curr);
      const dt = Math.max(0.1, (curr.time - prev.time) / 1000);
      cumDistM += d;
      speedMps = d / dt;
      if (dt <= PAUSE_GAP_SECONDS && speedMps >= limits.movingThresholdMps) {
        moving = true;
        movingTimeS += dt;
      }
      if (speedMps > maxSpeedMps && dt >= 1) {
        maxSpeedMps = speedMps;
      }
    }

    filteredPoints.push({
      lat: Number(curr.lat.toFixed(6)),
      lng: Number(curr.lng.toFixed(6)),
      ele: elevations[i],
      time: curr.time,
      distFromStartM: Math.round(cumDistM * 100) / 100,
      speedMps: Math.round(speedMps * 100) / 100,
      moving,
      hr: curr.hr ?? null,
    });
  }

  const startMs = filteredPoints[0].time;
  const endMs = filteredPoints[filteredPoints.length - 1].time;
  const elapsedTimeS = Math.max(0, Math.round((endMs - startMs) / 1000));
  const roundedMovingS = Math.round(movingTimeS);
  const distanceM = Math.round(cumDistM * 10) / 10;
  const avgSpeedMps =
    roundedMovingS > 0 ? Math.round((distanceM / roundedMovingS) * 100) / 100 : 0;
  const avgPaceSecPerKm =
    avgSpeedMps > 0.2 ? Math.round(1000 / avgSpeedMps) : null;

  const simplified = douglasPeucker(filteredPoints, 6).map((p) => ({
    lat: Number(p.lat.toFixed(6)),
    lng: Number(p.lng.toFixed(6)),
  }));

  return {
    activityType,
    startedAtIso: new Date(startMs).toISOString(),
    endedAtIso: new Date(endMs).toISOString(),
    rawPointCount: rawPoints.length,
    filteredPointCount: filteredPoints.length,
    droppedPointCount: droppedCount,
    distanceM,
    elapsedTimeS,
    movingTimeS: roundedMovingS,
    avgSpeedMps,
    maxSpeedMps: Math.round(maxSpeedMps * 100) / 100,
    avgPaceSecPerKm,
    elevationGainM: gainM,
    elevationLossM: lossM,
    minElevationM: minM,
    maxElevationM: maxM,
    caloriesEstimate: estimateCalories(activityType, avgSpeedMps, roundedMovingS, weightKg),
    caloriesIsEstimate: true,
    encodedPolyline: encodePolyline(filteredPoints),
    simplifiedPoints: simplified,
    wktLineString: toWktLineString(simplified),
    bbox: computeBoundingBox(filteredPoints),
    points: filteredPoints,
    splitsKm: computeSplits(filteredPoints, KM_METERS),
    splitsMi: computeSplits(filteredPoints, MILE_METERS),
    stream: buildStreamSamples(filteredPoints),
  };
}

/**
 * Recompute metrics on an existing activity (either stored RawTrackPoints or compressed polyline + elapsed time)
 */
export function recomputeTrack(
  pointsOrPolyline: RawTrackPoint[] | string,
  options: ProcessTrackOptions & { totalElapsedS?: number; startedAtMs?: number }
): ProcessedTrack {
  if (typeof pointsOrPolyline === 'string') {
    const decoded = decodePolyline(pointsOrPolyline);
    const totalS = Math.max(decoded.length, options.totalElapsedS ?? decoded.length * 5);
    const t0 = options.startedAtMs ?? Date.now() - totalS * 1000;
    const synthetic: RawTrackPoint[] = decoded.map((pt, idx) => ({
      lat: pt.lat,
      lng: pt.lng,
      ele: 0,
      time: t0 + Math.round((idx / Math.max(1, decoded.length - 1)) * totalS * 1000),
    }));
    return processTrack(synthetic, { ...options, skipSmoothing: true });
  }
  return processTrack(pointsOrPolyline, options);
}
