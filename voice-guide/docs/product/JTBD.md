# Jobs to be done: Vodafone voice guide

- Date: 2026-10-23
- Use: decide what the guide does first, write evaluation requests, and check that each feature serves a real job. Requirements that serve these jobs are in the [PRD](PRD.md).
- Evidence level: **hypotheses** from the team's knowledge of Vodafone Egypt's customers and the live site's structure. Validate with the pilot's traces (which requests people actually make) and with 5–8 customer interviews before production.

## 1. The core job

> **When** I need something from Vodafone (a bundle, a price, how to do something, my balance), **I want to** just say what I want, in my own words and dialect, **so I can** see it on Vodafone's own site without hunting through menus, tabs and pages, and still be the one who decides.

## 2. Job statements by situation

| # | When… | I want to… | So I can… | Demo moment |
|---|---|---|---|---|
| J1 | my data is running out | find the cheapest bundle that's enough | buy it without overpaying | 1 |
| J2 | I've chosen a bundle | get to the place where I subscribe, without pressing the final button by mistake | stay in control of what I pay | 2 |
| J3 | I need to go to a store (a new SIM, a repair) | find the nearest Vodafone store | go there today | 3 |
| J4 | a banner or picture catches my eye but I can't read it well | have it read to me | understand the offer | 4 |
| J5 | I'm thinking about a new phone | see the right phones in the shop | compare without starting over on another site | 5 |
| J6 | I need to do something on the page that I can't find | have it done for me, or be shown how | finish the task | 6 |
| J7 | an offer might improve soon | be told when it changes | not keep checking | 7 |
| J8 | I'm already on some page | ask about this page | not lose where I am | any start page |
| J9 | I'm not comfortable typing, reading English, or using small screens | talk in Egyptian Arabic and hear the answer | use the website at all | throughout |
| J10 | I asked something by mistake or changed my mind | stop it instantly | stay in charge | 8 |

## 3. Emotional and social jobs

| Job | What it means for the design |
|---|---|
| Feel understood, not tested | Egyptian Arabic phrasing works; mixed Arabic-English ("عايز باقة plus") works; the transcript shows the guide heard me correctly before it acts |
| Feel in control | The guide shows where it's going and why (spotlight, bubble), never presses commit buttons, and stops instantly on "stop" or "خلاص" |
| Trust Vodafone | It looks like Vodafone (SPEC-01) and reads prices from Vodafone's page, not from memory |
| Not feel watched | The microphone listens only after a press; the recording indicator goes off at once; nothing is remembered after the session |
| Look capable in front of others (demo audience: leadership) | It works on the real site, from any page, live; when it can't, it says so plainly |

## 4. Job map for J1 → J2 (the main journey)

| Step | The person's need | What the guide does | Feature |
|---|---|---|---|
| Define | "I need more internet" | Accepts loose phrasing in either language | Router, lexicon, Vodafone evaluation set |
| Locate | Where are bundles? | Goes to `/ar/mobile-internet-bundles` from any page | Plans, navigation, start anywhere |
| Prepare | Which one is cheapest? | Opens the right tab, compares cards by price, read live | Collections, reveal, live values |
| Confirm | Is it enough for me? | Reads amount and price; answers "and the next one?" | Memory of the last item |
| Execute | Subscribe | Follows "Subscribe now" into `/spa/miManagement` and stops before confirmation | Flows, SPA routes, commit guard |
| Monitor | Did the offer change? | Page watch on the bundles section | Watch |
| Modify | Changed my mind | "Stop", or a new request | Barge-in, stop |

## 5. Desired outcomes (measurable)

Phrased as "minimise …" so the pilot can measure them.

| # | Outcome | Measure (pilot traces) |
|---|---|---|
| O1 | Minimise the time from asking to seeing the answer | Final words → spotlight on the answer, p50 |
| O2 | Minimise the chance the guide misunderstands | Requests that end in `clarify`, `none` or a correction within 10s |
| O3 | Minimise the effort to correct a misheard word | Requests repeated within 15s |
| O4 | Minimise the risk of an unintended purchase | Commit presses by the guide (must be 0); people who stop at the confirm step |
| O5 | Minimise losing my place when moving between site areas | Plans that complete across CMS, SPA and shop |
| O6 | Minimise uncertainty about whether I'm being heard | Time from speech start to the first word on screen |

## 6. Who we are not serving in this phase

- People who want the guide to complete payments for them.
- Business customers (`/en/business`): a different catalogue and language.
- App-only journeys (Ana Vodafone).

## 7. Requests to put in the evaluation set (seed list)

Collect real phrasings from the people in §2. Seed examples:

| Job | Egyptian Arabic | English |
|---|---|---|
| J1 | إيه أرخص باقة نت؟ · عايز باقة نت رخيصة · أكبر باقة بلس بكام؟ | what's the cheapest internet bundle · which plus bundle has the most data |
| J2 | اشترك فيها · عايز أشترك في الباقة دي | subscribe to it · I want this one |
| J3 | فين أقرب فرع؟ · عايز أروح فرع ڤودافون | where's the nearest store · find a Vodafone shop |
| J4 | البانر ده مكتوب فيه إيه؟ | what does this banner say |
| J5 | وريني الموبايلات · عايز موبايل سامسونج | show me smartphones · Samsung phones |
| J6 | رتبهم من الأرخص · دوس على تابلت | sort by lowest price · click tablets |
| J7 | عرفني لما العروض تتغير | tell me when the offers change |
| J8 | إيه اللي في الصفحة دي؟ | what's on this page |
| J10 | خلاص · وقف | stop · never mind |
