# syntax=docker/dockerfile:1
#
# Multi-stage: vinext build runs inside Node 22, so the host can stay on Node 20.
# Runtime still serves prebuilt dist/ with wrangler; secrets come from .dev.vars
# at container start (scripts/docker-start.mjs).
#
# Usage (from the project root, with .env present):
#   docker compose up -d --build

FROM node:22-bookworm AS builder
WORKDIR /app

ENV NODE_ENV=development \
    HOME=/tmp \
    CLOUDFLARE_CF_FETCH_ENABLED=false \
    WRANGLER_SEND_METRICS=false

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ git ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY . .
# .env is a BuildKit secret so it is available to vite/wrangler during build
# without landing in the runtime image.
RUN --mount=type=secret,id=portal_env,target=/app/.env,required=true \
    node -v \
    && npm run build \
    && test -f dist/server/wrangler.json

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=8787 \
    HOST=0.0.0.0 \
    HOME=/home/portal \
    CLOUDFLARE_CF_FETCH_ENABLED=false \
    WRANGLER_SEND_METRICS=false

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates tini \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 portal \
  && useradd --system --uid 1001 --gid portal --create-home portal \
  && mkdir -p /app/.wrangler/state /app/.sites-runtime

COPY package.json ./
RUN WRANGLER_VERSION="$(node -p "require('./package.json').devDependencies.wrangler")" \
  && printf '%s\n' '{"name":"fc-followup-portal-runtime","private":true,"type":"module"}' > package.json \
  && npm install "wrangler@${WRANGLER_VERSION}" --omit=dev --no-audit --no-fund \
  && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/public ./public
COPY --from=builder /app/.openai ./.openai

RUN chmod +x /app/scripts/docker-entrypoint.sh \
  && chown -R portal:portal /app

EXPOSE 8787

ENTRYPOINT ["tini", "--", "/app/scripts/docker-entrypoint.sh"]
CMD ["node", "scripts/docker-start.mjs"]
