# Auto-Update: How Headroom Desktop Checks For and Applies Updates

Headroom uses Tauri's built-in **`tauri-plugin-updater`** with minisign-signed
releases. There is no third-party update service. The flow is: a signed
`latest.json` manifest published on GitHub Releases, an hourly background check
from the Rust side, an in-app notification + install button, a silent signed
download, and a self-managed relaunch.

Key files:
- `src-tauri/src/lib.rs` — updater commands, config resolution, notification, relaunch
- `src-tauri/tauri.conf.json` — plugin config (pubkey, `createUpdaterArtifacts`)
- `src/lib/appUpdate.ts` — frontend orchestration (check / install / notify)
- `src/App.tsx` — scheduling (initial + hourly background checks) and UI state

---

## 1. The update feed

The updater fetches a JSON manifest (`latest.json`) that lists the newest
version, release notes, publish date, and the URLs + minisign signatures of the
platform artifacts.

- **Default endpoint** (`lib.rs:58`):
  `https://github.com/gglucass/headroom-desktop/releases/latest/download/latest.json`
  This is a GitHub Release asset, so `…/releases/latest/download/…` always
  resolves to the most recent published release.
- **Signature verification**: every downloaded artifact is checked against the
  embedded minisign **public key** (`DEFAULT_UPDATER_PUBLIC_KEY`, `lib.rs:57`;
  same value in `tauri.conf.json:68`). An unsigned or tampered artifact is
  rejected by the plugin before install.
- **Artifact generation**: `createUpdaterArtifacts: true` in `tauri.conf.json`
  makes the build emit the signed update artifacts and the manifest.

### Channel / endpoint resolution

The effective pubkey + endpoints are resolved at runtime by
`resolve_release_updater_config` (`lib.rs:3541`), driven by compile-time env
vars (`option_env!`) and the current version:

| Source | Meaning |
|--------|---------|
| `HEADROOM_UPDATER_PUBLIC_KEY` | overrides the embedded pubkey |
| `HEADROOM_UPDATER_ENDPOINTS` | stable feed (JSON array or comma/newline list of **HTTPS** URLs) |
| `HEADROOM_UPDATER_STAGING_ENDPOINTS` | staging/beta feed |

Resolution rules:
- `prefer_staging = is_prerelease_version(current) || beta_channel_enabled()`
  (`lib.rs:3559`). Prerelease builds (`X.Y.Z-rc.N`) and beta-channel users get
  the staging feed; everyone else gets stable (`select_updater_endpoints`,
  `lib.rs:3515`). Staging falls back to stable if unconfigured.
- If **neither** pubkey nor endpoints are configured via env:
  - **release build** → falls back to the hard-coded default pubkey + GitHub
    endpoint (`lib.rs:3579`).
  - **debug build** → returns `Ok(None)`, i.e. update checks are disabled
    (`lib.rs:3576`).
- Configuring only one of pubkey/endpoints is a hard error surfaced to the UI.

**Beta channel** (`beta_channel_enabled`, `lib.rs:3507`) is on when the
`HEADROOM_BETA_CHANNEL` env var is `1`/`true`/`yes`, **or** a `beta_channel`
sentinel file exists in the app data dir.

Endpoint strings are parsed by `parse_updater_endpoint_list` (`lib.rs:3602`),
which accepts a JSON array or a comma/newline-separated list and rejects
non-HTTPS / empty values.

---

## 2. Scheduling the check (frontend)

On startup the main window loads the update configuration, then schedules
background checks. From `App.tsx`:

1. `loadAppUpdateConfiguration` → Rust `get_app_update_configuration`
   (`lib.rs:311`) returns `{ enabled, currentVersion, endpointCount,
   configurationError, betaChannelEnabled }`. If updates are disabled or
   misconfigured, no checks are scheduled.
2. The background-check effect (`App.tsx:1760`, main window only) arms:
   - an **initial check ~12s after startup**
     (`APP_UPDATE_BACKGROUND_INITIAL_DELAY_MS = 12_000`, `App.tsx:323`)
   - a **recurring check every hour**
     (`APP_UPDATE_BACKGROUND_CHECK_INTERVAL_MS = 60 * 60 * 1000`, `App.tsx:324`)
3. A tick is skipped if an update is already downloading, installing, or ready
   to restart (the `…Ref` guards at `App.tsx:1773`).

---

## 3. Checking for an update (Rust)

Each tick calls `runAppUpdateCheck` (`appUpdate.ts:63`) → Rust command
`check_for_app_update` (`lib.rs:346`):

1. Resolve the config (pubkey + endpoints) for the current version + channel.
2. Build the updater: `app.updater_builder().pubkey(...).endpoints(...).build()`.
3. `updater.check().await` fetches `latest.json`, compares versions, and (if
   newer) **downloads** the signed update.
4. The downloaded-but-not-installed `Update` is stashed in the
   `PendingAppUpdate` Tauri-managed state (`store_checked_update`, `lib.rs:383`)
   so the later install step doesn't re-download.
5. Returns `AvailableAppUpdate { currentVersion, version, publishedAt, notes }`
   to the frontend, or `null` if up to date.

---

## 4. Notifying the user

When a background check finds an update and the window is **not visible**
(`shouldNotifyAboutAvailableAppUpdate`, `appUpdate.ts:101`), the app fires a
native OS notification via `show_app_update_notification` (`lib.rs:583`):

> **Headroom Update Available** — "Headroom X.Y.Z is ready to install. Open
> Headroom to review the release and install it." (action `"update"`)

Deduping: the notification only fires when `availableUpdate.version` differs
from the last-known version (`knownUpdateVersion`), so the user isn't nagged
hourly for the same release.

**Stale nag**: `maybeFireStaleAppUpdateNotification` (`appUpdate.ts:135`) fires
one extra reminder once an available update has been published for ≥ 5 days
(`STALE_UPDATE_THRESHOLD_DAYS`), deduped per version via `localStorage`.

When the window **is** open, no OS notification is needed — the update card
renders inline (`App.tsx:5736`, `.app-update-card` in `styles.css:3321`) with
the version, notes, and the install button you pressed.

---

## 5. Installing (the button)

The install button calls `runAppUpdateInstall` (`appUpdate.ts:188`) → Rust
`install_app_update` (`lib.rs:371`):

1. Takes the pending `Update` out of `PendingAppUpdate` (`install_pending_update`,
   `lib.rs:403`) — errors if nothing is staged.
2. Runs `update.download_and_install(...)` (`lib.rs:133`), emitting
   `app-update://progress` events for each phase:
   - `downloading` (bytes downloaded / total) → "Downloading Headroom X: N MB of M MB (P%)…"
   - `installing` → "Installing Headroom X…"
   The frontend listens via `listen("app-update://progress", …)` and renders
   `formatAppUpdateProgressCopy` (`appUpdate.ts:171`).
3. On success the artifact is installed **in place** (the `.app` bundle is
   replaced), and the UI flips to `readyToRestart`, showing a restart prompt.

---

## 6. Restart / relaunch

Clicking restart invokes `restart_app` (`lib.rs:421`).

Tauri 2.x has an open macOS bug where `restart()` / `request_restart()` exit but
never relaunch (worse with `tauri-plugin-single-instance`). The workaround
(`lib.rs:441`):

1. Arm a detached `/bin/sh` relauncher **before** teardown, because teardown can
   block (stopping the Python backend with a no-timeout `child.wait()`, joining
   the analytics worker through a network flush).
2. The relauncher **waits for this PID to actually die** (up to ~10s, polling
   `kill -0`) so the single-instance lock is released, force-killing the old
   process if teardown deadlocks.
3. It then runs `/usr/bin/open -n <bundle>` against the freshly in-place-updated
   `.app`, and appends the launch outcome (`open`'s exit code) to the desktop
   log for field diagnosis.

This guarantees the lock is freed and the new (updated) instance can boot,
rather than focusing a dying window and bailing.

---

## End-to-end summary

```
GitHub Release (latest.json + signed artifacts, createUpdaterArtifacts)
        │  HTTPS, minisign-verified
        ▼
check_for_app_update (Rust)  ◀── hourly + 12s-after-launch (App.tsx)
        │  updater.check() downloads & stages the Update
        ▼
PendingAppUpdate state ──► AvailableAppUpdate (version, notes) ──► frontend
        │                                  │
        │ window hidden                    │ window open
        ▼                                  ▼
native notification              inline update card
        └──────────────► install button ──► install_app_update
                                                │  download_and_install
                                                │  (progress events)
                                                ▼
                                        in-place bundle replace
                                                │
                                                ▼
                                        restart_app → open -n relaunch
```
