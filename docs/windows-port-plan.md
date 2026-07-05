# Windows Port Plan (issue #38)

Status: planning. No code yet. Execute in the staged order below; each stage is
independently shippable and leaves the macOS build untouched.

## Architecture facts that scope this (verified in code)

- The intercept proxy is **plain HTTP** (`http://127.0.0.1:6767`,
  `client_adapters.rs:19`). Clients are pointed at it by setting
  `ANTHROPIC_BASE_URL`, not by intercepting system TLS. **No Windows
  certificate-store / CA-trust work is required for the core flow.**
- The `REQUESTS_CA_BUNDLE` / `SSL_CERT_FILE` logic (`tool_manager.rs:379`) only
  *bridges a user's pre-existing corporate TLS inspection* for model downloads.
  It is env-var plumbing and is already platform-neutral.
- Client wiring has two layers:
  1. `~/.claude/settings.json` env block via `home_dir()` — already
     cross-platform (`%USERPROFILE%\.claude` on Windows).
  2. Shell rc `export` blocks + macOS `launchctl setenv` — **Unix/macOS only**,
     need a Windows persistent-env equivalent.
- `chmod`/`PermissionsExt` are already `#[cfg(unix)]`-gated
  (`claude_cli.rs`, `state.rs`, `tool_manager.rs`).
- `lib.rs` already has `#[cfg(not(target_os = "macos"))]` fallbacks for
  `request_restart` and `show_notification_impl`; `ActivationPolicy` (dock
  hiding) is already macOS-gated. So the tray/window entrypoint already
  partially compiles for non-macOS.

## Stage 1 — Compile + secrets backend (foundation, no UX)

Goal: `cargo check --target x86_64-pc-windows-msvc` (cross or on a Windows
runner) passes, and secrets persist.

DONE (secrets):
- `Cargo.toml`: `keyring = { version = "3", features = ["windows-native"] }`
  under `[target.'cfg(windows)'.dependencies]` (compiles out on macOS/Linux).
- `keychain.rs`: added `#[cfg(all(not(debug_assertions), windows))]` platform
  mod backed by Windows Credential Manager via keyring; narrowed the old
  release stub to `not(macos), not(windows)` (Linux only).
- Verified: macOS host `cargo check` clean; keyring 3.6.3 API
  (`Entry::new`/`get_password`/`set_password`/`delete_credential`/
  `Error::NoEntry`) confirmed against the resolved crate source.
- NOT verified here (no Windows toolchain in dev env; needs the Stage 5
  `windows-latest` CI runner with MSVC): full Windows-target compile.

TODO (compile audit — needs a Windows compiler to iterate against):

- `keychain.rs`: the release non-macOS branch is a stub that errors on write
  (`keychain.rs:278-291`). Add a `#[cfg(all(not(debug_assertions), windows))]`
  `platform` mod backed by Windows Credential Manager. Use the maintained
  `keyring` crate (target-gate it to windows in `Cargo.toml`) rather than
  hand-rolling `wincred` FFI — matches the existing public `read/write/delete`
  signatures, so nothing downstream changes. Keep the macOS Security-framework
  mod as-is.
- Audit every remaining `#[cfg(target_os = "macos")]` with no sibling
  non-macOS arm for compile breaks on Windows. Known sites:
  `lib.rs` (33, 440, 495/501 has sibling, 508, 516, 536, 3188, +others);
  `client_adapters.rs` (688, 833, 861, 889, 2540 `ShellFamily`). Most are
  uninstall/shell helpers likely called only from within `cfg(macos)` blocks —
  confirm call sites compile on Windows; stub or `cfg(windows)` the rest.
- Reuse the debug file-store path on Windows debug builds (already works via
  `app_data_dir()`).

Check: cross-compile `cargo check`; run keychain unit tests on Windows
(`write_then_read_round_trips_value` etc.). The dev macOS env has no Windows
toolchain (no mingw; MSVC unavailable) so this check runs on CI.

## Stage 2 — Client wiring on Windows

Goal: enabling a client actually routes it through the proxy on Windows.

- `settings.json` path (`configure_claude_settings_env`) should work unchanged;
  verify `home_dir()`/`dirs` resolves `%USERPROFILE%`.
- Hardcoded macOS config paths need Windows arms. Known offenders:
  - VS Code settings: `~/Library/Application Support/Code/User/settings.json`
    (`client_adapters.rs:708-715`) → `%APPDATA%\Code\User\settings.json` via
    `dirs::config_dir()`.
  - Audit `home_dir().join("Library")...` and `.codex` / shell-path helpers for
    other macOS-only joins.
- Replace the Unix env-export mechanism for GUI/global env:
  - macOS uses shell-rc `export` + `launchctl setenv`. On Windows the
    equivalent is `setx` / `HKCU\Environment` (broadcast `WM_SETTINGCHANGE`).
  - Decide per client whether the `settings.json` route alone suffices (Claude
    Code reads it) and skip global env where possible — minimum viable wiring
    first. Gate the shell-rc/launchctl code with `#[cfg(unix)]` and add a
    `#[cfg(windows)]` persistent-env writer only where a client needs a process
    env var rather than a config file.
- `ShellFamily` detection (`client_adapters.rs:2540`) → add a Windows arm
  (PowerShell), or short-circuit shell-block injection on Windows.

Check: integration-style unit tests with a temp `%USERPROFILE%`; manual run on a
Windows box confirming a client hits `127.0.0.1:6767`.

## Stage 3 — Runtime / tool bootstrap

Goal: the managed Python backend (port 6768) installs and starts on Windows.

- `tool_manager.rs` downloads/extracts the Python runtime + vendor wheels.
  Audit the download targets for OS/arch selection — add Windows
  (`x86_64-pc-windows-msvc`) artifacts (python-build-standalone + uv ship
  Windows builds). Exact URL construction wasn't located in this pass; confirm
  whether targets come from the binary or the `build-vendor-wheels.yml` flow,
  then extend.
- Process spawning: replace any `sh -c` / POSIX path assumptions with
  Windows-aware spawn (`.exe` suffixes, no exec bit). `PermissionsExt` chmod is
  already `cfg(unix)`-gated.
- Backend health check (`backend_port.rs`, 6768) is HTTP — platform-neutral.

Check: backend boots and `/health` responds on Windows.

## Stage 4 — Window/tray UX

- `tauri.conf.json`: `windowEffects.sidebar` is macOS vibrancy and
  `macOSPrivateApi`/`transparent: true` need review — transparent + decorations
  off on Windows requires care (or drop transparency on Windows). Provide a
  Windows window config (opaque, standard decorations or custom).
- Tray icon is cross-platform via `tray-icon`; verify icon assets
  (`.ico` already in bundle list).
- Sweep `App.tsx`/CSS for any macOS-only visual assumptions (vibrancy,
  traffic-light insets).

Check: app launches, tray works, both windows render on Windows light/dark.

## Stage 5 — CI, bundle, updater

DONE (validation CI): `.github/workflows/build-windows.yml` — a *validator*, not
a publisher. Runs on `windows-latest` (MSVC) on PRs touching `src-tauri/**` and
on manual dispatch: `cargo check` + `cargo test --lib` (compiles the Windows-only
keychain mod and runs the keychain unit tests). Optional `bundle` dispatch input
builds an unsigned NSIS installer (`createUpdaterArtifacts:false`) and uploads it
as an artifact. This is what gives us a Windows compiler to validate Stage 1
against. Run it (Actions tab -> Build Windows App -> Run workflow) to confirm the
crate compiles on Windows.

TODO (release proper):

- Add `.github/workflows/release-windows.yml` mirroring `release-macos.yml`,
  `runs-on: windows-latest`, NSIS/MSI targets. `.ico` already present in
  `tauri.conf.json` bundle icons.
- Code signing: Windows Authenticode is optional for a first release (unsigned
  installs with SmartScreen warning). Flag as a decision.
- Updater: `createUpdaterArtifacts` + signing key already configured and are
  cross-platform; add the Windows endpoint/target to `latest.json` generation.

## Open decisions (need owner input before/within execution)

1. `keyring` crate vs hand-rolled `wincred` FFI (recommend `keyring`).
2. Windows code signing now vs ship unsigned first.
3. Minimum client set for first Windows release (Claude Code only, or full set).
4. Drop window transparency on Windows vs invest in custom-decoration handling.
