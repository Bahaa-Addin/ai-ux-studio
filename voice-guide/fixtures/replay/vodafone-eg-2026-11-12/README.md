# Vodafone pages of 2026-11-12 (Arabic, four pages)

A second date of four pages the replay (`../vodafone-eg`, 2026-10-23) also has, for checking that what the experience layer reads stays the same across dates: a Pocket sticker saved on one date must find its card on the next (live plan phase 3, voice-guide ADR-0051; open issue O26).

- **Source:** the demo browser's HTTP cache on the owner's Mac (`data/demo-profile`, git-ignored), from runs on 12 Nov 2026 between 08:23 and 10:10 GMT. Signed out, public pages, as Vodafone's server sent them (raw HTML, before any script ran; the replay's 2026-10-23 pages are rendered). Each response had `Cache-Control: max-age=14400, public` and came from Vodafone's own cache (`X-Cache: HIT`).
- **Pages:** `/ar/home`, `/ar/mobile-internet-bundles`, `/ar/services`, `/ar/vodafone-red1` (`pages.json` has each page's `Date`).
- **Not a replay:** no assets, no `crawl.json`; only `tests/integration/live-adapter.test.ts` reads these files.
- **Checked before saving:** each is a 200 with `#main-content` and its portlets; none carries a line number or a signed-in marker.
