# Runtime image for Vinext / Cloudflare Worker local preview.
# Heavy `npm run build` runs on the host or CI — this image only packages
# prebuilt `dist/` plus wrangler to serve it.
# Secrets are injected at runtime via .dev.vars (see scripts/docker-start.mjs).
#
# Usage:
#   SKIP_UNAVAILABLE_CHANNELS=true DEV_CALL_PHONE= npm run build
#   docker compose build && docker compose up -d

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
  && mkdir -p /app/.wrangler/state /app/.sites-runtime

# Pin wrangler to the same version as package.json, without installing the
# full app dependency tree (vite/vinext/etc. are build-only).
COPY package.json ./
RUN WRANGLER_VERSION="$(node -p "require('./package.json').devDependencies.wrangler")" \
  && printf '%s\n' '{"name":"fc-followup-portal-runtime","private":true,"type":"module"}' > package.json \
  && npm install "wrangler@${WRANGLER_VERSION}" --omit=dev --no-audit --no-fund \
  && npm cache clean --force

COPY dist ./dist
COPY scripts ./scripts
COPY public ./public
COPY .openai ./.openai

RUN chown -R portal:portal /app

USER portal

EXPOSE 8787

ENTRYPOINT ["tini", "--"]
CMD ["node", "scripts/docker-start.mjs"]
