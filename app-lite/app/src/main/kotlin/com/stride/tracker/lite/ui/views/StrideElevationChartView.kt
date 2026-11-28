package com.stride.tracker.lite.ui.views

import android.content.Context
import android.graphics.*
import android.util.AttributeSet
import android.view.View
import com.stride.tracker.lite.R
import kotlin.math.max
import kotlin.math.roundToInt

class StrideElevationChartView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private var samples: List<Double> = emptyList()
    private var markerFraction: Float = -1f

    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val gridPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val markerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val linePath = Path()
    private val fillPath = Path()

    fun setElevations(values: List<Double>) {
        samples = values
        invalidate()
    }

    fun setMarkerFraction(fraction: Float) {
        markerFraction = fraction.coerceIn(0f, 1f)
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f || samples.size < 2) return

        val d = resources.displayMetrics.density
        val padH = d * 8f
        val padV = d * 10f
        val minE = samples.minOrNull() ?: 0.0
        val maxE = samples.maxOrNull() ?: 0.0
        val span = max(2.0, maxE - minE)

        gridPaint.color = context.getColor(R.color.stride_border)
        gridPaint.strokeWidth = d
        canvas.drawLine(0f, h * 0.5f, w, h * 0.5f, gridPaint)

        linePath.reset()
        fillPath.reset()
        val usableW = w - padH * 2f
        val usableH = h - padV * 2f
        var mx = 0f
        var my = 0f
        val mIdx = if (markerFraction >= 0f) ((samples.size - 1) * markerFraction).roundToInt() else -1

        samples.forEachIndexed { idx, ele ->
            val x = padH + (idx.toFloat() / (samples.size - 1)) * usableW
            val y = padV + usableH * (1f - ((ele - minE) / span).toFloat())
            if (idx == 0) {
                linePath.moveTo(x, y)
                fillPath.moveTo(x, h - padV)
                fillPath.lineTo(x, y)
            } else {
                linePath.lineTo(x, y)
                fillPath.lineTo(x, y)
            }
            if (idx == mIdx) {
                mx = x
                my = y
            }
        }
        fillPath.lineTo(padH + usableW, h - padV)
        fillPath.close()

        val successColor = context.getColor(R.color.stride_success)
        fillPaint.shader = LinearGradient(
            0f, 0f, 0f, h,
            Color.argb(95, Color.red(successColor), Color.green(successColor), Color.blue(successColor)),
            Color.TRANSPARENT,
            Shader.TileMode.CLAMP
        )
        canvas.drawPath(fillPath, fillPaint)

        strokePaint.color = successColor
        strokePaint.strokeWidth = d * 2.5f
        canvas.drawPath(linePath, strokePaint)

        if (mIdx >= 0) {
            markerPaint.color = context.getColor(R.color.stride_accent)
            canvas.drawCircle(mx, my, d * 5f, markerPaint)
            markerPaint.color = Color.WHITE
            canvas.drawCircle(mx, my, d * 2f, markerPaint)
        }
    }
}
