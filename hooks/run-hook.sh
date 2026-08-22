#!/usr/bin/env bash
# Thin wrapper so hooks.json does not hard-code a node path.
set -euo pipefail
exec node "${CLAUDE_PLUGIN_ROOT}/hooks/$1.mjs"
