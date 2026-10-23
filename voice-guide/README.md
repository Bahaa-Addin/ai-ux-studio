# Voice guide

> **Current phase: Vodafone live.** The guide moves onto the real Vodafone Egypt website with a voice-first microphone UI, Vodafone's design language and a knowledge base kept in step with the live site. Start with [`AGENTS.md`](AGENTS.md), the [handoff](docs/handoff/HANDOFF.md) and the [build prompt](docs/prompts/vodafone-live-demo.prompt.md). All documents: [`docs/README.md`](docs/README.md).

A guide that works on top of any existing website. A person asks it something out loud, in Egyptian Arabic or English, and it guides them to the answer on the site itself. It goes to the right page, opens the hidden tab, scrolls, puts a spotlight on the answer and reads the live value aloud. It also follows the person into the web app on another domain and tells them when something they watched changes. When the request is outside what the guide knows, a fallback agent (page-agent) does the action on the page. The guide never presses a commit button.

This repository is the demo build. The parts are real: the SDK, the gateway, five services, Postgres, the ingestion jobs and page-agent. Stand-ins are used only where the system meets the outside world (ADR-0024). Every architecture decision is recorded in [`docs/adr`](docs/adr/README.md), with the settings to tune for the pilot and the measurement that should reopen it.

## Run it on the Vodafone website

```sh
npm install && npx playwright install chromium
npm run demo:live                 # live site, in your Google Chrome, starting on /ar/home
npm run demo:live -- --replay     # offline, on Vodafone pages saved on 2026-10-23
```

No Postgres needed. The full procedure (microphone check, knowledge-base refresh from public pages, the paused schedule, troubleshooting) is in the [runbook](docs/ops/runbook.md).

## How it fits together

```
 Browser (any page of the site)                     Platform
 ┌─────────────────────────────┐        ┌───────────────────────────────────────────┐
 │ <script src=".../guide.js"  │  HTTPS │ Gateway: site key, origin check, limits,  │
 │   data-site-key=...>        │ ─────► │ SSE events, SDK files                     │
 │                             │        │   │ in process or over HTTP (VG_SERVICES) │
 │ SDK (42 KB): speech, UI in  │        │   ├─ router     understand → plan         │
 │ shadow DOM, plan executor,  │        │   ├─ knowledge  active KB per site        │
 │ X-ray                       │        │   ├─ sessions   state across pages/origins│
 │ agent.js (on demand):       │        │   ├─ agent      LLM proxy for page-agent  │
 │ page-agent 1.12.4, wrapped  │        │   └─ watch      rendered checks, push     │
 └─────────────────────────────┘        │ Postgres: KB versions, sessions, watches, │
                                         │ traces (LISTEN/NOTIFY for live events)    │
 Ingestion jobs (offline)                └───────────────────────────────────────────┘
 crawler (Chromium) → describer (images, canvas, SVG, WebGL) → KB builder + curated overlay
 → a validated, versioned site-knowledge/0.1 manifest, activated explicitly
```

The main path uses no LLM. The router finds candidate destinations in the site knowledge base (BM25 and trigrams over Arabic and English, with dialect synonyms). Then a decider picks one: Jev, Laya or a local scorer. The planner turns that choice into a plan, and the SDK runs the plan on the page. A step that needs a model (the fallback agent, or an image description at crawl time) goes through one proxy that holds the keys and enforces budgets.

## Quick start

You need Node 22.18 or later and Postgres 14 or later. Chromium comes with Playwright.

```bash
npm install                      # dependencies are pinned (ADR-0008)
docker run -d --name vg-pg -p 54329:5432 \
  -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=voiceguide postgres:16
psql postgres://postgres:devpass@127.0.0.1:54329/postgres -c "create database voiceguide_test"
npm run db:migrate
npm run dev                      # builds the SDK, serves the fixture site, ingests, starts the gateway
```

Open the page URL that `npm run dev` prints, in Chrome. Press the microphone (or type) and ask "إيه أرخص باقة نت؟" or "What's the cheapest internet bundle?". Add `--xray open` to show the X-ray panel from the start.

Without a model key, requests that need the fallback agent get a short "I can't search the page right now" in the person's language. Without a vision key, images are described from markup and the curated overlay. Without a Jev key (or a Laya URL), the router uses the local scorer.

## Using it on a cloned site

1. Copy `config/sites/demo-telco.yaml` to `config/sites/<site>.yaml`. Set the origins (with `serve` pointing to a folder if you serve the clone from disk), the crawl start pages and the site key.
2. Copy `config/curated/demo-telco.yaml` and keep only what the crawler cannot know: Egyptian Arabic phrasings, flows, commit buttons and visual descriptions.
3. Run `npm run ingest -- --site <site> --dry-run` and read the report in `data/reports/`. Fix the overlay, then run it again with `--activate`.
4. Run `npm run eval:router -- --site <site>` on real requests (see [`docs/pilot-tuning.md`](docs/pilot-tuning.md)).
5. Put the script tag on the pages: `<script src="https://<gateway>/sdk/guide.js" data-site-key="<key>" async></script>`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | The whole demo on one machine. |
| `npm run gateway` | The gateway alone, with services in process (`VG_SERVICES=local`) or remote (`http`). |
| `npm run service -- <router\|knowledge\|sessions\|agent\|watch>` | One service on its own port, for scaling it separately. |
| `npm run ingest -- --site <id> [--activate] [--dry-run]` | Crawl, describe, build and validate the knowledge base. |
| `npm run demo:live [-- --replay] [--start <url>] [--kiosk] [--xray open]` | The guide on the Vodafone website (or saved pages) in Google Chrome, with the gateway and knowledge base, from one command. |
| `npm run sync -- --site vodafone-eg [--origin web] [--dry-run] [--from-crawl <dir>]` | On-demand refresh from public pages: crawl, build, gate, activate or hold. Scheduled runs are refused while paused. |
| `npm run kb -- --site <id> --status\|--activate <id>\|--rollback <id>\|--import <file>\|--export <file>` | Knowledge-base versions in the store. |
| `npm run live-crawl:bundle`, `npm run live-crawl:import` | Crawl from a browser tab when the machine running npm cannot reach the site (ADR-0032). |
| `npm run eval:router -- [--site] [--cases] [--decider local\|jev\|laya]` | Router accuracy and latency on a set of requests. |
| `npm test` | Unit and integration tests (real Postgres, real Chromium for ingestion). |
| `npm run test:e2e` | The demo flow in Chromium, end to end. |
| `npm run typecheck` | Both TypeScript projects. One known upstream mismatch is allowlisted (ADR-0017). |
| `npm run record:demo -- --out <dir>` | Records the demo flow to an MP4 with captions. |
| `npm run docs:diagrams` | Renders and syntax-checks the Mermaid diagrams in `docs/diagrams/`. |

## Measured on the demo build (2026-10-23)

| Measure | Result |
|---|---|
| Tests | 68 of 68 pass: 56 unit and integration, 12 end to end |
| Router, tuning set (54 requests, Arabic and English) | 54/54 |
| Router, held-out set (24 requests, never tuned on) | 18/24 fully correct, 22/23 right destination. The misses are dialect words for intents. |
| Server time per request | p50 32 ms, p95 45 ms |
| Request to first visible movement | p50 70 ms, p95 94 ms |
| Demo requests answered without an LLM | 6 of 7 |
| SDK | 43 KB (15 KB gzipped); agent chunk 133 KB, loaded only when needed |

All figures come from one machine with no network between the browser and the services. Speech was simulated and a stand-in model was used. The pilot will be slower; [`docs/pilot-tuning.md`](docs/pilot-tuning.md) has the queries to measure it.

## What is real and what is a stand-in

| Part | In this build |
|---|---|
| SDK, gateway, services, Postgres, ingestion, page-agent | Real |
| Sites | A fixture site with two origins (a website and a web app) stands in for the team's clones. It has the same patterns: Arabic and English pages, hidden tabs, an image-only banner, a WebGL coverage map and a checkout. |
| Jev, Laya | Wired to the System One API; local stand-in in tests. Needs keys for the pilot. |
| Fallback agent model | Any OpenAI-compatible endpoint through the proxy; stand-in in tests and the recording. |
| Vision model (image descriptions at crawl time) | Any OpenAI-compatible vision endpoint; stand-in in tests. |
| Speech | The browser's Web Speech API; simulated in tests. |
| Web Push | Real encryption and VAPID; a local push server in tests. A live channel through the open page is the fallback. |

## Where to look

- [`docs/adr/README.md`](docs/adr/README.md): the decisions (ADR-0006 to ADR-0025 accepted; ADR-0026 to ADR-0030 proposed for the Vodafone live phase), what each changed, and the bugs that changed them.
- [`docs/pilot-tuning.md`](docs/pilot-tuning.md): every setting, its default, which measurement moves it, and SQL over the traces.
- [`docs/kb-standard.md`](docs/kb-standard.md): the site knowledge standard 0.1, with its JSON Schema. `docs/plan-contract.schema.json` is the schema of the plans the server sends to the SDK.
- `packages/sdk`: the browser SDK. `services/`: gateway and services. `jobs/`: ingestion. `packages/kb`, `packages/text`: the shared standard and text matching.
