#!/usr/bin/env sh
# Upgrade: pull the latest subconverter image, rebuild the webui, and
# recreate both services with the new images.
set -e
cd "$(dirname "$0")"
podman compose -f compose.yml pull subconverter
podman compose -f compose.yml build webui
podman compose -f compose.yml up -d --force-recreate
