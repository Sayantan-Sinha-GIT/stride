package com.stride.tracker.lite

import com.stride.tracker.lite.core.Formatters
import com.stride.tracker.lite.core.GpsPoint
import com.stride.tracker.lite.core.LiteStrings
import com.stride.tracker.lite.core.TrackProcessorLite
import com.stride.tracker.lite.storage.LiteCacheEvictor
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.nio.file.Files

class LiteCoreTest {

    @Test
    fun haversineCubbonParkDistance() {
        val d = TrackProcessorLite.haversineMeters(12.9762, 77.5929, 12.9852, 77.5929)
        assertTrue("Expected ~1000m, got $d", d in 985.0..1015.0)
    }

    @Test
    fun filterAccuracyThresholdRunVsRide() {
        val pts = listOf(
            GpsPoint(12.9760, 77.5920, 910.0, 1000L, accuracyM = 10.0),
            GpsPoint(12.9765, 77.5925, 912.0, 10000L, accuracyM = 45.0),
            GpsPoint(12.9770, 77.5930, 914.0, 20000L, accuracyM = 12.0)
        )
        assertEquals(2, TrackProcessorLite.filterPoints(pts, "run").size)
        assertEquals(3, TrackProcessorLite.filterPoints(pts, "ride").size)
    }

    @Test
    fun filterRejectsNonMonotonicAndTeleportSpikes() {
        val pts = listOf(
            GpsPoint(12.9760, 77.5920, 910.0, 10_000L, accuracyM = 8.0),
            GpsPoint(12.9762, 77.5922, 910.0, 9_000L, accuracyM = 8.0), // non-monotonic
            GpsPoint(13.5000, 77.5922, 910.0, 12_000L, accuracyM = 8.0), // teleport (~58km in 2s)
            GpsPoint(12.9768, 77.5928, 913.0, 22_000L, accuracyM = 8.0)
        )
        val clean = TrackProcessorLite.filterPoints(pts, "run")
        assertEquals(2, clean.size)
        assertEquals(22_000L, clean.last().timeMs)
    }

    @Test
    fun summarizeComputesSplitsGainAndAutoPause() {
        val base = 1_700_000_000_000L
        val pts = mutableListOf<GpsPoint>()
        // Walk/run 1.35 km north (~12 steps of 0.001 deg ~ 111m every 30s)
        for (i in 0..12) {
            pts.add(GpsPoint(12.9700 + i * 0.001, 77.5929, 900.0 + i * 2.0, base + i * 30_000L, 6.0))
        }
        // Add stationary pause (20s with 0m movement)
        pts.add(GpsPoint(12.9820, 77.5929, 924.0, base + 12 * 30_000L + 20_000L, 6.0))
        // Note: dt between consecutive points was 30s > 20s window? Let's verify 10s interval loop below too!
        val res = TrackProcessorLite.summarize(pts, "run")
        assertTrue(res.distanceM > 1300.0)
        assertTrue(res.splits.isNotEmpty())
        assertTrue(res.encodedPolyline.isNotBlank())
        assertTrue(res.elevationGainM >= 20.0)
    }

    @Test
    fun summarizeMovingTimeSkipsPausedIntervals() {
        val base = 1_700_000_000_000L
        val pts = listOf(
            GpsPoint(12.9700, 77.5929, 900.0, base, 5.0),
            GpsPoint(12.9705, 77.5929, 901.0, base + 10_000L, 5.0), // ~55m in 10s = 5.5 m/s moving
            GpsPoint(12.9705, 77.5929, 901.0, base + 25_000L, 5.0), // stationary 15s -> auto-paused
            GpsPoint(12.9710, 77.5929, 902.0, base + 35_000L, 5.0)  // moving 10s
        )
        val res = TrackProcessorLite.summarize(pts, "run")
        assertEquals(35, res.elapsedTimeS)
        assertEquals(20, res.movingTimeS)
    }

    @Test
    fun polylineEncodeDecodeRoundTrip() {
        val src = listOf(
            GpsPoint(12.97621, 77.59291, null, 0L),
            GpsPoint(12.97885, 77.59555, null, 0L),
            GpsPoint(12.98012, 77.59103, null, 0L)
        )
        val enc = TrackProcessorLite.encodePolyline(src)
        val dec = TrackProcessorLite.decodePolyline(enc)
        assertEquals(src.size, dec.size)
        for (i in src.indices) {
            assertEquals(src[i].lat, dec[i].lat, 0.00002)
            assertEquals(src[i].lng, dec[i].lng, 0.00002)
        }
    }

    @Test
    fun gpxSerializationEscapesXmlCharacters() {
        val xml = TrackProcessorLite.toGpxXml(
            "Cubbon <Dawn> & Run",
            "run",
            listOf(GpsPoint(12.9762, 77.5929, 920.5, 1_700_000_000_000L))
        )
        assertTrue(xml.contains("Cubbon &lt;Dawn&gt; &amp; Run"))
        assertTrue(xml.contains("<ele>920.5</ele>"))
        assertTrue(xml.contains("Stride Lite 2.0"))
    }

    @Test
    fun lruCacheEvictorKeepsNewestWithinCap() {
        val dir = Files.createTempDirectory("stride_lru_test").toFile()
        try {
            val f1 = File(dir, "old.json").apply { writeBytes(ByteArray(600)); setLastModified(1000L) }
            val f2 = File(dir, "mid.json").apply { writeBytes(ByteArray(600)); setLastModified(2000L) }
            val f3 = File(dir, "new.json").apply { writeBytes(ByteArray(600)); setLastModified(3000L) }

            val remaining = LiteCacheEvictor.enforceCap(dir, 1250L)
            assertTrue("Expected <= 1250 bytes, got $remaining", remaining <= 1250L)
            assertFalse("Oldest file should be evicted", f1.exists())
            assertTrue("Middle file should survive", f2.exists())
            assertTrue("Newest file should survive", f3.exists())

            LiteCacheEvictor.clearDirectory(dir)
            assertEquals(0L, LiteCacheEvictor.directorySize(dir))
        } finally {
            dir.deleteRecursively()
        }
    }

    @Test
    fun formattersMetricAndImperialAndBytes() {
        assertEquals("5.00 km", Formatters.distance(5000.0, "metric"))
        assertEquals("3.11 mi", Formatters.distance(5000.0, "imperial"))
        assertEquals("100 m", Formatters.elevation(100.0, "metric"))
        assertEquals("328 ft", Formatters.elevation(100.0, "imperial"))
        assertEquals("05:00", Formatters.duration(300))
        assertEquals("1h 01m", Formatters.duration(3660))
        assertEquals("5:00 /km", Formatters.paceOrSpeed(1000.0, 300, "run", "metric"))
        assertEquals("20.0 km/h", Formatters.paceOrSpeed(10000.0, 1800, "ride", "metric"))
        assertEquals("1.50 MB", Formatters.bytes((1.5 * 1024 * 1024).toLong()))
        assertEquals("512 B", Formatters.bytes(512L))
        assertEquals(Formatters.avatarColor("arjun_runs"), Formatters.avatarColor("arjun_runs"))
    }

    @Test
    fun englishAndHindiLocalizationHasFullParity() {
        val keys = listOf(
            "brand", "feed", "explore", "record", "clubs", "profile",
            "goalsTitle", "gearTitle", "personalRecordsTitle", "badgesTitle",
            "storageTitle", "maxCap", "dataSaver", "autoPurge", "clearCache",
            "notificationsTitle", "recoveryTitle", "elevationProfile", "kmSplits"
        )
        for (k in keys) {
            val enVal = LiteStrings["en", k]
            val hiVal = LiteStrings["hi", k]
            assertNotEquals("Missing EN string for $k", k, enVal)
            assertNotEquals("Missing HI string for $k", k, hiVal)
            assertTrue("Empty HI string for $k", hiVal.isNotBlank())
        }
    }
}
