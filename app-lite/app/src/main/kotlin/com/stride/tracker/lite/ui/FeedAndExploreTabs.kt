package com.stride.tracker.lite.ui

import android.app.AlertDialog
import android.content.Context
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.Toast
import com.stride.tracker.lite.core.LitePalette
import com.stride.tracker.lite.core.LiteStrings
import com.stride.tracker.lite.core.LiteTheme
import com.stride.tracker.lite.core.SecurePrefs
import com.stride.tracker.lite.core.TrackProcessorLite
import com.stride.tracker.lite.net.StrideLiteApi
import org.json.JSONArray
import org.json.JSONObject

class FeedTabBuilder(
    private val context: Context,
    private val palette: LitePalette,
    private val prefs: SecurePrefs,
    private val api: StrideLiteApi,
    private val runBg: (() -> Unit) -> Unit,
    private val runUi: (() -> Unit) -> Unit,
) {
    private var scope = "public"
    private var items: List<JSONObject> = emptyList()
    private var errorMsg: String? = null

    fun build(): View {
        val lang = prefs.language
        val pad = LiteTheme.dp(context, 14)
        val root = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(palette.bg)
        }

        val scopeRow = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(pad, pad, pad, LiteTheme.dp(context, 8))
        }
        val listCol = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, 0, pad, LiteTheme.dp(context, 24))
        }

        fun renderScopeBar() {
            scopeRow.removeAllViews()
            listOf("following" to "following", "public" to "explore", "me" to "myActivities").forEachIndexed { idx, (valKey, strKey) ->
                if (idx > 0) scopeRow.addView(View(context), LinearLayout.LayoutParams(LiteTheme.dp(context, 6), 1))
                val btn = LiteTheme.pillButton(
                    context, palette, LiteStrings.t(lang, strKey),
                    primary = scope == valKey
                ).apply {
                    setOnClickListener {
                        scope = valKey
                        renderScopeBar()
                        loadFeed(listCol)
                    }
                }
                scopeRow.addView(btn, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            }
        }

        renderScopeBar()
        root.addView(scopeRow)

        val refreshBtn = LiteTheme.pillButton(context, palette, LiteStrings.t(lang, "refresh"), primary = false).apply {
            setOnClickListener { loadFeed(listCol) }
        }
        val refreshWrap = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(pad, 0, pad, LiteTheme.dp(context, 8))
            addView(refreshBtn, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        }
        root.addView(refreshWrap)

        val scroll = ScrollView(context).apply { addView(listCol) }
        root.addView(scroll, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))

        // Instant zero-flicker cached preview if available
        val limit = if (prefs.dataSaver) 10 else 25
        api.getCachedSnapshotOnly("/v1/activities/feed?scope=$scope&limit=$limit")?.optJSONArray("items")?.let { arr ->
            items = jsonArrayToList(arr)
            renderItems(listCol)
        }
        loadFeed(listCol)
        return root
    }

    private fun loadFeed(listCol: LinearLayout) {
        val limit = if (prefs.dataSaver) 10 else 25
        runBg {
            try {
                val arr = api.fetchFeed(scope, limit)
                val list = jsonArrayToList(arr)
                runUi {
                    items = list
                    errorMsg = null
                    renderItems(listCol)
                }
            } catch (e: Throwable) {
                runUi {
                    errorMsg = e.message
                    renderItems(listCol)
                }
            }
        }
    }

    private fun renderItems(listCol: LinearLayout) {
        val lang = prefs.language
        val units = prefs.units
        listCol.removeAllViews()

        if (!errorMsg.isNullOrBlank()) {
            listCol.addView(LiteTheme.label(context, palette, errorMsg!!, 13f, colorOverride = palette.danger))
            listCol.addView(LiteTheme.spacer(context, 8))
        }
        if (items.isEmpty()) {
            listCol.addView(LiteTheme.label(context, palette, LiteStrings.t(lang, "noItems"), 14f, secondary = true))
            return
        }

        for (a in items) {
            val card = LiteTheme.card(context, palette, 14)
            val author = a.optJSONObject("author")
            val authorName = author?.optString("displayName") ?: "Athlete"
            val handle = author?.optString("handle") ?: ""
            val sport = (a.optString("activityType").ifBlank { "run" }).uppercase()

            card.addView(LiteTheme.label(context, palette, "$authorName · @$handle · $sport", 12.5f, secondary = true))
            card.addView(LiteTheme.spacer(context, 4))
            card.addView(LiteTheme.label(context, palette, a.optString("title", "Activity"), 16.5f, bold = true))
            card.addView(LiteTheme.spacer(context, 8))

            val poly = a.optString("encodedPolyline")
            if (poly.isNotEmpty()) {
                val pts = TrackProcessorLite.decodePolyline(poly)
                val canvas = RouteCanvasView(context, palette).apply {
                    setData(pts)
                    layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LiteTheme.dp(context, 120))
                }
                card.addView(canvas)
                card.addView(LiteTheme.spacer(context, 8))
            }

            val distM = a.optDouble("distanceM", 0.0)
            val movingS = a.optInt("movingTimeS", 0)
            val elevM = a.optDouble("elevationGainM", 0.0)
            val speed = if (movingS > 0) distM / movingS else 0.0
            val statsLine = "${TrackProcessorLite.formatDistance(distM, units)} · ${TrackProcessorLite.formatDuration(movingS)} · ${TrackProcessorLite.formatPaceOrSpeed(a.optString("activityType", "run"), speed, units)} · ${elevM.toInt()}m↑"
            card.addView(LiteTheme.label(context, palette, statsLine, 13.5f, bold = true, colorOverride = palette.secondary))
            card.addView(LiteTheme.spacer(context, 10))

            val liked = a.optBoolean("viewerHasKudos", false)
            val kudosCount = a.optInt("kudosCount", 0)
            val commentsCount = a.optInt("commentCount", 0)
            val id = a.optString("id")

            val actions = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
            val kudosBtn = LiteTheme.pillButton(
                context, palette,
                "${if (liked) "♥" else "♡"} $kudosCount ${LiteStrings.t(lang, "kudos")}",
                primary = liked
            ).apply {
                setOnClickListener {
                    runBg {
                        try {
                            api.toggleKudos(id, liked)
                            runUi {
                                a.put("viewerHasKudos", !liked)
                                a.put("kudosCount", if (liked) maxOf(0, kudosCount - 1) else kudosCount + 1)
                                renderItems(listCol)
                            }
                        } catch (e: Throwable) {
                            runUi { Toast.makeText(context, e.message, Toast.LENGTH_SHORT).show() }
                        }
                    }
                }
            }
            val detailBtn = LiteTheme.pillButton(
                context, palette,
                "$commentsCount ${LiteStrings.t(lang, "comments")} ›",
                primary = false
            ).apply {
                setOnClickListener { openActivityDetail(id, listCol) }
            }
            actions.addView(kudosBtn, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            actions.addView(View(context), LinearLayout.LayoutParams(LiteTheme.dp(context, 8), 1))
            actions.addView(detailBtn, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            card.addView(actions)

            listCol.addView(card)
            listCol.addView(LiteTheme.spacer(context, 10))
        }
    }

    private fun openActivityDetail(activityId: String, listCol: LinearLayout) {
        runBg {
            try {
                val res = api.fetchActivityDetail(activityId)
                runUi { showActivityDetailDialog(res, listCol) }
            } catch (e: Throwable) {
                runUi { Toast.makeText(context, e.message, Toast.LENGTH_SHORT).show() }
            }
        }
    }

    private fun showActivityDetailDialog(detail: JSONObject, listCol: LinearLayout) {
        val lang = prefs.language
        val a = detail.optJSONObject("activity") ?: return
        val id = a.optString("id")
        val scroll = ScrollView(context)
        val col = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            val p = LiteTheme.dp(context, 16)
            setPadding(p, p, p, p)
            setBackgroundColor(palette.bg)
        }

        val pts = TrackProcessorLite.decodePolyline(a.optString("encodedPolyline"))
        if (pts.size >= 2) {
            val canvas = RouteCanvasView(context, palette).apply {
                setData(pts, 0f)
                layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LiteTheme.dp(context, 160))
            }
            col.addView(canvas)
            col.addView(LiteTheme.spacer(context, 6))
            col.addView(SeekBar(context).apply {
                max = 100
                setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                    override fun onProgressChanged(sb: SeekBar?, progress: Int, fromUser: Boolean) {
                        canvas.setData(pts, progress / 100f)
                    }
                    override fun onStartTrackingTouch(sb: SeekBar?) = Unit
                    override fun onStopTrackingTouch(sb: SeekBar?) = Unit
                })
            })
        }

        val streamArr = a.optJSONArray("stream")
        if (streamArr != null && streamArr.length() >= 2) {
            val eles = (0 until streamArr.length()).map { i -> streamArr.optJSONObject(i)?.optDouble("ele", 0.0) ?: 0.0 }
            col.addView(LiteTheme.spacer(context, 10))
            col.addView(LiteTheme.label(context, palette, LiteStrings.t(lang, "elevProfile"), 14f, bold = true))
            col.addView(ElevationCanvasView(context, palette).apply {
                setElevations(eles)
                layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LiteTheme.dp(context, 90))
            })
        }

        val effArr = detail.optJSONArray("segmentEfforts")
        if (effArr != null && effArr.length() > 0) {
            col.addView(LiteTheme.spacer(context, 10))
            col.addView(LiteTheme.label(context, palette, LiteStrings.t(lang, "matchedSegments"), 14f, bold = true))
            for (i in 0 until effArr.length()) {
                val e = effArr.optJSONObject(i) ?: continue
                val segName = e.optString("segment_name").ifBlank { e.optString("segmentName", "Segment") }
                val sec = e.optInt("elapsed_time_s", e.optInt("elapsedTimeS", 0))
                val prTag = if (e.optBoolean("is_pr", false)) " ★ PR" else ""
                val rowText = "$segName · ${TrackProcessorLite.formatDuration(sec)}$prTag"
                col.addView(LiteTheme.label(context, palette, rowText, 13f, secondary = true))
            }
        }

        val splitsArr = a.optJSONArray("splitsKm") ?: a.optJSONArray("splits")
        if (splitsArr != null && splitsArr.length() > 0) {
            col.addView(LiteTheme.spacer(context, 10))
            col.addView(LiteTheme.label(context, palette, LiteStrings.t(lang, "splits"), 14f, bold = true))
            for (i in 0 until splitsArr.length()) {
                val sp = splitsArr.optJSONObject(i) ?: continue
                val sec = sp.optInt("paceSecPerKm", sp.optInt("movingTimeS", 0))
                val idxNum = sp.optInt("splitIndex", sp.optInt("kmIndex", i + 1))
                val min = sec / 60
                val rem = sec % 60
                col.addView(LiteTheme.label(context, palette, "KM $idxNum — $min:${rem.toString().padStart(2, '0')} /km", 13f, secondary = true))
            }
        }

        val commentsArr = detail.optJSONArray("comments") ?: JSONArray()
        col.addView(LiteTheme.spacer(context, 12))
        col.addView(LiteTheme.label(context, palette, "${LiteStrings.t(lang, "comments")} (${commentsArr.length()})", 14f, bold = true))
        for (i in 0 until commentsArr.length()) {
            val c = commentsArr.optJSONObject(i) ?: continue
            col.addView(LiteTheme.label(context, palette, "@${c.optString("handle")}: ${c.optString("body")}", 13f, secondary = true))
        }

        val commentInput = LiteTheme.inputField(context, palette, LiteStrings.t(lang, "commentHint"), InputType.TYPE_CLASS_TEXT)
        col.addView(LiteTheme.spacer(context, 8))
        col.addView(commentInput)
        col.addView(LiteTheme.spacer(context, 6))
        val dialog = AlertDialog.Builder(context)
            .setTitle(a.optString("title", "Activity"))
            .setView(scroll.apply { addView(col) })
            .setNegativeButton(LiteStrings.t(lang, "back"), null)
            .create()

        col.addView(
            LiteTheme.pillButton(context, palette, LiteStrings.t(lang, "postComment"), primary = true).apply {
                setOnClickListener {
                    val text = commentInput.text.toString().trim()
                    if (text.isEmpty()) return@setOnClickListener
                    runBg {
                        try {
                            api.addComment(id, text)
                            runUi {
                                dialog.dismiss()
                                openActivityDetail(id, listCol)
                            }
                        } catch (e: Throwable) {
                            runUi { Toast.makeText(context, e.message, Toast.LENGTH_SHORT).show() }
                        }
                    }
                }
            }
        )
        dialog.show()
    }
}

class ExploreTabBuilder(
    private val context: Context,
    private val palette: LitePalette,
    private val prefs: SecurePrefs,
    private val api: StrideLiteApi,
    private val runBg: (() -> Unit) -> Unit,
    private val runUi: (() -> Unit) -> Unit,
) {
    private var showRoutes = false
    private var segments: List<JSONObject> = emptyList()
    private var routes: List<JSONObject> = emptyList()

    fun build(): View {
        val lang = prefs.language
        val pad = LiteTheme.dp(context, 14)
        val root = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(palette.bg)
        }
        val tabs = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(pad, pad, pad, LiteTheme.dp(context, 8))
        }
        val listCol = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, 0, pad, LiteTheme.dp(context, 24))
        }

        fun renderTabs() {
            tabs.removeAllViews()
            val segBtn = LiteTheme.pillButton(context, palette, LiteStrings.t(lang, "segments"), primary = !showRoutes).apply {
                setOnClickListener { showRoutes = false; renderTabs(); load(listCol) }
            }
            val rtBtn = LiteTheme.pillButton(context, palette, LiteStrings.t(lang, "routes"), primary = showRoutes).apply {
                setOnClickListener { showRoutes = true; renderTabs(); load(listCol) }
            }
            tabs.addView(segBtn, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            tabs.addView(View(context), LinearLayout.LayoutParams(LiteTheme.dp(context, 8), 1))
            tabs.addView(rtBtn, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        }

        renderTabs()
        root.addView(tabs)
        root.addView(ScrollView(context).apply { addView(listCol) }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        load(listCol)
        return root
    }

    private fun load(listCol: LinearLayout) {
        runBg {
            try {
                if (!showRoutes) {
                    val s = jsonArrayToList(api.fetchSegments())
                    runUi { segments = s; renderList(listCol) }
                } else {
                    val nr = api.fetchNearbyRoutes()
                    val r = jsonArrayToList(nr.optJSONArray("activities") ?: JSONArray()) +
                        jsonArrayToList(nr.optJSONArray("segments") ?: JSONArray())
                    runUi { routes = r; renderList(listCol) }
                }
            } catch (e: Throwable) {
                runUi {
                    listCol.removeAllViews()
                    listCol.addView(LiteTheme.label(context, palette, e.message ?: "Error", 13f, colorOverride = palette.danger))
                }
            }
        }
    }

    private fun renderList(listCol: LinearLayout) {
        val units = prefs.units
        listCol.removeAllViews()
        val data = if (showRoutes) routes else segments
        if (data.isEmpty()) {
            listCol.addView(LiteTheme.label(context, palette, LiteStrings.t(prefs.language, "noItems"), 14f, secondary = true))
            return
        }
        for (item in data) {
            val card = LiteTheme.card(context, palette, 14)
            val name = item.optString("name").ifBlank { item.optString("title", "Route") }
            val city = item.optString("city")
            val distM = if (item.has("distance_m")) item.optDouble("distance_m", 0.0) else item.optDouble("distanceM", 0.0)
            val type = item.optString("activity_type").ifBlank { item.optString("activityType", "run") }.uppercase()

            card.addView(LiteTheme.label(context, palette, name, 16f, bold = true))
            card.addView(LiteTheme.spacer(context, 4))
            card.addView(
                LiteTheme.label(
                    context, palette,
                    "${if (city.isNotBlank()) "$city · " else ""}${TrackProcessorLite.formatDistance(distM, units)} · $type",
                    13f, secondary = true
                )
            )
            if (!showRoutes) {
                card.addView(LiteTheme.spacer(context, 8))
                card.addView(
                    LiteTheme.pillButton(context, palette, "${LiteStrings.t(prefs.language, "leaderboard")} ›", primary = false).apply {
                        setOnClickListener { openSegmentDetail(item.optString("id"), "all") }
                    }
                )
            }
            listCol.addView(card)
            listCol.addView(LiteTheme.spacer(context, 10))
        }
    }

    private fun openSegmentDetail(id: String, range: String) {
        runBg {
            try {
                val (detail, entries) = api.fetchSegmentDetail(id, range)
                runUi {
                    val seg = detail.optJSONObject("segment") ?: return@runUi
                    val col = LinearLayout(context).apply {
                        orientation = LinearLayout.VERTICAL
                        val p = LiteTheme.dp(context, 16)
                        setPadding(p, p, p, p)
                        setBackgroundColor(palette.bg)
                    }
                    val pts = TrackProcessorLite.decodePolyline(
                        seg.optString("encoded_polyline").ifBlank { seg.optString("encodedPolyline") }
                    )
                    if (pts.size >= 2) {
                        col.addView(RouteCanvasView(context, palette).apply {
                            setData(pts)
                            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LiteTheme.dp(context, 140))
                        })
                        col.addView(LiteTheme.spacer(context, 10))
                    }
                    col.addView(LiteTheme.label(context, palette, LiteStrings.t(prefs.language, "leaderboard"), 15f, bold = true))
                    val list = jsonArrayToList(entries)
                    if (list.isEmpty()) {
                        col.addView(LiteTheme.label(context, palette, LiteStrings.t(prefs.language, "noItems"), 13f, secondary = true))
                    } else {
                        list.forEachIndexed { idx, row ->
                            val rank = row.optInt("rank", idx + 1)
                            val dName = row.optString("display_name").ifBlank { row.optString("displayName", row.optString("handle")) }
                            val sec = row.optInt("elapsed_time_s", row.optInt("elapsedTimeS", 0))
                            col.addView(
                                LiteTheme.label(
                                    context, palette,
                                    "#$rank $dName (@${row.optString("handle")}) · ${TrackProcessorLite.formatDuration(sec)}",
                                    13.5f, secondary = false
                                )
                            )
                            col.addView(LiteTheme.spacer(context, 4))
                        }
                    }
                    AlertDialog.Builder(context)
                        .setTitle(seg.optString("name", "Segment"))
                        .setView(ScrollView(context).apply { addView(col) })
                        .setNegativeButton(LiteStrings.t(prefs.language, "back"), null)
                        .show()
                }
            } catch (e: Throwable) {
                runUi { Toast.makeText(context, e.message, Toast.LENGTH_SHORT).show() }
            }
        }
    }
}

internal fun jsonArrayToList(arr: JSONArray): List<JSONObject> {
    val out = ArrayList<JSONObject>(arr.length())
    for (i in 0 until arr.length()) {
        arr.optJSONObject(i)?.let { out.add(it) }
    }
    return out
}
