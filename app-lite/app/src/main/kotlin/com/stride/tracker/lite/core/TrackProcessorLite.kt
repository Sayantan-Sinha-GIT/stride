package com.stride.tracker.lite.core

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.*

data class GpsPoint(
    val lat: Double,
    val lng: Double,
    val ele: Double?,
    val timeMs: Long,
    val accuracyM: Double? = null
)

data class SplitKmLite(
    val kmIndex: Int,
    val distanceM: Double,
    val elapsedTimeS: Int,
    val paceSecPerKm: Int
)

data class ProcessedSummary(
    val points: List<GpsPoint>,
    val distanceM: Double,
    val elapsedTimeS: Int,
    val movingTimeS: Int,
    val elevationGainM: Double,
    val elevationLossM: Double,
    val encodedPolyline: String,
    val splits: List<SplitKmLite>
)

object TrackProcessorLite {
    private const val EARTH_RADIUS_M = 6371000.0

    fun haversineMeters(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)
        val a = sin(dLat / 2).pow(2) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLng / 2).pow(2)
        return EARTH_RADIUS_M * 2 * atan2(sqrt(a), sqrt(max(0.0, 1.0 - a)))
    }

    fun filterPoints(raw: List<GpsPoint>, sport: String): List<GpsPoint> {
        val maxAccuracy = if (sport == "ride") 50.0 else 35.0
        val maxSpeedMps = if (sport == "ride") 38.0 else 12.5
        val kept = mutableListOf<GpsPoint>()
        for (pt in raw) {
            if (pt.accuracyM != null && pt.accuracyM > maxAccuracy) continue
            val prev = kept.lastOrNull()
            if (prev != null) {
                if (pt.timeMs <= prev.timeMs) continue
                val dt = (pt.timeMs - prev.timeMs) / 1000.0
                val dist = haversineMeters(prev.lat, prev.lng, pt.lat, pt.lng)
                if (dt > 0 && dist / dt > maxSpeedMps && dist > 60.0) continue
            }
            kept.add(pt)
        }
        return kept
    }

    fun summarize(raw: List<GpsPoint>, sport: String): ProcessedSummary {
        val pts = filterPoints(raw, sport)
        if (pts.size < 2) {
            return ProcessedSummary(
                points = pts,
                distanceM = 0.0,
                elapsedTimeS = 0,
                movingTimeS = 0,
                elevationGainM = 0.0,
                elevationLossM = 0.0,
                encodedPolyline = encodePolyline(pts),
                splits = emptyList()
            )
        }

        var distM = 0.0
        var movingS = 0.0
        val eles = pts.mapNotNull { it.ele }
        var gainM = 0.0
        var lossM = 0.0
        if (eles.size >= 3) {
            val smoothed = eles.indices.map { i ->
                val window = listOfNotNull(eles.getOrNull(i - 1), eles[i], eles.getOrNull(i + 1)).sorted()
                window[window.size / 2]
            }
            var anchor = smoothed.first()
            for (e in smoothed.drop(1)) {
                val delta = e - anchor
                if (delta >= 3.0) {
                    gainM += delta
                    anchor = e
                } else if (delta <= -3.0) {
                    lossM += -delta
                    anchor = e
                }
            }
        }

        val splits = mutableListOf<SplitKmLite>()
        var splitStartDist = 0.0
        var splitStartTimeMs = pts.first().timeMs
        var nextKmMark = 1000.0

        for (i in 1 until pts.size) {
            val prev = pts[i - 1]
            val cur = pts[i]
            val d = haversineMeters(prev.lat, prev.lng, cur.lat, cur.lng)
            val dt = (cur.timeMs - prev.timeMs) / 1000.0
            distM += d
            if (dt > 0 && dt <= 20.0 && (d / dt) >= 0.45) {
                movingS += dt
            }
            while (distM >= nextKmMark) {
                val segDist = 1000.0
                val segSec = ((cur.timeMs - splitStartTimeMs) / 1000.0).roundToInt().coerceAtLeast(1)
                splits.add(SplitKmLite(splits.size + 1, segDist, segSec, segSec))
                splitStartDist += 1000.0
                splitStartTimeMs = cur.timeMs
                nextKmMark += 1000.0
            }
        }
        val tailDist = distM - splitStartDist
        if (tailDist >= 50.0) {
            val segSec = ((pts.last().timeMs - splitStartTimeMs) / 1000.0).roundToInt().coerceAtLeast(1)
            val pace = (segSec / (tailDist / 1000.0)).roundToInt().coerceAtLeast(60)
            splits.add(SplitKmLite(splits.size + 1, tailDist, segSec, pace))
        }

        val elapsedS = ((pts.last().timeMs - pts.first().timeMs) / 1000.0).roundToInt().coerceAtLeast(1)
        val finalMoving = movingS.roundToInt().coerceIn(if (distM > 10) 1 else 0, elapsedS)
        return ProcessedSummary(
            points = pts,
            distanceM = distM,
            elapsedTimeS = elapsedS,
            movingTimeS = finalMoving,
            elevationGainM = gainM,
            elevationLossM = lossM,
            encodedPolyline = encodePolyline(pts),
            splits = splits
        )
    }

    fun encodePolyline(points: List<GpsPoint>): String {
        val out = StringBuilder()
        var lastLat = 0
        var lastLng = 0
        for (p in points) {
            val latE5 = (p.lat * 1e5).roundToInt()
            val lngE5 = (p.lng * 1e5).roundToInt()
            encodeSigned(latE5 - lastLat, out)
            encodeSigned(lngE5 - lastLng, out)
            lastLat = latE5
            lastLng = lngE5
        }
        return out.toString()
    }

    private fun encodeSigned(value: Int, out: StringBuilder) {
        var v = if (value < 0) (value shl 1).inv() else (value shl 1)
        while (v >= 0x20) {
            out.append(((0x20 or (v and 0x1f)) + 63).toChar())
            v = v shr 5
        }
        out.append((v + 63).toChar())
    }

    fun decodePolyline(encoded: String): List<GpsPoint> {
        if (encoded.isEmpty()) return emptyList()
        val pts = mutableListOf<GpsPoint>()
        var index = 0
        var lat = 0
        var lng = 0
        while (index < encoded.length) {
            var shift = 0
            var result = 0
            var b: Int
            do {
                if (index >= encoded.length) break
                b = encoded[index++].code - 63
                result = result or ((b and 0x1f) shl shift)
                shift += 5
            } while (b >= 0x20)
            lat += if ((result and 1) != 0) (result shr 1).inv() else (result shr 1)

            shift = 0
            result = 0
            do {
                if (index >= encoded.length) break
                b = encoded[index++].code - 63
                result = result or ((b and 0x1f) shl shift)
                shift += 5
            } while (b >= 0x20)
            lng += if ((result and 1) != 0) (result shr 1).inv() else (result shr 1)
            pts.add(GpsPoint(lat / 1e5, lng / 1e5, null, 0L))
        }
        return pts
    }

    fun toGpxXml(title: String, sport: String, points: List<GpsPoint>): String {
        val iso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }
        val escapedTitle = title.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        val sb = StringBuilder()
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
        sb.append("<gpx version=\"1.1\" creator=\"Stride Lite 2.0\">\n")
        sb.append("  <trk><name>$escapedTitle</name><type>$sport</type><trkseg>\n")
        for (p in points) {
            sb.append("    <trkpt lat=\"${p.lat}\" lon=\"${p.lng}\">")
            if (p.ele != null) sb.append("<ele>${p.ele}</ele>")
            if (p.timeMs > 0) sb.append("<time>${iso.format(Date(p.timeMs))}</time>")
            sb.append("</trkpt>\n")
        }
        sb.append("  </trkseg></trk>\n</gpx>")
        return sb.toString()
    }
}
