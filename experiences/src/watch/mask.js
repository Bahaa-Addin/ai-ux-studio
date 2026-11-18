/**
 * The page watch's mask (voice-guide ADR-0078 point 4; ADR-0018): page text is masked before it is
 * hashed, so no personal data reaches even a hash's input. A port of maskContent from
 * voice-guide/packages/sdk/src/agent-mask.ts, rule for rule: that file is TypeScript in another package,
 * the clone serves the layer's sources as they are, and the guide's own copy is not reachable from the
 * layer without a shared chunk. tests/watch-mask.test.mjs checks the rules are the SDK's, pattern for
 * pattern, and that both mask alike; a change there is copied here (and READER_VERSION in read.js bumped).
 */

const OTHER_DIGITS = /[٠-٩۰-۹０-９]/g
/** Arabic-Indic, Extended Arabic-Indic and full-width digits to ASCII, so one set of patterns covers them all. */
export const asciiDigitsOf = (s) => s.replace(OTHER_DIGITS, (d) => String(d.charCodeAt(0) - (d < '۰' ? 0x660 : d < '０' ? 0x6f0 : 0xff10)))
/** Marks nobody sees (zero-width spaces and joiners, direction marks): they sit between digits in right-to-left text. */
const INVISIBLE = /[​-‏‪-‮⁠-⁩﻿]/g

/** Order matters: the most specific pattern first. The comments are agent-mask.ts's. */
const RULES = [
  // Anchored at the start of a run, so a long run of letters is tried once, not at every position (AIXC-81).
  [/(?<![\w.+-])[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]'],
  // Egyptian national ID: 14 digits, century digit 2 or 3.
  [/(?<![\w\d])[23]\d{13}(?![\w\d])/g, '[national-id]'],
  // Card numbers, grouped by spaces, dashes or dots (AIXC-90).
  [/(?<![\w\d])(?:\d[ .\-–]{0,3}){12,18}\d(?![\w\d])/g, '[card]'],
  // An Egyptian mobile written in groups; after the card rule, which takes the longer runs.
  [/(?<![\w\d])(?:\(?(?:\+|00)20\)?[\s.\-–—/]{0,3}(?:\(?0\)?[\s.\-–—/]{0,3})?\(?1[0125]\)?|\(?01[0125]\)?)(?:[\s.\-–—/]{0,3}\d){8}(?![\w\d])/g, '[phone]'],
  // The same with the prefix or the leading zero split or missing (AIXC-90); a bare 20 needs a separator after it.
  [/(?<![\w\d])(?:\(?(?:\+|00)20\)?[\s.\-–—/]{0,3}|\(?20\)?[\s.\-–—/]{1,3})?\(?0?[\s.\-–—/]{0,3}1[\s.\-–—/]{0,3}[0125]\)?(?:[\s.\-–—/]{0,3}\d){8}(?![\w\d])/g, '[phone]'],
  [/(?<![\w\d])(?:\+?20|0)1[0125]\d{8}(?![\w\d])/g, '[phone]'],
  // A landline, with its area code after a 0 or the country code (AIXC-90).
  [/(?<![\w\d])(?:(?:\+|00)20[\s.\-–—/]{0,3}\(?0?|20[\s.\-–—/]{1,3}\(?0?|\(?0)[2-9]\d?\)?[\s.\-–—/]{0,3}\d{3,4}[\s.\-–—/]{0,3}\d{4}(?![\w\d])/g, '[phone]'],
  // Any other long number (account and line numbers); prices and amounts are shorter.
  [/(?<![\w\d.,])\d{10,}(?![\w\d])/g, '[number]'],
]

/** `content` with personal data replaced by labels; `onMask(label)` is told each one. */
export function maskContent(content, onMask) {
  let out = asciiDigitsOf(content).replace(INVISIBLE, '')
  for (const [re, label] of RULES)
    out = out.replace(re, () => {
      onMask?.(label)
      return label
    })
  return out
}
