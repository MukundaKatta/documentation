#!/usr/bin/env bash
# Sync Cypress screenshot output to documentation image directories.
#
# Reads screenshot-inventory.json to map cypress/snapshots/<name>.png to the
# correct documentation target path. Runs pngquant optimisation on every
# copied file. Prints a coverage report at the end.
#
# Usage: bash scripts/sync.sh [--dry-run]

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SNAPSHOTS_DIR="$REPO_ROOT/cypress/snapshots"
INVENTORY="$REPO_ROOT/screenshot-inventory.json"
DRY_RUN=false

for arg in "$@"; do
    [[ "$arg" == "--dry-run" ]] && DRY_RUN=true
done

if [[ ! -f "$INVENTORY" ]]; then
    echo "Error: $INVENTORY not found. Run 'make screenshot-inventory' first." >&2
    exit 1
fi

if ! command -v python3 &>/dev/null; then
    echo "Error: python3 is required." >&2
    exit 1
fi

HAS_PNGQUANT=true
command -v pngquant &>/dev/null || HAS_PNGQUANT=false

copied=0
skipped=0
orphaned=0
missing_inventory=0

echo "Syncing screenshots to documentation…"

# Build a lookup: cypress_name → image_path from inventory
declare -A name_to_path
while IFS= read -r line; do
    cypress_name=$(echo "$line" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d['cypress_name'])")
    image_path=$(echo "$line" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d['image_path'])")
    name_to_path["$cypress_name"]="$image_path"
done < <(python3 -c "
import json, sys
inventory = json.loads(open('$INVENTORY').read())
for entry in inventory:
    print(json.dumps({'cypress_name': entry['cypress_name'], 'image_path': entry['image_path']}))
")

# Process each screenshot Cypress produced
while IFS= read -r -d '' snapshot; do
    # Derive the cypress_name from the file path relative to SNAPSHOTS_DIR
    rel="${snapshot#$SNAPSHOTS_DIR/}"
    name="${rel%.png}"

    if [[ -v "name_to_path[$name]" ]]; then
        target="$REPO_ROOT/${name_to_path[$name]}"
        target_dir="$(dirname "$target")"

        if [[ "$DRY_RUN" == "true" ]]; then
            echo "  [dry] $name → ${name_to_path[$name]}"
        else
            mkdir -p "$target_dir"
            cp "$snapshot" "$target"
            if [[ "$HAS_PNGQUANT" == "true" ]]; then
                pngquant --quality=70-85 --force --ext .png "$target" 2>/dev/null || true
            fi
            echo "  ✓ $name"
        fi
        ((copied++)) || true
    else
        echo "  ⚠ orphaned screenshot (no inventory entry): $name"
        ((orphaned++)) || true
    fi
done < <(find "$SNAPSHOTS_DIR" -name '*.png' -print0 2>/dev/null)

# Report inventory entries not covered by any screenshot this run
while IFS= read -r name; do
    snapshot="$SNAPSHOTS_DIR/${name}.png"
    if [[ ! -f "$snapshot" ]]; then
        ((missing_inventory++)) || true
    fi
done < <(python3 -c "
import json
inventory = json.loads(open('$INVENTORY').read())
for e in inventory:
    if not e.get('is_wildcard'):
        print(e['cypress_name'])
")

echo ""
echo "Sync complete:"
echo "  ✓ $copied screenshots copied"
[[ $orphaned -gt 0 ]] && echo "  ⚠ $orphaned orphaned Cypress screenshots (spec exists, no RST directive)"
[[ $missing_inventory -gt 0 ]] && echo "  — $missing_inventory inventory entries not captured this run"
[[ "$HAS_PNGQUANT" == "false" ]] && echo "  ℹ pngquant not found — install it for automatic compression"
