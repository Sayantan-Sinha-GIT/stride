package com.stride.tracker.lite.location

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import com.stride.tracker.lite.core.LitePoint
import com.stride.tracker.lite.core.ProcessedMetrics
import com.stride.tracker.lite.core.SecurePrefs
import com.stride.tracker.lite.core.TrackProcessorLite
import com.stride.tracker.lite.net.StrideLiteApi
import com.stride.tracker.lite.service.LiteTrackingService
import com.stride.tracker.lite.storage.LiteDraftSession
import com.stride.tracker.lite.storage.LiteStorageGuardian
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import kotlin.math.max

enum class LitePhase { IDLE, RECORDING, PAUSED, AUTO_PAUSED }

data class RecorderUiState(
    val clientId: String? = null,
    val phase: LitePhase = LitePhase.IDLE,
    val activityType: String = "run",
    val autoPauseEnabled: Boolean = true,
    val simMode: Boolean = false,
    val points: List<LitePoint> = emptyList(),
    val metrics: ProcessedMetrics = ProcessedMetrics(0.0, 0, 0, 0.0, 0.0, 0),
    val lastSpeedMps: Double = 0.0,
    val pendingQueueCount: Int = 0,
)

class LiteRecorder(
    private val context: Context,
    private val prefs: SecurePrefs,
    private val guardian: LiteStorageGuardian,
    private val api: StrideLiteApi,
) {
    var state = RecorderUiState(pendingQueueCount = guardian.pendingSyncs().size)
        private set

    var onStateChanged: ((RecorderUiState) -> Unit)? = null

    private val mainHandler = Handler(Looper.getMainLooper())
    private var locationManager: LocationManager? = null
    private var listener: LocationListener? = null
    private var simRunnable: Runnable? = null
    private var simStep = 0

    private val simWaypoints = listOf(
        12.9762 to 77.5929,
        12.9792 to 77.5955,
        12.9788 to 77.5992,
        12.9746 to 77.6004,
        12.9718 to 77.5968,
        12.9756 to 77.5923,
    )

    fun setActivityType(type: String) {
        state = state.copy(activityType = type)
        notifyUi()
    }

    fun setAutoPause(enabled: Boolean) {
        state = state.copy(autoPauseEnabled = enabled)
        notifyUi()
    }

    fun setSimMode(enabled: Boolean) {
        state = state.copy(simMode = enabled)
        notifyUi()
    }

    fun checkUnfinishedDraft(): LiteDraftSession? = guardian.loadUnfinishedSession()

    fun recoverDraft(draft: LiteDraftSession) {
        val m = TrackProcessorLite.process(draft.points, draft.activityType)
        state = state.copy(
            clientId = draft.clientId,
            activityType = draft.activityType,
            phase = LitePhase.PAUSED,
            points = draft.points,
            metrics = m,
            pendingQueueCount = guardian.pendingSyncs().size,
        )
        notifyUi()
    }

    fun discardDraft(clientId: String) {
        guardian.clearActiveSession(clientId)
        state = RecorderUiState(
            activityType = state.activityType,
            autoPauseEnabled = state.autoPauseEnabled,
            simMode = state.simMode,
            pendingQueueCount = guardian.pendingSyncs().size,
        )
        notifyUi()
    }

    @SuppressLint("MissingPermission")
    fun startRecording(useSimulator: Boolean = state.simMode) {
        val cid = state.clientId ?: UUID.randomUUID().toString()
        val now = System.currentTimeMillis()
        guardian.startOrUpdateSession(cid, state.activityType, now, paused = false)
        state = state.copy(clientId = cid, phase = LitePhase.RECORDING, simMode = useSimulator)
        notifyUi()

        LiteTrackingService.start(context, state.activityType)

        if (useSimulator) {
            stopLocationUpdatesOnly()
            simRunnable?.let { mainHandler.removeCallbacks(it) }
            val r = object : Runnable {
                override fun run() {
                    emitSimulatedPoint()
                    if (state.phase == LitePhase.RECORDING) {
                        mainHandler.postDelayed(this, 1000L)
                    }
                }
            }
            simRunnable = r
            mainHandler.postDelayed(r, 800L)
            return
        }

        try {
            val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
            locationManager = lm
            val minDist = when (state.activityType) {
                "ride" -> if (prefs.dataSaver) 12f else 8f
                "walk", "hike" -> if (prefs.dataSaver) 6f else 4f
                else -> if (prefs.dataSaver) 6f else 3f
            }
            val l = object : LocationListener {
                override fun onLocationChanged(loc: Location) {
                    ingestPosition(
                        lat = loc.latitude,
                        lng = loc.longitude,
                        altitude = if (loc.hasAltitude()) loc.altitude else 0.0,
                        speedMps = if (loc.hasSpeed()) loc.speed.toDouble() else 0.0,
                        accuracyM = if (loc.hasAccuracy()) loc.accuracy.toDouble() else 5.0,
                        timestampMs = loc.time,
                    )
                }

                @Deprecated("Deprecated in Android SDK 29")
                override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
                override fun onProviderEnabled(provider: String) = Unit
                override fun onProviderDisabled(provider: String) = Unit
            }
            listener = l
            if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1500L, minDist, l, Looper.getMainLooper())
            }
            if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 3000L, minDist * 2, l, Looper.getMainLooper())
            }
        } catch (_: Throwable) {
            // Permission absent or no provider enabled — handled gracefully
        }
    }

    fun ingestPosition(
        lat: Double,
        lng: Double,
        altitude: Double = 0.0,
        speedMps: Double = 0.0,
        accuracyM: Double = 5.0,
        timestampMs: Long? = null,
    ) {
        if (state.phase != LitePhase.RECORDING && state.phase != LitePhase.AUTO_PAUSED) return
        val wallNow = System.currentTimeMillis()
        val prev = state.points.lastOrNull()
        var fixTime = timestampMs ?: wallNow
        if (prev != null && fixTime <= prev.timeMs) {
            fixTime = max(wallNow, prev.timeMs + 1000L)
        }

        var effSpeed = if (speedMps.isFinite() && speedMps > 0.0) speedMps else 0.0
        if (prev != null) {
            val d = TrackProcessorLite.haversineMeters(prev.lat, prev.lng, lat, lng)
            val dtS = max(0.5, (fixTime - prev.timeMs) / 1000.0)
            val derived = d / dtS
            if (derived > effSpeed) effSpeed = derived
            if (d < 0.8 && state.autoPauseEnabled && effSpeed < 0.45 && state.points.size > 3) {
                state = state.copy(phase = LitePhase.AUTO_PAUSED, lastSpeedMps = effSpeed)
                notifyUi()
                return
            }
        }
        if (state.autoPauseEnabled && effSpeed < 0.45 && state.points.size > 3) {
            state = state.copy(phase = LitePhase.AUTO_PAUSED, lastSpeedMps = effSpeed)
            notifyUi()
            return
        }

        appendPoint(
            LitePoint(
                lat = lat,
                lng = lng,
                ele = altitude,
                timeMs = fixTime,
                accuracyM = if (accuracyM > 0.0) accuracyM else 5.0,
            ),
            effSpeed
        )
    }

    private fun emitSimulatedPoint() {
        val step = simStep++
        val leg = (step / 5) % (simWaypoints.size - 1)
        val t = (step % 5) / 5.0
        val p1 = simWaypoints[leg]
        val p2 = simWaypoints[leg + 1]
        appendPoint(
            LitePoint(
                lat = p1.first + (p2.first - p1.first) * t,
                lng = p1.second + (p2.second - p1.second) * t,
                ele = 920.0 + (step % 6),
                timeMs = System.currentTimeMillis(),
                accuracyM = 5.0,
            ),
            3.2
        )
    }

    private fun appendPoint(pt: LitePoint, speedMps: Double) {
        val cid = state.clientId ?: return
        guardian.appendPoint(cid, pt)
        val updated = state.points + pt
        val metrics = TrackProcessorLite.process(updated, state.activityType)
        state = state.copy(
            phase = LitePhase.RECORDING,
            points = updated,
            metrics = metrics,
            lastSpeedMps = speedMps,
        )
        notifyUi()
    }

    fun pauseRecording() {
        stopLocationUpdatesOnly()
        simRunnable?.let { mainHandler.removeCallbacks(it) }
        state.clientId?.let { cid ->
            guardian.startOrUpdateSession(
                cid,
                state.activityType,
                state.points.firstOrNull()?.timeMs ?: System.currentTimeMillis(),
                paused = true
            )
        }
        state = state.copy(phase = LitePhase.PAUSED)
        notifyUi()
    }

    fun resumeRecording() {
        startRecording(state.simMode)
    }

    fun stopAndSave(title: String, visibility: String = "followers", onDone: (Boolean, String?) -> Unit) {
        stopLocationUpdatesOnly()
        simRunnable?.let { mainHandler.removeCallbacks(it) }
        LiteTrackingService.stop(context)

        val cid = state.clientId
        if (cid == null || state.points.size < 2) {
            if (cid != null) guardian.clearActiveSession(cid)
            state = RecorderUiState(
                activityType = state.activityType,
                autoPauseEnabled = state.autoPauseEnabled,
                pendingQueueCount = guardian.pendingSyncs().size,
            )
            notifyUi()
            onDone(false, "Record at least 2 GPS points before saving.")
            return
        }

        val ptsArray = JSONArray()
        for (p in state.points) ptsArray.put(p.toJson())
        val payload = JSONObject()
            .put("clientId", cid)
            .put("title", if (title.isBlank()) "Stride ${state.activityType}" else title.trim())
            .put("activityType", state.activityType)
            .put("source", "recorded")
            .put("visibility", visibility)
            .put("points", ptsArray)
            .toString()

        guardian.enqueueSync(cid, payload)
        guardian.clearActiveSession(cid)
        state = RecorderUiState(
            activityType = state.activityType,
            autoPauseEnabled = state.autoPauseEnabled,
            pendingQueueCount = guardian.pendingSyncs().size,
        )
        notifyUi()

        syncPendingQueue(onDone)
    }

    fun syncPendingQueue(onDone: ((Boolean, String?) -> Unit)? = null) {
        Thread {
            val pending = guardian.pendingSyncs()
            var ok = true
            var lastErr: String? = null
            for (item in pending) {
                try {
                    api.uploadActivityIdempotent(item.clientId, item.payloadJson)
                    guardian.markSynced(item.clientId)
                } catch (e: Throwable) {
                    ok = false
                    lastErr = e.message
                    guardian.recordSyncFailure(item.clientId, e.message ?: "sync failed")
                }
            }
            mainHandler.post {
                state = state.copy(pendingQueueCount = guardian.pendingSyncs().size)
                notifyUi()
                onDone?.invoke(ok, lastErr)
            }
        }.start()
    }

    private fun stopLocationUpdatesOnly() {
        val l = listener ?: return
        try {
            locationManager?.removeUpdates(l)
        } catch (_: Throwable) {}
        listener = null
    }

    private fun notifyUi() {
        mainHandler.post { onStateChanged?.invoke(state) }
    }
}
