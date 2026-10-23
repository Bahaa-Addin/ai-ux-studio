# 02 Containers

Deployable parts and their connections. Services run in one process (`VG_SERVICES=local`) or separately over HTTP (`VG_SERVICES=http`) with the same handlers (ADR-0009). New parts in this phase are marked **new**.

```mermaid
flowchart TB
  subgraph browser["Browser tab on a Vodafone page"]
    guide["guide.js (≈15 KB gz)<br/>voice UI: mic, transcript bar, waveform (new)<br/>plan executor, SPA route follower (new)<br/>Vodafone theme (new), X-ray"]
    agentjs["agent.js (on demand)<br/>page-agent 1.12.4, wrapped"]
    sw["sw.js<br/>push notifications"]
    loader["Loader<br/>Tealium tag or demo browser init script (new)"]
  end

  subgraph edge["Public HTTPS host"]
    gw["Gateway<br/>site key, origin check, rate limits,<br/>SSE events, SDK files, fonts (new)"]
  end

  subgraph services["Services"]
    router["Router<br/>retrieve then decide, planner"]
    knowledge["Knowledge<br/>active KB, reload on NOTIFY (new)"]
    sessions["Sessions<br/>turns, plan cursor, memory facts (new),<br/>handoff tokens"]
    agentproxy["Agent proxy<br/>keys, masking, budgets"]
    watch["Watch<br/>rendered checks, push or live;<br/>also schedules sync (new)"]
  end

  subgraph jobs["Jobs"]
    syncjob["sync.ts (new)<br/>plan, crawl, describe, build,<br/>diff, gate, activate or hold"]
    crawler["Crawler (Chromium)<br/>path language pairing (new)"]
    describer["Describer"]
    builder["KB builder + curated overlay"]
  end

  pg[("Postgres<br/>kb_versions, kb_active, sessions,<br/>handoff_tokens, trace_events, watches,<br/>push_subscriptions, kb_sync_runs (new)")]

  loader --> guide
  guide -- HTTPS JSON, SSE --> gw
  agentjs -- OpenAI-compatible calls --> gw
  sw -. push .- watch
  gw --> router & knowledge & sessions & agentproxy & watch
  router --> knowledge
  router --> sessions
  watch --> syncjob
  syncjob --> crawler --> describer --> builder
  builder --> pg
  router & knowledge & sessions & agentproxy & watch --> pg
  gw --> pg
```
