package com.stride.tracker.lite

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.Toast
import com.stride.tracker.lite.core.LitePalette
import com.stride.tracker.lite.core.LiteStrings
import com.stride.tracker.lite.core.LiteTheme
import com.stride.tracker.lite.core.SecurePrefs
import com.stride.tracker.lite.location.LiteRecorder
import com.stride.tracker.lite.net.StrideLiteApi
import com.stride.tracker.lite.storage.LiteStorageGuardian
import com.stride.tracker.lite.ui.AuthScreenBuilder
import com.stride.tracker.lite.ui.ClubsTabBuilder
import com.stride.tracker.lite.ui.ExploreTabBuilder
import com.stride.tracker.lite.ui.FeedTabBuilder
import com.stride.tracker.lite.ui.ProfileTabBuilder
import com.stride.tracker.lite.ui.RecordTabBuilder
import java.util.concurrent.Executors

class MainActivity : Activity() {
    companion object {
        private const val REQ_GPX_PICK = 9102
    }

    private lateinit var prefs: SecurePrefs
    private lateinit var guardian: LiteStorageGuardian
    private lateinit var api: StrideLiteApi
    private lateinit var recorder: LiteRecorder

    private val executor = Executors.newCachedThreadPool()
    private val mainHandler = Handler(Looper.getMainLooper())
    private var tabIndex = 0
    private var rootFrame: LinearLayout? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = SecurePrefs(applicationContext)
        guardian = LiteStorageGuardian(applicationContext)
        api = StrideLiteApi(prefs, guardian)
        recorder = LiteRecorder(applicationContext, prefs, guardian, api)

        guardian.sweepTempDirs()
        guardian.enforceCacheCap(prefs.cacheCapBytes)

        handleOAuthIntent(intent)
        renderRoot()
        checkRecoveryAndSync()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleOAuthIntent(intent)
    }

    override fun onStop() {
        super.onStop()
        if (prefs.autoPurgeOnClose) {
            guardian.sweepTempDirs()
        }
    }

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }

    private fun handleOAuthIntent(intent: Intent?) {
        val data: Uri = intent?.data ?: return
        if (data.scheme != "stride-lite" || data.host != "oauth") return
        val oauthCode = data.getQueryParameter("oauthCode")
        val err = data.getQueryParameter("error")
        if (!err.isNullOrBlank()) {
            Toast.makeText(this, "Google sign-in error: $err", Toast.LENGTH_LONG).show()
            return
        }
        if (!oauthCode.isNullOrBlank()) {
            runBg {
                try {
                    api.exchangeOAuthCode(oauthCode)
                    runUi {
                        Toast.makeText(this, "Signed in with Google", Toast.LENGTH_SHORT).show()
                        renderRoot()
                        checkRecoveryAndSync()
                    }
                } catch (e: Throwable) {
                    runUi { Toast.makeText(this, e.message ?: "OAuth failed", Toast.LENGTH_LONG).show() }
                }
            }
        }
    }

    @Deprecated("Platform Activity result for lightweight GPX picker without AndroidX overhead")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQ_GPX_PICK && resultCode == RESULT_OK) {
            val uri = data?.data ?: return
            runBg {
                try {
                    val xml = contentResolver.openInputStream(uri)?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }
                        ?: throw IllegalStateException("Unable to read GPX file")
                    api.importGpxMultipart(xml, null, recorder.state.activityType, "followers")
                    runUi { Toast.makeText(this, "GPX imported to Stride!", Toast.LENGTH_SHORT).show() }
                } catch (e: Throwable) {
                    runUi { Toast.makeText(this, e.message ?: "GPX import failed", Toast.LENGTH_LONG).show() }
                }
            }
        }
    }

    private fun checkRecoveryAndSync() {
        if (!prefs.hasSession()) return
        recorder.syncPendingQueue()
        val draft = recorder.checkUnfinishedDraft() ?: return
        if (draft.points.isEmpty()) {
            recorder.discardDraft(draft.clientId)
            return
        }
        val lang = prefs.language
        AlertDialog.Builder(this)
            .setTitle(LiteStrings.t(lang, "recoveryTitle"))
            .setMessage("${LiteStrings.t(lang, "recoveryBody")} (${draft.points.size} GPS pts)")
            .setPositiveButton(LiteStrings.t(lang, "recover")) { _, _ ->
                recorder.recoverDraft(draft)
                tabIndex = 2
                renderRoot()
            }
            .setNegativeButton(LiteStrings.t(lang, "discard")) { _, _ ->
                recorder.discardDraft(draft.clientId)
            }
            .setCancelable(false)
            .show()
    }

    private fun renderRoot() {
        val palette = LiteTheme.resolve(this, prefs.themeMode)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            window.statusBarColor = palette.surface
            window.navigationBarColor = palette.surface
        }

        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(palette.bg)
            fitsSystemWindows = true
        }
        rootFrame = container

        if (!prefs.hasSession()) {
            val authView = AuthScreenBuilder(
                context = this,
                palette = palette,
                prefs = prefs,
                api = api,
                runBg = ::runBg,
                runUi = ::runUi,
                onSignedIn = {
                    renderRoot()
                    checkRecoveryAndSync()
                }
            ).build()
            container.addView(authView, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
            setContentView(container)
            return
        }

        val lang = prefs.language
        val padH = LiteTheme.dp(this, 14)
        val padV = LiteTheme.dp(this, 10)
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(palette.surface)
            setPadding(padH, padV, padH, padV)
        }
        header.addView(
            LiteTheme.label(this@MainActivity, palette, "Stride Lite", 19f, bold = true),
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        )
        val b = guardian.measureStorageBreakdown(prefs.cacheCapBytes)
        val memBadge = String.format(java.util.Locale.US, "%.0f KB cache", b.totalManagedBytes / 1024.0)
        header.addView(LiteTheme.label(this@MainActivity, palette, memBadge, 11.5f, bold = true, colorOverride = palette.secondary))
        container.addView(header)

        val contentView: View = when (tabIndex) {
            0 -> FeedTabBuilder(this, palette, prefs, api, ::runBg, ::runUi).build()
            1 -> ExploreTabBuilder(this, palette, prefs, api, ::runBg, ::runUi).build()
            2 -> RecordTabBuilder(this, palette, prefs, api, recorder, ::runBg, ::runUi) {
                val i = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                }
                @Suppress("DEPRECATION")
                startActivityForResult(i, REQ_GPX_PICK)
            }.build()
            3 -> ClubsTabBuilder(this, palette, prefs, api, ::runBg, ::runUi).build()
            else -> ProfileTabBuilder(
                context = this,
                palette = palette,
                prefs = prefs,
                guardian = guardian,
                api = api,
                runBg = ::runBg,
                runUi = ::runUi,
                onAppearanceOrLocaleChanged = { renderRoot() },
                onSignOut = {
                    prefs.clearSession()
                    guardian.clearAllCaches()
                    tabIndex = 0
                    renderRoot()
                }
            ).build()
        }
        container.addView(contentView, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        container.addView(buildBottomNav(palette, lang))
        setContentView(container)
    }

    private fun buildBottomNav(palette: LitePalette, lang: String): View {
        val nav = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(palette.surface)
            val vp = LiteTheme.dp(this@MainActivity, 6)
            setPadding(LiteTheme.dp(this@MainActivity, 4), vp, LiteTheme.dp(this@MainActivity, 4), vp)
        }
        val items = listOf(
            LiteStrings.t(lang, "tabFeed"),
            LiteStrings.t(lang, "tabExplore"),
            LiteStrings.t(lang, "tabRecord"),
            LiteStrings.t(lang, "tabClubs"),
            LiteStrings.t(lang, "tabProfile"),
        )
        items.forEachIndexed { idx, label ->
            val selected = idx == tabIndex
            val btn = Button(this).apply {
                text = label
                isAllCaps = false
                textSize = 11.5f
                setTypeface(typeface, if (selected) Typeface.BOLD else Typeface.NORMAL)
                setTextColor(if (selected) palette.accent else palette.textSecondary)
                setBackgroundColor(Color.TRANSPARENT)
                minHeight = LiteTheme.dp(this@MainActivity, 44)
                setPadding(0, 0, 0, 0)
                setOnClickListener {
                    if (tabIndex != idx) {
                        tabIndex = idx
                        renderRoot()
                    }
                }
            }
            nav.addView(btn, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        }
        return nav
    }

    private fun runBg(block: () -> Unit) {
        executor.execute(block)
    }

    private fun runUi(block: () -> Unit) {
        mainHandler.post(block)
    }
}
