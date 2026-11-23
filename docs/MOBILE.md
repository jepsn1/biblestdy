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
   Optionally limit Deployment branches to `main`.
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
   `upload: true` and `version: 1.0.0`. Later builds of the same version can
   keep `1.0.0`. Once a version is live in the App Store, bump it.
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
