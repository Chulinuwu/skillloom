#!/bin/sh
set -eu

: "${SKILLLOOM_SERVE_SERVICE:=svc:skillloom}"
: "${SKILLLOOM_SERVE_BACKEND:=http://127.0.0.1:8787}"
: "${SKILLLOOM_APP_CAP:=skillloom.io/cap/skillloom}"

/usr/local/bin/containerboot &
boot_pid="$!"

shutdown() {
  kill "$boot_pid" 2>/dev/null || true
  wait "$boot_pid" 2>/dev/null || true
}

trap shutdown INT TERM

until tailscale status --json >/dev/null 2>&1; do
  if ! kill -0 "$boot_pid" 2>/dev/null; then
    wait "$boot_pid"
  fi
  sleep 1
done

tailscale serve \
  --yes \
  --service="$SKILLLOOM_SERVE_SERVICE" \
  --https=443 \
  --accept-app-caps="$SKILLLOOM_APP_CAP" \
  "$SKILLLOOM_SERVE_BACKEND"

wait "$boot_pid"
