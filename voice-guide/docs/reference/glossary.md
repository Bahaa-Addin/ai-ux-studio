# Glossary

| Term | Meaning here |
|---|---|
| **Accessibility widget** | Vodafone's own floating red button (`#vodafone-aw-icon`) and panel for text size, dyslexia font and sign language. Never covered or replaced by the guide. |
| **Activation** | Making a knowledge base version the one the services use (`kb_active`). Automatic only when the sync gate passes. |
| **ADR** | Architecture decision record in `docs/adr/`. Every decision has one, with pilot knobs and revisit conditions. |
| **Agent (fallback)** | page-agent 1.12.4, wrapped. Acts on the page when the knowledge base cannot plan a request. One LLM call per step. |
| **Barge-in** | Pressing the microphone while the guide speaks: speech stops and listening starts. |
| **CMS page** | A Liferay page under `/en/` or `/ar/` on `web.vodafone.com.eg`. Full page loads. |
| **Commit point** | A control that spends money, changes a line or a contract, or gives consent. The guide never presses one. |
| **Curated overlay** | The human-maintained part of the knowledge base (`config/curated/<site>.yaml`): phrasings, flows, commit points. |
| **Decider** | The step that picks one destination from the retrieved candidates: local scorer, Jev or Laya. |
| **Demo browser** | A Playwright-launched Chromium with a dedicated profile that injects the guide's loader into Vodafone pages (mode B, ADR-0026). |
| **Destination** | Something a person asks for in the knowledge base: a page, section, item, action, picture, collection or FAQ answer. |
| **Gate** | The checks a new knowledge base version must pass to activate on its own (SPEC-04 §5). |
| **Handoff token** | `#vgh=…`, single use, 60s: carries the session across origins (web → shop). |
| **Halo** | The red disc behind the microphone that grows and fades with the voice level. |
| **Jev, Laya** | Decision models called through the System One API (ADR-0014). |
| **Live values** | Prices, amounts and balances read from the page when answering, never stored. |
| **Loader** | The one `<script src=…/sdk/guide.js data-site-key=…>` element, added by Tealium (mode A) or the demo browser (mode B). |
| **Mode A / B / E** | How the guide reaches a page: tag manager / demo browser / clone (SPEC-03 §1). |
| **Plan** | The server's step list for the SDK (plan contract v1): navigate, waitForPage, reveal, scrollTo, pickItem, spotlight, say, click, confirm, offerWatch, ask, agent. |
| **Seeds** | The navigation pages every crawl starts from; with their links they define the crawl scope. |
| **SPA page** | A page of the Angular app under `/spa/`; moving between them changes the URL without a page load. |
| **Sync** | One run of the live knowledge pipeline: plan, crawl, describe, build, diff, gate, activate or hold. |
| **Transcript bar** | The small black bar above the microphone that shows the words as they are heard. |
| **X-ray** | The demo panel that shows, from real traces, how each request was understood and how long each layer took. |
