# ADR-0029: On Vodafone sites the guide uses a fixed Vodafone token set, not a theme read from the page

- Status: Proposed; SPEC-01 acceptance 2 passes (computed microphone styles, `tests/e2e/live-replay.e2e.test.ts`) and the palette is checked in `tests/unit/voice.test.ts`. Open: visual snapshots (1), font check on every node (3), contrast check (4).
- Date: 2026-10-23
- Area: UI and brand; amends ADR-0020 (themed from the host page)
- Spec: [SPEC-01](../specs/SPEC-01-vodafone-design-language.md)

## Context

ADR-0020 derives the accent from the page's primary buttons and the font from `body`. On Vodafone's live site that is not reliable:
- `/spa/` pages leave `body` unstyled, so the font computes to Times;
- the shop uses different font names (`vodafone-regular`) and 2px buttons;
- the requirement is the Vodafone design language everywhere, including where a page drifts from it.

The team already captured the tokens (`vodafone-services-clone/docs/design-system.md`), and the AIXC requirement says all transformations keep Vodafone's palette, fonts and design language.

## Decision

1. A **Vodafone theme pack** in the SDK (`packages/sdk/src/theme/vodafone.ts`): the CSS custom properties in SPEC-01 §2, selected by site config `ui.theme: vodafone`.
2. **Fonts by language of the text**, using the page's own Vodafone font faces; Arial or Tahoma as fallbacks, never Times.
3. `themeFromPage()` stays for other sites (`ui.theme: page`, the default).
4. The tokens share AIXC's `vodafone.css` values for reds (`#e60000`, `#990000`), greys (`#333`, `#666`, `#999`, `#ccc`, `#f4f4f4`), the button radius (6px), the floating shadow (`0 2px 8px rgba(0,0,0,.16)`) and the English font families; a unit test compares that subset. They differ on purpose in one place: AIXC's cards use 8px corners, while the guide uses 6px, which is what the live site's `.tiles` cards and buttons use (audit §4).

## Consequences

- One source of brand truth shared by AIXC and the guide.
- If Vodafone rebrands, one file changes.

## Pilot knobs

`ui.theme` (`vodafone` | `page`), `ui.accent` (still overrides the red, for a sub-brand).

## Revisit when

- Vodafone publishes design tokens of its own (for example a design-system package): import them instead.

## Verified by (planned)

- `tests/unit/theme.test.ts`: tokens equal SPEC-01 and AIXC's `vodafone.css` values.
- `tests/e2e/voice-ui.e2e.test.ts`: computed fonts on CMS, `/spa/` and shop pages.
