package com.stride.tracker.lite.core

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.stride.tracker.lite.BuildConfig
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SecurePrefs(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("stride_lite_v2_prefs", Context.MODE_PRIVATE)

    companion object {
        private const val KEY_ALIAS = "stride_lite_v2_aes"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"

        const val CAP_1_MB = 1024L * 1024L
        const val CAP_2_MB = 2L * 1024L * 1024L
        const val CAP_5_MB = 5L * 1024L * 1024L
    }

    private fun getOrCreateSecretKey(): SecretKey {
        val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        ks.getKey(KEY_ALIAS, null)?.let { return it as SecretKey }
        val kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        kg.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return kg.generateKey()
    }

    private fun putSecret(key: String, value: String?) {
        if (value.isNullOrEmpty()) {
            prefs.edit().remove(key).apply()
            return
        }
        try {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateSecretKey())
            val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
            val iv = cipher.iv
            val combined = ByteArray(iv.size + encrypted.size)
            System.arraycopy(iv, 0, combined, 0, iv.size)
            System.arraycopy(encrypted, 0, combined, iv.size, encrypted.size)
            prefs.edit().putString(key, Base64.encodeToString(combined, Base64.NO_WRAP)).apply()
        } catch (_: Throwable) {
            prefs.edit().putString(key, value).apply()
        }
    }

    private fun getSecret(key: String): String? {
        val raw = prefs.getString(key, null) ?: return null
        return try {
            val combined = Base64.decode(raw, Base64.NO_WRAP)
            if (combined.size <= 12) return null
            val iv = combined.copyOfRange(0, 12)
            val cipherText = combined.copyOfRange(12, combined.size)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateSecretKey(), GCMParameterSpec(128, iv))
            String(cipher.doFinal(cipherText), Charsets.UTF_8)
        } catch (_: Throwable) {
            raw
        }
    }

    var accessToken: String?
        get() = getSecret("access_token")
        set(value) = putSecret("access_token", value)

    var refreshToken: String?
        get() = getSecret("refresh_token")
        set(value) = putSecret("refresh_token", value)

    var apiBaseUrl: String
        get() = prefs.getString("api_base_url", BuildConfig.DEFAULT_API_URL) ?: BuildConfig.DEFAULT_API_URL
        set(value) = prefs.edit().putString("api_base_url", value.trimEnd('/')).apply()

    var language: String
        get() = prefs.getString("language", "en") ?: "en"
        set(value) = prefs.edit().putString("language", if (value == "hi") "hi" else "en").apply()

    var themeMode: String
        get() = prefs.getString("theme_mode", "system") ?: "system"
        set(value) = prefs.edit().putString("theme_mode", value).apply()

    var units: String
        get() = prefs.getString("units", "metric") ?: "metric"
        set(value) = prefs.edit().putString("units", if (value == "imperial") "imperial" else "metric").apply()

    var cacheCapBytes: Long
        get() = prefs.getLong("cache_cap_bytes", CAP_2_MB).coerceIn(CAP_1_MB, CAP_5_MB)
        set(value) = prefs.edit().putLong("cache_cap_bytes", value.coerceIn(CAP_1_MB, CAP_5_MB)).apply()

    var dataSaver: Boolean
        get() = prefs.getBoolean("data_saver", false)
        set(value) = prefs.edit().putBoolean("data_saver", value).apply()

    var autoPurgeOnClose: Boolean
        get() = prefs.getBoolean("auto_purge_on_close", false)
        set(value) = prefs.edit().putBoolean("auto_purge_on_close", value).apply()

    var userId: String?
        get() = prefs.getString("user_id", null)
        set(value) = prefs.edit().putString("user_id", value).apply()

    fun hasSession(): Boolean = !accessToken.isNullOrBlank()

    fun clearSession() {
        putSecret("access_token", null)
        putSecret("refresh_token", null)
        userId = null
    }
}
