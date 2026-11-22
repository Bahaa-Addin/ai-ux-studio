# Colour audit of Reimagine on Vodafone's pages (2026-11-22)

Phase 4c's audit for ADR-0076 §9: every colour outside Vodafone's palette in Reimagine's CSS and JS, one row per distinct value per file. ADR-0076 §9 holds the per-file summary; this page holds every row.

- **How it was made.** A Sonnet audit listed 172 rows at `292ac0b`. An Opus check went over it independently: no colour was missed, and it made the corrections below. Line numbers are as audited at `292ac0b`; 4c's edits moved only what comes after them (canvas.css after L727, streaming.css after L1276).
- **Vodafone's palette** (from `experiences/src/aixc/experiences/vodafone.css`, mirrored in `aixc.css` `:root`, `live.css` and magazine's `--mag-*`): red `#e60000`, dark red `#990000`, ink `#14141e`, greys `#333`, `#666`, `#999`, `#ccc`, `#ebebeb`, `#f4f4f4`, white `#fff`, the card shadows `rgba(0,0,0,0.16)` and `rgba(0,0,0,0.22)`, and Vodafone's button shadow colour `rgba(0,0,0,0.1)`. `transparent`, `currentColor` and `inherit` count as on palette.
- **Not counted as rows:** Vodafone's tokens even where hard-coded (`aixc.css` L509, `live.css` L229 and L351); fully transparent black `rgba(0,0,0,0)` as a gradient end; `#141414` and `#e50914` at streaming.css L7 (a comment only); the `--mag-*` and `--aixc-*` declarations, which restate the tokens. No `hsl()`, `oklch()`, `color-mix()` or named colour is used as a real value.
- **Scanned with nothing off palette:** `shared.js`, `view-dialog.js`, `canvas.js`, `cube.js`, `flipbook.js`, `magazine.js`, `ring.js`, `split.js`, `spotlight.js`, `fallback-schema.js` and the other `aixc/*.js` files.

## The count

| Status | Rows |
|---|---|
| exception | 158 |
| clone only | 9 |
| on palette (Vodafone's button shadow) | 3 |
| fixed in 4c | 2 |
| **all rows** | **172** |

Of the 158 rows under the exception, 5 are the previews' overlays (canvas and streaming; the lead's decision) and 13 are transparent stops, `rgba(R,G,B,0)`, the end of a fade in a colour of the gradient (the audit's note said 15; the rows hold 13). If transparent stops are not counted as colours, the exception holds 145 rows.

**Corrections made by the check** (already applied in the tables):

1. `live.css`'s two composer shadows were replaced by Vodafone's values in 4c: the pressed tile `0 1px 3px rgba(0,0,0,0.3)` became `0 2px 8px rgba(0,0,0,0.16)` (`--vx-shadow`), and the composer's ring `rgba(0,0,0,0.08)` became `#ebebeb`.
2. `aixc.css`'s nine rows are clone only: no §9 breach on live.
3. `rgba(0,0,0,0.1)` in fan.css, streaming.css and vodafone.css equals Vodafone's button shadow colour: on palette.
4. streaming.js's `depthGrey()` also colours the steps of the mark's text-shadow (L549-552).

**Still off palette on live outside the thirteen experiences' own art:** the previews' overlays only (canvas.css L471 scrim `rgba(8,8,12,0.92)`, L567 close `rgba(0,0,0,0.35)`; streaming.css L1288 scrim `rgba(0,0,0,0.72)`, L19 panel `#22222c`, L1307 shadow `rgba(0,0,0,0.75)`). The lead counts them as part of those experiences under the owner's palette exception; the owner confirms or not.

Status words: **exception**, the experience keeps its own colour on live (the owner, 2026-11-17); **clone only**, not loaded on Vodafone's pages; **on palette**, a Vodafone value after all; **fixed in 4c**, replaced by Vodafone's value.

## `experiences/src/aixc/aixc.css` (9)

The clone's launcher, composer and view bar. `aixc.css` is linked only from the clone's two pages (`experiences/index.html` and `experiences/ar/index.html`) and is not loaded on Vodafone's pages, so these rows are no §9 breach on live. They are a clean-up for the clone (open item O64).

| # | Colour | Used for | Status |
|---|---|---|---|
| 1 | `rgba(0,0,0,0.28)` | box-shadow of .aixc-launcher (L75) | clone only |
| 2 | `rgba(0,0,0,0.3)` | box-shadow of .aixc-composer (L108) and .aixc-seg[aria-pressed=true] (L625) | clone only |
| 3 | `rgba(0,0,0,0.08)` | second box-shadow layer of .aixc-composer (L108) | clone only |
| 4 | `rgba(230,0,0,0.18)` | focus outline of .aixc-prompt:focus (L173) and .aixc-input:focus (L390), a red tint | clone only |
| 5 | `#faf8fa` | background of .aixc-prompt[readonly] (L177) | clone only |
| 6 | `#fdeeee` | background of .aixc-message[data-tone=error] (L333) | clone only |
| 7 | `#2f6b1a` | text colour of .aixc-settings__status[data-state=ok], a green (L362) | clone only |
| 8 | `#fff6f6` | background of .aixc-warning (L410) | clone only |
| 9 | `rgba(255,255,255,0.97)` | background of .aixc-viewbar (L584) | clone only |

## `experiences/src/host/demos/reimagine/live.css` (2)

The composer's skin on Vodafone's pages. Both rows were replaced by Vodafone's values in phase 4c, so the launcher (its CSS is inline in `host/demos/reimagine.js`), the view bar, the composer and the box's chrome are on palette on live.

| # | Colour | Used for | Status |
|---|---|---|---|
| 1 | `rgba(0,0,0,0.3)` | box-shadow of .aixc-composer .aixc-seg[aria-pressed=true] (L159) | fixed in 4c: `0 2px 8px rgba(0,0,0,0.16)` (`--vx-shadow`) |
| 2 | `rgba(0,0,0,0.08)` | second box-shadow layer of .aixc-composer (L229, next to the token 0.22) | fixed in 4c: `0 0 0 1px #ebebeb` |

## `experiences/src/aixc/experiences/canvas.css` (14)

Rows 10 and 14 (the preview's scrim at L471 and its close button's background at L567) are the preview's overlay, counted with the experience under the owner's exception (the lead's decision in phase 4c, for the owner to confirm).

| # | Colour | Used for | Status |
|---|---|---|---|
| 1 | `#000` | background of .cv root (L26), .cv-stage (L36), .cv-tile (L82) | exception |
| 2 | `#111` | background of .cv-card__media (L107) | exception |
| 3 | `rgba(0,0,0,0.72)` | background scrim of .cv-card::after (L135) | exception |
| 4 | `rgba(255,255,255,0.62)` | text colour of .cv-card__num (L159) | exception |
| 5 | `#ff1a1a` | bright red stop in the radial gradient of .cv-tile--brand, LTR and RTL (L184, L191) | exception |
| 6 | `rgba(0,0,0,0.6)` | text-shadow of .cv-foot (L221) and vignette span 2 box-shadow (L410) | exception |
| 7 | `rgba(0,0,0,0.55)` | background of .cv-head and .cv-foot (L232, L238) | exception |
| 8 | `rgba(0,0,0,0.49)` | vignette span 1 box-shadow (L406) | exception |
| 9 | `rgba(0,0,0,0.7)` | vignette span 3 box-shadow (L414) | exception |
| 10 | `rgba(8,8,12,0.92)` | background of .cv-dialog__overlay (L471) | exception: preview (lead's decision) |
| 11 | `rgba(255,255,255,0.6)` | text of .cv-dialog__meta (L538) | exception |
| 12 | `rgba(255,255,255,0.88)` | text of .cv-dialog__desc (L545) | exception |
| 13 | `rgba(255,255,255,0.8)` | text of dialog actions .vx-inert.vx-on-dark (L558) | exception |
| 14 | `rgba(0,0,0,0.35)` | background of .cv-dialog__close (L567) | exception: preview (lead's decision) |

## `experiences/src/aixc/experiences/coverflow.css` (12)

| # | Colour | Used for | Status |
|---|---|---|---|
| 1 | `#2c2c36` | stage backdrop gradient stop of .cf-stage (L44) | exception |
| 2 | `#191920` | stage backdrop gradient stop of .cf-stage (L44) | exception |
| 3 | `#0b0b10` | stage backdrop of .cf-stage (L44) and .cf-floor (L134) | exception |
| 4 | `rgba(255,255,255,0.55)` | -webkit-box-reflect gradient of .cf-cover (L77) | exception |
| 5 | `rgba(11,11,16,0)` | transparent end of .cf-floor gradient (L134) | exception: transparent stop |
| 6 | `rgba(11,11,16,0.6)` | .cf-floor gradient (L134) | exception |
| 7 | `#e6e6e6` | text of .cf-scroll (L164), .cf-button (L221), border of .cf-button::before (L233) | exception |
| 8 | `rgba(204,204,204,0.65)` | glossy .cf-button::before gradient, rest and :active (L235, L250) | exception |
| 9 | `#000` | button gradient stops (L235, L250), .cf-flow mask-image (L501-502) | exception |
| 10 | `#ff3333` | hover gradient top of .cf-button:hover::before (L246) | exception |
| 11 | `rgba(255,255,255,0.8)` | text of .cf-detail__group (L288), detail actions .vx-on-dark (L336) | exception |
| 12 | `rgba(255,255,255,0.86)` | text of .cf-detail__desc (L318) | exception |

## `experiences/src/aixc/experiences/cube.css` (3)

| # | Colour | Used for | Status |
|---|---|---|---|
| 1 | `rgba(20,20,30,0.22)` | floor shadow gradient of .cb-floor (L166), a tint of ink #14141e | exception |
| 2 | `rgba(20,20,30,0)` | transparent end of .cb-floor gradient (L166) | exception: transparent stop |
| 3 | `rgba(20,20,30,0.12)` | box-shadow of .cb-block (L482) | exception |

## `experiences/src/aixc/experiences/fan.css` (18)

`rgba(0,0,0,0.1)` equals Vodafone's button shadow colour.

| # | Colour | Used for | Status |
|---|---|---|---|
| 1 | `rgba(230,0,0,0.22)` | red glow in .fn-stage backdrop (L62) | exception |
| 2 | `rgba(230,0,0,0)` | transparent end of the .fn-stage glow (L62) | exception: transparent stop |
| 3 | `#000` | .fn-stage backdrop (L63), .fn-card background (L138) | exception |
| 4 | `#3d0000` | .fn-stage backdrop gradient stop (L63) | exception |
| 5 | `rgba(0,0,0,0.5)` | box-shadow of .fn-card and .fn-card.is-active (L139, L244) | exception |
| 6 | `rgba(0,0,0,0.35)` | scrim of .fn-card__box::before (L168) | exception |
| 7 | `rgba(0,0,0,0.72)` | scrim of .fn-card__box::before (L168) | exception |
| 8 | `rgba(0,0,0,0.1)` | text-shadow of .fn-card__title (L220) | on palette (Vodafone's button shadow) |
| 9 | `rgba(255,255,255,0.12)` | ring box-shadow of .fn-card.is-active (L244) | exception |
| 10 | `rgba(255,255,255,0.7)` | text of .fn-hint (L255) | exception |
| 11 | `rgba(255,255,255,0.86)` | text of .fn-detail__desc (L291) | exception |
| 12 | `rgba(255,255,255,0.8)` | text of detail actions .vx-on-dark (L308) | exception |
| 13 | `rgba(255,255,255,0.25)` | track of .fn-progress (L376) | exception |
| 14 | `rgba(255,255,255,0.35)` | border of .fn-cursor (L404) | exception |
| 15 | `rgba(10,10,15,0)` | transparent end of .fn-detail gradient (L468) | exception: transparent stop |
| 16 | `rgba(10,10,15,0.86)` | .fn-detail gradient (L468) | exception |
| 17 | `rgba(10,10,15,0.96)` | .fn-detail gradient (L468), .aixc-box .fn-detail::after (L675) | exception |
| 18 | `rgba(10,10,15,0.92)` | .aixc-box .fn-detail::before (L607) | exception |

## `experiences/src/aixc/experiences/flipbook.css` (4)

| # | Colour | Used for | Status |
|---|---|---|---|
| 1 | `rgba(20,20,30,0.16)` | box-shadow of .fb-page (L145) | exception |
| 2 | `rgba(20,20,30,0.12)` | page-spine shading .fb-page::before (L163, L168) and .fb-controls shadow (L793) | exception |
| 3 | `rgba(20,20,30,0)` | transparent end of the page-spine gradients (L163, L168) | exception: transparent stop |
| 4 | `rgba(255,255,255,0)` | transparent end of the .fb-corner next/prev gradients, rest and focus-visible (L269, L274, L285, L290) | exception: transparent stop |

## `experiences/src/aixc/experiences/gallery.css` (4)

| # | Colour | Used for | Status |
|---|---|---|---|
| 1 | `rgba(235,235,235,0)` | transparent end of .gl-stage::after gradient (L62) | exception: transparent stop |
| 2 | `rgba(20,20,30,0.06)` | box-shadow of .gl-frame (L140) | exception |
| 3 | `rgba(230,0,0,0.14)` | box-shadow of .gl-piece.is-active .gl-frame (L179) | exception |
| 4 | `rgba(255,255,255,0.96)` | background of .gl-caption (L227) | exception |

## `experiences/src/aixc/experiences/journey.css` (8)

| # | Colour | Used for | Status |
|---|---|---|---|
| 1 | `rgba(255,255,255,0.28)` | .jr-sky gradient (L59) | exception |
| 2 | `rgba(255,255,255,0)` | transparent end of .jr-sky (L59) and .jr-intro__hint span::after (L206) | exception: transparent stop |
| 3 | `#f0524f` | sunrise stop of .jr-sky gradient (L60) | exception |
| 4 | `#1f0d14` | night gradient stop of .jr-night (L65) | exception |
| 5 | `#4d0008` | night gradient stop of .jr-night (L65) | exception |
| 6 | `rgba(255,255,255,0.55)` | drop-shadow filter of .jr-sun__mark (L99) | exception |
| 7 | `rgba(20,20,30,0.25)` | text-shadow of .jr-intro__title (L178) | exception |
| 8 | `rgba(20,20,30,0.35)` | text-shadow of .jr-chapter__head (L241) | exception |

## `experiences/src/aixc/experiences/journey.js` (3)

| # | Colour | Used for | Status |
|---|---|---|---|
| 1 | `rgba(255,255,255,0.22)` | fill of the farthest mountain range in RANGES (L78, JS string) | exception |
| 2 | `#c20000` | fill of mountain range 2 in RANGES (L79, JS string) | exception |
| 3 | `#5e0000` | fill of mountain range 4 in RANGES (L81, JS string) | exception |

## `experiences/src/aixc/experiences/magazine.css` (5)

| # | Colour | Used for | Status |
|---|---|---|---|
| 1 | `rgba(20,20,30,0)` | transparent end of .mag-cover__photo::after (L402) | exception: transparent stop |
| 2 | `rgba(255,255,255,0.88)` | text of .mag-cover__intro (L444) and .mag-split__panel .mag-dek (L787) | exception |
| 3 | `rgba(255,255,255,0.86)` | text of .mag-cover__story-desc (L475) and .mag-desc (L536) | exception |
| 4 | `rgba(255,255,255,0.28)` | borders of .mag-cover__contents (L488, L1182) | exception |
| 5 | `rgba(255,255,255,0.14)` | border-bottom of .mag-cover__contents a (L508) | exception |

## `experiences/src/aixc/experiences/ring.css` (6)

| # | Colour | Used for | Status |
|---|---|---|---|
| 1 | `#000` | background of .rg root (L23), .rg-stage (L40), .rg-panel (L58), ::after/::before (L86, L99), edge masks (L224-225, L231-232) | exception |
| 2 | `#2b0000` | gradient stop of .rg-panel::after (L86) | exception |
| 3 | `rgba(0,0,0,0.75)` | box-shadow of .rg-edge--left / --right (L226, L233) | exception |
| 4 | `rgba(255,255,255,0.88)` | text of .rg-detail__desc (L302) | exception |
| 5 | `rgba(255,255,255,0.8)` | text of detail actions .vx-on-dark (L319) | exception |
| 6 | `rgba(255,255,255,0.22)` | faint Arabic ghost text of .rg-item__title:lang(ar) (L357) | exception |

## `experiences/src/aixc/experiences/split.css` (7)

| # | Colour | Used for | Status |
|---|---|---|---|
| 1 | `#000` | background of .ss-stage (L50) | exception |
| 2 | `#c30000` | red art tone of .ss-pane.is-mark .ss-art (L148) | exception |
| 3 | `rgba(0,0,0,0.5)` | scrim gradient of .ss-scrim (L168, L169) | exception |
| 4 | `rgba(0,0,0,0.6)` | scrim gradient of .ss-scrim (L169) | exception |
| 5 | `rgba(255,255,255,0.88)` | text of .ss-desc (L283) | exception |
| 6 | `rgba(255,255,255,0.4)` | border of .ss-actions .vx-on-dark (L333) | exception |
| 7 | `rgba(255,255,255,0.72)` | text of .ss-hint (L359) | exception |

## `experiences/src/aixc/experiences/spotlight.css` (15)

| # | Colour | Used for | Status |
|---|---|---|---|
| 1 | `rgba(20,20,30,0.94)` | .sp-backdrop::after gradient (L106) | exception |
| 2 | `rgba(20,20,30,0.82)` | .sp-backdrop::after gradient (L106) | exception |
| 3 | `rgba(20,20,30,0.3)` | .sp-backdrop::after gradient (L106) | exception |
| 4 | `rgba(20,20,30,0.8)` | .sp-backdrop::after gradient (L107) | exception |
| 5 | `rgba(20,20,30,0)` | transparent end of .sp-backdrop::after gradient (L107) | exception: transparent stop |
| 6 | `rgba(255,255,255,0.12)` | track of .sp-timer (L117) | exception |
| 7 | `rgba(255,255,255,0.55)` | paused fill of .sp-timer__fill (L135) | exception |
| 8 | `rgba(255,255,255,0.78)` | text of .sp-jump (L165) | exception |
| 9 | `rgba(255,255,255,0.9)` | text of .sp-slide__place and .sp-slide__desc (L202, L231) | exception |
| 10 | `rgba(20,20,30,0.92)` | .sp-card::after gradient (L324), .sp-backdrop::after (L453, L626) | exception |
| 11 | `rgba(20,20,30,0.1)` | .sp-card::after gradient (L324) | exception |
| 12 | `rgba(230,0,0,0.22)` | hover wash of .sp-card:hover::after (L329) | exception |
| 13 | `rgba(255,255,255,0.25)` | track of .sp-progress (L383) | exception |
| 14 | `rgba(20,20,30,0.9)` | .sp-backdrop::after gradient, clone and .aixc-box (L453, L626) | exception |
| 15 | `rgba(20,20,30,0.74)` | .sp-backdrop::after gradient, clone and .aixc-box (L453, L626) | exception |

## `experiences/src/aixc/experiences/streaming.css` (31)

The preview's overlay is counted with the experience under the owner's exception (the lead's decision in phase 4c, for the owner to confirm): the panel's `#22222c` (`--st-raised`, L19), the scrim `rgba(0,0,0,0.72)` (L1288 as audited, L1289 in the 4c tree) and the panel's shadow `rgba(0,0,0,0.75)` (L1307 as audited, L1308 in the 4c tree). `rgba(0,0,0,0.1)` equals Vodafone's button shadow colour.

| # | Colour | Used for | Status |
|---|---|---|---|
| 1 | `#22222c` | --st-raised token (L19) | exception: preview (lead's decision) |
| 2 | `#2c2c36` | --st-raised-2 token (L20) | exception |
| 3 | `rgba(0,0,0,0.72)` | .st-nav background (L96), .st-modal::backdrop (L734), .aixc-box .st-modal (L1288) | exception: preview (lead's decision) |
| 4 | `#e5e5e5` | text of .st-nav__link (L139) and .st-row__title (L336) | exception |
| 5 | `rgba(0,0,0,0.78)` | .st-billboard__media::before gradient (L193) | exception |
| 6 | `rgba(0,0,0,0.35)` | .st-billboard__media::before gradient (L193, L1142) | exception |
| 7 | `rgba(20,20,30,0)` | transparent end of .st-billboard__media::after (L197) | exception: transparent stop |
| 8 | `rgba(20,20,30,0.6)` | .st-billboard__media::after gradient (L197) | exception |
| 9 | `rgba(0,0,0,0.6)` | filter of .st-billboard__art (L230), box-shadow of .st-card__info (L489) | exception |
| 10 | `rgba(0,0,0,0.45)` | text-shadow of .st-billboard__title and __synopsis (L237, L245) | exception |
| 11 | `#000` | text of .st-btn--play (L288) and .st-circle--primary (L522), .st-intro__curtain background (L941), --st-mark-glyph (L1004) | exception |
| 12 | `rgba(255,255,255,0.75)` | .st-btn--play:hover background (L292), .st-skip border (L1038) | exception |
| 13 | `rgba(102,102,102,0.7)` | background of .st-btn--info (L296) | exception |
| 14 | `rgba(102,102,102,0.42)` | background of .st-btn--info:hover (L301) | exception |
| 15 | `rgba(255,255,255,0.45)` | border of .st-tag (L309) | exception |
| 16 | `#4d4d4d` | background of .st-row__pages li (L386) | exception |
| 17 | `#aaa` | background of .st-row__pages li.is-current (L390) | exception |
| 18 | `rgba(0,0,0,0.85)` | .st-card__label background (L466), .st-billboard__media::before (L1142) | exception |
| 19 | `rgba(255,255,255,0.5)` | border of .st-circle (L506) | exception |
| 20 | `rgba(42,42,42,0.6)` | background of .st-circle (L508) | exception |
| 21 | `rgba(255,255,255,0.8)` | .st-circle--primary:hover background (L530) | exception |
| 22 | `rgba(0,0,0,0.75)` | box-shadow of .st-card:hover/:focus-within inner (L563, L569), .st-modal (L729), .st-modal__panel (L1307) | exception: preview (lead's decision) |
| 23 | `rgba(20,20,30,0.55)` | background of .st-row__arrow (L605) and .st-skip (L1040) | exception |
| 24 | `rgba(20,20,30,0.78)` | background of .st-row__arrow:hover (L639) | exception |
| 25 | `rgba(34,34,44,0)` | transparent end of .st-modal__hero::after (L799) | exception: transparent stop |
| 26 | `rgba(0,0,0,0.5)` | text-shadow of .st-modal__title (L818) | exception |
| 27 | `#3a3a44` | background of .st-more__card:hover (L898) | exception |
| 28 | `#f3f3f3` | .st-intro__white mark disc and text (L1003, L1005) | exception |
| 29 | `#ff1a1a` | .st-intro__glow mark disc, glyph and text (L1021-1023) | exception |
| 30 | `rgba(255,255,255,0.2)` | background of .st-skip:hover (L1049) | exception |
| 31 | `rgba(0,0,0,0.1)` | .st-billboard__media::before gradient (L1142) | on palette (Vodafone's button shadow) |

## `experiences/src/aixc/experiences/streaming.js` (1)

Built in JS, not a fixed value: `depthGrey()` (L104-107) makes the greys of the intro mark's extrusion.

| # | Colour | Used for | Status |
|---|---|---|---|
| 1 | `computed greys #b4b4b4 to #3a3a3a (depthGrey, L104-107)` | JS-built hex string for the intro mark's layer colour, --st-mark-disc and --st-mark-glyph (L543-546); also the steps of its text-shadow (L549-552) | exception |

## `experiences/src/aixc/experiences/tunnel.css` (26)

| # | Colour | Used for | Status |
|---|---|---|---|
| 1 | `#030305` | --tn-bg token (L23) | exception |
| 2 | `rgba(12,12,18,0.74)` | --tn-card-bg token (L24) | exception |
| 3 | `rgba(255,255,255,0.12)` | --tn-line token (L25) | exception |
| 4 | `#1a0507` | .tn-stage backdrop (L44) | exception |
| 5 | `#08080c` | .tn-stage backdrop (L44) | exception |
| 6 | `#e6e6e6` | text of .tn-stage (L45), card corner borders (L155-156, L162-163) | exception |
| 7 | `rgba(255,255,255,0.32)` | -webkit-text-stroke of .tn-word (L102) | exception |
| 8 | `rgba(255,255,255,0.55)` | current word stroke (L118), .tn-card__group (L206), .tn-hud (L347) | exception |
| 9 | `rgba(0,0,0,0.5)` | box-shadow of .tn-card (L134) and the current card (L169) | exception |
| 10 | `rgba(230,0,0,0.7)` | border of the current .tn-card (L168) | exception |
| 11 | `rgba(230,0,0,0.22)` | glow of the current .tn-card (L169) | exception |
| 12 | `rgba(20,20,26,0.86)` | background of the current .tn-card (L170) | exception |
| 13 | `rgba(230,0,0,0.25)` | hover glow of .tn-card:hover (L176) | exception |
| 14 | `rgba(20,20,26,0.9)` | background of .tn-card:hover (L177) | exception |
| 15 | `#111` | background of .tn-card__media (L225) | exception |
| 16 | `rgba(255,255,255,0.76)` | text of .tn-card__desc (L252) | exception |
| 17 | `rgba(255,255,255,0.7)` | text of card actions .vx-on-dark (L286) | exception |
| 18 | `rgba(255,255,255,0.4)` | text of .tn-card__foot (L295) | exception |
| 19 | `rgba(255,255,255,0)` | transparent stop of .tn-fx--scanlines (L323) | exception: transparent stop |
| 20 | `rgba(0,0,0,0.2)` | stripes of .tn-fx--scanlines (L323) | exception |
| 21 | `#000` | gradient end of .tn-fx--vignette (L329) | exception |
| 22 | `rgba(255,255,255,0.2)` | background of .tn-hud__line (L371) | exception |
| 23 | `rgba(3,3,5,0.5)` | background of .tn-hud__nav .vx-round (L410) | exception |
| 24 | `rgba(255,255,255,0.5)` | text of .tn-hint (L418) | exception |
| 25 | `rgba(255,255,255,0.13)` | ghost Arabic .tn-word:lang(ar) (L434) | exception |
| 26 | `rgba(255,255,255,0.24)` | current ghost Arabic word (L439) | exception |

## `experiences/src/aixc/experiences/tunnel.js` (2)

| # | Colour | Used for | Status |
|---|---|---|---|
| 1 | `rgba(230,0,0,0.85)` | red channel-split text-shadow set on the heading in JS (L290) | exception |
| 2 | `rgba(255,255,255,0.5)` | white channel-split text-shadow set on the heading in JS (L290) | exception |

## `experiences/src/aixc/experiences/vodafone.css` (2)

The experiences' shared sheet. `rgba(0,0,0,0.1)` equals Vodafone's button shadow colour.

| # | Colour | Used for | Status |
|---|---|---|---|
| 1 | `rgba(0,0,0,0.1)` | box-shadow of .vx-btn--primary in the shared experience sheet (L176) | on palette (Vodafone's button shadow) |
| 2 | `rgba(255,255,255,0.78)` | text of .vx-inert.vx-on-dark in the shared experience sheet (L226) | exception |
