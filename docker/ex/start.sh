#!/usr/bin/env sh
# Start the full stack in detached mode.
set -e
cd "$(dirname "$0")"
podman compose -f compose.yml up -d
