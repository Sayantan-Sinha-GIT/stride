import 'dart:math' as math;

enum ActivityType { run, walk, ride, hike }

enum ActivitySource { recorded, imported, manual }

class RawTrackPoint {
  final double lat;
  final double lng;
  final double ele;
  final int timeMs;
  final double? accuracyM;
  final double? hr;

  const RawTrackPoint({
    required this.lat,
    required this.lng,
    this.ele = 0,
    required this.timeMs,
    this.accuracyM,
    this.hr,
  });

  Map<String, dynamic> toJson() => {
        'lat': lat,
        'lng': lng,
        'ele': ele,
        'time': timeMs,
        if (accuracyM != null) 'accuracyM': accuracyM,
        if (hr != null) 'hr': hr,
      };

  factory RawTrackPoint.fromJson(Map<String, dynamic> json) => RawTrackPoint(
        lat: (json['lat'] as num).toDouble(),
        lng: (json['lng'] as num).toDouble(),
        ele: (json['ele'] as num?)?.toDouble() ?? 0,
        timeMs: (json['time'] as num).toInt(),
        accuracyM: (json['accuracyM'] as num?)?.toDouble(),
        hr: (json['hr'] as num?)?.toDouble(),
      );
}

class FilteredTrackPoint {
  final double lat;
  final double lng;
  final double ele;
  final int timeMs;
  final double distFromStartM;
  final double speedMps;
  final bool moving;

  const FilteredTrackPoint({
    required this.lat,
    required this.lng,
    required this.ele,
    required this.timeMs,
    required this.distFromStartM,
    required this.speedMps,
    required this.moving,
  });
}

class ProcessedTrackResult {
  final int rawCount;
  final int filteredCount;
  final int droppedCount;
  final double distanceM;
  final int movingTimeS;
  final int elapsedTimeS;
  final double elevationGainM;
  final double elevationLossM;
  final double avgSpeedMps;
  final int caloriesEstimate;
  final String encodedPolyline;
  final List<FilteredTrackPoint> points;

  const ProcessedTrackResult({
    required this.rawCount,
    required this.filteredCount,
    required this.droppedCount,
    required this.distanceM,
    required this.movingTimeS,
    required this.elapsedTimeS,
    required this.elevationGainM,
    required this.elevationLossM,
    required this.avgSpeedMps,
    required this.caloriesEstimate,
    required this.encodedPolyline,
    required this.points,
  });
}

class TrackProcessor {
  static const double earthRadiusM = 6371008.8;
  static const double elevationHysteresisM = 3.0;
  static const int pauseGapSeconds = 15;

  static double haversineMeters(double lat1, double lng1, double lat2, double lng2) {
    const deg = math.pi / 180.0;
    final rLat1 = lat1 * deg;
    final rLat2 = lat2 * deg;
    final dLat = (lat2 - lat1) * deg;
    final dLng = (lng2 - lng1) * deg;
    final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(rLat1) * math.cos(rLat2) * math.sin(dLng / 2) * math.sin(dLng / 2);
    final c = 2 * math.atan2(math.sqrt(a), math.sqrt(math.max(0, 1 - a)));
    return earthRadiusM * c;
  }

  static double _maxAccuracy(ActivityType type) => type == ActivityType.ride ? 50.0 : 35.0;

  static double _maxJumpSpeed(ActivityType type) {
    switch (type) {
      case ActivityType.walk:
        return 5.5;
      case ActivityType.hike:
        return 6.5;
      case ActivityType.run:
        return 12.0;
      case ActivityType.ride:
        return 32.0;
    }
  }

  static double _movingThreshold(ActivityType type) {
    switch (type) {
      case ActivityType.walk:
        return 0.45;
      case ActivityType.hike:
        return 0.40;
      case ActivityType.run:
        return 0.85;
      case ActivityType.ride:
        return 1.40;
    }
  }

  static ProcessedTrackResult process(
    List<RawTrackPoint> raw, {
    required ActivityType activityType,
    double weightKg = 70.0,
  }) {
    final maxAcc = _maxAccuracy(activityType);
    final maxJump = _maxJumpSpeed(activityType);
    final movingThresh = _movingThreshold(activityType);

    final valid = <RawTrackPoint>[];
    var dropped = 0;
    for (final pt in raw) {
      if (pt.lat < -90 || pt.lat > 90 || pt.lng < -180 || pt.lng > 180) {
        dropped++;
        continue;
      }
      if (pt.accuracyM != null && pt.accuracyM! > maxAcc) {
        dropped++;
        continue;
      }
      valid.add(pt);
    }

    valid.sort((a, b) => a.timeMs.compareTo(b.timeMs));

    if (valid.length >= 3) {
      final dt01 = math.max(1.0, (valid[1].timeMs - valid[0].timeMs) / 1000.0);
      final dt12 = math.max(1.0, (valid[2].timeMs - valid[1].timeMs) / 1000.0);
      final v01 = haversineMeters(valid[0].lat, valid[0].lng, valid[1].lat, valid[1].lng) / dt01;
      final v12 = haversineMeters(valid[1].lat, valid[1].lng, valid[2].lat, valid[2].lng) / dt12;
      if (v01 > maxJump && v12 <= maxJump) {
        valid.removeAt(0);
        dropped++;
      }
    }

    final kept = <RawTrackPoint>[];
    for (final pt in valid) {
      if (kept.isEmpty) {
        kept.add(pt);
        continue;
      }
      final prev = kept.last;
      if (pt.timeMs <= prev.timeMs) {
        dropped++;
        continue;
      }
      final dt = (pt.timeMs - prev.timeMs) / 1000.0;
      final d = haversineMeters(prev.lat, prev.lng, pt.lat, pt.lng);
      if (dt <= 120 && (d / dt) > maxJump) {
        dropped++;
        continue;
      }
      kept.add(pt);
    }

    if (kept.isEmpty) {
      return ProcessedTrackResult(
        rawCount: raw.length,
        filteredCount: 0,
        droppedCount: dropped,
        distanceM: 0,
        movingTimeS: 0,
        elapsedTimeS: 0,
        elevationGainM: 0,
        elevationLossM: 0,
        avgSpeedMps: 0,
        caloriesEstimate: 0,
        encodedPolyline: '',
        points: const [],
      );
    }

    // 5-point median elevation filter + hysteresis
    final med = List<double>.generate(kept.length, (i) {
      final start = math.max(0, i - 2);
      final end = math.min(kept.length - 1, i + 2);
      final win = [for (var j = start; j <= end; j++) kept[j].ele]..sort();
      return win[win.length ~/ 2];
    });

    final smoothEle = List<double>.generate(med.length, (i) {
      if (i == 0 || i == med.length - 1) return med[i];
      return 0.25 * med[i - 1] + 0.5 * med[i] + 0.25 * med[i + 1];
    });

    var anchor = smoothEle[0];
    var gainM = 0.0;
    var lossM = 0.0;
    for (var i = 1; i < smoothEle.length; i++) {
      final diff = smoothEle[i] - anchor;
      if (diff >= elevationHysteresisM) {
        gainM += diff;
        anchor = smoothEle[i];
      } else if (diff <= -elevationHysteresisM) {
        lossM += -diff;
        anchor = smoothEle[i];
      }
    }

    final filtered = <FilteredTrackPoint>[];
    var cumDist = 0.0;
    var movingS = 0.0;

    for (var i = 0; i < kept.length; i++) {
      var speed = 0.0;
      var moving = false;
      if (i > 0) {
        final prev = kept[i - 1];
        final curr = kept[i];
        final d = haversineMeters(prev.lat, prev.lng, curr.lat, curr.lng);
        final dt = math.max(0.1, (curr.timeMs - prev.timeMs) / 1000.0);
        cumDist += d;
        speed = d / dt;
        if (dt <= pauseGapSeconds && speed >= movingThresh) {
          moving = true;
          movingS += dt;
        }
      }
      filtered.add(
        FilteredTrackPoint(
          lat: kept[i].lat,
          lng: kept[i].lng,
          ele: smoothEle[i],
          timeMs: kept[i].timeMs,
          distFromStartM: cumDist,
          speedMps: speed,
          moving: moving,
        ),
      );
    }

    final elapsedS = ((kept.last.timeMs - kept.first.timeMs) / 1000.0).round();
    final roundedMovingS = movingS.round();
    final avgSpeed = roundedMovingS > 0 ? cumDist / roundedMovingS : 0.0;
    final kmh = avgSpeed * 3.6;
    final met = activityType == ActivityType.run
        ? math.max(6.0, math.min(16.0, 2.2 + kmh * 0.85))
        : activityType == ActivityType.ride
            ? (kmh < 20 ? 6.8 : 9.5)
            : 3.8;
    final calories = (met * weightKg * (roundedMovingS / 3600.0)).round();

    return ProcessedTrackResult(
      rawCount: raw.length,
      filteredCount: filtered.length,
      droppedCount: dropped,
      distanceM: (cumDist * 10).round() / 10.0,
      movingTimeS: roundedMovingS,
      elapsedTimeS: elapsedS,
      elevationGainM: (gainM * 10).round() / 10.0,
      elevationLossM: (lossM * 10).round() / 10.0,
      avgSpeedMps: (avgSpeed * 100).round() / 100.0,
      caloriesEstimate: calories,
      encodedPolyline: encodePolyline(filtered),
      points: filtered,
    );
  }

  static String encodePolyline(List<FilteredTrackPoint> points) {
    var prevLat = 0;
    var prevLng = 0;
    final sb = StringBuffer();
    for (final p in points) {
      final lat = (p.lat * 1e5).round();
      final lng = (p.lng * 1e5).round();
      _encodeVal(lat - prevLat, sb);
      _encodeVal(lng - prevLng, sb);
      prevLat = lat;
      prevLng = lng;
    }
    return sb.toString();
  }

  static void _encodeVal(int v, StringBuffer sb) {
    var val = v < 0 ? ~(v << 1) : (v << 1);
    while (val >= 0x20) {
      sb.writeCharCode((0x20 | (val & 0x1f)) + 63);
      val >>= 5;
    }
    sb.writeCharCode(val + 63);
  }
}
