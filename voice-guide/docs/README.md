# Documentation map

Start with [`../AGENTS.md`](../AGENTS.md) and the [handoff](handoff/HANDOFF.md). For the Vodafone live phase, the brief is the [build prompt](prompts/vodafone-live-demo.prompt.md).

| Folder | Documents | Read when |
|---|---|---|
| [`prompts/`](prompts/) | [Vodafone live demo build prompt](prompts/vodafone-live-demo.prompt.md) | Starting an agent session on this phase |
| [`handoff/`](handoff/) | [HANDOFF](handoff/HANDOFF.md): state, verified numbers, start here, blockers, gotchas, log | Every session, first |
| [`product/`](product/) | [PRD](product/PRD.md) · [JTBD](product/JTBD.md) · [Demo script](product/demo-script.md) | Deciding what to build and why |
| [`specs/`](specs/) | [SPEC-01 Design language](specs/SPEC-01-vodafone-design-language.md) · [SPEC-02 Voice-first UI](specs/SPEC-02-voice-first-ui.md) · [SPEC-03 Live site integration](specs/SPEC-03-live-site-integration.md) · [SPEC-04 Live knowledge sync](specs/SPEC-04-live-knowledge-sync.md) · [SPEC-05 Continuity and memory](specs/SPEC-05-continuity-and-memory.md) · [SPEC-06 Exploration Trail](specs/SPEC-06-exploration-trail.md) | Building a task |
| [`adr/`](adr/README.md) | ADR-0006 to ADR-0039 | Before changing how something works |
| [`diagrams/`](diagrams/README.md) | Context, containers, voice request, continuity, sync, UI states, data model, deployment, demo journey | Understanding the system quickly |
| [`tasks/`](tasks/TASKS.md) | Epics E0–E7, tasks with acceptance criteria and dependencies | Picking the next piece of work |
| [`qa/`](qa/) | [Test plan](qa/test-plan.md) · [Acceptance checklist](qa/acceptance-checklist.md) · [Risk register](qa/risk-register.md) | Testing, go/no-go, weekly review |
| [`qa/bug-log.md`](qa/bug-log.md) | [Bug log](qa/bug-log.md) | Bugs found in the live phase: cause, fix, test |
| [`ops/`](ops/) | [Runbook](ops/runbook.md) (setup, running the demo, public-only knowledge refresh, troubleshooting), [demo-day runbook](ops/runbook-demo-day.md) | Running the demo and keeping it current |
| [`reference/`](reference/) | [Vodafone live site audit](reference/vodafone-live-site-audit.md) · [Glossary](reference/glossary.md) | Facts about the live site; terms |
| (root of `docs/`) | [Site knowledge standard 0.1](kb-standard.md) with its JSON Schema · plan contract schema · [Pilot tuning guide](pilot-tuning.md) | Changing the knowledge base or tuning the pilot |

## How the documents connect

```
PRD requirement (R4.2) ─▶ spec (SPEC-02 §4) ─▶ decision (ADR-0027) ─▶ task (T-403) ─▶ tests (acceptance 3, 4)
         ▲                                                                     │
         └──────────── handoff §2–§3 records what passed and the numbers ◀────┘
```

Every requirement has an ID, every spec section names its requirement and ADR, every task names its spec and acceptance criteria, and the handoff records what has been verified.
