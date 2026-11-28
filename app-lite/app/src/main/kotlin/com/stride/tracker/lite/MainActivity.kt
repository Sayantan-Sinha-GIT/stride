package com.stride.tracker.lite

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.MenuItem
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.view.isVisible
import androidx.core.view.updatePadding
import androidx.fragment.app.Fragment
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.snackbar.Snackbar
import com.google.android.material.textfield.TextInputEditText
import com.stride.tracker.lite.core.Formatters
import com.stride.tracker.lite.core.LiteStrings
import com.stride.tracker.lite.core.StrideAppContainer
import com.stride.tracker.lite.databinding.ActivityMainBinding
import com.stride.tracker.lite.ui.*
import kotlin.concurrent.thread

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private lateinit var authController: AuthScreenController
    private var activeTabId: Int = R.id.nav_feed

    override fun onCreate(savedInstanceState: Bundle?) {
        StrideAppContainer.ensure(this)
        StrideAppContainer.applyThemeMode(StrideAppContainer.prefs.themeMode)
        super.onCreate(savedInstanceState)

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        applySystemBarInsetsAndContrast()
        StrideAppContainer.guardian.enforceBudget(StrideAppContainer.prefs.cacheCapBytes)

        authController = AuthScreenController(
            binding = binding.authContainer,
            onAuthenticated = { enterAppShell() },
            onLocaleToggled = {
                applyNavLabels()
                binding.tvBrandTitle.text = LiteStrings[StrideAppContainer.prefs.language, "brand"]
            }
        )
        authController.bind()

        binding.topBar.setOnMenuItemClickListener { item -> onToolbarMenu(item) }
        binding.bottomNav.setOnItemSelectedListener { item ->
            activeTabId = item.itemId
            showTab(item.itemId)
            true
        }

        handleIncomingUri(intent?.data)

        if (StrideAppContainer.prefs.hasSession()) {
            enterAppShell()
        } else {
            showAuthScreen()
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIncomingUri(intent.data)
    }

    override fun onStop() {
        super.onStop()
        if (StrideAppContainer.prefs.autoPurgeOnClose) {
            StrideAppContainer.guardian.clearAllCaches()
        } else {
            StrideAppContainer.guardian.sweepTempDirs()
        }
    }

    private fun applySystemBarInsetsAndContrast() {
        val dark = StrideAppContainer.isDarkActive(this)
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.isAppearanceLightStatusBars = !dark
        controller.isAppearanceLightNavigationBars = !dark

        val tintColor = getColor(R.color.stride_text_primary)
        for (i in 0 until binding.topBar.menu.size()) {
            binding.topBar.menu.getItem(i)?.icon?.mutate()?.setTint(tintColor)
        }

        ViewCompat.setOnApplyWindowInsetsListener(binding.rootCoordinator) { _, insets ->
            val sys = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            binding.appBar.updatePadding(top = sys.top)
            binding.bottomNav.updatePadding(bottom = sys.bottom)
            insets
        }
    }

    private fun handleIncomingUri(uri: Uri?) {
        if (uri == null || uri.scheme != "stride-lite") return
        val oauthCode = uri.getQueryParameter("oauthCode")
        if (!oauthCode.isNullOrBlank()) {
            thread {
                runCatching {
                    StrideAppContainer.api.exchangeOAuthCode(oauthCode)
                    runOnUiThread { enterAppShell() }
                }.onFailure { err ->
                    runOnUiThread {
                        Snackbar.make(binding.root, err.message ?: "Google sign-in failed", Snackbar.LENGTH_LONG).show()
                    }
                }
            }
        }
    }

    fun showAuthScreen() {
        binding.appBar.isVisible = false
        binding.bottomNav.isVisible = false
        binding.fragmentContainer.isVisible = false
        binding.authContainer.root.isVisible = true
        authController.refreshLabels()
    }

    private fun enterAppShell() {
        binding.authContainer.root.isVisible = false
        binding.appBar.isVisible = true
        binding.bottomNav.isVisible = true
        binding.fragmentContainer.isVisible = true
        applyNavLabels()
        updateCachePill()
        showTab(activeTabId)

        // Ensure user ID and offline sync queue flush cleanly on startup
        thread {
            runCatching { StrideAppContainer.api.fetchMe() }
            runCatching { StrideAppContainer.recorder.flushPendingQueue() }
            runOnUiThread { updateCachePill() }
        }
    }

    fun onLanguageOrThemeChanged() {
        applyNavLabels()
        applySystemBarInsetsAndContrast()
        binding.tvBrandTitle.text = LiteStrings[StrideAppContainer.prefs.language, "brand"]
    }

    fun updateCachePill() {
        val breakdown = StrideAppContainer.guardian.measureStorageBreakdown()
        binding.tvCacheBadge.text = "${Formatters.bytes(breakdown.totalCacheBytes)} cache"
    }

    private fun applyNavLabels() {
        val lang = StrideAppContainer.prefs.language
        binding.tvBrandTitle.text = LiteStrings[lang, "brand"]
        val m = binding.bottomNav.menu
        m.findItem(R.id.nav_feed)?.title = LiteStrings[lang, "feed"]
        m.findItem(R.id.nav_explore)?.title = LiteStrings[lang, "explore"]
        m.findItem(R.id.nav_record)?.title = LiteStrings[lang, "record"]
        m.findItem(R.id.nav_clubs)?.title = LiteStrings[lang, "clubs"]
        m.findItem(R.id.nav_profile)?.title = LiteStrings[lang, "profile"]
    }

    private fun showTab(tabId: Int) {
        val tag = "tab_$tabId"
        val fm = supportFragmentManager
        val existing = fm.findFragmentByTag(tag)
        val tx = fm.beginTransaction()
        for (frag in fm.fragments) {
            if (frag != existing) tx.hide(frag)
        }
        val target: Fragment = existing ?: when (tabId) {
            R.id.nav_explore -> ExploreFragment()
            R.id.nav_record -> RecordFragment()
            R.id.nav_clubs -> CommunityFragment()
            R.id.nav_profile -> ProfileFragment()
            else -> FeedFragment()
        }
        if (existing == null) {
            tx.add(R.id.fragmentContainer, target, tag)
        } else {
            tx.show(target)
        }
        tx.commitNowAllowingStateLoss()
        (target as? RefreshableTab)?.refreshContent()
    }

    private fun onToolbarMenu(item: MenuItem): Boolean = when (item.itemId) {
        R.id.action_search -> {
            openSearchAthletesDialog()
            true
        }
        R.id.action_notifications -> {
            openNotificationsDialog()
            true
        }
        else -> false
    }

    private fun openSearchAthletesDialog() {
        val etQuery = TextInputEditText(this).apply { hint = "Handle, name, or city..." }
        MaterialAlertDialogBuilder(this)
            .setTitle(LiteStrings[StrideAppContainer.prefs.language, "searchAthletes"])
            .setView(etQuery)
            .setNegativeButton("Close", null)
            .setPositiveButton("Search") { _, _ ->
                val q = etQuery.text.toString().trim()
                thread {
                    val users = runCatching { StrideAppContainer.api.searchUsers(q) }.getOrNull()
                    runOnUiThread {
                        if (users == null || users.length() == 0) {
                            Snackbar.make(binding.root, "No matching athletes found.", Snackbar.LENGTH_SHORT).show()
                        } else {
                            val names = Array(users.length()) { i ->
                                val u = users.optJSONObject(i)
                                "${u?.optString("display_name")} (@${u?.optString("handle")}) · ${u?.optString("home_city")}"
                            }
                            MaterialAlertDialogBuilder(this)
                                .setTitle("Athletes (${names.size})")
                                .setItems(names) { _, idx ->
                                    val chosen = users.optJSONObject(idx) ?: return@setItems
                                    val uid = chosen.optString("id")
                                    thread {
                                        runCatching {
                                            StrideAppContainer.api.toggleFollow(uid, following = false)
                                            runOnUiThread {
                                                Snackbar.make(binding.root, "Follow updated for @${chosen.optString("handle")}", Snackbar.LENGTH_SHORT).show()
                                            }
                                        }
                                    }
                                }
                                .setNegativeButton("Close", null)
                                .show()
                        }
                    }
                }
            }
            .show()
    }

    private fun openNotificationsDialog() {
        val lang = StrideAppContainer.prefs.language
        thread {
            val arr = runCatching { StrideAppContainer.api.fetchNotifications() }.getOrNull()
            runOnUiThread {
                val col = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    val pad = (resources.displayMetrics.density * 18).toInt()
                    setPadding(pad, pad / 2, pad, 0)
                }
                if (arr == null || arr.length() == 0) {
                    col.addView(TextView(this).apply { text = "All caught up!" })
                } else {
                    for (i in 0 until minOf(arr.length(), 10)) {
                        val n = arr.optJSONObject(i) ?: continue
                        val msg = if (lang == "hi") n.optString("body_hi").ifBlank { n.optString("body_en") } else n.optString("body_en")
                        col.addView(TextView(this).apply {
                            text = "• $msg"
                            setPadding(0, 6, 0, 6)
                        })
                    }
                }
                MaterialAlertDialogBuilder(this)
                    .setTitle(LiteStrings[lang, "notificationsTitle"])
                    .setView(col)
                    .setNegativeButton("Close", null)
                    .setPositiveButton(LiteStrings[lang, "markAllRead"]) { _, _ ->
                        thread { runCatching { StrideAppContainer.api.markAllNotificationsRead() } }
                    }
                    .show()
            }
        }
    }
}
