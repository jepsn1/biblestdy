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
  /** From whichever request came first; both carry the same header. */
  lang: EmailLanguage;
  timer: NodeJS.Timeout;
}

const pending = new Map<string, Pending>();

export type EmailLanguage = 'en' | 'da';

/** The email's language. The sign-in page sends its UI language as
 * Accept-Language (the browser's own header is the fallback): Danish if it
 * leads with da, else English. `ctx` = Better Auth's endpoint context. */
export function emailLanguage(ctx?: {
  headers?: Headers;
  request?: Request;
}): EmailLanguage {
  const accept = (ctx?.headers ?? ctx?.request?.headers)?.get(
    'accept-language',
  );
  return accept && /^da\b/i.test(accept.trim()) ? 'da' : 'en';
}

const COPY = {
  en: {
    subject: 'Your sign-in code for biblestdy',
    button: 'Sign in to biblestdy',
    link: 'Link',
    orCode: 'Or enter this code:',
    code: 'Code',
    ignore: "If you didn't request this, ignore this email.",
  },
  da: {
    subject: 'Din loginkode til biblestdy',
    button: 'Log ind på biblestdy',
    link: 'Link',
    orCode: 'Eller indtast denne kode:',
    code: 'Kode',
    ignore: 'Har du ikke bedt om denne e-mail, kan du bare ignorere den.',
  },
} satisfies Record<EmailLanguage, Record<string, string>>;

/** Subject + plain text + HTML for one sign-in email, in the reader's UI
 * language — usually their first contact with biblestdy. */
export function renderAuthEmail({
  url,
  otp,
  lang,
}: {
  url?: string;
  otp?: string;
  lang: EmailLanguage;
}): { subject: string; text: string; html: string } {
  const c = COPY[lang];
  const linkHtml = url
    ? `<p style="margin:24px 0"><a href="${url}" style="background:#b8860b;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">${c.button}</a></p>`
    : '';
  // With no link the code is the only way in — no "Or"
  const otpHtml = otp
    ? `<p>${url ? c.orCode : `${c.code}:`} <strong style="font-size:20px;letter-spacing:3px">${otp}</strong></p>`
    : '';
  return {
    subject: c.subject,
    text: [
      `${c.button}:`,
      url && `${c.link}: ${url}`,
      otp && `${c.code}: ${otp}`,
      c.ignore,
    ]
      .filter(Boolean)
      .join('\n\n'),
    html: `<div lang="${lang}" style="font-family:sans-serif;max-width:480px">${linkHtml}${otpHtml}<p style="color:#666;font-size:14px">${c.ignore}</p></div>`,
  };
}

export function queueAuthEmail(
  email: string,
  part: { url?: string; otp?: string },
  lang: EmailLanguage = 'en',
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
    lang,
    // Fallback: if only one flow was triggered, send what we have
    timer: setTimeout(() => {
      pending.delete(email);
      void send(email, fresh);
    }, COALESCE_MS),
  };
  pending.set(email, fresh);
}

async function send(email: string, { url, otp, lang }: Pending): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (url) logger.log(`Magic link for ${email} (${lang}): ${url}`);
    if (otp) logger.log(`OTP for ${email} (${lang}): ${otp}`);
    return;
  }

  const { subject, text, html } = renderAuthEmail({ url, otp, lang });
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
        subject,
        text,
        html,
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
