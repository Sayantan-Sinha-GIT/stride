package com.stride.tracker.lite.ui

import android.app.AlertDialog
import android.content.Context
import android.text.InputType
import android.view.View
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.Switch
import android.widget.Toast
import com.stride.tracker.lite.core.LitePalette
import com.stride.tracker.lite.core.LiteStrings
import com.stride.tracker.lite.core.LiteTheme
import com.stride.tracker.lite.core.SecurePrefs
import com.stride.tracker.lite.net.StrideLiteApi
import com.stride.tracker.lite.storage.LiteStorageGuardian
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

class ProfileTabBuilder(
    private val context: Context,
    private val palette: LitePalette,
    private val prefs: SecurePrefs,
    private val guardian: LiteStorageGuardian,
    private val api: StrideLiteApi,
    private val runBg: (() -> Unit) -> Unit,
    private val runUi: (() -> Unit) -> Unit,
    private val onAppearanceOrLocaleChanged: () -> Unit,
    private val onSignOut: () -> Unit,
) {
    private var showSettings = false
    private var me: JSONObject = JSONObject()
    private var dashboard: JSONObject = JSONObject()
    private var zones: List<JSONObject> = emptyList()
    private var sessions: List<JSONObject> = emptyList()
    private var notifications: List<JSONObject> = emptyList()

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
        val bodyCol = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, 0, pad, LiteTheme.dp(context, 28))
        }

        fun renderTabs() {
            tabs.removeAllViews()
            tabs.addView(
                LiteTheme.pillButton(context, palette, LiteStrings.t(lang, "statsPrs"), primary = !showSettings).apply {
                    setOnClickListener { showSettings = false; renderTabs(); renderBody(bodyCol) }
                },
                LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            )
            tabs.addView(View(context), LinearLayout.LayoutParams(LiteTheme.dp(context, 8), 1))
            tabs.addView(
                LiteTheme.pillButton(context, palette, LiteStrings.t(lang, "settingsCache"), primary = showSettings).apply {
                    setOnClickListener { showSettings = true; renderTabs(); renderBody(bodyCol) }
                },
                LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            )
        }

        renderTabs()
        root.addView(tabs)
        root.addView(ScrollView(context).apply { addView(bodyCol) }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        loadAll(bodyCol)
        return root
    }

    private fun loadAll(bodyCol: LinearLayout) {
        runBg {
            try {
                val m = api.fetchMe()
                val d = api.fetchDashboard()
                val z = jsonArrayToList(api.fetchPrivacyZones())
                val s = jsonArrayToList(api.fetchSessions())
                val n = jsonArrayToList(api.fetchNotifications())
                runUi {
                    me = m; dashboard = d; zones = z; sessions = s; notifications = n
                    renderBody(bodyCol)
                }
            } catch (e: Throwable) {
                runUi { renderBody(bodyCol) }
            }
        }
    }

    private fun renderBody(col: LinearLayout) {
        col.removeAllViews()
        if (!showSettings) renderStats(col) else renderSettingsAndStorage(col)
    }

    private fun renderStats(col: LinearLayout) {
        val lang = prefs.language
        val user = me.optJSONObject("user")
        if (user != null) {
            val profileCard = LiteTheme.card(context, palette, 14)
            profileCard.addView(LiteTheme.label(context, palette, user.optString("displayName", "Athlete"), 18f, bold = true))
            profileCard.addView(
                LiteTheme.label(
                    context, palette,
                    "@${user.optString("handle")} · ${user.optString("homeCity", "India")} · ${dashboard.optInt("streakDays", 0)}d streak",
                    13f, secondary = true
                )
            )
            col.addView(profileCard)
            col.addView(LiteTheme.spacer(context, 12))
        }

        col.addView(LiteTheme.label(context, palette, LiteStrings.t(lang, "goalsTitle") ?: "Training Goals", 15f, bold = true))
        val goals = jsonArrayToList(dashboard.optJSONArray("goals") ?: JSONArray())
        for (g in goals) {
            val cur = g.optDouble("current_value", 0.0) / 1000.0
            val tgt = g.optDouble("target_value", 1.0) / 1000.0
            col.addView(LiteTheme.label(context, palette, String.format(Locale.US, "%s · %.1f / %.0f km", g.optString("period"), cur, tgt), 13.5f, secondary = true))
        }
        col.addView(LiteTheme.spacer(context, 10))

        col.addView(LiteTheme.label(context, palette, LiteStrings.t(lang, "personalRecordsTitle") ?: "Personal Records", 15f, bold = true))
        val prs = jsonArrayToList(dashboard.optJSONArray("records") ?: JSONArray())
        for (pr in prs) {
            col.addView(LiteTheme.label(context, palette, "${pr.optString("metric_key")} · ${pr.optString("value_num")} (${pr.optString("activity_title")})", 13f, secondary = true))
        }
        col.addView(LiteTheme.spacer(context, 10))

        col.addView(LiteTheme.label(context, palette, "${LiteStrings.t(lang, "notificationsTitle") ?: "Notifications"} (${notifications.size})", 15f, bold = true))
        for (n in notifications.take(6)) {
            col.addView(LiteTheme.label(context, palette, "• ${n.optString("title")}: ${n.optString("body")}", 12.5f, secondary = true))
        }
    }

    private fun renderSettingsAndStorage(col: LinearLayout) {
        col.removeAllViews()
        val lang = prefs.language

        // 1. Storage & Cache Guardian Card (Signature Stride Lite Feature)
        val guardCard = LiteTheme.card(context, palette, 14)
        guardCard.background = LiteTheme.roundedBox(context, palette.elevated, palette.accent, 16)
        val b = guardian.measureStorageBreakdown(prefs.cacheCapBytes)
        guardCard.addView(LiteTheme.label(context, palette, LiteStrings.t(lang, "storageGuardian"), 16f, bold = true, colorOverride = palette.accent))
        guardCard.addView(LiteTheme.spacer(context, 4))
        val summaryText = String.format(
            Locale.US,
            "Cache: %.1f KB / %.1f MB cap · SQLite DB: %.1f KB · Temp: %.1f KB · Queue: %d",
            b.httpCacheBytes / 1024.0,
            b.capBytes / (1024.0 * 1024.0),
            b.sqliteFileBytes / 1024.0,
            b.tempDirBytes / 1024.0,
            b.pendingQueueCount,
        )
        guardCard.addView(LiteTheme.label(context, palette, summaryText, 12.5f, secondary = true))
        guardCard.addView(LiteTheme.spacer(context, 6))
        val pct = if (b.capBytes > 0) ((b.totalManagedBytes * 100L) / b.capBytes).toInt().coerceIn(0, 100) else 0
        guardCard.addView(ProgressBar(context, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progress = pct
        })
        guardCard.addView(LiteTheme.spacer(context, 8))
        guardCard.addView(LiteTheme.label(context, palette, LiteStrings.t(lang, "cacheCap"), 13f, bold = true))
        guardCard.addView(LiteTheme.spacer(context, 4))

        val capRow = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
        listOf(
            512L * 1024L to "512 KB",
            2L * 1024L * 1024L to "2 MB",
            5L * 1024L * 1024L to "5 MB",
        ).forEachIndexed { idx, (bytes, label) ->
            if (idx > 0) capRow.addView(View(context), LinearLayout.LayoutParams(LiteTheme.dp(context, 6), 1))
            capRow.addView(
                LiteTheme.pillButton(context, palette, label, primary = prefs.cacheCapBytes == bytes).apply {
                    setOnClickListener {
                        prefs.cacheCapBytes = bytes
                        guardian.enforceCacheCap(bytes)
                        renderSettingsAndStorage(col)
                    }
                },
                LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            )
        }
        guardCard.addView(capRow)
        guardCard.addView(LiteTheme.spacer(context, 8))

        guardCard.addView(Switch(context).apply {
            text = LiteStrings.t(lang, "dataSaver")
            setTextColor(palette.textPrimary)
            isChecked = prefs.dataSaver
            setOnCheckedChangeListener { _, checked -> prefs.dataSaver = checked }
        })
        guardCard.addView(Switch(context).apply {
            text = LiteStrings.t(lang, "autoPurge")
            setTextColor(palette.textPrimary)
            isChecked = prefs.autoPurgeOnClose
            setOnCheckedChangeListener { _, checked -> prefs.autoPurgeOnClose = checked }
        })
        guardCard.addView(LiteTheme.spacer(context, 8))
        guardCard.addView(
            LiteTheme.pillButton(context, palette, LiteStrings.t(lang, "clearCache"), primary = true).apply {
                setOnClickListener {
                    val freed = guardian.clearAllCaches()
                    Toast.makeText(
                        context,
                        String.format(Locale.US, "Cleared %.1f KB & compacted SQLite", freed / 1024.0),
                        Toast.LENGTH_SHORT
                    ).show()
                    renderSettingsAndStorage(col)
                }
            }
        )
        col.addView(guardCard)
        col.addView(LiteTheme.spacer(context, 14))

        // 2. Appearance, Language, Units
        col.addView(LiteTheme.label(context, palette, LiteStrings.t(lang, "appearance"), 14.5f, bold = true))
        col.addView(LiteTheme.spacer(context, 4))
        val themeRow = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
        listOf("system" to "System", "light" to "Light", "dark" to "Dark").forEachIndexed { idx, (k, label) ->
            if (idx > 0) themeRow.addView(View(context), LinearLayout.LayoutParams(LiteTheme.dp(context, 6), 1))
            themeRow.addView(
                LiteTheme.pillButton(context, palette, label, primary = prefs.themeMode == k).apply {
                    setOnClickListener {
                        prefs.themeMode = k
                        runBg { try { api.updateSettings(theme = k) } catch (_: Throwable) {} }
                        onAppearanceOrLocaleChanged()
                    }
                },
                LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            )
        }
        col.addView(themeRow)
        col.addView(LiteTheme.spacer(context, 12))

        col.addView(LiteTheme.label(context, palette, LiteStrings.t(lang, "language"), 14.5f, bold = true))
        col.addView(LiteTheme.spacer(context, 4))
        val langRow = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
        listOf("en" to "English", "hi" to "हिन्दी").forEachIndexed { idx, (k, label) ->
            if (idx > 0) langRow.addView(View(context), LinearLayout.LayoutParams(LiteTheme.dp(context, 6), 1))
            langRow.addView(
                LiteTheme.pillButton(context, palette, label, primary = prefs.language == k).apply {
                    setOnClickListener {
                        prefs.language = k
                        runBg { try { api.updateSettings(language = k) } catch (_: Throwable) {} }
                        onAppearanceOrLocaleChanged()
                    }
                },
                LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            )
        }
        col.addView(langRow)
        col.addView(LiteTheme.spacer(context, 12))

        col.addView(LiteTheme.label(context, palette, LiteStrings.t(lang, "units"), 14.5f, bold = true))
        col.addView(LiteTheme.spacer(context, 4))
        val unitRow = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
        listOf("metric" to LiteStrings.t(lang, "metric"), "imperial" to LiteStrings.t(lang, "imperial")).forEachIndexed { idx, (k, label) ->
            if (idx > 0) unitRow.addView(View(context), LinearLayout.LayoutParams(LiteTheme.dp(context, 6), 1))
            unitRow.addView(
                LiteTheme.pillButton(context, palette, label, primary = prefs.units == k).apply {
                    setOnClickListener {
                        prefs.units = k
                        runBg { try { api.updateSettings(units = k) } catch (_: Throwable) {} }
                        renderSettingsAndStorage(col)
                    }
                },
                LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            )
        }
        col.addView(unitRow)
        col.addView(LiteTheme.spacer(context, 14))

        // 3. Privacy Zones & Sessions
        col.addView(LiteTheme.label(context, palette, LiteStrings.t(lang, "privacyZones"), 14.5f, bold = true))
        for (z in zones) {
            col.addView(LiteTheme.label(context, palette, "• ${z.optString("name")} (${z.optInt("radiusMeters", 250)} m)", 13f, secondary = true))
        }
        col.addView(LiteTheme.spacer(context, 4))
        col.addView(LiteTheme.pillButton(context, palette, LiteStrings.t(lang, "addZone"), primary = false).apply {
            setOnClickListener { showAddZoneDialog(col) }
        })
        col.addView(LiteTheme.spacer(context, 12))

        col.addView(LiteTheme.label(context, palette, "${LiteStrings.t(lang, "devices")} (${sessions.size})", 14.5f, bold = true))
        for (s in sessions.take(5)) {
            col.addView(LiteTheme.label(context, palette, "• ${s.optString("deviceName")} (${s.optString("ipHint")})", 12.5f, secondary = true))
        }
        col.addView(LiteTheme.spacer(context, 14))

        col.addView(LiteTheme.pillButton(context, palette, LiteStrings.t(lang, "exportData"), primary = false).apply {
            setOnClickListener {
                runBg {
                    try {
                        val d = api.exportMyData()
                        val cnt = d.optJSONArray("activities")?.length() ?: 0
                        runUi { Toast.makeText(context, "Exported $cnt activities safely.", Toast.LENGTH_SHORT).show() }
                    } catch (e: Throwable) {
                        runUi { Toast.makeText(context, e.message, Toast.LENGTH_SHORT).show() }
                    }
                }
            }
        })
        col.addView(LiteTheme.spacer(context, 8))
        col.addView(LiteTheme.pillButton(context, palette, LiteStrings.t(lang, "signOut"), primary = false, danger = true).apply {
            setOnClickListener { onSignOut() }
        })
        col.addView(LiteTheme.spacer(context, 8))
        col.addView(LiteTheme.pillButton(context, palette, LiteStrings.t(lang, "deleteAccount"), primary = false, danger = true).apply {
            setOnClickListener {
                AlertDialog.Builder(context)
                    .setTitle(LiteStrings.t(lang, "deleteAccount"))
                    .setMessage("All activities, PRs, privacy zones, and tokens will be deleted permanently.")
                    .setPositiveButton("Delete") { _, _ ->
                        runBg {
                            try {
                                api.deleteAccount()
                                runUi { onSignOut() }
                            } catch (e: Throwable) {
                                runUi { Toast.makeText(context, e.message, Toast.LENGTH_SHORT).show() }
                            }
                        }
                    }
                    .setNegativeButton("Cancel", null)
                    .show()
            }
        })
    }

    private fun showAddZoneDialog(col: LinearLayout) {
        val nameBox = EditText(context).apply { setText("Home") }
        val latBox = EditText(context).apply { setText("12.9762"); inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL }
        val lngBox = EditText(context).apply { setText("77.5929"); inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL }
        val wrap = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            val p = LiteTheme.dp(context, 16)
            setPadding(p, p / 2, p, 0)
            addView(nameBox); addView(latBox); addView(lngBox)
        }
        AlertDialog.Builder(context)
            .setTitle(LiteStrings.t(prefs.language, "addZone"))
            .setView(wrap)
            .setPositiveButton("Save") { _, _ ->
                runBg {
                    try {
                        api.createPrivacyZone(
                            nameBox.text.toString().trim().ifEmpty { "Home" },
                            latBox.text.toString().toDoubleOrNull() ?: 12.9762,
                            lngBox.text.toString().toDoubleOrNull() ?: 77.5929,
                            300
                        )
                        loadAll(col)
                    } catch (e: Throwable) {
                        runUi { Toast.makeText(context, e.message, Toast.LENGTH_SHORT).show() }
                    }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
}
