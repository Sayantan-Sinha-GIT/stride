import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../core/track_processor/track_processor.dart';
import '../theme/stride_theme.dart';

/// Decodes Google encoded polyline format (`1e5` precision) into lat/lng pairs.
List<({double lat, double lng})> decodePolylinePoints(String encoded) {
  if (encoded.isEmpty) return const [];
  final out = <({double lat, double lng})>[];
  int index = 0;
  int lat = 0;
  int lng = 0;

  while (index < encoded.length) {
    int b;
    int shift = 0;
    int result = 0;
    do {
      b = encoded.codeUnitAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && index < encoded.length);
    final dLat = (result & 1) != 0 ? ~(result >> 1) : (result >> 1);
    lat += dLat;

    shift = 0;
    result = 0;
    while (index < encoded.length) {
      b = encoded.codeUnitAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
      if (b < 0x20) break;
    }
    final dLng = (result & 1) != 0 ? ~(result >> 1) : (result >> 1);
    lng += dLng;

    out.add((lat: lat / 1e5, lng: lng / 1e5));
  }
  return out;
}

class RoutePolylinePreview extends StatelessWidget {
  final List<RawTrackPoint>? rawPoints;
  final String? encodedPolyline;
  final double height;
  final double? progressRatio;

  const RoutePolylinePreview({
    super.key,
    this.rawPoints,
    this.encodedPolyline,
    this.height = 140,
    this.progressRatio,
  });

  @override
  Widget build(BuildContext context) {
    final pts = rawPoints != null && rawPoints!.isNotEmpty
        ? rawPoints!.map((e) => (lat: e.lat, lng: e.lng)).toList()
        : decodePolylinePoints(encodedPolyline ?? '');

    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bgColor = isDark ? StrideTokens.darkElevated : const Color(0xFFECEAE3);

    return Container(
      height: height,
      width: double.infinity,
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDark
              ? Colors.white.withValues(alpha: 0.08)
              : Colors.black.withValues(alpha: 0.08),
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: pts.length < 2
          ? Center(
              child: Text(
                'No GPS geometry',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            )
          : CustomPaint(
              painter: _PolylinePainter(
                points: pts,
                accentColor: Theme.of(context).colorScheme.primary,
                gridColor: isDark
                    ? Colors.white.withValues(alpha: 0.05)
                    : Colors.black.withValues(alpha: 0.06),
                progressRatio: progressRatio,
              ),
            ),
    );
  }
}

class _PolylinePainter extends CustomPainter {
  final List<({double lat, double lng})> points;
  final Color accentColor;
  final Color gridColor;
  final double? progressRatio;

  _PolylinePainter({
    required this.points,
    required this.accentColor,
    required this.gridColor,
    this.progressRatio,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final gridPaint = Paint()
      ..color = gridColor
      ..strokeWidth = 1;
    const step = 28.0;
    for (double x = 0; x < size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), gridPaint);
    }
    for (double y = 0; y < size.height; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), gridPaint);
    }

    double minLat = points.first.lat;
    double maxLat = points.first.lat;
    double minLng = points.first.lng;
    double maxLng = points.first.lng;
    for (final p in points) {
      minLat = math.min(minLat, p.lat);
      maxLat = math.max(maxLat, p.lat);
      minLng = math.min(minLng, p.lng);
      maxLng = math.max(maxLng, p.lng);
    }

    final dLat = math.max(0.0004, maxLat - minLat);
    final dLng = math.max(0.0004, maxLng - minLng);
    const pad = 18.0;
    final drawW = math.max(1.0, size.width - pad * 2);
    final drawH = math.max(1.0, size.height - pad * 2);

    Offset toCanvas(({double lat, double lng}) p) {
      final nx = (p.lng - minLng) / dLng;
      final ny = (p.lat - minLat) / dLat;
      return Offset(pad + nx * drawW, size.height - pad - ny * drawH);
    }

    final path = Path();
    for (int i = 0; i < points.length; i++) {
      final pt = toCanvas(points[i]);
      if (i == 0) {
        path.moveTo(pt.dx, pt.dy);
      } else {
        path.lineTo(pt.dx, pt.dy);
      }
    }

    final glowPaint = Paint()
      ..color = accentColor.withValues(alpha: 0.28)
      ..strokeWidth = 8
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;
    canvas.drawPath(path, glowPaint);

    final strokePaint = Paint()
      ..color = accentColor
      ..strokeWidth = 3.2
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;
    canvas.drawPath(path, strokePaint);

    final startOffset = toCanvas(points.first);
    final endOffset = toCanvas(points.last);
    canvas.drawCircle(startOffset, 5, Paint()..color = StrideTokens.success);
    canvas.drawCircle(endOffset, 5, Paint()..color = accentColor);

    if (progressRatio != null) {
      final idx = ((points.length - 1) * progressRatio!.clamp(0.0, 1.0)).round();
      final marker = toCanvas(points[idx]);
      canvas.drawCircle(marker, 9, Paint()..color = Colors.white.withValues(alpha: 0.45));
      canvas.drawCircle(marker, 5.5, Paint()..color = StrideTokens.warning);
    }
  }

  @override
  bool shouldRepaint(covariant _PolylinePainter oldDelegate) {
    return oldDelegate.points != points ||
        oldDelegate.progressRatio != progressRatio ||
        oldDelegate.accentColor != accentColor;
  }
}

class ElevationProfileChart extends StatelessWidget {
  final List<double> elevations;
  final double height;
  final double? progressRatio;

  const ElevationProfileChart({
    super.key,
    required this.elevations,
    this.height = 120,
    this.progressRatio,
  });

  @override
  Widget build(BuildContext context) {
    if (elevations.length < 2) {
      return const SizedBox.shrink();
    }
    return SizedBox(
      height: height,
      width: double.infinity,
      child: CustomPaint(
        painter: _ElevationPainter(
          elevations: elevations,
          accentColor: Theme.of(context).colorScheme.primary,
          progressRatio: progressRatio,
        ),
      ),
    );
  }
}

class _ElevationPainter extends CustomPainter {
  final List<double> elevations;
  final Color accentColor;
  final double? progressRatio;

  _ElevationPainter({
    required this.elevations,
    required this.accentColor,
    this.progressRatio,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final minEle = elevations.reduce(math.min);
    final maxEle = elevations.reduce(math.max);
    final span = math.max(5.0, maxEle - minEle);

    final linePath = Path();
    final areaPath = Path();
    for (int i = 0; i < elevations.length; i++) {
      final x = (i / (elevations.length - 1)) * size.width;
      final norm = (elevations[i] - minEle) / span;
      final y = size.height - 12 - norm * (size.height - 24);
      if (i == 0) {
        linePath.moveTo(x, y);
        areaPath.moveTo(x, size.height);
        areaPath.lineTo(x, y);
      } else {
        linePath.lineTo(x, y);
        areaPath.lineTo(x, y);
      }
    }
    areaPath.lineTo(size.width, size.height);
    areaPath.close();

    canvas.drawPath(
      areaPath,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [accentColor.withValues(alpha: 0.35), accentColor.withValues(alpha: 0.02)],
        ).createShader(Rect.fromLTWH(0, 0, size.width, size.height)),
    );

    canvas.drawPath(
      linePath,
      Paint()
        ..color = accentColor
        ..strokeWidth = 2.4
        ..style = PaintingStyle.stroke,
    );

    if (progressRatio != null) {
      final x = progressRatio!.clamp(0.0, 1.0) * size.width;
      canvas.drawLine(
        Offset(x, 0),
        Offset(x, size.height),
        Paint()
          ..color = StrideTokens.warning
          ..strokeWidth = 1.8,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _ElevationPainter oldDelegate) {
    return oldDelegate.elevations != elevations || oldDelegate.progressRatio != progressRatio;
  }
}
