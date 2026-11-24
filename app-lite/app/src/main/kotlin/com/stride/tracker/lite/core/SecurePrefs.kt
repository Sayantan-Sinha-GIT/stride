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
    private val prefs = context.getSharedPreferences("stride_lite_prefs", Context.MODE_PRIVATE)

    companion object {
        private const val KEY_ALIAS = "stride_lite_aes_key_v1"
        private const val ACCESS_KEY = "enc_access_token"
        private const val REFRESH_KEY = "enc_refresh_token"
        private const val BASE_URL_KEY = "api_base_url"
        private const val THEME_KEY = "theme_mode"
        private const val LANG_KEY = "language"
        private const val UNITS_KEY = "units"
        private const val DATA_SAVER_KEY = "data_saver"
        private const val AUTO_PURGE_KEY = "auto_purge_cache"
        private const val CACHE_CAP_KEY = "cache_cap_bytes"

        const val DEFAULT_CACHE_CAP_BYTES = 2L * 1024L * 1024L
    }

    private fun getOrCreateKey(): SecretKey? {
        return try {
            val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            val existing = ks.getKey(KEY_ALIAS, null) as? SecretKey
            if (existing != null) return existing
            val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            val spec = KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
            gen.init(spec)
            gen.generateKey()
        } catch (_: Throwable) {
            null
        }
    }

    private fun encrypt(plain: String): String {
        val key = getOrCreateKey() ?: return "plain:$plain"
        return try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, key)
            val iv = cipher.iv
            val enc = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
            val combined = ByteArray(1 + iv.size + enc.size)
            combined[0] = iv.size.toByte()
            System.arraycopy(iv, 0, combined, 1, iv.size)
            System.arraycopy(enc, 0, combined, 1 + iv.size, enc.size)
            "gcm:${Base64.encodeToString(combined, Base64.NO_WRAP)}"
        } catch (_: Throwable) {
            "plain:$plain"
        }
    }

    private fun decrypt(raw: String?): String? {
        if (raw.isNullOrEmpty()) return null
        if (raw.startsWith("plain:")) return raw.removePrefix("plain:")
        if (!raw.startsWith("gcm:")) return raw
        val key = getOrCreateKey() ?: return null
        return try {
            val combined = Base64.decode(raw.removePrefix("gcm:"), Base64.NO_WRAP)
            val ivLen = combined[0].toInt() and 0xFF
            val iv = combined.copyOfRange(1, 1 + ivLen)
            val enc = combined.copyOfRange(1 + ivLen, combined.size)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
            String(cipher.doFinal(enc), Charsets.UTF_8)
        } catch (_: Throwable) {
            null
        }
    }

    var accessToken: String?
        get() = decrypt(prefs.getString(ACCESS_KEY, null))
        set(value) {
            if (value.isNullOrEmpty()) {
                prefs.edit().remove(ACCESS_KEY).apply()
            } else {
                prefs.edit().putString(ACCESS_KEY, encrypt(value)).apply()
            }
        }

    var refreshToken: String?
        get() = decrypt(prefs.getString(REFRESH_KEY, null))
        set(value) {
            if (value.isNullOrEmpty()) {
                prefs.edit().remove(REFRESH_KEY).apply()
            } else {
                prefs.edit().putString(REFRESH_KEY, encrypt(value)).apply()
            }
        }

    fun clearSession() {
        prefs.edit().remove(ACCESS_KEY).remove(REFRESH_KEY).apply()
    }

    fun hasSession(): Boolean = !accessToken.isNullOrEmpty()

    var baseUrl: String
        get() = prefs.getString(BASE_URL_KEY, null)?.takeIf { it.isNotBlank() }
            ?: BuildConfig.DEFAULT_API_URL
        set(value) {
            val clean = value.trim().trimEnd('/')
            if (clean.isEmpty()) prefs.edit().remove(BASE_URL_KEY).apply()
            else prefs.edit().putString(BASE_URL_KEY, clean).apply()
        }

    var themeMode: String
        get() = prefs.getString(THEME_KEY, "dark") ?: "dark"
        set(value) = prefs.edit().putString(THEME_KEY, value).apply()

    var language: String
        get() = prefs.getString(LANG_KEY, "en") ?: "en"
        set(value) = prefs.edit().putString(LANG_KEY, value).apply()

    var units: String
        get() = prefs.getString(UNITS_KEY, "metric") ?: "metric"
        set(value) = prefs.edit().putString(UNITS_KEY, value).apply()

    var dataSaver: Boolean
        get() = prefs.getBoolean(DATA_SAVER_KEY, true)
        set(value) = prefs.edit().putBoolean(DATA_SAVER_KEY, value).apply()

    var autoPurgeOnClose: Boolean
        get() = prefs.getBoolean(AUTO_PURGE_KEY, false)
        set(value) = prefs.edit().putBoolean(AUTO_PURGE_KEY, value).apply()

    var cacheCapBytes: Long
        get() = prefs.getLong(CACHE_CAP_KEY, DEFAULT_CACHE_CAP_BYTES)
        set(value) = prefs.edit().putLong(CACHE_CAP_KEY, value).apply()
}
