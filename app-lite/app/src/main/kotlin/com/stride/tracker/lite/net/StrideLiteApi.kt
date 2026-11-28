package com.stride.tracker.lite.net

import android.content.Context
import com.stride.tracker.lite.core.SecurePrefs
import com.stride.tracker.lite.storage.LiteStorageGuardian
import okhttp3.ConnectionPool
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

class ApiException(val statusCode: Int, val code: String?, message: String) : Exception(message)

class StrideLiteApi(
    private val context: Context,
    val prefs: SecurePrefs,
    val guardian: LiteStorageGuardian
) {
    private val jsonType = "application/json; charset=utf-8".toMediaType()
    private val client = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(20, TimeUnit.SECONDS)
        .connectionPool(ConnectionPool(4, 3, TimeUnit.MINUTES))
        .build()

    private val refreshLock = Any()

    private fun baseUrl(): String = prefs.apiBaseUrl.trimEnd('/')

    private fun encode(v: String): String = URLEncoder.encode(v, "UTF-8")

    private fun executeJson(
        method: String,
        path: String,
        body: JSONObject? = null,
        extraHeaders: Map<String, String> = emptyMap(),
        cacheKey: String? = null,
        retried: Boolean = false
    ): JSONObject {
        val builder = Request.Builder().url("${baseUrl()}$path")
        prefs.accessToken?.takeIf { it.isNotBlank() }?.let {
            builder.header("Authorization", "Bearer $it")
        }
        extraHeaders.forEach { (k, v) -> builder.header(k, v) }

        val reqBody = body?.toString()?.toRequestBody(jsonType)
        when (method) {
            "GET" -> builder.get()
            "POST" -> builder.post(reqBody ?: "{}".toRequestBody(jsonType))
            "PATCH" -> builder.patch(reqBody ?: "{}".toRequestBody(jsonType))
            "DELETE" -> if (reqBody != null) builder.delete(reqBody) else builder.delete()
        }

        try {
            client.newCall(builder.build()).execute().use { resp ->
                val raw = resp.body?.string().orEmpty()
                if (resp.code == 401 && !retried && !path.contains("/auth/")) {
                    if (tryRefreshToken()) {
                        return executeJson(method, path, body, extraHeaders, cacheKey, retried = true)
                    }
                }
                if (!resp.isSuccessful) {
                    val parsedErr = runCatching { JSONObject(raw) }.getOrNull()
                    val errObj = parsedErr?.optJSONObject("error")
                    val msg = errObj?.optString("message")?.takeIf { it.isNotBlank() }
                        ?: parsedErr?.optString("message")?.takeIf { it.isNotBlank() }
                        ?: "HTTP ${resp.code}"
                    throw ApiException(resp.code, errObj?.optString("code"), msg)
                }
                val text = raw.ifBlank { "{}" }
                if (method == "GET" && cacheKey != null) {
                    runCatching { guardian.putHttpCache(cacheKey, text, prefs.cacheCapBytes) }
                }
                return JSONObject(text)
            }
        } catch (io: IOException) {
            if (method == "GET" && cacheKey != null) {
                guardian.getHttpCache(cacheKey)?.let { return JSONObject(it) }
            }
            throw io
        }
    }

    private fun executePlain(path: String, retried: Boolean = false): String {
        val builder = Request.Builder().url("${baseUrl()}$path").get()
        prefs.accessToken?.takeIf { it.isNotBlank() }?.let {
            builder.header("Authorization", "Bearer $it")
        }
        client.newCall(builder.build()).execute().use { resp ->
            if (resp.code == 401 && !retried) {
                if (tryRefreshToken()) return executePlain(path, retried = true)
            }
            if (!resp.isSuccessful) throw ApiException(resp.code, null, "HTTP ${resp.code}")
            return resp.body?.string().orEmpty()
        }
    }

    private fun tryRefreshToken(): Boolean = synchronized(refreshLock) {
        val refresh = prefs.refreshToken ?: return false
        return try {
            val payload = JSONObject().put("refreshToken", refresh)
            val req = Request.Builder()
                .url("${baseUrl()}/v1/auth/refresh")
                .post(payload.toString().toRequestBody(jsonType))
                .build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) {
                    prefs.clearSession()
                    return false
                }
                val json = JSONObject(resp.body?.string().orEmpty())
                prefs.accessToken = json.optString("accessToken")
                prefs.refreshToken = json.optString("refreshToken")
                true
            }
        } catch (_: Throwable) {
            false
        }
    }

    // Auth
    fun login(email: String, password: String): JSONObject {
        val res = executeJson(
            "POST", "/v1/auth/login",
            JSONObject().put("email", email).put("password", password).put("deviceName", "Stride Lite 2.0 Android")
        )
        prefs.accessToken = res.optString("accessToken")
        prefs.refreshToken = res.optString("refreshToken")
        res.optJSONObject("user")?.optString("id")?.takeIf { it.isNotBlank() }?.let { prefs.userId = it }
        return res
    }

    fun signup(email: String, password: String, displayName: String, handle: String, language: String): JSONObject =
        executeJson(
            "POST", "/v1/auth/signup",
            JSONObject()
                .put("email", email)
                .put("password", password)
                .put("displayName", displayName)
                .put("handle", handle)
                .put("language", language)
        )

    fun verifyEmail(email: String, code: String): JSONObject =
        executeJson("POST", "/v1/auth/verify-email", JSONObject().put("email", email).put("code", code))

    fun resendVerification(email: String, language: String): JSONObject =
        executeJson("POST", "/v1/auth/resend-verification", JSONObject().put("email", email).put("language", language))

    fun forgotPassword(email: String, language: String): JSONObject =
        executeJson("POST", "/v1/auth/forgot-password", JSONObject().put("email", email).put("language", language))

    fun resetPassword(email: String, code: String, newPassword: String): JSONObject =
        executeJson("POST", "/v1/auth/reset-password", JSONObject().put("email", email).put("code", code).put("newPassword", newPassword))

    fun exchangeOAuthCode(oauthCode: String): JSONObject {
        val res = executeJson("POST", "/v1/auth/oauth-exchange", JSONObject().put("oauthCode", oauthCode))
        prefs.accessToken = res.optString("accessToken")
        prefs.refreshToken = res.optString("refreshToken")
        res.optJSONObject("user")?.optString("id")?.takeIf { it.isNotBlank() }?.let { prefs.userId = it }
        return res
    }

    // Feed & Activities
    fun fetchFeed(scope: String): JSONArray {
        val limit = if (prefs.dataSaver) 12 else 25
        return executeJson("GET", "/v1/activities/feed?scope=${encode(scope)}&limit=$limit", cacheKey = "feed_$scope")
            .optJSONArray("items") ?: JSONArray()
    }

    fun fetchActivityDetail(id: String): JSONObject =
        executeJson("GET", "/v1/activities/${encode(id)}", cacheKey = "act_$id")

    fun fetchActivityGpx(id: String): String = executePlain("/v1/activities/${encode(id)}/gpx")

    fun toggleKudos(id: String, liked: Boolean): JSONObject =
        executeJson(if (liked) "DELETE" else "POST", "/v1/activities/${encode(id)}/kudos")

    fun addComment(id: String, bodyText: String): JSONObject =
        executeJson("POST", "/v1/activities/${encode(id)}/comments", JSONObject().put("body", bodyText))

    fun updateActivityVisibility(id: String, visibility: String): JSONObject =
        executeJson("PATCH", "/v1/activities/${encode(id)}", JSONObject().put("visibility", visibility))

    fun deleteActivity(id: String): JSONObject =
        executeJson("DELETE", "/v1/activities/${encode(id)}")

    fun createSegment(activityId: String, name: String, startIndex: Int, endIndex: Int): JSONObject =
        executeJson(
            "POST", "/v1/segments",
            JSONObject()
                .put("activityId", activityId)
                .put("name", name)
                .put("startIndex", startIndex)
                .put("endIndex", endIndex)
        )

    fun uploadActivityRaw(clientId: String, payload: JSONObject): JSONObject =
        executeJson("POST", "/v1/activities", payload, mapOf("Idempotency-Key" to clientId))

    fun importGpxXml(gpxXml: String, title: String?, activityType: String, visibility: String = "followers"): JSONObject {
        val mp = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("gpx", gpxXml)
            .addFormDataPart("activityType", activityType)
            .addFormDataPart("visibility", visibility)
        if (!title.isNullOrBlank()) mp.addFormDataPart("title", title)
        val builder = Request.Builder().url("${baseUrl()}/v1/activities/import-gpx").post(mp.build())
        prefs.accessToken?.let { builder.header("Authorization", "Bearer $it") }
        client.newCall(builder.build()).execute().use { resp ->
            val raw = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) throw ApiException(resp.code, null, "HTTP ${resp.code}: $raw")
            return JSONObject(raw.ifBlank { "{}" })
        }
    }

    // Segments, Routes & Heatmap
    fun fetchSegments(activityType: String? = null): JSONArray {
        val qs = if (activityType.isNullOrBlank()) "" else "?activityType=${encode(activityType)}"
        return executeJson("GET", "/v1/segments$qs", cacheKey = "segments_${activityType ?: "all"}")
            .optJSONArray("segments") ?: JSONArray()
    }

    fun fetchSegmentDetail(id: String): JSONObject =
        executeJson("GET", "/v1/segments/${encode(id)}", cacheKey = "seg_$id")

    fun fetchSegmentLeaderboard(id: String, range: String = "all"): JSONArray =
        executeJson("GET", "/v1/segments/${encode(id)}/leaderboard?range=${encode(range)}", cacheKey = "lb_${id}_$range")
            .optJSONArray("entries") ?: JSONArray()

    fun flagSegmentEffort(effortId: String, reason: String): JSONObject =
        executeJson("POST", "/v1/segments/efforts/${encode(effortId)}/flag", JSONObject().put("reason", reason).put("requestReview", true))

    fun fetchNearbyRoutes(lat: Double = 12.9762, lng: Double = 77.5929, radiusKm: Int = 50): JSONObject =
        executeJson("GET", "/v1/routes/nearby?lat=$lat&lng=$lng&radiusKm=$radiusKm", cacheKey = "nearby_routes")

    fun saveRoute(name: String, activityType: String, distanceM: Double, elevationGainM: Double, encodedPolyline: String): JSONObject =
        executeJson(
            "POST", "/v1/routes/saved",
            JSONObject()
                .put("name", name)
                .put("activityType", activityType)
                .put("distanceM", distanceM)
                .put("elevationGainM", elevationGainM)
                .put("encodedPolyline", encodedPolyline)
        )

    fun fetchHeatmap(city: String = "", activityType: String = "all"): JSONObject =
        executeJson("GET", "/v1/heatmap?city=${encode(city)}&activityType=${encode(activityType)}", cacheKey = "heatmap_${city}_$activityType")

    // Social, Clubs, Challenges
    fun searchUsers(query: String): JSONArray =
        executeJson("GET", "/v1/users/search?q=${encode(query)}").optJSONArray("users") ?: JSONArray()

    fun fetchUserProfile(handle: String): JSONObject =
        executeJson("GET", "/v1/users/${encode(handle)}")

    fun toggleFollow(userId: String, following: Boolean): JSONObject =
        executeJson(if (following) "DELETE" else "POST", "/v1/users/${encode(userId)}/follow")

    fun fetchClubs(): JSONArray =
        executeJson("GET", "/v1/clubs", cacheKey = "clubs").optJSONArray("clubs") ?: JSONArray()

    fun createClub(name: String, city: String, sportFocus: String, description: String = ""): JSONObject =
        executeJson(
            "POST", "/v1/clubs",
            JSONObject().put("name", name).put("city", city).put("sportFocus", sportFocus).put("description", description)
        )

    fun fetchClubDetail(slugOrId: String): JSONObject =
        executeJson("GET", "/v1/clubs/${encode(slugOrId)}")

    fun toggleClubMembership(clubId: String, joined: Boolean): JSONObject =
        executeJson(if (joined) "DELETE" else "POST", "/v1/clubs/${encode(clubId)}/${if (joined) "leave" else "join"}")

    fun rsvpEvent(eventId: String, going: Boolean): JSONObject =
        executeJson("POST", "/v1/events/${encode(eventId)}/rsvp", JSONObject().put("going", going))

    fun fetchChallenges(): JSONArray =
        executeJson("GET", "/v1/challenges", cacheKey = "challenges").optJSONArray("challenges") ?: JSONArray()

    fun toggleChallengeMembership(challengeId: String, joined: Boolean): JSONObject =
        executeJson(if (joined) "DELETE" else "POST", "/v1/challenges/${encode(challengeId)}/${if (joined) "leave" else "join"}")

    // Profile, Dashboard, Settings, Privacy & Export
    fun fetchMe(): JSONObject {
        val res = executeJson("GET", "/v1/me", cacheKey = "me")
        res.optJSONObject("user")?.optString("id")?.takeIf { it.isNotBlank() }?.let { prefs.userId = it }
        return res
    }

    fun updateProfile(displayName: String, homeCity: String, bio: String): JSONObject =
        executeJson("PATCH", "/v1/me/profile", JSONObject().put("displayName", displayName).put("homeCity", homeCity).put("bio", bio))

    fun updateSettings(theme: String? = null, language: String? = null, units: String? = null): JSONObject {
        val body = JSONObject()
        theme?.let { body.put("theme", it) }
        language?.let { body.put("language", it) }
        units?.let { body.put("units", it) }
        return executeJson("PATCH", "/v1/me/settings", body)
    }

    fun fetchDashboard(): JSONObject =
        executeJson("GET", "/v1/analytics/dashboard", cacheKey = "dashboard")

    fun createGoal(period: String, targetMeters: Double): JSONObject =
        executeJson(
            "POST", "/v1/analytics/goals",
            JSONObject().put("period", period).put("activityType", "all").put("metricType", "distance_m").put("targetValue", targetMeters)
        )

    fun createGear(name: String, gearType: String, initialDistanceM: Double): JSONObject =
        executeJson(
            "POST", "/v1/analytics/gear",
            JSONObject().put("name", name).put("gearType", gearType).put("initialDistanceM", initialDistanceM)
        )

    fun fetchPrivacyZones(): JSONArray =
        executeJson("GET", "/v1/me/privacy-zones", cacheKey = "privacy_zones").optJSONArray("privacyZones") ?: JSONArray()

    fun createPrivacyZone(name: String, lat: Double, lng: Double, radiusMeters: Int): JSONObject =
        executeJson("POST", "/v1/me/privacy-zones", JSONObject().put("name", name).put("lat", lat).put("lng", lng).put("radiusMeters", radiusMeters))

    fun deletePrivacyZone(id: String): JSONObject =
        executeJson("DELETE", "/v1/me/privacy-zones/${encode(id)}")

    fun fetchNotifications(): JSONArray =
        executeJson("GET", "/v1/me/notifications", cacheKey = "notifications").optJSONArray("notifications") ?: JSONArray()

    fun markAllNotificationsRead(): JSONObject =
        executeJson("POST", "/v1/me/notifications/read-all", JSONObject())

    fun fetchSessions(): JSONArray =
        executeJson("GET", "/v1/auth/sessions").optJSONArray("sessions") ?: JSONArray()

    fun revokeSession(id: String): JSONObject =
        executeJson("DELETE", "/v1/auth/sessions/${encode(id)}")

    fun exportMyData(): JSONObject = executeJson("GET", "/v1/me/export")

    fun deleteAccount(): JSONObject = executeJson("DELETE", "/v1/me")
}
