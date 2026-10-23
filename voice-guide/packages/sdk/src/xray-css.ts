/** The X-ray drawer's styles, in the Vodafone palette (SPEC-01; loaded with the X-ray chunk). */
export const XRAY_CSS = `
/* Vodafone night background and palette only (SPEC-01; open issue O14). */
.xray { position: fixed; z-index: 2147483603; top: 0; bottom: 0; left: 0; width: min(420px, 92vw); background: #14141e; color: #e6e6e6; font: 12.5px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; transform: translateX(-102%); transition: transform .25s ease; display: flex; flex-direction: column; direction: ltr; }
.xray.open { transform: none !important; }
.xray header { padding: 14px 16px; border-bottom: 1px solid #333333; display: flex; align-items: baseline; gap: 10px; }
.xray header b { font-family: inherit; font-size: 15px; color: #ffffff; }
.xray header span { color: #cccccc; }
.xray .totals { padding: 10px 16px; border-bottom: 1px solid #333333; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.xray .totals div { background: #333333; border-radius: 6px; padding: 6px 8px; }
.xray .totals em { display: block; font-style: normal; color: #cccccc; font-size: 11px; }
.xray .totals strong { font-size: 16px; color: #ffffff; }
.xray .turns { flex: 1; overflow-y: auto; padding: 8px 12px 16px; }
.turn { border: 1px solid #333333; border-radius: 6px; margin: 8px 0; overflow: hidden; }
.turn > .u { padding: 8px 10px; background: #333333; color: #ffffff; font-size: 14px; }
.ev { display: grid; grid-template-columns: 74px 1fr 58px; gap: 6px; padding: 4px 10px; border-top: 1px solid #333333; }
.ev .layer { color: #ffffff; }
.ev .layer.agent { color: #ffffff; text-decoration: underline; }
.ev .layer.err { color: #ffffff; background: #e60000; border-radius: 4px; padding: 0 4px; justify-self: start; }
.ev .ms { text-align: end; color: #cccccc; }
.ev .d { color: #e6e6e6; overflow-wrap: anywhere; }
.badge { display: inline-block; border-radius: 6px; padding: 0 6px; font-size: 11px; margin-inline-end: 4px; background: #666666; color: #ffffff; }
.badge.replay { background: #990000; }
.badge.agent { background: #e60000; }
.badge.clarify { background: #666666; }
@media (prefers-reduced-motion: reduce) { .xray { transition: none; } }
`
