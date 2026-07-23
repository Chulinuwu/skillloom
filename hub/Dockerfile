FROM node:24.15.0-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY mode-profile.mjs mode-profile.d.mts ./
COPY src ./src
COPY skills ./skills
COPY hooks ./hooks
RUN npm run build && npm prune --omit=dev

FROM node:24.15.0-bookworm-slim AS runtime

ENV NODE_ENV=production \
    SKILLLOOM_HUB_BIND_HOST=127.0.0.1 \
    SKILLLOOM_HUB_PORT=8787 \
    SKILLLOOM_HUB_DATA_DIR=/data

WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/skills ./skills
COPY --from=build --chown=node:node /app/hooks ./hooks
VOLUME ["/data"]
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:8787/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/hub/runtime/main.js"]
