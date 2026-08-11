import { useEffect, useState } from "react";

/** Chromium's install prompt event (not in lib.dom — spec'd but non-standard). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type PwaInstall =
  | { kind: "unavailable" }
  | { kind: "prompt"; install: () => Promise<boolean> }
  | { kind: "ios-instructions" };

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's pre-standard flag
    (navigator as { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
  return ios && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

/**
 * How this browser can install the PWA: Chromium exposes a deferred
 * beforeinstallprompt we can re-fire from a button; iOS Safari has NO install
 * API — the only path is the user's own Share → Add to Home Screen, so we
 * offer instructions. Installed (standalone) → unavailable.
 */
export function usePwaInstall(): PwaInstall {
  const [state, setState] = useState<PwaInstall>({ kind: "unavailable" });

  useEffect(() => {
    if (isStandalone()) return;
    if (isIosSafari()) {
      setState({ kind: "ios-instructions" });
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep the mini-infobar quiet; we own the moment
      const ev = e as BeforeInstallPromptEvent;
      setState({
        kind: "prompt",
        install: async () => {
          await ev.prompt();
          const { outcome } = await ev.userChoice;
          if (outcome === "accepted") setState({ kind: "unavailable" });
          return outcome === "accepted";
        },
      });
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const onInstalled = () => setState({ kind: "unavailable" });
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return state;
}
