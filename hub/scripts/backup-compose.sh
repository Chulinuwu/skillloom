#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: backup-compose.sh <backup-dir>" >&2
  exit 64
fi

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
hub_dir="$(dirname -- "$script_dir")"
backup_dir="$1"

docker compose -f "$hub_dir/compose.yaml" stop skillloom-hub

restart() {
  docker compose -f "$hub_dir/compose.yaml" start skillloom-hub >/dev/null 2>&1 || true
}

trap restart EXIT INT TERM
"$script_dir/backup.sh" "$hub_dir/data" "$backup_dir"
