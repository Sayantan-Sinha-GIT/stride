package com.stride.tracker.lite.core

import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt

object Formatters {
    private val avatarColors = intArrayOf(
        0xFFD1380E.toInt(),
        0xFF0F766E.toInt(),
        0xFF2563EB.toInt(),
        0xFF9333EA.toInt(),
        0xFFB45309.toInt(),
        0xFFBE185D.toInt()
    )

    fun avatarColor(seed: String): Int {
        val idx = abs(seed.hashCode()) % avatarColors.size
        return avatarColors[idx]
    }

    fun distance(meters: Double, units: String): String {
        if (units == "imperial") {
            val miles = meters / 1609.344
            return String.format(Locale.US, "%.2f mi", miles)
        }
        val km = meters / 1000.0
        return if (km >= 100.0) String.format(Locale.US, "%.0f km", km)
        else String.format(Locale.US, "%.2f km", km)
    }

    fun elevation(meters: Double, units: String): String {
        return if (units == "imperial") {
            "${(meters * 3.28084).roundToInt()} ft"
        } else {
            "${meters.roundToInt()} m"
        }
    }

    fun duration(seconds: Int): String {
        val safe = seconds.coerceAtLeast(0)
        val h = safe / 3600
        val m = (safe % 3600) / 60
        val s = safe % 60
        return if (h > 0) String.format(Locale.US, "%dh %02dm", h, m)
        else String.format(Locale.US, "%02d:%02d", m, s)
    }

    fun paceOrSpeed(distanceM: Double, movingTimeS: Int, sport: String, units: String): String {
        if (distanceM <= 2 || movingTimeS <= 0) return "--"
        if (sport == "ride") {
            val kph = (distanceM / 1000.0) / (movingTimeS / 3600.0)
            return if (units == "imperial") {
                String.format(Locale.US, "%.1f mph", kph * 0.621371)
            } else {
                String.format(Locale.US, "%.1f km/h", kph)
            }
        }
        val secPerUnit = if (units == "imperial") {
            (movingTimeS / (distanceM / 1609.344)).roundToInt()
        } else {
            (movingTimeS / (distanceM / 1000.0)).roundToInt()
        }
        val capped = secPerUnit.coerceIn(90, 3599)
        val unitSuffix = if (units == "imperial") "/mi" else "/km"
        return String.format(Locale.US, "%d:%02d %s", capped / 60, capped % 60, unitSuffix)
    }

    fun bytes(bytes: Long): String {
        if (bytes < 1024L) return "$bytes B"
        val kb = bytes / 1024.0
        if (kb < 1024.0) return String.format(Locale.US, "%.1f KB", kb)
        return String.format(Locale.US, "%.2f MB", kb / 1024.0)
    }

    fun sportLabel(sport: String, lang: String): String = when (sport.lowercase()) {
        "ride" -> LiteStrings[lang, "ride"]
        "walk" -> LiteStrings[lang, "walk"]
        "hike" -> LiteStrings[lang, "hike"]
        else -> LiteStrings[lang, "run"]
    }
}
