# Page Agent × Vodafone Services — raw demo

Branch: `experiment/page-agent`. Based on `fc52fe2` of `Bahaa-Addin/ai-ux-studio`.

This builds on the [official one-line quick start](https://github.com/alibaba/page-agent#-quick-start), pinned to the documented `page-agent@1.12.4` demo script. No API key, package installation, or backend is needed. The script uses `autoInit=false` so a small local adapter can configure language. On the integrated branch the demo is off by default: `src/page-agent-loader.js` loads it only with `?demo=page-agent` or `?agentLang=ar`, because it sends page content to the upstream testing LLM and its controls cover the "Reimagine this page" launcher.

## Run

From this branch's root, with Node 18+:

```sh
cd experiences
node scripts/serve.mjs --port 5182
```

Open http://127.0.0.1:5182/?demo=page-agent for English, or http://127.0.0.1:5182/?agentLang=ar for Arabic. The language selector reloads the page and starts a fresh session.

English uses the native upstream panel. Version 1.12.4 has no Arabic UI locale, so Arabic mode uses a small local RTL form with Run/Stop controls and Arabic response instructions, backed by the same PageAgent engine. The Vodafone page content is not translated.

## Try

1. Ask: `Scroll to the Stay In Control section. Do not open any links.`
2. Ask: `Find the Shokran services carousel and click its next arrow once. Stay on this page.`
3. Ask: `What services can you see in the current section? Do not navigate away.`

Observe the target highlighted by the agent and compare its action with the request. Record success/failure and latency. The clone's header, footer, and service links open real Vodafone destinations in new tabs, so use local scroll/carousel tasks when you want the demo to remain on the clone.

## Upstream limitations

- Internet access to jsDelivr and the free testing LLM is required. Availability/rate limits are controlled upstream; a working panel does not prove that the LLM endpoint is available.
- The demo is for technical evaluation. It sends prompts and page content to the upstream testing service; see its [terms and privacy](https://github.com/alibaba/page-agent/blob/main/docs/terms-and-privacy.md). Use only the public clone content here.
- English uses the upstream UI; Arabic uses a local RTL form. Both use the upstream demo model configuration. To use your own model later, follow the repository's NPM quick start or its `?autoInit=false` option.

To remove the experiment, remove the demo script from `index.html` and restore the `initComposer` import/call in `src/main.js`, or return to the base branch.

## Verified on 2026-10-24

- Official CDN script loaded and initialized the hosted `qwen3.5-plus` demo.
- Live English prompt asked it to advance the Shokran carousel once and stay on the page. It completed in two steps; carousel `scrollLeft` became `1010` and the URL remained local.
- The upstream demo controls default to Chinese (`zh-CN`); adding “Reply in English” produced an English completion. The language adapter now initializes English explicitly and supplies Arabic response instructions in Arabic mode.
- Existing 19 content/schema/template tests passed. No production build is needed for the dependency-free server workflow used here.

## English and Arabic update

- Default mode now explicitly uses `en-US`; the page has an English/Arabic selector.
- Arabic mode was tested live with `انتقل إلى قسم خدمات شكراً واضغط السهم التالي مرة واحدة. ابق في هذه الصفحة وأجب بالعربية.` The agent completed, replied in Arabic, and moved the carousel to `scrollLeft: 1010` without navigating away.
- Arabic controls are a local adaptation, not an upstream Arabic locale. Internal diagnostic/tool messages can still be English.

## Live service destinations

The Great Entertainment cards now have working Vodafone links. Play&Win opens its official Vodafone page. The other six services open Vodafone's official Ana Vodafone deep link, matching the live Services page's shared app/QR subscription flow. Links open in a new tab so Page Agent can follow them without replacing the local experiment.

The cloned Vodafone shell also uses the live page's real destinations for its top switcher, language selector, logo, primary navigation, search, social icons, footer columns and legal links. The profile control remains a button because the live page opens an authenticated login prompt rather than exposing a public URL.
