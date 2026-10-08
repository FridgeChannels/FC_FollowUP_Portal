# Runtime image for Vinext Node production server.
# Heavy `npm run build` runs on the host or CI — this image only packages
# prebuilt `dist/` plus vinext to serve it.
# Secrets are injected at runtime via compose env_file → process.env
# (see scripts/docker-start.mjs + cloudflare-workers shim).
#
# Usage:
#   npm run build   # reads SKIP_UNAVAILABLE_CHANNELS / DEV_CALL_PHONE from .env
#   docker compose build && docker compose up -d

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

# Pin vinext to the same version as package.json. The built Worker bundle is
# self-contained aside from `cloudflare:workers` (shimmed at start).
COPY package.json ./
RUN VINEXT_VERSION="$(node -p "require('./package.json').devDependencies.vinext")" \
  && printf '%s\n' '{"name":"fc-followup-portal-runtime","private":true,"type":"module"}' > package.json \
  && npm install "vinext@${VINEXT_VERSION}" --omit=dev --no-audit --no-fund \
  && npm cache clean --force

COPY dist ./dist
COPY scripts ./scripts
COPY public ./public
COPY .openai ./.openai

RUN chmod +x /app/scripts/docker-entrypoint.sh \
  && chown -R portal:portal /app

# Start as root so the entrypoint can chown bind mounts, then drop to portal.
EXPOSE 8787

ENTRYPOINT ["tini", "--", "/app/scripts/docker-entrypoint.sh"]
CMD ["node", "scripts/docker-start.mjs"]
