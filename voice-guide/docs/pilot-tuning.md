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
