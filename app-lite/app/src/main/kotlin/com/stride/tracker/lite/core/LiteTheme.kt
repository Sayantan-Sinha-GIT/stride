package com.stride.tracker.lite.core

import android.content.Context
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView

data class LitePalette(
    val isDark: Boolean,
    val bg: Int,
    val surface: Int,
    val elevated: Int,
    val border: Int,
    val textPrimary: Int,
    val textSecondary: Int,
    val accent: Int,
    val secondary: Int,
    val success: Int,
    val warning: Int,
    val danger: Int,
)

object LiteTheme {
    private val dark = LitePalette(
        isDark = true,
        bg = Color.parseColor("#080B10"),
        surface = Color.parseColor("#111620"),
        elevated = Color.parseColor("#18202C"),
        border = Color.parseColor("#2AFFFFFF"),
        textPrimary = Color.parseColor("#F5F7FA"),
        textSecondary = Color.parseColor("#9BA7B8"),
        accent = Color.parseColor("#FF5500"),
        secondary = Color.parseColor("#00D4AA"),
        success = Color.parseColor("#10B981"),
        warning = Color.parseColor("#F59E0B"),
        danger = Color.parseColor("#F43F5E"),
    )

    private val light = LitePalette(
        isDark = false,
        bg = Color.parseColor("#F4F3EF"),
        surface = Color.parseColor("#FFFFFF"),
        elevated = Color.parseColor("#ECEAE3"),
        border = Color.parseColor("#22000000"),
        textPrimary = Color.parseColor("#12171E"),
        textSecondary = Color.parseColor("#546172"),
        accent = Color.parseColor("#EA4C00"),
        secondary = Color.parseColor("#00947A"),
        success = Color.parseColor("#059669"),
        warning = Color.parseColor("#D97706"),
        danger = Color.parseColor("#E11D48"),
    )

    fun resolve(context: Context, mode: String): LitePalette {
        val isDark = when (mode) {
            "dark" -> true
            "light" -> false
            else -> (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
                Configuration.UI_MODE_NIGHT_YES
        }
        return if (isDark) dark else light
    }

    fun dp(context: Context, value: Int): Int {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            value.toFloat(),
            context.resources.displayMetrics
        ).toInt()
    }

    fun roundedBox(
        context: Context,
        fillColor: Int,
        strokeColor: Int? = null,
        radiusDp: Int = 16,
        strokeWidthDp: Int = 1,
    ): GradientDrawable {
        return GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = dp(context, radiusDp).toFloat()
            setColor(fillColor)
            if (strokeColor != null) {
                setStroke(dp(context, strokeWidthDp), strokeColor)
            }
        }
    }

    fun card(context: Context, palette: LitePalette, paddingDp: Int = 14): LinearLayout {
        val pad = dp(context, paddingDp)
        return LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            background = roundedBox(context, palette.surface, palette.border, 16)
            setPadding(pad, pad, pad, pad)
        }
    }

    fun label(
        context: Context,
        palette: LitePalette,
        text: String,
        sizeSp: Float = 14f,
        bold: Boolean = false,
        secondary: Boolean = false,
        colorOverride: Int? = null,
    ): TextView {
        return TextView(context).apply {
            this.text = text
            textSize = sizeSp
            setTextColor(colorOverride ?: if (secondary) palette.textSecondary else palette.textPrimary)
            if (bold) setTypeface(typeface, Typeface.BOLD)
        }
    }

    fun pillButton(
        context: Context,
        palette: LitePalette,
        text: String,
        primary: Boolean = true,
        danger: Boolean = false,
        fillOverride: Int? = null,
    ): Button {
        val h = dp(context, 44)
        val hp = dp(context, 14)
        val bgColor = fillOverride ?: when {
            danger -> Color.TRANSPARENT
            primary -> palette.accent
            else -> Color.TRANSPARENT
        }
        val stroke = when {
            danger -> palette.danger
            primary -> null
            else -> palette.border
        }
        val fgColor = when {
            danger -> palette.danger
            primary -> Color.WHITE
            else -> palette.textPrimary
        }
        return Button(context).apply {
            this.text = text
            isAllCaps = false
            minHeight = h
            minimumHeight = h
            textSize = 13.5f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(fgColor)
            background = roundedBox(context, bgColor, stroke, 22)
            setPadding(hp, dp(context, 8), hp, dp(context, 8))
            gravity = Gravity.CENTER
        }
    }

    fun inputField(
        context: Context,
        palette: LitePalette,
        hintText: String,
        inputTypeFlags: Int,
        initialValue: String = "",
    ): EditText {
        val pad = dp(context, 12)
        return EditText(context).apply {
            hint = hintText
            contentDescription = hintText
            setText(initialValue)
            inputType = inputTypeFlags
            textSize = 14.5f
            setTextColor(palette.textPrimary)
            setHintTextColor(palette.textSecondary)
            background = roundedBox(context, palette.elevated, palette.border, 12)
            setPadding(pad, pad, pad, pad)
        }
    }

    fun spacer(context: Context, heightDp: Int): View {
        return View(context).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(context, heightDp)
            )
        }
    }
}
