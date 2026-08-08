# Validation history archived 2026-08-08

Moved from `STATUS.md` when the active ledger approached its 24,000-character
bound. These are prior Desktop, speech, Reader, and Mobile artifact results;
the current nearby-jump artifact remains in the active status.

- Desktop speech/Reader slice: 3 focused files and 20 tests passed; the broader
  UI run passed 54 files and 409 tests before the final queue-ID tightening.
  Desktop ESLint/Prettier checks, TypeScript typecheck, production build, and
  unpacked Windows packaging passed after that tightening.
- The prior Mobile pet/voice slice passed 75 focused tests and its full client
  suite passed 54 files and 271 tests. That revision also passed TypeScript,
  production build, Capacitor sync, Android assembly, replacement installation,
  and cold-launch smoke before the media/Reader follow-up below.
- The follow-up prepared-input regression slice passes 3 files and 32 tests,
  including the early-consumer/final-close case; TypeScript typecheck also
  passes after the fix.
- The short-opening/overlay follow-up passes 3 focused files and 44 tests,
  including the two-sentence startup rule; TypeScript typecheck, production
  build, Capacitor sync, and Android debug assembly pass.
- The media/Reader follow-up passes 3 focused files and 8 tests; the complete
  Mobile client suite passed 54 files and 272 tests. The subsequent speech-
  deduplication slice passes 2 files and 33 tests, and the complete client suite
  now passes 54 files and 275 tests. TypeScript typecheck, production build,
  Capacitor sync, and Android debug assembly pass.
- Desktop commentary ordering passes 3 focused files and 17 tests. Desktop
  TypeScript typecheck, changed-file ESLint with zero errors, Python module
  compilation, production build, and unpacked Windows packaging pass. The
  backend-focused Python regression was added but not executed under the local
  no-Python-tests safety rule.
- Python prompt guidance compiled and an import smoke check confirmed both the
  Desktop and `hermes-mobile` Reader handoff hints.
- Scoped `git diff --check` and unmerged-entry checks pass in both repositories.
- Earlier verified pet/voice Mobile debug APK:
  `client\android\app\build\outputs\apk\debug\app-debug.apk`
  (127,129,674 bytes, SHA-256
  `FE23BB8D991B12C4146978EAB7A36488B04E678841D9A70FFF68ADBA319EA051`).
- Current Desktop test executable at that point:
  `..\hermes-agent\apps\desktop\release\win-unpacked\Hermes.exe`
  (214,281,216 bytes, SHA-256
  `5C82EB0954B6BA9ED5D342393A2AE4E1AB3AA26B3779C46D7AF722DCA1A7E016`).
- The same verified Desktop build occupied the normal stable
  `apps\desktop\release\win-unpacked\Hermes.exe` target used by the Desktop,
  Start-menu, and taskbar shortcuts. Launching the Desktop shortcut produced a
  visible responding window, a fresh `HERMES_BACKEND_READY`, and `ok` dashboard
  and storage status.
- The speech-deduplication APK was replacement-installed on the intended
  Samsung SM-S918U at version name 1.0/version code 1 and package update time
  `2026-08-01 14:00:40`. A cold launch completed in 1.003 seconds, left the app
  process running in the foreground, and its captured process-log tail
  contained no error-priority record, fatal exception, or ANR signature.
