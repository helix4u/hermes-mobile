# Hermes Mobile Status

Last updated: 2026-07-30

Current milestone: Mobile state continuity, Reader/STT controls, and vertical
session browsing implemented and packaged; physical Android acceptance pending

Current state:

- Adaptive interactive speech no longer rewards a slow provider with a tiny
  first segment. The default opener is 700 characters at 1.00x and scales to
  1,050 characters at 1.50x before provider history is available.
- Learned synthesis and raw audio-duration timing may grow the opener to 1,400
  characters. It independently reduces later chunks into the sustainable 480
  through 1,200 range and raises adaptive lookahead between 2 and 6 when the
  provider is losing ground to the selected playback rate.
- The second synthesis request now starts alongside the first instead of
  waiting for the opener to return. Startup sentence-boundary selection retains
  at least 72 percent of the planned runway, preventing an early short sentence
  from recreating the gap.
- Focused speech timing and queue tests pass 2 files and 21 tests. The full
  Mobile suite passes 51 files and 229 tests. TypeScript typecheck, Vite
  production build, Capacitor Android sync, forced debug assembly with Android
  Studio JDK 21, and focused `git diff --check` pass.
- Latest adaptive-TTS-runway APK size: 6,099,446 bytes. SHA-256:
  `73B82D162F00F419FF1362CBFE59652C36222280A4F5EB86B0C1ECC941C7C066`.
- The replacement APK installed successfully in place on the explicitly
  selected Samsung SM-S918U through `100.112.167.36:37751`. Android reports
  package `dev.hermes.mobile`, versionName 1.0, versionCode 1, and
  `lastUpdateTime=2026-07-30 23:51:47`. The installation used
  `adb install -r`, so saved connections, app data, and Android Keystore state
  were preserved. No phone screen or application content was opened or
  inspected.
- Reader playback now has an independent paused state. Starting ordinary Chat
  or pet-sidechat STT while Reader is speaking pauses the current audio without
  incrementing the speech generation or clearing buffered Reader chunks.
  Transcription leaves that queue paused and explicitly resumable.
- Reader has a sticky, always-visible playback dock with Play/Resume, Pause,
  Stop, and a concise ready/preparing/playing/paused state. Reader activity is
  keyed to the `reader` speech identity, so assistant or pet audio no longer
  makes Reader look active.
- Chat now exposes New directly in its heading. It uses the existing draft
  reset and session-selection epoch, and stays disabled while a turn is
  actively running so a live request is not silently orphaned.
- Sessions now presents Recent and project roots as a vertical expandable
  browser. Recent sessions are grouped by cwd or source, project detail stays
  lazy, cwd folders expand independently, and session rows are not mounted
  until their folder opens. The compacted-session reveal remains intact.
- Transcript follow no longer treats a large streaming layout change as an
  upward user scroll. Content growth, tool and Markdown resizing, attachment
  sizing, composer changes, and keyboard viewport changes retain follow mode.
- A real upward finger, pointer, or wheel gesture releases follow. Automatic
  corrections pause while the gesture owns the viewport, coalesce to one
  animation frame, and resume only after the user returns near the bottom or a
  new-send path explicitly restores follow.
- Resize and mutation observation covers delayed nested row changes that are
  not accompanied by a transcript-array update, eliminating the later
  partial rollback after Markdown, media, or expanded tools finish sizing.
- A real 360 by 800 Chrome probe appended twelve differently sized streaming
  rows and kept every scroll sample monotonic and exactly pinned. A synthetic
  touch-owned upward scroll then stayed at the same offset through a delayed
  520-pixel row resize, and returning near the bottom restored follow with zero
  residual distance.
- Focused voice, Reader, session-browser, pet-sidechat, and session-projection
  tests pass 5 files and 27 tests.
- Focused transcript-follow and transcript rendering tests pass 4 files and 45
  tests.
- The full Mobile suite passes 51 files and 227 tests. TypeScript typecheck,
  Vite production build, Capacitor Android sync, Android Java compilation,
  forced debug assembly with Android Studio JDK 21, and `git diff --check`
  pass. The built bundle contains the vertical session browser and no old
  horizontal `project-tabs` selector.
- Latest transcript-follow replacement APK size: 6,099,230 bytes. SHA-256:
  `AB9AF893E2E7352F1CD04881EE4ECAEB01600D396B835CE666030EA5B15FD9DC`.
- The replacement APK installed successfully in place on the explicitly
  selected Samsung SM-S918U through `100.112.167.36:37751`. Android reports
  package `dev.hermes.mobile`, versionName 1.0, versionCode 1, and
  `lastUpdateTime=2026-07-30 23:33:59`. The installation used
  `adb install -r`, so saved connections, app data, and Android Keystore state
  were preserved. No phone screen or application content was opened or
  inspected.
- Reader now persists the enabled provider set by saved connection in addition
  to its existing script, speaker assignments, and buffer depth. Catalog
  reconciliation waits until the active host has returned a confirmed catalog,
  so disconnects and core-only Cloud hosts cannot erase a workstation's
  multivoice choices.
- Reader and Files remount at the saved-connection boundary. Their local
  persistence cannot briefly write the previous host's state under a newly
  selected host while React connection effects settle.
- Files no longer clears an open document, rendered preview, or unsaved editor
  buffer merely because the transport disconnects. Reconnect refreshes the
  directory while preserving the current document; deliberate directory
  navigation still closes the old preview.
- Chat now keeps a bounded in-memory rich transcript cache keyed by connection
  and durable session. Returning to a session merges live tool arguments,
  output, progress, diffs, and findings over summary-only durable history
  instead of replacing inspectable cards with thin rows.
- Durable history hydration deduplicates pet commentary by stable event ID,
  retaining the latest compacted projection without replaying the same Alien
  Child line multiple times.
- Session selection has an explicit supersession epoch. A late resume/history
  request can no longer restore the old session after New conversation, a
  different session choice, or a saved-connection switch.
- Recent sessions now render before the heavier default-profile project tree.
  Project details remain lazy, project results are connection/request guarded,
  and explicitly host-labelled compacted segments are hidden by default with a
  reveal control when present.
- The later-work plan now includes an opt-in Android keyboard/IME companion for
  local STT dictation, selected-text handoff, and explicit prompt-plus-screen
  capture routing. It remains behind the current Mobile queue and cannot become
  an ambient accessibility or capture surface.
- Focused Reader, transcript, Files, and session tests pass 6 files and 49
  tests. The complete Mobile suite passes 49 files and 217 tests. TypeScript
  typecheck, Vite production build, Capacitor Android sync, Android Java
  compilation, forced debug assembly with Android Studio JDK 21, and
  `git diff --check` pass.
- State-continuity APK size: 6,096,726 bytes. SHA-256:
  `1C9842BC611F23C2938CD5A466801DA02CB28B81284F8ECFBB9BE61DBB878D9B`.
- The replacement APK installed successfully in place on the explicitly
  selected Samsung SM-S918U through `100.112.167.36:37751`. Android reports
  package `dev.hermes.mobile`, versionName 1.0, versionCode 1, and
  `lastUpdateTime=2026-07-30 22:40:56`. `adb install -r` preserved saved
  connections, app data, and Android Keystore state. No phone screen or
  application content was opened or inspected.
- Mobile Reader now stops parsing at Primary sources, Sources, References, or
  Show Notes headings, matching Desktop. Those appendices are omitted from
  normal multivoice playback and full Render & save output.
- Control now has a collapsed Providers section backed by Hermes's
  authenticated, profile-scoped `/api/env`, provider-validation, and OAuth
  routes. It supports API credential save, replacement, removal, PKCE,
  device-code polling, external CLI guidance, session cancellation, and
  disconnect.
- Provider credentials and returned OAuth codes remain only in ephemeral React
  state. Mobile persists no API key, OAuth token, authorization code, or
  provider account secret.
- Voice now has an explicit Listen for “Hey Hermes” toggle. It is off by
  default and saved separately for every connection.
- Android wake-word listening uses `createOnDeviceSpeechRecognizer` and is
  active only while Mobile is foregrounded, connected, enabled, and otherwise
  voice-idle. Speaking, recording, transcribing, backgrounding, or
  disconnecting pauses it. Normal microphone capture releases the wake
  recognizer first.
- Wake sessions carry unique identities through native events, ignore stale
  callbacks after lifecycle changes, restart bounded recognizer failures, and
  expose listening, paused, unavailable, and error states without sending
  ambient audio to Hermes.
- Focused Reader, provider, Control, and wake-word Vitest passed 4 files and 17
  tests. The complete Mobile suite passed 48 files and 212 tests. TypeScript
  typecheck, Vite production build, Capacitor sync, Android Java compilation,
  and forced Android `assembleDebug --rerun-tasks` with Android Studio JDK 21
  passed.
- Provider, Reader-source, and wake-word APK size: 6,095,938 bytes. SHA-256:
  `EC927587B497CD6E638F368CF4C857A7A5F1D37DDB8C5DFA0FE751C662D91B2E`.
- The APK has not been installed in this pass. Physical acceptance remains
  pending and no phone state was changed or inspected.
- Mobile interactive playback now guards the selected 0.70x through 1.50x rate
  across metadata, loaded-data, duration, readiness, playback, rate-change, and
  time-update events. A 250 ms watchdog repairs Android WebView resets that can
  occur between media events, and cleanup removes every listener and timer when
  playback ends or is stopped.
- Ordinary Listen, auto-speak, and pet speech now synthesize one short startup
  segment before launching provider-specific lookahead behind its playback.
  Reader's explicit connection-scoped 0 through 6 buffer choice retains its
  existing eager behavior.
- Startup size and lookahead use rolling per-provider synthesis and raw
  audio-duration averages. The timing store is scoped by saved connection ID
  and persists only provider names, numeric aggregates, sample counts, and
  timestamps. It never stores spoken text, audio, paths, credentials, or host
  configuration.
- Focused speech-rate, startup-split, adaptive-queue, and timing-history
  Vitest passed 2 files and 18 tests. The complete Mobile suite passed 46 files
  and 203 tests. TypeScript typecheck, Vite production build, Capacitor sync,
  and forced Android `assembleDebug --rerun-tasks` with Android Studio JDK 21
  passed.
- Adaptive-TTS APK size: 6,087,042 bytes. SHA-256:
  `F0920B089B50A206081A18CA147B5701DD3054C58A4EBB4893B3968F116D13F5`.
- The replacement APK installed successfully with `adb install -r` on the
  explicitly authorized Samsung SM-S918U at `100.112.167.36:45149`. Android
  reports package `dev.hermes.mobile`, versionName 1.0, versionCode 1, and
  `lastUpdateTime=2026-07-30 21:17:07`. Existing app data and Android Keystore
  state were preserved; no phone screen or application content was opened or
  inspected.
- The 2026-07-30 reconciliation is pinned to Nous `main` at
  `cc4cab2f592e60a197e796506de9168f74baf3ea` (Hermes 0.19.1, release
  2026.7.30). The complete private-experiments and local layer is restored as
  ordinary visible Windows/AppData worktree changes with zero staged or
  unmerged paths and a clean `git diff --check`.
- The exact validated reconciled Agent/Desktop tree is preserved at
  `backup/final-latest-nous-validated-20260730-184222` commit
  `093cb6ca4b50c9c55f2d7a2c327d1ee7cadf6463`. A binary recovery patch from
  the pinned upstream commit is stored at
  `C:\Users\btgil\AppData\Local\hermes\worktrees\recovery-20260730-180905\latest-nous-validated-093cb6ca4.patch`.
- Changed Python source compiled through the Windows/AppData venv. Direct
  SessionDB, prompt, pet, and TTS smokes passed without running Hermes pytest.
  Desktop TypeScript typecheck passed for renderer, Electron, and E2E
  projects. The changed-surface Desktop suite passed 41 files and 480 tests
  with four workers.
- A broad Desktop Vitest attempt exposed 20 failures in five untouched
  upstream Windows Electron filesystem/SSH tests and then retained worker
  processes. Only that verified Vitest process tree was stopped. The five
  failing files are outside the local layer; the focused changed-surface suite
  remains green.
- Desktop packaging passed from the repository's resolved `F:` path after an
  initial AppData-alias attempt hit Vite 8's mixed junction-path rejection.
  The normal `C:\Users\btgil\Desktop\Hermes.lnk` target was replaced and
  launched with a visible main window.
- Reconciled Desktop executable size: 214,281,216 bytes. SHA-256:
  `ACAEC726C93A038999045191DE752A2684EEEC55C6FB38172B4010610C2DC7FB`.
- The fresh Desktop backend emitted `HERMES_BACKEND_READY port=64056`.
  `/api/status` and `/api/health` returned HTTP 200. Dashboard and storage are
  healthy; the overall degraded label reflects only the separately stopped
  messaging gateway.
- The complete reconciled Mobile client suite passed 45 files and 197 tests.
  TypeScript typecheck, Vite production build, Capacitor Android sync, and a
  forced Android `assembleDebug --rerun-tasks` with Android Studio JDK 21
  passed.
- The exact Mobile source and progress layer, excluding unrelated
  `.playwright-cli` artifacts, is preserved at
  `backup/mobile-final-latest-nous-validated-20260730-185600`. Visible Mobile
  `main` remains at `d3baff84e9df9e7c2ddfd28a503be315be00eef7` with the same
  changes restored as ordinary unstaged local dirt.
- Reconciled Mobile APK size: 6,085,414 bytes. SHA-256:
  `7D0431EFFAA00272FB8536AEB1D1B71F33A1DAF7B218265DCD5CEBEFFEC98C6F`.
- The reconciled APK installed successfully with `adb install -r` on the
  explicitly authorized Samsung SM-S918U at `100.112.167.36:46275`. Android
  reports package `dev.hermes.mobile`, versionName 1.0, versionCode 1, and
  `lastUpdateTime=2026-07-30 18:50:54`. Saved connections, app data, and
  Android Keystore state were preserved. No phone screen or application
  content was opened or inspected.
- Transcript-embedded scroll panes now hand vertical gestures back to their
  surrounding owner at either edge. Inline text attachments, Markdown code
  blocks, expanded tool details, Files text preview/editors, and Reader
  document previews retain bounded internal scrolling without trapping the
  user over the card after its content reaches the top or bottom.
- Full-screen and modal scroll owners remain contained, so the change does not
  bleed gestures through sidechat, sheets, the image viewer, the top-level
  transcript, or the Files viewport.
- Focused attachment Vitest passed 2 tests. The complete Mobile suite passed 45
  files and 197 tests; TypeScript typecheck, Vite production build, Capacitor
  Android sync, Android debug assembly with JDK 21, and `git diff --check`
  passed.
- Nested-scroll replacement APK size: 6,260,215 bytes. SHA-256:
  `13565E348FDBF774E5A6D3232A6D03819D17E3215906F3B5948FE2726A73A0BC`.
- The replacement installed successfully with `adb install -r` on the
  explicitly authorized Samsung SM-S918U at
  `100.112.167.36:38979`. Android reports package
  `dev.hermes.mobile`, versionName 1.0, versionCode 1, and
  `lastUpdateTime=2026-07-30 17:13:47`. Existing app data and Android
  Keystore state were preserved; no screen or application content was opened
  or inspected.
- The revisioned Machine Map architecture is now specified in
  `MACHINE_MAP.md` and tracked as Milestone 5M. It separates observed facts
  from user-confirmed guidance, uses a profile-scoped plugin database instead
  of Hermes `state.db`, binds sessions to immutable revisions, and projects one
  deterministic first-turn context block through Hermes's cache-safe
  `pre_llm_call` sidecar.
- Ordinary map edits are deferred to new sessions. An explicit future Refresh
  session context action may append one bounded delta to a later user turn
  while disclosing that it creates a new prompt-cache boundary at that tail.
- Completed Markdown and plain-text `MEDIA:` attachments no longer fall through
  the image/audio/video renderer into the generic no-preview card. The
  authenticated preview loader's existing text document now reaches a bounded,
  touch-scrollable inline source preview.
- Each inline text attachment exposes Download, Open preview, and Open in
  Reader. Both handoffs reuse the existing Reader document contract and switch
  to the requested Preview or Reader surface without exposing the host path.
- The adjacent local Hermes system prompt now identifies the exact Windows
  runtime boundary: terminal commands use Git for Windows Bash/MSYS, `C:/...`
  is the portable spelling across Hermes tools and native programs, `/c/...`
  is Bash's displayed drive spelling, `/mnt/c/...` is WSL-only, and file-tool
  path fields take raw paths without shell quoting.
- Live Git Bash proof on this workstation showed both `cd C:/Users/btgil` and
  `cd /c/Users/btgil` returning `/c/Users/btgil` from `pwd -P`.
- AppData logs exposed the sibling runtime leak behind many failures:
  `search_files` correctly resolved an MSYS drive path for safety checks but
  passed the original `/c/...` string to native `rg.exe`. The current
  `agent.log` contains 179 such path-search failures dated 2026-07-30.
- `search_files` now dispatches its resolved host path, so a Windows
  `/c/Users/...` input reaches native ripgrep as `C:\Users\...`. Container and
  POSIX paths retain their existing resolution branch.
- Complete Mobile Vitest passed 45 files and 197 tests. TypeScript typecheck,
  Vite production build, Capacitor Android sync, Android debug assembly, both
  direct Windows path smokes, and focused diff checks passed.
- Inline-document-attachment APK size: 6,260,214 bytes. SHA-256:
  `5DF0755EBC58480A224C6EF2B9A3854CDE8DDD16FCECC218FE1C4655526000A8`.
- The replacement APK installed successfully with `adb install -r` on the
  explicitly supplied target `100.112.167.36:38979`. Android reports package
  `dev.hermes.mobile`, versionName 1.0, versionCode 1, and
  `lastUpdateTime=2026-07-30 16:47:29`; app data and Keystore state were
  preserved, and no phone screen or application content was inspected.
- Live Android/WebView instrumentation isolated an intermittent rest-window
  drag failure. Physical `touchstart`, `touchmove`, and `touchend` events reached
  Alien Child and the new coordinates persisted, but the rendered rect remained
  pinned by the preceding completed roam animation.
- `MobilePet` created each roam animation with `fill: forwards`, then cleared
  its animation ref at completion without cancelling the filled animation. A
  later drag during the rest period therefore changed the inline transform
  underneath an animation that still won the CSS cascade.
- Completed roam legs now commit their destination first and immediately
  cancel the filled animation. Drag start also clears any defensively retained
  finished animation before manipulating the pet.
- The focused MobilePet regression suite passes with 9 tests, including the
  required commit-before-cancel ordering. TypeScript typecheck, Vite production
  build, Capacitor Android sync, and Android debug assembly pass.
- Rest-window drag replacement APK size: 6,259,777 bytes. SHA-256:
  `84CB5CE18C434F443C54CC7E99E02C7A8B9556269811F77F6E5263EE96B8B9FE`.
- The replacement APK installed successfully with `adb install -r` on the
  explicitly selected Samsung SM-S918U at `100.112.167.36:41577`; existing app
  data and Android Keystore state were preserved. Android reports
  `lastUpdateTime=2026-07-30 15:25:02`.
- A live Android input test waited until the rebuilt pet had no active Web
  Animation, then dragged him during that exact rest window. The rendered rect
  moved from x=288 to x=188.318, the inline and computed transforms matched,
  no finished animation remained, and the Workstation position persisted as
  `{x:188.31771850585938,y:84.11428833007812}`.
- Workstation plugin inspection now stops after confirming an active compatible
  Mobile plugin. It no longer asks the intentionally unlocked local files
  policy for a Cloud-style installation root.
- The installer presentation independently suppresses upload-unavailable
  messaging for an already-installed plugin. Hosts that still need the plugin
  retain the strict locked-root requirement and actionable failure.
- Active-plugin regression tests, the complete 44-file/194-test Mobile client
  suite, TypeScript typecheck, Vite production build, Capacitor sync, Android
  Java compilation, and Android debug assembly passed.
- Active-plugin-state replacement APK size: 6,259,697 bytes. SHA-256:
  `40CD687F2E57707828BC03EA31B7D61E47B1A7960D9B6A66A619E1397252061F`.
- The replacement installed successfully with `adb install -r` on the
  explicitly selected Samsung SM-S918U at `100.112.167.36:41577`. Android
  reports package `dev.hermes.mobile`, versionName 1.0, versionCode 1, and
  `lastUpdateTime=2026-07-30 14:12:09`; the installation preserved app data
  and Android Keystore state. No application content was opened or inspected.
- Android now exposes a privacy-safe Mobile Companion status contract through
  the existing Capacitor native bridge. It includes manufacturer/model,
  Android version and API, battery/charging source, screen interactivity,
  network transport, connectivity, and validation.
- The contract intentionally excludes serials, Android ID, MAC, SSID, IP
  addresses, installed applications, notification content, and location.
- Control has a collapsed Mobile companion section while connected or
  disconnected. It shows the safe device facts, refreshes on demand, and never
  writes Hermes host configuration.
- The native action opens Android's Wireless debugging activity when available,
  then falls back to Developer options or Settings. It cannot and does not
  toggle Wireless debugging or read Android's private rotating ADB port.
- `scripts/connect-android-wireless.ps1` discovers paired
  `_adb-tls-connect._tcp` services, filters by an explicitly selected IP when
  supplied, refuses ambiguous results, invokes only `adb connect`, and verifies
  that the target reaches ADB's ready state.
- The helper found no mDNS advertisement for the phone's Tailnet address during
  the live probe. This confirms the documented local-link boundary; the helper
  does not compensate with an unsafe port scan.
- Milestone 5L is split into later permissioned device events, a service-gated
  plugin/action bridge, assistant/accessibility work, and experimental
  presence/gaze phases. Those remain explicit unchecked work instead of being
  silently bundled into the foundation APK.
- The replacement APK installed successfully with `adb install -r` on the
  explicitly authorized Samsung SM-S918U at `100.112.167.36:41577`. Android
  reports package `dev.hermes.mobile`, versionName 1.0, versionCode 1, and
  `lastUpdateTime=2026-07-30 13:43:20`; existing app data and Android Keystore
  state were preserved.
- Physical Mobile companion acceptance reported `samsung SM-S918U`, Android
  16/API 36, 76 to 77 percent battery while charging wirelessly, validated VPN
  connectivity, and an interactive screen. Refresh completed without an
  in-app error.
- Open Wireless debugging resolved safely to Samsung's
  `com.android.settings/.Settings$DevelopmentSettingsActivity`. No setting was
  changed. Back returned to Hermes Mobile, and the final rebuilt package
  relaunched as PID 13697 with `HermesConnectionService` remaining foreground
  with notification ID 2201.
- Filtered Logcat for the live Hermes process contained no matching fatal,
  native-bridge, security, or activity-launch exception after the status,
  refresh, Settings, and return path.
- Complete Mobile client Vitest: 44 files and 192 tests passed. TypeScript
  typecheck, Vite production build, Capacitor sync, Android Java compilation,
  and `assembleDebug` with Android Studio JDK 21 passed.
- The new PowerShell helper parses cleanly and its live no-advertisement path
  failed closed without pairing or scanning. `git diff --check` passed with
  only existing Windows line-ending conversion warnings.
- Mobile Companion APK size: 6,259,690 bytes. SHA-256:
  `C2921DBC54D6305079FC981EBC2134B58ECF1F79AC5681604673755D500631FA`.
- Mobile no longer treats a provisional name-only tool row as the final observer
  evidence for that tool ID. The observer cursor now fingerprints the lifecycle
  status plus bounded argument and result contents, so the later authoritative
  `tool.complete` update becomes fresh evidence.
- Tool-evidence commentary waits for a new completed or failed tool snapshot.
  A provisional `tool.generating` or argument-free start cannot trigger an
  aside about a bare `terminal` row before its real command and output arrive.
- Companion commentary and pet sidechat context now include bounded,
  client-redacted tool arguments and useful results. Bare tool rows with no
  concrete evidence are omitted, and the server still applies its authoritative
  force-redaction and tighter model-facing evidence limits.
- The pet overlay now has a connection-owned lifetime. Switching saved servers
  remounts Alien Child's gesture and animation state, then loads only that
  connection's persisted drop point instead of carrying touch refs or a live
  walk from the previous host.
- Interrupted roaming no longer asks Android WebView for a composited DOM
  rectangle. It derives the exact current point from the animation timeline,
  start, destination, and duration before cancelling the animation, preventing
  busy/reasoning/tool state changes from teleporting the sprite during a turn.
- The roaming speed floor is now twelve pixels per second instead of seven.
  Short and long walk variety plus the existing rest windows remain intact.
- Pet commentary, sidechat, and Desktop speech-profile requests capture their
  connection identity and discard late results after a server switch. A late
  response can no longer overwrite the new host's pet voice or speak with the
  previous host's settings.
- Pet speech reads the latest selected profile when the text is ready rather
  than the profile captured when auxiliary generation began. Android playback
  now reapplies the selected rate on metadata, readiness, playback start, and
  the resolved `play()` promise, covering WebView resets that made an intended
  1.50x response sound like 1.00x.
- Physical Android acceptance passed for the corrected pet drag path. Alien
  Child now follows the finger and remains draggable on the installed build.
- Pet server features are now capability-gated per saved connection. A vanilla
  or core-only Hermes host that returns JSON-RPC `-32601` or `unknown method`
  for the pet personality probe enters a quiet visual-only mode instead of
  being marked ready for commentary and then failing later.
- Visual-only mode keeps the bundled Alien Child sprite, connection-scoped
  position, roaming, tap interactions, and ordinary host-default speech. It
  suppresses commentary scheduling and recording, hides sidechat and
  host-personality affordances, skips auxiliary-model requests, and closes an
  already-open sidechat when the connection changes to an unsupported host.
- Pet preferences remain stored under the existing connection ID. Switching
  from vanilla Cloud back to the workstation restores that connection's
  commentary, sidechat, personality, auxiliary-model, Desktop-followed speech,
  and independent Mobile voice choices without rewriting either host.
- Pet Settings now explains the exact boundary. Host-default pet speech can use
  the same `/api/audio/speak` path as Listen and Reader even when the host lacks
  pet commentary RPCs; missing Desktop pet speech and custom provider catalogs
  no longer imply that the built-in visual pet itself is unavailable.
- The complete draggable pet stage now portals to `document.body` as a fixed,
  centered overlay above all five tab views. It no longer inherits a tab's
  stacking, clipping, scrolling, or hit-testing context. Toasts, sheets,
  sidechat, and the image viewer retain higher layers.
- Physical testing showed that moving the stage above every tab was not enough:
  Android WebView could still drop the React pointer-capture gesture, and a
  successful move could persist new coordinates while the roam effect cleanup
  visibly restored the pre-drag composited frame.
- Finger drag now has a dedicated native, non-passive touch path. Touch begins
  on the complete pet hit area, while move, end, and cancellation are tracked
  at the window so leaving the sprite cannot strand or terminate the gesture.
  Mouse and stylus retain the existing pointer-capture path.
- Roam rescheduling now freezes layout only when an actual Web Animation is
  active. Finishing a direct drag no longer re-reads and rewrites the sprite
  rect during the effect cleanup frame, so the visible position and persisted
  connection-scoped position stay identical.
- The sidechat star is rendered and participates in the pet's shared
  tap-versus-drag gesture only when the active host supports the pet RPC bundle.
- Reader no longer carries an old catalog, assignment, render, download, or
  file-edit error into a later tab visit or another saved connection. Entering
  Reader and switching hosts clear obsolete local failures.
- Missing TTS catalog detection now accepts the browser and Android native
  shapes that include `404`, `Not Found`, `not_found`, or the core gateway's
  `No such API endpoint` detail. These expected capability misses stay silent
  while host-default speech remains available.
- Reader provider selections are reconciled against the active host catalog.
  A provider selected on a rich Windows host cannot remain invisibly selected
  on an older Cloud host, and returning to a capable host chooses its preferred
  or first available provider without retaining the Cloud fallback state.
- Mobile now treats a missing `/api/audio/tts/providers` route as a
  connection-specific capability gap rather than a global speech failure.
  Older/core-only hosts show a quiet Host default path, suppress the expected
  catalog 404, disable unsupported Smart assign, and replace empty
  per-speaker selectors with an explicit Host default label.
- Host-default fallback still uses the existing authenticated
  `/api/audio/speak` path for Listen, auto-speak, Reader playback, and complete
  Reader WAV export. It does not pretend that an old host supports per-request
  provider or voice overrides.
- TTS capability is recomputed for each active transport. Switching to the
  Windows workstation or another experiments-enabled host reloads that host's
  live provider catalog and immediately restores provider, voice, cloning,
  design, and multivoice controls without changing either host's TTS config.
- Mobile now carries the complete 12-file, 28.2 KiB standalone server-plugin
  source package inside the application bundle. Build caches, Git metadata,
  credentials, and local service tokens are not included.
- Control has a collapsed Mobile server plugin section that checks the active
  host through its existing authenticated transport. It reports the active
  plugin/core-gateway version, Hermes version, compatibility state, exact
  upload target, package size, and current 100 MiB per-file managed-upload
  limit.
- Automatic upload requires a host-reported locked managed files root. Mobile
  will not infer the Hermes home from session cwd, a mutable directory, or a
  generic user-home listing.
- The installer requires a second explicit review action, rejects traversal,
  absolute, oversized, empty, and wrong-root targets, then uploads each file
  through `/api/files/upload`.
- Every upload response must verify the exact expected remote path. Discovery
  files are uploaded last, and the app calls the authenticated plugin-enable
  endpoint only after every source file succeeds.
- Plugin API routes are mounted during Hermes server startup, so the installer
  ends in a restart-required state. It does not invoke an unverified Cloud
  restart mechanism.
- The UI states directly that installing the Mobile plugin does not add
  Reader, speech, or filesystem routes owned by Hermes core. A remaining 404
  from those paths is reported as a host-version capability gap instead of
  being hidden behind plugin-install success.
- The installed replacement APK exercised this workflow through the saved
  `mr mid tier` Cloud connection. The host reported Hermes `0.19.0`, degraded
  core-gateway compatibility, and locked target
  `/opt/data/plugins/hermes-mobile`.
- All 12 bundled files were uploaded and path-verified at that exact target,
  and the host returned success from enabling `hermes-mobile`. The app now
  reports `Uploaded, host restart required`. No GitHub credential, repository
  clone, session token, or native Nous cookie was exposed to JavaScript or
  captured output.
- Physical-device inspection confirmed that Nous authentication, exact account
  discovery, and saving the requested Cloud target succeeded. Connection then
  failed with `The mobile capability endpoint returned HTTP 404`.
- The native transport was only accepting `/api/health` as proof of a standard
  core gateway after a Mobile-plugin miss. This Cloud deployment exposes
  authenticated gateway metadata through `/api/status`, so the fallback threw
  the original plugin 404 even though the core gateway was available.
- Browser and native transports now try `/api/health`, then `/api/status`,
  before rejecting core-gateway discovery. If both fail, the error reports both
  route statuses instead of repeating the misleading Mobile-plugin 404.
- Saved hosts now have separate Select, Edit, and Delete actions. Direct and
  Tailnet records can edit type, name, URL, and profile. Cloud records can edit
  their local name and profile while their authenticated discovered endpoint
  and connection type remain read-only.
- Deleting a saved host requires confirmation, removes its local draft and
  active-selection record, removes its Android Keystore credential through the
  existing native bridge, and leaves every other host intact.
- Pasting an HTTPS subdomain of `agents.nousresearch.com` into the ordinary
  host form now routes through native Nous Cloud onboarding instead of Direct
  HTTPS plugin/auth discovery.
- The classifier requires the exact Nous agent-domain boundary and rejects
  HTTP, embedded user information, and suffix-confusion hosts such as
  `agents.nousresearch.com.evil.example`.
- Mobile checks its native Nous Portal session, opens Nous sign-in
  automatically when needed, then discovers the authenticated account's agent
  inventory.
- When the Portal requires organization selection, Mobile checks each returned
  organization and matches the exact requested hostname without making the user
  understand or manually repeat the discovery workflow.
- The user-entered hostname is only a lookup key. Mobile connects to the
  dashboard URL returned by authenticated account discovery, saves it under the
  stable `cloud-<agent id>` connection identity, and reuses the existing
  per-agent native cookie jar.
- A Cloud target without the standalone Mobile server plugin continues through
  the already-supported standard Hermes `/api/ws` gateway fallback. The plugin
  is not required for basic Cloud connection.
- The connection sheet labels the automatic Nous path, hides the irrelevant
  session-token field, and changes the action to Connect with Nous.
- Mobile pet sidechat is now a compact floating popout above the bottom
  navigation rather than an oversized modal bottom sheet. The rest of the app
  is no longer covered by a dimming backdrop, and the popout alone owns pointer
  input.
- The sidechat header, empty state, Markdown history, user/pet messages, status,
  and composer have tighter hierarchy and subdued pet-matched presentation.
  Long replies remain complete and independently scrollable.
- Microphone, send, clear, close, and Hermes handoff now use theme-colored SVG
  controls with explicit accessible labels and titles. Recording swaps the mic
  for a stop-square, while thinking and transcription appear as a small status
  row instead of expanding action-button text.
- Alien Child is no longer mounted inside the Chat section that becomes
  `display: none` on tab changes. The overlay is now a sibling of all five tab
  views inside the stable Mobile workspace, so Sessions, Reader, Files, and
  Control navigation cannot leave its geometry or pointer state trapped in a
  hidden layout.
- Pet pointer handling now cancels and persists an active drag on document
  hiding, window blur, and page-hide. Returning to the app freezes the actual
  rendered position and schedules roaming again, so the next touch starts from
  valid geometry instead of a stale animation origin.
- The revealed sidechat star no longer swallows pointer-down and pointer-up.
  The whole 72-pixel pet hit area owns one tap-versus-drag gesture, including
  touches that begin on the star; an unmoved star tap opens sidechat and a
  moved touch drags the pet.
- Distinct speech requests now enter one serial queue above the existing
  chunk-buffering queue. Pet commentary, sidechat speech, assistant auto-speak,
  Listen, and Reader requests wait for current playback instead of invoking
  the global stop path and cutting it off.
- Explicit Stop and microphone capture still increment the playback
  generation, stop the current audio element, and clear waiting speech. A new
  request after Stop can begin immediately without waiting for an abandoned
  provider request to time out.
- Mobile pet interaction now uses a 72-pixel direct hit area with no nested
  sprite button competing for touch ownership. Pointer cancellation and lost
  capture complete the same cleanup path as pointer-up, preserve the dropped
  connection-scoped position, and restart roaming.
- Roaming keeps its short-leg, long-leg, and rest variety but caps travel
  duration to maintain a seven-pixel-per-second movement floor. Short clamped
  legs no longer look like a stationary glide.
- Alien Child now has a separate built-in sidechat prompt for continuing
  character embodiment. Ambient commentary's exact-one-line, non-answering,
  and character-cap instructions no longer constrain private sidechat.
- The backend sidechat call uses a stable character system message, a
  user-level untrusted session snapshot, a fixed assistant acknowledgement,
  then durable private history and the current user turn. When the attached
  session snapshot is unchanged, that layout gives automatic provider prompt
  caching a byte-stable growing prefix.
- Sidechat now retains up to 80 recent private events under a 64,000-character
  history bound, permits 12,000-character user and returned messages, and gives
  the auxiliary model a 2,048-token response budget. The Mobile request timeout
  is 180 seconds.
- Mobile renders full sidechat responses as scrollable Markdown and keeps the
  complete reply for history and pet TTS. Only the temporary roaming bubble is
  compacted to 240 characters.
- Temporary roaming bubbles are capped near 224 pixels, use smaller muted text,
  and keep their existing viewport clamp. Durable transcript remarks are narrow
  transparent annotations with dim text and controls instead of bright chat
  bubbles.
- Each durable pet remark has a connection-scoped local Dismiss action. Dismiss
  stops that remark's playback when needed and hides the presentation without
  deleting the host-owned commentary record.
- Mobile no longer uses the short-lived global request busy flag as the pet's
  active-turn authority. Prompt submission now opens a dedicated turn state,
  reasoning/tool/message events keep it active, and the terminal
  `message.complete` event closes it. Commentary timers therefore survive the
  whole custom-model/tool run instead of being cancelled as soon as
  `prompt.submit` acknowledges.
- Mobile pet sidechat no longer silently returns when a reconnect cleared the
  runtime session ID. Send resumes the selected durable session or creates the
  pending new session, publishes the optimistic user row immediately, and
  surfaces an explicit connection/session error if attachment fails.
- Pet commentary now allows 60 seconds and sidechat allows 180 seconds for their
  JSON-RPC calls. This exceeds the configured 45-second auxiliary-model window
  instead of timing out at the generic 30-second gateway default.
- The Mobile sidechat action is hidden by default. Tapping Alien Child reveals
  it for six seconds; opening it hides the action again, and its pointer events
  no longer bubble into the draggable pet's pointer-capture path.
- Opening sidechat now loads history once per sheet opening. A runtime
  reattachment during Send cannot trigger a second history load that erases the
  optimistic row while the custom auxiliary reply is pending.
- Mobile pet commentary bubbles are now portaled out of the pet's transformed
  roaming container and positioned from the pet's live screen coordinates. The
  bubble follows Alien Child, clamps to 12-pixel viewport margins, wraps long
  prose and unbroken tokens, and flips below the sprite when there is not enough
  room above instead of extending off-screen. The portaled bubble ignores
  pointer input, so the pet remains directly draggable and persists its dropped
  position per connection.
- The reported Mobile `unknown method: pet.sidechat.history` and missing
  active-turn speech were both caused by a stale Windows Mobile backend, not by
  the installed APK. `Stop-ScheduledTask` had terminated the scheduled
  PowerShell runner while leaving its `Start-Process` backend and proxy
  children alive from July 28. Every later install saw those old listeners,
  reported health, and left the replacement task crash-looping on occupied
  ports.
- The Windows installer now inspects the exact owners of loopback ports 9129
  and 9130 after stopping the task, refuses to touch unrelated listeners,
  retires only command lines matching the Mobile Hermes server and validating
  proxy, requires both ports to become free, then requires the replacement
  task and both new listeners to stabilize before success.
- Two consecutive real host refreshes replaced both backend and proxy process
  generations. The live method table now registers
  `pet.sidechat.history`, `pet.sidechat.submit`, and `pet.sidechat.reset`;
  a durable-history read completed successfully.
- A live Tool evidence observer request returned a 153-character Alien Child
  comment, and authenticated synthesis through the configured xAI pet voice
  returned 86,743 bytes of valid audio. This proves commentary generation and
  pet TTS now complete before the main turn has to finish.
- The first packaged Desktop sidechat test exposed two real integration
  failures. Split gateway handlers were rebound into `server.py` without their
  Progress, Tool evidence, or sidechat-payload helpers, and Desktop pet speech
  was routed through host-side `voice.tts` playback even though the headless
  Windows backend had no audio player.
- Pet handler registration now publishes feature-scoped Progress, Tool
  evidence, and sidechat helpers into the rebound gateway namespace. Direct
  deployed-shape smokes pass for all three, removing both
  `pet_sidechat_payload is not defined` and the repeated
  `_tool_observer_section is not defined` failures.
- Desktop pet speech now uses authenticated `/api/audio/speak` synthesis and
  plays the returned audio in Electron, matching the already-working voice
  preview. It retains the separate pet speech lane, cancellation, real
  playing/ended state, configured provider/voice/pitch/volume, and popped-out
  overlay forwarding.
- Desktop and Mobile now share one pet-sidechat backend contract. The selected
  personality receives bounded read-only context from the attached Hermes
  session, has no tools, and cannot mutate or append to the main conversation.
- Sidechat turns persist atomically in the existing profile-scoped session
  database under presentation-only sources. They follow the durable session
  lineage, remain excluded from ordinary pet commentary and transcript/model
  history, and can be cleared without removing normal pet remarks.
- Desktop's in-window pet has a full sidechat history and composer with pet mic,
  clear, and explicit Send to Hermes controls. The popped-out transparent pet
  can target either Hermes or the private pet sidechat with both text and mic.
- Mobile has a dedicated pet-sidechat sheet with durable history, pet-targeted
  speech input, explicit handoff to the main composer, and reply playback
  through the independent or Desktop-followed pet speech profile.
- Mobile's pet is now a transparent draggable in-app overlay instead of a
  visible fixed walking lane. Position persists per connection, roaming mixes
  slower short and long travel legs with varied rests, and movement uses the
  running row facing the actual direction of travel.
- Mobile freezes the true rendered position before any animation cancellation.
  Conversation-state changes, visibility returns, taps, and drags therefore no
  longer jump the pet to a stale origin; roaming is explicitly rescheduled after
  focus, tapping, or dragging.
- Commentary timers no longer depend on the live transcript callback identity.
  The initial and repeating schedules survive streaming row updates, while
  progress/tool evidence uses a non-resetting 900 ms trigger so a dense event
  stream cannot continually postpone speech until the turn is over.
- Alien Child is now a guaranteed Mobile built-in. The APK contains the real
  1536 by 1872 WebP spritesheet and the complete Alien Child personality
  definition, so he appears and reacts even before Mobile connects or when an
  older/cloud host does not expose pet RPCs.
- Mobile merges the built-in Alien Child entry with every valid personality
  returned by the connected profile's `pet.personality.list`. Selecting a
  host-local personality loads its actual prompt, state lines, and click
  interactions through `pet.personality.get`.
- The Chat pet uses a pixel-preserving canvas, the authoritative 192 by 208
  frame cells, directional running rows, real row/frame metadata when the host
  supplies it, and a visibility-resume loop. Each travel leg owns its facing
  direction and uses the running row. Review, wait, and wave poses stay
  stationary, so the sprite no longer glides or faces opposite its movement.
- The pet reacts to running tools, live reasoning, pending approvals/input,
  completion, and idle state. Animation is renderer-owned and is not stopped
  or recreated by ordinary gateway focus/reconnect transitions.
- Pet visibility, roaming, personality, commentary, commentary speech, initial
  delay, and repeat interval are connection-scoped Mobile preferences. Alien
  Child, roaming, and AI commentary default on; spoken commentary defaults off.
- Control exposes the host-owned `auxiliary.pet_commentary` provider, model,
  and reasoning-effort assignment. Saving that explicit model assignment
  updates only the connected Hermes profile; visual pet preferences remain
  phone-local.
- Generated comments use the selected personality prompt, bounded recent
  conversation, bounded tool activity, and a recent-comment avoidance window.
  Companion, progress, and tool-evidence lenses select the exact context shape;
  tool evidence is force-redacted and a zero observation limit now means no
  tool evidence.
- Pet speech is independent from ordinary assistant Listen/auto-speak. Mobile
  can follow the Desktop pet provider, voice, speed, pitch, and volume for the
  active connection, or select its own provider and voice. Click interactions,
  previews, and generated commentary during an active turn all use that pet
  speech profile.
- Desktop now mirrors its active pet speech settings into the active
  profile-scoped `pet.speech` record through the existing config API. The
  rebuilt regular shortcut published the current xAI `orion` profile with
  speed 1, pitch +8.5, and volume 0.45, which Mobile follow mode can consume
  without reading Desktop local storage.
- `pet.commentary.record` persists generated and interaction remarks as
  presentation-only session events. Mobile renders both live
  `pet.commentary.recorded` events and durable `display_kind=pet_commentary`
  history as distinct personality-labeled transcript rows with Copy and Listen,
  deduplicated by commentary event ID.
- Mobile's Voice speed slider now controls client playback for ordinary
  Listen, auto-speak, and Reader instead of depending on each TTS provider to
  implement `tts_config.speed`. This makes Host default, F5-TTS, Qwen, and
  other providers behave consistently.
- Interactive synthesis removes the client-owned speed value before requesting
  audio, preventing providers that do support synthesis speed from applying
  the rate a second time. Playback uses pitch preservation and the existing
  0.70x through 1.50x range.
- A non-default speed is retained even when the Provider selector is Host
  default; that selection previously returned no TTS override and silently
  discarded the slider value.
- The Reader 22-of-24 failure was traced to the tailnet host proxy's global
  30-second `httpx` timeout. Later xAI chunks completed on the Hermes backend
  after that deadline, so the proxy emitted an opaque 500 and the client
  retried audio that was still finishing.
- `/api/audio/*` proxy requests now have a bounded 14-minute upstream window
  while ordinary routes retain their 30-second timeout. A real upstream
  timeout returns 504 with an explicit host-timeout detail instead of becoming
  an unhandled 500.
- Mobile speech synthesis now supplies an explicit 8-minute request timeout,
  overriding Android's former four-minute audio default so a slow but healthy
  provider response is not abandoned and duplicated.
- Completed assistant replies now resolve Hermes `MEDIA:` markers through the
  authenticated remote-safe filesystem route. Generated images render inline
  with the full-screen viewer, audio and video use native controls, and
  unsupported or oversized files retain Retry and Download actions.
- Raw host media paths no longer remain in the visible completed reply, copied
  response text, or TTS projection. Loading and failure cards expose only the
  generated filename, and media fetch failures cannot echo a private host path.
- Every Control settings disclosure now defaults to collapsed. Entering
  Control remounts the settings surface, so sections opened during a previous
  visit do not remain unexpectedly open.
- Files now scrolls a newly opened document preview into view inside its
  existing phone-owned viewport. The document heading gives the filename its
  own readable row and wraps Download, Open in Previewer, Open in Reader, and
  Close into full touch targets.
- Reader now has explicit Multi-voice Reader and File Preview surfaces. The
  shared preview supports Markdown/plain-text rendering, editing, save/revert,
  download, and handoff back into Reader.
- Remote images open in a native-feeling full-screen fit/actual-size viewer.
  Remote audio and video files use native media controls, and Markdown can
  render direct audio/video links without treating them as broken images.
- Supported YouTube, Vimeo, and Spotify links use a connection-scoped
  Desktop-style privacy gate with ask, always, and off modes. The setting is
  client-local and never writes host config or theme state.
- Multivoice Reader can render the entire parsed script through the existing
  provider/fallback chain into one 24 kHz mono WAV. Browser builds download the
  Blob directly; Android saves it through `ACTION_CREATE_DOCUMENT`.
- Reader's provider choices and buffering remain collapsed until requested.
  The main Read/Stop action now spans the control card, and preview/media
  actions remain inside a 360-pixel viewport.
- Mobile Files now exposes Download on every file row and in the open document
  pane. Browser downloads use the authenticated remote filesystem data route;
  Android downloads use the same route through the native credential/cookie
  boundary and let the user choose the destination with the system document
  picker.
- Hermes Mobile now appears in Android's share sheet for text, links, and
  individual images. Shared content opens a confirmation sheet instead of
  sending automatically.
- The share sheet can switch among saved direct, Tailnet, and Cloud targets,
  then route to an existing session or create a new one. New conversations have
  their own remote directory picker and explicit cwd without modifying the
  connection's normal preferred workspace.
- Android copies a shared image out of its temporary content URI immediately,
  caps it at 16 MiB, and keeps it only in application cache. JavaScript sees
  metadata until confirmation; cancel, successful send, replacement, and
  orphan cleanup remove the cached image.
- Confirmed image shares use the existing authenticated
  `image.attach_bytes` gateway method followed by ordinary prompt submission.
  A synchronous send guard prevents fast double taps from submitting twice,
  and selecting the current but disconnected target now performs a real
  reconnect.
- Desktop now exposes the current session cwd as an always-visible status item.
  The same remote-aware project picker can retarget a draft or idle live
  session through the backend's existing `session.cwd.set` authority.
- Mobile keeps a preferred cwd per connection, sends it on `session.create`,
  adopts resumed/runtime cwd, and exposes one shared directory picker from Chat
  and Control.
- Mobile host launchers now give detached Hermes servers a user-home working
  directory. Windows Scheduled Task startup can no longer leak System32 into
  newly created sessions, and cross-platform service startup no longer uses the
  plugin checkout as the implicit agent workspace.
- Mobile Control now includes a searchable schema-driven host-settings surface
  using the authenticated `/api/config` deep-merge contract. Secret-like keys
  stay hidden and the existing redacted raw config view remains available.
- Mobile Files now has a closeable document pane, Preview and Edit tabs,
  explicit save/revert controls, current-folder cwd selection, and direct
  Reader handoff.
- Durable plan and compaction-resume procedure created.
- Standalone Git repository and project scaffold created.
- Server plugin linked and enabled in the Windows/AppData Hermes install.
- A single cross-platform host manager now preserves the Windows Scheduled Task
  path and adds guarded macOS launchd and Linux user-systemd services with the
  same loopback-only backend, host-validating proxy, protected credential, and
  tailnet-only Tailscale Serve topology.
- Host installation, status, explicit credential display, and macOS/Linux
  service removal are available through `scripts/mobile_host.py`.
- The macOS launchd service is installed and running with protected loopback
  listeners on ports 9129 and 9130. Tailscale Serve publishes the validating
  proxy at the Mac's current MagicDNS hostname.
- Server plugin reports compatible with Hermes `0.19.0`.
- Authenticated REST health, capability, and observation routes are live.
- Authenticated WebSocket delegates to the real Hermes gateway.
- Browser client supports connection setup, sessions, streaming, tools, stop,
  and connection-scoped unsent drafts.
- Capacitor 8 Android project created.
- Android native bridge provides Keystore-backed credentials, authenticated
  HTTP, and OkHttp WebSockets.
- Debug APK produced.
- Persistent `Hermes_Mobile_Server` scheduled task installed and running.
- Dedicated authenticated backend is listening on `127.0.0.1:9129`.
- Host-validating loopback reverse proxy is listening on `127.0.0.1:9130`.
- Tailscale Serve publishes the proxy over tailnet-only HTTPS at the
  workstation's current MagicDNS name, discovered at runtime instead of stored
  in the repository.
- Android now includes native Nous portal login, Cloud organization and agent
  discovery, silent per-agent OAuth, and core-gateway fallback.
- Android direct and Tailnet setup now probes the canonical public gateway
  health metadata before authentication. Gated Docker/remote hosts open their
  own password/OAuth sign-in and validate native sessions with a one-use core
  WebSocket ticket; ungated hosts retain Keystore-backed token mode.
- Direct/Tailnet hosts with no Mobile plugin now fall back to the standard core
  gateway on an explicit capability-route 404. Other plugin failures remain
  fail-closed so an installed incompatible plugin is not silently bypassed.
- The initial Mobile connection path remains plugin-owned. Milestone 5C adds a
  narrow generic TTS provider/catalog seam and Desktop UI to the adjacent local
  Hermes checkout, while every concrete Kokoro, F5-TTS, and Qwen implementation
  remains in this standalone repository.
- Gateway inventory confirms the side project can use existing Hermes RPCs for
  session history, reasoning and tool events, slash commands, model switching,
  config, toolsets, and cron management without core changes.
- The client now has the phone-first Chat, Sessions, and Control shell, rich
  reasoning/tool/request rendering, slash commands, model/config/toolset
  controls, and cron management.
- User and assistant messages now render safe GitHub-flavored Markdown,
  including responsive tables, task lists, links, images, blockquotes, and
  copyable fenced code. Raw HTML and active-scheme links remain disabled.
- TTS receives a plain-text projection of Markdown so formatting punctuation
  and link destinations are not spoken aloud.
- Android now records from the phone microphone, sends ephemeral audio through
  authenticated Hermes STT, and deletes the native temporary recording after
  transfer.
- Assistant replies have per-message Listen/Stop controls plus a
  connection-scoped auto-speak preference backed by authenticated Hermes TTS.
- Android foreground events now trigger an application-level gateway probe.
  A stale or closed socket is replaced, the same durable Hermes session is
  resumed, history is rehydrated, and retries remain bounded while the app is
  active.
- Disconnect events received while the app is active also enter the same
  reconciliation path. Intentional disconnects and connection switches do not
  auto-reconnect.
- Direct, Tailnet, and Cloud targets now live in a saved-connection registry
  with stable connection IDs and separate Android Keystore credential
  associations. Long-lived credentials remain outside JavaScript persistence.
- The Android bridge can enumerate existing Keystore credential IDs so a single
  orphan left by the older singleton connection store can be recovered and
  re-associated without revealing the token to JavaScript.
- Cloud cards now ignore literal `unknown` metadata and fall back to useful
  dashboard/gateway availability state.
- Tool rows remain readable before detail payloads arrive and consume Hermes's
  canonical `args_text` and `result_text` fields. Complete reasoning Markdown
  chunks are separated instead of being concatenated into malformed emphasis.
- Tool activity now seals the current live reasoning segment. Reasoning that
  resumes after a tool is inserted as a second inline block instead of editing
  the pre-tool block in place.
- Sessions can be searched and browsed by Hermes project, repository lane, cwd,
  branch, source, and model using the authoritative project gateway RPCs, with
  a flat-session fallback when project data is unavailable.
- The mobile palette can follow the connected Hermes host's active skin and
  live `skin.changed` events through an explicit read-only Follow host choice.
- The composer textarea grows from one line through multiline drafts with a
  bounded height and internal scrolling, using a phone-sized font and complete
  line box so text is not vertically clipped.
- The exact support-site Nous girl asset replaces the in-app H lettermark,
  empty-state mark, favicon, and Android legacy, round, and adaptive launcher
  icons.
- The polished dark Hermes Mobile palette is now the default. Host skin
  projection is an explicit connection-scoped option, so a host using `mono`
  no longer silently turns the app into a washed-out grayscale interface.
- Appearance is now fully client-local. Each saved connection can select Hermes
  Mobile or the Desktop-matched Nous, Midnight, Ember, Mono, Cyberpunk, and
  Slate palettes without sending `config.set skin` or modifying `display.skin`
  on the host. Appearance remains available while disconnected.
- Cached host skin data is tagged with the connection that emitted it. A
  connection change cannot clear a newly arrived skin or reuse the previous
  host's palette, and invalid empty skin events are ignored.
- Foreground history rehydration now merges with richer live transcript rows,
  preserving tool inputs and outputs already received by the phone. Durable
  summary-only tool rows are labeled static content instead of empty bordered
  disclosures.
- Every Android WebSocket dial now has a unique socket generation ID. Delayed
  state events from a backgrounded socket are ignored after its replacement is
  created, and expected background failures no longer raise a red gateway
  banner.
- Active Android WebSockets now retain a non-exported foreground
  `remoteMessaging` service before asynchronous ticket minting begins. The
  service posts an ongoing low-priority connection notification and holds a
  partial wake lock until the final native socket closes, keeping the CPU and
  socket alive while the screen is off or the app is backgrounded.
- Transient `thinking.delta` spinner/status events are no longer inserted into
  the transcript. Live reasoning opens with its actual Markdown, completed
  reasoning replaces its preview, tool generation plus argument/output aliases
  are consumed, and Markdown presentation separators no longer render as rows
  of empty lines.
- Summary-only durable tool history now states that the payload was not
  retained instead of presenting an empty disclosure.
- Normal TTS splits replies into provider-safe chunks no longer than 1,800
  characters and plays them sequentially.
- Each saved connection now has normal TTS provider, voice, and speed settings
  used by both per-response Listen and connection-scoped auto-speak.
- A multivoice Reader can parse named-speaker scripts, request Hermes smart
  voice assignment, override provider and voice per speaker, and read the
  resulting blocks in sequence.
- Reader cards now use a strict single-column, viewport-contained layout.
  Speaker names, voice selectors, normal prose, and unbroken URLs wrap or
  truncate inside the card instead of expanding the whole Reader horizontally.
- Reader playback now has a connection-scoped buffer-ahead preference matching
  Desktop's default of 3 and range of 0 through 6. It prepares the current
  block plus the configured number ahead while preserving script order, and a
  failed speculative request is retried once when that block becomes active.
- Reader playback follows the active speaker block by default. A manual touch
  scroll or mouse wheel releases follow mode, Resume follow reattaches it, and
  each block exposes Start here or Restart here playback.
- A failed Reader voice falls through distinct alternate selected providers
  first, then remaining selected voices, then the host default. Normal
  per-response Listen and auto-speak also fall back to the host default when a
  selected voice fails.
- Normal long-form Listen and auto-speak now default to a three-chunk lookahead,
  so later chunks synthesize while the current chunk is playing. Reader keeps
  honoring its explicit connection-scoped 0 through 6 buffer setting.
- Every completed chat message now has a Copy control that copies the full
  source text and briefly changes to Copied. Assistant messages retain the
  adjacent Listen or Stop control.
- The Files tab uses Hermes's authenticated remote-safe filesystem endpoints to
  browse directories, preview text files, and save explicit spot edits.
- The Files heading and path bar remain fixed while one explicit,
  touch-enabled directory/editor viewport owns vertical scrolling. Directory
  rows no longer shrink into a clipped container.
- Chat, Sessions, Reader, Files, and Control use an evenly aligned five-item
  bottom bar, with a fixed three-column composer above it.
- Streamed assistant rows are now sealed as explicit interim boundaries.
  Matching, prefix-continuing, and gateway-previewed final answers settle onto
  that row instead of rendering a second answer, while genuinely different
  pre-tool commentary remains visible.
- Id-less `tool.generating` notices now fold into the stable tool call instead
  of leaving orphan presentation rows. Rich completed tool inputs, outputs,
  progress, diffs, and findings survive foreground/history hydration and
  same-session reselection.
- Tool cards now follow Hermes `details_mode`: expanded opens the full detail
  region, collapsed starts closed but remains tappable, and hidden keeps a
  labeled tool-status card without exposing payloads. Long expanded bodies own
  a bounded touch-scroll region instead of trapping content in an unscrollable
  small bubble.
- Collapsed tool mode now retains a substantial readable card with the tool
  name, running/completed/failed state, and bounded progress, input, and output
  previews. It no longer reduces completed tools to anonymous horizontal bars.
  Id-less `tool.complete` events are now authoritative and survive final-answer
  settlement instead of being removed as provisional generation notices.
- Android now treats Capacitor's `appStateChange` as the sole native lifecycle
  authority and schedules a foreground probe only for a real
  inactive-to-active edge. The WebView visibility event remains the browser
  fallback and no longer duplicates native probes.
- A single slow foreground probe no longer tears down a healthy-looking
  socket. The app requires a second failed application-level probe before
  redialing, while an already-closed socket still reconnects immediately.
- JSON-RPC connect attempts and reconnect tasks are bound to their exact socket
  and connection generations. Late open, close, or failure events from a
  replaced attempt cannot change the current gateway state.
- Closing a native socket while its listeners or ticket are still being
  prepared now cancels the Java dial. Native cancellation tombstones,
  idempotent foreground-service leases, and terminated-socket cleanup prevent
  orphan OkHttp sockets, leaked Capacitor listeners, and duplicate service
  release/start cycles.
- Foreground-service promotion and wake-lock runtime failures are caught inside
  the service, logged without credentials, and stopped cleanly instead of
  escaping as an activity-closing process exception.
- Physical-device ADB exit history and the Android crash buffer confirmed three
  tab-return crashes in `HermesConnectionService`. A fast socket release could
  bring down a service while Android was still waiting for its foreground
  promotion, producing `ForegroundServiceDidNotStartInTimeException`.
- `HermesConnectionService` now promotes immediately in `onCreate()` and uses
  process-wide requested socket state to prevent a release from overtaking a
  pending retain. The replacement APK was installed in place on the physical
  phone, preserving app data and Android Keystore credentials.
- A separate post-fix process exit was traced to Android WebView renderer
  eviction under memory pressure during long audio and large session/project
  callbacks. Capacitor's debug bridge was stringifying and logging complete
  native gateway payloads, and its default `BridgeWebViewClient` did not handle
  `onRenderProcessGone()`, so WebView killed the application process.
- Android packaging now disables Capacitor native callback payload logging. The
  primary renderer remains important while the app is backgrounded, and both
  the application WebView and the native sign-in WebView clean up a terminated
  renderer. The activity recreates and reconnects instead of allowing renderer
  eviction to terminate the foreground-service process.
- Transcript children now use non-shrinking flex sizing. Growing live
  reasoning, messages, or later tool events increase the transcript's scroll
  height without compressing earlier expanded tool cards into horizontal
  slivers.
- Streaming transcript follow now runs as an immediate layout correction only
  while the user is near the bottom. Manual upward scrolling releases follow,
  avoiding the long-answer rubberband caused by restarting CSS smooth
  scrolling for every streamed chunk.
- Late completed reasoning and tool lifecycle events are inserted before the
  current turn's final assistant response. Network arrival order no longer
  places thinking or tools below an already-rendered final answer.
- Live transcript reduction now also canonicalizes already-present reasoning and
  tool rows on completion and lifecycle updates. A row that has already landed
  below the final answer is repaired immediately instead of waiting for session
  history rehydration after navigation.
- The private `helix4u/hermes-mobile` repository now has a credential-safe
  install guide, explicit agent handoff contract, host verification script,
  runtime MagicDNS discovery, and focused client/server GitHub CI. The repo
  contains no session token, Tailnet hostname, or long-lived credential.
- Android exit history captured the overnight failure at 08:59:48 as
  `ForegroundServiceDidNotStartInTimeException` in
  `HermesConnectionService`, not a Reader or WebView exception. A reconnect
  reached an existing service object after it had removed foreground state, so
  `onCreate()` did not rerun and Android's five-second promotion deadline
  expired.
- Every retain now reasserts foreground state before lease reconciliation.
  Idle teardown keeps the notification until `onDestroy()`, uses
  `stopSelfResult(startId)` so an older release cannot stop a newer retain, and
  enters through `startForegroundService()` without relying on a racy
  `serviceCreated` snapshot.
- The standalone plugin now registers real local Kokoro, F5-TTS, and Qwen3-TTS
  providers through Hermes's generic TTS provider registry.
- Provider discovery now exposes dynamic voices, models, and capabilities to
  Desktop and Mobile without provider-specific UI fetches.
- Qwen3-TTS runs as an isolated authenticated loopback service on port 9140
  with its own Python 3.12 environment, CUDA 12.8 PyTorch runtime, scheduled
  task, and reusable voice store under the Windows Hermes home.
- Qwen clone mode accepts reference audio plus an optional transcript.
  VoiceDesign mode accepts a natural-language voice instruction, creates a
  reusable reference, then uses the smaller Base model for ordinary clone
  synthesis.
- Desktop Settings now includes a capability-driven Voice library for clone,
  design, language, transcript, instruction, reusable voice selection, and
  deletion.
- Desktop Voice settings, Reader, Pet speech, Mobile normal TTS, and Mobile
  Reader all consume the same live custom-provider catalogs.
- Mobile now renders the selected provider's voices in a real `select`
  control instead of relying on an Android WebView `datalist`. Partial
  built-in live catalogs are merged with the complete bundled choices, while
  provider-owned custom catalogs remain authoritative.
- Mobile Voice now exposes the generic custom-provider capabilities: Qwen
  clone from phone reference audio, instruction-based design, language,
  transcript/sample text, automatic selection after creation, and deletion of
  provider-owned voices. The client contains no Qwen-specific endpoint branch.
- Reference audio remains only in component memory during the authenticated
  request and is cleared after creation. Android voice creation can use a
  bounded 15-minute native HTTP timeout so first model download or VoiceDesign
  is not cut off by the ordinary audio-request timeout.
- A partial live catalog for a built-in provider is merged with Desktop's
  complete built-in voice list instead of replacing it with only the currently
  configured voice. Dynamic plugin catalogs and account-owned ElevenLabs
  catalogs remain provider-authoritative.
- Plugin TTS dispatch now resolves voice, model, language, and instruction from
  the selected provider's own configuration before considering generic root
  values. A root Kokoro voice can no longer be sent to F5-TTS or Qwen when
  previewing or playing those providers.
- The regular Desktop shortcut target has been repackaged and launched with
  the new TTS UI. The exact shortcut executable emitted
  `HERMES_BACKEND_READY` and completed Desktop startup.
- Local Mobile `main` now contains private fix branch
  `origin/codex/fix-live-transcript-order` at
  `acc940c58a1605b04312d1acfdedc9ab6277e691`, four commits ahead of private
  `origin/main` at `f58d77e0424f25262ca7c9fa75fd86a5e4dd31c7`.
- The cross-platform host follow-up no longer evaluates `os.getuid()` on
  Windows during injected launchd command tests; the focused server suite
  passes on Windows with only the expected platform-specific skips.

Next action:

Install the provider, Reader-source, and wake-word APK when explicitly
requested. On one connected Android host, enable Listen for “Hey Hermes”, say
the phrase while voice is idle, and confirm ordinary recording begins exactly
once. Verify it pauses during playback, recording, backgrounding, and
disconnection, then resumes on the same foreground idle connection. Exercise
one supported API-key or OAuth setup and one Reader script whose source
appendix must remain unspoken and absent from the saved podcast.

On the installed adaptive-TTS build, compare 0.70x, 1.00x, and 1.50x through
an ordinary assistant Listen action, auto-speak, and pet speech. Then play the
same long response twice and confirm the short first segment starts promptly,
later chunks remain seamless, queued speech does not interrupt current audio,
and Reader continues to honor its own selected buffer depth.

Reopen the chat attachment from the reported session. Scroll inside the
bounded Markdown/plain text preview, then keep swiping at its top and bottom.
The transcript should continue in the same gesture without requiring a narrow
strip outside the card. Repeat once in an expanded long tool call and in Reader
File Preview.
Download should still use Android's save flow, Open preview should render the
document, Open in Reader should load the same content, and no host path should
be visible.

Milestone 5M implementation begins with its isolated plugin store and
deterministic projection tests. Do not add machine-map fields to Hermes
`state.db`, do not inject revisions into the system prompt mid-session, and do
not collect hardware identifiers, credentials, public IPs, or broad installed
application inventories.

Start a fresh local Hermes session before judging the Windows path guidance,
because existing sessions retain their original cache-stable system prompt.
Exercise a terminal `pwd`, a native `C:/...` path, a Bash-displayed `/c/...`
path passed into `search_files`, and a relative file-tool path after `cd`.

Milestone 5L physical acceptance is complete. The next implementation slice is
the bounded, local device-event journal for battery, charging, connectivity,
and foreground/background changes. Notification access remains a separate
explicit opt-in phase; assistant, accessibility, MediaProjection, multi-device
audio, journal suggestions, and gaze remain later permissioned work.

The latest tool-evidence APK is installed in place with app data and Android
Keystore state preserved. Run a `terminal` call and another argument-bearing
tool with Tool evidence selected. Confirm Alien Child waits for the completed or
failed update and comments from the supplied command and result without
complaining that the arguments are missing. Repeat under Companion and in
sidechat, then continue the server-swap, mid-turn motion, and 1.50x pet-speech
checks from the prior build.

On the installed build, connect to `mr mid tier`, open Pet companion, and
confirm the visual-only explanation replaces unsupported commentary, sidechat,
personality, and auxiliary-model controls without an unknown-method banner.
Tap Alien Child and test optional host-default pet speech. Switch back to
Workstation and confirm the complete stored pet controls return.

Install the rest-window drag replacement APK in place. Let Alien Child finish a
walk and visibly enter a rest, then drag him with a finger. Confirm the sprite
follows the finger immediately and remains at the dropped point instead of only
saving coordinates under the completed roam frame. Repeat once during an active
walk and once after switching tabs.

Restart the `mr mid tier` Hermes host through the Nous Cloud lifecycle surface,
then reconnect and use Control, Mobile server plugin, Check host. Confirm the
section reports plugin `0.1.0` rather than `core-gateway`. If Reader, speech, or
filesystem still returns 404, update the Cloud host's Hermes core because those
routes are not provided by the standalone plugin.

The Reader stale-error cleanup APK is already installed in place on the
physical phone. Open Reader on the older host and confirm Host default remains
usable without the red catalog error. Switch to the Windows workstation and
confirm its provider and voice controls return without carrying the Cloud
selection forward.

Exercise Edit and Delete on a disposable saved connection, confirming Cloud
endpoint fields stay read-only and deleting one host does not disturb the
others. Cloud connection acceptance is complete: the installed replacement
reused `mr mid tier`, connected through the standard gateway without a Mobile
plugin or token, and loaded the new-session workspace at `/opt/data`.

Install the latest replacement APK in place with app data preserved. Drag Alien
Child directly from the visible sprite in Chat, visit each other bottom tab,
return, and confirm he remains draggable every time. Reveal the sidechat star
and test both its tap and a drag that begins on it. Interrupt another drag by
switching apps and confirm cleanup, position persistence, and roaming resume
remain reliable. Let him roam through short and long legs and confirm the
faster movement floor removes the barely-moving glide without removing rests
or route variety.

Start one long reply or pet comment playing, then queue a second Listen,
auto-speak, Reader, or pet speech request. Confirm the first audio is not
interrupted and the second begins only after it ends. Confirm long-response
chunk lookahead remains seamless. Tap Stop during another pair and confirm both
the active audio and the waiting request are discarded.

Open sidechat and ask for a substantial multi-paragraph response after at least
one earlier exchange. Confirm the sheet retains and renders the full Markdown
answer, the pet stays in character, and only the transient roaming bubble is
abbreviated. Confirm the floating popout fits above the bottom navigation
without a full-screen dimmer, the message viewport scrolls, mic/send/clear/close
icons remain reachable, recording swaps to a stop-square, and the compact
Hermes handoff still fills the main composer. In Chat, confirm durable pet
remarks are small and muted, then dismiss one and verify it stays hidden for
this saved connection after navigation without deleting the underlying session
record.

Run a long tool-using turn with Tool evidence or Progress commentary enabled.
Confirm the pet generates and optionally speaks commentary before the final
assistant response, without requiring a poke or Test button. The Windows host
does not need another refresh for this client-only repair.

Install the latest APK in place with app data preserved. Drag Alien Child,
interrupt a walk with a tap and another with a drag, switch apps during a walk,
and return. Confirm his position never jumps, the walking row faces the travel
direction, the slower mixed-length pace feels varied, and roaming resumes after
each interruption.

Open the pet sidechat, use text and pet mic, close and reopen it, and confirm the
history remains outside the main transcript. Use Send to Hermes and confirm it
fills the main composer without silently sending. During a long tool-using turn,
confirm Tool evidence or Progress commentary speaks before completion without a
poke or Test button. Repeat in Desktop's in-window pet and the popped-out
Hermes/Pet input target.

Exercise Companion, Progress, and Tool evidence lenses, including zero tool
observations. Confirm progress/tool commentary waits for new observed work,
secret-like tool fields are not exposed, and spoken commentary begins while
the turn is still generating. Resume the session and confirm comments remain
in the transcript. Test Copy, Listen, timing controls, recent-comment history,
and the explicit pet auxiliary provider/model/reasoning assignment.

Install the TTS-speed replacement APK in place with app data preserved. Compare
0.70x, 1.00x, and 1.50x using an ordinary response Listen button, auto-speak,
and Reader. Confirm each path changes playback speed with Host default and a
custom provider such as F5-TTS or Qwen, without an unnatural pitch change.

Install the newest APK in place with app data preserved and rerun the exact
multivoice Render & save that failed at 22 of 24. Confirm it completes all
chunks and opens Android's document picker without a 500 from
`/api/audio/speak`.

Install the rebuilt debug APK in place with app data preserved. Confirm Control
returns with every settings section collapsed. First reopen the reported image
generation session or create another generated image. Confirm the completed
reply renders the image inline instead of showing `MEDIA:`, the full-screen
viewer opens on tap, Copy hides the host path, and Listen does not speak it.

In a deeply scrolled Files directory, open Markdown, plain text, image, audio,
and video files. Confirm the preview is immediately visible;
Preview/Edit/save/revert/download, Previewer/Reader handoff, image full-screen
Fit/Actual size, and native media playback work on the phone.

Use a supported third-party media link to confirm ask/always/off embed
behavior, then render a multivoice script to one WAV and save it with Android's
document picker. Confirm the saved WAV contains every speaker block in order.

Then share a link, text, and an image from other Android apps. Confirm each
waits for explicit approval, can switch remote targets, can select an existing
session, and can create a new session with a chosen remote cwd. Cancel one
image share and confirm it does not reopen. Download files from both a row and
the document pane and verify the Android-selected copies.

Then confirm the
Session cwd strip, remote folder picker, connection-scoped persistence, live
idle-session retargeting, Files close/Preview/Edit/save flow, and Open in Reader
handoff. The regular Desktop shortcut is already running the rebuilt package;
confirm its workspace status item changes both a draft and an idle live
session.

Then connect the physical Android tailnet peer through the verified Mac HTTPS
MagicDNS endpoint and open Control, Voice. Select Qwen3-TTS,
F5-TTS, and Kokoro and confirm each real Voice picker is populated. With Qwen
selected, create a clone from phone audio and a design from instructions,
confirm each new voice is selected after creation, and verify it remains
available in normal Voice and Reader. Continue the Desktop preview checks from
the regular shortcut as well.

Validation completed:

- Nested-scroll focused attachment Vitest: 1 file and 2 tests passed.
- Complete Mobile Vitest after scroll chaining: 45 files and 197 tests passed.
- TypeScript typecheck, Vite production build, Capacitor Android sync, Android
  `assembleDebug` with Android Studio JDK 21, and `git diff --check`: passed.
- Nested-scroll replacement APK size: 6,260,215 bytes.
- Nested-scroll replacement APK SHA-256:
  `13565E348FDBF774E5A6D3232A6D03819D17E3215906F3B5948FE2726A73A0BC`.
- Nested-scroll APK installed successfully with `adb install -r` on the
  authorized Samsung SM-S918U at `100.112.167.36:38979`; Android reports
  `lastUpdateTime=2026-07-30 17:13:47`. No phone content was inspected.
- Inline-document attachment focused and complete Mobile Vitest: 45 files and
  197 tests passed.
- Mobile TypeScript typecheck, Vite production build, Capacitor Android sync,
  and Android `assembleDebug` with Android Studio JDK 21: passed.
- Direct Windows prompt-builder and `search_files` MSYS-to-native dispatch
  smokes: passed. Hermes pytest was not run.
- Inline-document-attachment APK size: 6,260,214 bytes.
- Inline-document-attachment APK SHA-256:
  `5DF0755EBC58480A224C6EF2B9A3854CDE8DDD16FCECC218FE1C4655526000A8`.
- The replacement APK installed successfully with `adb install -r` on the
  explicitly supplied Samsung target `100.112.167.36:38979`; Android reports
  `lastUpdateTime=2026-07-30 16:47:29`. No screen or app content was opened.
- The tool-evidence replacement APK installed successfully with
  `adb install -r` on the explicitly selected Samsung SM-S918U at
  `100.112.167.36:36879`. Android reports package `dev.hermes.mobile`,
  versionName 1.0, versionCode 1, and
  `lastUpdateTime=2026-07-30 12:28:30`. Existing app data and Android Keystore
  state were preserved. No phone screen or application content was inspected.
- Tool-evidence focused Mobile Vitest: 3 files and 19 tests passed.
- Complete Mobile client Vitest after the tool-evidence repair: 43 files and
  189 tests passed.
- Mobile TypeScript typecheck, Vite production build, Capacitor Android sync,
  and Android `assembleDebug` with Android Studio JDK 21: passed.
- Focused `git diff --check` passed with only existing Windows line-ending
  conversion warnings.
- Tool-evidence replacement APK size: 6,258,583 bytes.
- Tool-evidence replacement APK SHA-256:
  `0B51134548282FF829D8E7004496855CD9343E15F827D89C0448CC49AC93F06F`.
- The server-swap, stable-motion, and pet-speed replacement APK installed
  successfully with `adb install -r` on the explicitly selected Samsung
  SM-S918U at `100.112.167.36:36879`. Android reports package
  `dev.hermes.mobile`, versionName 1.0, versionCode 1, and
  `lastUpdateTime=2026-07-30 12:20:32`. Existing app data and Android Keystore
  state were preserved. No phone screen or application content was inspected.
- Server-swap, stable-motion, and pet-speed focused Vitest: 5 files and 37
  tests passed.
- Complete Mobile client Vitest after the repair: 43 files and 187 tests
  passed.
- Mobile TypeScript typecheck, Vite production build, Capacitor Android sync,
  and Android `assembleDebug` with Android Studio JDK 21: passed.
- Focused `git diff --check` passed with only existing Windows line-ending
  conversion warnings.
- Server-swap, stable-motion, and pet-speed APK size: 6,258,270 bytes.
- Server-swap, stable-motion, and pet-speed APK SHA-256:
  `0F41FD1868FDFC14B2021F3AEAD180B2F93D1C975D694DF913F4FC2B329F106C`.
- A real 360 by 800 Chromium touch run reproduced the remaining failure:
  storage changed while the rendered sprite snapped to the pre-drag frame.
  After the correction, a native `touchstart`/`touchmove`/`touchend` gesture
  moved Alien Child from `(12, 539.39)` to `(104, 491.39)`, persisted
  `{x:104,y:293}`, and left the browser console with zero errors or warnings.
- Complete Mobile client Vitest after the native-touch correction: 43 files
  and 185 tests passed. TypeScript typecheck, Vite production build, Capacitor
  Android sync, and Android `assembleDebug` with Android Studio JDK 21 passed.
- Native-touch pet drag APK size: 6,257,869 bytes. SHA-256:
  `7DE3818DDB382627B455E6279C818106907A5112141481AC9ED57ECB2EFCF16C`.
- The native-touch replacement APK installed successfully with
  `adb install -r` on the explicitly selected Samsung SM-S918U at
  `100.112.167.36:44839`. Android reports
  `lastUpdateTime=2026-07-30 11:44:46`; the relaunched app is PID 6474 and
  `HermesConnectionService` is foreground with notification ID 2201. Existing
  app data and Keystore state were preserved, and no phone screen or
  application content was inspected.
- Pet capability and fixed-overlay focused Vitest: 6 files and 17 tests passed.
- Complete Mobile client Vitest after the capability and drag repair: 43 files
  and 185 tests passed.
- Mobile TypeScript typecheck, Vite production build, Capacitor Android sync,
  and Android `assembleDebug` with Android Studio JDK 21: passed.
- Pet capability and cross-tab drag APK size: 6,257,482 bytes.
- Pet capability and cross-tab drag APK SHA-256:
  `BB1C582C0B4CAF7974D10A52B8DCB61DB2AB849672C671E818C9B87003D3E1EF`.
- The replacement APK installed successfully with `adb install -r` on the
  explicitly selected Samsung SM-S918U at `100.112.167.36:44839`. Android
  reports package `dev.hermes.mobile`, versionName 1.0, versionCode 1, and
  `lastUpdateTime=2026-07-30 11:28:54`. Existing saved connections and Android
  Keystore credentials were preserved. The app relaunched as PID 14043, and
  `HermesConnectionService` is foreground with notification ID 2201. No phone
  screen or application content was inspected.
- Reader stale-error focused Vitest: 3 files and 10 tests passed.
- Complete Mobile client Vitest after the repair: 40 files and 177 tests
  passed.
- Mobile TypeScript typecheck, Vite production build, Capacitor Android sync,
  and Android `assembleDebug` with Android Studio JDK 21: passed.
- Reader stale-error cleanup APK size: 6,256,579 bytes.
- Reader stale-error cleanup APK SHA-256:
  `38D68F10D1DCCF6EBC5EB7A60C8A831EC8873F8D875A0EAA74E73BF0DB8FE901`.
- The cleanup APK was installed successfully with `adb install -r` on the
  explicitly selected Samsung SM-S918U at
  `100.112.167.36:44839`. Android reports package
  `dev.hermes.mobile`, versionName 1.0, versionCode 1, and
  `lastUpdateTime=2026-07-30 11:08:10`. Existing app data and Android Keystore
  credentials were preserved. The app relaunched as PID 24130 with no matching
  fatal exception in the initial filtered Logcat interval. No phone screen or
  application content was inspected.
- TTS host-capability focused Vitest: 5 files and 22 tests passed.
- Complete Mobile client Vitest after the fallback: 40 files and 176 tests
  passed.
- Mobile TypeScript typecheck, Vite production build, Capacitor Android sync,
  and Android `assembleDebug` with Android Studio JDK 21: passed.
- TTS-capability fallback APK size: 6,256,467 bytes.
- TTS-capability fallback APK SHA-256:
  `FB1FB9BD46ED89CCC9A49EA06FE013A62A1F11BDB9E8C8E04AE97B94ED2EF493`.
- The fallback APK was installed successfully with `adb install -r` on the
  explicitly selected Samsung SM-S918U at
  `100.112.167.36:44839`. Android reports package
  `dev.hermes.mobile`, versionName 1.0, versionCode 1, and
  `lastUpdateTime=2026-07-30 10:54:55`. Existing app data and Android Keystore
  credentials were preserved. No phone screen or application content was
  inspected.
- In-app plugin-installer focused Vitest: 2 files and 5 tests passed before the
  final target-root guard; the final focused suite passes 6 tests.
- Complete Mobile client Vitest after the installer: 38 files and 172 tests
  passed.
- Mobile TypeScript typecheck, Vite production build, Capacitor Android sync,
  Android `assembleDebug` with Android Studio JDK 21, focused
  `git diff --check`, and server-plugin Python compile: passed.
- In-app plugin-installer APK size: 6,255,919 bytes.
- In-app plugin-installer APK SHA-256:
  `B92FB6DDA333DE85678FC3A34733B4AB24DB1B7F2A9C93327981FA95A772525C`.
- The final guarded APK installed successfully in place on the authorized
  Samsung SM-S918U at 2026-07-30 03:20:20 with app data and Android Keystore
  state preserved. Android reports package `dev.hermes.mobile`, versionName
  1.0, versionCode 1, live PID 29173 after launch, and
  `HermesConnectionService` promoted in the foreground with notification ID
  2201 and service type `remoteMessaging`.
- Physical Control inspection kept the installer inside the phone viewport,
  showed 12 files, 28.2 KiB, the 100 MiB host limit, and the exact
  `/opt/data/plugins/hermes-mobile` target. The review card displayed the
  overwrite scope and restart requirement before the final action.
- Physical Cloud upload acceptance passed: all files were verified, plugin
  enablement succeeded, and the final state reports host restart required.
- Cloud core-gateway and saved-connection focused Vitest: 4 files and 15 tests
  passed, including the native transport sequence that reproduced the device
  failure.
- Complete Mobile client Vitest after the repair: 37 files and 167 tests
  passed.
- Mobile TypeScript typecheck, Vite production build, Capacitor Android sync,
  Android `assembleDebug` with Android Studio JDK 21, and focused
  `git diff --check`: passed.
- Cloud core-gateway and connection-management APK size: 6,244,503 bytes.
- Cloud core-gateway and connection-management APK SHA-256:
  `5694023CD5F416793FC6079904E7F343E271A1A3FA7981B3907D5CAB4F58C264`.
- The replacement APK installed successfully in place on the authorized
  Samsung SM-S918U at 2026-07-30 02:32:52 with app data and Android Keystore
  state preserved. Android reports package `dev.hermes.mobile`, versionName
  1.0, versionCode 1.
- Physical Cloud acceptance passed immediately after relaunch. The app reused
  the saved `mr mid tier` connection, displayed `Connected to mr mid tier`,
  and loaded session cwd `/opt/data`. No Mobile plugin installation or token
  entry was required on the Cloud instance.
- Android reports `HermesConnectionService` in foreground with notification ID
  2201 and service type `remoteMessaging`. Filtered Logcat showed no Hermes
  connection exception or process crash during the acceptance interval.
- Automatic Nous Cloud onboarding focused Vitest: 4 files and 13 tests passed.
- Complete Mobile client Vitest suite after automatic Cloud routing: 36 files
  and 162 tests passed.
- Mobile TypeScript typecheck, Vite production build, Capacitor Android sync,
  and Android `assembleDebug` with Android Studio JDK 21: passed.
- Automatic Nous Cloud onboarding APK size: 6,243,953 bytes.
- Automatic Nous Cloud onboarding APK SHA-256:
  `FB0FDFB09215039187DD4E232E3E709850C104618EF82A58FA9A1E2F25FA5B24`.
- The replacement APK was installed in place through the already-authorized
  wireless ADB target `100.112.167.36:34959` at 2026-07-30 02:17:04, using
  `adb install -r` so the connection registry and Android Keystore data were
  preserved. Android reports package `dev.hermes.mobile`, versionName 1.0,
  versionCode 1. No phone screen or application content was inspected.
- Physical Android Nous login, account inventory, per-agent sign-in, and core
  gateway fallback acceptance remains pending. No Cloud machine was modified,
  and no plugin installation was attempted or required.
- Compact pet-sidechat popout focused Mobile Vitest: 1 file and 3 tests passed.
- Complete Mobile client Vitest suite after the popout cleanup: 34 files and
  155 tests passed.
- Mobile TypeScript typecheck, Vite production build, Capacitor Android sync,
  and Android `assembleDebug` with Android Studio JDK 21: passed.
- Compact pet-sidechat popout APK size: 6,243,115 bytes.
- Compact pet-sidechat popout APK SHA-256:
  `4913A44D35BE23A1B611BCA52F87D5E1051054D52A7110ABD8002AA6C528935C`.
- The compact-popout replacement APK was installed in place on the explicitly
  authorized Samsung SM-S918U at 2026-07-30 02:03:17 with app data preserved.
  Android reported a successful cold launch of `dev.hermes.mobile/.MainActivity`
  as PID 10353. No phone screen or application content was inspected.
- The isolated in-app browser could not route to the workstation's local Vite
  listener, so a rendered 360 by 800 visual pass was not claimed. Physical
  Android layout acceptance remains pending.
- Tab-stable pet drag and serial speech-queue focused Mobile Vitest: 2 files
  and 17 tests passed.
- Complete Mobile client Vitest suite after the lifecycle and speech-queue
  repairs: 33 files and 152 tests passed.
- Mobile TypeScript typecheck, Vite production build, Capacitor Android sync,
  and Android `assembleDebug` with Android Studio JDK 21: passed.
- Tab-stable pet drag and non-interrupting speech-queue APK size:
  6,242,429 bytes.
- Tab-stable pet drag and non-interrupting speech-queue APK SHA-256:
  `879B0F677A53FDBECBC7732CC9C18536B0B7A3612A9F16B3AD7E1F7138F0FC82`.
- Direct-drag, sidechat, transcript-presentation, and transcript-reducer focused
  Mobile Vitest: 4 files and 55 tests passed.
- Complete Mobile client Vitest suite after restoring every pre-existing
  Transcript regression: 33 files and 150 tests passed.
- Mobile TypeScript typecheck, Vite production build, Capacitor Android sync,
  and Android `assembleDebug` with Android Studio JDK 21: passed.
- Pet-sidechat backend Python compile and a direct fake-DB/fake-auxiliary
  full-conversation dispatch smoke: passed. Python pytest was not run.
- The Windows Mobile host was refreshed through the checked-in installer. The
  scheduled service is running, loopback ports 9129 and 9130 are listening,
  authenticated health is `ok`, compatibility is `compatible`, contract version
  is 1, and Tailscale Serve remains configured. The credential was not printed.
- Direct-drag/full-sidechat/subdued-dialogue APK size: 6,242,183 bytes.
- Direct-drag/full-sidechat/subdued-dialogue APK SHA-256:
  `C54ADCE422B10FA3AB5735E353320E4EB4E0B9C7DF1E60F2D40766A2FB1048C8`.
- Mobile pet-bubble positioning, wrapping, and drag focused Vitest: 2 files and 15
  tests passed.
- Complete Mobile client Vitest suite: 33 files and 146 tests passed.
- Mobile TypeScript typecheck, Vite production build, Capacitor Android sync,
  and Android `assembleDebug` with Android Studio JDK 21: passed.
- Mobile viewport-safe pet-bubble replacement APK size: 6,241,007 bytes.
- Mobile viewport-safe pet-bubble replacement APK SHA-256:
  `564AC4A6223A91F8055E03A4DE95C2E6E22A9FEA185A77D6C3D2DE3876AA8640`.
- Mobile sidechat-send/active-turn focused Vitest: 2 files and 13 tests passed.
- Complete Mobile client Vitest suite: 33 files and 144 tests passed.
- Mobile TypeScript typecheck, Vite production build, Capacitor Android sync,
  and Android `assembleDebug` with Android Studio JDK 21: passed.
- `git diff --check`: passed with only existing line-ending warnings.
- Mobile sidechat-send/observer replacement APK size: 6,240,690 bytes.
- Mobile sidechat-send/observer replacement APK SHA-256:
  `96A44F4E3306EB0E83DDDE145702C25A55AD398269E3AE6D10EB7E476EF3C7DE`.
- Windows Mobile host refresh regression: two consecutive checked-in
  `mobile_host.py install` runs completed successfully. Each run replaced both
  listener PIDs, left `Hermes_Mobile_Server` running, and stabilized fresh
  loopback listeners on 9129 and 9130 instead of accepting the July 28 orphan
  processes.
- Live post-refresh pet RPC probe: all three `pet.sidechat.*` methods are
  registered, `pet.commentary.generate` is registered, and the personality
  catalog returned seven entries.
- Live post-refresh durable sidechat projection: resumed a stored session and
  loaded `pet.sidechat.history` successfully through the rebound handler.
- Live Tool evidence observer and speech proof: commentary generation
  completed without the old helper `NameError`, then the configured xAI pet
  profile synthesized 86,743 bytes of audio through `/api/audio/speak`.
- Mobile pet regression slice: 3 Vitest files and 11 tests passed.
- Mobile TypeScript typecheck: passed.
- Updated Windows installer PowerShell parser and focused `git diff --check`:
  passed.
- Final host status: scheduled service running, both loopback listeners live,
  authenticated health `ok`, compatibility `compatible`, contract version 1,
  and Tailscale Serve configured. The credential was not printed.
- Pet-sidechat backend Python compile: passed.
- Desktop pet-sidechat/typecheck and focused pet suite: 5 files and 37 tests
  passed.
- Desktop `npm run pack`: passed.
- The normal `C:\Users\btgil\Desktop\Hermes.lnk` shortcut launched the exact
  packaged executable, emitted `HERMES_BACKEND_READY port=61864`, and returned
  HTTP 200 from both `/api/health` and `/api/status`.
- Pet-sidechat Desktop executable size: 214,281,216 bytes.
- Pet-sidechat Desktop executable SHA-256:
  `BF80330FC68B72AAC6A05F5E4A4A34E7E4B500F194B55C0E1EF7FD2554CD9AAF`.
- Corrected Desktop pet-audio regression slice: 4 files and 26 tests passed.
- A direct gateway binding smoke passed for sidechat history, Progress
  commentary, and Tool evidence commentary after module rebinding.
- Authenticated xAI `orion` synthesis with the configured pitch/volume override
  returned HTTP 200 and a valid 14,854-byte MPEG payload through the refreshed
  Mobile host. The credential was not printed.
- Mobile sidechat/roam focused suite passed before final assembly; the complete
  client suite passed 33 files and 141 tests after the final focus/tap/drag
  rescheduling and non-resetting observer trigger.
- Mobile TypeScript typecheck, Vite production build, Capacitor Android sync,
  and Android `assembleDebug` with Android Studio JDK 21: passed.
- Pet-sidechat replacement APK size: 6,240,222 bytes.
- Pet-sidechat replacement APK SHA-256:
  `825BAA03AD2BFD614C6D14BB90DD5781B467156CDB997647740A6C5C756F5F73`.
- Pet speech/lens focused Mobile Vitest: 1 file and 8 tests passed.
- Complete Mobile client Vitest suite: 32 files and 139 tests passed.
- Mobile TypeScript typecheck, Vite production build, Capacitor Android sync,
  and Android `assembleDebug` with Android Studio JDK 21: passed after the
  final zero-tool-observation correction.
- A real 360 by 800 Chrome pass kept both Desktop-follow and independent pet
  voice controls inside the viewport with no horizontal overflow or console
  errors. Directional movement advanced right, turned, then advanced left
  while preserving non-transparent sprite pixels.
- Latest pet voice/lens APK size: 6,237,501 bytes.
- Latest pet voice/lens APK SHA-256:
  `7BD32BE44D7BC512728886DE3A7AE2B49CC1B24C40864FFA5B14F6C97E8B6613`.
- Desktop pet/config focused Vitest: 2 files and 14 tests passed. The broader
  pet, speech, profile-scope, commentary, and roam slice passed 8 files and 72
  tests.
- Desktop TypeScript typecheck and the final `npm run pack`: passed.
- The regular `Hermes.lnk` target launched the rebuilt package, emitted a fresh
  backend-ready port, and returned HTTP 200 from `/api/health`.
- The live profile config contains only the shared pet speech record expected
  by Mobile: enabled Hermes speech through xAI `orion`, speed 1, pitch +8.5,
  and volume 0.45.
- Final Desktop executable size: 214,281,216 bytes.
- Final Desktop executable SHA-256:
  `BC083AA4ADB04CF49523C9772255A49B5C9E23DE462CF3D981E9F3CEDC6E18E9`.
- Mobile pet focused Vitest: 4 files and 41 tests passed.
- Complete Mobile client Vitest suite: 32 files and 135 tests passed.
- Mobile TypeScript typecheck, Vite production build, Capacitor Android sync,
  and Android `assembleDebug` with Android Studio JDK 21: passed.
- A real 360 by 800 Chrome render loaded non-transparent pixels from the
  bundled Alien Child spritesheet, rendered a 68-pixel walking lane above the
  composer, kept the Pet section collapsed by default, expanded it without
  horizontal overflow, and logged no browser warnings or errors.
- Alien Child debug APK size: 6,233,504 bytes.
- Alien Child debug APK SHA-256:
  `4B2F9F0400AB65F93C45851DBBB2C4626DD63B09D041803F983881E0A03148D7`.
- TTS-speed focused Vitest: 2 files and 15 tests passed.
- Complete Mobile client Vitest suite: 31 files and 129 tests passed.
- Mobile TypeScript typecheck, Vite production build, Capacitor Android sync,
  and Android `assembleDebug` with Android Studio JDK 21: passed.
- TTS-speed replacement APK size: 5,241,609 bytes.
- TTS-speed replacement APK SHA-256:
  `63A3B391681F30A5CAF5BC8AA7675E3C37E5A33BB31AD79D4EF8FDF786E67241`.
- `git diff --check`: passed with only existing line-ending warnings.
- The Windows/AppData Mobile host was refreshed again at
  `2026-07-29 19:37 -06:00` after the adjacent Hermes core performance pass.
  The scheduled service is running, loopback backend 9129 and validating proxy
  9130 are listening, authenticated health is `ok`, compatibility is
  `compatible`, contract version is 1, and Tailscale Serve remains configured.
  The checked-in installer and status workflows did not print the credential.
- Current local-tree Android rebuild: the checked-in client build, Capacitor
  sync, and a forced `assembleDebug --rerun-tasks` all passed with Android
  Studio JDK 21. The matched refresh after the adjacent Hermes session/database
  hardening produced an APK of 5,240,774 bytes, modified at
  `2026-07-30T00:01:49.8005446Z`, with SHA-256
  `7A8C90DAB74A333D6114777E9911AB8902E93804C280A2393C287D2D9F0D2D57`.
- Mobile proxy timeout unittest: 3 tests passed.
- Focused speech queue/render Vitest: 2 files and 10 tests passed.
- Mobile TypeScript typecheck, Vite production build, Capacitor Android sync,
  and Android `assembleDebug` with Android Studio JDK 21: passed.
- The refreshed Windows Mobile host reports a running service, both loopback
  listeners, authenticated health `ok`, compatibility `compatible`, contract
  version 1, and configured Tailscale Serve.
- Two authenticated xAI syntheses through the actual validating proxy returned
  HTTP 200 with 2,335,322-byte and 3,550,298-byte responses near the former
  30-second cutoff; no new `/api/audio/speak` 500 appeared.
- Proxy-timeout replacement APK size: 5,496,505 bytes.
- Proxy-timeout replacement APK SHA-256:
  `76C1F9BEBD274DA6642C27214C2B442739D8E4555B3CCFC7B499E4E18FB9B2AA`.
- Generated-media focused Vitest: 5 files and 21 tests passed.
- Complete Mobile client Vitest suite: 31 files and 127 tests passed.
- Mobile TypeScript typecheck, Vite production build, Capacitor Android sync,
  Android `compileDebugJavaWithJavac`, and `assembleDebug` with Android Studio
  JDK 21: passed.
- A real 360 by 800 Chrome render loaded a completed Windows-path `MEDIA:`
  marker through a fake authenticated transport, kept the document exactly
  360 pixels wide, rendered the image card at 308.3 pixels wide, opened the
  full-screen viewer, omitted the host path from rendered HTML, and produced no
  browser or React console errors.
- Generated-media debug APK size: 5,496,505 bytes.
- Generated-media debug APK SHA-256:
  `125350D161CBA41765A31CD9E94987975076E41B1A5A0B699C7B82725E8171B4`.
- Reader/preview/media focused Vitest: 10 files and 33 tests passed.
- Complete Mobile client Vitest suite: 30 files and 122 tests passed.
- Mobile TypeScript typecheck, Vite production build, and Capacitor Android
  sync: passed.
- Android `compileDebugJavaWithJavac` and final `assembleDebug` with Android
  Studio JDK 21: passed.
- A real 360 by 800 Chrome pass confirmed every Control disclosure starts
  closed and returns to zero open sections after leaving and re-entering the
  tab.
- The same phone-width pass scrolled a 26-file directory to the bottom, opened
  the final file, and confirmed the document preview was moved to viewport
  position 200 px with its Markdown content and all actions visible. The
  document remained exactly 360 px wide.
- The combined Reader/Preview surface remained exactly 360 px wide. File
  Preview rendered Markdown and its actions; Multi-voice Reader kept Voices &
  buffering closed and gave its Read action the full 311.6-pixel control width.
- Image, audio, video, and embed surfaces remained within the 360-pixel
  document. The image preview rendered at 310 px wide, opened the full-screen
  viewer, both media elements exposed native controls, and YouTube remained
  behind the default consent façade.
- `git diff --check`: passed with only existing line-ending warnings.
- Reader/preview/media debug APK size: 5,496,505 bytes.
- Reader/preview/media debug APK SHA-256:
  `AE0B035216771FF13234E1E01A9EB11CFD5F5661E4C201AD38528B6284D3980D`.
- Android share/download focused Vitest: 4 files and 13 tests passed.
- Complete Mobile client Vitest suite: 24 files and 111 tests passed.
- Mobile TypeScript typecheck, Vite production build, and Capacitor Android
  sync: passed.
- Android `compileDebugJavaWithJavac` and `assembleDebug` with Android Studio
  JDK 21: passed.
- Packaged manifest inspection confirms exported `ACTION_SEND` handling for
  both `text/*` and `image/*`.
- A real 360 by 800 Chrome render kept the share sheet, long shared filename,
  message editor, destination controls, and action row inside the exact
  360-pixel document width. The sheet owned vertical overflow.
- The stacked new-session directory picker also stayed exactly 360 pixels wide,
  rendered above the share sheet at z-index 110 over 105, and kept its remote
  directory list and actions visible.
- Share/download debug APK size: 5,496,505 bytes.
- Share/download debug APK SHA-256:
  `D96E082BA52A1AF39152AD12B8B7BC3ECF8DECA86CC706441D165A87B6C4272D`.
- Session workspace and host-config focused Mobile tests: 3 files and 10 tests
  passed.
- Complete Mobile client Vitest suite: 22 files and 106 tests passed.
- Mobile TypeScript typecheck, Vite production build, and Capacitor Android
  sync: passed.
- Focused Mobile server-plugin suite: 19 tests run, 14 passed, and 5 expected
  Windows platform skips.
- Every checked-in Mobile PowerShell script passed the PowerShell parser.
- Android `assembleDebug` with Android Studio JDK 21: passed.
- Session-workspace debug APK size: 5,496,505 bytes.
- Session-workspace debug APK SHA-256:
  `0F65E4BDFA1E99121FE0A46BDF91CC02D2C5D5AFC0D718B9AA057DC5B5AF1CB9`.
- The refreshed Windows Mobile service is running, both loopback listeners are
  live, authenticated health is `ok`, compatibility is `compatible`, contract
  version is 1, and Tailscale Serve remains configured. The credential was not
  printed.
- Desktop cwd/dropdown focused Vitest: 3 files and 17 tests passed.
- Desktop TypeScript typecheck and `npm run pack`: passed.
- The regular shortcut target is 214,281,216 bytes with SHA-256
  `86646F9CF2D10205547BBE1B9172E7A2F8ACFBDA72345B39F72601268E844917`.
- Launching `C:\Users\btgil\Desktop\Hermes.lnk` started the exact packaged
  AppData executable, emitted `HERMES_BACKEND_READY port=54888`, and returned
  HTTP 200 from `/api/status` and `/api/health`.
- A real 360 by 800 browser render kept the new Session cwd strip readable,
  full-width, and aligned above the existing composer and five-item bottom
  navigation.
- The adjacent Windows/AppData Hermes checkout was pinned to upstream Nous
  `main` at `bff22069727ae7b7f8ede8d7da110ab0f1558d69`, the latest fetched tip
  selected for this reconciliation. Upstream advanced by six commits during
  the run and was intentionally not chased after the replay/build baseline was
  pinned.
- Upstream TTS behavior was preserved during conflict reconciliation:
  provider priority, MiniMax endpoint and credential resolution, scrubbed
  subprocess credentials, streaming speech dispatch, and expanded built-in
  voice/model catalogs remain present alongside plugin streaming and custom
  provider support.
- The exact reconciled Hermes/Desktop layer is recoverable from
  `backup/final-latest-nous-reconciled-20260729-014153` at
  `e0abf3b5e64b29a2db4535fda8428e5d805fe053`. Visible `main` remains on the
  pinned upstream commit with 156 ordinary local changes, nothing staged, and
  no unmerged paths.
- Consolidated Desktop TypeScript typecheck passed. All 31 changed Desktop
  Vitest files passed, 398 tests total, with four workers.
- Changed Python source compiled through the Windows/AppData venv. A focused
  import smoke confirmed the upstream provider-priority and MiniMax runtime
  contracts plus the local plugin streamer and enhanced `speak_text` surface.
- Desktop `npm run pack` passed and replaced the exact regular shortcut target.
  `Hermes.exe` is 214,281,216 bytes with SHA-256
  `988697015FF83469A9C394B3EBE2FC42D80668593EF4D5741F16FF7F1836925A`.
- Launching `C:\Users\btgil\Desktop\Hermes.lnk` produced a visible packaged
  process, emitted `HERMES_BACKEND_READY port=63214`, and returned HTTP 200
  from both `/api/status` and `/api/health`. Dashboard and storage are healthy;
  the overall degraded label only reflects the separately stopped messaging
  gateway.
- The exact Mobile follow-up layer is recoverable from
  `backup/mobile-final-reconciled-20260729-014135` at
  `d83382e97186b5d526a3bc27c250bd365526753a`. Visible Mobile `main` remains on
  the private fix-branch tip with its four follow-up files left as ordinary
  local changes.
- Windows consolidation of private branch
  `origin/codex/fix-live-transcript-order` at `acc940c58a1605b04312d1acfdedc9ab6277e691`:
  fast-forwarded locally without pushing private `origin/main`.
- Consolidated full Mobile client Vitest suite: 20 files and 100 tests passed.
- Consolidated Mobile TypeScript typecheck: passed.
- Consolidated focused server-plugin unittest suite on Windows: 19 tests run,
  14 passed, and 5 platform-specific tests skipped.
- Consolidated Python compile over `server-plugin`, `tests/server`,
  `scripts/mobile_host.py`, and `qwen-service/src`: passed.
- Consolidated Android `assembleDebug` with Android Studio JDK 21: passed.
- Consolidated debug APK size: 5,496,505 bytes.
- Consolidated debug APK SHA-256:
  `6B35AA0544DF91D13ED2C8FB377A5FE0A762C071257DC0A3579BE89D458DBE3C`.
- Transcript-order regression tests prove both prior failures: late activity
  could remain below the final response, and resumed thinking mutated the
  pre-tool reasoning block. The corrected focused suite passes 27 tests.
- Direct-auth and core-gateway tests cover unlocked token mode, saved gated
  sessions, native host sign-in, direct plugin-404 fallback, and fail-closed
  plugin errors.
- Full Mobile client Vitest suite: 20 files and 100 tests passed.
- Mobile TypeScript typecheck and Vite production build: passed.
- Capacitor Android sync: passed and copied the corrected web bundle into the
  native project.
- Focused server-plugin unittest suite: 19 tests passed.
- Android native source passed a Java syntax parse after normalizing the file's
  existing Java 9 try-with-resources shorthand for the Java 8 parser.
- Android `compileDebugJavaWithJavac` could not start on this Mac because neither
  a system Java runtime nor Android Studio's bundled JDK is installed; the
  existing APK was not replaced and does not contain these latest changes.
- macOS cross-platform host focused tests: 9 passed.
- macOS launchd agent `dev.hermes.mobile-server`: running.
- Loopback backend `127.0.0.1:9129` and validating proxy
  `127.0.0.1:9130`: listening.
- Authenticated tailnet HTTPS health: `ok`; compatibility: `compatible`;
  contract version: 1.
- Authenticated one-use-ticket WSS probe emitted `gateway.ready` and returned
  `session.list` successfully through the real MagicDNS endpoint.
- The authenticated live Mobile host catalog returned six usable providers.
  F5-TTS reported 12 voices, Kokoro reported 68 voices, and Qwen reported the
  user's existing saved voice; the earlier empty Mobile picker was therefore
  isolated to the Android WebView datalist presentation.
- Mobile voice-picker/custom-library focused tests: 3 files and 9 tests passed.
- Full Mobile client Vitest suite: 19 files and 90 tests passed.
- Mobile TypeScript typecheck and Vite production build: passed.
- Capacitor Android sync: passed with the new voice library bundle.
- Android `assembleDebug` with Android Studio JDK 21: passed, including the
  native per-request timeout support.
- Voice-library debug APK size: 5,496,505 bytes.
- Voice-library debug APK SHA-256:
  `996ECD835E0FE70403AC6E780AA58E5EEC7BDE0C6254EA400D81495FDD41024E`.
- Live generic catalog on the dedicated authenticated host returned 68 Kokoro
  voices, 12 F5-TTS voices, and Qwen clone/design/delete capabilities.
- Qwen clone smoke: created a reusable clone through Hermes from a 152,810-byte
  Kokoro reference WAV, synthesized a 135,576-byte RIFF/WAV through
  `/api/audio/speak`, and deleted the test voice.
- Qwen VoiceDesign smoke: created a reusable designed voice from an instruction,
  synthesized a 133,006-byte RIFF/WAV through `/api/audio/speak`, and deleted
  the test voice.
- Provider-scoped dispatch regression proof: with the stale Kokoro root voice
  deliberately present, the configured F5-TTS `blitz` voice synthesized a
  116,618-byte RIFF/WAV through `/api/audio/speak`.
- Saved Qwen preview regression proof: with the same stale Kokoro root voice
  deliberately present, the user's existing saved Qwen voice synthesized a
  107,948-byte RIFF/WAV through `/api/audio/speak`. The saved voice remained in
  the Qwen catalog and was not recreated or modified.
- AppData logs contain no new F5-TTS 500 or Qwen 404 after those regression
  requests. Both providers emitted successful `TTS audio saved` entries.
- The exact regular `Hermes.lnk` target was restarted after the dispatch fix.
  Its new packaged process spawned one Desktop backend and emitted a fresh
  `HERMES_BACKEND_READY` marker.
- Qwen runtime reports PyTorch 2.11.0+cu128, torchaudio 2.11.0+cu128, CUDA
  available, and NVIDIA GeForce RTX 3080 Ti.
- Desktop focused Vitest: 4 files and 76 tests passed.
- Desktop built-in/custom voice-catalog regression suite: 4 files and 77 tests
  passed after adding the partial-live-catalog merge case.
- Desktop TypeScript typecheck: passed.
- Focused Desktop TTS files lint with zero errors. The broader dirty tree still
  has an unrelated pre-existing import-order lint error in
  `pet-commentary-event.test.tsx`.
- Desktop `npm run pack`: passed and produced the exact regular shortcut
  target.
- Desktop shortcut and packaged executable SHA-256 matched:
  `C57AF906B4DE6D814103B50B1A09CED868C7E3E5E73867874F4306C685E49C9F`.
- Shortcut launch resolved to
  `C:\Users\btgil\AppData\Local\hermes\hermes-agent\apps\desktop\release\win-unpacked\Hermes.exe`
  and the backend reported ready on loopback.
- The launched Desktop backend's custom-provider catalog route returned the
  expected unauthenticated 401 rather than a missing-route 404, confirming the
  packaged runtime exposes the new authenticated API.
- `python -m unittest discover -s tests/server -v`: 10 passed.
- `python -m compileall -q server-plugin tests/server`: passed.
- `npm run typecheck`: passed.
- `npm test`: 18 files and 88 tests passed.
- `npm run build`: passed.
- `npm audit`: 0 vulnerabilities.
- `cap sync android`: passed.
- Android `assembleDebug` with Android Studio JDK 21: passed.
- Private-repository CI run `30372499457` passed both the client and
  server-plugin jobs for reconnect-fix commit `a786873`.
- Capacitor sync registered `@capacitor/app` 8.1.1, and APK inspection confirms
  `com.capacitorjs.plugins.app.AppPlugin` plus the foreground-reconnect bundle.
- Debug APK size: 5,496,505 bytes.
- Debug APK SHA-256:
  `996ECD835E0FE70403AC6E780AA58E5EEC7BDE0C6254EA400D81495FDD41024E`.
- Physical-device ADB identified three
  `ForegroundServiceDidNotStartInTimeException` crashes at 22:38, 01:34, and
  01:38, all naming `dev.hermes.mobile/.HermesConnectionService`.
- The replacement APK installed successfully in place at 01:52:59. Its first
  launch stayed alive as PID 12811, and Android reported the connection service
  as `isForeground=true`, notification ID 2201, service type
  `remoteMessaging`.
- PID 12811 later exited at 01:55:57 after WebView logged that renderer PID
  12839 was killed by OOM or update and that the unhandled renderer loss was
  killing the application. The process ended through `SIGKILL`, not a new
  foreground-service exception.
- The renderer-recovery replacement APK installed successfully in place at
  02:04:24. Its SHA-256 is the current debug APK hash above. It launched as PID
  30164 with a correctly promoted `remoteMessaging` foreground service, no full
  gateway payloads in Logcat, and no new Android exit record during the initial
  live interval.
- The final scroll and event-order APK installed successfully in place at
  02:22:36 and launched as PID 17819. Android reports
  `HermesConnectionService` as `isForeground=true`, notification ID 2201, and
  service type `remoteMessaging`.
- PID 17819 crashed at 08:59:48 after the overnight idle/resume path. Android's
  exact exception was `ForegroundServiceDidNotStartInTimeException` naming
  `dev.hermes.mobile/.HermesConnectionService`. The WebView renderer ended only
  after the application process and was not the cause.
- The first reconnect-corrected APK installed in place and launched as PID
  26645. Android reported the service as `isForeground=true`, notification ID
  2201, and service type `remoteMessaging`; it remained alive beyond the
  five-second deadline with no new crash entry during the initial interval.
- The final repository variant uses the foreground-service entry point for
  every retain and passes Android `assembleDebug`. It has not been pushed onto
  the phone because no further phone interaction is requested right now.
- `scripts/test-mobile-server.ps1` verified the running scheduled task,
  loopback backend and proxy, authenticated `ok` health, `compatible` contract
  version 1, and configured Tailscale Serve without printing the credential.
- Every checked-in PowerShell script passes the PowerShell parser.
- Packaged manifest inspection confirms `WAKE_LOCK`, `FOREGROUND_SERVICE`, and
  `FOREGROUND_SERVICE_REMOTE_MESSAGING`, plus the non-exported
  `HermesConnectionService` with the `remoteMessaging` service type.
- APK inspection confirms the support-site `nous-sidecar-128.png` asset and
  every mdpi through xxxhdpi legacy, round, and adaptive launcher resource are
  packaged.
- Fresh 360 by 800 browser renders confirm the polished default theme, fixed
  composer, aligned five-item bottom navigation, Reader, and Files layouts.
  A hard reload produced no console errors or React hook-order warning.
- A real 360 by 800 Chrome appearance pass selected all eight local choices.
  Hermes Mobile and the six Desktop-matched presets produced their expected
  computed background, surface, and accent tokens; Follow host safely used the
  mobile fallback while disconnected. Every choice persisted under the current
  connection ID, the document stayed 360 px wide, and Chrome logged no errors.
- A 360 by 800 long-directory fixture produced a 512 px file viewport with
  1,730 px of scroll content. A real scroll gesture advanced the viewport from
  position 0 to 480 while the heading, path bar, and bottom navigation remained
  fixed.
- A 360 by 800 Reader stress fixture kept the 360 px document scroll width,
  the Reader card at right edge 333 px, its prose at right edge 320.5 px, and
  its long voice selector at right edge 320.5 px. Long speaker names, prose,
  and an unbroken URL rendered inside the card.
- A 360 by 800 Chat fixture kept both message bubbles and the Copy plus Listen
  action rows inside the viewport with a 360 px document scroll width.
- A 360 by 800 live-activity fixture rendered actual reasoning, tool progress,
  input, and output with zero `<hr>` rows, two visible tool detail bodies, and
  a 360 px document scroll width.
- A 360 by 800 long-tool fixture verified that collapsed mode opens on click,
  hidden mode retains the labeled tool card without payload text, and expanded
  mode restores the full detail region. The detail viewport measured 480 px
  high against 3,103 px of content and scrolled independently from position 0
  to 420 with `overflow-y: auto` and `touch-action: pan-y`.
- A fresh 360 by 800 collapsed-tool fixture rendered running, completed, and
  summary-only tools as 117 to 182 px readable cards at 328 px wide. The cards
  retained status plus progress/input/output previews, the document remained
  exactly 360 px wide, tapping the completed terminal card opened a 327 px full
  detail region, and the browser logged no warnings or errors.
- A 360 px real-Chrome overflow fixture reproduced the live shrink before the
  fix: four 63 px expanded tool cards collapsed to 2 px each as reasoning
  grew. With non-shrinking transcript rows, all four remain 63 px while the
  transcript scroll height grows to 1,008 px inside its unchanged 560 px
  viewport.
- A 360 by 800 Reader fixture centered a selected Start here block, kept the
  document at 360 px wide, and confirmed a manual scroll held its position
  while playback advanced and exposed Resume follow.
- `git diff --check`: passed.
- Live AppData `hermes serve` REST probe: authenticated endpoints returned 200.
- Live WebSocket probe: unauthenticated connection rejected, authenticated
  connection emitted `gateway.ready`, and `session.list` returned successfully.
- Live mobile ticket probe: 30-second ticket accepted once and replay rejected.
- Live tailnet HTTPS probe: unauthenticated request returned 401 and an
  authenticated capability request returned `compatible`.
- Live tailnet WSS probe: connected through Tailscale Serve, emitted
  `gateway.ready`, and returned `session.list` successfully.
- Live authenticated voice loop: `/api/audio/speak` synthesized an MPEG reply
  through xAI and `/api/audio/transcribe` transcribed that audio through OpenAI
  as `Hermes Mobile Voice Test`.
- APK inspection confirms the packaged app requests
  `android.permission.RECORD_AUDIO`.
- Session credential ACL grants full control only to the current Windows user.

Known constraints:

- The bundled Alien Child sprite and local interaction lines work without pet
  gateway methods. Mobile now detects that boundary per connection and stays
  visual-only without invoking unsupported pet methods. AI generation, host
  personality discovery, durable commentary recording, sidechat, and
  auxiliary-model assignment still require the connected Hermes host to expose
  the existing pet commentary and model/config APIs.
- Following Desktop pet speech requires the rebuilt Desktop to publish the
  active profile's `pet.speech` record. Older/cloud hosts without that shared
  record fall back to host-default speech; Independent Mobile pet voice remains
  available.
- The initial mobile gateway delegates to Hermes's current dispatcher and
  transport implementation through a compatibility adapter.
- Complete cross-process run observation is outside the first milestone.
- The browser client does not persist authentication tokens.
- Native connections currently require HTTPS/WSS.
- The physical phone now has the current repository APK, including transcript
  interleaving, late-event reconciliation, Docker direct auth, pet repairs, and
  the Mobile Companion foundation. Long-output, long-TTS, screen-off, and
  repeated app-switch acceptance remain user-driven during ordinary use.
- If the older singleton build already overwrote a Tailnet connection's stored
  URL, the URL cannot be reconstructed and must be entered once. The new build
  can recover a single orphaned Keystore credential association, and future
  hosts retain separate registry entries.
- Native microphone capture and Cloud sign-in require interactive phone state,
  so those remain user-driven physical-device acceptance paths even though ADB
  is connected for crash and lifecycle observation.
- Android foreground recovery and foreground-service retention are covered by
  focused client tests, manifest inspection, and a successful native build,
  but real screen-off timing, device-specific power management, and physical
  app switching still require the phone check.
- The prior tab-return foreground-service crash, the separate unhandled WebView
  renderer exit, and the overnight reconnect promotion race are all fixed in
  the repository. Repeated background, screen-off, and long-TTS evidence is
  still required before final physical-device acceptance, but no immediate
  user-driven test is requested.
- Core `cron.manage` currently exposes structured list, add, pause, resume, and
  remove actions. Edit and run-now are not part of that RPC and are not claimed
  by the Milestone 5B client.
- Hermes's durable `session.history` intentionally omits full historical tool
  payloads. The app preserves details it received live across completion,
  rehydration, and same-session selection, and renders a useful labeled summary
  for older or fully missed tool rows, but true post-process replay of every
  tool payload still requires Milestone 3's mobile event journal.
- The mobile file browser mirrors Desktop's remote-safe list, read, and
  write-text path, and now downloads through the authenticated data route plus
  Android's system save picker. Electron-local rename, delete, reveal, and
  other operating-system file actions are not exposed by the remote API and
  are not claimed.
- Inline remote image/audio/video preview currently uses Hermes's authenticated
  data-URL route and inherits its 16 MiB response limit. Larger media remains
  downloadable but needs a future authenticated streaming seam for inline
  playback.
- Full podcast export currently assembles a mono WAV in client memory before
  opening the save picker. That keeps provider ordering and fallbacks
  deterministic, but very long renders still need physical-device memory and
  cancellation acceptance before this is treated as an unbounded export path.
- Android share routing is covered by focused client behavior tests, native
  Java compilation, packaged-manifest inspection, and phone-width Chrome
  rendering. Actual source-app content-URI grants, Android chooser behavior,
  Cloud target switching, system document destinations, and byte-for-byte
  downloaded-file acceptance remain physical-device checks.
- Long TTS chunking and lookahead, provider selection, buffered multivoice
  playback, Reader auto-scroll/manual takeover/section restart, voice
  fallbacks, Android clipboard behavior, and remote file saves are covered by
  focused client behavior tests, phone-width browser rendering, and successful
  production builds, but still require the physical-phone and configured-
  provider acceptance pass.
- A foreground service and partial wake lock substantially improve connection
  survival, but Android force-stop, process termination, and some device power
  policies can still end the process. Full recovery after process death remains
  Milestone 3 and Milestone 8 work.
- Android assistant-role integration is now planned through an explicit
  `ACTION_ASSIST` entry first, with a full lightweight
  `VoiceInteractionService` deferred until that path is proven. Broad
  AccessibilityService observation is not part of the current app; any future
  accessibility integration must be tied to a concrete user-triggered
  assistive workflow and disclose window-content access separately.
- Qwen's first use downloads and warms the selected model. VoiceDesign uses the
  larger 1.7B model to create a reusable reference, then unloads it; normal
  playback uses the 0.6B Base clone model. The first request is therefore much
  slower than later playback.
- The Qwen service and provider adapters are local experiments. They are
  intentionally owned by this standalone repository and are not an upstream
  Hermes product claim.
- The machine default Java 25 is too new for Gradle 8.14.3; Android builds use
  Android Studio's bundled JDK 21.
