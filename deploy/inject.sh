#!/usr/bin/env bash
# One-shot data injection on a VPS. Edit the variables, drop your files in ./import, run: bash deploy/inject.sh
# Works with docker compose (default) or a bare install (set CLI="node server/cli.js").
set -euo pipefail
CLI=${CLI:-"docker compose exec -T app node --no-warnings cli.js"}
IMPORT=${IMPORT:-/import}                 # path as seen by the CLI (container: /import, bare: ./import)

OWNER_EMAIL="you@university.edu"
OWNER_NAME="Your Name"
CAMPAIGN="LLM4ED"
CODEBOOK="$IMPORT/Codebook.xlsx"
BIB="$IMPORT/papers.bib"
PDF_DIR="$IMPORT/pdfs"                    # <bibkey>.pdf files
ANNOTATORS="a@university.edu,b@university.edu"   # must exist: create with `user add`
PER_PAPER=2

$CLI user add "$OWNER_EMAIL" "$OWNER_NAME" || true
$CLI campaign create "$CAMPAIGN" --owner "$OWNER_EMAIL" || true
$CLI fields import "$CAMPAIGN" "$CODEBOOK"
$CLI papers import-bib "$CAMPAIGN" "$BIB" --pdf-dir "$PDF_DIR"
$CLI papers attach-pdfs "$CAMPAIGN" "$PDF_DIR" || true
$CLI assign "$CAMPAIGN" --to "$ANNOTATORS" --each "$PER_PAPER" --unassigned-only
$CLI status "$CAMPAIGN"
