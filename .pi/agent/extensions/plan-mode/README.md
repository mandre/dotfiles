# Plan mode

Plan mode starts enabled in interactive sessions. Use `/plan` or Alt+P to
toggle read-only planning, then `/execute` to run the extracted numbered plan.
Use `/todos` to inspect progress or `/done <step>` to confirm a step manually.
Non-interactive sessions do not enter plan mode.

## Tool enforcement

Planning checks every `tool_call` against its allowlist, including nested calls
from codemode and tools with `codemode` or `deferred` exposure. Deactivating a
tool alone does not prevent those exposures from being called. Bash calls must
also pass the command allowlist. Headless runs remain unrestricted.

The shell gate parses quotes and checks every invocation in pipelines, lists,
and `&&`/`||` chains. It rejects substitutions, unbalanced quotes, background
jobs and redirections, including writes to `/tmp`. Help/version requests are
allowed only as the sole argument to an invocation, not as an exemption for
an entire shell string. Bare `cd` prefixes are checked rather than stripped.

Python, Node, `awk`, `xargs`, `env`, shell loops, test/lint runners and arbitrary
`sed` programs are blocked. `sed -n '1,20p' file` remains available. Known
output-file and execution options on inspection commands are blocked.
`gh pr review`, artifact downloads, GWS downloads/exports and Go vet are not
read-only planning operations. Curl accepts a small set of display/GET/HEAD
flags only. Use structured inspection tools when this conservative shell
subset is insufficient.

This is a workflow guard, not an operating-system sandbox. Allowed shell
commands and trusted extensions can have side effects. Do not use plan mode
as a security boundary for untrusted code.

Plan instructions use the structured `plan_mode` system-prompt section, which
is removed when planning is disabled.

## Settlement and context

Plan extraction runs at a successful `agent_before_settle` boundary, not at
`agent_end`. It requires a complete assistant reply and skips continuations
already requested by earlier handlers or pending messages. Extraction returns
an appended state snapshot, preserving entries proposed by other extensions.
The ready or parse-warning notification waits for `agent_settled`; a later
continuation, cancellation, or failed boundary clears the pending notice.
A later extension can still continue after an extraction snapshot was proposed;
that next run can replace the snapshot before announcing the final plan.
`/execute` also ignores incomplete assistant replies when refreshing the plan.

Execution instructions use the structured `plan_execution` prompt section.
Each prompt, including custom-message prompts and resumed execution, appends
one current progress snapshot. Subsequent `plan_progress` results carry updated
checklists without rewriting the earlier snapshot. The widget remains live,
and `plan_progress` with action `list` retrieves the current state.

Normal execution requests no longer inject synthetic user messages through
`context`. Tests with Pi's real runner verify that separate prompt and tool
transitions survive unchanged. Legacy-message cleanup and one-shot mode-change
notices still transform context and can rebuild its prompt/tool checkpoint.
These tests verify transcript preservation, not provider cache-hit rates or
cost savings; those require live measurement.

## Explicit progress

During execution, the agent uses `plan_progress` directly or through codemode:

```javascript
text(await tools.plan_progress({ action: "list" }));
text(await tools.plan_progress({
  action: "complete",
  updates: [
    { step: 1, evidence: "Updated the reviewer instructions and checked the diff." },
    { step: 2, evidence: "The same edit adds the required origin classifications." },
  ],
}));
```

Each completion needs a valid step number and a nonblank explanation. A batch
is validated before any step changes, and repeated completions are no-ops.
The result declares an output schema and returns structured `todos` to codemode
callers, while preserving readable text and result details for the transcript.
The agent must verify successful work before recording completion. Explanations
are stored with progress, but the tool does not independently verify them.

Edits, test commands, prose, and `[DONE:n]` markers no longer check off tasks.
Execution instructions, the per-prompt snapshot, and subsequent tool results
remain in model context across tool-loop turns. Reconciliation appends to other
extensions' proposed boundary entries. If tasks remain at a successful end of
a run, the extension requests at most one
reconciliation pass per prompt. It asks the agent to record verified work and
leave unfinished work unchecked, not to perform extra work to clear the list.
Aborted and failed runs do not trigger this pass.

Progress restores from the latest snapshot on the active session branch. Legacy
snapshots remain readable, but old completion markers are not replayed. Reload
the extension with `/reload` after changing its code.

## Tests

Run from the repository root:

```sh
node .pi/agent/extensions/plan-mode/run-tests.mjs
```

The runner uses the managed Pi installation's jiti and package dependencies.
For another layout, set `PI_TEST_PACKAGE_ROOT` to the directory containing the
installed `@earendil-works/pi-coding-agent/package.json`.

Tests exercise pure utilities and extension handlers with a mocked Pi API.
They do not run a live model or interactive terminal session. For the shared
extension tests and regular/fullscreen terminal smoke tests, see
[`../tests/README.md`](../tests/README.md).
