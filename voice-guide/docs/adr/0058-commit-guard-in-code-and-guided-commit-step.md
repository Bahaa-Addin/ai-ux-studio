# ADR-0058: Commit controls are guarded in code on every origin, and at one the guide shows the person where to press instead of pressing

- Status: Proposed (2026-11-13). Built in step E1 of the e-shop plan (`docs/reference/eshop-plan-2026-11-13.md`). Accepted when E1's checks pass and the owner has seen the guided step on a saved page
- Date: 2026-11-13
- Area: fallback agent (ADR-0017), executor, router, site config, public gateway (ADR-0053); AGENTS.md 4.1. Amends ADR-0015 and ADR-0017 (commit points were hidden from the agent; now it sees them and cannot press them); delivers SPEC-03 §4.1's two-language commit lexicon, which `agent.ts` never had
- Owner decisions: 2026-11-13, the fallback agent stays on on the e-shop, with a built-in guard on commit controls, and at one it does not just stop: it guides the person with an animated pointer and a highlight so they take that step themselves, "until we build the commit points" and for every commit point after. The commit list includes, besides add to cart, buy now, checkout, reserve, subscribe, pay and choosing a number, the DSL bundle and device "Select" buttons, store-pickup reservation, one-time codes and document upload; "Sort", "Filter", "Details" and "Compare" stay clickable

## Context

Read on 2026-11-13 (`docs/reference/eshop-map-2026-11-13.md`; the merged plan, §0 and §1 row 3):

- The knowledge base marks **0 commit points**: the extractor marks only a submit button inside a form, and the shop's buttons are `type=button` outside forms.
- The agent's blacklist is the knowledge base's commit selectors, only the first 4 matches of each (`agent.ts:46`): today it hides nothing. Its click tool calls `clickElement` without the guard, and page-agent clicks the **centre** of an element and sends the click to whatever is there (`page-controller.js:110-152`), so clicking a product card can press its cart button. Only click and input are overridden; `select_dropdown_option` and `execute_javascript` are the library's own.
- So the agent can press "Add to cart" or "Buy now" on the shop, and **OneTrust's "Accept all" on web pages too** (consent is a commit point, AGENTS 4.1; SPEC-03 §2 promised `#onetrust-*` in the blacklist).
- Its prompt says purchase buttons are hidden from it, which is false.
- The guide's own executor refuses a click only on a knowledge-base commit target or a payment form's submit (`dom.ts` CommitGuard).
- The public demo (ADR-0053, ADR-0054, ADR-0056) would put this agent in front of anyone once deployed.

## Decision

1. **One classifier, as data** (`packages/kb/src/commit.ts`, pure, shared by the planner, the agent chunk and the crawler). A built-in floor that a site's config can extend but never shrink, plus a `commit:` block per origin in the site config:
   - selectors: `#sl-add-to-cart-button`, `#sl-button-buy-now`, `button.cart`, ids containing add-to-cart or buy-now, buttons holding a picture whose alt says cart, `[aria-label*=cart]`, OneTrust's controls, the accessibility widget;
   - words, English and Arabic after Arabic normalisation, checked against a control's text, aria-label, title, value and the alt text of pictures inside it (icon-only buttons): add to cart, buy (now), checkout, reserve, subscribe, select/choose number, pay, place/confirm order, recharge, transfer, select (on bundle and device cards), pick up in store, verify code, upload; أضف إلى السلة، اشتري (الآن)، اشترك، احجز، ادفع، إتمام الشراء، اختر الرقم، تأكيد الطلب، اختار؛
   - commit pages: the cart, checkout, number review, DSL checkout, subscription details, payment;
   - near misses stay clickable: sort, filter, details, compare, view more.
2. **The agent sees commit controls and cannot press them.** Every match of every selector is classified before each step (not the first 4); every click, select and input target is checked live: the element, the point at its centre, its button or link ancestor and its children. `select_dropdown_option` is overridden with the same check; `execute_javascript` is removed (a test pins the exact tool set). During an agent run a capture-phase listener stops synthetic clicks and submits on classified elements, so a person's own click still passes. On commit pages the agent acts on nothing. The prompt says the truth.
3. **The guided step.** A refused click, or the agent's own `show_person_where` tool, makes the guide scroll the control into view, glide its pointer to it without tapping, highlight it with a slow pulse, show a caption and say one line in the person's language ("This is where you add it to your cart. Press it yourself when you're ready."), and end the task. It stops when the person presses the control, presses Escape or the microphone, the route changes, the control goes, or after 30 s. With reduced motion: the highlight only. It keeps clear of the accessibility button, the cookie banner and Vodafone's chat. The guidance lives in the agent chunk; guide.js gains one call where its own plans reach a commit point (the confirm step points at the control).
4. **Server side.** The page context adds the site's commit selectors on every page, also where the knowledge base does not know the page; on commit pages it adds a placeholder that makes guide.js's CommitGuard refuse every click there. The planner turns commit-intent requests ("add it to the cart", "ضيفه للسلة") into a confirm step, never an agent task, plans no click on commit words, and plans no agent step on an origin whose guard is empty.
5. **The public gateway refuses to start** when the agent is on and an origin has no guard.

## Consequences

- The agent can still help on the shop ("sort by price", "show me the details") and hands the person the last step with the pointer, as the owner asked.
- Consent banners and the accessibility widget are out of the agent's reach on every origin.
- A word list can refuse a harmless button; that errs on the safe side, and the near-miss list keeps demo moment 6.
- guide.js grows by one measured call (ADR-0057's 21 KB budget, owner 2026-11-13).

## Built (step E1, 2026-11-13)

- `packages/kb/src/commit.ts`: the floor's selectors, the words in both languages (on a link only the unmistakable phrases count, so "Balance transfer" still opens its page), the near misses, `commitIntent` for requests and `isCommitPage`. Choosing how to pay ("اختار الدفع بالبطاقة") is not paying.
- `packages/sdk/src/agent.ts`: every commit control (markup or words) is out of the model's view, found again each time page-agent reads the page; click, select and input check the target, the control it sits in and what lies at its centre; `select_dropdown_option` overridden; `show_person_where` added; `execute_javascript` removed; synthetic clicks and submits on commit controls stopped while the agent runs; on commit pages nothing is pressed; the guided step (pointer glide, pulsing highlight in the guide's own root, the line in the person's language, ended by the person's own press or after 30 s) ends the task. 0 bytes in guide.js.
- `packages/sdk/src/executor.ts`: the confirm step also glides the pointer to the control (one call in guide.js).
- `services/knowledge/handlers.ts`: the floor in every page context, with or without a knowledge base; `:root` on commit pages.
- `services/router/planner.ts`: a request the router would hand to the agent that asks to commit becomes a confirm step at the control (by its markup, else its words), never an agent task.
- Not built yet: the site config's `commit:` block per origin (nothing needs it before the shop's crawl marks its own); the public gateway's start check is met by construction, since the floor is in code and every origin has it.
- Tests (each failed on the code before it): `tests/e2e/guide.e2e.test.ts` (a card whose centre lies on its cart button, a button whose script presses the cart, a commit request; the cart, the cookie banner and an Arabic "Buy now" never indexed for the model, the pointer on the control within 2 px, a near miss still pressed); `tests/unit/commit.test.ts`, `tests/unit/commit-context.test.ts`, `tests/unit/router.test.ts`.
- Correction (2026-11-13, AIXC-78): `execute_javascript: null` removes nothing today; page-agent 1.12.4 adds that tool only with `experimentalScriptExecutionTool`, which is never set. The entry keeps it out if that changes. The select, input, commit-page and `show_person_where` paths had no test until the review fixes below.

## Review fixes (2026-11-13, AIXC-70 to AIXC-80)

The review of E1 (Opus bypass hunt, the word lists against the shop's cached code and translations, docs and tests; two refuting checks per finding) found the floor incomplete on the shop's real markup. Fixed, each with a test that failed before (bug log B-44):

- **Choosing a number** (AIXC-70): the shop's number cards (`.red-number-card`, `.msisdn-container`, `.number-card`), "Choose this line" (`#sl-lines-pool-choose-this-line-button`) and the shop home's `#sl-confirm-button` in the floor; on `/lines/*/numbers` a press on anything holding a mobile number or a radio is shown, not made; on that page a request for a number ("I want the first number", "عايز أول رقم", a number said aloud) is the guided step even where the router found a page elsewhere, and the line says to pick the number first.
- **The shop's add-to-cart wordings** (AIXC-71): "add … to cart/bag/basket" and "move to cart" anywhere in a control's words, the Arabic اضف…سلة forms, `button.add-to-cart`, buttons holding a cart picture, Arabic verbs with the object joined ("اشتريه تاني").
- **SPEC-03 §4.1's lexicon** (AIXC-72): confirm, submit, purchase, top up, renew, activate, rent, complete purchase or payment, make a payment, order now, send money, confirm transfer, payment or subscription; تأكيد, شراء, تحويل, جدد, فعّل, حول (alone), تأكيد التحويل/الاشتراك/الدفع/والدفع. Transfer and recharge requests are commit requests.
- **Below the fold** (AIXC-73): the target is scrolled into view before its centre is checked, as page-agent does before it presses; untrusted pointer and mouse presses are stopped as well as clicks; a pointer or mouse press stopped during the agent's own click ends in the guided step (a page script's nested click is stopped quietly).
- **The right control** (AIXC-74): an unscoped confirm step asks "which one?" when the page has several of the first matching kind, and says the button is not on the page when there is none; "add it to the cart" just after an item was shown, on its page, picks that item first. `show_person_where` never climbs past the item's own card, never points at the accessibility widget, and at the cookie banner only when asked about cookies; with several and no item it asks the model for one.
- **DSL devices** (AIXC-75): "Rent" and "Cash" (`.device-payment-options button`, the device-card button ids; ايجار, شراء).
- **Links** (AIXC-76): on a link (or `role=link`) a phrase counts only where the link's words begin with it, and "check out" not at all, so offer tiles and product cards with "at Checkout" open their pages.
- **Questions** (AIXC-77): a question (how, what, can I, do I, is there, ازاي, ايه, هل, اقدر, ينفع, a question mark) is never a commit request; a polite request ("can you add it to the cart?") still is; "pay as you go" is a product.
- **Tests** (AIXC-78): the stand-in model calls `show_person_where` and the dropdown tool; a stand-in cart page (press, type and select each shown), a numbers page, two products with the cookie banner up, a card below the fold; the exact tool set pinned.
- **Decision 3** (AIXC-79): Escape or a press on anything of the guide's own (the microphone) now ends the guided step. Not built yet: keeping the pointer and caption clear of the accessibility button, the cookie banner and Vodafone's chat (phase 3 S16's matrix gets a commit-guidance cell).
- **Decision 4, amended** (AIXC-79): "plans no click on commit words" applies to requests the router would hand to the agent. A curated flow's click steps are the owner's verified content (a bundle's "Subscribe" leads to its confirmation page, where the flow ends in a confirm step); the executor still refuses any click on the floor's controls or the knowledge base's commit points.
- **Hardening** (AIXC-80): words read with a space between pieces (no "EGP 19,999Add to cart"); labels, checkboxes, radios, options and elements with a click handler classified; a clicked element outside any control judged by its own words; the listener checks the element inside a shadow root; the executor's `reveal` step asks CommitGuard too.
- Measured: guide.js 20,416 B gzip -9 (was 20,329 B; budget 21,504 B, ADR-0057).

## Pilot knobs

- The floor's selectors and words (`packages/kb/src/commit.ts`), and each origin's `commit:` block in the site config.
- How long the guidance stays (30 s) and its line in each language.
- What counts as a question (`QUESTION` in `commit.ts`), and the numbers page's request words.

## Revisit when

- The knowledge base marks the shop's commit points itself (ADR-0060): the floor stays, the marks add to it.
- Vodafone renames the shop's buttons (`sl-*` ids).
- The agent library changes its tools.
