package com.stride.tracker.lite.ui

import android.app.AlertDialog
import android.content.Context
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.Toast
import com.stride.tracker.lite.core.LitePalette
import com.stride.tracker.lite.core.LiteStrings
import com.stride.tracker.lite.core.LiteTheme
import com.stride.tracker.lite.core.SecurePrefs
import com.stride.tracker.lite.core.TrackProcessorLite
import com.stride.tracker.lite.location.LitePhase
import com.stride.tracker.lite.location.LiteRecorder
import com.stride.tracker.lite.net.StrideLiteApi
import org.json.JSONObject

class RecordTabBuilder(
    private val context: Context,
    private val palette: LitePalette,
    private val prefs: SecurePrefs,
    private val api: StrideLiteApi,
    private val recorder: LiteRecorder,
    private val runBg: (() -> Unit) -> Unit,
    private val runUi: (() -> Unit) -> Unit,
    private val onPickGpx: () -> Unit,
) {
    fun build(): View {
        val pad = LiteTheme.dp(context, 14)
        val scroll = ScrollView(context).apply { setBackgroundColor(palette.bg) }
        val col = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, LiteTheme.dp(context, 28))
        }

        fun render() {
            val lang = prefs.language
            val units = prefs.units
            val st = recorder.state
            col.removeAllViews()

            val safety = LiteTheme.card(context, palette, 12)
            safety.addView(LiteTheme.label(context, palette, LiteStrings.t(lang, "safetyTitle"), 13.5f, bold = true))
            safety.addView(LiteTheme.label(context, palette, LiteStrings.t(lang, "safetyBody"), 12f, secondary = true))
            col.addView(safety)
            col.addView(LiteTheme.spacer(context, 10))

            val canvas = RouteCanvasView(context, palette).apply {
                setData(st.points.map { it.lat to it.lng })
                layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LiteTheme.dp(context, 155))
            }
            col.addView(canvas)
            col.addView(LiteTheme.spacer(context, 10))

            // Sport selector
            val sportsRow = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
            listOf("run" to "Run", "ride" to "Ride", "walk" to "Walk", "hike" to "Hike").forEachIndexed { i, (tKey, label) ->
                if (i > 0) sportsRow.addView(View(context), LinearLayout.LayoutParams(LiteTheme.dp(context, 6), 1))
                sportsRow.addView(
                    LiteTheme.pillButton(context, palette, label, primary = st.activityType == tKey).apply {
                        isEnabled = st.phase == LitePhase.IDLE
                        setOnClickListener { recorder.setActivityType(tKey) }
                    },
                    LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                )
            }
            col.addView(sportsRow)
            col.addView(LiteTheme.spacer(context, 8))

            // Switches
            val autoSwitch = Switch(context).apply {
                text = LiteStrings.t(lang, "autoPause")
                setTextColor(palette.textPrimary)
                isChecked = st.autoPauseEnabled
                setOnCheckedChangeListener { _, checked -> recorder.setAutoPause(checked) }
            }
            val simSwitch = Switch(context).apply {
                text = LiteStrings.t(lang, "gpsSimulator")
                setTextColor(palette.textPrimary)
                isChecked = st.simMode
                isEnabled = st.phase == LitePhase.IDLE
                setOnCheckedChangeListener { _, checked -> recorder.setSimMode(checked) }
            }
            col.addView(autoSwitch)
            col.addView(simSwitch)
            col.addView(LiteTheme.spacer(context, 10))

            // Live metrics card
            val metricsCard = LiteTheme.card(context, palette, 16)
            val statusText = when (st.phase) {
                LitePhase.IDLE -> "READY"
                LitePhase.RECORDING -> "● LIVE GPS"
                LitePhase.PAUSED -> "PAUSED"
                LitePhase.AUTO_PAUSED -> "AUTO-PAUSED"
            }
            val statusColor = when (st.phase) {
                LitePhase.RECORDING -> palette.success
                LitePhase.PAUSED, LitePhase.AUTO_PAUSED -> palette.warning
                else -> palette.textSecondary
            }
            metricsCard.addView(LiteTheme.label(context, palette, statusText, 12.5f, bold = true, colorOverride = statusColor))
            metricsCard.addView(LiteTheme.spacer(context, 4))
            val distStr = TrackProcessorLite.formatDistance(st.metrics.distanceM, units)
            metricsCard.addView(LiteTheme.label(context, palette, distStr, 30f, bold = true).apply { gravity = Gravity.CENTER_HORIZONTAL })
            metricsCard.addView(LiteTheme.spacer(context, 6))
            val subStats = "${LiteStrings.t(lang, "movingTime")}: ${TrackProcessorLite.formatDuration(st.metrics.movingTimeS)}   ·   " +
                "${LiteStrings.t(lang, "pace")}: ${TrackProcessorLite.formatPaceOrSpeed(st.activityType, st.metrics.avgSpeedMps, units)}   ·   " +
                "Pts: ${st.points.size}"
            metricsCard.addView(LiteTheme.label(context, palette, subStats, 13f, secondary = true).apply { gravity = Gravity.CENTER_HORIZONTAL })
            col.addView(metricsCard)
            col.addView(LiteTheme.spacer(context, 12))

            if (st.phase == LitePhase.IDLE) {
                col.addView(
                    LiteTheme.pillButton(context, palette, LiteStrings.t(lang, "startRecording"), primary = true).apply {
                        setOnClickListener { recorder.startRecording(st.simMode) }
                    }
                )
                col.addView(LiteTheme.spacer(context, 8))
                val toolsRow = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
                toolsRow.addView(
                    LiteTheme.pillButton(context, palette, LiteStrings.t(lang, "manualEntry"), primary = false).apply {
                        setOnClickListener { showManualDialog() }
                    },
                    LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                )
                toolsRow.addView(View(context), LinearLayout.LayoutParams(LiteTheme.dp(context, 8), 1))
                toolsRow.addView(
                    LiteTheme.pillButton(context, palette, LiteStrings.t(lang, "importGpx"), primary = false).apply {
                        setOnClickListener { onPickGpx() }
                    },
                    LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                )
                col.addView(toolsRow)
            } else {
                val titleInput = LiteTheme.inputField(context, palette, "Activity Title (optional)", InputType.TYPE_CLASS_TEXT)
                col.addView(titleInput)
                col.addView(LiteTheme.spacer(context, 10))
                val ctrlRow = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
                val pauseOrResume = if (st.phase == LitePhase.PAUSED) {
                    LiteTheme.pillButton(context, palette, LiteStrings.t(lang, "resume"), primary = false).apply {
                        setOnClickListener { recorder.resumeRecording() }
                    }
                } else {
                    LiteTheme.pillButton(context, palette, LiteStrings.t(lang, "pause"), primary = false).apply {
                        setOnClickListener { recorder.pauseRecording() }
                    }
                }
                val stopSaveBtn = LiteTheme.pillButton(context, palette, LiteStrings.t(lang, "stopSave"), primary = true).apply {
                    setOnClickListener {
                        recorder.stopAndSave(titleInput.text.toString()) { ok, err ->
                            Toast.makeText(
                                context,
                                if (ok) "Saved & synced! Offline SQLite compacted." else "Saved offline (${err ?: "queued"})",
                                Toast.LENGTH_SHORT
                            ).show()
                        }
                    }
                }
                ctrlRow.addView(pauseOrResume, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
                ctrlRow.addView(View(context), LinearLayout.LayoutParams(LiteTheme.dp(context, 8), 1))
                ctrlRow.addView(stopSaveBtn, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
                col.addView(ctrlRow)
            }

            if (st.pendingQueueCount > 0) {
                col.addView(LiteTheme.spacer(context, 10))
                col.addView(
                    LiteTheme.pillButton(
                        context, palette,
                        "${LiteStrings.t(lang, "offlineSync")} (${st.pendingQueueCount})",
                        primary = false
                    ).apply {
                        setOnClickListener {
                            recorder.syncPendingQueue { ok, err ->
                                Toast.makeText(context, if (ok) "Queue synced & vacuumed" else (err ?: "Retry failed"), Toast.LENGTH_SHORT).show()
                            }
                        }
                    }
                )
            }
        }

        recorder.onStateChanged = { render() }
        render()
        scroll.addView(col)
        return scroll
    }

    private fun showManualDialog() {
        val titleBox = EditText(context).apply { setText("Manual Track Run") }
        val distBox = EditText(context).apply { setText("5.0"); inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL; hint = "Distance (km)" }
        val minBox = EditText(context).apply { setText("28"); inputType = InputType.TYPE_CLASS_NUMBER; hint = "Minutes" }
        val wrap = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            val p = LiteTheme.dp(context, 16)
            setPadding(p, p / 2, p, 0)
            addView(titleBox)
            addView(distBox)
            addView(minBox)
        }
        AlertDialog.Builder(context)
            .setTitle(LiteStrings.t(prefs.language, "manualEntry"))
            .setView(wrap)
            .setPositiveButton("Save") { _, _ ->
                val distKm = distBox.text.toString().toDoubleOrNull() ?: 5.0
                val mins = minBox.text.toString().toIntOrNull() ?: 28
                val payload = JSONObject()
                    .put("clientId", java.util.UUID.randomUUID().toString())
                    .put("title", titleBox.text.toString().trim().ifEmpty { "Manual Run" })
                    .put("activityType", "run")
                    .put("source", "manual")
                    .put("visibility", "followers")
                    .put("startedAt", java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US).apply {
                        timeZone = java.util.TimeZone.getTimeZone("UTC")
                    }.format(java.util.Date()))
                    .put("durationS", mins * 60)
                    .put("distanceM", distKm * 1000.0)
                    .put("elevationGainM", 25.0)
                    .toString()
                runBg {
                    try {
                        api.uploadActivityIdempotent(java.util.UUID.randomUUID().toString(), payload)
                        runUi { Toast.makeText(context, "Manual activity logged", Toast.LENGTH_SHORT).show() }
                    } catch (e: Throwable) {
                        runUi { Toast.makeText(context, e.message, Toast.LENGTH_SHORT).show() }
                    }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
}

class ClubsTabBuilder(
    private val context: Context,
    private val palette: LitePalette,
    private val prefs: SecurePrefs,
    private val api: StrideLiteApi,
    private val runBg: (() -> Unit) -> Unit,
    private val runUi: (() -> Unit) -> Unit,
) {
    private var showChallenges = false
    private var clubs: List<JSONObject> = emptyList()
    private var challenges: List<JSONObject> = emptyList()

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
            tabs.addView(
                LiteTheme.pillButton(context, palette, LiteStrings.t(lang, "clubs"), primary = !showRoutesFlag()).apply {
                    setOnClickListener { showChallenges = false; renderTabs(); load(listCol) }
                },
                LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            )
            tabs.addView(View(context), LinearLayout.LayoutParams(LiteTheme.dp(context, 8), 1))
            tabs.addView(
                LiteTheme.pillButton(context, palette, LiteStrings.t(lang, "challenges"), primary = showRoutesFlag()).apply {
                    setOnClickListener { showChallenges = true; renderTabs(); load(listCol) }
                },
                LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            )
        }

        renderTabs()
        root.addView(tabs)
        root.addView(ScrollView(context).apply { addView(listCol) }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        load(listCol)
        return root
    }

    private fun showRoutesFlag() = showChallenges

    private fun load(listCol: LinearLayout) {
        runBg {
            try {
                if (!showChallenges) {
                    val c = jsonArrayToList(api.fetchClubs())
                    runUi { clubs = c; renderList(listCol) }
                } else {
                    val ch = jsonArrayToList(api.fetchChallenges())
                    runUi { challenges = ch; renderList(listCol) }
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
        val lang = prefs.language
        listCol.removeAllViews()
        val data = if (showChallenges) challenges else clubs
        if (data.isEmpty()) {
            listCol.addView(LiteTheme.label(context, palette, LiteStrings.t(lang, "noItems"), 14f, secondary = true))
            return
        }
        for (item in data) {
            val card = LiteTheme.card(context, palette, 14)
            val id = item.optString("id")
            if (!showChallenges) {
                val status = item.optString("membership_status")
                val joined = status == "accepted" || status == "pending" || item.optBoolean("isMember", false)
                val members = if (item.has("member_count")) item.optInt("member_count", 0) else item.optInt("memberCount", 0)
                card.addView(LiteTheme.label(context, palette, item.optString("name"), 16f, bold = true))
                card.addView(LiteTheme.label(context, palette, "${item.optString("city")} · $members members", 13f, secondary = true))
                card.addView(LiteTheme.spacer(context, 8))
                card.addView(
                    LiteTheme.pillButton(
                        context, palette,
                        if (joined) LiteStrings.t(lang, "leave") else LiteStrings.t(lang, "join"),
                        primary = !joined
                    ).apply {
                        setOnClickListener {
                            runBg {
                                try {
                                    api.toggleClubMembership(id, joined)
                                    load(listCol)
                                } catch (e: Throwable) {
                                    runUi { Toast.makeText(context, e.message, Toast.LENGTH_SHORT).show() }
                                }
                            }
                        }
                    }
                )
            } else {
                val joined = item.optBoolean("viewer_joined", false) || item.optBoolean("joined", false)
                card.addView(LiteTheme.label(context, palette, item.optString("title"), 16f, bold = true))
                card.addView(LiteTheme.label(context, palette, item.optString("description"), 13f, secondary = true))
                card.addView(LiteTheme.spacer(context, 8))
                card.addView(
                    LiteTheme.pillButton(
                        context, palette,
                        if (joined) LiteStrings.t(lang, "joined") else LiteStrings.t(lang, "join"),
                        primary = !joined
                    ).apply {
                        setOnClickListener {
                            runBg {
                                try {
                                    api.toggleChallengeMembership(id, joined)
                                    load(listCol)
                                } catch (e: Throwable) {
                                    runUi { Toast.makeText(context, e.message, Toast.LENGTH_SHORT).show() }
                                }
                            }
                        }
                    }
                )
            }
            listCol.addView(card)
            listCol.addView(LiteTheme.spacer(context, 10))
        }
    }
}
