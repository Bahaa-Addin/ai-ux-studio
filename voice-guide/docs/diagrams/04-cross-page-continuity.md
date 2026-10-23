# 04 Continuity across CMS pages, the SPA and the shop

How one conversation survives every kind of move (ADR-0016, ADR-0030, SPEC-05).

```mermaid
sequenceDiagram
  autonumber
  participant G1 as SDK on CMS page<br/>/ar/mobile-internet-bundles
  participant SS as sessionStorage<br/>(web origin)
  participant S as Sessions service
  participant G2 as SDK in /spa/ app
  participant G3 as SDK on eshop<br/>(other origin)

  Note over G1: plan step: follow "اشترك الآن"
  G1->>S: save cursor (step n+1, waitForPage spa.miManagement)
  G1->>SS: session id, transcript
  G1->>G2: full page load into /spa/miManagement
  G2->>SS: read session id
  G2->>S: get session → plan, cursor
  G2->>G2: page id matches → resume step n+1

  Note over G2: SPA route change, no page load
  G2->>G2: pushState wrapper / navigatesuccess
  G2->>G2: wait for the view to settle (300 ms quiet or target, ≤ 6 s)
  G2->>S: report sdk.route, resume plan
  Note over G2: guide DOM, transcript and panel stay as they are

  Note over G2: plan step: go to the shop
  G2->>S: create handoff token (single use, 60 s)
  G2->>G3: navigate to eshop URL #vgh=token
  G3->>S: redeem token → same session
  G3->>G3: remove #vgh from the URL, resume plan
```

| Move | Page load? | State carried by |
|---|---|---|
| CMS → CMS | yes | `sessionStorage` + server session |
| CMS → SPA | yes | same |
| SPA → SPA | **no** | in-memory SDK state + route follower |
| web → eshop | yes, new origin | handoff token + server session |
