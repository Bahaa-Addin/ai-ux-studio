# Vodafone Services Design System Parse

## Source

- URL: `https://web.vodafone.com.eg/en/services`
- Captured: `2026-04-21`
- Evidence used:
  - live HTML snapshot
  - live shared stylesheet `styles.css?v=12`
  - full-page rendered screenshot

## Theme Read

The page is built from Vodafone Egypt's shared marketing system rather than a one-off microsite. The visual language is strict brand red over calm neutrals:

- Primary action color: `#e60000`
- Primary hover/dark state: `#900`
- Main body text: `#333`
- Secondary text: `#666` and `#999`
- Surfaces: `#fff`, `#f4f4f4`, `#ebebeb`
- Footer ink: `#14141e`

The shared stylesheet also exposes a broader palette for other brand moments:

- Turquoise `#007c92`
- Aqua blue `#00b0ca`
- Aubergine `#5e2750`
- Red violet `#9c2aa0`
- Spring green `#a8b400`
- Green `#428600`
- Fresh orange `#eb9700`
- Lemon yellow `#fecb00`

## Typography

Observed production font stack:

- Body: `vodafone-regular-en`
- Bold emphasis: `vodafone-bold-en`
- Light headings/subtitles: `vodafone-light-en`
- Legacy aliases still present in CSS: `vf-regular`, `vf-bold`, `vf-light`

Observed type scale in the shared stylesheet:

- Section headline: `2.442rem`
- Lead/body-large: `1.16rem` to `1.25rem`
- Card title: `1.332rem`
- Compact top switcher: `0.8rem`

## Layout Tokens

- Desktop container: `1140px`
- Horizontal padding: `15px`
- Section spacing:
  - Mobile: `24px`
  - Tablet: `28px`
  - Desktop: `40px`
- Breakpoints:
  - `576px`
  - `768px`
  - `992px`
  - `1200px`

## Surface Tokens

- Button radius: `6px`
- Card radius: `8px`
- Card border: `1px solid #ccc`
- Button shadow: `0 3px 6px rgba(0,0,0,0.1)`
- Card shadow: `0 2px 8px rgba(0,0,0,0.16)`

## Component Notes

- Top switcher:
  - dark grey strip
  - white active state
  - low-height utility navigation

- Main header:
  - white background
  - lightweight primary nav labels
  - simple icon-only tools

- Hero:
  - photographic banner with a dark film overlay
  - this page keeps copy outside the hero

- Action cards:
  - heavy image usage
  - dark/red overlays for legibility
  - hover state reveals motion or CTA emphasis

- Subscription cards:
  - editorial card body on white
  - media first, copy second
  - consistent 3-up desktop rhythm

- Download band:
  - full-width brand red block
  - QR panel and app store entry points

- Footer:
  - very dark background
  - grey typography with white icons
  - simple legal link row

## Clone Scope In This Project

The implementation in this worktree recreates:

- full header structure
- hero banner
- Vodafone Cash intro strip
- Stay In Control grid
- Call & Connect abroad cards
- Great Entertainment widget rail
- small QR prompt
- Shokran and other-services carousels (all cards, working arrows)
- full download band and footer

The clone is local-first and self-contained:

- Vodafone fonts are mirrored into `public/assets/fonts`
- page images are mirrored into `public/assets/images`
- the icon sprite used by the page header/footer/app-store area is inlined in `src/main.js`

## RED world (under the Pocket)

The personal benefits layer (`src/personalization/`, README "Your RED world") stays inside this
system and adds one surface of its own, from the reference recording:

- Colour: actions and accents `#e60000` / `#990000`; promotional surfaces use the RED warm gradient
  (`#ff6b2c → #f2421a → #e60000`), the hero runs from `#f2541f` down to `#6a0606`; the well under
  the album is transparent (the album's paper shows through). Neutrals as above (`#333`, `#666`,
  `#999`, `#ebebeb`, `#f4f4f4`; bento tiles `#f5f5f7`, wide tiles a warm tint `#fff2ed → #ffe7e0`).
  Partners appear as wordmarks in their own colours on their own tiles. Topics that are not Dock
  categories get a small gradient badge (family turquoise, bill grey, coffee brown, points gold,
  Elite+ ink, the rest RED).
- Type: Vodafone Regular for titles (as in the reference), Vodafone Bold for figures, buttons and
  the hero; numbers use tabular figures.
- Shape: the sheet 28px, cards 20–26px, tiles 20px, bento tiles 18px, buttons 12px, pills fully
  round. The condensed hero is one band about the sheet bar's height.
- Layout: the sheet holds one spotlight (one topic) and a compact bento of the others: two columns
  on phones, four from 720px, the best tiles two columns wide so every row closes.
- Motion: one curve family shared by CSS and JS (`--pz-ease-sheet` = `cubic-bezier(0.32, 0.72, 0, 1)`
  for the push, `--pz-ease-settle` for things that land); the push 760ms, the return 660ms, the widget
  640ms with metrics 60ms apart; the Dock's glide into the well rides the push; a spotlight swap
  420ms (height morph, content sliding 28px from its Dock icon's side), tiles re-lay with FLIP. The
  Dock magnifies 1.6x at most, for a mouse only. Transforms and opacity only during the push.
  Reduced motion: every state change is immediate and the widget appears still.
- Selectors: everything is prefixed `.pz-`.

## Pocket actors

The Pocket mascot and drone (`src/pocket/pocket-actors.css`, [pocket-actors.md](pocket-actors.md))
stay inside this system:

- Colour: body and drone `#e60000`, shading toward `#990000`/`#ad0000`, outlines deep maroon
  `#5c0000`, pupil ink `#14141e`. The only off-palette accents come from the reference art:
  the apple green, blush pink and sweat-drop blue.
- Scale: mascot `clamp(58px, 4vw + 42px, 100px)` tall, drone `clamp(52px, 4.2vw + 36px, 100px)`
  wide (44 px minimum tap target).
- Placement: never over the header, controls, title, lead or cards; drone in the upper right
  of the album, mascot in the corner opposite the page curl.
- Motion: the actors are 3D models redrawn as SVG from their pose each frame, plus transforms
  and opacity; nothing animates layout. Short holds between beats, one strong beat at a time.
  Reduced motion shows still poses.
- Selectors: everything is prefixed `.pocket-actor-`, `.pocket-mascot-` or `.pocket-drone-`.
