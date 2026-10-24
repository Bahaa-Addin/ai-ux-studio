# Page Agent × Vodafone Services — raw demo

Branch: `experiment/page-agent`. Based on `fc52fe2` of `Bahaa-Addin/ai-ux-studio`.

This uses the [official one-line quick start](https://github.com/alibaba/page-agent#-quick-start), pinned to the documented `page-agent@1.12.4` demo script. No API key, package installation, custom agent, or backend is needed. The existing AIXC launcher is disabled for this experiment; the original Services page and carousels remain intact.

## Run

From this branch's root, with Node 18+:

```sh
cd vodafone-services-clone
node scripts/serve.mjs --port 5182
```

Open http://127.0.0.1:5182/ and use the Page Agent panel.

## Try

1. Ask: `Scroll to the Stay In Control section. Do not open any links.`
2. Ask: `Find the Shokran services carousel and click its next arrow once. Stay on this page.`
3. Ask: `What services can you see in the current section? Do not navigate away.`

Observe the target highlighted by the agent and compare its action with the request. Record success/failure and latency. The page is a clone: header/footer links may be placeholders; service links can open the live Vodafone site, so use local scroll/carousel tasks for this demo.

## Upstream limitations

- Internet access to jsDelivr and the free testing LLM is required. Availability/rate limits are controlled upstream; a working panel does not prove that the LLM endpoint is available.
- The demo is for technical evaluation. It sends prompts and page content to the upstream testing service; see its [terms and privacy](https://github.com/alibaba/page-agent/blob/main/docs/terms-and-privacy.md). Use only the public clone content here.
- This is the upstream UI and default model configuration. To use your own model later, follow the repository's NPM quick start or its `?autoInit=false` option.

To remove the experiment, remove the demo script from `index.html` and restore the `initComposer` import/call in `src/main.js`, or return to the base branch.

## Verified on 2026-10-24

- Official CDN script loaded and initialized the hosted `qwen3.5-plus` demo.
- Live English prompt asked it to advance the Shokran carousel once and stay on the page. It completed in two steps; carousel `scrollLeft` became `1010` and the URL remained local.
- The upstream demo controls default to Chinese (`zh-CN`); adding “Reply in English” produced an English completion. This experiment preserves those upstream defaults.
- Existing 19 content/schema/template tests passed. No production build is needed for the dependency-free server workflow used here.
