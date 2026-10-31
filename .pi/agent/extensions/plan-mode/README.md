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

This is a workflow guard, not an operating-system sandbox. Allowed shell
commands and trusted extensions can have side effects. Do not use plan mode
as a security boundary for untrusted code.

Plan instructions use the structured `plan_mode` system-prompt section, which
is removed when planning is disabled.

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
The agent must verify successful work before recording completion. Explanations
are stored with progress, but the tool does not independently verify them.

Edits, test commands, prose, and `[DONE:n]` markers no longer check off tasks.
Execution instructions and current progress are supplied on each model request.
If tasks remain at a successful end of a run, the extension requests at most one
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
