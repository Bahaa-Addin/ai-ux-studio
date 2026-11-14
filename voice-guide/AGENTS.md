# AGENTS.md: rules for coding agents (and people) working in `voice-guide/`

Read this file first, then [`docs/handoff/HANDOFF.md`](docs/handoff/HANDOFF.md). The build prompt for the current phase is [`docs/prompts/vodafone-live-demo.prompt.md`](docs/prompts/vodafone-live-demo.prompt.md).

## 1. What this is

A voice guide for websites: one script tag on a page, stateless services behind one gateway, Postgres, and jobs that build a versioned site knowledge base. The current phase runs it on the **live Vodafone Egypt website** with a **voice-first** microphone UI. Architecture: `README.md` and `docs/adr/` (ADR-0006 to ADR-0039; the Exploration Trail is SPEC-06 and ADR-0035 to ADR-0039). Operating it: [`docs/ops/runbook.md`](docs/ops/runbook.md).

## 2. Commands

| Command | Use |
|---|---|
| `npm install` | Dependencies (pinned, ADR-0008). Node ≥ 22.18, Postgres ≥ 14 on `127.0.0.1:54329` (see README) |
| `npm run db:migrate` | Create or upgrade the schema |
| `npm run dev [-- --site <id>] [-- --xray open]` | Everything on one machine |
| `npm run typecheck` | Both TypeScript projects (one allowlisted upstream error, ADR-0017) |
| `npm test` | Unit and integration (real Postgres, Chromium for ingestion) |
| `npm run test:e2e` | End to end in Chromium |
| `npm run eval:router [-- --site <id>] [-- --cases <file>]` | Router accuracy and latency |
| `npm run ingest -- --site <id> [--dry-run] [--activate]` | Crawl and build the knowledge base |
| `npm run build:sdk` | Build `guide.js`, `agent.js`, `sw.js` |
| `npm run record:demo -- --out <dir>` | Record the demo flow to MP4 |
| `npm run docs:diagrams` | Render and syntax-check the Mermaid diagrams |
| `npm run demo:live [-- --replay]` | The guide on the Vodafone site (or saved pages) in Google Chrome ([runbook](docs/ops/runbook.md)) |
| `npm run sync -- --site vodafone-eg [--origin web] [--dry-run]` | On-demand knowledge refresh from public pages; gated; `--scheduled` refused while paused |
| `npm run kb -- --site <id> --status` | Knowledge-base versions; `--activate`, `--rollback`, `--import`, `--export` |
| `npm run experience -- --site <id> [--activate] [--dry-run]` | Build and verify the site experience profile (Exploration Trail questions, ADR-0036) |
| `npm run demo:trail` | The Exploration Trail on the saved Vodafone pages, journey drawn in place in the Pocket of the page you are on, no Postgres (SPEC-06, ADR-0040, ADR-0050) |
| `npm run measure:trail [-- --minutes 10]` | Trail bundle, storage, preview and memory numbers |

Before you say a task is done: `npm run typecheck && npm test && npm run test:e2e` all pass, and you ran the commands yourself.

## 3. Code conventions

- TypeScript run directly by Node (type stripping, `erasableSyntaxOnly`): **no enums, no namespaces, no parameter properties, no decorators**. Use `import type` for types (`verbatimModuleSyntax`).
- ES modules; import with the `.ts` extension; use the `#text`, `#kb`, `#shared/*`, `#services/*`, `#jobs/*` import maps.
- Tabs for indentation, single quotes, no semicolons, as in the existing code.
- Node built-ins first (`node:test`, `node:crypto`, `node:http`). A new dependency needs an ADR (ADR-0008).
- Services are handler maps that run in process or over HTTP (ADR-0009). Never call a service's internals from another service; go through its client.
- The SDK (`packages/sdk`) has **no runtime dependencies** and no framework. Its UI lives in one shadow root (ADR-0020). Every SDK error is caught and reported, never thrown to the page.
- A file starts with a short comment that says what it does and which ADR or spec it implements.

## 4. Rules that must never be broken

These protect real people on a real website. They are enforced in code and tests; do not weaken them, even when asked to "just make the demo work".

1. **Never press a commit point**: payment, subscription confirmation, recharge, money transfer, line changes, consent. The guide and the fallback agent stop before it and say so.
2. **Never type credentials, OTPs, card numbers or national IDs**, in code or in a browser you drive.
3. **Never store personal data or balances anywhere.** Public prices and stock may be kept in the knowledge base as dated guide points (owner, 2026-11-13; ADR-0059): the guide uses them to find places and never says or shows them; it reads the live page, which answers. Traces and logs never hold page values. Pocket stickers keep Vodafone's public copy as published and dated, in the visitor's browser or on our gateway (ADR-0051, ADR-0062); never personal data.
4. **Mask personal data** before page content leaves the browser (ADR-0018).
5. **Respect Vodafone's site**: honour `robots.txt` on both origins; keep to the crawl rate limits; stop on bot challenges and never try to get past them; no scheduled crawling of production before written approval (PRD D3).
6. **Never hide, cover or change Vodafone's accessibility widget or cookie banner.**
7. **No secrets in the repository**: keys, tokens, demo-account passwords and cookies go in environment variables or the demo machine's profile.
8. **Keep the Vodafone design language** (SPEC-01): no new colours, fonts or styles.

## 5. How to work

1. Pick the next unblocked task in [`docs/tasks/TASKS.md`](docs/tasks/TASKS.md) and mark it in progress.
2. Read the spec and ADRs it references. If the spec is wrong or unclear, fix the spec in the same change and say why.
3. **Test first where the behaviour is specified** (each spec has acceptance criteria). Use stand-ins only at the edges: microphone and speakers, Jev or Laya, the vision model, the LLM, the push service, the live site in offline tests (ADR-0024).
4. Every bug you fix gets a test that failed before the fix.
5. **Every architecture decision gets an ADR** in `docs/adr/` (next number), with **Pilot knobs** and **Revisit when**, and a row in `docs/adr/README.md`. A decision you made without one is not finished.
6. When a spec's acceptance criteria pass, set its ADR to Accepted (T-701).
7. Update `docs/handoff/HANDOFF.md` at the end of every task: what changed, what you verified and how, what is still open.
8. Measure, don't guess: latency, sizes and accuracy come from traces, builds and the evaluation sets. Write numbers with their date and conditions.

## 6. Git

- Work on `feature/voice-guide-vodafone` or a branch from it (`feature/vg-<task-id>-<slug>`).
- Small commits with a clear subject (`T-403: word-by-word transcript bar`) and a body that says why.
- Never force-push a shared branch, never rewrite published history, never commit `node_modules/`, `data/`, `dist/` or `.env`.
- Open a pull request per task or per epic; the PR description lists the acceptance items and how each was checked.

## 7. When to stop and ask a person

Stop, write the question in the handoff (§5), and move to another task when:
- an action would need credentials, a payment, or a change on Vodafone's systems (Tealium, CMS, bot management);
- a requirement conflicts with a rule in §4;
- a dependency in PRD §8 or a question in PRD §12 blocks the task;
- the live site shows a bot challenge, a legal notice or anything that looks like you should not be there;
- a decision would be hard to undo (schema changes to production data, deleting versions, changing public URLs).

## 8. Where things are

| Path | What |
|---|---|
| `packages/sdk/` | Browser SDK: guide, voice UI, executor, agent wrapper, service worker |
| `packages/kb/`, `packages/text/` | Site knowledge standard and plan contract; Arabic and English text matching |
| `services/` | Gateway, router, knowledge, sessions, agent proxy, watch; shared store, config, tracing |
| `jobs/` | Crawler, describer, KB builder, ingest (and the sync job in this phase) |
| `config/sites/`, `config/curated/` | One site config and one curated overlay per site |
| `fixtures/sites/` | Offline test sites |
| `tests/` | `unit/`, `integration/`, `e2e/`, `live/` (only with `VG_LIVE=1`), `fixtures/`, `helpers/` |
| `docs/` | PRD, JTBD, specs, ADRs, diagrams, tasks, QA, ops, reference, prompts ([index](docs/README.md)) |
| `../experiences/` | The demos' modules (Pocket with its actors and portal, Reimagine, the RED world, Tips) and, until the live plan's phase 9, the Services clone page they run on (ADR-0046) |
