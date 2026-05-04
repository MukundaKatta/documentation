#!/usr/bin/env bash
# Run pngquant on all PNG files in a directory (recursively).
# Usage: bash scripts/optimize.sh <directory>

set -euo pipefail

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <directory>" >&2
    exit 1
fi

if ! command -v pngquant &>/dev/null; then
    echo "pngquant not found. Install with: sudo apt install pngquant" >&2
    exit 1
fi

DIR="$1"
count=0

while IFS= read -r -d '' f; do
    before=$(stat -c%s "$f" 2>/dev/null || stat -f%z "$f")
    pngquant --quality=70-85 --force --ext .png "$f" 2>/dev/null || continue
    after=$(stat -c%s "$f" 2>/dev/null || stat -f%z "$f")
    echo "  $(basename "$f"): ${before} → ${after} bytes"
    ((count++)) || true
done < <(find "$DIR" -name '*.png' -print0)

echo "Optimized $count PNG files in $DIR"
