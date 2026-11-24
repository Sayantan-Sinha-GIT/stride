import type { Env } from '../types.js';
import { kvGetJson, kvIncrementWithTtl } from './cache.js';
import type { Lang } from './i18n.js';

const BREVO_DAILY_CAP = 290; // Leave headroom below 300/day free cap

export interface EmailDispatchResult {
  sent: boolean;
  mode: 'brevo' | 'dev_console' | 'cap_exceeded' | 'error';
  detail?: string;
}

function todayKey(): string {
  return `brevo:count:${new Date().toISOString().slice(0, 10)}`;
}

export async function sendTransactionalEmail(
  env: Env,
  input: {
    toEmail: string;
    toName: string;
    subject: string;
    htmlContent: string;
    textContent: string;
  }
): Promise<EmailDispatchResult> {
  const key = todayKey();
  const existing = (await kvGetJson<{ count: number }>(env.STRIDE_KV, key))?.count ?? 0;
  if (existing >= BREVO_DAILY_CAP) {
    return { sent: false, mode: 'cap_exceeded', detail: 'Daily Brevo cap reached' };
  }

  if (!env.BREVO_API_KEY) {
    console.info(`[Stride Dev Email] To: ${input.toEmail} | Subject: ${input.subject}`);
    return { sent: true, mode: 'dev_console' };
  }

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: {
          email: env.BREVO_SENDER_EMAIL || 'noreply@stride.local',
          name: env.BREVO_SENDER_NAME || 'Stride',
        },
        to: [{ email: input.toEmail, name: input.toName }],
        subject: input.subject,
        htmlContent: input.htmlContent,
        textContent: input.textContent,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { sent: false, mode: 'error', detail: `Brevo ${res.status}: ${errText}` };
    }

    await kvIncrementWithTtl(env.STRIDE_KV, key, 86400);
    return { sent: true, mode: 'brevo' };
  } catch (err) {
    return {
      sent: false,
      mode: 'error',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export function buildVerificationEmail(
  lang: Lang,
  displayName: string,
  code6: string,
  verifyUrl: string
) {
  if (lang === 'hi') {
    return {
      subject: `Stride: आपका ईमेल सत्यापन कोड ${code6}`,
      htmlContent: `<p>नमस्ते ${displayName},</p><p>Stride खाता सत्यापित करने के लिए यह कोड दर्ज करें: <strong>${code6}</strong></p><p>या इस लिंक पर क्लिक करें: <a href="${verifyUrl}">ईमेल सत्यापित करें</a></p>`,
      textContent: `नमस्ते ${displayName}, Stride ईमेल सत्यापन कोड: ${code6} | लिंक: ${verifyUrl}`,
    };
  }
  return {
    subject: `Stride: Your verification code is ${code6}`,
    htmlContent: `<p>Hi ${displayName},</p><p>Enter this code to verify your Stride account: <strong>${code6}</strong></p><p>Or click directly: <a href="${verifyUrl}">Verify Email</a></p>`,
    textContent: `Hi ${displayName}, your Stride verification code is ${code6}. Verify at: ${verifyUrl}`,
  };
}

export function buildPasswordResetEmail(
  lang: Lang,
  displayName: string,
  code6: string,
  resetUrl: string
) {
  if (lang === 'hi') {
    return {
      subject: `Stride: पासवर्ड रीसेट कोड ${code6}`,
      htmlContent: `<p>नमस्ते ${displayName},</p><p>आपका पासवर्ड रीसेट कोड है: <strong>${code6}</strong></p><p>या रीसेट लिंक खोलें: <a href="${resetUrl}">पासवर्ड रीसेट करें</a></p>`,
      textContent: `नमस्ते ${displayName}, पासवर्ड रीसेट कोड: ${code6} | लिंक: ${resetUrl}`,
    };
  }
  return {
    subject: `Stride: Password reset code ${code6}`,
    htmlContent: `<p>Hi ${displayName},</p><p>Use this code to reset your password: <strong>${code6}</strong></p><p>Or open: <a href="${resetUrl}">Reset Password</a></p>`,
    textContent: `Hi ${displayName}, password reset code: ${code6}. Reset at: ${resetUrl}`,
  };
}
