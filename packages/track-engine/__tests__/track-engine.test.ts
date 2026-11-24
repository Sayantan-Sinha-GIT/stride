import { describe, expect, it } from 'vitest';
import vectors from '../fixtures/shared_vectors.json' with { type: 'json' };
import {
  decodePolyline,
  detectPersonalRecords,
  encodePolyline,
  haversineMeters,
  maskTrackForViewer,
  matchActivityToSegment,
  parseGpx,
  processTrack,
  recomputeTrack,
  serializeGpx,
  validateNewSegment,
  type RawTrackPoint,
  type SegmentDefinition,
} from '../src/index.js';

function makeStraightNorthTrack(
  startLat: number,
  startLng: number,
  stepMeters: number,
  steps: number,
  secondsPerStep: number,
  startMs = 1_760_000_000_000,
  elevFn: (i: number) => number = (i) => 920 + Math.sin(i / 10) * 6
): RawTrackPoint[] {
  const metersPerDegLat = 111_195;
  const points: RawTrackPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    points.push({
      lat: startLat + (i * stepMeters) / metersPerDegLat,
      lng: startLng,
      ele: elevFn(i),
      time: startMs + i * secondsPerStep * 1000,
      accuracyM: 6,
    });
  }
  return points;
}

describe('Track Engine — Accuracy, Filtering & Metrics', () => {
  it('computes accurate 5km distance within 1%, splits, calories estimate, and PRs', () => {
    const c = vectors.cubbon5k;
    const raw = makeStraightNorthTrack(c.startLat, c.startLng, c.stepMeters, c.steps, c.secondsPerStep);
    const processed = processTrack(raw, { activityType: 'run', weightKg: 68 });

    expect(processed.distanceM).toBeGreaterThanOrEqual(c.expectedMinDistanceM);
    expect(processed.distanceM).toBeLessThanOrEqual(c.expectedMaxDistanceM);
    expect(processed.elapsedTimeS).toBe(c.expectedElapsedS);
    expect(processed.movingTimeS).toBe(c.expectedElapsedS);
    expect(processed.splitsKm).toHaveLength(5);
    expect(processed.caloriesIsEstimate).toBe(true);
    expect(processed.caloriesEstimate).toBeGreaterThan(250);

    const decoded = decodePolyline(processed.encodedPolyline);
    expect(decoded.length).toBe(processed.points.length);

    const prs = detectPersonalRecords(
      processed.points,
      'run',
      'recorded',
      processed.elevationGainM,
      processed.distanceM,
      processed.elapsedTimeS
    );
    const keys = prs.map((p) => p.metricKey);
    expect(keys).toContain('run_1k');
    expect(keys).toContain('run_5k');
    expect(keys).toContain('run_longest_distance');
  });

  it('drops poor-accuracy points and impossible GPS teleport spikes', () => {
    const raw = vectors.noisySpike.points as RawTrackPoint[];
    const processed = processTrack(raw, { activityType: 'run' });

    expect(processed.filteredPointCount).toBe(vectors.noisySpike.expectedKeptCount);
    expect(processed.droppedPointCount).toBe(vectors.noisySpike.expectedDroppedCount);
    expect(processed.distanceM).toBeLessThan(350);
  });

  it('drops noisy initial fix and preserves sharp 90-degree corners', () => {
    const t0 = 1_760_000_000_000;
    const raw: RawTrackPoint[] = [
      // noisy initial fix 300m off in 1s -> should drop
      { lat: 12.979, lng: 77.595, ele: 920, time: t0, accuracyM: 12 },
      // sharp corner path north then east
      { lat: 12.976, lng: 77.593, ele: 920, time: t0 + 1000, accuracyM: 6 },
      { lat: 12.977, lng: 77.593, ele: 920, time: t0 + 31_000, accuracyM: 6 },
      { lat: 12.978, lng: 77.593, ele: 920, time: t0 + 61_000, accuracyM: 6 },
      { lat: 12.978, lng: 77.594, ele: 920, time: t0 + 91_000, accuracyM: 6 },
      { lat: 12.978, lng: 77.595, ele: 920, time: t0 + 121_000, accuracyM: 6 },
    ];
    const processed = processTrack(raw, { activityType: 'run' });
    expect(processed.droppedPointCount).toBe(1);
    const corner = processed.points[2];
    expect(haversineMeters(corner, { lat: 12.978, lng: 77.593 })).toBeLessThan(2);
  });

  it('separates stationary pause gaps from moving time and smooths noisy elevation with 3m hysteresis', () => {
    const t0 = 1_760_000_000_000;
    const raw: RawTrackPoint[] = [
      { lat: 12.976, lng: 77.593, ele: 900, time: t0, accuracyM: 6 },
      { lat: 12.97645, lng: 77.593, ele: 901, time: t0 + 10_000, accuracyM: 6 },
      // 1-point GPS altitude spike (filtered by 5-pt median)
      { lat: 12.9769, lng: 77.593, ele: 960, time: t0 + 20_000, accuracyM: 6 },
      { lat: 12.97735, lng: 77.593, ele: 902, time: t0 + 30_000, accuracyM: 6 },
      // 40-second stationary pause (same coordinates)
      { lat: 12.97735, lng: 77.593, ele: 902, time: t0 + 70_000, accuracyM: 6 },
      // resume climb (+8m over 2 points)
      { lat: 12.9778, lng: 77.593, ele: 906, time: t0 + 80_000, accuracyM: 6 },
      { lat: 12.97825, lng: 77.593, ele: 910, time: t0 + 90_000, accuracyM: 6 },
    ];
    const processed = processTrack(raw, { activityType: 'run' });
    expect(processed.elapsedTimeS).toBe(90);
    expect(processed.movingTimeS).toBe(50);
    expect(processed.elevationGainM).toBeGreaterThanOrEqual(4);
    expect(processed.elevationGainM).toBeLessThan(15);
  });

  it('supports recomputeTrack from stored raw points or encoded polyline', () => {
    const raw = makeStraightNorthTrack(19.076, 72.877, 100, 20, 25);
    const first = processTrack(raw, { activityType: 'run' });
    const recomputed = recomputeTrack(first.encodedPolyline, {
      activityType: 'run',
      totalElapsedS: first.elapsedTimeS,
      startedAtMs: 1_760_000_000_000,
    });
    expect(Math.abs(recomputed.distanceM - first.distanceM)).toBeLessThan(20);
  });
});

describe('Track Engine — GPX Import/Export & Privacy Masking', () => {
  it('round-trips GPX 1.1 with elevation, timestamps, and heart rate', () => {
    const raw = makeStraightNorthTrack(22.549, 88.348, 50, 12, 14).map((p, idx) => ({
      ...p,
      hr: 145 + idx,
    }));
    const gpxXml = serializeGpx({
      title: 'Kolkata Maidan Tempo',
      activityType: 'run',
      startedAtIso: new Date(raw[0].time).toISOString(),
      points: raw,
    });

    const parsed = parseGpx(gpxXml);
    expect(parsed.name).toBe('Kolkata Maidan Tempo');
    expect(parsed.activityType).toBe('run');
    expect(parsed.points).toHaveLength(raw.length);
    expect(parsed.points[0].hr).toBe(145);
  });

  it('masks privacy zones and start/end radius without leaking start coordinates', () => {
    const raw = makeStraightNorthTrack(12.97, 77.59, 50, 40, 15); // 2,000m track
    const processed = processTrack(raw, { activityType: 'run' });
    const homeZone = {
      id: 'z1',
      name: 'Home',
      lat: raw[0].lat,
      lng: raw[0].lng,
      radiusMeters: 250,
    };

    const masked = maskTrackForViewer(processed.points, [homeZone], 200);
    expect(masked.clipped).toBe(true);
    expect(masked.points.length).toBeLessThan(processed.points.length);
    for (const pt of masked.points) {
      expect(haversineMeters(pt, homeZone)).toBeGreaterThan(homeZone.radiusMeters);
      expect(pt.distFromStartM).toBeGreaterThanOrEqual(200);
      expect(processed.distanceM - pt.distFromStartM).toBeGreaterThanOrEqual(200);
    }
    expect(encodePolyline(masked.points)).toBe(masked.encodedPolyline);
  });
});

describe('Track Engine — Segment Validation, Matching & Fairness', () => {
  const segPoints = makeStraightNorthTrack(12.9762, 77.5929, 50, 20, 15).slice(4, 16); // 550m slice
  const segment: SegmentDefinition = {
    id: 'seg-1',
    name: 'Cubbon Kings Way Sprint',
    activityType: 'run',
    points: segPoints.map((p) => ({ lat: p.lat, lng: p.lng })),
    distanceM: 550,
  };

  it('validates new segments, rejects closed loops & near-duplicates', () => {
    const ok = validateNewSegment(segPoints, 'run', []);
    expect(ok.valid).toBe(true);

    const dup = validateNewSegment(segPoints, 'run', [
      {
        id: 'seg-1',
        name: 'Cubbon Kings Way Sprint',
        activityType: 'run',
        points: segPoints,
        distanceM: ok.distanceM,
      },
    ]);
    expect(dup.valid).toBe(false);
    expect(dup.reason).toBe('duplicate');
    expect(dup.duplicateSegmentId).toBe('seg-1');

    // Closed loop (returns to start)
    const loop = [...segPoints, ...[...segPoints].reverse()];
    const loopRes = validateNewSegment(loop, 'run', []);
    expect(loopRes.valid).toBe(false);
    expect(loopRes.reason).toBe('closed_loop');
  });

  it('matches forward run within <1s boundary interpolation and rejects reverse, shortcut & manual', () => {
    // Expected duration: 11 intervals * 15s = 165.0s
    const fullRunRaw = makeStraightNorthTrack(12.9762, 77.5929, 50, 20, 15);
    const fullRun = processTrack(fullRunRaw, { activityType: 'run' });

    const match = matchActivityToSegment(fullRun.points, segment, 'run', 'recorded');
    expect(match.matched).toBe(true);
    expect(Math.abs((match.elapsedTimeS ?? 0) - 165)).toBeLessThanOrEqual(1);
    expect(match.isFlagged).toBe(false);

    // Reverse run must NOT match
    const reversedRaw = [...fullRunRaw]
      .reverse()
      .map((p, idx) => ({ ...p, time: 1_760_000_000_000 + idx * 15_000 }));
    const revRun = processTrack(reversedRaw, { activityType: 'run' });
    const revMatch = matchActivityToSegment(revRun.points, segment, 'run', 'recorded');
    expect(revMatch.matched).toBe(false);

    // Shortcut bowing 120m sideways must NOT match
    const shortcutPoints = fullRun.points.map((p, idx) =>
      idx >= 6 && idx <= 12 ? { ...p, lng: p.lng + 0.0012 } : p
    );
    const shortcutMatch = matchActivityToSegment(shortcutPoints, segment, 'run', 'recorded');
    expect(shortcutMatch.matched).toBe(false);

    // Manual activity must NOT match
    const manualMatch = matchActivityToSegment(fullRun.points, segment, 'run', 'manual');
    expect(manualMatch.matched).toBe(false);
    expect(manualMatch.reason).toBe('manual_activity_ineligible');
  });

  it('flags implausible vehicle-speed run effort for fairness review', () => {
    // 100m every 5s = 20 m/s = 72 km/h (motorbike recorded as run)
    const fastRunRaw = makeStraightNorthTrack(12.9762, 77.5929, 50, 20, 3);
    // 50m / 3s = 16.6 m/s (above 12 m/s jump limit, let's test 8.3 m/s = 30 km/h)
    const vehicleRaw = makeStraightNorthTrack(12.9762, 77.5929, 50, 20, 6);
    const vehicleRun = processTrack(vehicleRaw, { activityType: 'run' });
    const match = matchActivityToSegment(vehicleRun.points, segment, 'run', 'recorded');
    expect(match.matched).toBe(true);
    expect(match.isFlagged).toBe(true);
    expect(match.flagReason).toContain('Implausible average speed');
    void fastRunRaw;
  });
});
