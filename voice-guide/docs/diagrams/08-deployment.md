# 08 Deployment

## Demo (mode B, ADR-0026)

```mermaid
flowchart LR
  subgraph laptop["Demo machine"]
    db["Demo browser<br/>Playwright persistent Chromium profile<br/>addInitScript loader, microphone granted"]
  end
  subgraph host["Public HTTPS host (VM or tunnel), TLS certificate"]
    gw["Gateway :443<br/>all services in process"]
    pg[("Postgres 16")]
    syncj["Sync job<br/>(scheduler in watch service)"]
  end
  subgraph vf["Vodafone (internet)"]
    web["web.vodafone.com.eg"]
    shop["eshop.vodafone.com.eg"]
  end
  models["Model providers<br/>Jev or Laya, LLM, vision"]

  db -- real pages --> web
  db -- real pages --> shop
  db -- guide.js, /v1/* over HTTPS --> gw
  gw --> pg
  syncj --> pg
  syncj -- polite crawl, approved IP --> web
  syncj -- polite crawl --> shop
  gw --> models
  syncj --> models
```

Fallback on stage: the same laptop runs `npm run dev -- --site vodafone-clone` against local Postgres (no internet needed except for speech recognition, which can be on-device where supported).

## Pilot (mode A)

```mermaid
flowchart LR
  user["Customer browser"] -- page --> web["web.vodafone.com.eg / eshop"]
  web -- Tealium iQ tag, testers only --> user
  user -- guide.js, /v1/* --> lb["Load balancer, HTTPS"]
  lb --> gw1["Gateway ×2"]
  gw1 --> svc["Router ×N · Knowledge · Sessions · Agent proxy · Watch ×1 (scheduler)"]
  svc --> pg[("Postgres primary + replica")]
  sync["Sync job (scheduled)"] --> pg
```
