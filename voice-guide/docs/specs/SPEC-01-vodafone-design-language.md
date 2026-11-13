# SPEC-01: Vodafone design language for the guide

- Status: Ready to build
- Requirement: PRD R1 (the whole experience matches Vodafone's design language)
- Decision: [ADR-0029](../adr/0029-vodafone-theme-as-fixed-tokens.md)
- Source facts: [live site audit](../reference/vodafone-live-site-audit.md) §4–§6; `experiences/docs/design-system.md`

## 1. Principle

Everything the guide draws on a Vodafone page must look as if Vodafone's web team built it: the same red, fonts, radii, shadows and restraint. The guide adds **no new brand colours, no gradients except Vodafone's own, no new type families**. The page itself is never restyled.

## 2. Tokens

The SDK ships these as CSS custom properties inside its shadow root (`packages/sdk/src/theme/vodafone.ts`). They are **fixed**, not read from the page (ADR-0029). The current `themeFromPage()` stays as the fallback for non-Vodafone sites.

```css
:host {
  /* colour */
  --vf-red: #e60000;
  --vf-red-dark: #990000;
  --vf-red-gradient: linear-gradient(to right top, #990000, #e60000);
  --vf-red-glow: rgba(230, 0, 0, .35);
  --vf-ink: #333333;          /* body text */
  --vf-ink-2: #666666;        /* secondary text */
  --vf-ink-3: #999999;        /* dividers, disabled icons; never text (2.85:1) */
  --vf-bg: #f4f4f4;           /* page background */
  --vf-surface: #ffffff;
  --vf-line: #cccccc;         /* card border when needed */
  --vf-night: #14141e;        /* footer ink; X-ray background */
  --vf-black-bar: rgba(0, 0, 0, .9);   /* transcript bar (SPEC-02) */
  --vf-aqua: #00b0ca;         /* focus ring only */

  /* type */
  --vf-font-en: vodafone-regular-en, "vodafone-regular", Arial, sans-serif;
  --vf-font-en-bold: vf-bold-en, vodafone-bold-en, Arial, sans-serif;
  --vf-font-en-light: vodafone-light-en, Arial, sans-serif;
  --vf-font-ar: vodafone-regular-ar, Tahoma, Arial, sans-serif;
  --vf-font-ar-bold: vf-bold-ar, Tahoma, Arial, sans-serif;
  --vf-font-ar-light: vodafone-light-ar, Tahoma, Arial, sans-serif;
  --vf-text: 16px;            /* line height 24px */
  --vf-text-sm: 14px;
  --vf-text-xs: 12.8px;
  --vf-title: 21.44px;

  /* shape and depth */
  --vf-radius: 6px;           /* buttons, cards, bars */
  --vf-radius-round: 50%;
  --vf-shadow-btn: 0 3px 6px rgba(0, 0, 0, .1);
  --vf-shadow-card: 0 2px 4px rgba(0, 0, 0, .075);
  --vf-shadow-float: 0 2px 8px rgba(0, 0, 0, .16);
  --vf-shadow-fab: 0 6px 20px var(--vf-red-glow);
  --vf-ring: 5px solid #ffffff;    /* white ring of the floating buttons */

  /* motion */
  --vf-ease: cubic-bezier(.2, .8, .2, 1);
  --vf-fast: 140ms;
  --vf-base: 220ms;

  /* stacking: above the page, below OneTrust (2147483645) */
  --vf-z: 2147483000;
}
```

Fonts: the SDK does **not** ship Vodafone font files. On Vodafone pages the page's own `@font-face` rules already load them, and a shadow root can use document-level font faces. Pages that don't load a weight fall back to Arial or Tahoma, never to Times. On `/spa/` pages, check that the Arabic and English regular faces are loaded (`document.fonts.check('16px vodafone-regular-ar')`). If they are not, load the mirrored English files from `experiences/public/assets/fonts/` through the gateway (`/sdk/fonts/…`). Arabic files must be mirrored first (task T-104).

## 3. Components and how each one is styled

| Guide component | Vodafone pattern it copies | Rules |
|---|---|---|
| Microphone button | The accessibility button `#vodafone-aw-icon` | SPEC-02 §3. Same red, white ring, red glow. |
| Transcript bar | (new, deliberately black, as requested) | SPEC-02 §4. Black at 90%, white text, `--vf-radius`. |
| Answer bubble (`.bubble`) | Card `.tiles.shadow-sm` | White, `--vf-radius`, `--vf-shadow-float`, 16px padding, `--vf-ink` text, 3px red top border. |
| Spotlight ring (`.spot`) | Brand red focus | 3px `--vf-red` outline with a 6px `--vf-red-glow` halo; radius matches the target's own radius. |
| Pointer | | Red dot with white ring. |
| Panel (conversation and typing) | Card and header | White surface, header strip in `--vf-red-gradient` with white title, log in `--vf-ink`, user turns in light grey `#f4f4f4`, guide turns on white with a red start border. |
| Buttons in the panel | `.btn.btn-primary` | `#e60000`, white text, radius 6px, padding 12px 20px, `--vf-shadow-btn`. Secondary: white with a 1px `#e60000` border and red text. |
| Choice chips ("A or B?") | Secondary button | Pill radius is **not** used; 6px radius, red border, red text. |
| "Pocket it" chip (the experience layer, on Vodafone's cards) | Secondary button | White, 1px `#e60000` border, `#e60000` text in Vodafone Regular 14px, 6px radius, 32px high; on hover `#e60000` fill, white text; focus: a 2px `#333` outline 2px out with white between (shows on white and on red cards); icon alone (32×32) on a card with no free corner; no transitions under reduced motion. Its liner: `#f4f4f4`, 1px dashed `#ccc`. Scoped to `.pocket-chips[data-aixc]`, live pages only (ADR-0052 §12). |
| Toasts (page watch) | Card | White, red start border, bell icon in red. |
| X-ray drawer | Footer | `--vf-night` background, `#e6e6e6` text, red for the route badge. Demo only. |

## 4. Language and direction

- Arabic uses the `-ar` families; English uses the `-en` families. Pick from the **utterance or reply language**, not from the page: an Arabic reply on an English page is set in the Arabic face.
- Bubble, panel and transcript text follow `dir` of their own text (`dir="auto"` on each text node container).
- The microphone and accessibility buttons **stay on the right in both directions**, because Vodafone's own floating button does not mirror (audit §5). Panels open from the right on English and Arabic pages alike.

## 5. Copy and tone

- Speak like Vodafone Egypt's Arabic copy: Egyptian, short, warm ("سامعك…", "ثواني…", "دي أرخص باقة: …").
- English: plain and short ("Listening…", "One moment…", "This is the cheapest bundle: …").
- Product names are kept as Vodafone writes them: Vodafone Flex, RED, Vodafone Plus, Vodafone Cash, Ana Vodafone, El-Kart. Never translated.
- The guide's name is an open question (PRD §12). Until decided it is "Vodafone guide" / "مساعد ڤودافون", and **not** TOBi.

## 6. Do and don't

| Do | Don't |
|---|---|
| Use `#e60000` for the one primary action in view | Use red for decoration or large fills behind text |
| Keep 6px radius on everything rectangular | Use pills (except the round floating buttons) |
| Use Vodafone's own gradient only on header strips | Invent gradients, glass effects or neon |
| Respect `prefers-reduced-motion` | Animate layout properties; animate only `transform` and `opacity` |
| Keep contrast at WCAG AA or better. Measured: white on `#e60000` 4.81:1 (passes, keep text ≥14px), white on `#990000` 8.92:1, `#333` on `#f4f4f4` 11.49:1, `#666` on white 5.74:1 | Use `--vf-ink-3` (`#999`, 2.85:1 on white) for any text; it is for dividers and disabled icons only |

## 7. Acceptance

1. Visual snapshots of each component (idle, active, error) on `/en/home`, `/ar/home` and a `/spa/` page match the reference screenshots in `tests/visual/` within 1% pixel difference.
2. Computed styles of the microphone button equal the audit values for fill, ring and shadow.
3. No component computes to a font family outside the token list, on CMS and `/spa/` pages (checked in the end-to-end tests).
4. Contrast of every text style in the guide is ≥ 4.5:1, or ≥ 3:1 for large text (automated check).
