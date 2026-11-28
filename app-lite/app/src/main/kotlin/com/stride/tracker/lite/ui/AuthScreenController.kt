package com.stride.tracker.lite.ui

import android.net.Uri
import android.text.InputType
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.view.isVisible
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.textfield.TextInputEditText
import com.stride.tracker.lite.core.LiteStrings
import com.stride.tracker.lite.core.StrideAppContainer
import com.stride.tracker.lite.databinding.LayoutAuthBinding
import com.stride.tracker.lite.net.ApiException
import kotlin.concurrent.thread

class AuthScreenController(
    private val binding: LayoutAuthBinding,
    private val onAuthenticated: () -> Unit,
    private val onLocaleToggled: () -> Unit
) {
    private var isSignup = false
    private var busy = false

    fun bind() {
        refreshLabels()
        binding.btnTabSignIn.setOnClickListener {
            isSignup = false
            updateModeVisibility()
        }
        binding.btnTabSignUp.setOnClickListener {
            isSignup = true
            updateModeVisibility()
        }
        binding.chipAuthLang.setOnClickListener {
            val next = if (StrideAppContainer.prefs.language == "hi") "en" else "hi"
            StrideAppContainer.prefs.language = next
            refreshLabels()
            onLocaleToggled()
        }
        binding.btnAuthSubmit.setOnClickListener { submitEmailFlow() }
        binding.btnForgotPassword.setOnClickListener { openForgotPasswordDialog() }
        binding.btnVerifyCodeOpen.setOnClickListener {
            openOtpDialog(binding.etEmail.text?.toString().orEmpty().trim())
        }
        binding.btnGoogleSignIn.setOnClickListener { launchGoogleOAuth() }
        binding.btnDemoLogin.setOnClickListener { performLogin("arjun@stride.demo", "StrideDemo123!") }
    }

    fun refreshLabels() {
        val lang = StrideAppContainer.prefs.language
        binding.tvAuthHeroBadge.text = LiteStrings[lang, "heroBadge"]
        binding.tvAuthHeroTitle.text = LiteStrings[lang, "heroTitle"]
        binding.tvAuthHeroSub.text = LiteStrings[lang, "heroSub"]
        binding.btnTabSignIn.text = LiteStrings[lang, "signIn"]
        binding.btnTabSignUp.text = LiteStrings[lang, "createAccount"]
        binding.btnForgotPassword.text = LiteStrings[lang, "forgotPassword"]
        binding.btnVerifyCodeOpen.text = LiteStrings[lang, "enterOtp"]
        binding.btnGoogleSignIn.text = LiteStrings[lang, "continueGoogle"]
        binding.btnDemoLogin.text = LiteStrings[lang, "demoSignIn"]
        binding.chipAuthLang.text = if (lang == "hi") "हिन्दी · EN" else "EN · हिन्दी"
        updateModeVisibility()
    }

    private fun updateModeVisibility() {
        val lang = StrideAppContainer.prefs.language
        binding.tilDisplayName.isVisible = isSignup
        binding.tilHandle.isVisible = isSignup
        binding.btnAuthSubmit.text = if (isSignup) LiteStrings[lang, "createAccount"] else LiteStrings[lang, "signIn"]
        binding.tvAuthError.isVisible = false
    }

    private fun setBusy(loading: Boolean) {
        busy = loading
        binding.btnAuthSubmit.isEnabled = !loading
        binding.btnGoogleSignIn.isEnabled = !loading
        binding.btnDemoLogin.isEnabled = !loading
    }

    private fun showError(msg: String) {
        binding.tvAuthError.text = msg
        binding.tvAuthError.isVisible = true
    }

    private fun submitEmailFlow() {
        if (busy) return
        val email = binding.etEmail.text?.toString().orEmpty().trim()
        val pass = binding.etPassword.text?.toString().orEmpty()
        if (email.isBlank() || pass.length < 6) {
            showError("Enter a valid email and password.")
            return
        }
        if (!isSignup) {
            performLogin(email, pass)
            return
        }
        val name = binding.etDisplayName.text?.toString().orEmpty().trim()
        val handle = binding.etHandle.text?.toString().orEmpty().trim().lowercase()
        if (name.length < 2 || handle.length < 3) {
            showError("Enter display name (2+ chars) and handle (3+ chars).")
            return
        }
        setBusy(true)
        binding.tvAuthError.isVisible = false
        val lang = StrideAppContainer.prefs.language
        thread {
            try {
                StrideAppContainer.api.signup(email, pass, name, handle, lang)
                binding.root.post {
                    setBusy(false)
                    openOtpDialog(email, pass)
                }
            } catch (t: Throwable) {
                binding.root.post {
                    setBusy(false)
                    showError(t.message ?: "Signup failed")
                }
            }
        }
    }

    private fun performLogin(email: String, password: String) {
        if (busy) return
        setBusy(true)
        binding.tvAuthError.isVisible = false
        thread {
            try {
                StrideAppContainer.api.login(email, password)
                binding.root.post {
                    setBusy(false)
                    onAuthenticated()
                }
            } catch (apiErr: ApiException) {
                binding.root.post {
                    setBusy(false)
                    if (apiErr.code == "EMAIL_NOT_VERIFIED") {
                        openOtpDialog(email, password)
                    } else {
                        showError(apiErr.message ?: "Invalid credentials")
                    }
                }
            } catch (t: Throwable) {
                binding.root.post {
                    setBusy(false)
                    showError(t.message ?: "Sign in failed")
                }
            }
        }
    }

    private fun openOtpDialog(initialEmail: String, pendingPassword: String? = null) {
        val ctx = binding.root.context
        val col = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            val pad = (ctx.resources.displayMetrics.density * 18).toInt()
            setPadding(pad, pad / 2, pad, 0)
        }
        val info = TextView(ctx).apply {
            text = "Enter the 6-digit verification OTP sent to your email."
        }
        val etEmail = TextInputEditText(ctx).apply {
            hint = "Email"
            setText(initialEmail)
            inputType = InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
        }
        val etOtp = TextInputEditText(ctx).apply {
            hint = "6-digit OTP"
            inputType = InputType.TYPE_CLASS_NUMBER
        }
        col.addView(info)
        if (initialEmail.isBlank()) col.addView(etEmail)
        col.addView(etOtp)

        MaterialAlertDialogBuilder(ctx)
            .setTitle("Verify Email OTP")
            .setView(col)
            .setNegativeButton("Cancel", null)
            .setNeutralButton("Resend") { _, _ ->
                val target = if (initialEmail.isBlank()) etEmail.text.toString().trim() else initialEmail
                thread {
                    runCatching { StrideAppContainer.api.resendVerification(target, StrideAppContainer.prefs.language) }
                }
            }
            .setPositiveButton("Verify") { _, _ ->
                val targetEmail = if (initialEmail.isBlank()) etEmail.text.toString().trim() else initialEmail
                val code = etOtp.text.toString().trim()
                if (code.length < 6) return@setPositiveButton
                setBusy(true)
                thread {
                    try {
                        StrideAppContainer.api.verifyEmail(targetEmail, code)
                        if (!pendingPassword.isNullOrBlank()) {
                            StrideAppContainer.api.login(targetEmail, pendingPassword)
                            binding.root.post {
                                setBusy(false)
                                onAuthenticated()
                            }
                        } else {
                            binding.root.post {
                                setBusy(false)
                                isSignup = false
                                binding.btnTabSignIn.isChecked = true
                                updateModeVisibility()
                                binding.etEmail.setText(targetEmail)
                                showError("Verified! Now sign in with your password.")
                            }
                        }
                    } catch (t: Throwable) {
                        binding.root.post {
                            setBusy(false)
                            showError(t.message ?: "OTP verification failed")
                        }
                    }
                }
            }
            .show()
    }

    private fun openForgotPasswordDialog() {
        val ctx = binding.root.context
        val col = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            val pad = (ctx.resources.displayMetrics.density * 18).toInt()
            setPadding(pad, pad / 2, pad, 0)
        }
        val etEmail = TextInputEditText(ctx).apply {
            hint = "Account Email"
            setText(binding.etEmail.text?.toString().orEmpty().trim())
            inputType = InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
        }
        col.addView(etEmail)

        MaterialAlertDialogBuilder(ctx)
            .setTitle("Reset Password")
            .setView(col)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Send OTP") { _, _ ->
                val email = etEmail.text.toString().trim()
                if (email.isBlank()) return@setPositiveButton
                thread {
                    runCatching { StrideAppContainer.api.forgotPassword(email, StrideAppContainer.prefs.language) }
                    binding.root.post { openConfirmResetDialog(email) }
                }
            }
            .show()
    }

    private fun openConfirmResetDialog(email: String) {
        val ctx = binding.root.context
        val col = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            val pad = (ctx.resources.displayMetrics.density * 18).toInt()
            setPadding(pad, pad / 2, pad, 0)
        }
        val etCode = TextInputEditText(ctx).apply {
            hint = "6-digit Reset Code"
            inputType = InputType.TYPE_CLASS_NUMBER
        }
        val etNewPass = TextInputEditText(ctx).apply {
            hint = "New Password (8+ chars)"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        col.addView(etCode)
        col.addView(etNewPass)

        MaterialAlertDialogBuilder(ctx)
            .setTitle("Enter Reset OTP")
            .setView(col)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Reset") { _, _ ->
                val code = etCode.text.toString().trim()
                val np = etNewPass.text.toString()
                if (code.length < 6 || np.length < 8) {
                    showError("Provide 6-digit OTP and 8+ char new password.")
                    return@setPositiveButton
                }
                setBusy(true)
                thread {
                    try {
                        StrideAppContainer.api.resetPassword(email, code, np)
                        StrideAppContainer.api.login(email, np)
                        binding.root.post {
                            setBusy(false)
                            onAuthenticated()
                        }
                    } catch (t: Throwable) {
                        binding.root.post {
                            setBusy(false)
                            showError(t.message ?: "Reset failed")
                        }
                    }
                }
            }
            .show()
    }

    private fun launchGoogleOAuth() {
        val base = StrideAppContainer.prefs.apiBaseUrl.trimEnd('/')
        val lang = StrideAppContainer.prefs.language
        val url = Uri.parse("$base/v1/auth/google/start?locale=$lang&client=lite")
        CustomTabsIntent.Builder().build().launchUrl(binding.root.context, url)
    }
}
