import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:stride/core/track_processor/track_processor.dart';

void main() {
  test('TrackProcessor matches shared 5k and noisy spike vectors', () {
    final file = File('../packages/track-engine/fixtures/shared_vectors.json');
    final json = jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;

    final cubbon = json['cubbon5k'] as Map<String, dynamic>;
    final startLat = (cubbon['startLat'] as num).toDouble();
    final startLng = (cubbon['startLng'] as num).toDouble();
    final stepMeters = (cubbon['stepMeters'] as num).toDouble();
    final steps = cubbon['steps'] as int;
    final secPerStep = cubbon['secondsPerStep'] as int;

    final raw5k = List<RawTrackPoint>.generate(steps + 1, (i) {
      return RawTrackPoint(
        lat: startLat + (i * stepMeters) / 111195.0,
        lng: startLng,
        ele: 920.0,
        timeMs: 1760000000000 + i * secPerStep * 1000,
        accuracyM: 6.0,
      );
    });

    final res5k = TrackProcessor.process(raw5k, activityType: ActivityType.run);
    expect(res5k.distanceM, greaterThanOrEqualTo((cubbon['expectedMinDistanceM'] as num).toDouble()));
    expect(res5k.distanceM, lessThanOrEqualTo((cubbon['expectedMaxDistanceM'] as num).toDouble()));
    expect(res5k.elapsedTimeS, equals(cubbon['expectedElapsedS']));

    final noisy = json['noisySpike'] as Map<String, dynamic>;
    final rawNoisy = (noisy['points'] as List<dynamic>)
        .map((e) => RawTrackPoint.fromJson(e as Map<String, dynamic>))
        .toList();
    final resNoisy = TrackProcessor.process(rawNoisy, activityType: ActivityType.run);
    expect(resNoisy.filteredCount, equals(noisy['expectedKeptCount']));
    expect(resNoisy.droppedCount, equals(noisy['expectedDroppedCount']));
  });
}
