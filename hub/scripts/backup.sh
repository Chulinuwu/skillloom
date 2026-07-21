#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
  echo "usage: backup.sh <data-dir> <backup-dir>" >&2
  exit 64
fi

data_dir="$1"
backup_dir="$2"

if [ ! -d "$data_dir" ]; then
  echo "data directory does not exist: $data_dir" >&2
  exit 66
fi

mkdir -p "$backup_dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="$backup_dir/skillloom-hub-data-$stamp.tar.gz"
manifest="$archive.sha256"

tar -C "$data_dir" -czf "$archive" .
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$archive" > "$manifest"
else
  shasum -a 256 "$archive" > "$manifest"
fi
echo "$archive"
