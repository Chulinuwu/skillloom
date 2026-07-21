#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
  echo "usage: restore.sh <backup.tar.gz> <target-data-dir>" >&2
  exit 64
fi

archive="$1"
target_dir="$2"
manifest="$archive.sha256"

if [ ! -f "$archive" ]; then
  echo "backup archive does not exist: $archive" >&2
  exit 66
fi

if [ ! -f "$manifest" ]; then
  echo "checksum manifest does not exist: $manifest" >&2
  exit 66
fi

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum -c "$manifest"
else
  expected="$(awk '{print $1}' "$manifest")"
  actual="$(shasum -a 256 "$archive" | awk '{print $1}')"
  if [ "$expected" != "$actual" ]; then
    echo "$archive: FAILED" >&2
    exit 1
  fi
fi
mkdir -p "$target_dir"

if [ -n "$(find "$target_dir" -mindepth 1 -maxdepth 1 2>/dev/null)" ]; then
  echo "target data directory must be empty: $target_dir" >&2
  exit 73
fi

tar -C "$target_dir" -xzf "$archive"
