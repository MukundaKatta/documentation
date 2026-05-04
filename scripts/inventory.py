#!/usr/bin/env python3
"""
Parse all RST files across the three Nextcloud documentation manuals and
produce screenshot-inventory.json — a catalogue of every image directive with
its source RST file, resolved path, and whether a Cypress spec covers it.

Usage:
    python3 scripts/inventory.py [--output PATH]

Output fields per entry:
    rst_file        — RST file that contains the directive (repo-relative)
    directive       — 'image' or 'figure'
    image_path      — resolved path to the image file (repo-relative)
    alt             — :alt: text if present
    width           — :width: value if present
    exists          — whether the image file exists on disk
    automatable     — True if a Cypress spec claims this screenshot name
    cypress_name    — the name passed to docScreenshot() (derived from path)
    cypress_spec    — which spec file would produce it (derived by convention)
"""

import argparse
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

MANUALS = {
    'user': REPO_ROOT / 'user_manual',
    'admin': REPO_ROOT / 'admin_manual',
    'developer': REPO_ROOT / 'developer_manual',
}

CYPRESS_SPECS_DIR = REPO_ROOT / 'cypress' / 'e2e'

# Matches .. image:: path  or  .. figure:: path  (with optional leading whitespace)
DIRECTIVE_RE = re.compile(
    r'^(?P<indent>[ \t]*)\.\.[ \t]+(?P<directive>image|figure)::[ \t]+(?P<path>\S+)',
    re.MULTILINE,
)
# Matches directive options like :alt:, :width:, :scale:, :class:, :figclass:
OPTION_RE = re.compile(
    r'^[ \t]+:(?P<key>alt|width|scale|class|figclass):[ \t]*(?P<value>.+)',
)


def resolve_image_path(rst_file: Path, raw_path: str) -> Path | None:
    """Resolve a raw image path from an RST directive to a repo-relative path."""
    # Strip leading/trailing whitespace
    raw_path = raw_path.strip()

    # Wildcard paths (e.g. ../images/navigation-collapsible.*) — keep as-is
    if '*' in raw_path or '?' in raw_path:
        base = (rst_file.parent / raw_path).resolve()
        # Return the path with the wildcard still in it, repo-relative
        try:
            return base.relative_to(REPO_ROOT)
        except ValueError:
            return Path(raw_path)

    candidate = (rst_file.parent / raw_path).resolve()
    try:
        return candidate.relative_to(REPO_ROOT)
    except ValueError:
        return Path(raw_path)


def cypress_name_from_path(image_path: Path) -> str:
    """
    Derive the docScreenshot() name from the image path.

    user_manual/files/images/sharing.png  →  user/files/sharing
    admin_manual/images/install.png       →  admin/install
    developer_manual/basics/images/x.png →  developer/basics/x
    """
    parts = image_path.parts
    # Find which manual this belongs to
    for prefix, short in (('user_manual', 'user'), ('admin_manual', 'admin'), ('developer_manual', 'developer')):
        if parts[0] == prefix:
            # Drop the manual prefix and any 'images' directory segments
            rest = [p for p in parts[1:] if p != 'images']
            # Drop the extension
            if rest:
                rest[-1] = Path(rest[-1]).stem
            return '/'.join([short] + rest)
    return str(image_path.with_suffix(''))


MANUAL_SHORT = {
    'user_manual': 'user',
    'admin_manual': 'admin',
    'developer_manual': 'developer',
}


def cypress_spec_from_rst(rst_file: Path) -> str:
    """
    Derive the expected spec file path from the RST file that references the image.

    user_manual/activity.rst                    →  cypress/e2e/user/activity.cy.ts
    user_manual/files/access_webgui.rst         →  cypress/e2e/user/files.cy.ts
    admin_manual/configuration_server/x.rst     →  cypress/e2e/admin/configuration_server.cy.ts
    """
    parts = rst_file.relative_to(REPO_ROOT).parts
    manual_short = MANUAL_SHORT.get(parts[0], parts[0])
    if len(parts) == 2:
        section = parts[1].removesuffix('.rst')
    else:
        section = parts[1]
    return f'cypress/e2e/{manual_short}/{section}.cy.ts'


def collect_claimed_names() -> set[str]:
    """Scan existing Cypress spec files for docScreenshot() calls and return the names."""
    claimed = set()
    if not CYPRESS_SPECS_DIR.exists():
        return claimed
    pattern = re.compile(r"docScreenshot\(['\"]([^'\"]+)['\"]")
    for spec in CYPRESS_SPECS_DIR.rglob('*.cy.ts'):
        for match in pattern.finditer(spec.read_text(encoding='utf-8')):
            claimed.add(match.group(1))
    return claimed


def parse_rst(rst_file: Path) -> list[dict]:
    """Extract all image/figure directives from an RST file."""
    text = rst_file.read_text(encoding='utf-8', errors='replace')
    entries = []

    for m in DIRECTIVE_RE.finditer(text):
        directive = m.group('directive')
        raw_path = m.group('path')
        image_path = resolve_image_path(rst_file, raw_path)

        # Collect options from lines immediately following the directive
        options: dict[str, str] = {}
        rest = text[m.end():]
        for line in rest.splitlines():
            if not line.strip():
                continue
            opt = OPTION_RE.match(line)
            if opt:
                options[opt.group('key')] = opt.group('value').strip()
            elif line.strip() and not line.startswith(' ') and not line.startswith('\t'):
                break

        entries.append({
            'rst_file': str(rst_file.relative_to(REPO_ROOT)),
            'directive': directive,
            'image_path': str(image_path) if image_path else raw_path,
            'alt': options.get('alt', ''),
            'width': options.get('width', ''),
            'raw_path': raw_path,
        })

    return entries


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default='screenshot-inventory.json',
                        help='Output JSON file path (default: screenshot-inventory.json)')
    args = parser.parse_args()

    claimed_names = collect_claimed_names()
    inventory = []
    seen_paths: set[str] = set()

    for manual_key, manual_dir in MANUALS.items():
        if not manual_dir.exists():
            print(f'Warning: manual directory not found: {manual_dir}', file=sys.stderr)
            continue
        for rst_file in sorted(manual_dir.rglob('*.rst')):
            for entry in parse_rst(rst_file):
                image_path = Path(entry['image_path'])
                is_wildcard = '*' in entry['image_path'] or '?' in entry['image_path']

                cypress_name = cypress_name_from_path(image_path)
                cypress_spec = cypress_spec_from_rst(rst_file)

                full_path = REPO_ROOT / image_path
                exists = full_path.exists() if not is_wildcard else any(REPO_ROOT.glob(entry['image_path']))

                entry.update({
                    'exists': exists,
                    'is_wildcard': is_wildcard,
                    'cypress_name': cypress_name,
                    'cypress_spec': cypress_spec,
                    'automatable': cypress_name in claimed_names,
                })
                del entry['raw_path']
                inventory.append(entry)
                seen_paths.add(entry['image_path'])

    output_path = REPO_ROOT / args.output
    output_path.write_text(json.dumps(inventory, indent=2), encoding='utf-8')

    # Summary
    total = len(inventory)
    existing = sum(1 for e in inventory if e['exists'])
    missing = total - existing
    automated = sum(1 for e in inventory if e['automatable'])
    wildcards = sum(1 for e in inventory if e['is_wildcard'])

    print(f'Screenshot inventory written to {args.output}')
    print(f'  {total} image directives found')
    print(f'  {existing} image files exist on disk')
    print(f'  {missing} image files missing from disk')
    print(f'  {wildcards} wildcard paths')
    print(f'  {automated} covered by Cypress specs ({automated/total*100:.1f}%)')


if __name__ == '__main__':
    main()
