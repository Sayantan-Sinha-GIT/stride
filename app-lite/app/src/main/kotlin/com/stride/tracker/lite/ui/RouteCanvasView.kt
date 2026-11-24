package com.stride.tracker.lite.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.view.View
import com.stride.tracker.lite.core.LitePalette
import com.stride.tracker.lite.core.LiteTheme
import kotlin.math.max
import kotlin.math.min

class RouteCanvasView(
    context: Context,
    private val palette: LitePalette,
) : View(context) {

    private var points: List<Pair<Double, Double>> = emptyList()
    private var progressRatio: Float? = null

    private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val gridPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 1.5f }
    private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val emptyTextPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        textSize = 34f
    }
    private val routePath = Path()
    private val clipRect = RectF()

    fun setData(pts: List<Pair<Double, Double>>, progress: Float? = null) {
        points = pts
        progressRatio = progress
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return

        val radius = LiteTheme.dp(context, 14).toFloat()
        clipRect.set(1f, 1f, w - 1f, h - 1f)
        bgPaint.color = palette.elevated
        canvas.drawRoundRect(clipRect, radius, radius, bgPaint)

        borderPaint.color = palette.border
        borderPaint.strokeWidth = 2f
        canvas.drawRoundRect(clipRect, radius, radius, borderPaint)

        gridPaint.color = if (palette.isDark) 0x10FFFFFF else 0x12000000
        val step = LiteTheme.dp(context, 24).toFloat()
        var gx = step
        while (gx < w) {
            canvas.drawLine(gx, 0f, gx, h, gridPaint)
            gx += step
        }
        var gy = step
        while (gy < h) {
            canvas.drawLine(0f, gy, w, gy, gridPaint)
            gy += step
        }

        if (points.size < 2) {
            emptyTextPaint.color = palette.textSecondary
            canvas.drawText("No GPS geometry yet", w / 2f, h / 2f + 10f, emptyTextPaint)
            return
        }

        var minLat = points[0].first
        var maxLat = points[0].first
        var minLng = points[0].second
        var maxLng = points[0].second
        for (p in points) {
            minLat = min(minLat, p.first)
            maxLat = max(maxLat, p.first)
            minLng = min(minLng, p.second)
            maxLng = max(maxLng, p.second)
        }
        val dLat = max(0.0004, maxLat - minLat)
        val dLng = max(0.0004, maxLng - minLng)
        val pad = LiteTheme.dp(context, 16).toFloat()
        val dw = max(1f, w - pad * 2f)
        val dh = max(1f, h - pad * 2f)

        fun toX(lng: Double) = pad + ((lng - minLng) / dLng).toFloat() * dw
        fun toY(lat: Double) = h - pad - ((lat - minLat) / dLat).toFloat() * dh

        routePath.reset()
        for (i in points.indices) {
            val px = toX(points[i].second)
            val py = toY(points[i].first)
            if (i == 0) routePath.moveTo(px, py) else routePath.lineTo(px, py)
        }

        glowPaint.color = (palette.accent and 0x00FFFFFF) or 0x45000000
        glowPaint.strokeWidth = LiteTheme.dp(context, 7).toFloat()
        canvas.drawPath(routePath, glowPaint)

        strokePaint.color = palette.accent
        strokePaint.strokeWidth = LiteTheme.dp(context, 3).toFloat()
        canvas.drawPath(routePath, strokePaint)

        dotPaint.color = palette.success
        canvas.drawCircle(toX(points.first().second), toY(points.first().first), LiteTheme.dp(context, 4).toFloat(), dotPaint)

        dotPaint.color = palette.accent
        canvas.drawCircle(toX(points.last().second), toY(points.last().first), LiteTheme.dp(context, 4).toFloat(), dotPaint)

        val pr = progressRatio
        if (pr != null) {
            val idx = ((points.size - 1) * pr.coerceIn(0f, 1f)).toInt()
            val mx = toX(points[idx].second)
            val my = toY(points[idx].first)
            dotPaint.color = Color.WHITE
            canvas.drawCircle(mx, my, LiteTheme.dp(context, 7).toFloat(), dotPaint)
            dotPaint.color = palette.warning
            canvas.drawCircle(mx, my, LiteTheme.dp(context, 4).toFloat(), dotPaint)
        }
    }
}
