import { scriptureLinks } from "@biblestdy/shared";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { cn, focusRing } from "~/lib/utils";
import "../locales/tour";
import { afterTyping, claimTour, releaseTour, skipAllTours, writeTour } from "./tour-memory";
import { readTour, tourDue, type TourId } from "./tour-state";
import type { TourKit } from "./tour-host";
import { insertedSince, isTypingKey, nextPlace, TOUR_STEPS, type TourPlace, type TourStep } from "./tour-steps";

/**
 * The notes tours (#162) — a lazy chunk, fetched only when one will show
 * (tour-host.tsx). One short card at a time on the app's Popover, no tour
 * library. Mads: no scrim, no spotlight — the target gets a 2px ring; the
 * card fades in 120ms at most (none under reduced motion).
 *
 * The note tour never takes focus (Kasper): the editor keeps it, the step
 * describes its target and is said once in a polite live region; typing in
 * the note closes it (back next note open, once). Tab from the target
 * reaches the card, Shift+Tab or Esc goes back. The Notes page tour moves
 * focus to each target (nothing is being written there). Either way the
 * card never shows over another dialog (the first-run style choice, the
 * palette, "+ Verse"), under the phone keyboard, or for a target off screen.
 */

/** Popups that aren't ours: the card waits while one is up. */
const POPUPS = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';
const FOCUSABLE = 'input, textarea, button, a[href], [contenteditable="true"], [tabindex]:not([tabindex="-1"])';
/** The note's text: the rich editor's, or its plain-text stand-in's. */
const NOTE_BODY = '[data-tour="note-editor"] [contenteditable="true"], [data-tour="note-body"]';

function shown(el: Element): boolean {
  if (!el.isConnected || el.closest('[inert], [aria-hidden="true"]')) return false;
  if (typeof el.checkVisibility === "function" && !el.checkVisibility({ visibilityProperty: true })) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/** The part of `el` on screen: its box clipped by every scroll box around
 * it and the visible viewport (the phone keyboard shrinks it). */
function visibleRect(el: Element): DOMRect | null {
  const r = el.getBoundingClientRect();
  let { left, top, right, bottom } = r;
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const s = getComputedStyle(p);
    if (!/(auto|scroll|hidden|clip)/.test(s.overflowX + s.overflowY)) continue;
    const pr = p.getBoundingClientRect();
    left = Math.max(left, pr.left);
    top = Math.max(top, pr.top);
    right = Math.min(right, pr.right);
    bottom = Math.min(bottom, pr.bottom);
  }
  const vv = window.visualViewport;
  left = Math.max(left, vv?.offsetLeft ?? 0);
  top = Math.max(top, vv?.offsetTop ?? 0);
  right = Math.min(right, vv ? vv.offsetLeft + vv.width : window.innerWidth);
  bottom = Math.min(bottom, vv ? vv.offsetTop + vv.height : window.innerHeight);
  return right - left >= 1 && bottom - top >= 1 ? new DOMRect(left, top, right - left, bottom - top) : null;
}

const coarse = () => window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(any-pointer: fine)").matches;

/** The on-screen keyboard is up (it takes a quarter of the screen or more). */
function keyboardUp(): boolean {
  const vv = window.visualViewport;
  return !!vv && window.matchMedia("(pointer: coarse)").matches && vv.height < window.innerHeight * 0.75;
}

/** What takes focus or a description for a target: itself, or its first
 * control. */
function focusTarget(el: HTMLElement): HTMLElement {
  if (el.matches(FOCUSABLE)) return el;
  return el.querySelector<HTMLElement>('[aria-pressed="true"]') ?? el.querySelector<HTMLElement>(FOCUSABLE) ?? el;
}

type Return = { el: HTMLElement; range: Range | null };
function saveReturn(el: HTMLElement): Return {
  const sel = window.getSelection();
  const range = sel && sel.rangeCount && el.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
  return { el, range };
}
function restoreReturn(r: Return) {
  r.el.focus({ preventScroll: true });
  if (!r.range) return;
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(r.range);
}

type TourProps = {
  /** Where the tour's targets live: the note panel, the Notes page. */
  root: () => HTMLElement | null;
  /** Asked for again (Settings, palette): no waiting on a fresh open. */
  replay?: boolean;
  /** The tour is over (done, skipped, closed, snoozed, or nothing to show). */
  onEnd: () => void;
  /** The page's Popover and Button (tour-host.tsx: TourKit). */
  kit: TourKit;
};

/** First note opened: write here → "+ Verse" → the verses overview. */
export function NoteTour({ body, ...props }: TourProps & { body: string }) {
  return <Tour id="note" body={body} {...props} />;
}

/** First visit to the Notes page: search → sort → "+ New note" → mark. */
export function NotesPageTour(props: TourProps) {
  return <Tour id="notes" {...props} />;
}

function Tour({ id, root, body = "", replay = false, onEnd, kit }: TourProps & { id: TourId; body?: string }) {
  const { t } = useTranslation();
  const { Popover, PopoverContent, Button } = kit;
  const steps = TOUR_STEPS[id];
  /** The note tour leaves focus where the writer has it. */
  const keepFocus = id === "note";
  const [place, setPlace] = useState<TourPlace | null>(null);
  const [hidden, setHidden] = useState(false);
  const [said, setSaid] = useState("");
  const labelId = useId();
  const textId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);
  const ended = useRef(false);
  const lastKey = useRef(0);
  /** Where Tab came to the card from (and its caret). */
  const returnTo = useRef<Return | null>(null);
  /** Page tour: what had focus before it began. */
  const before = useRef<HTMLElement | null>(null);
  const refs = useMemo(() => scriptureLinks(body).length, [body]);
  const refsAtStep = useRef(refs);

  const step = place ? steps[place.index] : undefined;
  const find = (s: TourStep | undefined) => (s ? (root()?.querySelector<HTMLElement>(s.target) ?? null) : null);
  const visible = (s: TourStep) => {
    const el = find(s);
    return !!el && shown(el) && !!visibleRect(el);
  };
  const foreignPopup = () => {
    const r = root();
    for (const el of document.querySelectorAll(POPUPS)) {
      if (cardRef.current?.contains(el) || (r && el.contains(r))) continue;
      if (shown(el)) return true;
    }
    return false;
  };

  function end(memory?: "seen" | "skip" | "typed") {
    if (ended.current) return;
    ended.current = true;
    if (memory === "skip") skipAllTours();
    else if (memory === "typed") writeTour(id, afterTyping(readTour(id)));
    else if (memory === "seen") writeTour(id, "seen");
    // Focus goes back: the note tour's from the card to where Tab left it
    // (caret and all); the page tour's to what had it before it began
    const active = document.activeElement;
    const back = returnTo.current;
    const inCard = !!cardRef.current?.contains(active) || active === document.body;
    const onTarget = steps.some((s) => find(s)?.contains(active));
    if (!keepFocus && before.current?.isConnected && (inCard || onTarget)) before.current.focus({ preventScroll: true });
    else if (inCard && back?.el.isConnected) restoreReturn(back);
    releaseTour(id);
    onEnd();
  }

  function next() {
    const p = place;
    if (!p) return;
    const np = nextPlace(steps, p.index + 1, p.n, visible);
    if (np) setPlace(np);
    else end("seen");
  }

  // The latest of everything, for the listeners and the clock below
  const live = useRef({ place, hidden, step, end, next, find, visible, foreignPopup, placeArrow: () => {} });
  useEffect(() => {
    live.current = { place, hidden, step, end, next, find, visible, foreignPopup, placeArrow };
  });

  // The clock: start when the page has settled and nobody's typing; then
  // keep the card out of the way of dialogs, the keyboard, a target gone
  useEffect(() => {
    const opened = Date.now();
    const tick = () => {
      const l = live.current;
      if (ended.current) return;
      const now = Date.now();
      if (!l.place) {
        // Turned off meanwhile ("Spring over" on the other tour)
        if (!replay && !tourDue(id)) return l.end();
        if (now - opened < (replay ? 300 : 700) || now - lastKey.current < 800 || l.foreignPopup()) return;
        // The note: the rich editor (the "+ Verse" step) is usually here already
        if (id === "note" && !root()?.querySelector('[data-tour="note-verse"]') && now - opened < 4000) return;
        if (!claimTour(id)) return;
        const first = nextPlace(steps, 0, 0, l.visible);
        if (!first) {
          releaseTour(id);
          // Nothing of it on screen: not now (it stays due)
          if (now - opened > 6000) l.end();
          return;
        }
        const active = document.activeElement;
        before.current = active instanceof HTMLElement && active !== document.body ? active : null;
        setPlace(first);
        return;
      }
      const el = l.find(l.step);
      setHidden(l.foreignPopup() || keyboardUp() || !el || !shown(el) || !visibleRect(el));
      l.placeArrow();
    };
    const timer = window.setInterval(tick, 200);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once; reads live
  }, []);

  // Keys: typing anywhere holds the start back; typing in the note closes
  // the note tour (Kasper); Esc closes; Tab from the target reaches the card
  useEffect(() => {
    // Typed into the note: before it showed, not this time (still due);
    // after, snoozed. Keys too, not just input events: the editor takes
    // Enter and Tab itself
    const typedInNote = (target: EventTarget | null) => {
      if (id !== "note") return;
      // The text itself — not the toolbar ("+ Verse" by Enter isn't typing)
      const text = root()?.querySelector(NOTE_BODY);
      if (!text?.contains(target as Node)) return;
      live.current.end(live.current.place ? "typed" : undefined);
    };
    const onKeyCapture = (e: KeyboardEvent) => {
      const l = live.current;
      if (e.key === "Tab") return onTab(e);
      if (isTypingKey(e)) {
        lastKey.current = Date.now();
        if (!e.isComposing) typedInNote(e.target);
        return;
      }
      if (e.key !== "Escape" || e.isComposing || !l.place || l.hidden) return;
      // Someone else's popup (a chip's preview) has its own Esc
      const pop = (e.target as Element | null)?.closest?.(POPUPS);
      const r = root();
      if (pop && !cardRef.current?.contains(pop) && !(r && pop.contains(r))) return;
      e.preventDefault();
      e.stopPropagation();
      l.end("seen");
    };
    // Tab from the target (the note's text too) reaches the card — ahead of
    // the editor, which would indent
    const onTab = (e: KeyboardEvent) => {
      const l = live.current;
      if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
      if (!l.place || l.hidden || cardRef.current?.contains(document.activeElement)) return;
      const active = document.activeElement as HTMLElement | null;
      const target = l.find(l.step);
      const noteBody = keepFocus ? root()?.querySelector(NOTE_BODY) : null;
      if (!active || !(target?.contains(active) || noteBody?.contains(active))) return;
      e.preventDefault();
      e.stopPropagation();
      returnTo.current = saveReturn(active);
      nextRef.current?.focus();
    };
    const onInput = (e: Event) => typedInNote(e.target);
    window.addEventListener("keydown", onKeyCapture, true);
    document.addEventListener("beforeinput", onInput, true);
    return () => {
      window.removeEventListener("keydown", onKeyCapture, true);
      document.removeEventListener("beforeinput", onInput, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once; reads live
  }, []);

  // Leaving (the note closes, the page changes) ends it quietly
  useEffect(
    () => () => {
      releaseTour(id);
    },
    [id],
  );

  // A step begins: the insert count it advances on
  useEffect(() => {
    refsAtStep.current = refs;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- per step
  }, [place?.index]);
  // "+ Verse" step: a reference went in → on to the overview
  useEffect(() => {
    if (place && insertedSince(step, refsAtStep.current, refs)) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refs]);

  // The target: ring + description while its card shows; the page tour
  // also moves focus there (once per step)
  const focusedStep = useRef(-1);
  useEffect(() => {
    if (!place || hidden) return;
    const el = find(step);
    if (!el) return;
    const described = focusTarget(el);
    el.setAttribute("data-tour-active", step?.inset ? "inset" : "");
    const prior = described.getAttribute("aria-describedby");
    described.setAttribute("aria-describedby", prior ? `${prior} ${textId}` : textId);
    if (!keepFocus && focusedStep.current !== place.index) {
      focusedStep.current = place.index;
      // Touch: a text field would raise the keyboard over the tip
      const typing = described.matches("input, textarea, [contenteditable='true']");
      if (!(coarse() && typing)) {
        returnTo.current = null;
        described.focus({ preventScroll: true });
      }
    }
    return () => {
      el.removeAttribute("data-tour-active");
      if (prior) described.setAttribute("aria-describedby", prior);
      else described.removeAttribute("aria-describedby");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place?.index, hidden]);

  // Said once per step, politely, when it first shows
  const saidStep = useRef(-1);
  useEffect(() => {
    if (!place || hidden || !step || saidStep.current === place.index) return;
    saidStep.current = place.index;
    const text = t("tour.announce", { n: place.n, total: place.total, text: t(step.text) });
    const message = coarse() ? text : `${text} ${t("tour.keys")}`;
    setSaid("");
    const raf = requestAnimationFrame(() => setSaid(message));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place?.index, hidden]);

  // Anchored to the part of the target on screen (a long note scrolls)
  const anchor = useMemo(() => {
    const el = find(step);
    if (!el) return null;
    return { getBoundingClientRect: () => visibleRect(el) ?? el.getBoundingClientRect(), contextElement: el };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place?.index]);

  // The arrow points at the middle of the target's visible part (kept
  // inside the card's corners); the clock below keeps it there
  function placeArrow() {
    const arrow = arrowRef.current;
    const card = cardRef.current;
    const el = find(step);
    if (!arrow || !card || !el) return;
    const c = card.getBoundingClientRect();
    const r = visibleRect(el) ?? el.getBoundingClientRect();
    const x = Math.min(Math.max(r.left + r.width / 2 - c.left, 16), c.width - 16);
    arrow.style.left = `${Math.round(x - 8)}px`;
  }
  // Just placed: follow the card for a few frames while it settles
  useEffect(() => {
    if (!place || hidden) return;
    let frames = 0;
    let raf = requestAnimationFrame(function follow() {
      live.current.placeArrow();
      if (++frames < 20) raf = requestAnimationFrame(follow);
    });
    return () => cancelAnimationFrame(raf);
  }, [place, hidden]);

  /** The card is a little loop: Tab past its ends goes back to the page. */
  function onCardKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const items = [...(cardRef.current?.querySelectorAll<HTMLElement>("button") ?? [])];
    const first = items[0];
    const last = items[items.length - 1];
    const leaving = e.shiftKey ? document.activeElement === first : document.activeElement === last;
    if (!leaving) return;
    e.preventDefault();
    const back = returnTo.current;
    returnTo.current = null;
    if (back?.el.isConnected) restoreReturn(back);
    else {
      const el = find(step);
      if (el) focusTarget(el).focus({ preventScroll: true });
    }
  }
  // Note tour: a click on the card leaves the caret in the note
  const keep = keepFocus ? (e: React.MouseEvent) => e.preventDefault() : undefined;

  const last = place ? place.n === place.total : false;
  return (
    <>
      {createPortal(
        <div aria-live="polite" className="sr-only">
          {said}
        </div>,
        document.body,
      )}
      <Popover open={!!place && !hidden} onOpenChange={() => {}}>
        {place && step && anchor && (
          <PopoverContent
            ref={cardRef}
            anchor={anchor}
            side={step.side}
            align={step.align}
            sideOffset={10}
            initialFocus={false}
            finalFocus={false}
            aria-labelledby={labelId}
            aria-describedby={textId}
            data-tour-card=""
            onKeyDown={onCardKey}
            className={cn(
              "group/tour w-auto max-w-[18rem] gap-2.5 px-3.5 py-3",
              // At most a 120ms fade; still under reduced motion
              "animate-none! transition-opacity duration-[120ms] data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none",
            )}
          >
            {/* 8px arrow with a hairline, under the target's middle */}
            <span
              ref={arrowRef}
              aria-hidden
              className="absolute left-4 group-data-[side=bottom]/tour:-top-[7px] group-data-[side=top]/tour:-bottom-[7px] group-data-[side=top]/tour:rotate-180"
            >
              <svg width="16" height="8" viewBox="0 0 16 8" className="block">
                <path d="M0 8 8 0.5 16 8Z" className="fill-popover" />
                <path d="M0 8 8 0.5 16 8" className="fill-none stroke-foreground/10" />
              </svg>
            </span>
            <span id={labelId} className="sr-only">
              {t("tour.label", { n: place.n, total: place.total })}
            </span>
            <p id={textId} className="text-control text-pretty">
              {t(step.text)}
            </p>
            <div className="flex items-center gap-1">
              <span aria-hidden className="mr-auto pr-2 text-meta text-muted-foreground tabular-nums">
                {t("tour.count", { n: place.n, total: place.total })}
              </span>
              <button
                type="button"
                onMouseDown={keep}
                onClick={() => end("skip")}
                className={cn(
                  "h-7 rounded-md px-1.5 text-list text-muted-foreground hover:text-foreground hover:underline underline-offset-2 pointer-coarse:h-11",
                  focusRing,
                )}
              >
                {t("tour.skip")}
              </button>
              <Button
                ref={nextRef}
                variant="secondary"
                size="sm"
                onMouseDown={keep}
                onClick={next}
                className="h-7 border-border px-2.5 text-list font-medium pointer-coarse:h-11"
              >
                {t(last ? "tour.done" : "tour.next")}
              </Button>
            </div>
          </PopoverContent>
        )}
      </Popover>
    </>
  );
}
