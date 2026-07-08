import { useState } from "react";
import { Link } from "react-router";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { authClient } from "~/lib/auth-client";

export function meta() {
  return [{ title: "Sign in — biblestdy" }];
}

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setState("sending");
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: "/",
    });
    setState(error ? "error" : "sent");
  }

  return (
    <main className="flex h-dvh items-center justify-center overflow-hidden px-6">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex select-none items-baseline gap-1.5">
          <span className="font-mono text-lg font-semibold tracking-tight text-primary">
            biblestdy
          </span>
          <span className="font-mono text-[0.65rem] text-muted-foreground">v0</span>
        </Link>

        {state === "sent" ? (
          <div className="rounded-lg border border-border bg-card p-6">
            <h1 className="font-serif text-xl font-medium">Check your email</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              A sign-in link is on its way to{" "}
              <span className="font-mono text-foreground">{email}</span>. It signs you in on this
              device.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="rounded-lg border border-border bg-card p-6">
            <h1 className="font-serif text-xl font-medium">Sign in</h1>
            <p className="mt-1 mb-4 text-sm text-muted-foreground">
              No password — we email you a magic link.
            </p>
            <Input
              type="email"
              required
              autoFocus
              placeholder="you@example.com"
              aria-label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="font-mono text-sm"
            />
            <Button type="submit" className="mt-3 w-full" disabled={state === "sending"}>
              {state === "sending" ? "Sending…" : "Send magic link"}
            </Button>
            {state === "error" && (
              <p className="mt-3 text-xs text-destructive">
                Could not send the link — try again.
              </p>
            )}
          </form>
        )}

        <p className="mt-6 text-center font-mono text-[0.65rem] text-muted-foreground">
          reading is open — sign in to keep notes
        </p>
      </div>
    </main>
  );
}
