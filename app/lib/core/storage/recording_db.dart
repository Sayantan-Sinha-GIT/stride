import 'dart:convert';
import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';
import '../track_processor/track_processor.dart';

class DraftRecordingSession {
  final String clientId;
  final ActivityType activityType;
  final int startedAtMs;
  final bool paused;
  final List<RawTrackPoint> points;

  const DraftRecordingSession({
    required this.clientId,
    required this.activityType,
    required this.startedAtMs,
    required this.paused,
    required this.points,
  });
}

class PendingUploadActivity {
  final String clientId;
  final Map<String, dynamic> payload;
  final int attempts;

  const PendingUploadActivity({
    required this.clientId,
    required this.payload,
    required this.attempts,
  });
}

/// Crash-safe SQLite store that persists every GPS point continuously
/// and maintains an idempotent offline sync queue.
class RecordingDb {
  Database? _db;

  Future<Database> get database async {
    if (_db != null) return _db!;
    final dbPath = await getDatabasesPath();
    _db = await openDatabase(
      p.join(dbPath, 'stride_recorder.db'),
      version: 1,
      onCreate: (db, _) async {
        await db.execute('''
          CREATE TABLE active_session (
            client_id TEXT PRIMARY KEY,
            activity_type TEXT NOT NULL,
            started_at_ms INTEGER NOT NULL,
            paused INTEGER NOT NULL DEFAULT 0
          );
        ''');
        await db.execute('''
          CREATE TABLE active_points (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id TEXT NOT NULL,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            ele REAL NOT NULL,
            time_ms INTEGER NOT NULL,
            accuracy_m REAL
          );
        ''');
        await db.execute('''
          CREATE TABLE sync_queue (
            client_id TEXT PRIMARY KEY,
            payload_json TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            created_at_ms INTEGER NOT NULL
          );
        ''');
      },
    );
    return _db!;
  }

  Future<void> startOrUpdateSession({
    required String clientId,
    required ActivityType activityType,
    required int startedAtMs,
    bool paused = false,
  }) async {
    final db = await database;
    await db.insert(
      'active_session',
      {
        'client_id': clientId,
        'activity_type': activityType.name,
        'started_at_ms': startedAtMs,
        'paused': paused ? 1 : 0,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<void> appendPoint(String clientId, RawTrackPoint pt) async {
    final db = await database;
    await db.insert('active_points', {
      'client_id': clientId,
      'lat': pt.lat,
      'lng': pt.lng,
      'ele': pt.ele,
      'time_ms': pt.timeMs,
      'accuracy_m': pt.accuracyM,
    });
  }

  Future<DraftRecordingSession?> loadUnfinishedSession() async {
    final db = await database;
    final sessions = await db.query('active_session', limit: 1);
    if (sessions.isEmpty) return null;
    final s = sessions.first;
    final cid = s['client_id'] as String;
    final ptsRows = await db.query(
      'active_points',
      where: 'client_id = ?',
      whereArgs: [cid],
      orderBy: 'time_ms ASC',
    );
    return DraftRecordingSession(
      clientId: cid,
      activityType: ActivityType.values.byName(s['activity_type'] as String),
      startedAtMs: s['started_at_ms'] as int,
      paused: (s['paused'] as int) == 1,
      points: ptsRows
          .map(
            (r) => RawTrackPoint(
              lat: (r['lat'] as num).toDouble(),
              lng: (r['lng'] as num).toDouble(),
              ele: (r['ele'] as num).toDouble(),
              timeMs: r['time_ms'] as int,
              accuracyM: (r['accuracy_m'] as num?)?.toDouble(),
            ),
          )
          .toList(),
    );
  }

  Future<void> clearActiveSession(String clientId) async {
    final db = await database;
    await db.delete('active_points', where: 'client_id = ?', whereArgs: [clientId]);
    await db.delete('active_session', where: 'client_id = ?', whereArgs: [clientId]);
  }

  Future<void> enqueueSync(String clientId, Map<String, dynamic> payload) async {
    final db = await database;
    await db.insert(
      'sync_queue',
      {
        'client_id': clientId,
        'payload_json': jsonEncode(payload),
        'attempts': 0,
        'created_at_ms': DateTime.now().millisecondsSinceEpoch,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<List<PendingUploadActivity>> pendingSyncs() async {
    final db = await database;
    final rows = await db.query('sync_queue', orderBy: 'created_at_ms ASC');
    return rows
        .map(
          (r) => PendingUploadActivity(
            clientId: r['client_id'] as String,
            payload: jsonDecode(r['payload_json'] as String) as Map<String, dynamic>,
            attempts: r['attempts'] as int,
          ),
        )
        .toList();
  }

  Future<void> markSynced(String clientId) async {
    final db = await database;
    await db.delete('sync_queue', where: 'client_id = ?', whereArgs: [clientId]);
  }

  Future<void> recordSyncFailure(String clientId, String error) async {
    final db = await database;
    await db.rawUpdate(
      'UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE client_id = ?',
      [error, clientId],
    );
  }
}
