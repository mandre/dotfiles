# Personal Pi extensions

Run `/reload` after code changes. Compatibility tests are documented in
[tests/README.md](tests/README.md).

## Review commands and tool

- `/review [staged|unstaged|all|<range>|<path>|<PR URL>]` starts a deep review.
- `/review-diff` runs a single model request; the default is staged changes,
  falling back to unstaged changes when the staged diff is empty.
- `/cancel-review` cancels either command, including diff preparation.
- Only one command-driven review runs at a time. Session shutdown, replacement
  and reload abort the active review and await cleanup.

Deep review declarations are intersected with approved inspection tools. A
`tool_call` gate also checks every direct and nested call, regardless of tool
exposure. Provider extensions remain discoverable and MCP is disabled in the
child. This is a workflow guard, not an operating-system sandbox: extensions
and Git configuration remain trusted code.

Deep PR reviews require a checkout whose GitHub repository identity matches
the requested URL. The PR head is refreshed from that repository into a
repository-qualified local ref on every invocation. Use `/review-diff` or
`code_review` for remote diff-only reviews without a matching checkout.

Quick review input uses a 120,000-byte diff budget, preserving whole file diffs.
Oversized files are omitted, not silently included over budget. The prompt
identifies omissions; `code_review` also returns them as `skippedPaths`.
Generated Git tools and review text truncate large outputs and preserve the
complete text in a temporary file identified in the result. These output files
remain available for follow-up reads and are not deleted at review completion.
Temporary child prompts and guard files are deleted after the subprocess exits.

`code_review` returns model usage with its result, including failed model
responses. Command reviews persist `review-usage` entries for the custom footer.
Deep reviews aggregate assistant, tool-result and compaction usage.

`code_review` and `plan_progress` declare output schemas. Codemode callers receive
structured results rather than parsing prose. Review data includes `review`,
`label`, `empty`, `stats` and `skippedPaths`; plan progress returns `todos`.

## Questionnaire

The questionnaire is sequential and model-only. It requires TUI mode; RPC,
JSON and print invocations fail with a tool error instead of reporting user
cancellation. Invalid or duplicate question IDs, duplicate option values and
questions with no available answers also fail before opening the dialog.

The dialog follows the active option or text cursor within the terminal height.
Use Page Up/Page Down to inspect long prompts, descriptions and answer summaries.
Selection or editing resumes automatic viewport tracking. The tool abort signal
closes the dialog and releases its listener.

## Planning and footer

See [plan-mode/README.md](plan-mode/README.md) for the conservative shell policy
and explicit progress tracking.

The footer totals usage on the active branch, including persisted command-review
usage. It uses Pi's effective context limit and percentage. At narrow widths,
model identity and extension statuses take priority over paths and token totals.
