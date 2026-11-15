# The public gateway (ADR-0053). Build from the repository root, because the SDK build bundles the
# experience layer from ../experiences:
#   docker build -f voice-guide/deploy/gateway/gateway.Dockerfile -t vg-gateway .
# Google Cloud Run (ADR-0066): npm run deploy:cloudrun -- --project <id> (from voice-guide/; runbook §3c).

FROM node:22.18.0-bookworm-slim AS build
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY voice-guide/package.json voice-guide/package-lock.json voice-guide/
RUN cd voice-guide && npm ci --no-audit --no-fund
COPY experiences experiences
COPY voice-guide voice-guide
RUN cd voice-guide && npm run build:sdk && npm prune --omit=dev

FROM node:22.18.0-bookworm-slim
WORKDIR /app/voice-guide
ENV NODE_ENV=production PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 VG_PUBLIC=on VG_STORE=memory VG_SERVICES=local VG_PORT=8080 VG_DATA_DIR=/tmp/vg-data
COPY --from=build /app/voice-guide/package.json ./
COPY --from=build /app/voice-guide/node_modules node_modules
COPY --from=build /app/voice-guide/packages packages
COPY --from=build /app/voice-guide/services services
COPY --from=build /app/voice-guide/jobs jobs
COPY --from=build /app/voice-guide/config config
COPY --from=build /app/voice-guide/types types
RUN mkdir -p /tmp/vg-data && chown node /tmp/vg-data
USER node
EXPOSE 8080
CMD ["node", "services/gateway/main.ts"]
