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
---
The five demos (voice guide, Pocket, Reimagine this page, Exploration Trail, and demo 5) move off the hand-made Services clone and run on Vodafone's real pages, as one experience layer (`aixc.js`) loaded beside the guide. The direction is ADR-0046 (`voice-guide/docs/adr/0046-all-demos-live-on-vodafone-pages.md`); VoiceTut as the guide's voice is ADR-0047. The phase-by-phase plan is the owner's edited handoff, `docs/handoff/Handoff all five demos live on Vodafone's real pages (Way 2).txt`. Work happens on the branch `feature/live-way2`.

## Decided on 2026-11-10

[The three in-flight branches land as they are, before the clone folder moves to `experiences/`, in the order Pocket actors, Pocket portal, Reimagine template credits, each tested before the next.]{decided by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com on=2026-11-10 over="leaving the unfinished actors branch out; moving the folder first and landing the branches later"} [BB](https://console.nimbalyst.com/app/cite/claude-code/ada43762-6be1-4320-adb7-6f662fece6a2/answer/toolu_017DnRz6fJS8TUFWFACUUpkw%7E0 "by='Bahaà Addin Balashoni' email=bahaa.addin@hotmail.com at=2026-11-10T15:35:29.822Z ctx='answering Phase 0 %28D5%29: the three in-flight branches are each a single commit titled…' quote='Merge all three %28Recommended%29'") Landing them first keeps the move from turning into rename conflicts in `pocket.js`, which all three edit.

[The template-credits branch lands through a copy whose commit messages have the "Co-Authored-By: Claude" trailers removed, with the same content, authors and dates.]{decided by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com on=2026-11-10 over="merging the commits with their trailers; squashing them into one commit"} [BB](https://console.nimbalyst.com/app/cite/claude-code/ada43762-6be1-4320-adb7-6f662fece6a2/answer/toolu_01KhqnyUXkWisbnEWLZQiJ1f "by='Bahaà Addin Balashoni' email=bahaa.addin@hotmail.com at=2026-11-10T15:38:18.850Z ctx='answering Four commits on feature/aixc-template-credits %288fcad57, f64a95d, bfcb9f8,…' quote='Clean copy, then merge %28Recommended%29'") His rule is that Claude is never an author, co-author or attribution in the history; those commits had never been pushed.

[The guide's trail host interface changes once, to version 2, carrying both what visitors' questions were about (for demo 5) and a consent-gated `seed()` that loads the demo kit's sample journey.]{decided by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com on=2026-11-10 over="a version 2 for questions now and a version 3 for seed() later"} [BB](https://console.nimbalyst.com/app/cite/claude-code/ada43762-6be1-4320-adb7-6f662fece6a2/answer/toolu_017DnRz6fJS8TUFWFACUUpkw%7E2 "by='Bahaà Addin Balashoni' email=bahaa.addin@hotmail.com at=2026-11-10T15:35:29.822Z ctx='answering Both plans change the guide%27s trail host interface: the revamp%27s v2 adds %22what…' quote='One v2, numbered in order %28Recommended%29'") Both plan documents had claimed ADR-0048; ADRs are numbered in the order they are written, so the `aixc.js` loader (phase 1) takes 0048 and trail host version 2 the next number.

[VoiceTut's speech service is built and tested against a stand-in server until the owner redeploys the Modal app and sets `VG_VOICETUT_URL`; then it is measured live and he picks the voices by ear.]{decided by="Bahaà Addin Balashoni" email=bahaa.addin@hotmail.com on=2026-11-10 over="installing the Modal command line on the demo Mac; putting VoiceTut off until after phases 0 to 2"} [BB](https://console.nimbalyst.com/app/cite/claude-code/ada43762-6be1-4320-adb7-6f662fece6a2/answer/toolu_017DnRz6fJS8TUFWFACUUpkw%7E3 "by='Bahaà Addin Balashoni' email=bahaa.addin@hotmail.com at=2026-11-10T15:35:29.822Z ctx='answering Phase 1b %28D8%29: VoiceTut on Modal needs %60modal deploy…' quote='I%27ll deploy; build vs stand-in %28Recommended%29'")

What demo 5 becomes is on [Your RED world (demo 5)](Your%20RED%20world%20(demo%205).md "id=01M6ZZKVJGC8VJ25Y9SBQZ62HN").

## Still open

The handoff lists the rest (D1 to D4, D6, D7, D9) with the phase each blocks. The page watch decision (D1) depends on two documents that live in the claude.ai project "AIXC", not in this repository.
