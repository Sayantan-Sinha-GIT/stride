package com.stride.tracker.lite.location

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Looper
import android.os.SystemClock
import com.stride.tracker.lite.core.GpsPoint
import com.stride.tracker.lite.core.ProcessedSummary
import com.stride.tracker.lite.core.TrackProcessorLite
import com.stride.tracker.lite.net.StrideLiteApi
import com.stride.tracker.lite.service.LiteTrackingService
import com.stride.tracker.lite.storage.ActiveDraft
import com.stride.tracker.lite.storage.LiteStorageGuardian
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

data class RecordingSnapshot(
    val active: Boolean = false,
    val paused: Boolean = false,
    val sport: String = "run",
    val clientId: String = "",
    val points: List<GpsPoint> = emptyList(),
    val summary: ProcessedSummary = TrackProcessorLite.summarize(emptyList(), "run"),
    val wallElapsedS: Int = 0
)

class LiteRecorder(
    private val context: Context,
    private val guardian: LiteStorageGuardian,
    private val api: StrideLiteApi
) {
    private val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    private var activeClientId: String? = null
    private var sport: String = "run"
    private var title: String = "Outdoor Session"
    private var startedAtMs: Long = 0L
    private var paused: Boolean = false
    private val points = mutableListOf<GpsPoint>()
    private var listener: ((RecordingSnapshot) -> Unit)? = null
    private var lastNotificationSec = -1L

    private val gpsListener = LocationListener { loc -> onLocation(loc) }

    fun setListener(cb: ((RecordingSnapshot) -> Unit)?) {
        listener = cb
        emit()
    }

    fun checkDraft(): ActiveDraft? = guardian.loadActiveDraft()

    fun discardDraft(clientId: String) {
        guardian.deleteDraft(clientId)
    }

    fun recoverDraft(draft: ActiveDraft) {
        activeClientId = draft.clientId
        sport = draft.activityType
        title = draft.title
        startedAtMs = draft.startedAtMs
        paused = draft.paused
        points.clear()
        points.addAll(draft.points)
        emit()
        if (!paused) startLocationUpdates()
    }

    fun currentSnapshot(): RecordingSnapshot {
        val summary = TrackProcessorLite.summarize(points.toList(), sport)
        val wallS = if (startedAtMs > 0L) ((System.currentTimeMillis() - startedAtMs) / 1000L).toInt().coerceAtLeast(0) else 0
        return RecordingSnapshot(
            active = activeClientId != null,
            paused = paused,
            sport = sport,
            clientId = activeClientId ?: "",
            points = summary.points,
            summary = summary,
            wallElapsedS = maxOf(wallS, summary.elapsedTimeS)
        )
    }

    @SuppressLint("MissingPermission")
    fun start(selectedSport: String, customTitle: String) {
        val cid = UUID.randomUUID().toString()
        activeClientId = cid
        sport = selectedSport
        title = customTitle.ifBlank { "Outdoor ${selectedSport.replaceFirstChar { it.uppercase() }}" }
        startedAtMs = System.currentTimeMillis()
        paused = false
        points.clear()
        guardian.saveSession(cid, sport, title, startedAtMs, paused = false)
        startForegroundService()
        startLocationUpdates()
        emit()
    }

    fun togglePause() {
        val cid = activeClientId ?: return
        paused = !paused
        guardian.saveSession(cid, sport, title, startedAtMs, paused)
        if (paused) {
            runCatching { locationManager.removeUpdates(gpsListener) }
        } else {
            startLocationUpdates()
        }
        emit()
    }

    @SuppressLint("MissingPermission")
    private fun startLocationUpdates() {
        runCatching {
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1500L, 1.5f, gpsListener, Looper.getMainLooper())
            }
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 3000L, 3f, gpsListener, Looper.getMainLooper())
            }
            locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER)?.let { loc ->
                val ageMs = (SystemClock.elapsedRealtimeNanos() - loc.elapsedRealtimeNanos) / 1_000_000L
                if (ageMs in 0..15000) onLocation(loc)
            }
        }
    }

    private fun onLocation(loc: Location) {
        val cid = activeClientId ?: return
        if (paused) return
        val maxAcc = if (sport == "ride") 55f else 40f
        if (loc.hasAccuracy() && loc.accuracy > maxAcc) return
        val pt = GpsPoint(
            lat = loc.latitude,
            lng = loc.longitude,
            ele = if (loc.hasAltitude()) loc.altitude else null,
            timeMs = System.currentTimeMillis(),
            accuracyM = if (loc.hasAccuracy()) loc.accuracy.toDouble() else null
        )
        val prev = points.lastOrNull()
        if (prev != null && pt.timeMs <= prev.timeMs + 250L) return
        points.add(pt)
        guardian.appendPoint(cid, pt)
        emit()

        val nowSec = System.currentTimeMillis() / 2000L
        if (nowSec != lastNotificationSec) {
            lastNotificationSec = nowSec
            startForegroundService()
        }
    }

    fun finishAndEnqueueOrSync(customTitle: String): Pair<Boolean, String?> {
        val cid = activeClientId ?: return false to null
        val summary = TrackProcessorLite.summarize(points.toList(), sport)
        val rawPts = if (summary.points.size >= 2) summary.points else points.toList()
        stopInternal()

        if (rawPts.size < 2) {
            guardian.deleteDraft(cid)
            emit()
            return false to null
        }

        val finalTitle = customTitle.ifBlank { title }
        val iso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }
        val ptsJson = JSONArray()
        for (p in rawPts) {
            ptsJson.put(
                JSONObject()
                    .put("lat", p.lat)
                    .put("lng", p.lng)
                    .put("ele", p.ele ?: JSONObject.NULL)
                    .put("time", p.timeMs)
                    .put("accuracyM", p.accuracyM ?: JSONObject.NULL)
            )
        }
        val payload = JSONObject()
            .put("clientId", cid)
            .put("title", finalTitle)
            .put("activityType", sport)
            .put("source", "recorded")
            .put("visibility", "followers")
            .put("startedAt", iso.format(Date(startedAtMs)))
            .put("durationS", summary.movingTimeS.coerceAtLeast(1))
            .put("distanceM", summary.distanceM)
            .put("elevationGainM", summary.elevationGainM)
            .put("points", ptsJson)

        return try {
            val res = api.uploadActivityRaw(cid, payload)
            guardian.deleteDraft(cid)
            val createdId = res.optJSONObject("activity")?.optString("id") ?: res.optString("id").takeIf { it.isNotBlank() }
            emit()
            true to createdId
        } catch (_: Throwable) {
            guardian.enqueueSync(cid, payload.toString())
            guardian.deleteDraft(cid)
            emit()
            false to null
        }
    }

    fun flushPendingQueue(): Int {
        var synced = 0
        for (row in guardian.listPendingSync()) {
            try {
                api.uploadActivityRaw(row.clientId, JSONObject(row.payloadJson))
                guardian.removePendingSync(row.clientId)
                synced++
            } catch (_: Throwable) {
                guardian.incrementSyncAttempt(row.clientId)
            }
        }
        return synced
    }

    private fun stopInternal() {
        runCatching { locationManager.removeUpdates(gpsListener) }
        activeClientId = null
        paused = false
        runCatching { context.stopService(Intent(context, LiteTrackingService::class.java)) }
    }

    private fun startForegroundService() {
        val snap = currentSnapshot()
        val intent = Intent(context, LiteTrackingService::class.java).apply {
            putExtra("distanceM", snap.summary.distanceM)
            putExtra("elapsedS", snap.wallElapsedS)
            putExtra("pts", snap.points.size)
        }
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
    }

    fun emit() {
        listener?.invoke(currentSnapshot())
    }
}
