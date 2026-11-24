package com.stride.tracker.lite

import com.stride.tracker.lite.core.LitePoint
import com.stride.tracker.lite.core.TrackProcessorLite
import com.stride.tracker.lite.storage.LiteCacheEvictor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LiteCoreTest {
    @Test
    fun geodesicDistanceAndOutlierFilterAreAccurate() {
        val base = 1700000000000L
        val pts = listOf(
            LitePoint(12.9760, 77.5920, 920.0, base, 5.0),
            LitePoint(12.9770, 77.5920, 924.0, base + 30_000, 5.0),
            // Poor accuracy point must be dropped
            LitePoint(12.9999, 77.5999, 999.0, base + 40_000, 120.0),
            // Teleport speed spike (> 12.5 m/s) must be dropped
            LitePoint(13.1000, 77.7000, 950.0, base + 45_000, 5.0),
            LitePoint(12.9780, 77.5920, 925.0, base + 60_000, 5.0),
        )
        val res = TrackProcessorLite.process(pts, activityType = "run")
        assertTrue("Expected ~222m, got ${res.distanceM}", res.distanceM in 210.0..235.0)
        assertEquals(60, res.elapsedTimeS)
        assertTrue(res.elevationGainM >= 4.0)
    }

    @Test
    fun polylineDecoderAndGpxParserWork() {
        val decoded = TrackProcessorLite.decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")
        assertEquals(3, decoded.size)
        assertEquals(38.5, decoded[0].first, 0.01)

        val gpx = """
            <gpx><trk><trkseg>
              <trkpt lat="12.9762" lon="77.5929"><ele>920</ele><time>2026-11-24T06:00:00Z</time></trkpt>
              <trkpt lat="12.9780" lon="77.5940"><ele>925</ele><time>2026-11-24T06:01:00Z</time></trkpt>
            </trkseg></trk></gpx>
        """.trimIndent()
        val parsed = TrackProcessorLite.parseGpxPoints(gpx)
        assertEquals(2, parsed.size)
        assertTrue(TrackProcessorLite.process(parsed, "run").distanceM > 200.0)
    }

    @Test
    fun cacheEvictorEnforcesStrictByteCapLruFirst() {
        val entries = listOf(
            LiteCacheEvictor.Entry("old-feed", 600_000L, 100L),
            LiteCacheEvictor.Entry("mid-seg", 700_000L, 200L),
            LiteCacheEvictor.Entry("fresh-me", 800_000L, 300L),
        )
        val cap = 1_500_000L
        val victims = LiteCacheEvictor.keysToEvict(entries, cap)
        assertEquals(listOf("old-feed"), victims)
        val remainingBytes = entries.filter { it.key !in victims }.sumOf { it.sizeBytes }
        assertTrue(remainingBytes <= cap)
    }
}
