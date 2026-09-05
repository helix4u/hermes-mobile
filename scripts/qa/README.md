# Incremental Mobile regression checks

Run from the Mobile repository. No new browser dependency is downloaded by these
scripts. Device and hook runners accept `--playwright-package <package.json>`
for an existing package that has Playwright installed (for example the existing
Playwright CLI package), or use a locally installed `playwright` dependency.

```text
npm run test:ui:report
npm run test:ui:focused -- --out <private-run-directory>
npm run test:ui:voice -- --playwright-package <package.json> --out <private-run-directory>
node scripts/qa/pet-sheet-smoke.mjs --playwright-package <package.json> --out <private-run-directory>
npm run test:ui:device -- --device <authorized-serial> --adb <adb-executable> --playwright-package <package.json> --out <private-run-directory>
```

The isolated hook pass defaults to installed headless Edge; `--channel` can
select another installed Playwright browser channel. It imports the real hook,
but substitutes microphone, peer connection, gateway, and SDP exchange. All
browser network access is limited to the local fixture server. It cannot prove
real speech, sound, provider latency, or background audio. Initial Vite dependency
compilation has a separate navigation budget, not a voice-performance threshold.

The device pass requires an already-open Chat view in the debug Android app.
It temporarily opens the voice page and settings, tests landscape and native
Back, then restores the original rotation preferences and menu visibility.
It does not reload, fill a draft, submit, start voice, or stop a turn.
Add `--allow-preference-cycle` only for an authorized idle-device test;
it cycles Replies and During turn and restores them in cleanup. Wake is never
cycled live because Auto-send can activate microphone-driven submissions.
Use the isolated control tests for that transition. A currently active voice
call or turn disables preference cycling. The device stays open after detach.

Each run emits JSON plus Markdown ending in a bug TODO. Skips are not passes.
Keep all screenshots and live reports private; the default focused-output
directory is ignored. Reports store fixed check IDs, geometry, and counters,
not conversation snapshots, credentials, device addresses, or customer text.
The explicitly private phone screenshot may contain visible chat, so never
copy it into a public PR. Keep the defect log outside the public repository.

`mobile-ui-cases.json` maps UI checks to owners and reasons. Update affected
checks and their reason when behavior changes. Hook expectations live beside
their IDs in `realtime-hook-smoke.mjs`; behavioral unit tests remain near their
owning modules. Preserve old failing reports and create a new output directory
for every retest. Do not weaken a valid invariant to make a change green.
