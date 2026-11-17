---
id: 01M731W7552PBJ9G1VADMJWAD5
order: 3000
status: current
owner: bahaa.addin@hotmail.com
summary: 'Running all five demos on Vodafone''s real pages: what the owner decided on 2026-11-10 and what is still open.'
tags:
  - way-2
  - live
  - adr-0046
paths:
  - experiences/src/host/**
---
The five demos (voice guide, Pocket, Reimagine this page, Exploration Trail, and demo 5) move off the hand-made Services clone and run on Vodafone's real pages, as one experience layer (`aixc.js`) loaded beside the guide. The direction is ADR-0046 (`voice-guide/docs/adr/0046-all-demos-live-on-vodafone-pages.md`); VoiceTut as the guide's voice is ADR-0047. The phase-by-phase plan is the owner's edited handoff, `docs/handoff/live-demos-way2.md` at the repository root. Work happens on the branch `feature/live-way2`.

## Decided on 2026-11-10

[The three in-flight branches land as they are, before the clone folder moves to `experiences/`, in the order Pocket actors, Pocket portal, Reimagine template credits, each tested before the next.]{decided by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com on=2026-11-10 over="leaving the unfinished actors branch out; moving the folder first and landing the branches later"} [BB](https://console.nimbalyst.com/app/cite/claude-code/ada43762-6be1-4320-adb7-6f662fece6a2/answer/toolu_017DnRz6fJS8TUFWFACUUpkw%7E0 "by='Bahaà Addin Balashoni' email=bahaa.addin@hotmail.com at=2026-11-10T15:35:29.822Z ctx='answering Phase 0 %28D5%29: the three in-flight branches are each a single commit titled…' quote='Merge all three %28Recommended%29'") Landing them first keeps the move from turning into rename conflicts in `pocket.js`, which all three edit.

[The template-credits branch lands through a copy whose commit messages have the "Co-Authored-By: Claude" trailers removed, with the same content, authors and dates.]{decided by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com on=2026-11-10 over="merging the commits with their trailers; squashing them into one commit"} [BB](https://console.nimbalyst.com/app/cite/claude-code/ada43762-6be1-4320-adb7-6f662fece6a2/answer/toolu_01KhqnyUXkWisbnEWLZQiJ1f "by='Bahaà Addin Balashoni' email=bahaa.addin@hotmail.com at=2026-11-10T15:38:18.850Z ctx='answering Four commits on feature/aixc-template-credits %288fcad57, f64a95d, bfcb9f8,…' quote='Clean copy, then merge %28Recommended%29'") His rule is that Claude is never an author, co-author or attribution in the history; those commits had never been pushed.

[The guide's trail host interface changes once, to version 2, carrying both what visitors' questions were about (for demo 5) and a consent-gated `seed()` that loads the demo kit's sample journey.]{decided by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com on=2026-11-10 over="a version 2 for questions now and a version 3 for seed() later"} [BB](https://console.nimbalyst.com/app/cite/claude-code/ada43762-6be1-4320-adb7-6f662fece6a2/answer/toolu_017DnRz6fJS8TUFWFACUUpkw%7E2 "by='Bahaà Addin Balashoni' email=bahaa.addin@hotmail.com at=2026-11-10T15:35:29.822Z ctx='answering Both plans change the guide%27s trail host interface: the revamp%27s v2 adds %22what…' quote='One v2, numbered in order %28Recommended%29'") Both plan documents had claimed ADR-0048; ADRs are numbered in the order they are written, so the `aixc.js` loader (phase 1) takes 0048 and trail host version 2 the next number.

[VoiceTut's speech service is built and tested against a stand-in server until the owner redeploys the Modal app and sets `VG_VOICETUT_URL`; then it is measured live and he picks the voices by ear.]{decided by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com on=2026-11-10 over="installing the Modal command line on the demo Mac; putting VoiceTut off until after phases 0 to 2"} [BB](https://console.nimbalyst.com/app/cite/claude-code/ada43762-6be1-4320-adb7-6f662fece6a2/answer/toolu_017DnRz6fJS8TUFWFACUUpkw%7E3 "by='Bahaà Addin Balashoni' email=bahaa.addin@hotmail.com at=2026-11-10T15:35:29.822Z ctx='answering Phase 1b %28D8%29: VoiceTut on Modal needs %60modal deploy…' quote='I%27ll deploy; build vs stand-in %28Recommended%29'")

[On Vodafone's live pages the Pocket may still lift Vodafone's accessibility button up the right-hand column, as it does on the clone, in the owner's demos.]{decided by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com on=2026-11-10 over="never moving the button on live pages and moving the Pocket's controls around it instead"} [BB](https://console.nimbalyst.com/app/cite/claude-code/ada43762-6be1-4320-adb7-6f662fece6a2/answer/toolu_019UwtrYaZmxYNSLzKybukAo%7E2 "by='Bahaà Addin Balashoni' email=bahaa.addin@hotmail.com at=2026-11-10T19:29:35.611Z ctx='answering On Vodafone%27s live pages, AGENTS.md §4.6 and the plan%27s §3.7 say Vodafone%27s…' quote='Allow the lift on live'") It is an exception to AGENTS.md §4.6 (never hide, cover or change the accessibility widget), for his demos only, to be written into §4.6 and an ADR when the Pocket reaches live pages (phase 3); the button stays usable and is never covered. On 2026-11-14 the owner replaced this with no lift at all: the Pocket's corner moved to the bottom-left of live pages instead (ADR-0064, handoff of 2026-11-17 §8).

[On Vodafone's live pages Reimagine offers only its ready-made experiences and the built-in layout: no Gemini call and no key field, and the streaming experience uses Vodafone's own bold face instead of Google Fonts.]{decided by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com on=2026-11-10 over="typed prompts to Gemini through the gateway; calling Gemini from the page as on the clone"} [BB](https://console.nimbalyst.com/app/cite/claude-code/ada43762-6be1-4320-adb7-6f662fece6a2/answer/toolu_019UwtrYaZmxYNSLzKybukAo%7E3 "by='Bahaà Addin Balashoni' email=bahaa.addin@hotmail.com at=2026-11-10T19:29:35.611Z ctx='answering Reimagine%27s typed prompts go from the browser to Google Gemini with the page%27s…' quote='Templates only on live %28Recommended%29'") A typed prompt would otherwise send the page's content from Vodafone's origin to Google, against the plan's rule that nothing new leaves the browser.

What demo 5 becomes is on [Your RED world (demo 5)](Your%20RED%20world%20(demo%205).md "id=01M6ZZKVJGC8VJ25Y9SBQZ62HN").

## Built differently from the plan in phase 2 (2026-11-11)

These are the agent's design choices, not the owner's decisions; they are recorded in ADR-0049 (`voice-guide/docs/adr/0049-live-adapter-ids-coverage-and-page-map.md`, Proposed until the live checks pass).

- The plan's §3.4 said to tag Vodafone's portlets with `data-vg-destination`. Instead each section's knowledge destination is kept on the layer's own model, because the trail's resolver takes such a tag before anything else and a tag on a whole portlet would hide the cards and pictures inside it. The layer asks a new gateway endpoint, `GET /v1/page-map`, which answers only when the site config turns the layer on.
- Item ids come from the first unique of link, picture name, title, tab and place, not the link alone, because links collide on real pages. On the bundles page only 2 of 20 ids are the same in English and Arabic, so a Pocket item saved there does not carry across languages (open issue O26).

**The next knowledge refresh will be held for review, and that is expected.** The crawler now starts its locators at Vodafone's portlets instead of the column's nth portlet, so the first `npm run sync` changes about two thirds of the destinations and renames 126 of them. The runbook's §5 (`voice-guide/docs/ops/runbook.md`) says what the reports should show, and that the experience profile must be rebuilt after activating.

## The live review's fixes (2026-11-17)

On 2026-11-17 the floating-control and motion checks were run again on the real site (Google Chrome, public pages, banner never answered). Both passed their assertions, but the screenshots confirmed most of the review panel's findings (handoff of 2026-11-17 §5). The lead session then built fixes, each with a failing test first. These are the agent's design choices, not the owner's decisions; they go into ADR-0075:

- Our bold and light words fell to a system font on themes that declare only Vodafone's regular faces (maintheme on home; static-lite-theme on bundles, Wireless Net and promotions). The Pocket's stacks now add aliases to Vodafone's own bold and light files from its static theme, on Vodafone's origin, after the page's own names. No font file is shipped. The album's own headings draw in these stacks instead of the theme's heading rules.
- While the album shows, `#main-content` stays laid out (no height, transparent, inert) instead of `display: none`. Owl's AutoRefresh had faded the carousels out after every close.
- The turning sheet is cut at the bottom of Vodafone's header on every frame, and its copy hides what is fixed on the live page: the header no longer shows twice, nor goes missing.
- The portal keeps a classic scrollbar's gutter, so nothing moves sideways. Its falling wall hides whatever the page keeps off screen (the skip link, the mobile menu).
- At scroll 0, chips on first-screen cards avoid the trail's pill and the guide's mic.
- The peel starts at the card's top-end corner (top-left in Arabic), and a long card such as the Vodafone Cash band peels across its height and shrinks to a sticker's size.
- The album's drone shows at 1366 again. The drone and the mascot make room when one of our fixed controls comes or goes mid-album, and they load at once after the portal's Back.
- The journey's memory of a page shows the page even when the trail started recording while the album covered it.
- The "Pocket it" chips load as a chunk of their own, so the Pocket's chunk is 30,118 bytes gzipped, under the owner's 32,000.

On the same day both live checks passed on the real site with these fixes in (floating: 32 cells, 0 violations; motion: whole-viewport screenshots, the carousels painted the moment the page returns). The fixes are on `feature/live-way2` in 45ee9da, 9e5a369 and 920a0be. A rest mode for the actors (finding F11) was built but is held for the owner's look review (`output/live-verify-2026-11-17/`).

ADR numbers 0068 to 0074 belong to the revamp branch (`feature/vg-revamp`, not yet merged here), so this branch's next ADR is 0075 (the revamp session, 2026-11-17).

## Phase 4 design: the owner's answers (2026-11-17)

The design pass is `voice-guide/docs/reference/live-way2-phase4-design-2026-11-17.md`. On Vodafone's pages sticky stages only work inside a scroll box of the layer's own, the bottom corners are taken by Vodafone's accessibility button, the guide's mic and the Pocket, and four saved pages pass Reimagine's gate (Services, bundles, Benefits, home).

[The reimagined view is a box in the page, as tall as the screen under Vodafone's header, with its own scroll; Vodafone's header, footer and page scroll stay untouched.]{decided by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com on=2026-11-17 over="a full-screen sheet over the page and its footer"} [BB](https://console.nimbalyst.com/app/cite/claude-code/b9cadb26-fdce-4a3a-8d61-ed661f395924/answer/toolu_01PTvjn7FU51H9P8iDYoW4Mp%7E0 "by='Bahaà Addin Balashoni' email=bahaa.addin@hotmail.com at=2026-11-17T04:26:30.867Z ctx='answering Phase 4: on Vodafone%27s pages, sticky stages only work inside a scroll box of…' quote='Box in the page %28Recommended%29'")

[Every experience keeps its buttons out of both bottom corners (bottom centre on desktop, under the title on phones), and the Pocket's resting curl hides while a reimagined view shows.]{decided by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com on=2026-11-17 over="shipping first only the experiences whose controls already fit"} [BB](https://console.nimbalyst.com/app/cite/claude-code/b9cadb26-fdce-4a3a-8d61-ed661f395924/answer/toolu_01PTvjn7FU51H9P8iDYoW4Mp%7E1 "by='Bahaà Addin Balashoni' email=bahaa.addin@hotmail.com at=2026-11-17T04:26:30.867Z ctx='answering The experiences put next/previous/pause buttons in the bottom corners, where…' quote='Safe are: Every experience keeps its buttons out of both bottom corners %28bottom centre on desktop, under the title on phones%29; the Pocket%27s resting curl hides during a view.%0A## NOTE: the Pocket CTA floating button and the curl was decided to move to the bottom left corner instead. This was decided and implemented in another Claude Code thread, and probably in another worktree. Bring that…'") He recalled the Pocket's button and curl at the bottom-left: that is ADR-0064, built on this branch in phase 3 (commit b35c6db) and measured live on 2026-11-17; no other implementation exists on any branch or worktree.

[On Vodafone's pages the experiences keep their own palettes, an owner exception to Vodafone's design language like the chip's pill, recorded in the ADR so it can be revisited.]{decided by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com on=2026-11-17 over="mapping every off-palette colour to Vodafone's tokens"} [BB](https://console.nimbalyst.com/app/cite/claude-code/b9cadb26-fdce-4a3a-8d61-ed661f395924/answer/toolu_01PTvjn7FU51H9P8iDYoW4Mp%7E2 "by='Bahaà Addin Balashoni' email=bahaa.addin@hotmail.com at=2026-11-17T04:26:30.867Z ctx='answering Reimagine%27s 13 experiences use some colours and gradients outside Vodafone%27s…' quote='Allow as an exception: Keep the experiences%27 own palettes on live pages, as an owner exception like the chip%27s pill. But record that in the ADRs; so we can revisit it later'")

[Reimagine is offered on every CMS page that passes its gate (coverage at least 0.9 and two sections with three or more items), checked on each page load.]{decided by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com on=2026-11-17 over="a fixed demo list only"} [BB](https://console.nimbalyst.com/app/cite/claude-code/b9cadb26-fdce-4a3a-8d61-ed661f395924/answer/toolu_01PTvjn7FU51H9P8iDYoW4Mp%7E3 "by='Bahaà Addin Balashoni' email=bahaa.addin@hotmail.com at=2026-11-17T04:26:30.867Z ctx='answering Which Vodafone pages should offer Reimagine? Today Services, bundles, Benefits…' quote='Every page that passes %28Recommended%29'") This answers D3.

[Phase 4a (the frame: the box, the launcher, the templates-only composer and view bar, magazine and spotlight) is built now.]{decided by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com on=2026-11-17 over="waiting"} (in a Claude Code session, 2026-11-17: "Go ahead"). The phase's ADR is ADR-0076.

[On live pages no template credit is shown; each experience adapted from a CodePen pen carries the MIT licence text and its copyright as a comment at the top of its source files.]{decided by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com on=2026-11-17 over="credit links as merged; plain-text credits"} He said the MIT licence is honoured that way, which is enough (in a Claude Code session, 2026-11-17).

[The native review of the Arabic microcopy blocks phase 4c's final live check.]{decided by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com on=2026-11-17 over="checking live before the review"} (in a Claude Code session, 2026-11-17). Who reviews it is still to be named.

[The actors' rest mode (F11) lands, after he watched the side-by-side recording.]{decided by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com on=2026-11-17 over="keeping it held"} (in a Claude Code session, 2026-11-17). It is ported onto the branch head first, since the drone's F6b fix landed after it was built.

## Still open

The handoff lists the rest (D1 to D4, D6, D7, D9) with the phase each blocks. The page watch decision (D1) depends on two documents that live in the claude.ai project "AIXC", not in this repository.
