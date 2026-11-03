# Diagrams

All diagrams are Mermaid (GitHub renders them). Rendered SVGs are in `svg/` (regenerate with `npm run docs:diagrams`).

| # | Diagram | Shows |
|---|---|---|
| 01 | [System context](01-system-context.md) | People, Vodafone's sites and tools, our platform, model providers |
| 02 | [Containers](02-containers.md) | SDK, gateway, services, jobs, Postgres; new parts of this phase |
| 03 | [Voice request sequence](03-voice-turn-sequence.md) | From microphone press to spotlight and speech |
| 04 | [Cross-page continuity](04-cross-page-continuity.md) | CMS → SPA → shop without losing the conversation |
| 05 | [Live knowledge sync](05-live-kb-sync.md) | One sync run, the gate, activate or hold |
| 06 | [Voice UI states](06-voice-ui-states.md) | Microphone and transcript bar state machine |
| 07 | [Data model](07-data-model.md) | Postgres tables, with the proposed sync table |
| 08 | [Deployment](08-deployment.md) | Demo (mode B) and pilot (mode A) |
| 09 | [Demo journey](09-demo-journey.md) | The eight moments, page types and feelings |
| 10 | [Exploration Trail](10-exploration-trail.md) | Local journey memory, knowledge, experience profile; the chip flow; the trail's states |
