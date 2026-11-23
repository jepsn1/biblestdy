# Mobile app (iOS)

The app is a Capacitor 8 shell in `apps/mobile` around the web SPA. The web
build is bundled into the app (works offline), and inside the app API calls go
to `https://biblestdy.com` (`apps/web/app/lib/api-base.ts`). iOS builds run on
GitHub's macOS runners (`.github/workflows/ios.yml`), so you don't need a Mac.

## How it's built

- The native project is committed: `apps/mobile/ios` (the Xcode project, Info.plist,
  icon, splash). CI checks that `cap sync` leaves it unchanged.
- `pnpm --filter @biblestdy/mobile sync` builds web, copies it to `www/` and
  runs `cap sync`. After adding a Capacitor plugin, run it and commit the
  `ios/` changes.
- App icon: `tools/brand/make-icons.mjs` writes the 1024 px iOS icon (no
  transparency) along with the web icons.
- Build number (`CFBundleVersion`) = the workflow run number, so every upload
  gets a new one. The marketing version comes from the `version` input.

## Sign-in and the API (#18)

The app runs on `capacitor://localhost` (iOS) / `https://localhost`
(Android) and calls `https://biblestdy.com` cross-origin. So:

- The API answers CORS for exactly those two origins
  (`apps/api/src/http/shell-cors.ts`), without credentials. The web is
  same-origin and gets no CORS headers at all.
- WKWebView treats our session cookie as third-party, so the app doesn't use
  cookies. Sign-in (code only — a magic link would open the browser) returns
  the session token in a `set-auth-token` header; the app keeps it in the
  Keychain (`@aparajita/capacitor-secure-storage`, this device only) and
  sends `Authorization: Bearer …` (`apps/web/app/lib/session-transport.ts`).
  Better Auth's bearer plugin turns it back into the session server-side.
- Without those API changes deployed, every call fails like a dead network
  — that's what made the first TestFlight build say "offline".

`SHELL_ORIGINS` (API, comma-separated) replaces the two origins; leave it
unset in prod. `VITE_SHELL_API_ORIGIN` (web build) points a local shell
build at another API; never set it for a release build.

## The keyboard and writing (#273, #256)

- `@capacitor/keyboard`, resize mode **none** (`capacitor.config.ts`): the
  keyboard lies over the page, as in Safari. "native" would shrink the web
  view only after the keyboard has finished sliding (the plugin waits its
  animation + 0.2 s) — a jump once it's up — and re-lay the paginated reader
  under a note every time. "body" resizes `<body>`, which our `h-dvh` routes
  don't follow.
- The plugin hides the accessory bar (‹ › ✓) from launch and **removes
  WKWebView's own keyboard handling**: no pan, and `visualViewport` no
  longer shrinks. `apps/web/app/lib/native-shell.ts` (loaded only in the
  shell, from `sessionReady()`) gives `window.visualViewport` the keyboard
  back from the plugin's `keyboardWillShow` / `keyboardWillHide`, so the
  note sheet's fitting (`lib/keyboard-fit`), the palette and the `@` menu
  work as in Safari — in step with the slide, since the event comes as it
  starts. It also sets `--kb-h` / `data-kb-open` on `<html>` (bottom
  sheets sit on the keyboard), lifts the page just enough for a field the
  keyboard would cover elsewhere (Safari's pan, stood in for), and matches
  the keyboard to the app's theme.
- In the app on phones the note's format bar docks on the keyboard while
  writing the text (`reader/dock-bar.tsx`, `app.css` `.note-dock`; #277
  panel): `Aa · Verse ··· ↶ ↷ · ⌄`, B/I/U and the lists in Aa's panel,
  Hide keyboard last (the accessory bar's ✓). "+ Verse" turns the bar into
  a verse search on the keyboard (`reader/verse-row.tsx`), focused inside
  the tap so the keyboard stays up. Light haptics (`@capacitor/haptics`,
  `lib/native-touch.ts`) on its buttons. The web keeps the toolbar above
  the text: Safari's own bar can't be hidden. A native inputAccessoryView
  isn't planned (docs/reviews/2026-11-23-writing-bar.md).
- None of it is in the reader's first paint; check with `pnpm bundle:check`.

## Unsigned build (no Apple setup)

Actions → **iOS** → Run workflow → `signing: none`. You get an unsigned `.ipa`
artifact (`biblestdy-ios-none-<version>-<run>`). iOS won't install it directly;
a device farm (BrowserStack App Live, Sauce Labs) can re-sign and run it.

## One-time owner setup for TestFlight

You only do this once. Use the Apple account that has the Developer Program
membership.

1. **Register the bundle id.** Go to developer.apple.com → Account →
   Certificates, IDs & Profiles → Identifiers → **+** → App IDs → App.
   Description `biblestdy`, Bundle ID **Explicit** `com.biblestdy.app`. Don't
   tick any capabilities. Click Register.
2. **Create the app.** Go to appstoreconnect.apple.com → Apps → **+** → New App.
   Platform iOS, name `biblestdy` (if that name is taken, pick another; you can
   change it later), primary language English, bundle ID `com.biblestdy.app`,
   SKU `biblestdy`, User Access Full Access.
3. **Create an API key.** In App Store Connect → Users and Access →
   Integrations → App Store Connect API → Team Keys → **+**. Name it
   `github-ci`, Access **Admin**. CI uses it to create signing certificates
   and profiles and to remove its old ones, and the lower roles can be
   refused that. Then:
   - copy the **Issuer ID** shown above the key list,
   - copy the key's **Key ID**,
   - **Download** the `AuthKey_<KEYID>.p8` file. You can only download it once,
     so keep it in your password manager.
4. **Find your Team ID.** developer.apple.com → Account → Membership details →
   Team ID (10 characters).
5. **Create the `appstore` environment.** GitHub repo → Settings →
   Environments → New environment → `appstore`. Tick **Required reviewers**
   and add yourself, so a signed build only starts after you approve it.
   Optionally limit Deployment branches to `main`. Create it before the first
   `signing: appstore` run, because GitHub otherwise creates it on the fly
   with no reviewer.
6. **Add four environment secrets** to the `appstore` environment (Add
   environment secret), not repository secrets:

   | Secret          | Value                                                   |
   | --------------- | ------------------------------------------------------- |
   | `APPLE_TEAM_ID` | Team ID from step 4                                     |
   | `ASC_KEY_ID`    | Key ID from step 3                                      |
   | `ASC_ISSUER_ID` | Issuer ID from step 3                                   |
   | `ASC_KEY_P8`    | the whole `.p8` file, including the `-----BEGIN/END PRIVATE KEY-----` lines |

## Make a TestFlight build

1. Actions → **iOS** → Run workflow on `main`, with `signing: appstore`,
   `upload: true`, `version: 1.0.0` and `channel: dev` (see
   [Over-the-air updates](#over-the-air-updates-19)). Later builds of the
   same version can keep `1.0.0`. Once a version is live in the App Store,
   bump it.
2. Approve the run when GitHub asks for it (because of the `appstore`
   environment).
3. CI removes its old "Created via API" development certificates, archives,
   exports an App Store `.ipa` (also attached as an artifact) and uploads it.
4. After about 5–30 minutes the build appears in App Store Connect → the app
   → TestFlight. The export-compliance question is already answered in
   Info.plist (`ITSAppUsesNonExemptEncryption = NO`: the app only uses HTTPS).
   Add yourself as an internal tester and install it with the TestFlight app.

If you run `signing: appstore` before the secrets exist, CI still builds the
web app and syncs and checks the project. It skips signing with a warning
instead of failing.

## Over-the-air updates (#19)

Every `make deploy` also sends the new web build to the installed apps — no
new native build, no App Store review. The app checks on launch and every
time it comes back to the front; a new bundle is on screen a few seconds
after you open the app, or the next time you return to it.

### How it works

- **Same build for both.** `make deploy` builds the web app once, serves it
  as the website, then `apps/mobile/scripts/ota.mjs publish --channel dev`
  zips that very `apps/web/build/client` into a bundle. Its version comes
  from the commit (`YYYYMMDD.HHMMSS-sha7`), so a native build and a deploy
  of the same commit are recognised as one.
- **Static files on biblestdy.com.** The store is `/srv/apps/biblestdy/ota/`
  (gitignored; outside the web build, which would wipe it). Caddy serves its
  `public/` at `https://biblestdy.com/ota/`: `dev.json`, `stable.json` and
  `bundles/<version>.zip`. `state.json` (channel history) is never served.
- **Updater.** `@capgo/capacitor-updater` in manual mode, self-hosted: no
  Capgo cloud, no account, no stats sent anywhere (`capacitor.config.ts`).
  The web code drives it (`apps/web/app/lib/ota-native.ts`, loaded only in
  the app, so the website's first paint doesn't carry it).
- **When it switches.** It downloads in the background, then reloads into
  the new bundle only at a safe moment: at launch before anything renders,
  or when the app comes back to the front — and right after a download that
  finished before you touched anything. Never mid-edit (a focused field with
  text in it): it waits for the next launch or return. Pending note saves
  are flushed first, and unsaved note text is on the device anyway
  (`lib/note-drafts`). The page you were on stays (`keepUrlPathAfterReload`).
- **A bundle that fails to start rolls back by itself.** Each boot calls
  `notifyAppReady` once the app has rendered. If a new bundle doesn't within
  15 s (`appReadyTimeout`), the native side switches back to the previous
  one; the app then remembers that version as failed and never takes it
  again (a new deploy has a new version).
- **Native compatibility guard.** Each build carries a *native fingerprint*:
  a hash of every native plugin at its installed version, the shell config
  (`capacitor.config.ts`) and the OTA public key
  (`node apps/mobile/scripts/native-fingerprint.mjs` prints it). The app only
  takes a bundle whose fingerprint equals its own. So after adding or
  bumping a plugin, or changing the shell config, deploys keep working on
  the web but installed apps stay on their last compatible bundle until you
  install a new native build. `ota.mjs publish` warns when that happens.
  A new native build always starts from its own web build first
  (`resetWhenUpdate`).
- **Security.** HTTPS only (the plugin's `httpsOnly`; the app refuses a
  bundle URL on another origin). Each bundle is AES-encrypted and its
  SHA-256 is signed with an RSA key (capgo's "encryption v2"); the native
  plugin decrypts it and checks the signed checksum before unzipping, with
  the public key compiled into the native build. The channel manifest is
  signed with the same key and checked by the web code before it trusts any
  field, and it carries a timestamp, so an older manifest can't be replayed.
  The private key lives only on the server, outside the repo:
  `~/.config/biblestdy/ota-signing-key.pem` (mode 0600). The public half is
  `apps/mobile/ota-public-key.pem`.

### Channels

| Channel  | Gets                      | Which builds follow it                       |
| -------- | ------------------------- | -------------------------------------------- |
| `dev`    | every `make deploy`       | TestFlight builds (`channel: dev`, default)  |
| `stable` | only what you promote     | the build you submit to the App Store        |

The channel is chosen when the native build is made: the **iOS** workflow's
`channel` input (baked into the app's own web build as `VITE_OTA_CHANNEL`).
For an App Store submission, run the workflow with `channel: stable` and
submit that build — a `dev` build would give friends every deploy.

### Operator steps (on the server, in `/srv/apps/biblestdy`)

- **Publish** — automatic: the last step of `make deploy`. If it fails (the
  website is live either way) fix the cause and run `make ota-publish`.
- **See what's live** — `make ota-status`: each channel's bundle, its native
  fingerprint (flagged when it differs from this checkout's), recent actions.
- **Promote dev → stable** (friends get it) — after it has soaked on your
  phone: `make ota-promote`. An earlier dev bundle: `make ota-promote
  VERSION=<version>`.
- **Roll back** — `make ota-rollback CHANNEL=dev` (or `stable`) goes back one
  bundle; repeat to go further. A specific one it served before:
  `make ota-rollback CHANNEL=stable TO=<version>` (this also rolls forward
  again). Phones switch to it at their next launch or return. The website
  isn't touched: roll that back with git + `make deploy` as before.

Old zips are deleted once neither a channel's history (20 entries) nor the
action log (200) mentions them.

### One-time setup

1. **Signing key** — already generated on the server
   (`~/.config/biblestdy/ota-signing-key.pem`, matching the committed
   `apps/mobile/ota-public-key.pem`). **Back it up** (password manager): if
   it's lost, installed apps accept no more bundles until a new native build
   with a new key (`node apps/mobile/scripts/ota.mjs keygen --force`, commit
   the public key, new TestFlight build) is installed. Publishing refuses a
   key that doesn't match the committed public key.
2. **Caddy** serves `/ota/` (infra repo, `caddy/sites/biblestdy.caddy`, a
   `handle_path /ota/*` block — see PR #19's description), then
   `scripts/caddy-reload.sh`.
3. **One native build with the updater** — apps built before #19 have no
   updater and never see OTA bundles. Make one TestFlight build
   (`channel: dev`) and install it; from then on deploys reach it.

### Testing it without a phone

`node apps/mobile/e2e/ota-sim.mjs <work-dir>` (with `PLAYWRIGHT=<path to the
playwright package>` if it isn't installed here) builds the web app twice,
publishes with the real `ota.mjs`, and drives a simulated phone in Playwright
— a stand-in for the native updater that checks bundles the way the plugin
does (`scripts/capgo-mirror.mjs`). It covers: deploy → return → new text on
screen; mid-edit defers the switch; stable untouched; a broken bundle rolls
back and isn't retried; tampered, replayed and native-incompatible manifests
refused; a rollback reaches the phone.

### App Review (guideline 2.5.2)

Apple allows downloading interpreted code (HTML/JS) that runs in WebKit, as
long as it doesn't change the app's primary purpose or add features that
weren't reviewed in kind. OTA bundles here are only the same web app the
shell was reviewed with — fixes and improvements to reading, notes and
study — never native code (the fingerprint guard keeps native changes to
store builds). Don't use OTA to turn the app into something else, add
purchases, or bypass review of a new kind of feature.

Export compliance: Info.plist says `ITSAppUsesNonExemptEncryption = NO`.
The updater adds AES decryption of our own update bundles and RSA signature
checks — integrity/authentication of the app's own content, no encryption
of user data. That is believed to stay within the exemption, but confirm it
before the App Store submission.
