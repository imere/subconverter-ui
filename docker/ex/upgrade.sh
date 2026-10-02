#!/usr/bin/env sh
# Upgrade: pull the latest subconverter image, rebuild the webui, and
# recreate both services with the new images.
set -e
cd "$(dirname "$0")"
docker compose -f compose.yml pull subconverter
docker compose -f compose.yml build webui
docker compose -f compose.yml up -d --force-recreate
