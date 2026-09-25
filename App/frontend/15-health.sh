#!/bin/sh
set -eu
case "$FRONTEND_PORT" in ''|*[!0-9]*) echo 'Invalid FRONTEND_PORT' >&2; exit 1;; esac
started=$(date +%s)
printf '{"status":"ok","service":"frontend","port":%s,"uptime_seconds":0}\n' "$FRONTEND_PORT" > /tmp/frontend-health.json
(
  while sleep 1; do
    now=$(date +%s)
    printf '{"status":"ok","service":"frontend","port":%s,"uptime_seconds":%s}\n' "$FRONTEND_PORT" "$((now-started))" > /tmp/frontend-health.next
    mv /tmp/frontend-health.next /tmp/frontend-health.json
  done
) &
