class MapConfig {
  final String provider;
  final String lightStyleUrl;
  final String darkStyleUrl;

  const MapConfig({
    required this.provider,
    required this.lightStyleUrl,
    required this.darkStyleUrl,
  });

  static const MapConfig fallback = MapConfig(
    provider: 'openfreemap',
    lightStyleUrl: 'https://tiles.openfreemap.org/styles/positron',
    darkStyleUrl: 'https://tiles.openfreemap.org/styles/dark',
  );

  String styleForBrightness(bool isDark) => isDark ? darkStyleUrl : lightStyleUrl;

  factory MapConfig.fromJson(Map<String, dynamic> json) => MapConfig(
        provider: (json['provider'] as String?) ?? 'openfreemap',
        lightStyleUrl: (json['lightStyleUrl'] as String?) ?? fallback.lightStyleUrl,
        darkStyleUrl: (json['darkStyleUrl'] as String?) ?? fallback.darkStyleUrl,
      );
}
