package com.stride.tracker.lite.ui

import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.text.InputType
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.view.isVisible
import androidx.fragment.app.Fragment
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.snackbar.Snackbar
import com.google.android.material.textfield.TextInputEditText
import com.stride.tracker.lite.MainActivity
import com.stride.tracker.lite.R
import com.stride.tracker.lite.core.Formatters
import com.stride.tracker.lite.core.LiteStrings
import com.stride.tracker.lite.core.SecurePrefs
import com.stride.tracker.lite.core.StrideAppContainer
import com.stride.tracker.lite.databinding.FragmentProfileBinding
import org.json.JSONArray
import org.json.JSONObject
import kotlin.concurrent.thread
import kotlin.math.roundToInt

class ProfileFragment : Fragment(), RefreshableTab {
    private var _binding: FragmentProfileBinding? = null
    private val binding get() = _binding!!
    private var showSettings = false
    private var lastUserObj: JSONObject? = null

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentProfileBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        binding.btnProfileStats.setOnClickListener { switchSubTab(false) }
        binding.btnProfileSettings.setOnClickListener { switchSubTab(true) }

        binding.btnEditProfile.setOnClickListener { openEditProfileDialog() }
        binding.btnAddGoal.setOnClickListener { openAddGoalDialog() }
        binding.btnAddGear.setOnClickListener { openAddGearDialog() }
        binding.btnAddZone.setOnClickListener { openAddZoneDialog() }

        // Storage & Cache Guardian controls
        val sg = binding.storageGuardian
        sg.btnCap1Mb.setOnClickListener { applyCap(SecurePrefs.CAP_1_MB) }
        sg.btnCap2Mb.setOnClickListener { applyCap(SecurePrefs.CAP_2_MB) }
        sg.btnCap5Mb.setOnClickListener { applyCap(SecurePrefs.CAP_5_MB) }
        sg.switchDataSaver.setOnCheckedChangeListener { _, checked ->
            if (StrideAppContainer.prefs.dataSaver != checked) {
                StrideAppContainer.prefs.dataSaver = checked
                renderStorageGuardian()
            }
        }
        sg.switchAutoPurge.setOnCheckedChangeListener { _, checked ->
            StrideAppContainer.prefs.autoPurgeOnClose = checked
        }
        sg.btnClearCacheNow.setOnClickListener {
            val freed = StrideAppContainer.guardian.clearAllCaches()
            renderStorageGuardian()
            (activity as? MainActivity)?.updateCachePill()
            Snackbar.make(binding.root, "Cleared ${Formatters.bytes(freed)} cache & compacted SQLite DB.", Snackbar.LENGTH_SHORT).show()
        }

        // Appearance, Language, Units
        binding.btnThemeSystem.setOnClickListener { setTheme("system") }
        binding.btnThemeLight.setOnClickListener { setTheme("light") }
        binding.btnThemeDark.setOnClickListener { setTheme("dark") }
        binding.btnLangEn.setOnClickListener { setLanguage("en") }
        binding.btnLangHi.setOnClickListener { setLanguage("hi") }
        binding.btnUnitsMetric.setOnClickListener { setUnits("metric") }
        binding.btnUnitsImperial.setOnClickListener { setUnits("imperial") }

        binding.btnExportData.setOnClickListener { exportDataJson() }
        binding.btnSignOut.setOnClickListener { signOutNow() }
        binding.btnDeleteAccount.setOnClickListener { confirmDeleteAccount() }

        applyLabels()
        renderStorageGuardian()
        syncSettingsButtons()
        refreshContent()
    }

    private fun switchSubTab(settings: Boolean) {
        showSettings = settings
        binding.panelStats.isVisible = !settings
        binding.panelSettings.isVisible = settings
        if (settings) renderStorageGuardian()
    }

    private fun applyLabels() {
        val lang = StrideAppContainer.prefs.language
        binding.btnProfileStats.text = LiteStrings[lang, "statsPrs"]
        binding.btnProfileSettings.text = LiteStrings[lang, "settingsCache"]
        binding.tvGoalsHeader.text = LiteStrings[lang, "goalsTitle"]
        binding.tvGearHeader.text = LiteStrings[lang, "gearTitle"]
        binding.tvPrsHeader.text = LiteStrings[lang, "personalRecordsTitle"]
        binding.tvBadgesHeader.text = LiteStrings[lang, "badgesTitle"]
        binding.storageGuardian.tvStorageTitle.text = LiteStrings[lang, "storageTitle"]
        binding.storageGuardian.tvCacheCapLabel.text = LiteStrings[lang, "maxCap"]
        binding.storageGuardian.switchDataSaver.text = LiteStrings[lang, "dataSaver"]
        binding.storageGuardian.switchAutoPurge.text = LiteStrings[lang, "autoPurge"]
        binding.storageGuardian.btnClearCacheNow.text = LiteStrings[lang, "clearCache"]
        binding.tvThemeHeader.text = LiteStrings[lang, "appearance"]
        binding.tvLangHeader.text = LiteStrings[lang, "language"]
        binding.tvUnitsHeader.text = LiteStrings[lang, "units"]
        binding.tvPrivacyHeader.text = LiteStrings[lang, "privacyZones"]
        binding.tvDevicesHeader.text = LiteStrings[lang, "devices"]
        binding.btnExportData.text = LiteStrings[lang, "exportData"]
        binding.btnSignOut.text = LiteStrings[lang, "signOut"]
        binding.btnDeleteAccount.text = LiteStrings[lang, "deleteAccount"]
    }

    private fun applyCap(bytes: Long) {
        StrideAppContainer.prefs.cacheCapBytes = bytes
        StrideAppContainer.guardian.enforceBudget(bytes)
        renderStorageGuardian()
        (activity as? MainActivity)?.updateCachePill()
    }

    private fun setTheme(mode: String) {
        StrideAppContainer.prefs.themeMode = mode
        StrideAppContainer.applyThemeMode(mode)
        thread { runCatching { StrideAppContainer.api.updateSettings(theme = mode) } }
        syncSettingsButtons()
    }

    private fun setLanguage(lang: String) {
        StrideAppContainer.prefs.language = lang
        applyLabels()
        thread { runCatching { StrideAppContainer.api.updateSettings(language = lang) } }
        (activity as? MainActivity)?.onLanguageOrThemeChanged()
        refreshContent()
    }

    private fun setUnits(u: String) {
        StrideAppContainer.prefs.units = u
        thread { runCatching { StrideAppContainer.api.updateSettings(units = u) } }
        syncSettingsButtons()
        refreshContent()
    }

    private fun syncSettingsButtons() {
        val prefs = StrideAppContainer.prefs
        val sg = binding.storageGuardian
        when (prefs.cacheCapBytes) {
            SecurePrefs.CAP_1_MB -> sg.toggleCacheCap.check(sg.btnCap1Mb.id)
            SecurePrefs.CAP_5_MB -> sg.toggleCacheCap.check(sg.btnCap5Mb.id)
            else -> sg.toggleCacheCap.check(sg.btnCap2Mb.id)
        }
        sg.switchDataSaver.isChecked = prefs.dataSaver
        sg.switchAutoPurge.isChecked = prefs.autoPurgeOnClose

        when (prefs.themeMode) {
            "light" -> binding.toggleTheme.check(binding.btnThemeLight.id)
            "dark" -> binding.toggleTheme.check(binding.btnThemeDark.id)
            else -> binding.toggleTheme.check(binding.btnThemeSystem.id)
        }
        binding.toggleLang.check(if (prefs.language == "hi") binding.btnLangHi.id else binding.btnLangEn.id)
        binding.toggleUnits.check(if (prefs.units == "imperial") binding.btnUnitsImperial.id else binding.btnUnitsMetric.id)
    }

    private fun renderStorageGuardian() {
        val sg = binding.storageGuardian
        val cap = StrideAppContainer.prefs.cacheCapBytes
        val s = StrideAppContainer.guardian.measureStorageBreakdown()
        sg.tvStorageBreakdown.text =
            "Cache: ${Formatters.bytes(s.totalCacheBytes)} / ${Formatters.bytes(cap)} cap " +
            "(HTTP ${Formatters.bytes(s.httpCacheBytes)} + Tiles ${Formatters.bytes(s.tileCacheBytes)})\n" +
            "SQLite DB: ${Formatters.bytes(s.dbBytes)} · Temp: ${Formatters.bytes(s.tempBytes)} · Sync Queue: ${s.pendingQueueCount}"
        sg.progressCacheQuota.progress = ((s.totalCacheBytes * 100.0) / cap.coerceAtLeast(1L)).roundToInt().coerceIn(0, 100)
    }

    override fun refreshContent() {
        val b = _binding ?: return
        applyLabels()
        syncSettingsButtons()
        renderStorageGuardian()
        thread {
            val me = runCatching { StrideAppContainer.api.fetchMe() }.getOrNull()
            val dash = runCatching { StrideAppContainer.api.fetchDashboard() }.getOrNull()
            val zones = runCatching { StrideAppContainer.api.fetchPrivacyZones() }.getOrNull()
            val sessions = runCatching { StrideAppContainer.api.fetchSessions() }.getOrNull()
            b.root.post {
                val cur = _binding ?: return@post
                renderProfileData(me, dash, zones, sessions)
                renderStorageGuardian()
                (activity as? MainActivity)?.updateCachePill()
            }
        }
    }

    private fun renderProfileData(me: JSONObject?, dash: JSONObject?, zones: JSONArray?, sessions: JSONArray?) {
        val units = StrideAppContainer.prefs.units
        val u = me?.optJSONObject("user")
        lastUserObj = u
        val name = u?.optString("displayName")?.ifBlank { u.optString("handle") } ?: "Athlete"
        val handle = u?.optString("handle").orEmpty()
        val city = u?.optString("homeCity").orEmpty()
        val streak = dash?.optInt("streakDays", 0) ?: 0

        binding.tvProfileAvatar.text = name.firstOrNull()?.uppercase() ?: "A"
        (binding.tvProfileAvatar.background.mutate() as? GradientDrawable)?.setColor(Formatters.avatarColor(handle.ifBlank { name }))
        binding.tvProfileName.text = name
        binding.tvProfileMeta.text = "@$handle · $city · ${streak}d streak"

        val trend = dash?.optJSONArray("weeklyTrend")
        val weekVals = mutableListOf<Double>()
        if (trend != null) {
            for (i in 0 until trend.length()) {
                val m = trend.optJSONObject(i)?.optDouble("distance_m", 0.0) ?: 0.0
                weekVals.add(m / 1000.0)
            }
        }
        binding.volumeChart.setWeeklyDistancesKm(weekVals)

        // Goals
        binding.goalsContainer.removeAllViews()
        val goals = dash?.optJSONArray("goals")
        if (goals != null && goals.length() > 0) {
            for (i in 0 until goals.length()) {
                val g = goals.optJSONObject(i) ?: continue
                val mType = g.optString("metric_type", "distance_m")
                val cur = g.optDouble("current_value", 0.0).takeIf { !it.isNaN() } ?: 0.0
                val tgt = g.optDouble("target_value", 0.0).takeIf { !it.isNaN() } ?: 0.0
                val progressText = when (mType) {
                    "distance_m" -> "${Formatters.distance(cur, units)} / ${Formatters.distance(tgt, units)}"
                    "moving_time_s" -> "${Formatters.duration(cur.toInt())} / ${Formatters.duration(tgt.toInt())}"
                    else -> "${cur.roundToInt()} / ${tgt.roundToInt()} workouts"
                }
                addInfoLine(binding.goalsContainer, "${g.optString("period")} · $progressText")
            }
        } else {
            addInfoLine(binding.goalsContainer, "No active goals.", secondary = true)
        }

        // Gear
        binding.gearContainer.removeAllViews()
        val gear = dash?.optJSONArray("gear")
        if (gear != null && gear.length() > 0) {
            for (i in 0 until gear.length()) {
                val item = gear.optJSONObject(i) ?: continue
                val initM = item.optDouble("initial_distance_m", 0.0).takeIf { !it.isNaN() } ?: 0.0
                val loggedM = item.optDouble("logged_distance_m", 0.0).takeIf { !it.isNaN() } ?: 0.0
                addInfoLine(
                    binding.gearContainer,
                    "${item.optString("name")} (${item.optString("gear_type")}) · ${Formatters.distance(initM + loggedM, units)}"
                )
            }
        } else {
            addInfoLine(binding.gearContainer, "No gear added yet.", secondary = true)
        }

        // PRs
        binding.prsContainer.removeAllViews()
        val prs = dash?.optJSONArray("records")
        if (prs != null && prs.length() > 0) {
            for (i in 0 until prs.length()) {
                val r = prs.optJSONObject(i) ?: continue
                val key = r.optString("metric_key")
                val valNum = r.optDouble("value_num", 0.0).takeIf { !it.isNaN() } ?: 0.0
                val formatted = when {
                    key.contains("climb") -> "+${Formatters.elevation(valNum, units)}"
                    key.contains("distance") -> Formatters.distance(valNum, units)
                    else -> Formatters.duration(valNum.roundToInt())
                }
                addInfoLine(
                    binding.prsContainer,
                    "$key · $formatted (${r.optString("activity_title")})"
                )
            }
        } else {
            addInfoLine(binding.prsContainer, "No personal records yet.", secondary = true)
        }

        // Badges
        binding.badgesContainer.removeAllViews()
        val badges = dash?.optJSONArray("badges")
        val isHi = StrideAppContainer.prefs.language == "hi"
        if (badges != null && badges.length() > 0) {
            for (i in 0 until badges.length()) {
                val bg = badges.optJSONObject(i) ?: continue
                val title = if (isHi) bg.optString("title_hi").ifBlank { bg.optString("title_en") } else bg.optString("title_en")
                addInfoLine(binding.badgesContainer, "★ $title")
            }
        } else {
            addInfoLine(binding.badgesContainer, "Complete challenges or runs to earn badges.", secondary = true)
        }

        // Privacy zones
        binding.zonesContainer.removeAllViews()
        if (zones != null && zones.length() > 0) {
            for (i in 0 until zones.length()) {
                val z = zones.optJSONObject(i) ?: continue
                val zId = z.optString("id")
                val tv = TextView(requireContext()).apply {
                    text = "• ${z.optString("name")} (${z.optInt("radiusMeters")} m)  [Remove]"
                    setPadding(0, 8, 0, 8)
                    setTextColor(requireContext().getColor(R.color.stride_text_primary))
                    setOnClickListener {
                        thread { runCatching { StrideAppContainer.api.deletePrivacyZone(zId); refreshContent() } }
                    }
                }
                binding.zonesContainer.addView(tv)
            }
        } else {
            addInfoLine(binding.zonesContainer, "No privacy zones configured.", secondary = true)
        }

        // Sessions
        binding.devicesContainer.removeAllViews()
        if (sessions != null && sessions.length() > 0) {
            for (i in 0 until minOf(sessions.length(), 8)) {
                val s = sessions.optJSONObject(i) ?: continue
                val sid = s.optString("id")
                val tv = TextView(requireContext()).apply {
                    text = "• ${s.optString("device_name", "Device")} (${s.optString("ip_hint")})"
                    setPadding(0, 6, 0, 6)
                    setTextColor(requireContext().getColor(R.color.stride_text_secondary))
                    setOnLongClickListener {
                        thread { runCatching { StrideAppContainer.api.revokeSession(sid); refreshContent() } }
                        true
                    }
                }
                binding.devicesContainer.addView(tv)
            }
        }
    }

    private fun addInfoLine(parent: LinearLayout, textValue: String, secondary: Boolean = false) {
        val ctx = context ?: return
        parent.addView(TextView(ctx).apply {
            text = textValue
            setPadding(0, 6, 0, 6)
            setTextColor(ctx.getColor(if (secondary) R.color.stride_text_secondary else R.color.stride_text_primary))
            textSize = 13f
        })
    }

    private fun openEditProfileDialog() {
        val ctx = requireContext()
        val u = lastUserObj
        val col = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            val pad = (resources.displayMetrics.density * 18).toInt()
            setPadding(pad, pad / 2, pad, 0)
        }
        val etName = TextInputEditText(ctx).apply { hint = "Display Name"; setText(u?.optString("displayName").orEmpty()) }
        val etCity = TextInputEditText(ctx).apply { hint = "Home City"; setText(u?.optString("homeCity").orEmpty()) }
        val etBio = TextInputEditText(ctx).apply { hint = "Bio"; setText(u?.optString("bio").orEmpty()) }
        col.addView(etName); col.addView(etCity); col.addView(etBio)
        MaterialAlertDialogBuilder(ctx)
            .setTitle("Edit Profile")
            .setView(col)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Save") { _, _ ->
                thread {
                    runCatching {
                        StrideAppContainer.api.updateProfile(etName.text.toString(), etCity.text.toString(), etBio.text.toString())
                        refreshContent()
                    }
                }
            }
            .show()
    }

    private fun openAddGoalDialog() {
        val ctx = requireContext()
        val etKm = TextInputEditText(ctx).apply {
            hint = "Weekly distance goal (km)"
            setText("30")
            inputType = InputType.TYPE_CLASS_NUMBER
        }
        MaterialAlertDialogBuilder(ctx)
            .setTitle("Add Weekly Goal")
            .setView(etKm)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Create") { _, _ ->
                val meters = (etKm.text.toString().toDoubleOrNull() ?: 30.0) * 1000.0
                thread { runCatching { StrideAppContainer.api.createGoal("weekly", meters); refreshContent() } }
            }
            .show()
    }

    private fun openAddGearDialog() {
        val ctx = requireContext()
        val col = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            val pad = (resources.displayMetrics.density * 18).toInt()
            setPadding(pad, pad / 2, pad, 0)
        }
        val etName = TextInputEditText(ctx).apply { hint = "Shoe or Bike Name" }
        val etType = TextInputEditText(ctx).apply { hint = "Type (shoes / bike)"; setText("shoes") }
        col.addView(etName); col.addView(etType)
        MaterialAlertDialogBuilder(ctx)
            .setTitle("Add Gear")
            .setView(col)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Add") { _, _ ->
                val name = etName.text.toString().trim()
                if (name.isBlank()) return@setPositiveButton
                val gtype = if (etType.text.toString().trim().lowercase() == "bike") "bike" else "shoes"
                thread { runCatching { StrideAppContainer.api.createGear(name, gtype, 0.0); refreshContent() } }
            }
            .show()
    }

    private fun openAddZoneDialog() {
        val ctx = requireContext()
        val col = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            val pad = (resources.displayMetrics.density * 18).toInt()
            setPadding(pad, pad / 2, pad, 0)
        }
        val etName = TextInputEditText(ctx).apply { hint = "Zone Name (e.g. Home)" }
        val etLat = TextInputEditText(ctx).apply { hint = "Latitude"; setText("12.9762"); inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL }
        val etLng = TextInputEditText(ctx).apply { hint = "Longitude"; setText("77.5929"); inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL }
        val etRad = TextInputEditText(ctx).apply { hint = "Radius meters (200-2000)"; setText("300"); inputType = InputType.TYPE_CLASS_NUMBER }
        col.addView(etName); col.addView(etLat); col.addView(etLng); col.addView(etRad)
        MaterialAlertDialogBuilder(ctx)
            .setTitle("Add Privacy Zone")
            .setView(col)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Create") { _, _ ->
                val n = etName.text.toString().ifBlank { "Home" }
                val lat = etLat.text.toString().toDoubleOrNull() ?: 12.9762
                val lng = etLng.text.toString().toDoubleOrNull() ?: 77.5929
                val rad = (etRad.text.toString().toIntOrNull() ?: 300).coerceIn(200, 2000)
                thread { runCatching { StrideAppContainer.api.createPrivacyZone(n, lat, lng, rad); refreshContent() } }
            }
            .show()
    }

    private fun exportDataJson() {
        thread {
            val exported = runCatching { StrideAppContainer.api.exportMyData() }.getOrNull()
            _binding?.root?.post {
                val len = exported?.toString()?.length ?: 0
                Snackbar.make(binding.root, "Account GDPR export ready ($len bytes).", Snackbar.LENGTH_SHORT).show()
            }
        }
    }

    private fun signOutNow() {
        StrideAppContainer.prefs.clearSession()
        StrideAppContainer.guardian.clearAllCaches()
        (activity as? MainActivity)?.showAuthScreen()
    }

    private fun confirmDeleteAccount() {
        MaterialAlertDialogBuilder(requireContext())
            .setTitle("Delete Account?")
            .setMessage("Permanently deletes your Stride account and all activities.")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Delete") { _, _ ->
                thread {
                    runCatching {
                        StrideAppContainer.api.deleteAccount()
                        _binding?.root?.post { signOutNow() }
                    }
                }
            }
            .show()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
