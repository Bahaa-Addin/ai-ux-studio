# 07 Data model

The Postgres tables (`services/shared/store/schema.sql`, version 2). `kb_sync_runs` is **proposed** for SPEC-04 (task T-205); the session's `memory.facts` live inside `sessions.state` (task T-302).

```mermaid
erDiagram
  kb_versions {
    text site_id
    text version_id PK
    text hash
    jsonb manifest "site-knowledge/0.1"
    timestamptz created_at
  }
  kb_active {
    text site_id PK
    text version_id FK
    timestamptz activated_at
  }
  kb_sync_runs {
    text id PK "proposed"
    text site_id
    text mode "incremental | full | on-demand"
    text status "activated | held | unchanged | stopped | failed"
    text candidate_version_id
    jsonb report "counts, diff, gate results"
    timestamptz started_at
    timestamptz finished_at
  }
  sessions {
    text id PK
    text site_id
    jsonb state "lang, turns (max 20), plan, agent, usage, memory.facts (new)"
    timestamptz updated_at
    timestamptz expires_at
  }
  handoff_tokens {
    text token PK
    text session_id FK
    timestamptz expires_at
  }
  trace_events {
    bigserial seq PK
    text session_id
    text site_id
    text turn_id
    text trace_id
    text name "router.understood, sdk.stt.first_word, kb.sync ..."
    text service
    timestamptz at
    double duration_ms
    jsonb attrs
  }
  push_subscriptions {
    text id PK
    text site_id
    text endpoint
    jsonb keys
  }
  watches {
    text id PK
    text site_id
    text subscription_id FK "nullable"
    text session_id
    text channel "push | live"
    text url
    jsonb target
    text status
    text last_hash
    int interval_sec
    int missing_count
    int error_count
  }
  watch_changes {
    text id PK
    text watch_id FK
    timestamptz at
    text before
    text after
  }

  kb_active ||--|| kb_versions : "points to"
  kb_sync_runs }o--o| kb_versions : "produced"
  sessions ||--o{ handoff_tokens : "issues"
  sessions ||--o{ trace_events : "records"
  push_subscriptions ||--o{ watches : "delivers"
  sessions ||--o{ watches : "live delivery"
  watches ||--o{ watch_changes : "logs"
```

Also in the schema: `schema_info` (migration version), `cache` (describer and other caches by namespace and key) and `usage_counters` (agent budgets).
