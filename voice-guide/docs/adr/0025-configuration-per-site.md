# ADR-0025: Everything that differs between sites is in two YAML files; everything that differs between environments is an environment variable

- Status: Accepted (demo slice)
- Date: 2026-10-23
- Area: Configuration
- Code: `services/shared/config.ts`, `config/sites/*.yaml`, `config/curated/*.yaml`

## Context

The demo runs on one fixture site; the pilot runs on the team's clones, then on the live website and web app. Moving between them must not need code changes, and every value we expect to tune must be findable in one place.

## Decision

1. **Site config** (`config/sites/<site>.yaml`, validated on load): id, names, languages, site key, origins (with an optional folder to serve), crawl scope and cookies, curated overlay path, speech tags, UI options, router thresholds and decider, agent limits, watch interval.
2. **Curated overlay** (`config/curated/<site>.yaml`): the human-maintained part of the knowledge base (ADR-0011).
3. **Environment variables** for everything that changes per environment: database, secrets, service URLs, model providers and keys, budgets, retention. Read in one function, `loadPlatformConfig`, with defaults.
4. `docs/pilot-tuning.md` lists every knob, its default, and which measurement should move it.

## Consequences

- A new site is two files and an ingest run.
- A bad site file stops the process at start with a readable validation error.

## Verified by

- Every test loads the fixture site from `config/sites/demo-telco.yaml`.
