import {
  BookOpen,
  Highlighter,
  Keyboard,
  Languages,
  Lock,
  NotebookPen,
  PenLine,
  Smartphone,
  Sun,
  Tags,
  Type,
  Waypoints,
} from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { buttonVariants } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import { operator } from "~/lib/app-info";
import { setUiLanguage } from "~/lib/i18n";
import { cn } from "~/lib/utils";
import { StudyMock } from "./study-mock";

/** Public front door (signed-out web visitors). Tone: Scripture first, the app
 * second — say plainly what it is and get out of the way. No hype, no
 * urgency, no conversion tricks. All copy in locales (`landing.*`). */

const SUPPORT_EMAIL = "support@biblestdy.com";

export function Landing() {
  const { t, i18n } = useTranslation();
  const howRef = useRef<HTMLElement>(null);
  const isDa = i18n.language.startsWith("da");

  return (
    <main className="h-dvh overflow-hidden">
      <ScrollArea className="h-full">
        {/* Header */}
        <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <Link to="/" className="flex select-none items-baseline gap-1.5">
            <span className="font-mono text-reading font-semibold tracking-tight text-primary">
              biblestdy
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            <button
              type="button"
              aria-label={t("nav.language")}
              onClick={() => setUiLanguage(isDa ? "en" : "da")}
              className={buttonVariants({ variant: "ghost" })}
            >
              {isDa ? "English" : "Dansk"}
            </button>
            <Link to="/signin" className={buttonVariants({ variant: "outline" })}>
              {t("landing.signIn")}
            </Link>
          </nav>
        </header>

        {/* Hero */}
        <section className="mx-auto max-w-5xl px-6 pt-10 pb-16 sm:pt-16">
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow">{t("landing.eyebrow")}</p>
            <h1 className="mt-4 font-serif text-display font-medium text-balance sm:text-hero">
              {t("landing.heroTitle")}
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-reading text-pretty text-muted-foreground">
              {t("landing.heroBody")}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/signin"
                className={cn(buttonVariants({ size: "lg" }), "h-11 px-5 text-phone")}
              >
                {t("landing.ctaStart")}
              </Link>
              <button
                type="button"
                onClick={() => howRef.current?.scrollIntoView({ behavior: "smooth" })}
                className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "h-11 px-4 text-phone")}
              >
                {t("landing.ctaHow")}
              </button>
            </div>
            <p className="mx-auto mt-4 max-w-sm text-control text-muted-foreground">{t("landing.ctaNote")}</p>
          </div>

          <div className="mt-14">
            <StudyMock />
          </div>
        </section>

        {/* Why — Christ first */}
        <section className="border-y border-border bg-card">
          <div className="mx-auto max-w-2xl px-6 py-16 text-center">
            <blockquote>
              <p className="font-serif text-title text-balance italic">
                {t("landing.whyVerse")}
              </p>
              <footer className="mt-3 font-mono text-meta text-muted-foreground">
                {t("landing.whyVerseRef")}
              </footer>
            </blockquote>
            <p className="mt-8 text-reading text-pretty text-muted-foreground">
              {t("landing.whyBody1")}
            </p>
            <p className="mt-4 text-reading text-pretty text-muted-foreground">
              {t("landing.whyBody2")}
            </p>
          </div>
        </section>

        {/* How you study */}
        <section ref={howRef} className="mx-auto max-w-5xl scroll-mt-6 px-6 py-20">
          <SectionHead eyebrow={t("landing.howEyebrow")} title={t("landing.howTitle")} body={t("landing.howBody")} />
          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            <Feature icon={Highlighter} title={t("landing.howHighlightTitle")} body={t("landing.howHighlightBody")} />
            <Feature icon={PenLine} title={t("landing.howMarginTitle")} body={t("landing.howMarginBody")} />
            <Feature icon={NotebookPen} title={t("landing.howNoteTitle")} body={t("landing.howNoteBody")} />
          </div>
        </section>

        {/* Study that stays */}
        <section className="mx-auto max-w-5xl px-6 pb-20">
          <SectionHead eyebrow={t("landing.growEyebrow")} title={t("landing.growTitle")} body={t("landing.growBody")} />
          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            <Feature icon={Waypoints} title={t("landing.growLinkTitle")} body={t("landing.growLinkBody")} />
            <Feature icon={Tags} title={t("landing.growTopicTitle")} body={t("landing.growTopicBody")} />
            <Feature icon={BookOpen} title={t("landing.growReturnTitle")} body={t("landing.growReturnBody")} />
          </div>
        </section>

        {/* Made for reading */}
        <section className="border-y border-border bg-card">
          <div className="mx-auto max-w-5xl px-6 py-20">
            <SectionHead
              eyebrow={t("landing.readEyebrow")}
              title={t("landing.readTitle")}
              body={t("landing.readBody")}
            />
            <ul className="mx-auto mt-12 grid max-w-3xl gap-x-10 gap-y-6 sm:grid-cols-2">
              <Point icon={BookOpen} title={t("landing.readPagesTitle")} body={t("landing.readPagesBody")} />
              <Point icon={Languages} title={t("landing.readTranslationsTitle")} body={t("landing.readTranslationsBody")} />
              <Point icon={Sun} title={t("landing.readLookTitle")} body={t("landing.readLookBody")} />
              <Point icon={Type} title={t("landing.readSizeTitle")} body={t("landing.readSizeBody")} />
              <Point icon={Smartphone} title={t("landing.readDevicesTitle")} body={t("landing.readDevicesBody")} />
              <Point className="hidden sm:flex" icon={Keyboard} title={t("landing.readKeysTitle")} body={t("landing.readKeysBody")} />
            </ul>
          </div>
        </section>

        {/* Promises */}
        <section className="mx-auto max-w-5xl px-6 py-20">
          <SectionHead eyebrow={t("landing.promiseEyebrow")} title={t("landing.promiseTitle")} />
          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            <Feature icon={BookOpen} title={t("landing.promiseInterpretTitle")} body={t("landing.promiseInterpretBody")} />
            <Feature icon={Lock} title={t("landing.promisePrivateTitle")} body={t("landing.promisePrivateBody")} />
            <Feature icon={Highlighter} title={t("landing.promiseFreeTitle")} body={t("landing.promiseFreeBody")} />
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-2xl px-6 pb-20">
          <h2 className="text-center font-serif text-title font-medium">{t("landing.faqTitle")}</h2>
          <div className="mt-8 divide-y divide-border border-y border-border">
            {(["new", "free", "translations", "private", "phone", "group", "password", "danish"] as const).map((k) => (
              <details key={k} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-phone font-medium [&::-webkit-details-marker]:hidden">
                  {t(`landing.faq.${k}.q`)}
                  <span
                    aria-hidden
                    className="text-muted-foreground transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-2 text-phone leading-relaxed text-muted-foreground">
                  {t(`landing.faq.${k}.a`)}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* Closing */}
        <section className="border-t border-border bg-card">
          <div className="mx-auto max-w-2xl px-6 py-20 text-center">
            <h2 className="font-serif text-display font-medium text-balance">
              {t("landing.closeTitle")}
            </h2>
            <p className="mx-auto mt-4 max-w-md text-reading text-pretty text-muted-foreground">
              {t("landing.closeBody")}
            </p>
            <Link
              to="/signin"
              className={cn(buttonVariants({ size: "lg" }), "mt-8 h-11 px-5 text-phone")}
            >
              {t("landing.ctaStart")}
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-6 py-10 text-meta text-muted-foreground sm:flex-row sm:justify-between">
          <p>{t("signin.operatedBy", operator)}</p>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <Link to="/privacy" className="hover:text-foreground">
              {t("settings.privacy")}
            </Link>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-foreground">
              {SUPPORT_EMAIL}
            </a>
            <button
              type="button"
              aria-label={t("nav.language")}
              onClick={() => setUiLanguage(isDa ? "en" : "da")}
              className="hover:text-foreground"
            >
              {isDa ? "English" : "Dansk"}
            </button>
          </div>
        </footer>
      </ScrollArea>
    </main>
  );
}

function SectionHead({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-3 font-serif text-display font-medium text-balance">{title}</h2>
      {body && <p className="mt-4 text-reading text-pretty text-muted-foreground">{body}</p>}
    </div>
  );
}

type IconType = React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

function Feature({ icon: Icon, title, body }: { icon: IconType; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-6">
      <Icon aria-hidden className="size-5 text-primary" />
      <h3 className="mt-4 font-serif text-reading font-medium">{title}</h3>
      <p className="mt-2 text-phone leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function Point({
  icon: Icon,
  title,
  body,
  className,
}: {
  icon: IconType;
  title: string;
  body: string;
  className?: string;
}) {
  return (
    <li className={cn("flex gap-4", className)}>
      <Icon aria-hidden className="mt-1 size-5 shrink-0 text-primary" />
      <div>
        <h3 className="text-phone font-medium">{title}</h3>
        <p className="mt-1 text-phone leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </li>
  );
}
