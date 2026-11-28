package com.stride.tracker.lite.storage

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.graphics.Bitmap
import android.util.LruCache
import com.stride.tracker.lite.core.GpsPoint
import java.io.File

data class StorageBreakdown(
    val httpCacheBytes: Long,
    val tileCacheBytes: Long,
    val dbBytes: Long,
    val tempBytes: Long,
    val pendingQueueCount: Int
) {
    val totalCacheBytes: Long get() = httpCacheBytes + tileCacheBytes
}

data class ActiveDraft(
    val clientId: String,
    val activityType: String,
    val title: String,
    val startedAtMs: Long,
    val paused: Boolean,
    val points: List<GpsPoint>
)

data class PendingSyncRow(
    val clientId: String,
    val payloadJson: String,
    val createdAtMs: Long,
    val attempts: Int
)

object LiteCacheEvictor {
    fun directorySize(dir: File): Long {
        if (!dir.exists()) return 0L
        return dir.walkTopDown().filter { it.isFile }.sumOf { it.length() }
    }

    fun enforceCap(dir: File, maxBytes: Long): Long {
        if (!dir.exists()) return 0L
        val files = dir.walkTopDown().filter { it.isFile }.toMutableList()
        var total = files.sumOf { it.length() }
        if (total <= maxBytes) return total
        files.sortBy { it.lastModified() }
        for (f in files) {
            if (total <= maxBytes) break
            val len = f.length()
            if (f.delete()) {
                total -= len
            }
        }
        return total.coerceAtLeast(0L)
    }

    fun clearDirectory(dir: File) {
        if (!dir.exists()) return
        dir.listFiles()?.forEach { child ->
            if (child.isDirectory) clearDirectory(child)
            child.delete()
        }
    }
}

class LiteStorageGuardian(private val context: Context) :
    SQLiteOpenHelper(context.applicationContext, DB_NAME, null, DB_VERSION) {

    val httpCacheDir = File(context.applicationContext.filesDir, "lite_http_cache").apply { mkdirs() }
    val tileCacheDir = File(context.applicationContext.filesDir, "lite_tile_cache").apply { mkdirs() }

    val tileMemCache: LruCache<String, Bitmap> = object : LruCache<String, Bitmap>(4 * 1024 * 1024) {
        override fun sizeOf(key: String, value: Bitmap): Int = value.allocationByteCount
    }

    companion object {
        private const val DB_NAME = "stride_lite_v2.db"
        private const val DB_VERSION = 1
    }

    override fun onConfigure(db: SQLiteDatabase) {
        super.onConfigure(db)
        db.execSQL("PRAGMA auto_vacuum = FULL")
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS active_session (
              client_id TEXT PRIMARY KEY,
              activity_type TEXT NOT NULL,
              title TEXT NOT NULL,
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
              ele REAL,
              time_ms INTEGER NOT NULL,
              accuracy_m REAL
            )
            """.trimIndent()
        )
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_active_points_cid ON active_points(client_id)")
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS sync_queue (
              client_id TEXT PRIMARY KEY,
              payload_json TEXT NOT NULL,
              created_at_ms INTEGER NOT NULL,
              attempts INTEGER NOT NULL DEFAULT 0
            )
            """.trimIndent()
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    fun putHttpCache(key: String, json: String, capBytes: Long) {
        val safeKey = key.replace(Regex("[^a-zA-Z0-9._-]"), "_")
        val file = File(httpCacheDir, "$safeKey.json")
        file.writeText(json, Charsets.UTF_8)
        file.setLastModified(System.currentTimeMillis())
        enforceBudget(capBytes)
    }

    fun getHttpCache(key: String): String? {
        val safeKey = key.replace(Regex("[^a-zA-Z0-9._-]"), "_")
        val file = File(httpCacheDir, "$safeKey.json")
        if (!file.exists()) return null
        file.setLastModified(System.currentTimeMillis())
        return file.readText(Charsets.UTF_8)
    }

    fun enforceBudget(totalCapBytes: Long) {
        val httpBudget = (totalCapBytes * 0.55).toLong().coerceAtLeast(256L * 1024L)
        val tileBudget = (totalCapBytes - httpBudget).coerceAtLeast(256L * 1024L)
        LiteCacheEvictor.enforceCap(httpCacheDir, httpBudget)
        LiteCacheEvictor.enforceCap(tileCacheDir, tileBudget)
    }

    fun clearAllCaches(): Long {
        val before = measureStorageBreakdown().let { it.httpCacheBytes + it.tileCacheBytes + it.tempBytes }
        tileMemCache.evictAll()
        LiteCacheEvictor.clearDirectory(httpCacheDir)
        LiteCacheEvictor.clearDirectory(tileCacheDir)
        sweepTempDirs()
        compactDatabase()
        return before
    }

    fun sweepTempDirs() {
        LiteCacheEvictor.clearDirectory(context.applicationContext.cacheDir)
        context.applicationContext.externalCacheDir?.let { LiteCacheEvictor.clearDirectory(it) }
    }

    fun compactDatabase() {
        try {
            writableDatabase.execSQL("VACUUM")
        } catch (_: Throwable) {
        }
    }

    fun measureStorageBreakdown(): StorageBreakdown {
        val dbFile = context.applicationContext.getDatabasePath(DB_NAME)
        val temp = LiteCacheEvictor.directorySize(context.applicationContext.cacheDir) +
            (context.applicationContext.externalCacheDir?.let { LiteCacheEvictor.directorySize(it) } ?: 0L)
        return StorageBreakdown(
            httpCacheBytes = LiteCacheEvictor.directorySize(httpCacheDir),
            tileCacheBytes = LiteCacheEvictor.directorySize(tileCacheDir),
            dbBytes = if (dbFile.exists()) dbFile.length() else 0L,
            tempBytes = temp,
            pendingQueueCount = pendingSyncCount()
        )
    }

    fun saveSession(clientId: String, activityType: String, title: String, startedAtMs: Long, paused: Boolean) {
        val cv = ContentValues().apply {
            put("client_id", clientId)
            put("activity_type", activityType)
            put("title", title)
            put("started_at_ms", startedAtMs)
            put("paused", if (paused) 1 else 0)
        }
        writableDatabase.insertWithOnConflict("active_session", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun appendPoint(clientId: String, pt: GpsPoint) {
        val cv = ContentValues().apply {
            put("client_id", clientId)
            put("lat", pt.lat)
            put("lng", pt.lng)
            if (pt.ele != null) put("ele", pt.ele) else putNull("ele")
            put("time_ms", pt.timeMs)
            if (pt.accuracyM != null) put("accuracy_m", pt.accuracyM) else putNull("accuracy_m")
        }
        writableDatabase.insert("active_points", null, cv)
    }

    fun loadActiveDraft(): ActiveDraft? {
        readableDatabase.rawQuery(
            "SELECT client_id, activity_type, title, started_at_ms, paused FROM active_session LIMIT 1",
            null
        ).use { c ->
            if (!c.moveToFirst()) return null
            val cid = c.getString(0)
            val sport = c.getString(1)
            val title = c.getString(2)
            val start = c.getLong(3)
            val paused = c.getInt(4) == 1
            val pts = mutableListOf<GpsPoint>()
            readableDatabase.rawQuery(
                "SELECT lat, lng, ele, time_ms, accuracy_m FROM active_points WHERE client_id = ? ORDER BY id ASC",
                arrayOf(cid)
            ).use { pc ->
                while (pc.moveToNext()) {
                    val ele = if (pc.isNull(2)) null else pc.getDouble(2)
                    val acc = if (pc.isNull(4)) null else pc.getDouble(4)
                    pts.add(GpsPoint(pc.getDouble(0), pc.getDouble(1), ele, pc.getLong(3), acc))
                }
            }
            return ActiveDraft(cid, sport, title, start, paused, pts)
        }
    }

    fun deleteDraft(clientId: String) {
        writableDatabase.delete("active_points", "client_id = ?", arrayOf(clientId))
        writableDatabase.delete("active_session", "client_id = ?", arrayOf(clientId))
    }

    fun enqueueSync(clientId: String, payloadJson: String) {
        val cv = ContentValues().apply {
            put("client_id", clientId)
            put("payload_json", payloadJson)
            put("created_at_ms", System.currentTimeMillis())
            put("attempts", 0)
        }
        writableDatabase.insertWithOnConflict("sync_queue", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun listPendingSync(): List<PendingSyncRow> {
        val list = mutableListOf<PendingSyncRow>()
        readableDatabase.rawQuery(
            "SELECT client_id, payload_json, created_at_ms, attempts FROM sync_queue ORDER BY created_at_ms ASC",
            null
        ).use { c ->
            while (c.moveToNext()) {
                list.add(PendingSyncRow(c.getString(0), c.getString(1), c.getLong(2), c.getInt(3)))
            }
        }
        return list
    }

    fun removePendingSync(clientId: String) {
        writableDatabase.delete("sync_queue", "client_id = ?", arrayOf(clientId))
    }

    fun incrementSyncAttempt(clientId: String) {
        writableDatabase.execSQL("UPDATE sync_queue SET attempts = attempts + 1 WHERE client_id = ?", arrayOf(clientId))
    }

    fun pendingSyncCount(): Int {
        readableDatabase.rawQuery("SELECT COUNT(*) FROM sync_queue", null).use { c ->
            return if (c.moveToFirst()) c.getInt(0) else 0
        }
    }
}
