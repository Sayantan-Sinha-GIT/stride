import {
  computeBoundingBox,
  douglasPeucker,
  encodePolyline,
  haversineMeters,
  toWktLineString,
} from './geo.js';
import type { FilteredTrackPoint, MaskedTrackResult, PrivacyZone } from './types.js';

export function isPointInsidePrivacyZones(
  lat: number,
  lng: number,
  zones: PrivacyZone[]
): boolean {
  for (const zone of zones) {
    if (haversineMeters({ lat, lng }, { lat: zone.lat, lng: zone.lng }) <= zone.radiusMeters) {
      return true;
    }
  }
  return false;
}

/**
 * Masks any track points inside the owner's privacy zones OR within `hideStartEndMeters`
 * of activity start/finish. Runs strictly server-side before returning activity tracks
 * to anyone other than the owner.
 */
export function maskTrackForViewer(
  points: FilteredTrackPoint[],
  privacyZones: PrivacyZone[],
  hideStartEndMeters = 0
): MaskedTrackResult {
  if (points.length === 0) {
    return {
      points: [],
      encodedPolyline: '',
      wktLineString: '',
      bbox: null,
      clipped: false,
      hiddenPointCount: 0,
      visibleDistanceM: 0,
    };
  }

  const totalDistM = points[points.length - 1].distFromStartM;
  const hiddenMask = points.map((pt) => {
    const inStartEnd =
      hideStartEndMeters > 0 &&
      (pt.distFromStartM < hideStartEndMeters ||
        totalDistM - pt.distFromStartM < hideStartEndMeters);
    const inZone = isPointInsidePrivacyZones(pt.lat, pt.lng, privacyZones);
    return inStartEnd || inZone;
  });

  // Also strip tiny isolated visible islands (< 3 points) at start or end so exact start/end isn't inferred
  let firstSafe = 0;
  while (firstSafe < hiddenMask.length && hiddenMask[firstSafe]) firstSafe++;
  let lastSafe = hiddenMask.length - 1;
  while (lastSafe >= 0 && hiddenMask[lastSafe]) lastSafe--;

  const visiblePoints: FilteredTrackPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    if (!hiddenMask[i] && i >= firstSafe && i <= lastSafe) {
      visiblePoints.push(points[i]);
    }
  }

  const hiddenPointCount = points.length - visiblePoints.length;
  const clipped = hiddenPointCount > 0;

  if (visiblePoints.length < 2) {
    return {
      points: [],
      encodedPolyline: '',
      wktLineString: '',
      bbox: null,
      clipped: true,
      hiddenPointCount: points.length,
      visibleDistanceM: 0,
    };
  }

  let visibleDist = 0;
  for (let i = 1; i < visiblePoints.length; i++) {
    // Only add contiguous segment distance when indices are sequential
    visibleDist += haversineMeters(visiblePoints[i - 1], visiblePoints[i]);
  }

  const simplified = douglasPeucker(visiblePoints, 6);
  return {
    points: visiblePoints,
    encodedPolyline: encodePolyline(visiblePoints),
    wktLineString: toWktLineString(simplified),
    bbox: computeBoundingBox(visiblePoints),
    clipped,
    hiddenPointCount,
    visibleDistanceM: Math.round(visibleDist * 10) / 10,
  };
}
