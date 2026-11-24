import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart';
import 'package:path_provider/path_provider.dart';
import 'recording_db.dart';

/// Enforces strict image-memory and disk-cache caps so Stride never accumulates unbounded phone storage.
class AppCacheManager {
  static const int maxImageMemoryBytes = 15 * 1024 * 1024;
  static const int maxTempCacheBytes = 4 * 1024 * 1024;

  static void configureMemoryBounds() {
    try {
      final cache = PaintingBinding.instance.imageCache;
      cache.maximumSize = 50;
      cache.maximumSizeBytes = maxImageMemoryBytes;
    } catch (_) {
      // Headless unit tests without active binding ignore gracefully.
    }
  }

  static Future<int> _dirBytes(Directory dir) async {
    if (!await dir.exists()) return 0;
    var total = 0;
    await for (final entity in dir.list(recursive: true, followLinks: false)) {
      if (entity is File) {
        try {
          total += await entity.length();
        } catch (_) {}
      }
    }
    return total;
  }

  static Future<int> totalUsageBytes() async {
    if (kIsWeb) return 0;
    var total = 0;
    try {
      final tmp = await getTemporaryDirectory();
      total += await _dirBytes(tmp);
    } catch (_) {}
    total += await RecordingDb().databaseSizeBytes();
    return total;
  }

  static Future<int> enforceTempCap() async {
    if (kIsWeb) return 0;
    try {
      final tmp = await getTemporaryDirectory();
      final bytes = await _dirBytes(tmp);
      if (bytes <= maxTempCacheBytes) return bytes;
      await purgeTempCache();
      return await _dirBytes(tmp);
    } catch (_) {
      return 0;
    }
  }

  static Future<int> purgeTempCache() async {
    try {
      PaintingBinding.instance.imageCache.clear();
      PaintingBinding.instance.imageCache.clearLiveImages();
    } catch (_) {}
    if (kIsWeb) return 0;
    var freed = 0;
    try {
      final tmp = await getTemporaryDirectory();
      if (await tmp.exists()) {
        await for (final entity in tmp.list(recursive: false, followLinks: false)) {
          try {
            if (entity is File) {
              freed += await entity.length();
              await entity.delete();
            } else if (entity is Directory) {
              freed += await _dirBytes(entity);
              await entity.delete(recursive: true);
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
    return freed;
  }
}
