#!/usr/bin/env sh
# Rebuild only the webui image and restart it (rolling update of the front-end).
set -e
cd "$(dirname "$0")"
podman compose -f compose.yml build webui
podman compose -f compose.yml up -d --no-deps --force-recreate webui
