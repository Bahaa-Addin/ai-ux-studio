# ADR-0022: Site keys, origin checks, signed agent tokens and per-client rate limits at the gateway

- Status: Accepted (demo slice)
- Date: 2026-10-23
- Area: Security
- Code: `services/gateway/server.ts`, `services/gateway/limits.ts`, `services/shared/ids.ts`

## Context

The gateway is public and called from customers' browsers. It must accept only our sites, keep one site's data from another, protect the model budget, and keep the admin surface private.

## Decision

1. **Site key** (`data-site-key` on the script tag, `x-vg-site-key` on calls) identifies the site. It is public, like a publishable key: it is not a secret and grants nothing alone.
2. **Origin check:** every browser call's `Origin` must be one of the site's configured origins; CORS reflects only those. Calls without an `Origin` (server-to-server, tests) are allowed but still need a site key and a valid session.
3. **Sessions are scoped to a site**; a session id from another site is "not found".
4. **Agent token:** HMAC-SHA256 over site and session, 30 minutes, verified in constant time (`VG_SECRET`).
5. **Rate limits:** token buckets per site and client IP for turns (30 per minute, burst 10), and per session for agent steps (4 times that). Per process (ADR-0010).
6. **Admin endpoints** (knowledge versions, activation, traces, watch tick) need `VG_ADMIN_TOKEN`; without one they answer only from loopback.
7. **Watches** can only target the site's own origins, so the checker cannot be pointed at internal addresses (the SSRF concern in ADR-0001 is closed by scope, not by filtering).

## Consequences

- A copied script tag on a foreign site does not work (origin check).
- Rate limits behind a proxy need `x-forwarded-for` from a trusted proxy; the gateway trusts the first value as given, so put it behind a proxy that overwrites the header.
- `VG_SECRET` rotation invalidates live agent tokens (sessions continue; the SDK gets a fresh token on the next page load).

## Pilot knobs

| Knob | Default | Effect |
|---|---|---|
| `VG_SECRET` | dev value | Must be set per environment. |
| `VG_ADMIN_TOKEN` | unset | Required outside a laptop. |
| `VG_RATE_TURNS_PER_MIN`, `VG_RATE_BURST` | 30, 10 | Per site and IP. |
| `origins`, `siteKey` (site config) | fixture values | Add the live origins for the pilot. |

## Revisit when

- Exact limits across replicas are needed: Redis (ADR-0010).
- Abuse appears from a single IP range: add a bot challenge before `/v1/turn`.

## Verified by

- `tests/integration/gateway.test.ts`: unknown site key 401, foreign origin 403, forged session 404, CORS preflight, rate limit 429, forged agent token 401, watch URL outside the site 400.
