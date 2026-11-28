package com.stride.tracker.lite.ui.views

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.util.AttributeSet
import android.view.View
import com.stride.tracker.lite.R
import kotlin.math.max

class StrideVolumeChartView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private var weekKm: List<Double> = emptyList()
    private val barPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val trackPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val rect = RectF()

    fun setWeeklyDistancesKm(values: List<Double>) {
        val tail = values.takeLast(8)
        weekKm = if (tail.size < 8) List(8 - tail.size) { 0.0 } + tail else tail
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f || weekKm.isEmpty()) return

        val d = resources.displayMetrics.density
        val maxVal = max(1.0, weekKm.maxOrNull() ?: 1.0)
        val count = weekKm.size
        val gap = d * 6f
        val barW = ((w - gap * (count - 1)) / count).coerceAtLeast(d * 6f)
        val radius = d * 5f

        trackPaint.color = context.getColor(R.color.stride_surface_alt)
        val accent = context.getColor(R.color.stride_accent)
        val muted = context.getColor(R.color.stride_success)

        weekKm.forEachIndexed { i, km ->
            val left = i * (barW + gap)
            val right = left + barW
            rect.set(left, 0f, right, h)
            canvas.drawRoundRect(rect, radius, radius, trackPaint)

            val ratio = (km / maxVal).toFloat().coerceIn(0f, 1f)
            val barH = max(d * 4f, h * ratio)
            rect.set(left, h - barH, right, h)
            barPaint.color = if (i == count - 1) accent else muted
            canvas.drawRoundRect(rect, radius, radius, barPaint)
        }
    }
}
