#!/usr/bin/env sh
set -eu
: "${CRON_SECRET:?CRON_SECRET must be configured}"
timeout="${CRON_REQUEST_TIMEOUT_SECONDS:-60}"
endpoint="$1"
exec /usr/bin/curl --fail-with-body --show-error --silent --max-time "$timeout" --retry 2 --retry-all-errors --retry-delay 5 -H "Authorization: Bearer $CRON_SECRET" "http://127.0.0.1:3000/api/v1/cron/$endpoint"