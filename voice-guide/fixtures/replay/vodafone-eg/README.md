# Replay fixture: vodafone-eg

Rendered HTML of 14 public pages captured on 2026-10-23 (signed out, no cookies), with the site's stylesheets and fonts. Served by the demo browser's replay mode (`npm run demo:live -- --replay`) and by `tests/e2e/live-replay.e2e.test.ts`. Made by `tools/live-crawl/make-replay.ts`.

Private repository only: the content, stylesheets and fonts belong to Vodafone Egypt.

- https://web.vodafone.com.eg/ar/home
- https://web.vodafone.com.eg/en/home
- https://web.vodafone.com.eg/ar/mobile-internet-bundles
- https://web.vodafone.com.eg/en/mobile-internet-bundles
- https://web.vodafone.com.eg/ar/vodafone-red1
- https://web.vodafone.com.eg/en/vodafone-red1
- https://web.vodafone.com.eg/ar/wireless-net
- https://web.vodafone.com.eg/en/wireless-net
- https://web.vodafone.com.eg/ar/services
- https://web.vodafone.com.eg/en/services
- https://web.vodafone.com.eg/en/promotions
- https://web.vodafone.com.eg/ar/vodafone-cash
- https://web.vodafone.com.eg/en/vodafone-cash
- https://web.vodafone.com.eg/spa/storeLocator

## The page watch's baseline (ADR-0078)

This capture of 2026-10-23 is the page watch's demo baseline.
The two demo cards (Home > Other services > Internet Bundles, and Services > Vodafone Cash > Vodafone Cash) and the pages they open are hashed from it by `npm run watch:baselines` into `experiences/src/watch/demo.js`.
Never overwrite or re-capture this folder. Add a new dated capture folder instead, as `vodafone-eg-2026-11-12` was.
The name `vodafone-eg` is kept on the owner's decision of 2026-11-18 (Q8).
