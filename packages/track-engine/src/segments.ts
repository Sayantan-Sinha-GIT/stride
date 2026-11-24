import { ACTIVITY_LIMITS } from './filter.js';
import {
  discreteFrechetMeters,
  discreteHausdorffMeters,
  haversineMeters,
  polylineLengthMeters,
  projectPointToSegment,
  resamplePolyline,
} from './geo.js';
import type {
  ActivitySource,
  ActivityType,
  ExistingSegmentRef,
  FilteredTrackPoint,
  LatLng,
  SegmentDefinition,
  SegmentMatchResult,
  SegmentValidationResult,
} from './types.js';

export const MIN_SEGMENT_DISTANCE_M = 150;
export const MAX_SEGMENT_DISTANCE_M = 50_000;
export const ENTRY_EXIT_RADIUS_M = 35;
export const SHAPE_THRESHOLD_HAUSDORFF_M = 35;
export const SHAPE_THRESHOLD_FRECHET_M = 40;
export const DUPLICATE_END_RADIUS_M = 40;

export function validateNewSegment(
  points: Array<LatLng & { ele?: number }>,
  activityType: ActivityType,
  existingSegments: ExistingSegmentRef[] = []
): SegmentValidationResult {
  if (points.length < 4) {
    return { valid: false, reason: 'too_few_points', distanceM: 0, elevationGainM: 0, elevationLossM: 0 };
  }

  const distanceM = Math.round(polylineLengthMeters(points) * 10) / 10;
  if (distanceM < MIN_SEGMENT_DISTANCE_M) {
    return { valid: false, reason: 'too_short', distanceM, elevationGainM: 0, elevationLossM: 0 };
  }
  if (distanceM > MAX_SEGMENT_DISTANCE_M) {
    return { valid: false, reason: 'too_long', distanceM, elevationGainM: 0, elevationLossM: 0 };
  }

  const startToEnd = haversineMeters(points[0], points[points.length - 1]);
  const minSeparation = Math.min(50, distanceM * 0.1);
  if (startToEnd < minSeparation) {
    return { valid: false, reason: 'closed_loop', distanceM, elevationGainM: 0, elevationLossM: 0 };
  }

  let elevationGainM = 0;
  let elevationLossM = 0;
  for (let i = 1; i < points.length; i++) {
    const diff = (points[i].ele ?? 0) - (points[i - 1].ele ?? 0);
    if (diff > 0) elevationGainM += diff;
    else elevationLossM += -diff;
  }

  const candResampled = resamplePolyline(points, 25);
  for (const existing of existingSegments) {
    if (existing.activityType !== activityType || existing.points.length < 2) continue;
    const lenRatio = Math.abs(existing.distanceM - distanceM) / Math.max(distanceM, 1);
    if (lenRatio > 0.12) continue;

    const startDist = haversineMeters(points[0], existing.points[0]);
    const endDist = haversineMeters(
      points[points.length - 1],
      existing.points[existing.points.length - 1]
    );
    if (startDist <= DUPLICATE_END_RADIUS_M && endDist <= DUPLICATE_END_RADIUS_M) {
      const exResampled = resamplePolyline(existing.points, 25);
      const hausdorff = discreteHausdorffMeters(candResampled, exResampled);
      if (hausdorff <= SHAPE_THRESHOLD_HAUSDORFF_M) {
        return {
          valid: false,
          reason: 'duplicate',
          distanceM,
          elevationGainM: Math.round(elevationGainM * 10) / 10,
          elevationLossM: Math.round(elevationLossM * 10) / 10,
          duplicateSegmentId: existing.id,
          duplicateSegmentName: existing.name,
        };
      }
    }
  }

  return {
    valid: true,
    distanceM,
    elevationGainM: Math.round(elevationGainM * 10) / 10,
    elevationLossM: Math.round(elevationLossM * 10) / 10,
  };
}

function interpolateBoundaryTime(
  track: FilteredTrackPoint[],
  target: LatLng,
  searchStart: number,
  searchEnd: number
): { index: number; timeMs: number; distMeters: number; point: LatLng } | null {
  let bestDist = Infinity;
  let bestIdx = -1;
  let bestTime = 0;
  let bestPoint: LatLng | null = null;

  for (let i = searchStart; i < searchEnd; i++) {
    const a = track[i];
    const b = track[i + 1];
    const proj = projectPointToSegment(target, a, b);
    if (proj.distanceMeters < bestDist) {
      bestDist = proj.distanceMeters;
      bestIdx = i;
      bestTime = a.time + (b.time - a.time) * proj.t;
      bestPoint = proj.point;
    }
  }

  if (bestIdx === -1 || !bestPoint || bestDist > ENTRY_EXIT_RADIUS_M) return null;
  return { index: bestIdx, timeMs: bestTime, distMeters: bestDist, point: bestPoint };
}

export function matchActivityToSegment(
  track: FilteredTrackPoint[],
  segment: SegmentDefinition,
  activityType: ActivityType,
  source: ActivitySource
): SegmentMatchResult {
  if (source === 'manual') {
    return { matched: false, reason: 'manual_activity_ineligible' };
  }
  if (activityType !== segment.activityType) {
    return { matched: false, reason: 'activity_type_mismatch' };
  }
  if (track.length < 4 || segment.points.length < 2) {
    return { matched: false, reason: 'insufficient_points' };
  }

  const segStart = segment.points[0];
  const segEnd = segment.points[segment.points.length - 1];
  const segResampled = resamplePolyline(segment.points, 25);

  // Locate candidate entry windows where track passes near segment start
  const entryCandidates: Array<{ index: number; timeMs: number }> = [];
  for (let i = 0; i < track.length - 1; i++) {
    const proj = projectPointToSegment(segStart, track[i], track[i + 1]);
    if (proj.distanceMeters <= ENTRY_EXIT_RADIUS_M) {
      const tMs = track[i].time + (track[i + 1].time - track[i].time) * proj.t;
      const lastCand = entryCandidates[entryCandidates.length - 1];
      if (!lastCand || i - lastCand.index > 3) {
        entryCandidates.push({ index: i, timeMs: tMs });
      } else {
        // Keep closest inside contiguous entry window
        const prevProj = projectPointToSegment(segStart, track[lastCand.index], track[lastCand.index + 1]);
        if (proj.distanceMeters < prevProj.distanceMeters) {
          entryCandidates[entryCandidates.length - 1] = { index: i, timeMs: tMs };
        }
      }
    }
  }

  if (entryCandidates.length === 0) {
    return { matched: false, reason: 'no_entry_proximity' };
  }

  let bestMatch: SegmentMatchResult | null = null;
  const t0 = track[0].time;
  const limits = ACTIVITY_LIMITS[activityType];

  for (const entry of entryCandidates) {
    // Search forward after entry for exit proximity
    let exitBestDist = Infinity;
    let exitBestIdx = -1;
    let exitBestTime = 0;
    let exitBestPoint: LatLng | null = null;

    for (let j = entry.index + 1; j < track.length - 1; j++) {
      const proj = projectPointToSegment(segEnd, track[j], track[j + 1]);
      if (proj.distanceMeters <= ENTRY_EXIT_RADIUS_M) {
        if (proj.distanceMeters < exitBestDist) {
          exitBestDist = proj.distanceMeters;
          exitBestIdx = j;
          exitBestTime = track[j].time + (track[j + 1].time - track[j].time) * proj.t;
          exitBestPoint = proj.point;
        }
      } else if (exitBestIdx !== -1 && j > exitBestIdx + 3) {
        // Closed this pass near exit
        break;
      }
    }

    if (exitBestIdx === -1 || !exitBestPoint || exitBestTime <= entry.timeMs) {
      continue;
    }

    // Refine exact entry inside window before exit
    const refinedEntry = interpolateBoundaryTime(
      track,
      segStart,
      Math.max(0, entry.index - 2),
      Math.min(exitBestIdx, entry.index + 3)
    );
    if (!refinedEntry) continue;

    const finalEntryIdx = refinedEntry.index;
    const finalEntryTimeMs = refinedEntry.timeMs;

    const subSlice: LatLng[] = [
      refinedEntry.point,
      ...track.slice(finalEntryIdx + 1, exitBestIdx + 1).map((p) => ({ lat: p.lat, lng: p.lng })),
      exitBestPoint,
    ];
    if (subSlice.length < 3) continue;

    // Direction & monotonic progress check along segment
    const subDist = polylineLengthMeters(subSlice);
    if (subDist < segment.distanceM * 0.85 || subDist > segment.distanceM * 1.25) {
      continue;
    }

    const subResampled = resamplePolyline(subSlice, 25);
    const hausdorff = discreteHausdorffMeters(subResampled, segResampled);
    const frechet = discreteFrechetMeters(subResampled, segResampled);

    if (hausdorff > SHAPE_THRESHOLD_HAUSDORFF_M || frechet > SHAPE_THRESHOLD_FRECHET_M) {
      continue;
    }

    // Ensure midpoint aligns with segment midpoint (prevents reverse loop artifacts)
    const midSub = subResampled[Math.floor(subResampled.length / 2)];
    const midSeg = segResampled[Math.floor(segResampled.length / 2)];
    if (haversineMeters(midSub, midSeg) > SHAPE_THRESHOLD_FRECHET_M) {
      continue;
    }

    const elapsedTimeS = Math.round(((exitBestTime - finalEntryTimeMs) / 1000) * 10) / 10;
    if (elapsedTimeS <= 0) continue;

    const avgSpeedMps = Math.round((segment.distanceM / elapsedTimeS) * 100) / 100;
    let maxSpeedMps = 0;
    let maxGapM = 0;
    for (let k = finalEntryIdx + 1; k <= exitBestIdx + 1 && k < track.length; k++) {
      const gap = haversineMeters(track[k - 1], track[k]);
      if (gap > maxGapM) maxGapM = gap;
      if (track[k].speedMps > maxSpeedMps) maxSpeedMps = track[k].speedMps;
    }

    let isFlagged = false;
    let flagReason: string | null = null;
    if (avgSpeedMps > limits.fairMaxAvgMps) {
      isFlagged = true;
      flagReason = `Implausible average speed (${(avgSpeedMps * 3.6).toFixed(1)} km/h) for ${activityType}`;
    } else if (maxSpeedMps > limits.fairMaxPeakMps) {
      isFlagged = true;
      flagReason = `Implausible peak speed (${(maxSpeedMps * 3.6).toFixed(1)} km/h) for ${activityType}`;
    } else if (maxGapM > Math.max(250, segment.distanceM * 0.35)) {
      isFlagged = true;
      flagReason = `Large GPS gap (${Math.round(maxGapM)}m) inside segment`;
    }

    if (!bestMatch || elapsedTimeS < (bestMatch.elapsedTimeS ?? Infinity)) {
      bestMatch = {
        matched: true,
        elapsedTimeS,
        startIndex: finalEntryIdx,
        endIndex: exitBestIdx + 1,
        startOffsetS: Math.round(((finalEntryTimeMs - t0) / 1000) * 10) / 10,
        endOffsetS: Math.round(((exitBestTime - t0) / 1000) * 10) / 10,
        avgSpeedMps,
        maxSpeedMps: Math.round(maxSpeedMps * 100) / 100,
        isFlagged,
        flagReason,
      };
    }
  }

  return bestMatch ?? { matched: false, reason: 'shape_or_direction_mismatch' };
}
