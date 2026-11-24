package com.stride.tracker.lite.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Shader
import android.view.View
import com.stride.tracker.lite.core.LitePalette
import com.stride.tracker.lite.core.LiteTheme
import kotlin.math.max

class ElevationCanvasView(
    context: Context,
    private val palette: LitePalette,
) : View(context) {

    private var elevations: List<Double> = emptyList()
    private val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
    }
    private val areaPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val linePath = Path()
    private val areaPath = Path()

    fun setElevations(values: List<Double>) {
        elevations = values
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (elevations.size < 2 || width <= 0 || height <= 0) return
        val w = width.toFloat()
        val h = height.toFloat()
        val minEle = elevations.minOrNull() ?: 0.0
        val maxEle = elevations.maxOrNull() ?: 0.0
        val span = max(5.0, maxEle - minEle)

        linePath.reset()
        areaPath.reset()
        for (i in elevations.indices) {
            val x = (i.toFloat() / (elevations.size - 1)) * w
            val norm = ((elevations[i] - minEle) / span).toFloat()
            val y = h - 10f - norm * (h - 20f)
            if (i == 0) {
                linePath.moveTo(x, y)
                areaPath.moveTo(x, h)
                areaPath.lineTo(x, y)
            } else {
                linePath.lineTo(x, y)
                areaPath.lineTo(x, y)
            }
        }
        areaPath.lineTo(w, h)
        areaPath.close()

        val topCol = (palette.accent and 0x00FFFFFF) or 0x55000000
        val botCol = (palette.accent and 0x00FFFFFF) or 0x08000000
        areaPaint.shader = LinearGradient(0f, 0f, 0f, h, topCol, botCol, Shader.TileMode.CLAMP)
        canvas.drawPath(areaPath, areaPaint)

        linePaint.color = palette.accent
        linePaint.strokeWidth = LiteTheme.dp(context, 2).toFloat()
        canvas.drawPath(linePath, linePaint)
    }
}
