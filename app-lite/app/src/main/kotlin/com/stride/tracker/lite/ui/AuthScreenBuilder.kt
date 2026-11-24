package com.stride.tracker.lite.ui

import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.text.InputFilter
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Toast
import com.stride.tracker.lite.core.LitePalette
import com.stride.tracker.lite.core.LiteStrings
import com.stride.tracker.lite.core.LiteTheme
import com.stride.tracker.lite.core.SecurePrefs
import com.stride.tracker.lite.net.StrideLiteApi

class AuthScreenBuilder(
    private val context: Context,
    private val palette: LitePalette,
    private val prefs: SecurePrefs,
    private val api: StrideLiteApi,
    private val runBg: (() -> Unit) -> Unit,
    private val runUi: (() -> Unit) -> Unit,
    private val onSignedIn: () -> Unit,
) {
    private var isSignup = false
    private var awaitingOtp = false
    private var errorMsg: String? = null
    private var noticeMsg: String? = null
    private var lastEmail = ""
    private var lastPass = ""

    fun build(): View {
        val lang = prefs.language
        val pad = LiteTheme.dp(context, 16)
        val root = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(palette.bg)
        }

        // Top AppBar
        val topBar = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(palette.surface)
            setPadding(pad, LiteTheme.dp(context, 12), pad, LiteTheme.dp(context, 12))
        }
        val titleView = LiteTheme.label(context, palette, LiteStrings.t(lang, "appTitle"), 20f, bold = true)
        val serverBtn = LiteTheme.pillButton(context, palette, "Server", primary = false).apply {
            setOnClickListener { showServerDialog() }
        }
        topBar.addView(titleView, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        topBar.addView(serverBtn)
        root.addView(topBar)

        val scroll = ScrollView(context)
        val col = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, LiteTheme.dp(context, 28))
        }

        fun rebuildInside() {
            col.removeAllViews()
            renderBody(col)
        }

        renderBody(col)
        scroll.addView(col)
        root.addView(scroll, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        return root
    }

    private fun renderBody(col: LinearLayout) {
        val lang = prefs.language

        fun refresh() {
            col.removeAllViews()
            renderBody(col)
        }

        // Hero Banner Card
        val hero = LiteTheme.card(context, palette, 16)
        hero.background = LiteTheme.roundedBox(context, palette.elevated, palette.accent, 18)
        hero.addView(LiteTheme.label(context, palette, "STRIDE LITE", 20f, bold = true, colorOverride = palette.accent))
        hero.addView(LiteTheme.spacer(context, 4))
        hero.addView(LiteTheme.label(context, palette, LiteStrings.t(lang, "subtitle"), 13f, secondary = true))
        col.addView(hero)
        col.addView(LiteTheme.spacer(context, 14))

        if (!awaitingOtp) {
            val segRow = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
            val btnSignIn = LiteTheme.pillButton(
                context, palette, LiteStrings.t(lang, "signIn"),
                primary = !isSignup
            ).apply {
                setOnClickListener { isSignup = false; errorMsg = null; noticeMsg = null; refresh() }
            }
            val btnSignUp = LiteTheme.pillButton(
                context, palette, LiteStrings.t(lang, "signUp"),
                primary = isSignup
            ).apply {
                setOnClickListener { isSignup = true; errorMsg = null; noticeMsg = null; refresh() }
            }
            segRow.addView(btnSignIn, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            segRow.addView(View(context), LinearLayout.LayoutParams(LiteTheme.dp(context, 8), 1))
            segRow.addView(btnSignUp, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            col.addView(segRow)
            col.addView(LiteTheme.spacer(context, 12))
        }

        if (!errorMsg.isNullOrBlank()) {
            val errCard = LiteTheme.card(context, palette, 12).apply {
                background = LiteTheme.roundedBox(context, 0x22F43F5E, palette.danger, 12)
            }
            errCard.addView(LiteTheme.label(context, palette, errorMsg!!, 13f, colorOverride = palette.danger))
            col.addView(errCard)
            col.addView(LiteTheme.spacer(context, 10))
        }

        if (!noticeMsg.isNullOrBlank()) {
            val okCard = LiteTheme.card(context, palette, 12).apply {
                background = LiteTheme.roundedBox(context, 0x2210B981, palette.success, 12)
            }
            okCard.addView(LiteTheme.label(context, palette, noticeMsg!!, 13f, colorOverride = palette.success))
            col.addView(okCard)
            col.addView(LiteTheme.spacer(context, 10))
        }

        if (awaitingOtp) {
            val otpField = LiteTheme.inputField(
                context, palette, LiteStrings.t(lang, "verifyCode"),
                InputType.TYPE_CLASS_NUMBER, ""
            ).apply {
                filters = arrayOf(InputFilter.LengthFilter(6))
                gravity = Gravity.CENTER
                textSize = 20f
            }
            col.addView(otpField)
            col.addView(LiteTheme.spacer(context, 12))
            col.addView(
                LiteTheme.pillButton(context, palette, LiteStrings.t(lang, "verifyAndSignIn"), primary = true).apply {
                    setOnClickListener {
                        val code = otpField.text.toString().trim()
                        if (code.length != 6) {
                            errorMsg = "Enter a valid 6-digit code."
                            refresh()
                            return@setOnClickListener
                        }
                        runBg {
                            try {
                                api.verifyEmail(lastEmail, code)
                                if (lastPass.isNotEmpty()) {
                                    api.loginWithEmail(lastEmail, lastPass)
                                    runUi { onSignedIn() }
                                } else {
                                    runUi {
                                        awaitingOtp = false
                                        noticeMsg = "Verified! Please sign in."
                                        refresh()
                                    }
                                }
                            } catch (e: Throwable) {
                                runUi { errorMsg = e.message; refresh() }
                            }
                        }
                    }
                }
            )
            col.addView(LiteTheme.spacer(context, 8))
            val row = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
            row.addView(
                LiteTheme.pillButton(context, palette, LiteStrings.t(lang, "resendCode"), primary = false).apply {
                    setOnClickListener {
                        runBg {
                            try {
                                api.resendVerification(lastEmail, lang)
                                runUi { noticeMsg = "Fresh code sent to $lastEmail"; errorMsg = null; refresh() }
                            } catch (e: Throwable) {
                                runUi { errorMsg = e.message; refresh() }
                            }
                        }
                    }
                },
                LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            )
            row.addView(View(context), LinearLayout.LayoutParams(LiteTheme.dp(context, 8), 1))
            row.addView(
                LiteTheme.pillButton(context, palette, LiteStrings.t(lang, "back"), primary = false).apply {
                    setOnClickListener { awaitingOtp = false; errorMsg = null; noticeMsg = null; refresh() }
                }
            )
            col.addView(row)
            return
        }

        val nameField = if (isSignup) LiteTheme.inputField(
            context, palette, LiteStrings.t(lang, "displayName"), InputType.TYPE_CLASS_TEXT
        ) else null
        val handleField = if (isSignup) LiteTheme.inputField(
            context, palette, LiteStrings.t(lang, "handle"), InputType.TYPE_CLASS_TEXT
        ) else null
        val emailField = LiteTheme.inputField(
            context, palette, LiteStrings.t(lang, "email"),
            InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS,
            lastEmail
        )
        val passField = LiteTheme.inputField(
            context, palette, LiteStrings.t(lang, "password"),
            InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD,
            lastPass
        )

        if (nameField != null && handleField != null) {
            col.addView(nameField)
            col.addView(LiteTheme.spacer(context, 10))
            col.addView(handleField)
            col.addView(LiteTheme.spacer(context, 10))
        }
        col.addView(emailField)
        col.addView(LiteTheme.spacer(context, 10))
        col.addView(passField)
        col.addView(LiteTheme.spacer(context, 14))

        col.addView(
            LiteTheme.pillButton(
                context, palette,
                if (isSignup) LiteStrings.t(lang, "signUp") else LiteStrings.t(lang, "signIn"),
                primary = true
            ).apply {
                setOnClickListener {
                    val em = emailField.text.toString().trim()
                    val pw = passField.text.toString()
                    lastEmail = em
                    lastPass = pw
                    runBg {
                        try {
                            if (isSignup) {
                                api.signup(
                                    em, pw,
                                    nameField?.text?.toString()?.trim() ?: "",
                                    handleField?.text?.toString()?.trim()?.lowercase() ?: "",
                                    lang
                                )
                                runUi {
                                    isSignup = false
                                    awaitingOtp = true
                                    errorMsg = null
                                    noticeMsg = "Enter the 6-digit code sent to $em"
                                    refresh()
                                }
                            } else {
                                api.loginWithEmail(em, pw)
                                runUi { onSignedIn() }
                            }
                        } catch (e: com.stride.tracker.lite.net.ApiException) {
                            runUi {
                                if (e.code == "EMAIL_NOT_VERIFIED") awaitingOtp = true
                                errorMsg = e.message
                                refresh()
                            }
                        } catch (e: Throwable) {
                            runUi { errorMsg = e.message; refresh() }
                        }
                    }
                }
            }
        )

        if (!isSignup) {
            col.addView(LiteTheme.spacer(context, 8))
            col.addView(
                LiteTheme.pillButton(context, palette, LiteStrings.t(lang, "forgotPassword"), primary = false).apply {
                    setOnClickListener {
                        val em = emailField.text.toString().trim()
                        if (em.isEmpty()) {
                            errorMsg = "Enter your email first to reset password."
                            refresh()
                            return@setOnClickListener
                        }
                        lastEmail = em
                        runBg {
                            try {
                                api.requestPasswordReset(em, lang)
                                runUi { showResetDialog(em, ::refresh) }
                            } catch (e: Throwable) {
                                runUi { errorMsg = e.message; refresh() }
                            }
                        }
                    }
                }
            )
        }

        col.addView(LiteTheme.spacer(context, 10))
        col.addView(
            LiteTheme.pillButton(context, palette, LiteStrings.t(lang, "continueGoogle"), primary = false).apply {
                setOnClickListener {
                    val uri = Uri.parse(api.googleStartUrl(lang))
                    context.startActivity(Intent(Intent.ACTION_VIEW, uri))
                }
            }
        )
        col.addView(LiteTheme.spacer(context, 8))
        col.addView(
            LiteTheme.pillButton(context, palette, LiteStrings.t(lang, "demoLogin"), primary = false).apply {
                setOnClickListener {
                    runBg {
                        try {
                            api.loginWithEmail("arjun@stride.demo", "StrideDemo123!")
                            runUi { onSignedIn() }
                        } catch (e: Throwable) {
                            runUi { errorMsg = e.message; refresh() }
                        }
                    }
                }
            }
        )
    }

    private fun showResetDialog(email: String, onDone: () -> Unit) {
        val codeBox = EditText(context).apply {
            hint = "6-Digit Reset Code"
            inputType = InputType.TYPE_CLASS_NUMBER
            filters = arrayOf(InputFilter.LengthFilter(6))
        }
        val passBox = EditText(context).apply {
            hint = "New Password (8+ chars)"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        val layout = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            val p = LiteTheme.dp(context, 18)
            setPadding(p, p / 2, p, 0)
            addView(codeBox)
            addView(passBox)
        }
        AlertDialog.Builder(context)
            .setTitle("Reset Password ($email)")
            .setView(layout)
            .setPositiveButton("Update") { _, _ ->
                val code = codeBox.text.toString().trim()
                val np = passBox.text.toString()
                if (code.length != 6 || np.length < 8) {
                    errorMsg = "Enter a 6-digit code and 8+ character password."
                    onDone()
                    return@setPositiveButton
                }
                runBg {
                    try {
                        api.confirmPasswordReset(email, code, np)
                        lastPass = np
                        runUi {
                            noticeMsg = "Password updated! Sign in with your new password."
                            errorMsg = null
                            onDone()
                        }
                    } catch (e: Throwable) {
                        runUi { errorMsg = e.message; onDone() }
                    }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showServerDialog() {
        val box = EditText(context).apply {
            setText(prefs.baseUrl)
            inputType = InputType.TYPE_TEXT_VARIATION_URI
        }
        AlertDialog.Builder(context)
            .setTitle(LiteStrings.t(prefs.language, "serverUrl"))
            .setView(box)
            .setPositiveButton("Save") { _, _ ->
                prefs.baseUrl = box.text.toString()
                Toast.makeText(context, "API URL updated", Toast.LENGTH_SHORT).show()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
}
