package com.stride.tracker.lite.core

import android.content.Context
import android.content.res.Configuration
import androidx.appcompat.app.AppCompatDelegate
import com.stride.tracker.lite.location.LiteRecorder
import com.stride.tracker.lite.net.StrideLiteApi
import com.stride.tracker.lite.storage.LiteStorageGuardian

object StrideAppContainer {
    @Volatile
    private var initialized = false

    lateinit var prefs: SecurePrefs
        private set
    lateinit var guardian: LiteStorageGuardian
        private set
    lateinit var api: StrideLiteApi
        private set
    lateinit var recorder: LiteRecorder
        private set

    fun ensure(context: Context) {
        if (!initialized) {
            synchronized(this) {
                if (!initialized) {
                    val app = context.applicationContext
                    prefs = SecurePrefs(app)
                    guardian = LiteStorageGuardian(app)
                    api = StrideLiteApi(app, prefs, guardian)
                    recorder = LiteRecorder(app, guardian, api)
                    initialized = true
                }
            }
        }
    }

    fun applyThemeMode(mode: String) {
        val target = when (mode) {
            "light" -> AppCompatDelegate.MODE_NIGHT_NO
            "dark" -> AppCompatDelegate.MODE_NIGHT_YES
            else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
        }
        AppCompatDelegate.setDefaultNightMode(target)
    }

    fun isDarkActive(context: Context): Boolean {
        val mode = prefs.themeMode
        if (mode == "dark") return true
        if (mode == "light") return false
        val mask = context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
        return mask == Configuration.UI_MODE_NIGHT_YES
    }
}
