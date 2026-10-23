/**
 * Vodafone theme pack (ADR-0029, SPEC-01): fixed tokens, not read from the page (on /spa/ pages
 * the body font computes to Times). Fonts are Vodafone's own faces, loaded by the page; the
 * order depends on the language of the UI so Arabic text uses the Arabic face.
 */
import type { Theme } from '../theme.ts'

export const VODAFONE_THEME: Theme = { accent: '#e60000', accentInk: '#ffffff', font: 'var(--vf-font)', radius: '6px' }

/** Tokens (SPEC-01 §2) and the restyle of the existing components (SPEC-01 §3). */
export const VODAFONE_CSS = `
.root {
  --vf-red: #e60000; --vf-red-dark: #990000; --vf-red-gradient: linear-gradient(to right top, #990000, #e60000);
  --vf-ink: #333333; --vf-ink-2: #666666; --vf-bg: #f4f4f4; --vf-surface: #ffffff; --vf-night: #14141e;
  --vf-shadow-btn: 0 3px 6px rgba(0,0,0,.1); --vf-shadow-float: 0 2px 8px rgba(0,0,0,.16);
  --vf-font: vodafone-regular-en, vodafone-regular, vodafone-regular-ar, Arial, Tahoma, sans-serif;
  --vf-font-bold: vf-bold-en, vodafone-bold-en, vf-bold-ar, Arial, Tahoma, sans-serif;
  color: var(--vf-ink); font-size: 16px; line-height: 1.5;
}
.root[lang="ar"] { --vf-font: vodafone-regular-ar, vodafone-regular-en, Tahoma, Arial, sans-serif; --vf-font-bold: vf-bold-ar, vf-bold-en, Tahoma, Arial, sans-serif; }
button:focus-visible, input:focus-visible { outline: 3px solid #00b0ca; outline-offset: 2px; }
.panel { right: calc(16px + env(safe-area-inset-right, 0px)); left: auto; bottom: calc(167px + env(safe-area-inset-bottom, 0px)); border-radius: 6px; box-shadow: var(--vf-shadow-float); max-height: min(520px, calc(100vh - 190px)); }
.head { background: var(--vf-red-gradient); color: #fff; }
.head .title { font-family: var(--vf-font-bold); font-weight: normal; }
.msg { border-radius: 6px; }
.msg.user { background: var(--vf-bg); color: var(--vf-ink); }
.msg.guide { background: #fff; border-inline-start: 3px solid var(--vf-red); box-shadow: 0 2px 4px rgba(0,0,0,.075); }
.msg.note, .hint, .live { color: var(--vf-ink-2); }
.chip { border-radius: 6px; border: 1px solid var(--vf-red); color: var(--vf-red); padding: 6px 12px; }
.chip:hover { background: #fff5f5; }
.bar input { border-radius: 6px; border-color: #cccccc; }
.mic, .send { border-radius: 50%; }
.mic { background: var(--vf-red); color: #fff; }
.send { background: var(--vf-bg); color: var(--vf-ink); }
.spot { border-radius: 6px; box-shadow: 0 0 0 3px var(--vf-red), 0 0 0 9px rgba(230,0,0,.35), 0 0 0 9999px rgba(20,20,30,.38); }
.bubble { background: #fff; color: var(--vf-ink); border-radius: 6px; border-top: 3px solid var(--vf-red); box-shadow: var(--vf-shadow-float); font-size: 16px; }
.pointer { background: var(--vf-red); }
.toast { border-radius: 6px; border-inline-start-color: var(--vf-red); box-shadow: var(--vf-shadow-float); }
.xray { background: var(--vf-night); }
.badge.replay { background: var(--vf-red-dark); }
`
