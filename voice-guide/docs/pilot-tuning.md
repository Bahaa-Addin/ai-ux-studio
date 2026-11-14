# Pilot tuning guide

Every setting we expect to change between the demo and the pilot, what it does, and the measurement that should move it. Each row points to the ADR that made the original decision; change a decision by writing a new ADR that supersedes it.

## What we measured in the demo build (2026-10-23)

All on one machine, fixture site, Postgres, Chromium; no network between the browser and the services, and simulated speech. Treat these as the floor, not the expectation.

| Measure | Value | Source |
|---|---|---|
| Router, tuning set (54 requests, Arabic and English) | 54/54 correct, p95 1.9 ms | `npm run eval:router` |
| Router, held-out set (24 requests, never tuned) | 18/24 fully correct, 22/23 right destination | `npm run eval:router -- --cases tests/fixtures/utterances-heldout.yaml` |
| Server time per request (7 requests of the recorded demo) | p50 32 ms, p95 45 ms | `turn.planned` events |
| Request to first visible movement | p50 70 ms, p95 94 ms | `sdk.first_motion` events |
| Requests answered without an LLM (demo flow) | 6 of 7 | `planner.plan` route |
| Fallback agent, one action | 2 steps, 1.5 s with a stand-in model; about 4,000 prompt tokens per step | `agent.done`, `agent.llm` |
| Knowledge base build (14 pages) | about 3.5 s | ingest report |
| SDK size | 42 KB (15 KB gzipped); agent chunk 132 KB, loaded on demand | `npm run build:sdk` |
| Tests | 68 (56 unit and integration, 12 end to end) | `npm test && npm run test:e2e` |

## Week-1 measurements to take on the real clones

1. `npm run ingest -- --site <clone> --dry-run`: read the report (errors, warnings, destinations per kind). Fix selectors and labels in the overlay.
2. Write 50 real requests per language from the people who will use it into `tests/fixtures/<site>-utterances.yaml`; keep 20 back as a held-out set.
3. `npm run eval:router -- --site <clone> --decider local`, then `--decider jev` and `--decider laya` with keys. Pick the decider by held-out accuracy with p95 under 400 ms.
4. Rehearse with the X-ray open; every miss goes into the tuning set.

## Knobs

### Understanding (ADR-0014)

| Knob | Where | Default | Raise or lower when |
|---|---|---|---|
| `router.decider` | site config | `local` | Switch to `jev` or `laya` if it beats `local` on the held-out set. |
| `router.acceptAt` | site config | 0.55 | Raise if the guide acts on wrong guesses (wrong destination with confidence over 0.55 in traces); lower if it asks "A or B?" too often. |
| `router.clarifyAt` | site config | 0.3 | Raise if the agent gets requests that a clarifying question would have solved; lower if too many requests end in a question. |
| `router.topK` | site config | 8 | Raise (up to about 20 for Laya) if the right destination is often missing from the candidates. The `router.understood` trace logs the top five with their scores. |
| Destination `priority` | overlay | 1 | Raise the destination most people mean when a request is ambiguous. |
| `lexicon.synonyms`, `lexicon.intents` | overlay | fixture | Add the words from misrouted requests. |
| `JEV_TIMEOUT_MS`, `LAYA_TIMEOUT_MS` | env | 1500 | Lower if decider latency dominates `turn.planned`. |

### Knowledge (ADR-0011, 0012, 0013)

| Knob | Where | Default | Change when |
|---|---|---|---|
| `crawl.start`, `include`, `exclude`, `maxPages` | site config | fixture | The report misses pages or crawls ones that do not matter. |
| `crawl.collections.minItems` | site config | 3 | Collections are missed (lower) or false ones appear (raise). |
| `crawl.cookies` | site config | demo account | Web app pages need a signed-in demo account. |
| `VG_VISION_BASE_URL`, `_MODEL`, `_API_KEY` | env | unset | Image-only banners matter (they do on the home page). |
| Activation | `npm run ingest -- --activate` or admin endpoint | manual | Always after reading the report. |

### Fallback agent (ADR-0017, 0018)

| Knob | Where | Default | Change when |
|---|---|---|---|
| `agent.enabled` | site config | true | Turn off where the risk is not acceptable (account pages before the masking review). |
| `agent.maxSteps`, `agent.timeoutSec` | site config | 12, 60 | Lower if agent turns run long on stage; raise only with evidence that more steps succeed. |
| `VG_LLM_*`, `VG_LLM_FALLBACK_*` | env | unset | Pick a tool-calling model; record the choice in an ADR. |
| `VG_AGENT_STEPS_PER_SESSION`, `VG_AGENT_TOKENS_PER_SESSION`, `VG_AGENT_TOKENS_PER_SITE_DAY` | env | 60, 400k, 20M | Size from `agent.llm` token totals per session in rehearsal. |

### Speech and UI (ADR-0019, 0020)

| Knob | Where | Default | Change when |
|---|---|---|---|
| `speech.stt`, `speech.tts` | site config | `ar-EG`, `en-US` | A different market or dialect. |
| `ui.accent` | site config | derived | The derived colour is not the brand's primary. |
| `ui.xray`, `data-xray` | site config, tag | `button` | `open` for the demo, `off` for the public pilot. |

### Sessions, edge, data (ADR-0010, 0016, 0021, 0022)

| Knob | Where | Default | Change when |
|---|---|---|---|
| `VG_SESSION_TTL_MIN` | env | 60 | Conversations go stale too early or live too long. |
| `VG_RATE_TURNS_PER_MIN`, `VG_RATE_BURST` | env | 30, 10 | Real users hit 429 (`error.429` in `/metrics`). |
| `VG_TRACE_RETENTION_DAYS` | env | 7 | Set by the data protection owner. |
| `VG_DB_POOL_MAX` | env | 10 | Pool waits under load. |
| `VG_SERVICES` + `VG_<NAME>_URL` | env | `local` | Scale a hot service separately (usually router or agent). |
| `VG_SECRET`, `VG_ADMIN_TOKEN`, `VG_VAPID_*` | env | dev values | Always set per environment. |

### Page watch (ADR-0023)

| Knob | Where | Default | Change when |
|---|---|---|---|
| `watch.intervalSec` | site config | 900 (fixture 15) | Faster notice vs checker load. |
| `VG_WATCH_SCHEDULER` | env | on | Off on gateway replicas when the watch service runs separately. |

### Vodafone live phase (ADR-0027 to ADR-0033)

| Knob | Where | Default | Change when |
|---|---|---|---|
| `crawl.publicOnly` | site config | `true` for Vodafone (forced by `npm run sync`) | Never during this phase (owner's instruction, 2026-10-23). A signed-in crawl would need a new ADR and D5. |
| `crawl.delayMs`, `crawl.concurrency` | site config | 1,000 ms, 2 | Lower only with Vodafone's written agreement; raise if the site answers 429. |
| `crawl.maxDepth` | site config | 2 | Raise if real destinations sit three links from the navigation (the report lists missing seeds and pages). |
| `sync.schedule.enabled` | site config | `false` (paused; `--scheduled` refused) | After D3 (written approval), with an ADR. |
| `sync.gate.maxDestinationChurn` | site config | 0.15 | Raise for a planned redesign week; read the held report first. |
| `sync.gate.evalCases`, `maxEvalDrop` | site config | Vodafone tuning set, 0.02 | Point at a larger set once T-206 reaches 50 + 20 per language. |
| Language factor | `services/router/understand.ts` | 0.7 for destinations labelled only in the other language | Lower if English requests land on Arabic-only pages (or the reverse). |
| Destination `priority` | `config/curated/vodafone-eg.yaml` | 1.2–1.4 on demo destinations | Lower when a demo destination wins requests it should not (check the held-out set). |
| `ui.theme` | site config | `vodafone` | `page` for sites without a fixed token set (ADR-0029). |
| `ui.voiceFirst` | site config | `true` | `false` brings back the round launcher and the panel first. |
| `speech.onDevice` | site config | `prefer` | `require` once D2 says audio must not leave the device (no recognition where the model is missing). |
| `data-events` on the script tag | page or demo browser | `poll` in the demo browser | `sse` where the page origin can hold a stream open (ADR-0031). |
| Demo browser | `npm run demo:live -- --browser` | `chrome` | `chromium` only for tests: it has no speech service (ADR-0033). |

Speech in the field, per mode and on-device (from the X-ray listen row's event):

```sql
select attrs->>'mode' as mode, attrs->>'onDevice' as on_device, count(*),
       round(percentile_cont(0.5) within group (order by (attrs->>'firstWordMs')::numeric)::numeric) as first_word_p50
from trace_events where name = 'sdk.listen' and attrs->>'source' = 'voice' and at > now() - interval '1 day' group by 1, 2 order by 3 desc;
```

### Exploration Trail (ADR-0035 to ADR-0039, SPEC-06)

| Knob | Where | Default | Change when |
|---|---|---|---|
| `trail.enabled` | site config | `false` (`true` for demo-telco) | On for a site only with D2 and confirmed consent wording. |
| `trail.retentionHours` | site config | 24 | D2 sets it; shorter for shared-device audiences. |
| `trail.excludePaths`, `trail.privateSelectors` | site config | none (built-in lists apply) | Add any path or region found in a replay that should not be there, with a test. |
| `trail.topOffset` | site config | measured | Set when a site's header cannot be measured (the pill would sit on it). |
| `trail.aggregation.enabled`, `minCohort`, `windowDays` | site config | `false`, 20, 28 | Only after D2; also needs `VG_TRAIL_AGGREGATION=on` on the platform. |
| `VG_TRAIL_AGGREGATION`, `VG_TRAIL_AGGREGATE_RETENTION_DAYS` | environment | off, 90 | As above; retention per D2. |
| `TRAIL_CONFIG.attention.*` (dwell 600 ms, focus 400 ms, pass-through 300 ms, return gap 1.5 s, visible 50%, weights, caps, diversity 0.5, min score 0.5) | `packages/sdk/src/trail/config.ts` | as listed | When explored items feel accidental (raise dwell, min score) or miss obvious interest (lower them); check with the unit tests and a recorded walkthrough. |
| `TRAIL_CONFIG.storage.*` (3 journeys, 20 steps, 30 min, 20 MB, 256 KB / 10 s chunks, 2 s flush) | same | as listed | If measured growth (HANDOFF §3) approaches the budget on real pages. |
| `TRAIL_CONFIG.recorder.sampling`, `checkoutEveryNms` | same | mouse 50 ms, scroll 150 ms, snapshot every 2 min | Coarser sampling if storage grows fast; shorter snapshot interval if seeking long pages is slow. |
| `TRAIL_CONFIG.replay.maxResources`, `maxResourceBytes` | same | 60, 5 MB | If previews look bare on image-heavy pages. |
| Question templates and wordings | `jobs/experience/questions.ts` | 7 intents, several wordings each | Add a wording when the report shows a good question in `needs-review`; rebuild with `npm run experience`. |

Chip turns and how the router used their hint:

```sql
select attrs->>'outcome' as outcome, attrs->>'reason' as reason, count(*)
from trace_events where name = 'router.hint' and at > now() - interval '7 days' group by 1, 2 order by 3 desc;
```

### Tips, the walkthrough in the Services clone (ADR-0045)

| Knob | Where | Default | Change when |
|---|---|---|---|
| `?tips=open`, `?tips=invite`, `?tips=off` | the page URL | none | `open` on stage (the Playwright-driven demo browser never gets the invitation); `off` for recordings that must not show the button's dot. |
| Invitation delay, wait for the consent card | `experiences/src/tips/entry.js` | 1.6 s; up to 60 s | If the invitation lands on top of the page still loading, or after people have started using it. |
| Cards: order, copy | `src/tips/catalog.js`; Arabic in `src/i18n.js` | 10 cards, 2 per demo | When a demo changes (O19, the shop, an agent model): its tip changes with it. |
| Spoken example, journey questions | `src/tips/tips.js` | the router's tuning phrase; three verified questions | Keep them from the tuning set and the experience profile's `verified` questions only. |
| Scene loop lengths and poster frames | `src/tips/scenes.js` | 6.4–9 s; poster mid-gesture | If people wait for a loop to end before reading, shorten it. |
| The button's place | `src/tips/entry.css` | bottom-left, 20 px (16 px on phones) | If another control takes the bottom-left. |

## Queries for the pilot

Run against the Postgres database (`psql $DATABASE_URL`).

Where the time goes, per layer:

```sql
select name, count(*), round(percentile_cont(0.5) within group (order by duration_ms)::numeric, 1) as p50,
       round(percentile_cont(0.95) within group (order by duration_ms)::numeric, 1) as p95
from trace_events where at > now() - interval '1 day' and duration_ms is not null
group by name order by p95 desc;
```

How requests were answered. Routes: `replay` (planned from the knowledge base, no LLM), `agent` (fallback agent), `clarify` (the guide asked "A or B?"), `control` (stop, repeat, help), `none` (nothing found). The pilot goal is most turns in `replay`; ADR-0017 says to curate when `agent` passes 30%.

```sql
select attrs->>'route' as route, count(*), round(100.0 * count(*) / sum(count(*)) over (), 1) as pct
from trace_events where name = 'planner.plan' and at > now() - interval '1 day' group by 1 order by 2 desc;
```

Requests that ended in the agent or a question, to add to the evaluation set:

```sql
select r.attrs->>'utterance' as said, u.attrs->>'lang' as lang, u.attrs->>'intent' as intent,
       u.attrs->>'confidence' as conf, p.attrs->>'route' as route
from trace_events r
join trace_events u on u.turn_id = r.turn_id and u.name = 'router.understood'
join trace_events p on p.turn_id = r.turn_id and p.name = 'planner.plan'
where r.name = 'turn.received' and p.attrs->>'route' in ('agent', 'clarify', 'none')
order by r.at desc limit 100;
```

Steps that failed on the page (selectors to fix in the overlay):

```sql
select attrs->>'op' as op, attrs->>'detail' as detail, count(*)
from trace_events where name = 'sdk.step' and (attrs->>'ok')::boolean = false
group by 1, 2 order by 3 desc;
```

Agent cost per session:

```sql
select session_id, count(*) as calls, sum((attrs->>'promptTokens')::int + (attrs->>'completionTokens')::int) as tokens
from trace_events where name = 'agent.llm' group by 1 order by 3 desc limit 20;
```

## Public demo (ADR-0053 to ADR-0056, 2026-11-13)

| Knob | Default | What it does |
|---|---|---|
| `VG_PUBLIC` | off | `on`: a gateway for the internet; refuses unsafe settings at start, page watch off, X-ray hidden |
| `VG_PUBLIC_XRAY` | `off` | X-ray in public sessions: `button` or `open` for a supervised session |
| `VG_CLIENT_IP_HEADER` | unset | The proxy's client-address header for rate limits (Fly: `fly-client-ip`); required in public |
| `VG_TRAIL` | off | `on`: the Exploration Trail for this gateway's sites (consent still asked) |
| `VG_KB_SEED` | unset | `committed`: activate `config/kb/<site>.manifest.json` at start when none is active (automatic for a public memory-store gateway) |
| `VG_LLM_PROVIDER` | `openai` | `anthropic`: Claude through Anthropic's SDK for the agent |
| `VG_LLM_EFFORT` | `low` | Claude's effort per agent step: `low`, `medium`, `high` |
| `VG_WHISPER_URL`, `VG_WHISPER_TOKEN` | unset | Whisper on Modal for browsers without speech recognition |
| `VG_WHISPER_TIMEOUT_MS` | 20000 | One clip's wait |
| `VG_STT_MAX_SECONDS`, `VG_STT_MAX_BYTES` | 15, 524288 | One clip's limits |
| `VG_STT_PER_SESSION_PER_HOUR` | 40 | Clips per session |
| `VG_STT_SECONDS_PER_DAY` | 14400 | Audio seconds per site per day |
| `VG_VOICETUT_SENTENCES_PER_DAY` | 0 (no cap); 300 on the public gateway | Sentences VoiceTut makes per site per day; then the browser voice (VoiceTut allowed in public, capped per day: owner, 2026-11-13) |
| Modal `MAX_CONTAINERS` | VoiceTut 1, Whisper 2 | GPUs at once, set when deploying |
