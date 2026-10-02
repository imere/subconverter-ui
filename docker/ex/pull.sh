#!/usr/bin/env sh
# Pull the latest images (subconverter + webui) without starting them.
set -e
cd "$(dirname "$0")"
docker compose -f compose.yml pull
