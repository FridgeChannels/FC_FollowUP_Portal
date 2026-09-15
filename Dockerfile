# Vinext / Cloudflare Worker local preview image.
# Secrets are injected at runtime via .dev.vars (see scripts/docker-start.mjs).

FROM node:22-bookworm-slim AS deps
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json .npmrc ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Client-bundled defines (see vite.config.ts). Prefer production defaults.
ARG SKIP_UNAVAILABLE_CHANNELS=true
ARG DEV_CALL_PHONE=
ENV SKIP_UNAVAILABLE_CHANNELS=$SKIP_UNAVAILABLE_CHANNELS \
    DEV_CALL_PHONE=$DEV_CALL_PHONE \
    NODE_ENV=production

RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=8787 \
    HOST=0.0.0.0 \
    SKIP_UNAVAILABLE_CHANNELS=true \
    CLOUDFLARE_CF_FETCH_ENABLED=false \
    WRANGLER_SEND_METRICS=false

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates tini \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 portal \
  && useradd --system --uid 1001 --gid portal --create-home portal \
  && mkdir -p /app/.wrangler/state /app/.sites-runtime \
  && chown -R portal:portal /app

COPY --from=builder --chown=portal:portal /app/package.json /app/package-lock.json /app/.npmrc ./
COPY --from=builder --chown=portal:portal /app/node_modules ./node_modules
COPY --from=builder --chown=portal:portal /app/dist ./dist
COPY --from=builder --chown=portal:portal /app/scripts ./scripts
COPY --from=builder --chown=portal:portal /app/public ./public
COPY --from=builder --chown=portal:portal /app/.openai ./.openai

USER portal

EXPOSE 8787

ENTRYPOINT ["tini", "--"]
CMD ["node", "scripts/docker-start.mjs"]
