# CLAUDE.md

@AGENTS.md

## Claude Code specifics

- Start a session by reading `docs/handoff/HANDOFF.md`, then the task you take from `docs/tasks/TASKS.md`. For the Vodafone live phase, the full brief is `docs/prompts/vodafone-live-demo.prompt.md`.
- Keep a task list for multi-step work and tick items as you finish them; the last item is always checking the work (tests run, numbers measured, screenshots looked at).
- Run commands with explicit time limits: `timeout 600 npm test`, `timeout 600 npm run test:e2e` (ADR-0024 records one unexplained stall).
- Postgres must be reachable at `127.0.0.1:54329` (databases `voiceguide` and `voiceguide_test`) before tests.
- Kill processes by port or PID, never with `pkill -f` patterns that can match your own shell.
- When you change a published decision, write a new ADR rather than editing history; when you finish a task, update the handoff before you report.
