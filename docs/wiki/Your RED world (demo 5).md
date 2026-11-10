---
id: 01M6ZZKVJGC8VJ25Y9SBQZ62HN
order: 2000
status: current
owner: bahaa.addin@hotmail.com
summary: 'Demo 5: the personal benefits layer under the Pocket — what was decided, what is still open.'
tags:
  - demo-5
  - pocket
  - personalization
paths:
  - vodafone-services-clone/src/personalization/**
  - vodafone-services-clone/tests/personalization.test.mjs
---
The fifth demo on the Services clone: a personal benefits layer that lies beneath the Pocket album and is found at its end. It was rebuilt from a phone recording of the Vodafone app's *My Lines* and *Benefits* screens (11:47), which Bahaà Addin Balashoni shared with the brief on 2026-11-09. How it behaves is written up in the clone's README, section "Your RED world"; the code is `vodafone-services-clone/src/personalization/`.

## What was decided

All from the demo 5 brief (Bahaà Addin Balashoni, in a Claude Code session, 2026-11-09).

[The RED world is a hidden extension of the Pocket page that pushes the page up as it emerges.]{decided by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com on=2026-11-09 over="a conventional bottom drawer or a modal overlay"} It opens only partway first, leaving a dedicated space above it for the status widget.

[Reaching the end of the Pocket only reveals the Dock; opening the world is always the customer's own press or pull.]{decided by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com on=2026-11-09 over="opening automatically when the page is scrolled to the end"}

[What appears at the Pocket's end is a Dock of the world's eight category icons (Explore by category and RED Lifestyle), whose hovered icon magnifies downward, toward the world beneath.]{decided by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com on=2026-11-09 over="a red pull-up bar, with the category grids inside the world; magnifying upward as the macOS Dock does"} (Bahaà Addin Balashoni, in a Claude Code session, 2026-11-09, pointing at the [Mac Dock Magnify pen](https://codepen.io/ghaste/pen/bGxWVOm "cite")). This replaced the first version's red bar the same day; an icon opens the world with its category in the spotlight (below).

[The Dock magnifies only a little (1.6x at most) and only under a mouse, so it never widens the page and a finger never sets it off.]{decided by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com on=2026-11-09 over="the pen's 2.5x magnification, which overflowed the page and misbehaved on touch"} (Bahaà Addin Balashoni, in a Claude Code session, 2026-11-09). A tap that wobbles stays a tap: a pull needs 14px of mostly vertical travel.

[When the world opens, the Dock and the widget swap places: the widget takes the Dock's spot under the album and the Dock moves down to just above the sheet.]{decided by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com on=2026-11-09 over="the Dock staying above the widget"} He asked for it as "a smart move": the Dock glides into place as part of the push, while the widget materialises, and glides back when the world closes.

[Choosing a category condenses the hero to a band about the height of the sheet's bar and swaps that category into the sheet's first section, a spotlight; the other topics wait under it as small tiles in a compact bento.]{decided by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com on=2026-11-09 over="opening the world and scrolling to the category's section in one long list of sections"} His aim: a sheet that feels focused and intriguing, not crowded with calls to action. The tiles have no buttons of their own; the topics and their ranking are in `topics.js`.

[The status widget is a separate layer with its own lifecycle, not a child of the sheet.]{decided by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com on=2026-11-09 over="placing the widget inside the bottom sheet"} His reason: it appears during the reveal, stays while the sheet expands, has its own expanded state, and could be reused elsewhere in Pocket.

[Coming back to the Pocket must land on the exact scroll position it left; he called this release-blocking.]{decided by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com on=2026-11-09 over="treating scroll restore as polish"} The first version is checked for it in four cases (from the peek, from deep in the world, with the footer on screen, after a cancelled pull), each landing on the same pixel.

[The ordering of benefits comes from a local rules engine that says what it is, not from a pretend AI backend.]{decided by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com on=2026-11-09 over="presenting the demo as AI-driven"} Each card shows the rule's reason, and "Why these?" lists what the rules noticed.

## Open questions

These are choices the build made on its own; none has been reviewed yet.

- [Should the RED world also run on the Arabic page (`/ar/`)?]{open by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com} It is English only for now; the Arabic Pocket is unchanged.
- [Should real partner photography and logos replace the drawn artwork?]{open by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com} The scenes are original SVG and partners appear as typographic wordmarks; each catalogue item's `image` field takes a real picture.
- [Should demo 5 join the Tips walkthrough of the demos?]{open by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com} Tips still introduces four.
- [Should the page keep gliding down to make room when the pointer reaches a Dock at the bottom edge?]{open by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com} Without it the magnified icons and their names fall below the screen at the usual moment of discovery; since the magnification became 1.6x the glide is about 60px, and a wheel cancels it.
- [Should opening from a Dock icon go straight to the spotlight instead of stopping at the peek?]{open by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com} It stops at the peek, so the widget is seen materialising, and only the top of the spotlight shows (about 170px on a phone); a second icon then settles the page with the Dock under the header.
- [Should the bento show all topics at once?]{open by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com} It shows the best seven and a "Show all" button, to keep the sheet short.
- [Should the browser checks become a Playwright e2e script in the repo?]{open by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com} They were run with a headless Chrome driver outside the repo; the clone's other e2e scripts use Python Playwright.

## Hard-won lesson

When the desktop app's Browser pane is hidden, the page runs in the background: `requestAnimationFrame` and `IntersectionObserver` stop, so scripted checks of motion hang or report nothing. Verify motion in a visible pane or in headless Chrome.
