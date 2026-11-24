package com.stride.tracker.lite.storage

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.stride.tracker.lite.core.LitePoint
import java.io.File

data class LiteDraftSession(
    val clientId: String,
    val activityType: String,
    val startedAtMs: Long,
    val paused: Boolean,
    val points: List<LitePoint>,
)

data class PendingSyncItem(
    val clientId: String,
    val payloadJson: String,
    val attempts: Int,
)

data class StorageBreakdown(
    val httpCacheBytes: Long,
    val sqliteFileBytes: Long,
    val tempDirBytes: Long,
    val pendingQueueCount: Int,
    val capBytes: Long,
) {
    val totalManagedBytes: Long get() = httpCacheBytes + tempDirBytes
}

/**
 * Pure JVM-testable LRU eviction planner for hard-bounded cache enforcement.
 */
object LiteCacheEvictor {
    data class Entry(val key: String, val sizeBytes: Long, val updatedAtMs: Long)

    fun keysToEvict(entries: List<Entry>, maxBytes: Long): List<String> {
        if (maxBytes <= 0) return entries.map { it.key }
        var total = entries.sumOf { it.sizeBytes }
        if (total <= maxBytes) return emptyList()
        val ordered = entries.sortedWith(compareBy<Entry> { it.updatedAtMs }.thenBy { it.key })
        val victims = mutableListOf<String>()
        for (e in ordered) {
            if (total <= maxBytes) break
            victims.add(e.key)
            total -= e.sizeBytes
        }
        return victims
    }
}

/**
 * Hard-capped SQLite cache + crash-safe active recording store + OS temp sweeper.
 * Uses PRAGMA auto_vacuum = FULL and compacts automatically after queue drains.
 */
class LiteStorageGuardian(private val appContext: Context) :
    SQLiteOpenHelper(appContext, DB_NAME, null, DB_VERSION) {

    companion object {
        private const val DB_NAME = "stride_lite.db"
        private const val DB_VERSION = 1
    }

    override fun onConfigure(db: SQLiteDatabase) {
        super.onConfigure(db)
        db.execSQL("PRAGMA auto_vacuum = FULL")
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS http_cache (
                cache_key TEXT PRIMARY KEY,
                body_json TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                updated_at_ms INTEGER NOT NULL
            )
            """.trimIndent()
        )
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_http_cache_lru ON http_cache(updated_at_ms)")
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS active_session (
                client_id TEXT PRIMARY KEY,
                activity_type TEXT NOT NULL,
                started_at_ms INTEGER NOT NULL,
                paused INTEGER NOT NULL DEFAULT 0
            )
            """.trimIndent()
        )
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS active_points (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id TEXT NOT NULL,
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                ele REAL NOT NULL,
                time_ms INTEGER NOT NULL,
                accuracy_m REAL
            )
            """.trimIndent()
        )
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS sync_queue (
                client_id TEXT PRIMARY KEY,
                payload_json TEXT NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 0,
                last_error TEXT,
                created_at_ms INTEGER NOT NULL
            )
            """.trimIndent()
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    @Synchronized
    fun putCache(key: String, bodyJson: String, capBytes: Long) {
        val db = writableDatabase
        val now = System.currentTimeMillis()
        val sizeBytes = bodyJson.toByteArray(Charsets.UTF_8).size.toLong()
        if (sizeBytes > capBytes) {
            return
        }
        val cv = ContentValues().apply {
            put("cache_key", key)
            put("body_json", bodyJson)
            put("size_bytes", sizeBytes)
            put("updated_at_ms", now)
        }
        db.insertWithOnConflict("http_cache", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
        enforceCacheCapLocked(db, capBytes)
    }

    @Synchronized
    fun getCache(key: String): String? {
        val db = writableDatabase
        val c = db.rawQuery("SELECT body_json FROM http_cache WHERE cache_key = ? LIMIT 1", arrayOf(key))
        c.use {
            if (!it.moveToFirst()) return null
            val body = it.getString(0)
            val touch = ContentValues().apply { put("updated_at_ms", System.currentTimeMillis()) }
            db.update("http_cache", touch, "cache_key = ?", arrayOf(key))
            return body
        }
    }

    @Synchronized
    fun enforceCacheCap(capBytes: Long) {
        enforceCacheCapLocked(writableDatabase, capBytes)
    }

    private fun enforceCacheCapLocked(db: SQLiteDatabase, capBytes: Long) {
        val entries = mutableListOf<LiteCacheEvictor.Entry>()
        db.rawQuery("SELECT cache_key, size_bytes, updated_at_ms FROM http_cache", null).use { c ->
            while (c.moveToNext()) {
                entries.add(LiteCacheEvictor.Entry(c.getString(0), c.getLong(1), c.getLong(2)))
            }
        }
        val victims = LiteCacheEvictor.keysToEvict(entries, capBytes)
        if (victims.isEmpty()) return
        db.beginTransaction()
        try {
            for (k in victims) {
                db.delete("http_cache", "cache_key = ?", arrayOf(k))
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    @Synchronized
    fun clearAllCaches(): Long {
        val before = measureStorageBreakdown(0).totalManagedBytes
        val db = writableDatabase
        db.delete("http_cache", null, null)
        try {
            db.execSQL("VACUUM")
        } catch (_: Throwable) {}
        purgeDirectoryContents(appContext.cacheDir)
        purgeDirectoryContents(appContext.codeCacheDir)
        appContext.externalCacheDir?.let { purgeDirectoryContents(it) }
        val after = measureStorageBreakdown(0).totalManagedBytes
        return (before - after).coerceAtLeast(0L)
    }

    @Synchronized
    fun sweepTempDirs() {
        purgeDirectoryContents(appContext.cacheDir)
        appContext.externalCacheDir?.let { purgeDirectoryContents(it) }
    }

    @Synchronized
    fun measureStorageBreakdown(capBytes: Long): StorageBreakdown {
        val db = readableDatabase
        var httpBytes = 0L
        db.rawQuery("SELECT COALESCE(SUM(size_bytes), 0) FROM http_cache", null).use { c ->
            if (c.moveToFirst()) httpBytes = c.getLong(0)
        }
        var queueCount = 0
        db.rawQuery("SELECT COUNT(*) FROM sync_queue", null).use { c ->
            if (c.moveToFirst()) queueCount = c.getInt(0)
        }
        val dbFile = appContext.getDatabasePath(DB_NAME)
        val sqliteBytes = if (dbFile.exists()) dbFile.length() else 0L
        val tempBytes = dirSize(appContext.cacheDir) +
            dirSize(appContext.codeCacheDir) +
            (appContext.externalCacheDir?.let { dirSize(it) } ?: 0L)
        return StorageBreakdown(httpBytes, sqliteBytes, tempBytes, queueCount, capBytes)
    }

    @Synchronized
    fun startOrUpdateSession(clientId: String, activityType: String, startedAtMs: Long, paused: Boolean = false) {
        val cv = ContentValues().apply {
            put("client_id", clientId)
            put("activity_type", activityType)
            put("started_at_ms", startedAtMs)
            put("paused", if (paused) 1 else 0)
        }
        writableDatabase.insertWithOnConflict("active_session", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    @Synchronized
    fun appendPoint(clientId: String, pt: LitePoint) {
        val cv = ContentValues().apply {
            put("client_id", clientId)
            put("lat", pt.lat)
            put("lng", pt.lng)
            put("ele", pt.ele)
            put("time_ms", pt.timeMs)
            if (pt.accuracyM != null) put("accuracy_m", pt.accuracyM) else putNull("accuracy_m")
        }
        writableDatabase.insert("active_points", null, cv)
    }

    @Synchronized
    fun loadUnfinishedSession(): LiteDraftSession? {
        val db = readableDatabase
        var cid: String? = null
        var type = "run"
        var started = 0L
        var paused = false
        db.rawQuery("SELECT client_id, activity_type, started_at_ms, paused FROM active_session LIMIT 1", null).use { c ->
            if (c.moveToFirst()) {
                cid = c.getString(0)
                type = c.getString(1)
                started = c.getLong(2)
                paused = c.getInt(3) == 1
            }
        }
        val sessionId = cid ?: return null
        val pts = mutableListOf<LitePoint>()
        db.rawQuery(
            "SELECT lat, lng, ele, time_ms, accuracy_m FROM active_points WHERE client_id = ? ORDER BY time_ms ASC",
            arrayOf(sessionId)
        ).use { c ->
            while (c.moveToNext()) {
                pts.add(
                    LitePoint(
                        lat = c.getDouble(0),
                        lng = c.getDouble(1),
                        ele = c.getDouble(2),
                        timeMs = c.getLong(3),
                        accuracyM = if (c.isNull(4)) null else c.getDouble(4),
                    )
                )
            }
        }
        return LiteDraftSession(sessionId, type, started, paused, pts)
    }

    @Synchronized
    fun clearActiveSession(clientId: String) {
        val db = writableDatabase
        db.delete("active_points", "client_id = ?", arrayOf(clientId))
        db.delete("active_session", "client_id = ?", arrayOf(clientId))
    }

    @Synchronized
    fun enqueueSync(clientId: String, payloadJson: String) {
        val cv = ContentValues().apply {
            put("client_id", clientId)
            put("payload_json", payloadJson)
            put("attempts", 0)
            put("created_at_ms", System.currentTimeMillis())
        }
        writableDatabase.insertWithOnConflict("sync_queue", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    @Synchronized
    fun pendingSyncs(): List<PendingSyncItem> {
        val out = mutableListOf<PendingSyncItem>()
        readableDatabase.rawQuery(
            "SELECT client_id, payload_json, attempts FROM sync_queue ORDER BY created_at_ms ASC",
            null
        ).use { c ->
            while (c.moveToNext()) {
                out.add(PendingSyncItem(c.getString(0), c.getString(1), c.getInt(2)))
            }
        }
        return out
    }

    @Synchronized
    fun markSynced(clientId: String) {
        val db = writableDatabase
        db.delete("sync_queue", "client_id = ?", arrayOf(clientId))
        var rem = 0
        db.rawQuery("SELECT COUNT(*) FROM sync_queue", null).use { c ->
            if (c.moveToFirst()) rem = c.getInt(0)
        }
        if (rem == 0) {
            try {
                db.execSQL("VACUUM")
            } catch (_: Throwable) {}
        }
    }

    @Synchronized
    fun recordSyncFailure(clientId: String, error: String) {
        writableDatabase.execSQL(
            "UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE client_id = ?",
            arrayOf(error, clientId)
        )
    }

    private fun dirSize(dir: File?): Long {
        if (dir == null || !dir.exists()) return 0L
        var total = 0L
        dir.listFiles()?.forEach { f ->
            total += if (f.isDirectory) dirSize(f) else f.length()
        }
        return total
    }

    private fun purgeDirectoryContents(dir: File?) {
        if (dir == null || !dir.exists()) return
        dir.listFiles()?.forEach { child ->
            try {
                if (child.isDirectory) {
                    purgeDirectoryContents(child)
                    child.delete()
                } else {
                    child.delete()
                }
            } catch (_: Throwable) {}
        }
    }
}
