import { Logger } from '@nestjs/common';

const logger = new Logger('AuthEmail');

/**
 * Auth email sender. The sign-in page requests magic link and OTP in
 * parallel, so Better Auth fires two separate callbacks — we coalesce the
 * two parts per address into ONE email (see auth.ts doc comment).
 *
 * No RESEND_API_KEY -> dev mode: link + code are logged, nothing is sent.
 */

const COALESCE_MS = 2500;

interface Pending {
  url?: string;
  otp?: string;
  timer: NodeJS.Timeout;
}

const pending = new Map<string, Pending>();

export function queueAuthEmail(
  email: string,
  part: { url?: string; otp?: string },
): void {
  const entry = pending.get(email);
  if (entry) {
    Object.assign(entry, part);
    if (entry.url && entry.otp) {
      clearTimeout(entry.timer);
      pending.delete(email);
      void send(email, entry);
    }
    return;
  }
  const fresh: Pending = {
    ...part,
    // Fallback: if only one flow was triggered, send what we have
    timer: setTimeout(() => {
      pending.delete(email);
      void send(email, fresh);
    }, COALESCE_MS),
  };
  pending.set(email, fresh);
}

async function send(email: string, { url, otp }: Pending): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (url) logger.log(`Magic link for ${email}: ${url}`);
    if (otp) logger.log(`OTP for ${email}: ${otp}`);
    return;
  }

  const linkHtml = url
    ? `<p style="margin:24px 0"><a href="${url}" style="background:#b8860b;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Sign in to biblestdy</a></p>`
    : '';
  const otpHtml = otp
    ? `<p>Or enter this code: <strong style="font-size:20px;letter-spacing:3px">${otp}</strong></p>`
    : '';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? 'biblestdy <auth@biblestdy.com>',
        to: [email],
        subject: 'Sign in to biblestdy',
        text: [
          'Sign in to biblestdy:',
          url && `Link: ${url}`,
          otp && `Code: ${otp}`,
          'If you did not request this, ignore this email.',
        ]
          .filter(Boolean)
          .join('\n\n'),
        html: `<div style="font-family:sans-serif;max-width:480px">${linkHtml}${otpHtml}<p style="color:#888;font-size:13px">If you didn't request this, ignore this email.</p></div>`,
      }),
    });
    if (!res.ok) {
      logger.error(`Resend ${res.status}: ${await res.text()}`);
    } else {
      logger.log(`Auth email sent to ${email}`);
    }
  } catch (err) {
    logger.error(`Auth email to ${email} failed`, err);
  }
}
