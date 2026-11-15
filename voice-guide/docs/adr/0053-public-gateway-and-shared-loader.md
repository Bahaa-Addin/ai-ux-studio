# ADR-0053: A public gateway and one shared loader, so the demo runs outside the demo browser

- Status: Proposed (built 2026-11-13; accepted when the extension runs against a deployed gateway)
- Amended: 2026-11-15 by [ADR-0066](0066-public-gateway-on-cloud-run.md) (§2, §3: the gateway runs on Google Cloud Run, not Fly.io; the visitor's address is X-Forwarded-For's last entry); superseded for hosting by [ADR-0067](0067-public-gateway-on-render.md) (Render)
- Date: 2026-11-13
- Area: deployment, loader, privacy, cost; follows ADR-0026 (carriers), ADR-0031 (routed gateway), ADR-0042, ADR-0047, ADR-0048
- Owner decision: 2026-11-13, "Extension + shared groundwork" as the first public route (`/mnt/project-files/plans/public-demo-deployment-options.md` §4 and option B)

## Context

The demo browser is a carrier (it injects the loader and routes `/__vg/**` to a gateway on the Mac) plus browser privileges (autoplay, granted microphone, Chrome's speech service). A public demo needs the same loader on a visitor's own browser, a gateway they can reach, and replacements for the privileges. The loader lived inside `tools/demo-browser.ts`, and the storage keeper that survives Vodafone's `localStorage.clear()` ran only on live pages opened in replay (T-806).

## Decision

1. **One loader** in `packages/loader/src/loader.ts`, used by the demo browser and the extension (ADR-0056), and the shape of mode A's tag. Options: `gateway` (absolute URL; omitted: the page's origin + `/__vg`, which only the demo browser answers), `events: 'poll'` (demo browser only), `xray`, `experiences`, `keepStorage`. The storage keeper is part of it and runs first, before the page's scripts, on every page the loader runs on. It keeps keys that start with `vg-`, `vg:` and `aixc.` (the trail's consent, the guide's settings, the layer's Tips and profile); everything else is cleared as the site asks.
2. **A public gateway mode**, `VG_PUBLIC=on`. At start it refuses: a non-https `VG_PUBLIC_URL`, the dev secret, no admin token, the page-agent testing preset (ADR-0042), Anthropic without a key, no trusted client-address header, trail aggregation on. In sessions it turns page watch off (no service worker on Vodafone's origin; no cloud fetches of Vodafone, O29) and hides X-ray unless `VG_PUBLIC_XRAY` says otherwise. The rate limits key on the proxy's own header (`VG_CLIENT_IP_HEADER`, Fly: `fly-client-ip`), not on `X-Forwarded-For`, which anyone can send.
3. **Packaging**: `deploy/gateway/gateway.Dockerfile` (built from the repository root, because the SDK build bundles `../experiences`) and `deploy/gateway/fly.toml`: one machine, the memory store, the committed knowledge base activated at start (`VG_KB_SEED=committed` does the same with Postgres), the Exploration Trail on (`VG_TRAIL=on`; each person still says yes). Server-sent events work on a real host, so no long polling.
4. **Tap to hear.** Outside the demo browser, a reply spoken on a new page is refused without a tap (Safari, Firefox, iOS; Chrome until the site has engagement). When VoiceTut's `<audio>` is refused (`NotAllowedError`), or `speechSynthesis` says `not-allowed` (Chrome), or stays silent for 1.5 s in a page never tapped (Safari), the line waits behind a "Tap to hear" button in the transcript bar. The tap is the gesture, so it plays. The text is already in the log and announced to screen readers.
5. **VoiceTut's spend**: `VG_VOICETUT_SENTENCES_PER_DAY` caps the sentences VoiceTut makes per site per day (cache hits are free); past it the browser voice speaks. `MAX_CONTAINERS` on the Modal deploy sets the GPU count. Owner decision, 2026-11-13: **VoiceTut is allowed for public visitors, capped per day**; the public gateway's `fly.toml` sets the cap to 300 sentences per site per day, after which visitors get the browser voice. Without `VG_VOICETUT_URL` the browser voice speaks.
6. **The accessibility button in public.** Owner decision, 2026-11-13: the Pocket lifts Vodafone's accessibility button for public visitors as it does in the owner's demos (O24, the exception to AGENTS.md §4.6 written in phase 3). No code change: the same rules run wherever the layer runs.

## Consequences

- The demo browser behaves as before, except that the storage keeper now runs on every page, replayed ones included, and keeps `aixc.` keys too (the live-kit test was updated to say so).
- A public gateway on one machine holds sessions in memory: a restart forgets them (people start again). Postgres is a drop-in when that matters.
- Visitors meet OneTrust and are signed out; the guide's microphone asks for permission on first use.

## Pilot knobs

`VG_PUBLIC`, `VG_PUBLIC_URL`, `VG_PUBLIC_XRAY` (off), `VG_CLIENT_IP_HEADER`, `VG_TRAIL`, `VG_KB_SEED`, `VG_VOICETUT_SENTENCES_PER_DAY` (0: no cap; 300 on the public gateway), Modal `MAX_CONTAINERS` (1), `VG_RATE_TURNS_PER_MIN`, `VG_AGENT_TOKENS_PER_SITE_DAY`.

## Revisit when

Vodafone agrees to mode A (the loader becomes their Tealium tag; they serve `vg-sw.js` and keep `vg-` keys); sessions must survive restarts or more than one machine is needed (Postgres); the Tap-to-hear rate is high in traces (consider a first-run "turn on sound" step in Tips).
