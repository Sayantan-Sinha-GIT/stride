package com.stride.tracker.lite.core

import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import kotlin.math.*

data class LitePoint(
    val lat: Double,
    val lng: Double,
    val ele: Double = 0.0,
    val timeMs: Long,
    val accuracyM: Double? = null,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("lat", lat)
        put("lng", lng)
        put("ele", ele)
        put("timeMs", timeMs)
        if (accuracyM != null) put("accuracyM", accuracyM)
    }
}

data class ProcessedMetrics(
    val distanceM: Double,
    val movingTimeS: Int,
    val elapsedTimeS: Int,
    val elevationGainM: Double,
    val avgSpeedMps: Double,
    val calories: Int,
)

object TrackProcessorLite {
    private const val EARTH_RADIUS_M = 6371000.0

    fun haversineMeters(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)
        val rLat1 = Math.toRadians(lat1)
        val rLat2 = Math.toRadians(lat2)
        val sinDLat = sin(dLat / 2.0)
        val sinDLng = sin(dLng / 2.0)
        val a = sinDLat * sinDLat + cos(rLat1) * cos(rLat2) * sinDLng * sinDLng
        val c = 2.0 * atan2(sqrt(a), sqrt(max(0.0, 1.0 - a)))
        return EARTH_RADIUS_M * c
    }

    fun process(raw: List<LitePoint>, activityType: String = "run", weightKg: Double = 70.0): ProcessedMetrics {
        if (raw.size < 2) {
            return ProcessedMetrics(0.0, 0, 0, 0.0, 0.0, 0)
        }
        val maxAccuracy = if (activityType == "ride") 50.0 else 35.0
        val maxSpeedMps = when (activityType) {
            "walk", "hike" -> 6.5
            "run" -> 12.5
            "ride" -> 35.0
            else -> 12.5
        }
        val movingMinSpeed = when (activityType) {
            "walk", "hike" -> 0.4
            "run" -> 0.7
            "ride" -> 1.1
            else -> 0.7
        }

        val sorted = raw.sortedBy { it.timeMs }
        val clean = mutableListOf<LitePoint>()
        for (pt in sorted) {
            val acc = pt.accuracyM
            if (acc != null && acc > maxAccuracy) continue
            if (clean.isEmpty()) {
                clean.add(pt)
                continue
            }
            val prev = clean.last()
            val dtS = (pt.timeMs - prev.timeMs) / 1000.0
            if (dtS <= 0.0) continue
            val d = haversineMeters(prev.lat, prev.lng, pt.lat, pt.lng)
            if (d / dtS > maxSpeedMps) continue
            clean.add(pt)
        }

        if (clean.size < 2) {
            return ProcessedMetrics(0.0, 0, 0, 0.0, 0.0, 0)
        }

        var distM = 0.0
        var movingS = 0.0
        var elevGain = 0.0
        var elevCursor = clean.first().ele
        for (i in 1 until clean.size) {
            val a = clean[i - 1]
            val b = clean[i]
            val d = haversineMeters(a.lat, a.lng, b.lat, b.lng)
            val dtS = max(0.001, (b.timeMs - a.timeMs) / 1000.0)
            distM += d
            if (d / dtS >= movingMinSpeed) {
                movingS += dtS
            }
            val dEle = b.ele - elevCursor
            if (dEle >= 3.0) {
                elevGain += dEle
                elevCursor = b.ele
            } else if (dEle <= -3.0) {
                elevCursor = b.ele
            }
        }

        val elapsedS = max(1, ((clean.last().timeMs - clean.first().timeMs) / 1000L).toInt())
        val finalMovingS = max(if (distM > 5) 1 else 0, movingS.roundToInt())
        val avgSpeed = if (finalMovingS > 0) distM / finalMovingS else 0.0
        val met = when (activityType) {
            "walk" -> 3.8
            "hike" -> 6.0
            "ride" -> 8.0
            else -> 9.8
        }
        val calories = max(0, ((met * weightKg * (finalMovingS / 3600.0)).roundToInt()))
        return ProcessedMetrics(distM, finalMovingS, elapsedS, elevGain, avgSpeed, calories)
    }

    fun decodePolyline(encoded: String): List<Pair<Double, Double>> {
        if (encoded.isEmpty()) return emptyList()
        val out = ArrayList<Pair<Double, Double>>()
        var index = 0
        var lat = 0
        var lng = 0
        while (index < encoded.length) {
            var b: Int
            var shift = 0
            var result = 0
            do {
                b = encoded[index++].code - 63
                result = result or ((b and 0x1f) shl shift)
                shift += 5
            } while (b >= 0x20 && index < encoded.length)
            lat += if ((result and 1) != 0) (result shr 1).inv() else (result shr 1)

            shift = 0
            result = 0
            while (index < encoded.length) {
                b = encoded[index++].code - 63
                result = result or ((b and 0x1f) shl shift)
                shift += 5
                if (b < 0x20) break
            }
            lng += if ((result and 1) != 0) (result shr 1).inv() else (result shr 1)
            out.add(lat / 1e5 to lng / 1e5)
        }
        return out
    }

    fun parseGpxPoints(gpxXml: String): List<LitePoint> {
        val trkptRegex = Regex("<trkpt\\s+[^>]*lat=\"([^\"]+)\"[^>]*lon=\"([^\"]+)\"[^>]*>([\\s\\S]*?)</trkpt>", RegexOption.IGNORE_CASE)
        val eleRegex = Regex("<ele>([^<]+)</ele>", RegexOption.IGNORE_CASE)
        val timeRegex = Regex("<time>([^<]+)</time>", RegexOption.IGNORE_CASE)
        val isoFormats = listOf("yyyy-MM-dd'T'HH:mm:ss'Z'", "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
        val now = System.currentTimeMillis()
        val points = mutableListOf<LitePoint>()

        trkptRegex.findAll(gpxXml).forEachIndexed { idx, match ->
            val lat = match.groupValues[1].toDoubleOrNull() ?: return@forEachIndexed
            val lng = match.groupValues[2].toDoubleOrNull() ?: return@forEachIndexed
            val inner = match.groupValues[3]
            val ele = eleRegex.find(inner)?.groupValues?.get(1)?.toDoubleOrNull() ?: 0.0
            val timeText = timeRegex.find(inner)?.groupValues?.get(1)?.trim()
            var ts = now + idx * 1000L
            if (!timeText.isNullOrEmpty()) {
                for (fmt in isoFormats) {
                    try {
                        val parser = SimpleDateFormat(fmt, Locale.US).apply {
                            timeZone = TimeZone.getTimeZone("UTC")
                        }
                        val parsed = parser.parse(timeText)
                        if (parsed != null) {
                            ts = parsed.time
                            break
                        }
                    } catch (_: Throwable) {}
                }
            }
            points.add(LitePoint(lat = lat, lng = lng, ele = ele, timeMs = ts, accuracyM = 5.0))
        }
        return points
    }

    fun formatDuration(seconds: Int): String {
        val s = max(0, seconds)
        val h = s / 3600
        val m = (s % 3600) / 60
        val sec = s % 60
        return if (h > 0) String.format(Locale.US, "%d:%02d:%02d", h, m, sec)
        else String.format(Locale.US, "%02d:%02d", m, sec)
    }

    fun formatPaceOrSpeed(activityType: String, speedMps: Double, units: String): String {
        if (speedMps <= 0.05) return "--"
        val imperial = units == "imperial"
        return if (activityType == "ride") {
            val v = if (imperial) speedMps * 2.23694 else speedMps * 3.6
            String.format(Locale.US, "%.1f %s", v, if (imperial) "mph" else "km/h")
        } else {
            val unitMeters = if (imperial) 1609.344 else 1000.0
            val secPerUnit = (unitMeters / speedMps).roundToInt()
            val min = secPerUnit / 60
            val sec = secPerUnit % 60
            String.format(Locale.US, "%d:%02d %s", min, sec, if (imperial) "/mi" else "/km")
        }
    }

    fun formatDistance(meters: Double, units: String): String {
        return if (units == "imperial") {
            String.format(Locale.US, "%.2f mi", meters / 1609.344)
        } else {
            String.format(Locale.US, "%.2f km", meters / 1000.0)
        }
    }
}
