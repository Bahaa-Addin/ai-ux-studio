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
- first visible state of the Shokran and other-services carousel sections
- full download band and footer

The clone is local-first and self-contained:

- Vodafone fonts are mirrored into `public/assets/fonts`
- page images are mirrored into `public/assets/images`
- the icon sprite used by the page header/footer/app-store area is inlined in `src/main.js`
