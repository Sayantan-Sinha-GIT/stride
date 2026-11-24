import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../maps/map_config.dart';

class StrideApiClient {
  final Dio _dio;
  final FlutterSecureStorage _storage;

  static const _kAccessKey = 'stride_access_token';
  static const _kRefreshKey = 'stride_refresh_token';
  static const _kBaseUrlKey = 'stride_api_base_url';

  StrideApiClient({
    String baseUrl = const String.fromEnvironment(
      'STRIDE_API_URL',
      defaultValue: 'http://10.0.2.2:8787',
    ),
    FlutterSecureStorage? storage,
  })  : _dio = Dio(BaseOptions(baseUrl: baseUrl, connectTimeout: const Duration(seconds: 12))),
        _storage = storage ?? const FlutterSecureStorage() {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final customUrl = await _storage.read(key: _kBaseUrlKey);
          if (customUrl != null && customUrl.isNotEmpty) {
            options.baseUrl = customUrl;
          }
          final token = await _storage.read(key: _kAccessKey);
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (err, handler) async {
          if (err.response?.statusCode == 401 && !err.requestOptions.path.contains('/auth/')) {
            final refreshed = await _tryRefresh();
            if (refreshed) {
              final token = await _storage.read(key: _kAccessKey);
              err.requestOptions.headers['Authorization'] = 'Bearer $token';
              final retry = await _dio.fetch(err.requestOptions);
              return handler.resolve(retry);
            }
          }
          handler.next(err);
        },
      ),
    );
  }

  String get currentBaseUrl => _dio.options.baseUrl;

  Future<String> loadConfiguredBaseUrl() async {
    return (await _storage.read(key: _kBaseUrlKey)) ?? _dio.options.baseUrl;
  }

  Future<void> setConfiguredBaseUrl(String url) async {
    final cleaned = url.trim().replaceAll(RegExp(r'/*$'), '');
    if (cleaned.isEmpty) {
      await _storage.delete(key: _kBaseUrlKey);
    } else {
      _dio.options.baseUrl = cleaned;
      await _storage.write(key: _kBaseUrlKey, value: cleaned);
    }
  }

  Future<bool> hasSession() async {
    final token = await _storage.read(key: _kAccessKey);
    return token != null && token.isNotEmpty;
  }

  Future<bool> _tryRefresh() async {
    final refresh = await _storage.read(key: _kRefreshKey);
    if (refresh == null || refresh.isEmpty) return false;
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/v1/auth/refresh',
        data: {'refreshToken': refresh},
      );
      final data = res.data;
      if (data == null) return false;
      await _storage.write(key: _kAccessKey, value: data['accessToken'] as String);
      await _storage.write(key: _kRefreshKey, value: data['refreshToken'] as String);
      return true;
    } catch (_) {
      await clearSession();
      return false;
    }
  }

  Future<void> saveTokens(String access, String refresh) async {
    await _storage.write(key: _kAccessKey, value: access);
    await _storage.write(key: _kRefreshKey, value: refresh);
  }

  Future<void> clearSession() async {
    await _storage.delete(key: _kAccessKey);
    await _storage.delete(key: _kRefreshKey);
  }

  Future<Map<String, dynamic>> loginWithEmail(String email, String password) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/auth/login',
      data: {'email': email, 'password': password, 'deviceName': 'Stride Flutter'},
    );
    final data = res.data!;
    await saveTokens(data['accessToken'] as String, data['refreshToken'] as String);
    return data;
  }

  Future<Map<String, dynamic>> signup({
    required String email,
    required String password,
    required String displayName,
    required String handle,
    String language = 'en',
  }) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/auth/signup',
      data: {
        'email': email,
        'password': password,
        'displayName': displayName,
        'handle': handle,
        'language': language,
      },
    );
    return res.data ?? {};
  }

  Future<void> requestPasswordReset(String email) async {
    await _dio.post<Map<String, dynamic>>(
      '/v1/auth/forgot-password',
      data: {'email': email},
    );
  }

  Future<String?> fetchGoogleWebClientId() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/v1/auth/google/config');
      return res.data?['webClientId'] as String?;
    } catch (_) {
      return null;
    }
  }

  Future<Map<String, dynamic>> loginWithGoogleIdToken(String idToken) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/auth/google/token',
      data: {'idToken': idToken, 'deviceName': 'Stride Mobile'},
    );
    final data = res.data!;
    await saveTokens(data['accessToken'] as String, data['refreshToken'] as String);
    return data;
  }

  Future<void> registerDeviceToken(String fcmToken, String platform) async {
    await _dio.post('/v1/me/devices', data: {
      'fcmToken': fcmToken,
      'platform': platform,
      'deviceLabel': 'Stride Mobile',
    });
  }

  Future<MapConfig> fetchMapConfig() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/v1/maps/config');
      return MapConfig.fromJson(res.data ?? {});
    } catch (_) {
      return MapConfig.fallback;
    }
  }

  Future<Map<String, dynamic>> uploadActivityIdempotent(
    String clientId,
    Map<String, dynamic> payload,
  ) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/activities',
      data: payload,
      options: Options(headers: {'Idempotency-Key': clientId}),
    );
    return res.data ?? {};
  }

  Future<Map<String, dynamic>> importGpxXml({
    required String gpxXml,
    String? title,
    String activityType = 'run',
    String visibility = 'followers',
  }) async {
    final formData = FormData.fromMap({
      'gpx': gpxXml,
      if (title != null && title.isNotEmpty) 'title': title,
      'activityType': activityType,
      'visibility': visibility,
    });
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/activities/import-gpx',
      data: formData,
    );
    return res.data ?? {};
  }

  Future<Map<String, dynamic>> createManualActivity({
    required String clientId,
    required String title,
    required String activityType,
    required int durationS,
    required double distanceM,
    required double elevationGainM,
    String visibility = 'followers',
  }) async {
    return uploadActivityIdempotent(clientId, {
      'clientId': clientId,
      'title': title,
      'activityType': activityType,
      'source': 'manual',
      'visibility': visibility,
      'startedAt': DateTime.now().toUtc().toIso8601String(),
      'durationS': durationS,
      'distanceM': distanceM,
      'elevationGainM': elevationGainM,
    });
  }

  Future<List<dynamic>> fetchFeed({String scope = 'following'}) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/v1/activities/feed',
      queryParameters: {'scope': scope, 'limit': 25},
    );
    return (res.data?['items'] as List<dynamic>?) ?? [];
  }

  Future<Map<String, dynamic>> fetchActivityDetail(String id) async {
    final res = await _dio.get<Map<String, dynamic>>('/v1/activities/$id');
    return res.data ?? {};
  }

  Future<String> fetchActivityGpx(String id) async {
    final res = await _dio.get<String>(
      '/v1/activities/$id/gpx',
      options: Options(responseType: ResponseType.plain),
    );
    return res.data ?? '';
  }

  Future<Map<String, dynamic>> toggleKudos(String activityId, {required bool liked}) async {
    final res = liked
        ? await _dio.delete<Map<String, dynamic>>('/v1/activities/$activityId/kudos')
        : await _dio.post<Map<String, dynamic>>('/v1/activities/$activityId/kudos');
    return res.data ?? {};
  }

  Future<Map<String, dynamic>> addComment(String activityId, String body) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/activities/$activityId/comments',
      data: {'body': body},
    );
    return res.data ?? {};
  }

  Future<void> updateActivityVisibility(String id, String visibility) async {
    await _dio.patch<Map<String, dynamic>>(
      '/v1/activities/$id',
      data: {'visibility': visibility},
    );
  }

  Future<void> deleteActivity(String id) async {
    await _dio.delete<Map<String, dynamic>>('/v1/activities/$id');
  }

  Future<List<dynamic>> fetchSegments({String? activityType}) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/v1/segments',
      queryParameters: {
        if (activityType != null && activityType.isNotEmpty) 'activityType': activityType,
      },
    );
    return (res.data?['segments'] as List<dynamic>?) ?? [];
  }

  Future<Map<String, dynamic>> fetchSegmentDetail(String id) async {
    final res = await _dio.get<Map<String, dynamic>>('/v1/segments/$id');
    return res.data ?? {};
  }

  Future<List<dynamic>> fetchSegmentLeaderboard(String id, {String range = 'all'}) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/v1/segments/$id/leaderboard',
      queryParameters: {'range': range},
    );
    return (res.data?['entries'] as List<dynamic>?) ?? [];
  }

  Future<Map<String, dynamic>> createSegment({
    required String activityId,
    required String name,
    required int startIndex,
    required int endIndex,
  }) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/segments',
      data: {
        'activityId': activityId,
        'name': name,
        'startIndex': startIndex,
        'endIndex': endIndex,
      },
    );
    return res.data ?? {};
  }

  Future<void> flagSegmentEffort(String effortId, String reason) async {
    await _dio.post<Map<String, dynamic>>(
      '/v1/segments/efforts/$effortId/flag',
      data: {'reason': reason, 'requestReview': true},
    );
  }

  Future<Map<String, dynamic>> fetchNearbyRoutes({
    double lat = 12.9762,
    double lng = 77.5929,
    double radiusKm = 50,
  }) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/v1/routes/nearby',
      queryParameters: {'lat': lat, 'lng': lng, 'radiusKm': radiusKm},
    );
    return res.data ?? {};
  }

  Future<void> saveRoute({
    required String name,
    required String activityType,
    required double distanceM,
    required double elevationGainM,
    required String encodedPolyline,
  }) async {
    await _dio.post<Map<String, dynamic>>(
      '/v1/routes/saved',
      data: {
        'name': name,
        'activityType': activityType,
        'distanceM': distanceM,
        'elevationGainM': elevationGainM,
        'encodedPolyline': encodedPolyline,
      },
    );
  }

  Future<List<dynamic>> fetchClubs() async {
    final res = await _dio.get<Map<String, dynamic>>('/v1/clubs');
    return (res.data?['clubs'] as List<dynamic>?) ?? [];
  }

  Future<Map<String, dynamic>> fetchClubDetail(String slugOrId) async {
    final res = await _dio.get<Map<String, dynamic>>('/v1/clubs/$slugOrId');
    return res.data ?? {};
  }

  Future<void> toggleClubMembership(String clubId, {required bool joined}) async {
    if (joined) {
      await _dio.delete<Map<String, dynamic>>('/v1/clubs/$clubId/leave');
    } else {
      await _dio.post<Map<String, dynamic>>('/v1/clubs/$clubId/join');
    }
  }

  Future<void> rsvpEvent(String eventId, {required bool going}) async {
    await _dio.post<Map<String, dynamic>>(
      '/v1/events/$eventId/rsvp',
      data: {'going': going},
    );
  }

  Future<List<dynamic>> fetchChallenges() async {
    final res = await _dio.get<Map<String, dynamic>>('/v1/challenges');
    return (res.data?['challenges'] as List<dynamic>?) ?? [];
  }

  Future<void> toggleChallengeMembership(String challengeId, {required bool joined}) async {
    if (joined) {
      await _dio.delete<Map<String, dynamic>>('/v1/challenges/$challengeId/leave');
    } else {
      await _dio.post<Map<String, dynamic>>('/v1/challenges/$challengeId/join');
    }
  }

  Future<Map<String, dynamic>> fetchDashboard() async {
    final res = await _dio.get<Map<String, dynamic>>('/v1/analytics/dashboard');
    return res.data ?? {};
  }

  Future<void> createGoal({required String period, required double targetMeters}) async {
    await _dio.post<Map<String, dynamic>>(
      '/v1/analytics/goals',
      data: {
        'period': period,
        'activityType': 'all',
        'metricType': 'distance_m',
        'targetValue': targetMeters,
      },
    );
  }

  Future<void> createGear({
    required String name,
    required String gearType,
    double initialDistanceM = 0,
  }) async {
    await _dio.post<Map<String, dynamic>>(
      '/v1/analytics/gear',
      data: {
        'name': name,
        'gearType': gearType,
        'initialDistanceM': initialDistanceM,
      },
    );
  }

  Future<Map<String, dynamic>> fetchMe() async {
    final res = await _dio.get<Map<String, dynamic>>('/v1/me');
    return res.data ?? {};
  }

  Future<void> updateSettings({
    String? theme,
    String? language,
    String? units,
    String? defaultVisibility,
  }) async {
    await _dio.patch<Map<String, dynamic>>(
      '/v1/me/settings',
      data: {
        if (theme != null) 'theme': theme,
        if (language != null) 'language': language,
        if (units != null) 'units': units,
        if (defaultVisibility != null) 'defaultVisibility': defaultVisibility,
      },
    );
  }

  Future<List<dynamic>> fetchPrivacyZones() async {
    final res = await _dio.get<Map<String, dynamic>>('/v1/me/privacy-zones');
    return (res.data?['privacyZones'] as List<dynamic>?) ?? [];
  }

  Future<void> createPrivacyZone({
    required String name,
    required double lat,
    required double lng,
    required int radiusMeters,
  }) async {
    await _dio.post<Map<String, dynamic>>(
      '/v1/me/privacy-zones',
      data: {
        'name': name,
        'lat': lat,
        'lng': lng,
        'radiusMeters': radiusMeters,
      },
    );
  }

  Future<void> deletePrivacyZone(String id) async {
    await _dio.delete<Map<String, dynamic>>('/v1/me/privacy-zones/$id');
  }

  Future<List<dynamic>> fetchNotifications() async {
    final res = await _dio.get<Map<String, dynamic>>('/v1/me/notifications');
    return (res.data?['notifications'] as List<dynamic>?) ?? [];
  }

  Future<void> markAllNotificationsRead() async {
    await _dio.post<Map<String, dynamic>>('/v1/me/notifications/read-all');
  }

  Future<List<dynamic>> fetchSessions() async {
    final res = await _dio.get<Map<String, dynamic>>('/v1/auth/sessions');
    return (res.data?['sessions'] as List<dynamic>?) ?? [];
  }

  Future<void> revokeSession(String id) async {
    await _dio.delete<Map<String, dynamic>>('/v1/auth/sessions/$id');
  }

  Future<Map<String, dynamic>> exportMyData() async {
    final res = await _dio.get<Map<String, dynamic>>('/v1/me/export');
    return res.data ?? {};
  }

  Future<void> deleteAccount() async {
    await _dio.delete<Map<String, dynamic>>('/v1/me');
    await clearSession();
  }
}
