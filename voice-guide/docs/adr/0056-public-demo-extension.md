# ADR-0056: The public demo is an MV3 extension that runs the shared loader

- Status: Proposed (built 2026-11-13; accepted when it runs on the live pages against the public gateway)
- Date: 2026-11-13
- Area: carrier, distribution; revisits ADR-0026's rejected "extension" option for a demo audience (not customers)
- Owner decision: 2026-11-13, option B of the deployment note

## Decision

1. `extension/` holds the sources; `npm run extension:build -- --gateway https://<public gateway>` writes `extension/dist/chrome` (Chrome, Edge, Brave, Opera, Arc; MV3 service worker, Chrome 111+) and `extension/dist/firefox` (Firefox desktop and Android 128+). Both use the same files.
2. The background script registers `loader.js` as a **MAIN-world content script at `document_start`** on the site's two origins (`scripting.registerContentScripts`), so the loader and its storage keeper run before Vodafone's scripts, in the page's own world, exactly as the demo browser's `addInitScript`. The popup turns it off and on for the browser.
3. Permissions: `scripting`, `storage`, and the two origins only. No keys or secrets in the extension; the site key is public.
4. Name and listing: "Voice guide preview (independent prototype)", unlisted, with a line that it is not made by, endorsed by or affiliated with Vodafone, and the privacy line about the voice and questions.

## Consequences

- Page watch is not available (a service worker must come from Vodafone's origin); the public gateway turns it off.
- Chrome on Android and iOS, and Safari, are not reached (Safari would need an Xcode-wrapped App Store app).
- The extension follows the site's URL; a new Vodafone origin needs a new build.

## Pilot knobs

`--gateway`, `--site`, `--version`; the popup's on/off.

## Revisit when

Vodafone adds mode A (the extension is then only for testers); a store review asks for changes; Safari is needed.
