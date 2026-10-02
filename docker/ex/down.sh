#!/usr/bin/env sh
# Stop and remove the stack (keeps the persisted volumes under docker/vol).
set -e
cd "$(dirname "$0")"
docker compose -f compose.yml down
