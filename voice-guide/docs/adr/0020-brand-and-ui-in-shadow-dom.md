# ADR-0020: The guide's UI lives in one shadow root and takes its colour, font and corner style from the host page

- Status: Accepted (demo slice)
- Date: 2026-10-23
- Area: UI and brand
- Code: `packages/sdk/src/ui.ts`, `theme.ts`, `i18n.ts`

## Context

The guide must look like part of each brand's site (a standing requirement: keep the site's palette, fonts and design language), must not break the site's CSS, and must not be broken by it. It must work right-to-left for Arabic and left-to-right for English, switching mid-conversation.

## Decision

1. **One custom element** (`<vg-guide>`) with an open shadow root holds every piece of UI: launcher, panel, spotlight, pointer, caption bubble, toast and X-ray drawer. Page CSS cannot reach in; ours cannot leak out.
2. **Theme from the page, nothing invented:** accent = background colour of the page's own primary buttons (first opaque, saturated one), with their corner radius; font = the page's body font; text colour on the accent chosen for contrast. `ui.accent` in the site config overrides the accent.
3. **Direction follows the language of the conversation** (`dir` on the root), not only the page. The X-ray drawer is a developer panel: always left-to-right, docked left.
4. **Motion that can be followed on a projector:** the spotlight dims the page around the target and follows it on scroll; a pointer glides to each element before the guide clicks; all of it respects `prefers-reduced-motion`.
5. **Accessible:** real buttons with labels in both languages, an `aria-live` log, keyboard focus styles, a typing box, everything spoken is also written.
6. **Commit points look different:** the confirm step uses an amber spotlight and says plainly that the person must press the button.

## Options considered

| Option | Outcome |
|---|---|
| iframe widget | Rejected: cannot draw a spotlight over the host page or point at its elements. |
| Plain DOM with prefixed classes | Rejected: host CSS (resets, `* {}` rules) breaks it on real sites. |
| A brand theme file per site | Deferred: the derived theme matched the fixture brand without configuration; a file can be added when a brand needs exact tokens. |

## Consequences

- The guide is invisible to the fallback agent (`data-page-agent-ignore`, ADR-0017).
- A page whose buttons are all white or black falls back to its link colour, then to a neutral teal; check each real brand once.
- The recording found two UI bugs the tests had missed (the X-ray drawer visible on right-to-left pages; notifications repeated after a page load). Both are fixed and now asserted in the end-to-end tests.

## Pilot knobs

| Knob | Default | Effect |
|---|---|---|
| `ui.accent` (site) | derived | Force the brand colour. |
| `ui.xray` (site) or `data-xray` on the tag | `button` | `off`, `button` or `open`. |
| `data-open="true"` on the tag | off | Open the panel on load (kiosks, demos). |

## Revisit when

- The brand team asks for the panel in a specific component style: add a theme file per site rather than deriving.

## Verified by

- `tests/e2e/guide.e2e.test.ts`: `dir` switches between `rtl` and `ltr` with the conversation; the closed X-ray drawer is off-screen on right-to-left pages; spotlight geometry frames the expected element.
