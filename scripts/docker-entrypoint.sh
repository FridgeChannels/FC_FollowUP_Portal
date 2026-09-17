#!/bin/sh
# Fix bind-mount ownership then drop to portal (uid 1001).
set -e

mkdir -p /app/.wrangler/state /app/.sites-runtime

if [ "$(id -u)" = "0" ]; then
  chown -R portal:portal /app/.wrangler /app/.sites-runtime
  exec setpriv --reuid=portal --regid=portal --init-groups -- "$@"
fi

exec "$@"
