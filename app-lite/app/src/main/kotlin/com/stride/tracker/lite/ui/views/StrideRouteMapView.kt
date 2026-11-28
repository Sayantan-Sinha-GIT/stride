package com.stride.tracker.lite.ui.views

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.*
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import com.stride.tracker.lite.R
import com.stride.tracker.lite.core.GpsPoint
import com.stride.tracker.lite.core.StrideAppContainer
import com.stride.tracker.lite.core.TrackProcessorLite
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import kotlin.math.*

data class HeatPoint(val lat: Double, val lng: Double, val weight: Float)

class StrideRouteMapView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private var points: List<GpsPoint> = emptyList()
    private var heatPoints: List<HeatPoint> = emptyList()
    private var progressFraction: Float = 1f
    private var liveBeacon: Boolean = false
    private var interactive: Boolean = false
    private var zoomScale: Float = 1f
    private var panX: Float = 0f
    private var panY: Float = 0f
    private var lastTouchX = 0f
    private var lastTouchY = 0f

    private val inFlightTiles = HashSet<String>()

    companion object {
        private val tilePool = Executors.newFixedThreadPool(3)
    }

    private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val gridPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        strokeWidth = resources.displayMetrics.density * 0.8f
        style = Paint.Style.STROKE
    }
    private val tilePaint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
    private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val pinPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val heatPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val path = Path()
    private val clipPath = Path()

    private val scaleDetector = ScaleGestureDetector(context, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
        override fun onScale(detector: ScaleGestureDetector): Boolean {
            if (!interactive) return false
            zoomScale = (zoomScale * detector.scaleFactor).coerceIn(1f, 6f)
            invalidate()
            return true
        }
    })

    fun setInteractive(enabled: Boolean) {
        interactive = enabled
    }

    fun setRoute(pts: List<GpsPoint>, isLive: Boolean = false, progress: Float = 1f) {
        points = pts
        heatPoints = emptyList()
        liveBeacon = isLive
        progressFraction = progress.coerceIn(0f, 1f)
        invalidate()
    }

    fun setEncodedPolyline(encoded: String, isLive: Boolean = false) {
        setRoute(TrackProcessorLite.decodePolyline(encoded), isLive, 1f)
    }

    fun setProgressFraction(fraction: Float) {
        progressFraction = fraction.coerceIn(0f, 1f)
        invalidate()
    }

    fun setHeatmapPoints(cells: List<HeatPoint>) {
        points = emptyList()
        heatPoints = cells
        invalidate()
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (!interactive) return super.onTouchEvent(event)
        scaleDetector.onTouchEvent(event)
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                lastTouchX = event.x
                lastTouchY = event.y
                parent?.requestDisallowInterceptTouchEvent(true)
            }
            MotionEvent.ACTION_MOVE -> {
                if (!scaleDetector.isInProgress && zoomScale > 1f) {
                    panX = (panX + (event.x - lastTouchX)).coerceIn(-width * 0.6f, width * 0.6f)
                    panY = (panY + (event.y - lastTouchY)).coerceIn(-height * 0.6f, height * 0.6f)
                    invalidate()
                }
                lastTouchX = event.x
                lastTouchY = event.y
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                parent?.requestDisallowInterceptTouchEvent(false)
            }
        }
        return true
    }

    private fun latToMercY(lat: Double): Double {
        val rad = Math.toRadians(lat.coerceIn(-85.0, 85.0))
        return (1.0 - ln(tan(rad) + 1.0 / cos(rad)) / PI) / 2.0
    }

    private fun lngToMercX(lng: Double): Double = (lng + 180.0) / 360.0

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return

        val d = resources.displayMetrics.density
        val radius = d * 14f
        clipPath.reset()
        clipPath.addRoundRect(0f, 0f, w, h, radius, radius, Path.Direction.CW)
        canvas.save()
        canvas.clipPath(clipPath)

        bgPaint.color = context.getColor(R.color.stride_map_bg)
        canvas.drawRect(0f, 0f, w, h, bgPaint)

        gridPaint.color = context.getColor(R.color.stride_map_grid)
        var gx = d * 24f
        while (gx < w) {
            canvas.drawLine(gx, 0f, gx, h, gridPaint)
            gx += d * 24f
        }
        var gy = d * 24f
        while (gy < h) {
            canvas.drawLine(0f, gy, w, gy, gridPaint)
            gy += d * 24f
        }

        val pts = points
        val heats = heatPoints
        if (pts.isEmpty() && heats.isEmpty()) {
            canvas.restore()
            return
        }

        val allLats = if (pts.isNotEmpty()) pts.map { it.lat } else heats.map { it.lat }
        val allLngs = if (pts.isNotEmpty()) pts.map { it.lng } else heats.map { it.lng }

        val minX = allLngs.minOrNull()?.let { lngToMercX(it) } ?: 0.5
        val maxX = allLngs.maxOrNull()?.let { lngToMercX(it) } ?: 0.5
        val minY = allLats.maxOrNull()?.let { latToMercY(it) } ?: 0.5
        val maxY = allLats.minOrNull()?.let { latToMercY(it) } ?: 0.5

        val pad = d * 20f
        val availW = (w - pad * 2f).coerceAtLeast(1f)
        val availH = (h - pad * 2f).coerceAtLeast(1f)
        val spanX = max(1e-5, maxX - minX)
        val spanY = max(1e-5, maxY - minY)
        val baseScale = min(availW / spanX, availH / spanY)
        val effectiveScale = baseScale * zoomScale
        val midX = (minX + maxX) / 2.0
        val midY = (minY + maxY) / 2.0

        fun mercToScreenX(mx: Double): Float = (w / 2f + (mx - midX) * effectiveScale + panX).toFloat()
        fun mercToScreenY(my: Double): Float = (h / 2f + (my - midY) * effectiveScale + panY).toFloat()

        // Exact tile-aligned Esri street/dark backdrop when Data Saver is OFF
        drawAlignedRasterTiles(canvas, w, h, d, effectiveScale, midX, midY, ::mercToScreenX, ::mercToScreenY)

        if (heats.isNotEmpty()) {
            val maxW = heats.maxOf { it.weight }.coerceAtLeast(1f)
            for (c in heats) {
                val cx = mercToScreenX(lngToMercX(c.lng))
                val cy = mercToScreenY(latToMercY(c.lat))
                val intensity = (c.weight / maxW).coerceIn(0.18f, 1f)
                heatPaint.color = Color.argb((80 + intensity * 155).roundToInt(), 255, 77, 28)
                canvas.drawCircle(cx, cy, d * (4f + intensity * 7f), heatPaint)
            }
            canvas.restore()
            return
        }

        val endIdx = ((pts.size - 1) * progressFraction).roundToInt().coerceIn(0, pts.size - 1)
        if (endIdx >= 1) {
            path.reset()
            path.moveTo(mercToScreenX(lngToMercX(pts[0].lng)), mercToScreenY(latToMercY(pts[0].lat)))
            for (i in 1..endIdx) {
                path.lineTo(mercToScreenX(lngToMercX(pts[i].lng)), mercToScreenY(latToMercY(pts[i].lat)))
            }
            glowPaint.color = Color.argb(80, 255, 77, 28)
            glowPaint.strokeWidth = d * 8.5f
            canvas.drawPath(path, glowPaint)

            linePaint.color = context.getColor(R.color.stride_accent)
            linePaint.strokeWidth = d * 3.6f
            canvas.drawPath(path, linePaint)
        }

        val startX = mercToScreenX(lngToMercX(pts.first().lng))
        val startY = mercToScreenY(latToMercY(pts.first().lat))
        pinPaint.color = context.getColor(R.color.stride_success)
        canvas.drawCircle(startX, startY, d * 5.2f, pinPaint)

        val curX = mercToScreenX(lngToMercX(pts[endIdx].lng))
        val curY = mercToScreenY(latToMercY(pts[endIdx].lat))
        if (liveBeacon || progressFraction < 0.99f) {
            pinPaint.color = Color.argb(80, 255, 77, 28)
            canvas.drawCircle(curX, curY, d * 10.5f, pinPaint)
        }
        pinPaint.color = context.getColor(R.color.stride_accent)
        canvas.drawCircle(curX, curY, d * 5.5f, pinPaint)
        pinPaint.color = Color.WHITE
        canvas.drawCircle(curX, curY, d * 2.2f, pinPaint)

        canvas.restore()
    }

    private fun drawAlignedRasterTiles(
        canvas: Canvas,
        w: Float,
        h: Float,
        density: Float,
        effectiveScale: Double,
        midX: Double,
        midY: Double,
        sxFn: (Double) -> Float,
        syFn: (Double) -> Float
    ) {
        val prefs = runCatching { StrideAppContainer.prefs }.getOrNull() ?: return
        if (prefs.dataSaver) return
        val guardian = runCatching { StrideAppContainer.guardian }.getOrNull() ?: return

        val targetTilePx = 220.0 * density
        val rawZ = ln((effectiveScale / targetTilePx).coerceAtLeast(1.0)) / ln(2.0)
        val z = rawZ.roundToInt().coerceIn(11, 16)
        val n = 1 shl z

        val leftMx = (midX - (w / 2.0 + panX) / effectiveScale).coerceIn(0.0, 0.999999)
        val rightMx = (midX + (w / 2.0 - panX) / effectiveScale).coerceIn(0.0, 0.999999)
        val topMy = (midY - (h / 2.0 + panY) / effectiveScale).coerceIn(0.0, 0.999999)
        val bottomMy = (midY + (h / 2.0 - panY) / effectiveScale).coerceIn(0.0, 0.999999)

        val txMin = (leftMx * n).toInt().coerceIn(0, n - 1)
        val txMax = (rightMx * n).toInt().coerceIn(txMin, min(n - 1, txMin + 2))
        val tyMin = (topMy * n).toInt().coerceIn(0, n - 1)
        val tyMax = (bottomMy * n).toInt().coerceIn(tyMin, min(n - 1, tyMin + 2))

        val dark = StrideAppContainer.isDarkActive(context)
        val styleKey = if (dark) "esri_dark" else "esri_street"
        tilePaint.alpha = if (dark) 220 else 210

        for (tx in txMin..txMax) {
            for (ty in tyMin..tyMax) {
                val rect = RectF(
                    sxFn(tx.toDouble() / n),
                    syFn(ty.toDouble() / n),
                    sxFn((tx + 1).toDouble() / n),
                    syFn((ty + 1).toDouble() / n)
                )
                val key = "${styleKey}_${z}_${tx}_$ty"
                val memBmp = guardian.tileMemCache.get(key)
                if (memBmp != null && !memBmp.isRecycled) {
                    canvas.drawBitmap(memBmp, null, rect, tilePaint)
                    continue
                }
                val diskFile = File(guardian.tileCacheDir, "$key.jpg")
                if (diskFile.exists() && diskFile.length() > 300) {
                    val bmp = BitmapFactory.decodeFile(diskFile.absolutePath)
                    if (bmp != null) {
                        diskFile.setLastModified(System.currentTimeMillis())
                        guardian.tileMemCache.put(key, bmp)
                        canvas.drawBitmap(bmp, null, rect, tilePaint)
                        continue
                    }
                }
                fetchTileAsync(key, styleKey, z, tx, ty, diskFile)
            }
        }
    }

    private fun fetchTileAsync(key: String, styleKey: String, z: Int, tx: Int, ty: Int, diskFile: File) {
        synchronized(inFlightTiles) {
            if (inFlightTiles.contains(key)) return
            inFlightTiles.add(key)
        }
        val prefs = StrideAppContainer.prefs
        val guardian = StrideAppContainer.guardian
        tilePool.execute {
            try {
                val service = if (styleKey == "esri_dark") {
                    "Canvas/World_Dark_Gray_Base"
                } else {
                    "World_Street_Map"
                }
                val url = URL("https://server.arcgisonline.com/ArcGIS/rest/services/$service/MapServer/tile/$z/$ty/$tx")
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    connectTimeout = 5000
                    readTimeout = 6000
                    setRequestProperty("User-Agent", "Mozilla/5.0 StrideLite/2.0")
                }
                if (conn.responseCode == 200) {
                    val bytes = conn.inputStream.use { it.readBytes() }
                    if (bytes.size in 300..250_000) {
                        diskFile.writeBytes(bytes)
                        guardian.enforceBudget(prefs.cacheCapBytes)
                        val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                        if (decoded != null) {
                            guardian.tileMemCache.put(key, decoded)
                            postInvalidate()
                        }
                    }
                }
                conn.disconnect()
            } catch (_: Throwable) {
            } finally {
                synchronized(inFlightTiles) { inFlightTiles.remove(key) }
            }
        }
    }
}
