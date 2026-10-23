# Demo script: the voice guide on the live Vodafone site

- Length: about 7 minutes, 8 moments.
- Setup: [`docs/ops/runbook-demo-day.md`](../ops/runbook-demo-day.md). Machine: demo browser (mode B), public HTTPS gateway, X-ray open on a second screen or toggled once.
- **Never quote prices or amounts in this script or on slides.** The guide reads them live from Vodafone's page; whatever it says on the day is the right answer.
- Each moment lists the request in both languages. The presenter uses the bold one.

## Before the audience arrives

- The demo browser is open on `https://web.vodafone.com.eg/ar/home`, cookie banner answered (reject non-essential), demo account signed in on `/spa/myHome` (then navigate back to home).
- The knowledge base was synced within the last 2 hours and activated (check `npm run kb -- --site vodafone-eg --status`).
- Microphone test: press, say "تجربة", see words and the wave, press again.

## Moment 0: "Any page is a starting point" (20s)

Say: "This is Vodafone's real website. Nothing here is a copy. I'll start on the home page, but I could start anywhere."
Show: the red microphone above Vodafone's accessibility button.

## Moment 1: Arabic, by voice, across pages (60s)

| | |
|---|---|
| Request | **"إيه أرخص باقة نت؟"** / "What's the cheapest internet bundle?" |
| The audience sees | Words appear one by one in the black bar, with the wave following the voice. The guide navigates to `/ar/mobile-internet-bundles`, opens the bundles tab, scrolls to the cheapest card, puts the red spotlight on it, and reads the amount and price **from the page**. |
| Capability | Voice-first UI (SPEC-02), routing without an LLM, plan across pages, hidden tab, live values |
| If it fails | Mis-heard: press again and repeat more slowly. Wrong page: say "باقات النت" and point at the answer. Network: switch to the clone (fallback F1). |

## Moment 2: "Subscribe to it", and it stops before paying (45s)

| | |
|---|---|
| Request | **"اشترك فيها"** / "Subscribe to it" |
| The audience sees | The guide remembers which bundle, follows its "اشترك الآن" link into `/spa/miManagement` (Vodafone's logged-in app), shows where to choose it, and stops: "دوس تأكيد بنفسك" ("Press confirm yourself"). |
| Capability | Memory of the last item, CMS → SPA, commit guard |
| Say | "It will never press a button that spends money. That's a rule in the code, not a prompt." |
| If it fails | Not signed in: the guide says it needs the person to sign in. That is also correct behaviour; say so and move on. |

## Moment 3: switch to English, inside the app (40s)

| | |
|---|---|
| Request | **"Where's the nearest store?"** / "فين أقرب فرع؟" |
| The audience sees | The guide answers in English, moves to `/spa/storeLocator` **without a page reload** (the panel and bar don't flicker), and spotlights the store search. It does not share location by itself. |
| Capability | Language switch mid-conversation, SPA route following (ADR-0030) |
| If it fails | Navigate with the link in the footer and say "the guide can also do this by voice"; continue. |

## Moment 4: reading a picture (35s)

| | |
|---|---|
| Request | Back on the bundles page: **"What does this banner say?"** / "البانر ده مكتوب فيه إيه؟" |
| The audience sees | The guide reads the Arabic text that is only inside the hero image, and says what the offer is. |
| Capability | Pictures understood at crawl time (ADR-0013), no image model call on stage |
| If it fails | Vision key missing at sync: the description falls back to the image's alt text. Say "this one comes from the image's description". |

## Moment 5: into the shop, same conversation (40s)

| | |
|---|---|
| Request | **"وريني الموبايلات"** / "Show me smartphones" |
| The audience sees | The guide moves to `eshop.vodafone.com.eg` (another website), shows the smartphones list, and the conversation history is still there. |
| Capability | Cross-origin handoff (ADR-0016) |
| If it fails | The shop is slow: wait; it resumes when the page is ready (the bar says "ثواني…"). |

## Moment 6: something the knowledge base doesn't know (45s)

| | |
|---|---|
| Request | **"Sort them from the lowest price"** / "رتبهم من الأرخص" |
| The audience sees | The fallback agent reads the shop page and uses its sort control. The X-ray shows "agent" and its steps. |
| Capability | page-agent fallback through our proxy (ADR-0017, ADR-0018) |
| Say | "Most requests are planned from the knowledge base in milliseconds. For the rest, an AI agent works the page, with the same safety rules." |
| If it fails | The agent says it can't do it here. That's the designed behaviour; show the X-ray reason. |

## Moment 7: "Tell me when it changes" (40s)

| | |
|---|---|
| Request | On `/ar/promotions`: **"عرفني لما العروض تتغير"** / "Tell me when the offers change" |
| The audience sees | The guide confirms the watch. To **show** a notification on stage, switch to the clone tab, where a teammate edits the offer (we can't change Vodafone's site on cue). The notification arrives. |
| Capability | Page watch (ADR-0023) |
| Be honest | Say that the live watch is real, and that the notification shown is triggered on the clone. |

## Moment 8: stop (10s)

| | |
|---|---|
| Request | While the guide is talking: press the microphone, or say **"خلاص"** / "stop" |
| The audience sees | It stops at once. |

## Close (20s)

Open the X-ray: "Every request shows how it was understood, how long it took, and whether a model was needed. That's what we'll tune in the pilot."

## Fallbacks

| ID | Problem | Action |
|---|---|---|
| F1 | No internet or Vodafone site down | `npm run dev -- --site vodafone-clone`; repeat moments 1, 4 and 8 on the clone; say so |
| F2 | Microphone fails | Keyboard button → type the requests |
| F3 | Gateway down | Restart: `npm run gateway` on the demo machine (local Postgres) and refresh |
| F4 | The site changed overnight and a target moved | The guide falls back to the agent or says it couldn't find it. Run `npm run sync -- --site vodafone-eg --url <page>` during a pause |
| F5 | Bot challenge page | Solve it by hand in the demo browser (a person, not the guide), then continue |
