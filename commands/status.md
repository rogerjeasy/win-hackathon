---
description: Show the phase board, time remaining, and any drift — changes nothing
allowed-tools: Bash, Read
---

Run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs "$PWD"`

Show the output to the user. This command is read-only — do not modify state, do not
start a phase, and do not fix drift. If the board shows drift or a missing blocking tool,
point it out and name the command that would address it.
