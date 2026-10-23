# Risk register: Vodafone live phase

Likelihood (L) and impact (I): 1 low to 3 high. Review weekly and before the demo.

| ID | Risk | L | I | Mitigation | Trigger to act | Owner |
|---|---|---|---|---|---|---|
| R1 | Vodafone's bot protection blocks the crawler or the demo browser | 2 | 3 | Written approval and IP allowlist (D3); polite rates; stop on challenge; recorded snapshots for offline work; clone fallback | Any challenge page in a sync report or rehearsal | Eng lead |
| R2 | The site changes the day before the demo and a target moves | 3 | 2 | Sync every 2 hours with a gate; plan fallbacks (other selectors, then the agent); rehearse the morning of the demo | `sdk.step ok=false` in a rehearsal | Eng |
| R3 | Egyptian Arabic recognition errors on stage | 2 | 3 | Good directional microphone; contextual phrases; presenter practises the exact requests; typing fallback | Word error rate > 15% on the evaluation recordings | Presenter |
| R4 | No crawl approval before the demo | 2 | 2 | Manual off-peak runs at low rate; keep the schedule off | D3 not answered 1 week before | Owner |
| R5 | Mixed content or local network rules block gateway calls | 2 | 3 | Public HTTPS gateway (D4); test on the demo machine's Chrome version | Any blocked request in the demo browser console | Eng |
| R6 | Speech data policy forbids the browser's server engine | 2 | 2 | `onDevice: prefer`; evaluate an approved streaming provider (ADR-0027 revisit) | D2 answer | Owner |
| R7 | The microphone stream can't be shared on the demo device | 1 | 2 | Three audio modes with fallback; test the exact device | `sdk.stt.mode` ≠ `shared-track` in rehearsal | Eng |
| R8 | The guide covers or confuses Vodafone's accessibility widget | 1 | 3 | Fixed placement above it; intersection tests; brand review | Any overlap report | Eng |
| R9 | Fallback agent does something unexpected on a live page | 1 | 3 | Commit blacklist, input refusals, step and time limits, masking; agent only on moment 6 | Any agent step outside the asked task | Eng |
| R10 | Login flow for the demo account changes or needs OTP on the day | 2 | 2 | Sign in before the audience arrives; moment 2 accepts "please sign in" as a correct outcome | Sign-in fails in the morning check | Presenter |
| R11 | Price or offer wording in the script goes stale | 3 | 1 | Never quote values in the script; the guide reads them live | | Presenter |
| R12 | Copyright or brand concerns about recorded snapshots and mirrored fonts | 1 | 2 | Private repository only; Vodafone's own assets for Vodafone's own demo; delete on request | Any request from Vodafone legal | Owner |
| R13 | CI never ran; hidden environment differences | 2 | 1 | T-501 first; the workflow mirrors the local setup | First CI run red | Eng |
