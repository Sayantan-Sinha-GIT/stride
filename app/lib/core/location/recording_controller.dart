import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/foundation.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:geolocator/geolocator.dart' hide ActivityType;
import 'package:uuid/uuid.dart';
import '../api/stride_api_client.dart';
import '../storage/recording_db.dart';
import '../track_processor/track_processor.dart';

enum RecordingPhase { idle, recording, paused, autoPaused }

class RecordingSnapshot {
  final String? clientId;
  final RecordingPhase phase;
  final ActivityType activityType;
  final bool autoPauseEnabled;
  final bool simMode;
  final double currentSpeedMps;
  final List<RawTrackPoint> points;
  final ProcessedTrackResult? processed;
  final int pendingOfflineCount;

  const RecordingSnapshot({
    this.clientId,
    this.phase = RecordingPhase.idle,
    this.activityType = ActivityType.run,
    this.autoPauseEnabled = true,
    this.simMode = false,
    this.currentSpeedMps = 0,
    this.points = const [],
    this.processed,
    this.pendingOfflineCount = 0,
  });

  RecordingSnapshot copyWith({
    String? clientId,
    RecordingPhase? phase,
    ActivityType? activityType,
    bool? autoPauseEnabled,
    bool? simMode,
    double? currentSpeedMps,
    List<RawTrackPoint>? points,
    ProcessedTrackResult? processed,
    int? pendingOfflineCount,
  }) {
    return RecordingSnapshot(
      clientId: clientId ?? this.clientId,
      phase: phase ?? this.phase,
      activityType: activityType ?? this.activityType,
      autoPauseEnabled: autoPauseEnabled ?? this.autoPauseEnabled,
      simMode: simMode ?? this.simMode,
      currentSpeedMps: currentSpeedMps ?? this.currentSpeedMps,
      points: points ?? this.points,
      processed: processed ?? this.processed,
      pendingOfflineCount: pendingOfflineCount ?? this.pendingOfflineCount,
    );
  }
}

class RecordingController extends ChangeNotifier {
  final RecordingDb _db;
  final StrideApiClient _api;
  final _uuid = const Uuid();

  StrideApiClient get api => _api;

  RecordingSnapshot _state = const RecordingSnapshot();
  RecordingSnapshot get state => _state;

  StreamSubscription<Position>? _geoSub;
  Timer? _simTimer;
  int _simStep = 0;

  static const _simWaypoints = [
    [12.9762, 77.5929],
    [12.9792, 77.5955],
    [12.9788, 77.5992],
    [12.9746, 77.6004],
    [12.9718, 77.5968],
    [12.9756, 77.5923],
  ];

  RecordingController(this._db, this._api);

  Future<DraftRecordingSession?> checkUnfinishedDraft() {
    return _db.loadUnfinishedSession();
  }

  Future<void> recoverDraft(DraftRecordingSession draft) async {
    final proc = TrackProcessor.process(draft.points, activityType: draft.activityType);
    _state = _state.copyWith(
      clientId: draft.clientId,
      activityType: draft.activityType,
      phase: RecordingPhase.paused,
      points: draft.points,
      processed: proc,
    );
    notifyListeners();
  }

  Future<void> discardDraft(String clientId) async {
    await _db.clearActiveSession(clientId);
    _state = RecordingSnapshot(
      activityType: _state.activityType,
      autoPauseEnabled: _state.autoPauseEnabled,
      simMode: _state.simMode,
      pendingOfflineCount: (await _db.pendingSyncs()).length,
    );
    notifyListeners();
  }

  void setActivityType(ActivityType type) {
    _state = _state.copyWith(activityType: type);
    notifyListeners();
  }

  void toggleAutoPause(bool val) {
    _state = _state.copyWith(autoPauseEnabled: val);
    notifyListeners();
  }

  void toggleSimMode(bool val) {
    _state = _state.copyWith(simMode: val);
    notifyListeners();
  }

  /// Battery-aware GPS sampling distance filter tuned by activity type
  int _distanceFilterMeters(ActivityType type) {
    switch (type) {
      case ActivityType.walk:
      case ActivityType.hike:
        return 5;
      case ActivityType.run:
        return 4;
      case ActivityType.ride:
        return 10;
    }
  }

  Future<void> start({bool useSimulator = false}) async {
    final cid = _state.clientId ?? _uuid.v4();
    await _db.startOrUpdateSession(
      clientId: cid,
      activityType: _state.activityType,
      startedAtMs: DateTime.now().millisecondsSinceEpoch,
    );

    _state = _state.copyWith(clientId: cid, phase: RecordingPhase.recording, simMode: useSimulator);
    notifyListeners();

    if (!kIsWeb) {
      try {
        await FlutterForegroundTask.startService(
          notificationTitle: 'Stride Recording Active',
          notificationText: 'Tracking ${_state.activityType.name} in background',
        );
      } catch (_) {}
    }

    if (useSimulator || kDebugMode && _state.simMode) {
      _simTimer?.cancel();
      _simTimer = Timer.periodic(const Duration(seconds: 1), (_) => _emitSimPoint());
      return;
    }

    try {
      final settings = LocationSettings(
        accuracy: LocationAccuracy.bestForNavigation,
        distanceFilter: _distanceFilterMeters(_state.activityType),
      );
      _geoSub?.cancel();
      _geoSub = Geolocator.getPositionStream(locationSettings: settings).listen((pos) {
        unawaited(
          ingestGpsPosition(
            lat: pos.latitude,
            lng: pos.longitude,
            altitude: pos.altitude,
            speedMps: pos.speed,
            accuracyM: pos.accuracy,
            timestampMs: pos.timestamp.millisecondsSinceEpoch,
          ),
        );
      });
    } catch (_) {
      // Allow manual / injected fixes when platform binding is absent in unit tests.
    }
  }

  /// Processes a real or spoofed GPS coordinate fix cleanly, computing geodesic fallback speed
  /// so devices/emulators that emit `speed == 0.0` (e.g. `adb emu geo fix`) never falsely auto-pause.
  Future<void> ingestGpsPosition({
    required double lat,
    required double lng,
    double altitude = 0,
    double speedMps = 0,
    double accuracyM = 5,
    int? timestampMs,
  }) async {
    if (_state.phase != RecordingPhase.recording && _state.phase != RecordingPhase.autoPaused) {
      return;
    }

    final wallNow = DateTime.now().millisecondsSinceEpoch;
    final prev = _state.points.isNotEmpty ? _state.points.last : null;
    var fixTimeMs = timestampMs ?? wallNow;
    if (prev != null && fixTimeMs <= prev.timeMs) {
      fixTimeMs = math.max(wallNow, prev.timeMs + 1000);
    }

    var effectiveSpeedMps = speedMps.isFinite && speedMps > 0 ? speedMps : 0.0;
    if (prev != null) {
      final distM = TrackProcessor.haversineMeters(prev.lat, prev.lng, lat, lng);
      final dtS = math.max(0.5, (fixTimeMs - prev.timeMs) / 1000.0);
      final derivedSpeed = distM / dtS;
      if (derivedSpeed > effectiveSpeedMps) {
        effectiveSpeedMps = derivedSpeed;
      }
      // Skip exact duplicate stationary pings when coordinate didn't change
      if (distM < 0.8 && _state.autoPauseEnabled && effectiveSpeedMps < 0.45 && _state.points.length > 3) {
        _state = _state.copyWith(phase: RecordingPhase.autoPaused, currentSpeedMps: effectiveSpeedMps);
        notifyListeners();
        return;
      }
    }

    if (_state.autoPauseEnabled && effectiveSpeedMps < 0.45 && _state.points.length > 3) {
      _state = _state.copyWith(phase: RecordingPhase.autoPaused, currentSpeedMps: effectiveSpeedMps);
      notifyListeners();
      return;
    }

    if (_state.phase == RecordingPhase.autoPaused) {
      _state = _state.copyWith(phase: RecordingPhase.recording);
    }
    _state = _state.copyWith(currentSpeedMps: effectiveSpeedMps);

    await _onNewPoint(
      RawTrackPoint(
        lat: lat,
        lng: lng,
        ele: altitude,
        timeMs: fixTimeMs,
        accuracyM: accuracyM > 0 ? accuracyM : 5.0,
      ),
    );
  }

  void _emitSimPoint() {
    final step = _simStep++;
    final leg = (step ~/ 5) % (_simWaypoints.length - 1);
    final t = (step % 5) / 5.0;
    final p1 = _simWaypoints[leg];
    final p2 = _simWaypoints[leg + 1];
    _onNewPoint(
      RawTrackPoint(
        lat: p1[0] + (p2[0] - p1[0]) * t,
        lng: p1[1] + (p2[1] - p1[1]) * t,
        ele: 920.0 + (step % 7),
        timeMs: DateTime.now().millisecondsSinceEpoch,
        accuracyM: 5.0,
      ),
    );
  }

  Future<void> _onNewPoint(RawTrackPoint pt) async {
    final cid = _state.clientId;
    if (cid == null) return;
    await _db.appendPoint(cid, pt);
    final updated = [..._state.points, pt];
    final proc = updated.length >= 2
        ? TrackProcessor.process(updated, activityType: _state.activityType)
        : null;
    _state = _state.copyWith(points: updated, processed: proc);
    notifyListeners();
  }

  Future<void> pause() async {
    _geoSub?.pause();
    _simTimer?.cancel();
    if (_state.clientId != null) {
      await _db.startOrUpdateSession(
        clientId: _state.clientId!,
        activityType: _state.activityType,
        startedAtMs: _state.points.firstOrNull?.timeMs ?? DateTime.now().millisecondsSinceEpoch,
        paused: true,
      );
    }
    _state = _state.copyWith(phase: RecordingPhase.paused);
    notifyListeners();
  }

  Future<void> resume() async {
    await start(useSimulator: _state.simMode);
  }

  /// Saves activity to offline SQLite queue first (offline-first guarantee),
  /// then attempts immediate idempotent sync to Cloudflare Workers API.
  Future<bool> stopAndSave({
    required String title,
    String visibility = 'followers',
  }) async {
    _geoSub?.cancel();
    _simTimer?.cancel();
    try {
      await FlutterForegroundTask.stopService();
    } catch (_) {}

    final cid = _state.clientId;
    if (cid == null || _state.points.length < 2) return false;

    final payload = {
      'clientId': cid,
      'title': title.trim().isEmpty ? 'Stride ${_state.activityType.name}' : title.trim(),
      'activityType': _state.activityType.name,
      'source': 'recorded',
      'visibility': visibility,
      'points': _state.points.map((e) => e.toJson()).toList(),
    };

    await _db.enqueueSync(cid, payload);
    await _db.clearActiveSession(cid);

    _state = RecordingSnapshot(
      activityType: _state.activityType,
      autoPauseEnabled: _state.autoPauseEnabled,
      pendingOfflineCount: (await _db.pendingSyncs()).length,
    );
    notifyListeners();

    return await syncPendingQueue();
  }

  Future<bool> syncPendingQueue() async {
    final pending = await _db.pendingSyncs();
    var allSucceeded = true;
    for (final item in pending) {
      try {
        await _api.uploadActivityIdempotent(item.clientId, item.payload);
        await _db.markSynced(item.clientId);
      } catch (e) {
        allSucceeded = false;
        await _db.recordSyncFailure(item.clientId, e.toString());
      }
    }
    _state = _state.copyWith(pendingOfflineCount: (await _db.pendingSyncs()).length);
    notifyListeners();
    return allSucceeded;
  }

  @override
  void dispose() {
    _geoSub?.cancel();
    _simTimer?.cancel();
    super.dispose();
  }
}
