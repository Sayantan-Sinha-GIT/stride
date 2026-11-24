package com.stride.tracker.lite.net

import com.stride.tracker.lite.core.SecurePrefs
import com.stride.tracker.lite.storage.LiteStorageGuardian
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.UUID
import java.util.zip.GZIPInputStream

class ApiException(
    val status: Int,
    val code: String?,
    override val message: String,
) : Exception(message)

class StrideLiteApi(
    private val prefs: SecurePrefs,
    private val guardian: LiteStorageGuardian,
) {
    private fun extractError(rawBody: String, status: Int): ApiException {
        return try {
            val obj = JSONObject(rawBody)
            val err = obj.optJSONObject("error")
            if (err != null) {
                val msg = err.optString("message").takeIf { it.isNotBlank() } ?: "HTTP $status"
                val code = err.optString("code").takeIf { it.isNotBlank() }
                ApiException(status, code, msg)
            } else {
                val msg = obj.optString("message").takeIf { it.isNotBlank() } ?: "HTTP $status"
                ApiException(status, null, msg)
            }
        } catch (_: Throwable) {
            ApiException(status, null, "Request failed (HTTP $status)")
        }
    }

    private fun tryRefresh(): Boolean {
        val refresh = prefs.refreshToken ?: return false
        return try {
            val payload = JSONObject().put("refreshToken", refresh).toString()
            val body = rawRequest("POST", "/v1/auth/refresh", payload, skipAuthRetry = true)
            val json = JSONObject(body)
            val access = json.optString("accessToken")
            val nextRefresh = json.optString("refreshToken")
            if (access.isNotBlank() && nextRefresh.isNotBlank()) {
                prefs.accessToken = access
                prefs.refreshToken = nextRefresh
                true
            } else {
                prefs.clearSession()
                false
            }
        } catch (_: Throwable) {
            prefs.clearSession()
            false
        }
    }

    private fun readBody(conn: HttpURLConnection, isOk: Boolean): String {
        val rawStream: InputStream = (if (isOk) conn.inputStream else conn.errorStream) ?: return ""
        val decoded = if ("gzip".equals(conn.contentEncoding, ignoreCase = true)) {
            GZIPInputStream(rawStream)
        } else {
            rawStream
        }
        return decoded.bufferedReader(Charsets.UTF_8).use { it.readText() }
    }

    private fun rawRequest(
        method: String,
        pathAndQuery: String,
        jsonBody: String? = null,
        extraHeaders: Map<String, String> = emptyMap(),
        skipAuthRetry: Boolean = false,
    ): String {
        val url = URL("${prefs.baseUrl}$pathAndQuery")
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 12000
            readTimeout = 18000
            useCaches = false
            setRequestProperty("Accept", "application/json")
            val tok = prefs.accessToken
            if (!tok.isNullOrEmpty()) {
                setRequestProperty("Authorization", "Bearer $tok")
            }
            for ((k, v) in extraHeaders) {
                setRequestProperty(k, v)
            }
            if (jsonBody != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
                outputStream.use { it.write(jsonBody.toByteArray(Charsets.UTF_8)) }
            }
        }

        val status = conn.responseCode
        val text = readBody(conn, status in 200..299)
        conn.disconnect()

        if (status == 401 && !skipAuthRetry && !pathAndQuery.contains("/auth/")) {
            if (tryRefresh()) {
                return rawRequest(method, pathAndQuery, jsonBody, extraHeaders, skipAuthRetry = true)
            }
        }

        if (status !in 200..299) {
            throw extractError(text, status)
        }
        return text
    }

    private fun cachedGetJson(pathAndQuery: String, bypassCache: Boolean = false): JSONObject {
        val cacheKey = "GET:$pathAndQuery"
        if (!bypassCache) {
            try {
                val resText = rawRequest("GET", pathAndQuery)
                guardian.putCache(cacheKey, resText, prefs.cacheCapBytes)
                return JSONObject(resText)
            } catch (e: ApiException) {
                if (e.status == 401 || e.status == 403 || e.status == 404) throw e
                val cached = guardian.getCache(cacheKey)
                if (cached != null) return JSONObject(cached)
                throw e
            } catch (e: Throwable) {
                val cached = guardian.getCache(cacheKey)
                if (cached != null) return JSONObject(cached)
                throw ApiException(0, "OFFLINE", e.message ?: "Offline")
            }
        } else {
            val resText = rawRequest("GET", pathAndQuery)
            guardian.putCache(cacheKey, resText, prefs.cacheCapBytes)
            return JSONObject(resText)
        }
    }

    fun getCachedSnapshotOnly(pathAndQuery: String): JSONObject? {
        val cached = guardian.getCache("GET:$pathAndQuery") ?: return null
        return try {
            JSONObject(cached)
        } catch (_: Throwable) {
            null
        }
    }

    fun loginWithEmail(email: String, password: String): JSONObject {
        val payload = JSONObject()
            .put("email", email)
            .put("password", password)
            .put("deviceName", "Stride Lite Android")
            .toString()
        val json = JSONObject(rawRequest("POST", "/v1/auth/login", payload))
        prefs.accessToken = json.optString("accessToken")
        prefs.refreshToken = json.optString("refreshToken")
        return json
    }

    fun signup(
        email: String,
        password: String,
        displayName: String,
        handle: String,
        language: String,
    ): JSONObject {
        val payload = JSONObject()
            .put("email", email)
            .put("password", password)
            .put("displayName", displayName)
            .put("handle", handle)
            .put("language", language)
            .toString()
        return JSONObject(rawRequest("POST", "/v1/auth/signup", payload))
    }

    fun verifyEmail(email: String, code: String): JSONObject {
        val payload = JSONObject().put("email", email).put("code", code).toString()
        return JSONObject(rawRequest("POST", "/v1/auth/verify-email", payload))
    }

    fun resendVerification(email: String, language: String): JSONObject {
        val payload = JSONObject().put("email", email).put("language", language).toString()
        return JSONObject(rawRequest("POST", "/v1/auth/resend-verification", payload))
    }

    fun requestPasswordReset(email: String, language: String) {
        val payload = JSONObject().put("email", email).put("language", language).toString()
        rawRequest("POST", "/v1/auth/forgot-password", payload)
    }

    fun confirmPasswordReset(email: String, code: String, newPassword: String) {
        val payload = JSONObject()
            .put("email", email)
            .put("code", code)
            .put("newPassword", newPassword)
            .toString()
        rawRequest("POST", "/v1/auth/reset-password", payload)
    }

    fun exchangeOAuthCode(code: String): JSONObject {
        val payload = JSONObject().put("code", code).toString()
        val json = JSONObject(rawRequest("POST", "/v1/auth/oauth-exchange", payload))
        prefs.accessToken = json.optString("accessToken")
        prefs.refreshToken = json.optString("refreshToken")
        return json
    }

    fun googleStartUrl(lang: String): String {
        return "${prefs.baseUrl}/v1/auth/google/start?lang=${URLEncoder.encode(lang, "UTF-8")}&client=lite"
    }

    fun fetchFeed(scope: String, limit: Int): JSONArray {
        val res = cachedGetJson("/v1/activities/feed?scope=${URLEncoder.encode(scope, "UTF-8")}&limit=$limit")
        return res.optJSONArray("items") ?: JSONArray()
    }

    fun fetchActivityDetail(id: String): JSONObject {
        return cachedGetJson("/v1/activities/$id")
    }

    fun toggleKudos(activityId: String, currentlyLiked: Boolean) {
        if (currentlyLiked) rawRequest("DELETE", "/v1/activities/$activityId/kudos")
        else rawRequest("POST", "/v1/activities/$activityId/kudos")
    }

    fun addComment(activityId: String, body: String): JSONObject {
        val payload = JSONObject().put("body", body).toString()
        return JSONObject(rawRequest("POST", "/v1/activities/$activityId/comments", payload))
    }

    fun deleteComment(activityId: String, commentId: String) {
        rawRequest("DELETE", "/v1/activities/$activityId/comments/$commentId")
    }

    fun deleteActivity(activityId: String) {
        rawRequest("DELETE", "/v1/activities/$activityId")
    }

    fun uploadActivityIdempotent(clientId: String, payloadJson: String): JSONObject {
        val res = rawRequest(
            "POST",
            "/v1/activities",
            payloadJson,
            extraHeaders = mapOf("Idempotency-Key" to clientId)
        )
        return JSONObject(res)
    }

    fun importGpxMultipart(gpxXml: String, title: String?, activityType: String, visibility: String): JSONObject {
        val boundary = "----StrideLiteBoundary${UUID.randomUUID()}"
        val out = ByteArrayOutputStream()
        DataOutputStream(out).use { dos ->
            fun writeField(name: String, value: String) {
                dos.writeBytes("--$boundary\r\n")
                dos.writeBytes("Content-Disposition: form-data; name=\"$name\"\r\n\r\n")
                dos.write(value.toByteArray(Charsets.UTF_8))
                dos.writeBytes("\r\n")
            }
            writeField("gpx", gpxXml)
            if (!title.isNullOrBlank()) writeField("title", title)
            writeField("activityType", activityType)
            writeField("visibility", visibility)
            dos.writeBytes("--$boundary--\r\n")
        }
        val bytes = out.toByteArray()
        val url = URL("${prefs.baseUrl}/v1/activities/import-gpx")
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15000
            readTimeout = 20000
            doOutput = true
            prefs.accessToken?.let { setRequestProperty("Authorization", "Bearer $it") }
            setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
            outputStream.use { it.write(bytes) }
        }
        val status = conn.responseCode
        val text = readBody(conn, status in 200..299)
        conn.disconnect()
        if (status !in 200..299) throw extractError(text, status)
        return JSONObject(text)
    }

    fun fetchSegments(): JSONArray {
        val res = cachedGetJson("/v1/segments")
        return res.optJSONArray("segments") ?: JSONArray()
    }

    fun fetchSegmentDetail(id: String, range: String): Pair<JSONObject, JSONArray> {
        val detail = cachedGetJson("/v1/segments/$id")
        val lb = cachedGetJson("/v1/segments/$id/leaderboard?range=$range")
        return detail to (lb.optJSONArray("entries") ?: JSONArray())
    }

    fun flagSegmentEffort(effortId: String, reason: String) {
        val payload = JSONObject().put("reason", reason).put("requestReview", true).toString()
        rawRequest("POST", "/v1/segments/efforts/$effortId/flag", payload)
    }

    fun fetchNearbyRoutes(lat: Double = 12.9762, lng: Double = 77.5929): JSONObject {
        return cachedGetJson("/v1/routes/nearby?lat=$lat&lng=$lng&radiusKm=50")
    }

    fun fetchClubs(): JSONArray {
        return cachedGetJson("/v1/clubs").optJSONArray("clubs") ?: JSONArray()
    }

    fun toggleClubMembership(clubId: String, joined: Boolean) {
        if (joined) rawRequest("DELETE", "/v1/clubs/$clubId/leave")
        else rawRequest("POST", "/v1/clubs/$clubId/join")
    }

    fun fetchChallenges(): JSONArray {
        return cachedGetJson("/v1/challenges").optJSONArray("challenges") ?: JSONArray()
    }

    fun toggleChallengeMembership(challengeId: String, joined: Boolean) {
        if (joined) rawRequest("DELETE", "/v1/challenges/$challengeId/leave")
        else rawRequest("POST", "/v1/challenges/$challengeId/join")
    }

    fun fetchMe(): JSONObject = cachedGetJson("/v1/me")

    fun fetchDashboard(): JSONObject = cachedGetJson("/v1/analytics/dashboard")

    fun fetchNotifications(): JSONArray {
        return cachedGetJson("/v1/me/notifications").optJSONArray("notifications") ?: JSONArray()
    }

    fun markAllNotificationsRead() {
        rawRequest("POST", "/v1/me/notifications/read-all")
    }

    fun updateSettings(theme: String? = null, language: String? = null, units: String? = null) {
        val obj = JSONObject()
        if (theme != null) obj.put("theme", theme)
        if (language != null) obj.put("language", language)
        if (units != null) obj.put("units", units)
        rawRequest("PATCH", "/v1/me/settings", obj.toString())
    }

    fun fetchPrivacyZones(): JSONArray {
        return cachedGetJson("/v1/me/privacy-zones").optJSONArray("privacyZones") ?: JSONArray()
    }

    fun createPrivacyZone(name: String, lat: Double, lng: Double, radiusMeters: Int) {
        val obj = JSONObject()
            .put("name", name)
            .put("lat", lat)
            .put("lng", lng)
            .put("radiusMeters", radiusMeters)
        rawRequest("POST", "/v1/me/privacy-zones", obj.toString())
    }

    fun deletePrivacyZone(id: String) {
        rawRequest("DELETE", "/v1/me/privacy-zones/$id")
    }

    fun fetchSessions(): JSONArray {
        return cachedGetJson("/v1/auth/sessions", bypassCache = true).optJSONArray("sessions") ?: JSONArray()
    }

    fun revokeSession(id: String) {
        rawRequest("DELETE", "/v1/auth/sessions/$id")
    }

    fun createGoal(period: String, targetMeters: Double) {
        val obj = JSONObject()
            .put("period", period)
            .put("activityType", "all")
            .put("metricType", "distance_m")
            .put("targetValue", targetMeters)
        rawRequest("POST", "/v1/analytics/goals", obj.toString())
    }

    fun createGear(name: String, gearType: String) {
        val obj = JSONObject()
            .put("name", name)
            .put("gearType", gearType)
            .put("initialDistanceM", 0)
        rawRequest("POST", "/v1/analytics/gear", obj.toString())
    }

    fun exportMyData(): JSONObject {
        return JSONObject(rawRequest("GET", "/v1/me/export"))
    }

    fun deleteAccount() {
        rawRequest("DELETE", "/v1/me")
        prefs.clearSession()
    }
}
