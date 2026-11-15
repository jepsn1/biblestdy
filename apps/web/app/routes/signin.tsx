import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { operator } from "~/lib/app-info";
import { authClient } from "~/lib/auth-client";
import i18n, { setUiLanguage } from "~/lib/i18n";
import { nextFromSearch } from "~/lib/next-path";
import { redirectIfAuthed } from "~/lib/require-auth";
import type { Route } from "./+types/signin";

export function meta() {
  return [{ title: i18n.t("signin.metaTitle") }];
}

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  await redirectIfAuthed(nextFromSearch(new URL(request.url).search));
  return null;
}

type Step = "email" | "code";

export default function SignIn() {
  const { t, i18n: i18next } = useTranslation();
  const navigate = useNavigate();
  // Where to go once signed in: the page that sent the reader here (an
  // expired session, a deep link) — same-origin paths only
  const [params] = useSearchParams();
  const next = nextFromSearch(params.toString());
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    // Send both: OTP code (typed here) and a magic link (clickable in email)
    const [otp] = await Promise.all([
      authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" }),
      authClient.signIn.magicLink({ email, callbackURL: next }),
    ]);
    setBusy(false);
    if (otp.error) {
      setError(t("signin.sendError"));
      return;
    }
    setStep("code");
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.emailOtp({ email, otp: code });
    setBusy(false);
    if (error) {
      setError(t("signin.codeError"));
      return;
    }
    navigate(next, { replace: true });
  }

  return (
    <main className="flex h-dvh items-center justify-center overflow-hidden px-6">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex select-none items-baseline gap-1.5">
          <span className="font-mono text-reading font-semibold tracking-tight text-primary">
            biblestdy
          </span>
        </Link>

        {step === "email" ? (
          <form onSubmit={sendCode} className="rounded-lg border border-border bg-card p-6">
            <h1 className="font-serif text-title font-medium">{t("signin.title")}</h1>
            <p className="mt-1 mb-4 text-control text-muted-foreground">{t("signin.subtitle")}</p>
            <Input
              type="email"
              required
              // eslint-disable-next-line jsx-a11y/no-autofocus -- sign-in page's only field
              autoFocus
              placeholder="you@example.com"
              aria-label={t("signin.email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="text-control"
            />
            <Button type="submit" className="mt-3 w-full" disabled={busy}>
              {busy ? t("signin.sending") : t("signin.send")}
            </Button>
            {error && <p className="mt-3 text-meta text-destructive">{error}</p>}
          </form>
        ) : (
          <form onSubmit={verifyCode} className="rounded-lg border border-border bg-card p-6">
            <h1 className="font-serif text-title font-medium">{t("signin.codeTitle")}</h1>
            <p className="mt-1 mb-4 text-control text-muted-foreground">
              {t("signin.sentTo")} <span className="text-foreground">{email}</span>.{" "}
              {t("signin.typeCode")}
            </p>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              // eslint-disable-next-line jsx-a11y/no-autofocus -- code step replaces the email form; move focus to its only field
              autoFocus
              placeholder="123456"
              aria-label={t("signin.code")}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="text-center font-mono text-reading tracking-[0.5em]"
            />
            <Button type="submit" className="mt-3 w-full" disabled={busy}>
              {busy ? t("signin.verifying") : t("signin.verify")}
            </Button>
            {error && <p className="mt-3 text-meta text-destructive">{error}</p>}
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
              }}
              className="mt-3 w-full text-center text-meta text-muted-foreground hover:text-foreground"
            >
              {t("signin.differentEmail")}
            </button>
          </form>
        )}

        <button
          type="button"
          aria-label={t("nav.language")}
          onClick={() => setUiLanguage(i18next.language.startsWith("da") ? "en" : "da")}
          className="mx-auto mt-6 block text-center text-meta text-muted-foreground hover:text-foreground"
        >
          {i18next.language.startsWith("da") ? "English" : "Dansk"}
        </button>
        <Link
          to="/privacy"
          className="mx-auto mt-1 block text-center text-meta text-muted-foreground hover:text-foreground"
        >
          {t("settings.privacy")}
        </Link>
        <p className="mt-4 text-center text-meta text-muted-foreground">
          {t("signin.operatedBy", operator)}
        </p>
      </div>
    </main>
  );
}
