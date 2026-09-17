#!/bin/sh
# Fix bind-mount ownership then drop to portal (uid 1001).
# Important: clear root's HOME — wrangler otherwise touches /root/.wrangler.
set -e

export HOME=/home/portal
export USER=portal
export LOGNAME=portal

mkdir -p /app/.wrangler/state /app/.sites-runtime "$HOME"

if [ "$(id -u)" = "0" ]; then
  chown -R portal:portal /app/.wrangler /app/.sites-runtime "$HOME"
  exec setpriv --reuid=portal --regid=portal --init-groups -- "$@"
fi

exec "$@"
