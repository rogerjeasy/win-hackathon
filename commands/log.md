---
description: Append a timestamped entry to the challenges log
allowed-tools: Bash
argument-hint: "<text>"
---

Log a challenge.

## Step 1 — Append

Run:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/log.mjs "$PWD" <<'ENTRY'
$ARGUMENTS
ENTRY
```

The text is passed via a quoted heredoc on stdin, not shell-interpolated -- a quoted
delimiter (`'ENTRY'`) suppresses all shell expansion, so backticks or `$(...)` in the
entry text land in `challenges.md` as literal characters instead of being executed.

This appends a timestamped entry to `.hackathon/challenges.md`, newest last. No approval
gate -- it is a running log, not a judgment. `:submit` assembles this file into the
Devpost "Challenges we ran into" field verbatim.
