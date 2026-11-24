import 'package:flutter_test/flutter_test.dart';
import 'package:stride/core/api/stride_api_client.dart';
import 'package:stride/core/location/recording_controller.dart';
import 'package:stride/core/storage/recording_db.dart';
import 'package:stride/core/track_processor/track_processor.dart';

class _InMemoryRecordingDb extends RecordingDb {
  final Map<String, DraftRecordingSession> sessions = {};
  final Map<String, List<RawTrackPoint>> points = {};
  final Map<String, PendingUploadActivity> queue = {};

  @override
  Future<void> startOrUpdateSession({
    required String clientId,
    required ActivityType activityType,
    required int startedAtMs,
    bool paused = false,
  }) async {
    sessions[clientId] = DraftRecordingSession(
      clientId: clientId,
      activityType: activityType,
      startedAtMs: startedAtMs,
      paused: paused,
      points: points[clientId] ?? const [],
    );
  }

  @override
  Future<void> appendPoint(String clientId, RawTrackPoint pt) async {
    points.putIfAbsent(clientId, () => []).add(pt);
  }

  @override
  Future<DraftRecordingSession?> loadUnfinishedSession() async {
    if (sessions.isEmpty) return null;
    final first = sessions.values.first;
    return DraftRecordingSession(
      clientId: first.clientId,
      activityType: first.activityType,
      startedAtMs: first.startedAtMs,
      paused: first.paused,
      points: points[first.clientId] ?? const [],
    );
  }

  @override
  Future<void> clearActiveSession(String clientId) async {
    sessions.remove(clientId);
    points.remove(clientId);
  }

  @override
  Future<void> enqueueSync(String clientId, Map<String, dynamic> payload) async {
    queue[clientId] = PendingUploadActivity(clientId: clientId, payload: payload, attempts: 0);
  }

  @override
  Future<List<PendingUploadActivity>> pendingSyncs() async => queue.values.toList();

  @override
  Future<void> markSynced(String clientId) async {
    queue.remove(clientId);
  }

  @override
  Future<void> recordSyncFailure(String clientId, String error) async {
    final prev = queue[clientId];
    if (prev != null) {
      queue[clientId] = PendingUploadActivity(
        clientId: clientId,
        payload: prev.payload,
        attempts: prev.attempts + 1,
      );
    }
  }
}

class _FakeApiClient extends StrideApiClient {
  bool failNext = false;
  final List<String> uploadedIds = [];

  @override
  Future<Map<String, dynamic>> uploadActivityIdempotent(
    String clientId,
    Map<String, dynamic> payload,
  ) async {
    if (failNext) throw Exception('Offline network unreachable');
    uploadedIds.add(clientId);
    return {'deduplicated': uploadedIds.where((e) => e == clientId).length > 1};
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('RecordingController supports crash recovery and idempotent offline sync', () async {
    final db = _InMemoryRecordingDb();
    final api = _FakeApiClient();
    final ctrl = RecordingController(db, api);

    await ctrl.start(useSimulator: true);
    expect(ctrl.state.phase, RecordingPhase.recording);

    await Future<void>.delayed(const Duration(milliseconds: 2200));
    expect(ctrl.state.points.length, greaterThanOrEqualTo(2));

    await ctrl.pause();
    expect(ctrl.state.phase, RecordingPhase.paused);

    // Simulate app crash / restart by creating a new controller reading same DB
    final recoveredCtrl = RecordingController(db, api);
    final unfinished = await recoveredCtrl.checkUnfinishedDraft();
    expect(unfinished, isNotNull);
    await recoveredCtrl.recoverDraft(unfinished!);
    expect(recoveredCtrl.state.points.length, greaterThanOrEqualTo(2));

    // Offline failure keeps item safely in sync queue
    api.failNext = true;
    final firstSync = await recoveredCtrl.stopAndSave(title: 'Morning Run');
    expect(firstSync, isFalse);
    expect(recoveredCtrl.state.pendingOfflineCount, equals(1));

    // Retry when online succeeds and clears queue idempotently
    api.failNext = false;
    final retrySync = await recoveredCtrl.syncPendingQueue();
    expect(retrySync, isTrue);
    expect(recoveredCtrl.state.pendingOfflineCount, equals(0));
    expect(api.uploadedIds.length, equals(1));
  });

  test('RecordingController computes speed from geodesic movement when hardware speed is 0', () async {
    final db = _InMemoryRecordingDb();
    final api = _FakeApiClient();
    final ctrl = RecordingController(db, api);

    await ctrl.start(useSimulator: false);
    // ~22m per 5s = ~4.4 m/s (realistic running pace below TrackProcessor 12 m/s jump limit)
    const coords = [
      (12.97620, 77.59290),
      (12.97638, 77.59298),
      (12.97656, 77.59306),
      (12.97674, 77.59315),
      (12.97692, 77.59324),
      (12.97710, 77.59333),
    ];
    final t0 = DateTime.now().millisecondsSinceEpoch;
    for (int i = 0; i < coords.length; i++) {
      await ctrl.ingestGpsPosition(
        lat: coords[i].$1,
        lng: coords[i].$2,
        altitude: 915.0 + i,
        speedMps: 0.0, // Android adb emu geo fix often emits 0 speed
        timestampMs: t0 + i * 5000,
      );
    }

    expect(ctrl.state.phase, RecordingPhase.recording);
    expect(ctrl.state.points.length, equals(6));
    expect(ctrl.state.processed?.distanceM ?? 0, greaterThan(95));
    expect(ctrl.state.currentSpeedMps, greaterThan(1.0));
  });
}
