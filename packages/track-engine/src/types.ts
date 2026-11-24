export type ActivityType = 'run' | 'walk' | 'ride' | 'hike';
export type ActivitySource = 'recorded' | 'imported' | 'manual';
export type UnitSystem = 'metric' | 'imperial';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RawTrackPoint extends LatLng {
  ele?: number | null;
  time: number; // Unix epoch ms
  accuracyM?: number | null;
  hr?: number | null;
}

export interface FilteredTrackPoint extends LatLng {
  ele: number;
  time: number; // Unix epoch ms
  distFromStartM: number;
  speedMps: number;
  moving: boolean;
  hr?: number | null;
}

export interface SplitMetric {
  splitIndex: number; // 1-based
  distanceM: number;
  elapsedTimeS: number;
  movingTimeS: number;
  paceSecPerKm: number | null;
  speedKmh: number;
  elevationGainM: number;
  elevationLossM: number;
}

export interface StreamSample {
  t: number; // elapsed seconds from start
  d: number; // cumulative meters
  ele: number; // smoothed elevation m
  pace: number | null; // sec/km
  speedKmh: number;
  hr?: number | null;
}

export interface BoundingBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export interface ProcessedTrack {
  activityType: ActivityType;
  startedAtIso: string;
  endedAtIso: string;
  rawPointCount: number;
  filteredPointCount: number;
  droppedPointCount: number;
  distanceM: number;
  elapsedTimeS: number;
  movingTimeS: number;
  avgSpeedMps: number;
  maxSpeedMps: number;
  avgPaceSecPerKm: number | null;
  elevationGainM: number;
  elevationLossM: number;
  minElevationM: number;
  maxElevationM: number;
  caloriesEstimate: number;
  caloriesIsEstimate: true;
  encodedPolyline: string;
  simplifiedPoints: LatLng[];
  wktLineString: string;
  bbox: BoundingBox | null;
  points: FilteredTrackPoint[];
  splitsKm: SplitMetric[];
  splitsMi: SplitMetric[];
  stream: StreamSample[];
}

export interface PrivacyZone {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
}

export interface MaskedTrackResult {
  points: FilteredTrackPoint[];
  encodedPolyline: string;
  wktLineString: string;
  bbox: BoundingBox | null;
  clipped: boolean;
  hiddenPointCount: number;
  visibleDistanceM: number;
}

export interface ExistingSegmentRef {
  id: string;
  name: string;
  activityType: ActivityType;
  points: LatLng[];
  distanceM: number;
}

export interface SegmentValidationResult {
  valid: boolean;
  reason?:
    | 'too_few_points'
    | 'too_short'
    | 'too_long'
    | 'closed_loop'
    | 'duplicate';
  distanceM: number;
  elevationGainM: number;
  elevationLossM: number;
  duplicateSegmentId?: string;
  duplicateSegmentName?: string;
}

export interface SegmentDefinition {
  id: string;
  name: string;
  activityType: ActivityType;
  points: LatLng[];
  distanceM: number;
}

export interface SegmentMatchResult {
  matched: boolean;
  reason?: string;
  elapsedTimeS?: number;
  startIndex?: number;
  endIndex?: number;
  startOffsetS?: number;
  endOffsetS?: number;
  avgSpeedMps?: number;
  maxSpeedMps?: number;
  isFlagged?: boolean;
  flagReason?: string | null;
}

export interface PersonalRecordCandidate {
  metricKey: string; // e.g., run_1k, run_5k, run_10k, run_hm, run_marathon, ride_10k, ride_20k, ride_50k, ride_100k, longest_distance, highest_climb
  activityType: ActivityType;
  valueNum: number; // seconds for distance PRs, meters for longest_distance / highest_climb
  distanceM: number;
  durationS: number;
}
