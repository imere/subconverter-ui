#!/usr/bin/env sh
# Start the full stack in detached mode.
set -e
cd "$(dirname "$0")"

# ../vol is git-ignored, so on a fresh clone the bind-mount targets do not
# exist yet. Create them, otherwise compose would make them as root.
for d in config rules logs; do
  mkdir -p "../vol/subconverter/base/$d"
done

docker compose -f compose.yml up -d
